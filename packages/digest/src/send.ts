import { maskEmailsInText } from '@smc/core';
import { signToken } from '@smc/core';
import { recordAudit, type Member, type PrismaClient } from '@smc/db';
import {
  escapeHtml,
  isAllowed,
  MAILGUN_BATCH_LIMIT,
  type BatchMessage,
  type RecipientGuard,
  type SendOutcome,
} from '@smc/email';
import { recipientPage } from './recipients';

/** Retry delays after the 1st, 2nd, 3rd, 4th failed attempt; the 5th failure is final. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 25 * 60_000, 60 * 60_000];
export const MAX_BATCH_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** Mailgun's events API can lag; don't reconcile an unknown batch before this. */
export const RECONCILE_AFTER_MS = 10 * 60_000;
/** A batch stuck in SENDING this long (worker died mid-request) is treated as unknown. */
export const STALE_SENDING_MS = 15 * 60_000;
export const UNSUBSCRIBE_TOKEN_TTL_MS = 60 * 24 * 60 * 60_000;

export function retryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length) - 1] ?? RETRY_DELAYS_MS[0]!;
}

/** The parts of the Mailgun client the send path needs (a fake in tests). */
export interface DigestTransport {
  sendBatch(msg: BatchMessage): Promise<SendOutcome>;
  acceptedDeliveryIds(digestId: string, begin: Date): Promise<Set<string>>;
}

export interface SendDeps {
  db: PrismaClient;
  transport: DigestTransport;
  guard: RecipientGuard;
  from: string;
  replyTo: string;
  appBaseUrl: string;
  apiBaseUrl: string;
  linkSigningSecret: string;
  now: () => Date;
  runId: string;
}

type Recipient = Pick<
  Member,
  | 'id'
  | 'email'
  | 'firstName'
  | 'status'
  | 'newsOptIn'
  | 'emailVerifiedAt'
  | 'emailSuppressedReason'
>;

function stillEligible(m: Recipient): boolean {
  return (
    m.status === 'ACTIVE' &&
    m.newsOptIn &&
    m.emailVerifiedAt !== null &&
    m.emailSuppressedReason === null
  );
}

export function unsubscribeLinks(
  deps: Pick<SendDeps, 'appBaseUrl' | 'apiBaseUrl' | 'linkSigningSecret'>,
  memberId: string,
  now: Date,
) {
  const token = signToken(
    deps.linkSigningSecret,
    'unsubscribe',
    memberId,
    new Date(now.getTime() + UNSUBSCRIBE_TOKEN_TTL_MS),
  );
  return {
    /** Footer link: a confirmation page on the website. */
    page: `${deps.appBaseUrl}/email/unsubscribe#t=${token}`,
    /** List-Unsubscribe target for RFC 8058 one-click POSTs from mail clients. */
    oneClick: `${deps.apiBaseUrl}/email/unsubscribe/one-click?t=${encodeURIComponent(token)}`,
  };
}

// ─── Preparing batches ─────────────────────────────────────────────

/**
 * Snapshot the recipients into delivery rows and group them into ≤1000-recipient batches.
 * Safe to re-run: existing deliveries are skipped (unique keys) and only unbatched rows
 * get a batch, so a retried job never duplicates anyone.
 */
export async function prepareBatches(
  db: PrismaClient,
  digest: { id: string; weekKey: string },
  batchSize = MAILGUN_BATCH_LIMIT,
): Promise<{ deliveries: number; batches: number }> {
  let after: string | null = null;
  for (;;) {
    const page = await recipientPage(db, after, 1000);
    if (page.length === 0) break;
    await db.digestDelivery.createMany({
      data: page.map((m) => ({
        digestId: digest.id,
        memberId: m.id,
        weekKey: digest.weekKey,
        idempotencyKey: `digest:${digest.weekKey}:${m.id}`,
      })),
      skipDuplicates: true,
    });
    after = page.at(-1)!.id;
  }

  for (;;) {
    const created = await db.$transaction(async (tx) => {
      const rows = await tx.digestDelivery.findMany({
        where: { digestId: digest.id, batchId: null, status: 'QUEUED' },
        orderBy: { id: 'asc' },
        take: batchSize,
        select: { id: true },
      });
      if (rows.length === 0) return false;
      const last = await tx.digestBatch.findFirst({
        where: { digestId: digest.id },
        orderBy: { batchNo: 'desc' },
        select: { batchNo: true },
      });
      const batch = await tx.digestBatch.create({
        data: {
          digestId: digest.id,
          batchNo: (last?.batchNo ?? 0) + 1,
          recipientCount: rows.length,
        },
      });
      await tx.digestDelivery.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, batchId: null },
        data: { batchId: batch.id },
      });
      return true;
    });
    if (!created) break;
  }

  const [deliveries, batches] = await Promise.all([
    db.digestDelivery.count({ where: { digestId: digest.id } }),
    db.digestBatch.count({ where: { digestId: digest.id } }),
  ]);
  return { deliveries, batches };
}

// ─── Sending one batch ─────────────────────────────────────────────

