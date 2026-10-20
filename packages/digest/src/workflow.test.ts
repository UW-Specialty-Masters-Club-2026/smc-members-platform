import { parsePtLocal } from '@smc/core/time';
import { createPrismaClient, type PrismaClient } from '@smc/db';
import { assertTestDatabase, resetDatabase } from '@smc/db/testing';
import { MemoryMailer, recipientGuard, type BatchMessage, type SendOutcome } from '@smc/email';
import { runDueJobs } from '@smc/jobs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nextRuns } from './cron';
import type { DigestTransport } from './send';
import {
  approveDigest,
  createDraft,
  digestJobHandlers,
  notifyAdminsJobDead,
  rejectDigest,
  tick,
  type WorkflowDeps,
} from './workflow';

const url = process.env.TEST_DATABASE_URL;
const z = (iso: string) => new Date(iso);

class FakeTransport implements DigestTransport {
  sent: BatchMessage[] = [];
  outcomes: SendOutcome[] = [];
  async sendBatch(msg: BatchMessage): Promise<SendOutcome> {
    this.sent.push(msg);
    return this.outcomes.shift() ?? { kind: 'sent', messageId: `<m${this.sent.length}@mg>` };
  }
  async acceptedDeliveryIds() {
    return new Set<string>();
  }
}

describe('digest schedules are wall-clock Pacific Time (croner)', () => {
  it('fires Monday 08:00 / 09:00 / 18:00 PT across the November DST change', () => {
    const from = z('2026-10-27T00:00:00Z');
    expect(nextRuns('0 8 * * 1', from, 2).map((d) => d.toISOString())).toEqual([
      '2026-11-02T16:00:00.000Z', // 08:00 PST
      '2026-11-09T16:00:00.000Z',
    ]);
    expect(nextRuns('0 9 * * 1', from, 1)[0]!.toISOString()).toBe('2026-11-02T17:00:00.000Z');
    // (From Oct 27 00:00Z, the Oct 26 18:00 PDT run = Oct 27 01:00Z is still ahead.)
    expect(nextRuns('0 18 * * 1', z('2026-10-28T00:00:00Z'), 1)[0]!.toISOString()).toBe(
      '2026-11-03T02:00:00.000Z', // 18:00 PST
    );
    // The week before is still PDT.
    expect(nextRuns('0 8 * * 1', z('2026-10-20T00:00:00Z'), 1)[0]!.toISOString()).toBe(
      '2026-10-26T15:00:00.000Z',
    );
  });

  it('fires Monday 08:00 PT across the March DST change', () => {
    expect(nextRuns('0 8 * * 1', z('2027-03-09T00:00:00Z'), 2).map((d) => d.toISOString())).toEqual(
      [
        '2027-03-15T15:00:00.000Z', // 08:00 PDT
        '2027-03-22T15:00:00.000Z',
      ],
    );
  });
});

