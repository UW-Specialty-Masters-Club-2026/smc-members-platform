import { maskEmailsInText } from '@smc/core';
import { Prisma, recordAudit, type PrismaClient, type WeeklyDigest } from '@smc/db';
import {
  renderAdminNotice,
  renderDigestEmail,
  type AdminNoticeKind,
  type DigestContent,
  type Mailer,
} from '@smc/email';
import { enqueue, releaseStaleJobs, type JobHandler } from '@smc/jobs';
import { composeDigest } from './content';
import { recipientSummary } from './recipients';
import { digestSchedule, isPaused, weekKeyFor } from './schedule';
import {
  markStaleSendingUnknown,
  prepareBatches,
  reconcileUnknownBatch,
  sendBatch,
  type SendDeps,
} from './send';

export interface WorkflowDeps extends SendDeps {
  /** Transactional mailer for admin notifications. */
  mailer: Mailer;
  lookaheadDays: number;
  logoUrl?: string | null;
}

const OPEN_BATCH = ['PENDING', 'SENDING', 'RETRY_SCHEDULED', 'UNKNOWN'] as const;

function isUnique(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function getSettings(db: PrismaClient) {
  return db.digestSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

export async function nextIssueNumber(
  db: PrismaClient | Prisma.TransactionClient,
): Promise<number> {
  const agg = await db.weeklyDigest.aggregate({ _max: { issueNumber: true } });
  return (agg._max.issueNumber ?? 0) + 1;
}

export function adminDigestUrl(appBaseUrl: string, digestId: string): string {
  return `${appBaseUrl}/admin/digests/${digestId}`;
}

/** Email every active admin. A failed notice is audited but never blocks the workflow. */
async function sendAdminNotice(
  deps: Pick<WorkflowDeps, 'db' | 'mailer' | 'runId'>,
  kind: AdminNoticeKind,
  notice: { subject: string; html: string; text: string },
  entity: { type: string; id: string },
): Promise<void> {
  const admins = await deps.db.member.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE', emailVerifiedAt: { not: null } },
    select: { id: true, email: true },
  });
  let sent = 0;
  const failed: string[] = [];
  for (const admin of admins) {
    try {
      await deps.mailer.send({ to: admin.email, tag: 'smc-admin', ...notice });
      sent += 1;
    } catch {
      failed.push(admin.id);
    }
  }
  await recordAudit(deps.db, {
    runId: deps.runId,
    actorType: 'SYSTEM',
    action: 'admin.notified',
    entityType: entity.type,
    entityId: entity.id,
    result: failed.length ? 'FAILURE' : 'SUCCESS',
    metadata: { kind, sent, failedAdminIds: failed },
  });
}

const PT_LONG: Intl.DateTimeFormatOptions = {
  timeZone: 'America/Los_Angeles',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
};

export async function notifyAdmins(
  deps: WorkflowDeps,
  kind: AdminNoticeKind,
  digest: Pick<WeeklyDigest, 'id' | 'weekKey'>,
  details: string[],
): Promise<void> {
  const notice = renderAdminNotice({
    kind,
    dateLabel: digestSchedule(digest.weekKey).draftAt.toLocaleDateString('en-US', PT_LONG),
    adminUrl: adminDigestUrl(deps.appBaseUrl, digest.id),
    details,
  });
  await sendAdminNotice(deps, kind, notice, { type: 'weekly_digest', id: digest.id });
}

/** Alert admins that a job gave up (worker `onDead` hook). */
export async function notifyAdminsJobDead(
  deps: Pick<WorkflowDeps, 'db' | 'mailer' | 'runId' | 'appBaseUrl' | 'now'>,
  job: { id: bigint; name: string; jobKey: string; attempts: number },
  error: string,
): Promise<void> {
  const notice = renderAdminNotice({
    kind: 'job_failed',
    dateLabel: deps.now().toLocaleDateString('en-US', PT_LONG),
    adminUrl: `${deps.appBaseUrl}/admin/audit?entityType=job&entityId=${job.id}`,
    details: [
      `Job: ${job.name} (${job.jobKey})`,
      `Attempts: ${job.attempts}`,
      `Last error: ${maskEmailsInText(error).slice(0, 500)}`,
    ],
  });
  await sendAdminNotice(deps, 'job_failed', notice, { type: 'job', id: String(job.id) });
}