export type BatchResult =
  | { kind: 'not_claimed' }
  | { kind: 'skipped'; skipped: number }
  | { kind: 'sent'; sent: number; skipped: number; messageId: string }
  | { kind: 'retry_scheduled'; attempt: number; nextAttemptAt: Date; error: string }
  | { kind: 'failed'; error: string }
  | { kind: 'unknown'; error: string };

/**
 * Send one batch exactly once. The claim (PENDING/RETRY_SCHEDULED → SENDING, only while the
 * digest is SENDING) means two workers can never send the same batch. Members are re-checked
 * at send time, so anyone who opted out after approval is skipped.
 */
export async function sendBatch(deps: SendDeps, batchId: string): Promise<BatchResult> {
  const { db } = deps;
  const now = deps.now();
  const claimed = await db.digestBatch.updateMany({
    where: {
      id: batchId,
      status: { in: ['PENDING', 'RETRY_SCHEDULED'] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      digest: { status: 'SENDING' },
    },
    // While SENDING, nextAttemptAt is the lease expiry (see markStaleSendingUnknown).
    data: {
      status: 'SENDING',
      attempts: { increment: 1 },
      nextAttemptAt: new Date(now.getTime() + STALE_SENDING_MS),
    },
  });
  if (claimed.count !== 1) return { kind: 'not_claimed' };

  const batch = await db.digestBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      digest: true,
      deliveries: {
        where: { status: 'QUEUED' },
        include: { member: true },
        orderBy: { id: 'asc' },
      },
    },
  });
  const { digest } = batch;
  const audit = (
    action: string,
    result: 'SUCCESS' | 'FAILURE' | 'SKIPPED',
    metadata: Record<string, unknown>,
  ) =>
    recordAudit(db, {
      runId: deps.runId,
      actorType: 'SYSTEM',
      action,
      entityType: 'digest_batch',
      entityId: batch.id,
      result,
      metadata: {
        digestId: digest.id,
        batchNo: batch.batchNo,
        attempt: batch.attempts,
        ...metadata,
      },
    });

  // Re-check eligibility and the environment allowlist at the moment of sending.
  const toSkip: { id: string; reason: string }[] = [];
  const toSend: typeof batch.deliveries = [];
  for (const d of batch.deliveries) {
    if (!stillEligible(d.member)) toSkip.push({ id: d.id, reason: 'no_longer_eligible' });
    else if (!isAllowed(deps.guard, d.member.email))
      toSkip.push({ id: d.id, reason: 'not_allowlisted' });
    else toSend.push(d);
  }
  for (const reason of ['no_longer_eligible', 'not_allowlisted']) {
    const ids = toSkip.filter((s) => s.reason === reason).map((s) => s.id);
    if (ids.length) {
      await db.digestDelivery.updateMany({
        where: { id: { in: ids } },
        data: { status: 'SKIPPED', lastErrorMessage: reason, lastEventAt: now },
      });
    }
  }

  if (toSend.length === 0) {
    await db.digestBatch.update({
      where: { id: batch.id },
      data: { status: 'SKIPPED', nextAttemptAt: null },
    });
    await audit('digest.batch.skipped', 'SKIPPED', { skipped: toSkip.length });
    return { kind: 'skipped', skipped: toSkip.length };
  }
  if (!digest.html || !digest.text || !digest.subject) {
    throw new Error(`digest ${digest.id} has no rendered content`);
  }

  const message: BatchMessage = {
    from: deps.from,
    replyTo: deps.replyTo,
    subject: digest.subject,
    html: digest.html,
    text: digest.text,
    tag: 'weekly-digest',
    recipients: toSend.map((d) => {
      const links = unsubscribeLinks(deps, d.memberId, now);
      return {
        email: d.member.email,
        variables: {
          delivery_id: d.id,
          first_name: d.member.firstName,
          first_name_html: escapeHtml(d.member.firstName),
          unsub_url: links.page,
          unsub_one_click_url: links.oneClick,
        },
      };
    }),
    customVariables: { digest_id: digest.id, delivery_id: '%recipient.delivery_id%' },
    headers: {
      'List-Unsubscribe': '<%recipient.unsub_one_click_url%>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };

  const outcome = await deps.transport.sendBatch(message);
  const sendIds = toSend.map((d) => d.id);
  const error = outcome.kind === 'sent' ? '' : maskEmailsInText(outcome.error);

  switch (outcome.kind) {
    case 'sent':
      await db.$transaction([
        db.digestBatch.update({
          where: { id: batch.id },
          data: {
            status: 'SUBMITTED',
            mailgunMessageId: outcome.messageId,
            submittedAt: now,
            lastError: null,
            nextAttemptAt: null,
          },
        }),
        db.digestDelivery.updateMany({
          where: { id: { in: sendIds } },
          data: {
            status: 'SUBMITTED',
            mailgunMessageId: outcome.messageId,
            attempts: { increment: 1 },
            lastEventAt: now,
          },
        }),
      ]);
      await audit('digest.batch.sent', 'SUCCESS', { sent: sendIds.length, skipped: toSkip.length });
      return {
        kind: 'sent',
        sent: sendIds.length,
        skipped: toSkip.length,
        messageId: outcome.messageId,
      };

    case 'transient':
      if (batch.attempts < MAX_BATCH_ATTEMPTS) {
        const nextAttemptAt = new Date(now.getTime() + retryDelayMs(batch.attempts));
        await db.$transaction([
          db.digestBatch.update({
            where: { id: batch.id },
            data: { status: 'RETRY_SCHEDULED', nextAttemptAt, lastError: error },
          }),
          db.digestDelivery.updateMany({
            where: { id: { in: sendIds } },
            data: {
              attempts: { increment: 1 },
              lastErrorCode: String(outcome.status ?? 'network'),
              lastErrorMessage: error,
            },
          }),
        ]);
        await audit('digest.batch.retry_scheduled', 'FAILURE', {
          error,
          status: outcome.status,
          nextAttemptAt,
        });
        return { kind: 'retry_scheduled', attempt: batch.attempts, nextAttemptAt, error };
      }
      return fail(String(outcome.status ?? 'network'));

    case 'permanent':
      return fail(String(outcome.status));

    case 'unknown':
      // Mailgun may have accepted it. Never resend blindly: reconcile via the events API first.
      await db.digestBatch.update({
        where: { id: batch.id },
        // While UNKNOWN, nextAttemptAt is the earliest time to reconcile.
        data: {
          status: 'UNKNOWN',
          lastError: error,
          nextAttemptAt: new Date(now.getTime() + RECONCILE_AFTER_MS),
        },
      });
      await audit('digest.batch.unknown', 'FAILURE', { error });
      return { kind: 'unknown', error };
  }

  async function fail(code: string): Promise<BatchResult> {
    await db.$transaction([
      db.digestBatch.update({
        where: { id: batch.id },
        data: { status: 'FAILED', lastError: error, nextAttemptAt: null },
      }),
      db.digestDelivery.updateMany({
        where: { id: { in: sendIds } },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          lastErrorCode: code,
          lastErrorMessage: error,
          failedAt: now,
          lastEventAt: now,
        },
      }),
    ]);
    await audit('digest.batch.failed', 'FAILURE', { error, code, recipients: sendIds.length });
    return { kind: 'failed', error };
  }
}

