import { verifyToken } from '@smc/core';
import { createPrismaClient, type PrismaClient } from '@smc/db';
import { assertTestDatabase, resetDatabase } from '@smc/db/testing';
import { recipientGuard, type BatchMessage, type SendOutcome } from '@smc/email';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  markStaleSendingUnknown,
  MAX_BATCH_ATTEMPTS,
  prepareBatches,
  reconcileUnknownBatch,
  RETRY_DELAYS_MS,
  sendBatch,
  type DigestTransport,
  type SendDeps,
} from './send';

const url = process.env.TEST_DATABASE_URL;
const SECRET = 'test-link-signing-secret-0123456789abcdef';
const T0 = new Date('2026-10-26T16:00:00Z'); // Mon 09:00 PDT

/** Records every batch and answers with scripted outcomes. */
class FakeTransport implements DigestTransport {
  sent: BatchMessage[] = [];
  outcomes: SendOutcome[] = [];
  accepted = new Set<string>();
  async sendBatch(msg: BatchMessage): Promise<SendOutcome> {
    this.sent.push(msg);
    return this.outcomes.shift() ?? { kind: 'sent', messageId: `<m${this.sent.length}@mg>` };
  }
  async acceptedDeliveryIds(): Promise<Set<string>> {
    return this.accepted;
  }
}

