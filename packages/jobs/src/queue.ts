import { maskEmailsInText } from '@smc/core';
import { recordAudit, type Job, type Prisma, type PrismaClient } from '@smc/db';

/** Back-off after a failed attempt: 30 s, 1 min, 2 min, 4 min … capped at 30 min. */
export function jobRetryDelayMs(attempt: number): number {
  return Math.min(30_000 * 2 ** (attempt - 1), 30 * 60_000);
}

/** A RUNNING job whose worker vanished is released after this long. */
export const JOB_LEASE_MS = 10 * 60_000;

export interface EnqueueInput {
  name: string;
  /** Idempotency key: enqueueing the same key again is a no-op. */
  key: string;
  payload?: Prisma.InputJsonValue;
  runAt: Date;
  maxAttempts?: number;
}

/** Add a job unless one with the same key already exists. Returns true if it was added. */
export async function enqueue(db: PrismaClient, job: EnqueueInput): Promise<boolean> {
  const res = await db.job.createMany({
    data: [
      {
        name: job.name,
        jobKey: job.key,
        payload: job.payload ?? {},
        runAt: job.runAt,
        maxAttempts: job.maxAttempts ?? 5,
      },
    ],
    skipDuplicates: true,
  });
  return res.count === 1;
}

/**
 * Claim the next due job. `FOR UPDATE SKIP LOCKED` lets several workers poll the same table
 * without ever picking the same row.
 */
export async function claimNext(
  db: PrismaClient,
  workerId: string,
  now: Date,
): Promise<Job | null> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM jobs
      WHERE status = 'QUEUED' AND run_at <= ${now}
      ORDER BY run_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED`;
    const id = rows[0]?.id;
    if (id === undefined) return null;
    return tx.job.update({
      where: { id },
      data: { status: 'RUNNING', lockedAt: now, lockedBy: workerId, attempts: { increment: 1 } },
    });
  });
}

export async function completeJob(db: PrismaClient, job: Job, now: Date): Promise<void> {
  await db.job.update({
    where: { id: job.id },
    data: { status: 'SUCCEEDED', finishedAt: now, lockedAt: null, lockedBy: null, lastError: null },
  });
}

/** Retry with back-off, or mark DEAD (and audit) once attempts are used up. */
export async function failJob(
  db: PrismaClient,
  job: Job,
  err: unknown,
  now: Date,
): Promise<'retry' | 'dead'> {
  const message = maskEmailsInText(err instanceof Error ? err.message : String(err)).slice(0, 2000);
  const dead = job.attempts >= job.maxAttempts;
  await db.job.update({
    where: { id: job.id },
    data: dead
      ? { status: 'DEAD', finishedAt: now, lockedAt: null, lockedBy: null, lastError: message }
      : {
          status: 'QUEUED',
          runAt: new Date(now.getTime() + jobRetryDelayMs(job.attempts)),
          lockedAt: null,
          lockedBy: null,
          lastError: message,
        },
  });
  if (dead) {
    await recordAudit(db, {
      runId: `job-${job.id}`,
      actorType: 'SYSTEM',
      action: 'job.dead',
      entityType: 'job',
      entityId: String(job.id),
      result: 'FAILURE',
      metadata: { name: job.name, key: job.jobKey, attempts: job.attempts, error: message },
    });
  }
  return dead ? 'dead' : 'retry';
}

/** Put RUNNING jobs whose lease expired back in the queue (handlers are idempotent). */
export async function releaseStaleJobs(db: PrismaClient, now: Date): Promise<number> {
  const res = await db.job.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: new Date(now.getTime() - JOB_LEASE_MS) } },
    data: { status: 'QUEUED', lockedAt: null, lockedBy: null, lastError: 'lease expired' },
  });
  return res.count;
}

export interface JobContext {
  job: Job;
  /** Correlates the job's audit entries. */
  runId: string;
  now: Date;
}

export type JobHandler = (payload: Prisma.JsonValue, ctx: JobContext) => Promise<void>;

export interface RunResult {
  succeeded: number;
  retried: number;
  dead: number;
}

/**
 * Process due jobs until none are left (or `limit` is reached). Unknown job names fail
 * like any other error, so they surface as DEAD instead of silently vanishing.
 */
export async function runDueJobs(
  db: PrismaClient,
  handlers: Record<string, JobHandler>,
  opts: {
    workerId: string;
    now: () => Date;
    limit?: number;
    onError?: (job: Job, err: unknown) => void;
    /** Called once when a job gives up for good (e.g. to alert admins). Errors are swallowed. */
    onDead?: (job: Job, err: unknown) => Promise<void>;
  },
): Promise<RunResult> {
  const result: RunResult = { succeeded: 0, retried: 0, dead: 0 };
  for (let i = 0; i < (opts.limit ?? 100); i++) {
    const job = await claimNext(db, opts.workerId, opts.now());
    if (!job) break;
    try {
      const handler = handlers[job.name];
      if (!handler) throw new Error(`no handler for job "${job.name}"`);
      await handler(job.payload, { job, runId: `job-${job.id}-${job.attempts}`, now: opts.now() });
      await completeJob(db, job, opts.now());
      result.succeeded += 1;
    } catch (err) {
      opts.onError?.(job, err);
      const outcome = await failJob(db, job, err, opts.now());
      result[outcome === 'dead' ? 'dead' : 'retried'] += 1;
      if (outcome === 'dead') await opts.onDead?.(job, err).catch(() => undefined);
    }
  }
  return result;
}