// ─── Unknown outcomes ──────────────────────────────────────────────

/** Batches whose worker died mid-request become UNKNOWN so they get reconciled, not resent. */
export async function markStaleSendingUnknown(db: PrismaClient, now: Date): Promise<number> {
  const res = await db.digestBatch.updateMany({
    where: { status: 'SENDING', nextAttemptAt: { lt: now } },
    data: {
      status: 'UNKNOWN',
      lastError: 'worker stopped while sending',
      nextAttemptAt: new Date(now.getTime() + RECONCILE_AFTER_MS),
    },
  });
  return res.count;
}

export type ReconcileResult =
  | { kind: 'too_soon' }
  | { kind: 'not_unknown' }
  | { kind: 'settled'; accepted: number; requeued: number };

/**
 * Settle an UNKNOWN batch: deliveries Mailgun reports as accepted are marked SUBMITTED;
 * the rest are scheduled again (sendBatch only sends QUEUED rows, so accepted ones are
 * never sent twice).
 */
export async function reconcileUnknownBatch(
  deps: SendDeps,
  batchId: string,
): Promise<ReconcileResult> {
  const { db } = deps;
  const now = deps.now();
  const batch = await db.digestBatch.findUnique({
    where: { id: batchId },
    include: { deliveries: { where: { status: 'QUEUED' }, select: { id: true } } },
  });
  if (!batch || batch.status !== 'UNKNOWN') return { kind: 'not_unknown' };
  if (batch.nextAttemptAt && batch.nextAttemptAt > now) return { kind: 'too_soon' };

  const accepted = await deps.transport.acceptedDeliveryIds(
    batch.digestId,
    // From well before the attempt started (lease + reconcile delay + margin).
    new Date(now.getTime() - STALE_SENDING_MS - RECONCILE_AFTER_MS - 24 * 60 * 60_000),
  );
  const acceptedIds = batch.deliveries.map((d) => d.id).filter((id) => accepted.has(id));
  const remaining = batch.deliveries.length - acceptedIds.length;

  await db.$transaction([
    db.digestDelivery.updateMany({
      where: { id: { in: acceptedIds } },
      data: { status: 'SUBMITTED', attempts: { increment: 1 }, lastEventAt: now },
    }),
    db.digestBatch.update({
      where: { id: batch.id },
      data:
        remaining === 0
          ? { status: 'SUBMITTED', submittedAt: now, lastError: null }
          : { status: 'RETRY_SCHEDULED', nextAttemptAt: now },
    }),
  ]);
  await recordAudit(db, {
    runId: deps.runId,
    actorType: 'SYSTEM',
    action: 'digest.batch.reconciled',
    entityType: 'digest_batch',
    entityId: batch.id,
    result: 'SUCCESS',
    metadata: { digestId: batch.digestId, accepted: acceptedIds.length, requeued: remaining },
  });
  return { kind: 'settled', accepted: acceptedIds.length, requeued: remaining };
}
