import { maskEmail, maskEmailsInText, normalizeEmail } from '@smc/core';
import { Prisma, recordAudit, type DeliveryStatus, type EmailSuppressionReason } from '@smc/db';
import { suppressMember } from '@smc/digest';
import { verifyMailgunSignature } from '@smc/email';
import express, { Router } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';

interface EventData {
  id?: string;
  event?: string;
  severity?: string;
  reason?: string;
  recipient?: string;
  timestamp?: number;
  tags?: string[];
  'user-variables'?: Record<string, unknown>;
  'delivery-status'?: { code?: number | string; message?: string; description?: string };
}

/** Delivery states each event may move a delivery out of — never backwards. */
const TRANSITIONS: Record<string, { to: DeliveryStatus; from: DeliveryStatus[] }> = {
  delivered: { to: 'DELIVERED', from: ['QUEUED', 'SUBMITTED', 'TEMP_FAILED'] },
  temporary_fail: { to: 'TEMP_FAILED', from: ['QUEUED', 'SUBMITTED'] },
  permanent_fail: { to: 'FAILED', from: ['QUEUED', 'SUBMITTED', 'TEMP_FAILED', 'DELIVERED'] },
  complained: {
    to: 'COMPLAINED',
    from: ['QUEUED', 'SUBMITTED', 'TEMP_FAILED', 'DELIVERED', 'FAILED'],
  },
  unsubscribed: { to: 'UNSUBSCRIBED', from: ['QUEUED', 'SUBMITTED', 'TEMP_FAILED', 'DELIVERED'] },
};

const SUPPRESS: Record<string, EmailSuppressionReason> = {
  permanent_fail: 'HARD_BOUNCE',
  complained: 'COMPLAINED',
  unsubscribed: 'UNSUBSCRIBED',
};

function kindOf(e: EventData): string | null {
  if (e.event === 'failed') return e.severity === 'permanent' ? 'permanent_fail' : 'temporary_fail';
  if (e.event === 'delivered' || e.event === 'complained' || e.event === 'unsubscribed')
    return e.event;
  return null; // accepted, opened, clicked… are not tracked
}

/**
 * Mailgun event webhooks. Signed with the webhook signing key (HMAC-SHA256 of timestamp+token),
 * rejected when stale, and recorded once per signature token and once per event id, so replays
 * and Mailgun's own re-deliveries never apply twice.
 */
export function mailgunWebhookRouter(ctx: AppContext): Router {
  const router = Router();
  router.post('/', express.json({ limit: '1mb' }), async (req, res) => {
    const key = ctx.config.mailgunWebhookSigningKey;
    if (!key) throw new HttpError(503, 'webhooks_not_configured');
    const now = ctx.now();
    const signature = req.body?.signature;
    const check = verifyMailgunSignature(key, signature, now);
    if (!check.ok) {
      ctx.logger.warn({ runId: req.runId, reason: check.reason }, 'rejected mailgun webhook');
      await recordAudit(ctx.prisma, {
        runId: req.runId,
        actorType: 'WEBHOOK',
        action: 'mailgun.webhook.rejected',
        result: 'DENIED',
        metadata: { reason: check.reason },
      });
      throw new HttpError(check.reason === 'malformed' ? 400 : 401, 'invalid_signature');
    }

    const e: EventData = req.body['event-data'] ?? {};
    if (typeof e.id !== 'string' || typeof e.event !== 'string')
      throw new HttpError(400, 'invalid_event');
    const deliveryId =
      typeof e['user-variables']?.delivery_id === 'string'
        ? (e['user-variables'].delivery_id as string)
        : null;
    const status = e['delivery-status'];
    const errorText = status?.message || status?.description || e.reason || '';

    // One row per accepted webhook: a reused token is a replay, a reused event id a re-delivery.
    try {
      await ctx.prisma.mailgunWebhookEvent.create({
        data: {
          signatureToken: signature.token,
          eventId: e.id,
          eventType: e.event,
          deliveryId,
          receivedAt: now,
          payload: {
            event: e.event,
            severity: e.severity ?? null,
            reason: e.reason ?? null,
            code: status?.code != null ? String(status.code) : null,
            message: maskEmailsInText(errorText).slice(0, 500),
            recipient: e.recipient ? maskEmail(e.recipient) : null,
            tags: e.tags ?? [],
            timestamp: e.timestamp ?? null,
          },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Same event id: Mailgun re-delivered an event we already applied (fresh token or not).
        const seen = await ctx.prisma.mailgunWebhookEvent.count({ where: { eventId: e.id } });
        if (seen) {
          res.json({ status: 'duplicate' });
          return;
        }
        // Same token on a different event: a captured request being replayed.
        await recordAudit(ctx.prisma, {
          runId: req.runId,
          actorType: 'WEBHOOK',
          action: 'mailgun.webhook.rejected',
          result: 'DENIED',
          metadata: { reason: 'replayed_token' },
        });
        throw new HttpError(403, 'replayed_token');
      }
      throw err;
    }

    const kind = kindOf(e);
    let deliveryUpdated = false;
    let memberId: string | null = null;

    if (kind) {
      const t = TRANSITIONS[kind]!;
      const delivery = deliveryId
        ? await ctx.prisma.digestDelivery.findUnique({
            where: { id: deliveryId },
            include: { member: { select: { id: true, email: true } } },
          })
        : null;
      // Only trust the delivery id when it matches the recipient Mailgun reports.
      const matches =
        delivery &&
        (!e.recipient || normalizeEmail(e.recipient) === normalizeEmail(delivery.member.email));
      if (delivery && matches) {
        memberId = delivery.memberId;
        const updated = await ctx.prisma.digestDelivery.updateMany({
          where: { id: delivery.id, status: { in: t.from } },
          data: {
            status: t.to,
            lastEventAt: now,
            ...(t.to === 'DELIVERED' && { deliveredAt: now }),
            ...((t.to === 'FAILED' || t.to === 'TEMP_FAILED') && {
              lastErrorCode: status?.code != null ? String(status.code).slice(0, 20) : null,
              lastErrorMessage: maskEmailsInText(errorText).slice(0, 1000) || null,
            }),
            ...(t.to === 'FAILED' && { failedAt: now }),
          },
        });
        deliveryUpdated = updated.count === 1;
      } else if (e.recipient && SUPPRESS[kind]) {
        // Not a digest delivery (e.g. a sign-in email): still honour bounces and complaints.
        const member = await ctx.prisma.member.findUnique({
          where: { email: normalizeEmail(e.recipient) },
          select: { id: true },
        });
        memberId = member?.id ?? null;
      }

      const reason = SUPPRESS[kind];
      if (reason && memberId) {
        await suppressMember(ctx.prisma, {
          memberId,
          reason,
          source: 'mailgun_webhook',
          runId: req.runId,
          now,
          metadata: { eventId: e.id, deliveryId },
        });
      }
    }

    await ctx.prisma.mailgunWebhookEvent.update({
      where: { eventId: e.id },
      data: { processedAt: now },
    });
    await recordAudit(ctx.prisma, {
      runId: req.runId,
      actorType: 'WEBHOOK',
      action: `mailgun.${kind ?? e.event}`,
      entityType: deliveryId ? 'digest_delivery' : undefined,
      entityId: deliveryId ?? undefined,
      result: kind ? 'SUCCESS' : 'SKIPPED',
      metadata: { eventId: e.id, deliveryUpdated, memberId, code: status?.code ?? null },
    });
    res.json({ status: 'ok' });
  });
  return router;
}
