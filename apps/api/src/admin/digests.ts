import { InvalidLocalTimeError, parsePtLocal, formatPtRange } from '@smc/core';
import { recordAudit, type DeliveryStatus, type Prisma, type WeeklyDigest } from '@smc/db';
import {
  approveDigest,
  createDraft,
  digestSchedule,
  getSettings,
  isPaused,
  JOB,
  recipientSummary,
  rejectDigest,
  weekKeyFor,
  type WorkflowDeps,
} from '@smc/digest';
import { personalize, recipientGuard, type DigestContent } from '@smc/email';
import { enqueue } from '@smc/jobs';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { requireRole } from '../middleware/access';
import { auditView } from './audit';

/** Preview pages are inert documents: no scripts, only fonts/styles/images the email uses. */
const PREVIEW_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  'img-src https: data:',
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function sendHtmlDocument(res: Response, html: string) {
  res.setHeader('Content-Security-Policy', PREVIEW_CSP);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(html);
}

const TEST_SENDS_PER_HOUR = 10;
const DELIVERY_STATUSES = [
  'QUEUED',
  'SUBMITTED',
  'DELIVERED',
  'TEMP_FAILED',
  'FAILED',
  'COMPLAINED',
  'UNSUBSCRIBED',
  'SKIPPED',
] as const;

const versionBody = z.strictObject({ version: z.number().int().min(0) });
const rejectBody = z.strictObject({
  version: z.number().int().min(0),
  reason: z.string().trim().min(3).max(500),
});
const settingsBody = z.strictObject({
  paused: z.boolean(),
  pausedUntilPt: z
    .string()
    .nullable()
    .default(null)
    .transform((v, issueCtx) => {
      if (v === null) return null;
      try {
        return parsePtLocal(v);
      } catch (err) {
        issueCtx.addIssue({
          code: 'custom',
          message: err instanceof InvalidLocalTimeError ? err.message : 'invalid time',
        });
        return z.NEVER;
      }
    }),
  pausedReason: z.string().trim().max(300).nullable().default(null),
});
const deliveriesQuery = z.object({
  status: z.enum(DELIVERY_STATUSES).optional(),
  cursor: z.string().max(40).optional(),
});

/** The API never sends batches; the worker does. Drafting from the API needs no transport. */
const NO_TRANSPORT = {
  sendBatch: () => Promise.reject(new Error('batch sending runs in the worker')),
  acceptedDeliveryIds: () => Promise.reject(new Error('batch sending runs in the worker')),
};

export function workflowDeps(ctx: AppContext, runId: string): WorkflowDeps {
  return {
    db: ctx.prisma,
    transport: NO_TRANSPORT,
    guard: recipientGuard(ctx.config.appEnv, ctx.config.emailAllowlist),
    mailer: ctx.mailer,
    from: ctx.config.mailFrom,
    replyTo: ctx.config.mailReplyTo,
    appBaseUrl: ctx.config.appBaseUrl,
    apiBaseUrl: ctx.config.apiBaseUrl,
    linkSigningSecret: ctx.config.linkSigningSecret,
    lookaheadDays: ctx.config.digestLookaheadDays,
    logoUrl: ctx.config.digestLogoUrl,
    now: ctx.now,
    runId,
  };
}

async function deliveryCounts(ctx: AppContext, digestId: string) {
  const [rows, accepted] = await Promise.all([
    ctx.prisma.digestDelivery.groupBy({
      by: ['status'],
      where: { digestId },
      _count: { _all: true },
    }),
    ctx.prisma.digestDelivery.count({ where: { digestId, mailgunMessageId: { not: null } } }),
  ]);
  const byStatus = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, 0])) as Record<
    DeliveryStatus,
    number
  >;
  for (const r of rows) byStatus[r.status] = r._count._all;
  return {
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byStatus,
    summary: {
      /** Accepted by Mailgun. */
      sent: accepted,
      delivered: byStatus.DELIVERED,
      failed: byStatus.FAILED,
      /** Unsubscribed or marked as spam from this issue. */
      optedOut: byStatus.UNSUBSCRIBED + byStatus.COMPLAINED,
      skipped: byStatus.SKIPPED,
      pending: byStatus.QUEUED + byStatus.TEMP_FAILED,
    },
  };
}