// ─── Draft ─────────────────────────────────────────────────────────

export type DraftResult =
  | { kind: 'exists'; digestId: string }
  | { kind: 'too_early' }
  | { kind: 'missed_window' }
  | { kind: 'paused' }
  | { kind: 'skipped'; digestId: string; reason: string }
  | { kind: 'pending_approval'; digestId: string };

/**
 * Monday 08:00 PT: draft this week's issue from the database and ask admins to approve it.
 * Idempotent per week (unique week_key). Never creates anything while paused.
 */
export async function createDraft(deps: WorkflowDeps, weekKey: string): Promise<DraftResult> {
  const { db } = deps;
  const now = deps.now();
  const schedule = digestSchedule(weekKey);
  const existing = await db.weeklyDigest.findUnique({ where: { weekKey } });
  if (existing) return { kind: 'exists', digestId: existing.id };
  if (now < schedule.draftAt) return { kind: 'too_early' };

  const audit = (
    action: string,
    result: 'SUCCESS' | 'SKIPPED',
    metadata: Record<string, unknown>,
    entityId?: string,
  ) =>
    recordAudit(db, {
      runId: deps.runId,
      actorType: 'SYSTEM',
      action,
      entityType: 'weekly_digest',
      entityId,
      result,
      metadata: { weekKey, ...metadata },
    });

  if (now >= schedule.expiresAt) {
    await audit('digest.draft.missed_window', 'SKIPPED', { now });
    return { kind: 'missed_window' };
  }
  const settings = await getSettings(db);
  if (isPaused(settings, now)) {
    await audit('digest.draft.paused', 'SKIPPED', {
      pausedUntil: settings.pausedUntil,
      reason: settings.pausedReason,
    });
    return { kind: 'paused' };
  }

  const composed = await composeDigest(db, {
    weekKey,
    now,
    appBaseUrl: deps.appBaseUrl,
    lookaheadDays: deps.lookaheadDays,
  });
  const base = {
    weekKey,
    windowStart: schedule.windowStart,
    windowEnd: schedule.windowEnd,
    sendNotBefore: schedule.sendNotBefore,
    expiresAt: schedule.expiresAt,
    runId: deps.runId,
  };

  try {
    if (composed.kind === 'skip') {
      const digest = await db.weeklyDigest.create({
        data: { ...base, status: 'SKIPPED', skipReason: composed.detail },
      });
      await audit(
        'digest.skipped',
        'SKIPPED',
        { reason: composed.reason, detail: composed.detail },
        digest.id,
      );
      await notifyAdmins(deps, 'skipped', digest, [composed.detail]);
      return { kind: 'skipped', digestId: digest.id, reason: composed.detail };
    }

    // Rendered with the next free issue number for the preview; the number is fixed on approval.
    const issue = await nextIssueNumber(db);
    const email = await renderDigestEmail({
      content: composed.content,
      issueNumber: issue,
      appBaseUrl: deps.appBaseUrl,
      logoUrl: deps.logoUrl,
    });
    const recipients = await recipientSummary(db);
    const digest = await db.weeklyDigest.create({
      data: {
        ...base,
        status: 'PENDING_APPROVAL',
        contentSnapshot: composed.content as unknown as Prisma.InputJsonValue,
        summaryText: composed.content.summary,
        summarySource: 'TEMPLATE',
        subject: email.subject,
        html: email.html,
        text: email.text,
        recipientCountPreview: recipients.total,
      },
    });
    await audit(
      'digest.drafted',
      'SUCCESS',
      {
        events: composed.content.events.length,
        news: composed.content.news.length,
        omitted: composed.content.omitted,
        recipients: recipients.total,
      },
      digest.id,
    );
    await notifyAdmins(deps, 'approval_needed', digest, [
      `${composed.content.events.length} event(s), ${composed.content.news.length} news post(s)`,
      `${recipients.total} recipient(s): ${recipients.scope}`,
      'Approve by 6:00 PM PT; approved issues go out from 9:00 AM PT.',
    ]);
    return { kind: 'pending_approval', digestId: digest.id };
  } catch (err) {
    if (isUnique(err)) {
      const row = await db.weeklyDigest.findUniqueOrThrow({ where: { weekKey } });
      return { kind: 'exists', digestId: row.id };
    }
    throw err;
  }
}