describe.skipIf(!url)('weekly digest workflow (fake clock)', () => {
  let db: PrismaClient;
  let transport: FakeTransport;
  let mailer: MemoryMailer;
  let now: Date;
  let seq = 0;
  let adminId: string;

  beforeAll(() => {
    assertTestDatabase(url!);
    db = createPrismaClient(url!);
  });
  beforeEach(async () => {
    await resetDatabase(db);
    transport = new FakeTransport();
    mailer = new MemoryMailer();
    now = z('2026-10-30T12:00:00Z');
    adminId = (await member({ email: 'admin@uw.edu', role: 'ADMIN', newsOptIn: false })).id;
  });
  afterAll(() => db.$disconnect());

  const makeDeps = (runId = 'run-test'): WorkflowDeps => ({
    db,
    transport,
    guard: recipientGuard('production', []),
    from: 'Specialty Masters Club <news@mail.smc.example>',
    replyTo: 'smcommittee@uw.edu',
    appBaseUrl: 'https://smc.example',
    apiBaseUrl: 'https://api.smc.example',
    linkSigningSecret: 'test-link-signing-secret-0123456789abcdef',
    now: () => now,
    runId,
    mailer,
    lookaheadDays: 21,
  });

  /**
   * What the worker does within one minute at a fixed clock: tick, drain the job queue,
   * and repeat until a tick finds nothing new (the real worker ticks every minute).
   */
  async function workerCycle() {
    for (let i = 0; i < 10; i++) {
      const t = await tick(makeDeps());
      const jobs = await runDueJobs(db, digestJobHandlers(makeDeps), {
        workerId: 'w1',
        now: () => now,
      });
      if (t.enqueued === 0 && t.finalized === 0 && jobs.succeeded + jobs.retried + jobs.dead === 0)
        return;
    }
    throw new Error('worker cycle did not settle');
  }

  async function member(over: Record<string, unknown> = {}) {
    seq += 1;
    return db.member.create({
      data: {
        email: `m${seq}@uw.edu`,
        firstName: `M${seq}`,
        lastName: 'T',
        newsOptIn: true,
        emailVerifiedAt: z('2026-09-01T00:00:00Z'),
        ...over,
      },
    });
  }

  async function upcomingEvent(startsAtPt: string) {
    seq += 1;
    return db.event.create({
      data: {
        slug: `e-${seq}`,
        title: `Event ${seq}`,
        summary: 'Something worth attending.',
        startsAt: parsePtLocal(startsAtPt),
        location: 'PACCAR Hall 192 · UW Seattle',
        status: 'PUBLISHED',
        capacity: 30,
        createdById: adminId,
      },
    });
  }

  const digestFor = (weekKey: string) => db.weeklyDigest.findUnique({ where: { weekKey } });
  const subjects = () => mailer.sent.map((m) => m.subject.split(' · ')[0]);

  describe('DST week (first Monday of PST, 2026-11-02)', () => {
    const WEEK = '2026-11-02';

    beforeEach(async () => {
      await member();
      await member();
      await upcomingEvent('2026-11-04T18:00');
    });

    it('does not draft at 07:00 PST (= 15:00 UTC, where a UTC-hard-coded cron would fire)', async () => {
      now = z('2026-11-02T15:30:00Z');
      await workerCycle();
      expect(await digestFor(WEEK)).toBeNull();
    });

    it('drafts at 08:00 PST, asks admins, then sends only after approval and 09:00 PST', async () => {
      now = z('2026-11-02T16:00:00Z'); // 08:00 PST
      await workerCycle();
      const draft = (await digestFor(WEEK))!;
      expect(draft).toMatchObject({
        status: 'PENDING_APPROVAL',
        recipientCountPreview: 2,
        sendNotBefore: z('2026-11-02T17:00:00Z'),
        expiresAt: z('2026-11-03T02:00:00Z'),
        windowStart: z('2026-10-26T15:00:00Z'),
      });
      expect(draft.html).toContain('Mon');
      expect(subjects()).toEqual(['Weekly digest ready for approval']);
      expect(mailer.sent[0]!.to).toBe('admin@uw.edu');

      // Unapproved: nothing is sent, even after 09:00.
      now = z('2026-11-02T17:30:00Z');
      await workerCycle();
      expect(transport.sent).toHaveLength(0);

      // Approved at 09:45 PST; the next cycle sends.
      now = z('2026-11-02T17:45:00Z');
      expect(await approveDigest(makeDeps(), draft.id, adminId, draft.version)).toEqual({
        kind: 'approved',
        issueNumber: 1,
      });
      await workerCycle();
      expect(transport.sent).toHaveLength(1);
      expect(transport.sent[0]!.recipients).toHaveLength(2);
      expect(transport.sent[0]!.html).toContain('ISSUE 1');
      expect((await digestFor(WEEK))!.status).toBe('SENT');
      expect(subjects()).toContain('Weekly digest sent');
    });

    it('holds an issue approved before 09:00 PST until the send gate opens', async () => {
      now = z('2026-11-02T16:00:00Z');
      await workerCycle();
      const draft = (await digestFor(WEEK))!;
      now = z('2026-11-02T16:30:00Z'); // 08:30 PST
      await approveDigest(makeDeps(), draft.id, adminId, draft.version);
      now = z('2026-11-02T16:59:00Z'); // 08:59 PST
      await workerCycle();
      expect(transport.sent).toHaveLength(0);
      expect((await digestFor(WEEK))!.status).toBe('APPROVED');
      now = z('2026-11-02T17:00:00Z'); // 09:00 PST
      await workerCycle();
      expect(transport.sent).toHaveLength(1);
    });

    it('expires at 18:00 PST without sending', async () => {
      now = z('2026-11-02T16:00:00Z');
      await workerCycle();
      const draft = (await digestFor(WEEK))!;
      now = z('2026-11-03T01:59:00Z'); // 17:59 PST
      await workerCycle();
      expect((await digestFor(WEEK))!.status).toBe('PENDING_APPROVAL');
      now = z('2026-11-03T02:00:00Z'); // 18:00 PST
      await workerCycle();
      expect((await digestFor(WEEK))!.status).toBe('EXPIRED');
      expect(subjects()).toContain('Weekly digest expired without approval');
      expect(await approveDigest(makeDeps(), draft.id, adminId, draft.version + 1)).toEqual({
        kind: 'not_pending',
        status: 'EXPIRED',
      });
      expect(transport.sent).toHaveLength(0);
      expect(await db.digestDelivery.count()).toBe(0);
    });
  });

  it('works the same in the March DST week (2027-03-15, PDT again)', async () => {
    await member();
    await upcomingEvent('2027-03-17T18:00');
    now = z('2027-03-15T14:59:00Z'); // 07:59 PDT
    await workerCycle();
    expect(await digestFor('2027-03-15')).toBeNull();
    now = z('2027-03-15T15:00:00Z'); // 08:00 PDT
    await workerCycle();
    expect((await digestFor('2027-03-15'))!.sendNotBefore).toEqual(z('2027-03-15T16:00:00Z'));
  });

  describe('exactly-once', () => {
    it('double approval and repeated worker runs still send one email per member', async () => {
      await member();
      await member();
      await member();
      await upcomingEvent('2026-10-28T18:00');
      now = z('2026-10-26T15:00:00Z');
      await workerCycle();
      const draft = (await digestFor('2026-10-26'))!;

      now = z('2026-10-26T16:05:00Z');
      const results = await Promise.all([
        approveDigest(makeDeps(), draft.id, adminId, draft.version),
        approveDigest(makeDeps(), draft.id, adminId, draft.version),
      ]);
      expect(results.map((r) => r.kind).sort()).toEqual(['already_approved', 'approved']);

      for (let i = 0; i < 4; i++) await workerCycle();
      expect(transport.sent).toHaveLength(1);
      const rows = await db.digestDelivery.findMany();
      expect(rows).toHaveLength(3);
      expect(new Set(rows.map((r) => r.memberId)).size).toBe(3);
      expect(await db.weeklyDigest.count()).toBe(1);
      expect(await db.auditLog.count({ where: { action: 'digest.approved' } })).toBe(1);
    });

    it('rejects an approval based on an outdated preview', async () => {
      await member();
      await upcomingEvent('2026-10-28T18:00');
      now = z('2026-10-26T15:00:00Z');
      await workerCycle();
      const draft = (await digestFor('2026-10-26'))!;
      expect(await approveDigest(makeDeps(), draft.id, adminId, draft.version + 7)).toEqual({
        kind: 'stale_version',
      });
    });
  });

  it('never drafts while paused, and resumes when the pause ends', async () => {
    await member();
    await upcomingEvent('2026-10-28T18:00');
    await db.digestSettings.create({
      data: {
        id: 1,
        paused: true,
        pausedUntil: z('2026-11-01T07:00:00Z'),
        pausedReason: 'Fall break',
      },
    });
    now = z('2026-10-26T15:00:00Z');
    await workerCycle();
    expect(await digestFor('2026-10-26')).toBeNull();
    expect(await db.auditLog.count({ where: { action: 'digest.draft.paused' } })).toBe(1);

    await upcomingEvent('2026-11-04T18:00');
    now = z('2026-11-02T16:00:00Z');
    await workerCycle();
    expect((await digestFor('2026-11-02'))!.status).toBe('PENDING_APPROVAL');
  });

  it('skips an empty week, logs why and tells admins', async () => {
    await member();
    now = z('2026-10-26T15:00:00Z');
    await workerCycle();
    const digest = (await digestFor('2026-10-26'))!;
    expect(digest.status).toBe('SKIPPED');
    expect(digest.skipReason).toMatch(/No news/);
    expect(subjects()).toEqual(['Weekly digest skipped this week']);
    expect(await db.auditLog.count({ where: { action: 'digest.skipped' } })).toBe(1);
  });

  it('does not draft late if the worker was down all Monday', async () => {
    await member();
    await upcomingEvent('2026-10-30T18:00');
    now = z('2026-10-27T03:00:00Z'); // Mon 20:00 PDT, after the 18:00 deadline
    await workerCycle();
    expect(await digestFor('2026-10-26')).toBeNull();
    expect((await createDraft(makeDeps(), '2026-10-26')).kind).toBe('missed_window');
  });

  it('a rejected issue is never sent', async () => {
    await member();
    await upcomingEvent('2026-10-28T18:00');
    now = z('2026-10-26T15:00:00Z');
    await workerCycle();
    const draft = (await digestFor('2026-10-26'))!;
    expect(await rejectDigest(makeDeps(), draft.id, adminId, draft.version, 'Wrong room')).toBe(
      'rejected',
    );
    now = z('2026-10-26T17:00:00Z');
    await workerCycle();
    expect(transport.sent).toHaveLength(0);
    expect((await digestFor('2026-10-26'))!.status).toBe('REJECTED');
  });

  it('retries a transient Mailgun failure on a later tick, then completes', async () => {
    await member();
    await upcomingEvent('2026-10-28T18:00');
    now = z('2026-10-26T15:00:00Z');
    await workerCycle();
    const draft = (await digestFor('2026-10-26'))!;
    now = z('2026-10-26T16:00:00Z');
    await approveDigest(makeDeps(), draft.id, adminId, draft.version);
    transport.outcomes = [{ kind: 'transient', status: 503, error: 'unavailable' }];
    await workerCycle();
    expect((await digestFor('2026-10-26'))!.status).toBe('SENDING');

    now = z('2026-10-26T16:01:00Z'); // first back-off is 1 minute
    await workerCycle();
    expect(transport.sent).toHaveLength(2);
    expect((await digestFor('2026-10-26'))!.status).toBe('SENT');
  });

  it('alerts admins about a dead job without leaking addresses', async () => {
    await notifyAdminsJobDead(
      makeDeps('job-9-dead'),
      { id: 9n, name: 'digest.send-batch', jobKey: 'digest.send-batch:b1:5', attempts: 5 },
      'Mailgun said: mia@uw.edu rejected',
    );
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.subject).toMatch(/^Background job failed/);
    expect(mailer.sent[0]!.text).toContain('m***@uw.edu rejected');
    expect(mailer.sent[0]!.text).not.toContain('mia@uw.edu');
    expect(mailer.sent[0]!.text).toContain('/admin/audit?entityType=job&entityId=9');
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'admin.notified' } });
    expect(audit).toMatchObject({ entityType: 'job', entityId: '9', runId: 'job-9-dead' });
  });

  it('marks the issue PARTIALLY_FAILED on a permanent failure and alerts admins', async () => {
    await member();
    await upcomingEvent('2026-10-28T18:00');
    now = z('2026-10-26T15:00:00Z');
    await workerCycle();
    const draft = (await digestFor('2026-10-26'))!;
    now = z('2026-10-26T16:00:00Z');
    await approveDigest(makeDeps(), draft.id, adminId, draft.version);
    transport.outcomes = [{ kind: 'permanent', status: 400, error: 'bad request' }];
    await workerCycle();
    expect((await digestFor('2026-10-26'))!.status).toBe('PARTIALLY_FAILED');
    expect(subjects()).toContain('Weekly digest sent with failures');
  });
});
