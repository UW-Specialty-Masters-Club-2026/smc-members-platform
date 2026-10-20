import { createPrismaClient, type PrismaClient } from '@smc/db';
import { assertTestDatabase, resetDatabase } from '@smc/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  claimNext,
  enqueue,
  jobRetryDelayMs,
  JOB_LEASE_MS,
  releaseStaleJobs,
  runDueJobs,
  type JobHandler,
} from './queue';

const url = process.env.TEST_DATABASE_URL;
const T0 = new Date('2026-10-26T15:00:00Z');

describe.skipIf(!url)('MySQL job queue', () => {
  let db: PrismaClient;
  beforeAll(() => {
    assertTestDatabase(url!);
    db = createPrismaClient(url!);
  });
  beforeEach(() => resetDatabase(db));
  afterAll(() => db.$disconnect());

  it('enqueues a key only once', async () => {
    const job = { name: 'x', key: 'x:2026-10-26', runAt: T0 };
    expect(await enqueue(db, job)).toBe(true);
    expect(await enqueue(db, job)).toBe(false);
    expect(await db.job.count()).toBe(1);
  });

  it('claims only due jobs, oldest first', async () => {
    await enqueue(db, { name: 'later', key: 'later', runAt: new Date(T0.getTime() + 60_000) });
    await enqueue(db, { name: 'b', key: 'b', runAt: new Date(T0.getTime() - 1000) });
    await enqueue(db, { name: 'a', key: 'a', runAt: new Date(T0.getTime() - 2000) });
    expect((await claimNext(db, 'w1', T0))?.name).toBe('a');
    expect((await claimNext(db, 'w1', T0))?.name).toBe('b');
    expect(await claimNext(db, 'w1', T0)).toBeNull();
  });

  it('never hands the same job to two workers', async () => {
    for (let i = 0; i < 10; i++) await enqueue(db, { name: 'n', key: `k${i}`, runAt: T0 });
    const claims = await Promise.all(
      Array.from({ length: 16 }, (_, i) => claimNext(db, `w${i}`, T0)),
    );
    const ids = claims.filter(Boolean).map((j) => String(j!.id));
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });

  it('retries failures with back-off and marks them DEAD after maxAttempts', async () => {
    await enqueue(db, { name: 'flaky', key: 'flaky', runAt: T0, maxAttempts: 3 });
    let now = T0;
    const handlers: Record<string, JobHandler> = {
      flaky: async () => {
        throw new Error('boom for ann@uw.edu');
      },
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await runDueJobs(db, handlers, { workerId: 'w', now: () => now });
      expect(r).toEqual(
        attempt < 3 ? { succeeded: 0, retried: 1, dead: 0 } : { succeeded: 0, retried: 0, dead: 1 },
      );
      now = new Date(now.getTime() + jobRetryDelayMs(attempt));
    }
    const job = await db.job.findFirstOrThrow();
    expect(job).toMatchObject({ status: 'DEAD', attempts: 3, lastError: 'boom for a***@uw.edu' });
    expect(await db.auditLog.count({ where: { action: 'job.dead' } })).toBe(1);
  });

  it('runs handlers with their payload and completes them', async () => {
    await enqueue(db, { name: 'hello', key: 'hello', runAt: T0, payload: { who: 'smc' } });
    const seen: unknown[] = [];
    const r = await runDueJobs(
      db,
      { hello: async (p) => void seen.push(p) },
      { workerId: 'w', now: () => T0 },
    );
    expect(r.succeeded).toBe(1);
    expect(seen).toEqual([{ who: 'smc' }]);
    expect((await db.job.findFirstOrThrow()).status).toBe('SUCCEEDED');
  });

  it('fails unknown job names loudly', async () => {
    await enqueue(db, { name: 'nope', key: 'nope', runAt: T0, maxAttempts: 1 });
    expect((await runDueJobs(db, {}, { workerId: 'w', now: () => T0 })).dead).toBe(1);
  });

  it('releases jobs whose worker disappeared', async () => {
    await enqueue(db, { name: 'n', key: 'n', runAt: T0 });
    await claimNext(db, 'w-dead', T0);
    expect(await releaseStaleJobs(db, new Date(T0.getTime() + JOB_LEASE_MS - 1))).toBe(0);
    expect(await releaseStaleJobs(db, new Date(T0.getTime() + JOB_LEASE_MS + 1))).toBe(1);
    expect((await claimNext(db, 'w2', new Date(T0.getTime() + JOB_LEASE_MS + 1)))?.lockedBy).toBe(
      'w2',
    );
  });
});