function scheduleView(weekKey: string) {
  const s = digestSchedule(weekKey);
  const pt = (d: Date) => formatPtRange(d, null);
  return {
    draftAt: s.draftAt,
    sendNotBefore: s.sendNotBefore,
    expiresAt: s.expiresAt,
    labels: {
      draftAt: pt(s.draftAt),
      sendNotBefore: pt(s.sendNotBefore),
      expiresAt: pt(s.expiresAt),
    },
    newsWindow: { start: pt(s.windowStart), end: pt(s.windowEnd) },
  };
}

function summaryView(d: WeeklyDigest) {
  return {
    id: d.id,
    weekKey: d.weekKey,
    status: d.status,
    issueNumber: d.issueNumber,
    subject: d.subject,
    summaryText: d.summaryText,
    recipientCountPreview: d.recipientCountPreview,
    skipReason: d.skipReason,
    approvedAt: d.approvedAt,
    completedAt: d.completedAt,
    createdAt: d.createdAt,
  };
}

/** Admin workspace for the weekly digest. Approving, rejecting and pausing are ADMIN-only. */
export function adminDigestsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireRole(ctx, 'ADMIN', 'ORGANIZER'));
  const adminOnly = requireRole(ctx, 'ADMIN');

  async function findDigest(id: string) {
    const digest = await ctx.prisma.weeklyDigest.findUnique({
      where: { id },
      include: {
        approvedBy: { select: { firstName: true, lastName: true } },
        rejectedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!digest) throw new HttpError(404, 'digest_not_found');
    return digest;
  }

  router.get('/', async (_req, res) => {
    const now = ctx.now();
    const [digests, settings] = await Promise.all([
      ctx.prisma.weeklyDigest.findMany({ orderBy: { weekKey: 'desc' }, take: 52 }),
      getSettings(ctx.prisma),
    ]);
    const weekKey = weekKeyFor(now);
    const s = digestSchedule(weekKey);
    const day = 24 * 60 * 60_000;
    const [deadJobs, rejectedWebhooks, unknownBatches, retryingBatches, failedDeliveries] =
      await Promise.all([
        ctx.prisma.job.count({
          where: { status: 'DEAD', updatedAt: { gt: new Date(now.getTime() - 7 * day) } },
        }),
        ctx.prisma.auditLog.count({
          where: {
            action: 'mailgun.webhook.rejected',
            createdAt: { gt: new Date(now.getTime() - day) },
          },
        }),
        ctx.prisma.digestBatch.count({ where: { status: 'UNKNOWN' } }),
        ctx.prisma.digestBatch.count({ where: { status: 'RETRY_SCHEDULED' } }),
        ctx.prisma.digestDelivery.count({
          where: { status: 'FAILED', updatedAt: { gt: new Date(now.getTime() - 7 * day) } },
        }),
      ]);
    res.json({
      health: { deadJobs, rejectedWebhooks, unknownBatches, retryingBatches, failedDeliveries },
      digests: digests.map(summaryView),
      settings: { ...settings, pausedNow: isPaused(settings, now) },
      thisWeek: {
        weekKey,
        exists: digests.some((d) => d.weekKey === weekKey),
        canDraftNow: now >= s.draftAt && now < s.expiresAt,
        ...scheduleView(weekKey),
      },
    });
  });

  router.put('/settings', adminOnly, async (req, res) => {
    const body = settingsBody.parse(req.body);
    const settings = await ctx.prisma.digestSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        paused: body.paused,
        pausedUntil: body.pausedUntilPt,
        pausedReason: body.pausedReason,
        updatedById: req.auth!.memberId,
      },
      update: {
        paused: body.paused,
        pausedUntil: body.pausedUntilPt,
        pausedReason: body.pausedReason,
        updatedById: req.auth!.memberId,
      },
    });
    await recordAudit(ctx.prisma, {
      runId: req.runId,
      actorType: 'ADMIN',
      actorId: req.auth!.memberId,
      action: body.paused ? 'digest.paused' : 'digest.resumed',
      entityType: 'digest_settings',
      entityId: '1',
      result: 'SUCCESS',
      metadata: { pausedUntil: body.pausedUntilPt, reason: body.pausedReason },
    });
    res.json({ ...settings, pausedNow: isPaused(settings, ctx.now()) });
  });

  /** Draft this week's issue now (e.g. right after unpausing on a Monday morning). */
  router.post('/draft-now', adminOnly, async (req, res) => {
    const result = await createDraft(workflowDeps(ctx, req.runId), weekKeyFor(ctx.now()));
    const errors: Partial<Record<typeof result.kind, string>> = {
      too_early: 'before_draft_time',
      missed_window: 'after_deadline',
      paused: 'paused',
    };
    const error = errors[result.kind];
    if (error) throw new HttpError(409, error);
    res.status(result.kind === 'exists' ? 200 : 201).json(result);
  });

  router.get('/:id', async (req, res) => {
    const digest = await findDigest(String(req.params.id));
    const content = digest.contentSnapshot as unknown as DigestContent | null;
    const [recipients, counts, batches] = await Promise.all([
      recipientSummary(ctx.prisma),
      deliveryCounts(ctx, digest.id),
      ctx.prisma.digestBatch.findMany({
        where: { digestId: digest.id },
        orderBy: { batchNo: 'asc' },
        select: {
          batchNo: true,
          status: true,
          recipientCount: true,
          attempts: true,
          nextAttemptAt: true,
          lastError: true,
          submittedAt: true,
        },
      }),
    ]);
    res.json({
      ...summaryView(digest),
      version: digest.version,
      schedule: scheduleView(digest.weekKey),
      content,
      recipients: { ...recipients, previewTotal: digest.recipientCountPreview },
      approvedBy: digest.approvedBy,
      rejectedBy: digest.rejectedBy,
      rejectReason: digest.rejectReason,
      sendingStartedAt: digest.sendingStartedAt,
      results: { deliveries: counts, batches },
      canApprove: digest.status === 'PENDING_APPROVAL' && digest.expiresAt > ctx.now(),
    });
  });

  /** The email exactly as approved, personalised for the viewing admin. */
  router.get('/:id/preview', async (req, res) => {
    const digest = await findDigest(String(req.params.id));
    if (!digest.html || !digest.text) throw new HttpError(404, 'no_preview');
    const viewer = await ctx.prisma.member.findUniqueOrThrow({ where: { id: req.auth!.memberId } });
    const out = personalize(
      { html: digest.html, text: digest.text },
      {
        firstName: viewer.firstName,
        unsubscribeUrl: `${ctx.config.appBaseUrl}/email/unsubscribe#preview`,
      },
    );
    if (req.query.format === 'text') {
      res.setHeader('Cache-Control', 'no-store');
      res.type('text/plain').send(out.text);
      return;
    }
    sendHtmlDocument(res, out.html);
  });

  /** Send the issue to yourself only — never to anyone else, in any environment. */
  router.post('/:id/test-send', async (req, res) => {
    const digest = await findDigest(String(req.params.id));
    if (!digest.html || !digest.text || !digest.subject) throw new HttpError(409, 'no_content');
    const me = await ctx.prisma.member.findUniqueOrThrow({ where: { id: req.auth!.memberId } });
    const since = new Date(ctx.now().getTime() - 60 * 60_000);
    const recent = await ctx.prisma.auditLog.count({
      where: { action: 'digest.test_sent', actorId: me.id, createdAt: { gt: since } },
    });
    if (recent >= TEST_SENDS_PER_HOUR) throw new HttpError(429, 'too_many_test_sends');

    const out = personalize(
      { html: digest.html, text: digest.text },
      {
        firstName: me.firstName,
        unsubscribeUrl: `${ctx.config.appBaseUrl}/email/unsubscribe#test`,
      },
    );
    let result: 'SUCCESS' | 'FAILURE' = 'SUCCESS';
    let error: string | undefined;
    try {
      await ctx.mailer.send({
        to: me.email,
        subject: `[TEST] ${digest.subject}`,
        html: out.html,
        text: out.text,
        tag: 'digest-test',
        variables: { digest_id: digest.id },
      });
    } catch (err) {
      result = 'FAILURE';
      error = err instanceof Error ? err.message : 'send failed';
    }
    await recordAudit(ctx.prisma, {
      runId: req.runId,
      actorType: me.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
      actorId: me.id,
      action: 'digest.test_sent',
      entityType: 'weekly_digest',
      entityId: digest.id,
      result,
      metadata: { to: me.email, error },
    });
    if (result === 'FAILURE') throw new HttpError(502, 'test_send_failed');
    res.json({ status: 'sent', to: me.email });
  });

  router.post('/:id/approve', adminOnly, async (req, res) => {
    const { version } = versionBody.parse(req.body);
    const result = await approveDigest(
      workflowDeps(ctx, req.runId),
      String(req.params.id),
      req.auth!.memberId,
      version,
    );
    if (result.kind === 'not_found') throw new HttpError(404, 'digest_not_found');
    if (
      result.kind === 'expired' ||
      result.kind === 'stale_version' ||
      result.kind === 'not_pending'
    ) {
      throw new HttpError(409, result.kind);
    }
    if (result.kind === 'approved') {
      const digest = await findDigest(String(req.params.id));
      const now = ctx.now();
      await enqueue(ctx.prisma, {
        name: JOB.startSend,
        key: `${JOB.startSend}:${digest.id}`,
        payload: { digestId: digest.id },
        runAt: digest.sendNotBefore > now ? digest.sendNotBefore : now,
      });
    }
    res.json(result);
  });

  router.post('/:id/reject', adminOnly, async (req, res) => {
    const { version, reason } = rejectBody.parse(req.body);
    const outcome = await rejectDigest(
      workflowDeps(ctx, req.runId),
      String(req.params.id),
      req.auth!.memberId,
      version,
      reason,
    );
    if (outcome !== 'rejected') throw new HttpError(409, 'not_pending');
    res.json({ status: 'rejected' });
  });

  /** Everything that happened to this issue (draft, approval, batches, notices), oldest first. */
  router.get('/:id/activity', async (req, res) => {
    const id = String(req.params.id);
    const rows = await ctx.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'weekly_digest', entityId: id },
          { metadata: { path: '$.digestId', equals: id } },
        ],
      },
      orderBy: { id: 'asc' },
      take: 500,
    });
    res.json({ entries: await auditView(ctx, rows) });
  });

  /** Per-recipient delivery status, for chasing failures. */
  router.get('/:id/deliveries', async (req, res) => {
    const { status, cursor } = deliveriesQuery.parse(req.query);
    const where: Prisma.DigestDeliveryWhereInput = {
      digestId: String(req.params.id),
      ...(status && { status }),
    };
    const rows = await ctx.prisma.digestDelivery.findMany({
      where,
      orderBy: { id: 'asc' },
      take: 101,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: { member: { select: { firstName: true, lastName: true, email: true } } },
    });
    const page = rows.slice(0, 100);
    res.json({
      deliveries: page.map((d) => ({
        id: d.id,
        status: d.status,
        member: d.member,
        attempts: d.attempts,
        lastErrorCode: d.lastErrorCode,
        lastErrorMessage: d.lastErrorMessage,
        lastEventAt: d.lastEventAt,
        deliveredAt: d.deliveredAt,
        failedAt: d.failedAt,
      })),
      nextCursor: rows.length > 100 ? page.at(-1)!.id : null,
    });
  });

  return router;
}