// ─── Human approval ────────────────────────────────────────────────

export type ApprovalResult =
  | { kind: 'approved'; issueNumber: number }
  | { kind: 'already_approved' }
  | { kind: 'expired' }
  | { kind: 'stale_version' }
  | { kind: 'not_pending'; status: string }
  | { kind: 'not_found' };

/**
 * Approve exactly once. The conditional update (status + version + deadline) makes a double
 * click or two admins approving together a single transition; the issue number is assigned
 * and the email re-rendered with it in the same transaction.
 */
export async function approveDigest(
  deps: Pick<WorkflowDeps, 'db' | 'now' | 'runId' | 'appBaseUrl' | 'logoUrl'>,
  digestId: string,
  adminId: string,
  expectedVersion: number,
): Promise<ApprovalResult> {
  const now = deps.now();
  return deps.db.$transaction(async (tx) => {
    const claimed = await tx.weeklyDigest.updateMany({
      where: {
        id: digestId,
        status: 'PENDING_APPROVAL',
        version: expectedVersion,
        expiresAt: { gt: now },
      },
      data: {
        status: 'APPROVED',
        approvedById: adminId,
        approvedAt: now,
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      const current = await tx.weeklyDigest.findUnique({ where: { id: digestId } });
      if (!current) return { kind: 'not_found' };
      if (['APPROVED', 'SENDING', 'SENT', 'PARTIALLY_FAILED'].includes(current.status)) {
        return { kind: 'already_approved' };
      }
      if (current.status === 'PENDING_APPROVAL' && current.expiresAt <= now)
        return { kind: 'expired' };
      if (current.status === 'PENDING_APPROVAL') return { kind: 'stale_version' };
      return { kind: 'not_pending', status: current.status };
    }

    const digest = await tx.weeklyDigest.findUniqueOrThrow({ where: { id: digestId } });
    const issueNumber = await nextIssueNumber(tx);
    const email = await renderDigestEmail({
      content: digest.contentSnapshot as unknown as DigestContent,
      issueNumber,
      appBaseUrl: deps.appBaseUrl,
      logoUrl: deps.logoUrl,
    });
    await tx.weeklyDigest.update({
      where: { id: digestId },
      data: { issueNumber, subject: email.subject, html: email.html, text: email.text },
    });
    await recordAudit(tx, {
      runId: deps.runId,
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'digest.approved',
      entityType: 'weekly_digest',
      entityId: digestId,
      result: 'SUCCESS',
      metadata: { issueNumber, version: expectedVersion + 1, sendNotBefore: digest.sendNotBefore },
    });
    return { kind: 'approved', issueNumber };
  });
}

export async function rejectDigest(
  deps: Pick<WorkflowDeps, 'db' | 'now' | 'runId'>,
  digestId: string,
  adminId: string,
  expectedVersion: number,
  reason: string,
): Promise<'rejected' | 'not_pending'> {
  const now = deps.now();
  const res = await deps.db.weeklyDigest.updateMany({
    where: { id: digestId, status: 'PENDING_APPROVAL', version: expectedVersion },
    data: {
      status: 'REJECTED',
      rejectedById: adminId,
      rejectedAt: now,
      rejectReason: reason,
      version: { increment: 1 },
    },
  });
  if (res.count !== 1) return 'not_pending';
  await recordAudit(deps.db, {
    runId: deps.runId,
    actorType: 'ADMIN',
    actorId: adminId,
    action: 'digest.rejected',
    entityType: 'weekly_digest',
    entityId: digestId,
    result: 'SUCCESS',
    metadata: { reason },
  });
  return 'rejected';
}

// ─── Sending ───────────────────────────────────────────────────────

/** APPROVED → SENDING once the 09:00 PT gate has passed; then snapshot recipients into batches. */
export async function startSend(deps: WorkflowDeps, digestId: string) {
  const { db } = deps;
  const now = deps.now();
  const moved = await db.weeklyDigest.updateMany({
    where: { id: digestId, status: 'APPROVED', sendNotBefore: { lte: now } },
    data: { status: 'SENDING', sendingStartedAt: now, version: { increment: 1 } },
  });
  const digest = await db.weeklyDigest.findUniqueOrThrow({ where: { id: digestId } });
  if (digest.status !== 'SENDING') return { kind: 'not_ready' as const, status: digest.status };

  // Re-running after a crash just tops up missing rows (idempotent).
  const prepared = await prepareBatches(db, digest);
  // Queue the batches now rather than waiting for the next tick.
  const pending = await db.digestBatch.findMany({
    where: { digestId, status: 'PENDING' },
    select: { id: true, attempts: true },
  });
  for (const b of pending) {
    await enqueue(db, {
      name: JOB.sendBatch,
      key: `${JOB.sendBatch}:${b.id}:${b.attempts + 1}`,
      payload: { batchId: b.id },
      runAt: now,
    });
  }
  if (moved.count === 1) {
    await recordAudit(db, {
      runId: deps.runId,
      actorType: 'SYSTEM',
      action: 'digest.sending_started',
      entityType: 'weekly_digest',
      entityId: digestId,
      result: 'SUCCESS',
      metadata: prepared,
    });
  }
  return { kind: 'sending' as const, ...prepared };
}

/** SENDING digests whose batches are all settled become SENT or PARTIALLY_FAILED. */
export async function finalizeDigests(deps: WorkflowDeps): Promise<number> {
  const { db } = deps;
  const now = deps.now();
  const sending = await db.weeklyDigest.findMany({ where: { status: 'SENDING' } });
  let finalized = 0;
  for (const digest of sending) {
    const open = await db.digestBatch.count({
      where: { digestId: digest.id, status: { in: [...OPEN_BATCH] } },
    });
    if (open > 0) continue;
    const [failed, submitted, skipped] = await Promise.all([
      db.digestDelivery.count({ where: { digestId: digest.id, status: 'FAILED' } }),
      db.digestDelivery.count({
        where: { digestId: digest.id, status: { notIn: ['FAILED', 'SKIPPED', 'QUEUED'] } },
      }),
      db.digestDelivery.count({ where: { digestId: digest.id, status: 'SKIPPED' } }),
    ]);
    const status = failed > 0 ? 'PARTIALLY_FAILED' : 'SENT';
    const res = await db.weeklyDigest.updateMany({
      where: { id: digest.id, status: 'SENDING' },
      data: { status, completedAt: now, version: { increment: 1 } },
    });
    if (res.count !== 1) continue;
    finalized += 1;
    await recordAudit(db, {
      runId: deps.runId,
      actorType: 'SYSTEM',
      action: status === 'SENT' ? 'digest.sent' : 'digest.partially_failed',
      entityType: 'weekly_digest',
      entityId: digest.id,
      result: status === 'SENT' ? 'SUCCESS' : 'FAILURE',
      metadata: { submitted, failed, skipped },
    });
    await notifyAdmins(deps, status === 'SENT' ? 'sent' : 'partially_failed', digest, [
      `${submitted} submitted to Mailgun`,
      `${failed} failed`,
      `${skipped} skipped (opted out after approval, or not on the test allowlist)`,
    ]);
  }
  return finalized;
}

/** Monday 18:00 PT: unapproved issues expire and are never sent. */
export async function expireDigests(deps: WorkflowDeps): Promise<number> {
  const { db } = deps;
  const now = deps.now();
  const due = await db.weeklyDigest.findMany({
    where: { status: 'PENDING_APPROVAL', expiresAt: { lte: now } },
  });
  let expired = 0;
  for (const digest of due) {
    const res = await db.weeklyDigest.updateMany({
      where: { id: digest.id, status: 'PENDING_APPROVAL' },
      data: { status: 'EXPIRED', version: { increment: 1 } },
    });
    if (res.count !== 1) continue;
    expired += 1;
    await recordAudit(db, {
      runId: deps.runId,
      actorType: 'SYSTEM',
      action: 'digest.expired',
      entityType: 'weekly_digest',
      entityId: digest.id,
      result: 'SKIPPED',
      metadata: { expiresAt: digest.expiresAt },
    });
    await notifyAdmins(deps, 'expired', digest, ['Not approved by 6:00 PM PT.']);
  }
  return expired;
}

// ─── Scheduler tick and job handlers ───────────────────────────────

export const JOB = {
  createDraft: 'digest.create-draft',
  startSend: 'digest.start-send',
  sendBatch: 'digest.send-batch',
  reconcile: 'digest.reconcile',
} as const;

/**
 * Runs every minute (and exactly at Monday 08:00 / 18:00 PT). Every step is idempotent, so a
 * missed or repeated tick is harmless: it catches up drafts the worker missed, expires,
 * starts approved sends after 09:00 PT, queues due batches and reconciliations, and closes
 * finished digests.
 */
export async function tick(deps: WorkflowDeps) {
  const { db } = deps;
  const now = deps.now();
  const out = { enqueued: 0, expired: 0, finalized: 0, staleBatches: 0, staleJobs: 0 };

  out.staleJobs = await releaseStaleJobs(db, now);
  out.staleBatches = await markStaleSendingUnknown(db, now);

  const weekKey = weekKeyFor(now);
  const schedule = digestSchedule(weekKey);
  if (now >= schedule.draftAt && now < schedule.expiresAt) {
    const exists = await db.weeklyDigest.count({ where: { weekKey } });
    if (
      !exists &&
      (await enqueue(db, {
        name: JOB.createDraft,
        key: `${JOB.createDraft}:${weekKey}`,
        payload: { weekKey },
        runAt: now,
      }))
    ) {
      out.enqueued += 1;
    }
  }

  out.expired = await expireDigests(deps);

  const approved = await db.weeklyDigest.findMany({
    where: { status: 'APPROVED', sendNotBefore: { lte: now } },
    select: { id: true },
  });
  for (const d of approved) {
    if (
      await enqueue(db, {
        name: JOB.startSend,
        key: `${JOB.startSend}:${d.id}`,
        payload: { digestId: d.id },
        runAt: now,
      })
    ) {
      out.enqueued += 1;
    }
  }

  const due = await db.digestBatch.findMany({
    where: {
      digest: { status: 'SENDING' },
      OR: [
        { status: 'PENDING' },
        { status: 'RETRY_SCHEDULED', nextAttemptAt: { lte: now } },
        { status: 'UNKNOWN', nextAttemptAt: { lte: now } },
      ],
    },
    select: { id: true, status: true, attempts: true, nextAttemptAt: true },
  });
  for (const b of due) {
    const job =
      b.status === 'UNKNOWN'
        ? { name: JOB.reconcile, key: `${JOB.reconcile}:${b.id}:${b.nextAttemptAt!.getTime()}` }
        : { name: JOB.sendBatch, key: `${JOB.sendBatch}:${b.id}:${b.attempts + 1}` };
    if (await enqueue(db, { ...job, payload: { batchId: b.id }, runAt: now })) out.enqueued += 1;
  }

  out.finalized = await finalizeDigests(deps);
  return out;
}

/** Job handlers; `makeDeps` gives each job its own runId for the audit trail. */
export function digestJobHandlers(
  makeDeps: (runId: string) => WorkflowDeps,
): Record<string, JobHandler> {
  const str = (payload: Prisma.JsonValue, key: string): string => {
    const v = (payload as Record<string, unknown> | null)?.[key];
    if (typeof v !== 'string') throw new Error(`job payload is missing "${key}"`);
    return v;
  };
  return {
    [JOB.createDraft]: async (p, ctx) =>
      void (await createDraft(makeDeps(ctx.runId), str(p, 'weekKey'))),
    [JOB.startSend]: async (p, ctx) =>
      void (await startSend(makeDeps(ctx.runId), str(p, 'digestId'))),
    // After a batch settles, close the issue right away instead of waiting for the next tick.
    [JOB.sendBatch]: async (p, ctx) => {
      const deps = makeDeps(ctx.runId);
      await sendBatch(deps, str(p, 'batchId'));
      await finalizeDigests(deps);
    },
    [JOB.reconcile]: async (p, ctx) => {
      const deps = makeDeps(ctx.runId);
      await reconcileUnknownBatch(deps, str(p, 'batchId'));
      await finalizeDigests(deps);
    },
  };
}