describe.skipIf(!url)('digest sending', () => {
  let db: PrismaClient;
  let transport: FakeTransport;
  let now: Date;
  let seq = 0;

  beforeAll(() => {
    assertTestDatabase(url!);
    db = createPrismaClient(url!);
  });
  beforeEach(async () => {
    await resetDatabase(db);
    transport = new FakeTransport();
    now = T0;
  });
  afterAll(() => db.$disconnect());

  const deps = (over: Partial<SendDeps> = {}): SendDeps => ({
    db,
    transport,
    guard: recipientGuard('production', []),
    from: 'Specialty Masters Club <news@mail.smc.example>',
    replyTo: 'smcommittee@uw.edu',
    appBaseUrl: 'https://smc.example',
    apiBaseUrl: 'https://api.smc.example',
    linkSigningSecret: SECRET,
    now: () => now,
    runId: 'run-test',
    ...over,
  });

  async function members(n: number, over: Record<string, unknown> = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      seq += 1;
      out.push(
        await db.member.create({
          data: {
            email: `m${seq}@uw.edu`,
            firstName: `Mem<${seq}>`,
            lastName: 'T',
            newsOptIn: true,
            emailVerifiedAt: new Date('2026-09-01T00:00:00Z'),
            ...over,
          },
        }),
      );
    }
    return out;
  }

  async function sendingDigest() {
    return db.weeklyDigest.create({
      data: {
        weekKey: '2026-10-26',
        status: 'SENDING',
        issueNumber: 1,
        windowStart: new Date('2026-10-19T15:00:00Z'),
        windowEnd: new Date('2026-10-26T15:00:00Z'),
        sendNotBefore: T0,
        expiresAt: new Date('2026-10-27T01:00:00Z'),
        subject: 'This week at SMC · Oct 26',
        html: '<p>Hi %recipient.first_name_html%</p><a href="%recipient.unsub_url%">Unsubscribe</a>',
        text: 'Hi %recipient.first_name%\nUnsubscribe: %recipient.unsub_url%',
        runId: 'run-test',
      },
    });
  }

  async function onlyBatch(digestId: string) {
    return db.digestBatch.findFirstOrThrow({ where: { digestId } });
  }

  describe('prepareBatches', () => {
    it('snapshots eligible recipients into ≤N batches, idempotently', async () => {
      await members(5);
      await members(1, { newsOptIn: false });
      await members(1, { emailVerifiedAt: null });
      const digest = await sendingDigest();

      expect(await prepareBatches(db, digest, 2)).toEqual({ deliveries: 5, batches: 3 });
      expect(await prepareBatches(db, digest, 2)).toEqual({ deliveries: 5, batches: 3 });
      const batches = await db.digestBatch.findMany({ orderBy: { batchNo: 'asc' } });
      expect(batches.map((b) => [b.batchNo, b.recipientCount])).toEqual([
        [1, 2],
        [2, 2],
        [3, 1],
      ]);
      const keys = (await db.digestDelivery.findMany()).map((d) => d.idempotencyKey);
      expect(keys.every((k) => /^digest:2026-10-26:/.test(k))).toBe(true);
    });
  });

  describe('sendBatch', () => {
    it('sends one Mailgun batch with tag, ids, signed unsubscribe links and one-click headers', async () => {
      const [a, b] = await members(2);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      const batch = await onlyBatch(digest.id);

      const result = await sendBatch(deps(), batch.id);
      expect(result).toMatchObject({ kind: 'sent', sent: 2, skipped: 0 });
      expect(transport.sent).toHaveLength(1);

      const msg = transport.sent[0]!;
      expect(msg.tag).toBe('weekly-digest');
      expect(msg.customVariables).toEqual({
        digest_id: digest.id,
        delivery_id: '%recipient.delivery_id%',
      });
      expect(msg.headers).toEqual({
        'List-Unsubscribe': '<%recipient.unsub_one_click_url%>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
      const va = msg.recipients.find((r) => r.email === a!.email)!.variables;
      expect(va.first_name).toBe(a!.firstName);
      expect(va.first_name_html).toBe(a!.firstName.replace('<', '&lt;').replace('>', '&gt;'));
      const delivery = await db.digestDelivery.findFirstOrThrow({ where: { memberId: a!.id } });
      expect(va.delivery_id).toBe(delivery.id);

      // Unsubscribe tokens are signed, member-bound and expire.
      const token = decodeURIComponent(new URL(va.unsub_one_click_url!).searchParams.get('t')!);
      expect(va.unsub_url).toBe(`https://smc.example/email/unsubscribe#t=${token}`);
      expect(verifyToken(SECRET, 'unsubscribe', token, now)).toEqual({ ok: true, subject: a!.id });
      expect(verifyToken(SECRET, 'unsubscribe', token, new Date('2027-01-01T00:00:00Z')).ok).toBe(
        false,
      );

      const statuses = await db.digestDelivery.findMany({
        select: { status: true, mailgunMessageId: true },
      });
      expect(statuses).toEqual([
        { status: 'SUBMITTED', mailgunMessageId: '<m1@mg>' },
        { status: 'SUBMITTED', mailgunMessageId: '<m1@mg>' },
      ]);
      expect((await onlyBatch(digest.id)).status).toBe('SUBMITTED');
      expect(b).toBeDefined();
    });

    it('never sends a batch twice, even when two workers race', async () => {
      await members(3);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      const batch = await onlyBatch(digest.id);

      const results = await Promise.all([sendBatch(deps(), batch.id), sendBatch(deps(), batch.id)]);
      expect(results.map((r) => r.kind).sort()).toEqual(['not_claimed', 'sent']);
      expect(transport.sent).toHaveLength(1);
      expect((await sendBatch(deps(), batch.id)).kind).toBe('not_claimed');
      expect(transport.sent).toHaveLength(1);
    });

    it('only sends while the digest is SENDING', async () => {
      await members(1);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      await db.weeklyDigest.update({ where: { id: digest.id }, data: { status: 'APPROVED' } });
      expect((await sendBatch(deps(), (await onlyBatch(digest.id)).id)).kind).toBe('not_claimed');
      expect(transport.sent).toHaveLength(0);
    });

    it('skips members who opted out or were suppressed after approval', async () => {
      const [stay, leave, bounced] = await members(3);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      await db.member.update({ where: { id: leave!.id }, data: { newsOptIn: false } });
      await db.member.update({
        where: { id: bounced!.id },
        data: { emailSuppressedReason: 'HARD_BOUNCE' },
      });

      const result = await sendBatch(deps(), (await onlyBatch(digest.id)).id);
      expect(result).toMatchObject({ kind: 'sent', sent: 1, skipped: 2 });
      expect(transport.sent[0]!.recipients.map((r) => r.email)).toEqual([stay!.email]);
      const skipped = await db.digestDelivery.findMany({ where: { status: 'SKIPPED' } });
      expect(skipped.map((d) => d.lastErrorMessage)).toEqual([
        'no_longer_eligible',
        'no_longer_eligible',
      ]);
    });

    it('outside production sends only to the allowlist', async () => {
      const [tester] = await members(1);
      await members(2);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      const guard = recipientGuard('staging', [tester!.email]);

      const result = await sendBatch(deps({ guard }), (await onlyBatch(digest.id)).id);
      expect(result).toMatchObject({ kind: 'sent', sent: 1, skipped: 2 });
      expect(transport.sent[0]!.recipients.map((r) => r.email)).toEqual([tester!.email]);
      expect(
        await db.digestDelivery.count({ where: { lastErrorMessage: 'not_allowlisted' } }),
      ).toBe(2);
    });

    it('marks the batch SKIPPED when nobody is left, without calling Mailgun', async () => {
      await members(2);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      const result = await sendBatch(
        deps({ guard: recipientGuard('staging', []) }),
        (await onlyBatch(digest.id)).id,
      );
      expect(result).toEqual({ kind: 'skipped', skipped: 2 });
      expect(transport.sent).toHaveLength(0);
      expect((await onlyBatch(digest.id)).status).toBe('SKIPPED');
    });

    it('retries transient failures with exponential backoff, then gives up', async () => {
      await members(2);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      const batchId = (await onlyBatch(digest.id)).id;
      transport.outcomes = Array.from({ length: MAX_BATCH_ATTEMPTS }, () => ({
        kind: 'transient' as const,
        status: 503,
        error: 'Service Unavailable for m1@uw.edu',
      }));

      for (let attempt = 1; attempt < MAX_BATCH_ATTEMPTS; attempt++) {
        const r = await sendBatch(deps(), batchId);
        expect(r).toMatchObject({ kind: 'retry_scheduled', attempt });
        const expected = new Date(now.getTime() + RETRY_DELAYS_MS[attempt - 1]!);
        expect((r as { nextAttemptAt: Date }).nextAttemptAt).toEqual(expected);
        // Not due yet: nothing happens.
        expect((await sendBatch(deps(), batchId)).kind).toBe('not_claimed');
        now = expected;
      }
      const final = await sendBatch(deps(), batchId);
      expect(final.kind).toBe('failed');
      expect(transport.sent).toHaveLength(MAX_BATCH_ATTEMPTS);

      const batch = await onlyBatch(digest.id);
      expect(batch).toMatchObject({ status: 'FAILED', attempts: MAX_BATCH_ATTEMPTS });
      expect(batch.lastError).toBe('Service Unavailable for m***@uw.edu'); // masked
      const deliveries = await db.digestDelivery.findMany();
      expect(deliveries.every((d) => d.status === 'FAILED' && d.lastErrorCode === '503')).toBe(
        true,
      );
    });

    it('fails permanently on non-retryable errors', async () => {
      await members(1);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      transport.outcomes = [{ kind: 'permanent', status: 401, error: 'Forbidden' }];
      expect((await sendBatch(deps(), (await onlyBatch(digest.id)).id)).kind).toBe('failed');
      expect(transport.sent).toHaveLength(1);
      expect(await db.auditLog.count({ where: { action: 'digest.batch.failed' } })).toBe(1);
    });
  });

  describe('unknown outcomes', () => {
    it('reconciles before resending: accepted rows are kept, only the rest go again', async () => {
      await members(3);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      const batchId = (await onlyBatch(digest.id)).id;
      transport.outcomes = [{ kind: 'unknown', error: 'request timed out' }];
      expect((await sendBatch(deps(), batchId)).kind).toBe('unknown');

      // Never retried blindly.
      expect((await sendBatch(deps(), batchId)).kind).toBe('not_claimed');
      expect((await reconcileUnknownBatch(deps(), batchId)).kind).toBe('too_soon');

      const deliveries = await db.digestDelivery.findMany({ orderBy: { id: 'asc' } });
      transport.accepted = new Set([deliveries[0]!.id, deliveries[1]!.id]);
      now = new Date(T0.getTime() + 11 * 60_000);
      expect(await reconcileUnknownBatch(deps(), batchId)).toEqual({
        kind: 'settled',
        accepted: 2,
        requeued: 1,
      });

      expect((await sendBatch(deps(), batchId)).kind).toBe('sent');
      expect(transport.sent.at(-1)!.recipients.map((r) => r.email)).toEqual([
        (await db.member.findUniqueOrThrow({ where: { id: deliveries[2]!.memberId } })).email,
      ]);
      expect(await db.digestDelivery.count({ where: { status: 'SUBMITTED' } })).toBe(3);
    });

    it('settles fully when Mailgun accepted everyone', async () => {
      await members(2);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      const batchId = (await onlyBatch(digest.id)).id;
      transport.outcomes = [{ kind: 'unknown', error: 'socket hang up' }];
      await sendBatch(deps(), batchId);
      transport.accepted = new Set((await db.digestDelivery.findMany()).map((d) => d.id));
      now = new Date(T0.getTime() + 11 * 60_000);
      expect(await reconcileUnknownBatch(deps(), batchId)).toEqual({
        kind: 'settled',
        accepted: 2,
        requeued: 0,
      });
      expect((await onlyBatch(digest.id)).status).toBe('SUBMITTED');
      expect(transport.sent).toHaveLength(1);
    });

    it('turns batches stuck in SENDING into UNKNOWN', async () => {
      await members(1);
      const digest = await sendingDigest();
      await prepareBatches(db, digest);
      // Simulate a worker that claimed the batch and died before recording the result.
      await db.digestBatch.updateMany({
        data: { status: 'SENDING', nextAttemptAt: new Date(T0.getTime() + 15 * 60_000) },
      });
      expect(await markStaleSendingUnknown(db, new Date(T0.getTime() + 14 * 60_000))).toBe(0);
      expect(await markStaleSendingUnknown(db, new Date(T0.getTime() + 16 * 60_000))).toBe(1);
      expect((await onlyBatch(digest.id)).status).toBe('UNKNOWN');
    });
  });
});
