import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, Prisma, type PrismaClient } from './index';

const url = process.env.TEST_DATABASE_URL;

/** Child tables first. */
const TABLES = [
  'jobs',
  'mailgun_webhook_events',
  'digest_deliveries',
  'digest_batches',
  'weekly_digests',
  'digest_settings',
  'news_openings',
  'news_posts',
  'audit_logs',
  'survey_answers',
  'survey_responses',
  'survey_questions',
  'surveys',
  'attendance',
  'registrations',
  'events',
  'sessions',
  'magic_link_tokens',
  'members',
];

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

describe.skipIf(!url)('digest schema constraints', () => {
  let db: PrismaClient;
  beforeAll(() => {
    if (!new URL(url!).pathname.endsWith('_test')) throw new Error('not a test database');
    db = createPrismaClient(url!);
  });
  beforeEach(async () => {
    for (const t of TABLES) await db.$executeRawUnsafe(`DELETE FROM \`${t}\``);
  });
  afterAll(() => db.$disconnect());

  const digestData = (weekKey: string) => ({
    weekKey,
    windowStart: new Date('2026-10-19T15:00:00Z'),
    windowEnd: new Date('2026-10-26T15:00:00Z'),
    sendNotBefore: new Date('2026-10-26T16:00:00Z'),
    expiresAt: new Date('2026-10-27T01:00:00Z'),
    runId: 'run-test',
  });

  async function member(email = `m${Math.random().toString(36).slice(2)}@uw.edu`) {
    return db.member.create({ data: { email, firstName: 'T', lastName: 'M' } });
  }

  it('allows exactly one digest per week', async () => {
    await db.weeklyDigest.create({ data: digestData('2026-10-26') });
    await expect(db.weeklyDigest.create({ data: digestData('2026-10-26') })).rejects.toSatisfy(
      isUniqueViolation,
    );
    await db.weeklyDigest.create({ data: digestData('2026-11-02') });
  });

  it('never reuses an issue number', async () => {
    await db.weeklyDigest.create({ data: { ...digestData('2026-10-26'), issueNumber: 7 } });
    await expect(
      db.weeklyDigest.create({ data: { ...digestData('2026-11-02'), issueNumber: 7 } }),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it('allows one delivery per member per week, even across digest rows', async () => {
    const m = await member();
    const d1 = await db.weeklyDigest.create({ data: digestData('2026-10-26') });
    const d2 = await db.weeklyDigest.create({ data: digestData('2026-11-02') });
    const delivery = (digestId: string, weekKey: string, key: string) => ({
      digestId,
      memberId: m.id,
      weekKey,
      idempotencyKey: key,
    });

    await db.digestDelivery.create({ data: delivery(d1.id, '2026-10-26', 'digest:2026-10-26:a') });
    // Same digest + member under a different key.
    await expect(
      db.digestDelivery.create({ data: delivery(d1.id, '2026-10-26', 'digest:2026-10-26:b') }),
    ).rejects.toSatisfy(isUniqueViolation);
    // Same week + member via another digest row (e.g. a bug that re-created the week).
    await expect(
      db.digestDelivery.create({ data: delivery(d2.id, '2026-10-26', 'digest:2026-10-26:c') }),
    ).rejects.toSatisfy(isUniqueViolation);
    // Same idempotency key.
    await expect(
      db.digestDelivery.create({ data: delivery(d2.id, '2026-11-02', 'digest:2026-10-26:a') }),
    ).rejects.toSatisfy(isUniqueViolation);
    // Next week is fine.
    await db.digestDelivery.create({ data: delivery(d2.id, '2026-11-02', 'digest:2026-11-02:a') });
  });

  it('createMany with skipDuplicates makes re-queuing recipients a no-op', async () => {
    const [a, b] = await Promise.all([member(), member()]);
    const d = await db.weeklyDigest.create({ data: digestData('2026-10-26') });
    const rows = [a, b].map((m) => ({
      digestId: d.id,
      memberId: m.id,
      weekKey: '2026-10-26',
      idempotencyKey: `digest:2026-10-26:${m.id}`,
    }));
    expect((await db.digestDelivery.createMany({ data: rows, skipDuplicates: true })).count).toBe(
      2,
    );
    expect((await db.digestDelivery.createMany({ data: rows, skipDuplicates: true })).count).toBe(
      0,
    );
    expect(await db.digestDelivery.count()).toBe(2);
  });

  it('numbers batches uniquely within a digest', async () => {
    const d = await db.weeklyDigest.create({ data: digestData('2026-10-26') });
    await db.digestBatch.create({ data: { digestId: d.id, batchNo: 1, recipientCount: 1000 } });
    await expect(
      db.digestBatch.create({ data: { digestId: d.id, batchNo: 1, recipientCount: 5 } }),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it('rejects replayed webhook tokens and re-delivered event ids', async () => {
    const base = { eventType: 'delivered', payload: {}, receivedAt: new Date() };
    await db.mailgunWebhookEvent.create({ data: { ...base, signatureToken: 't1', eventId: 'e1' } });
    await expect(
      db.mailgunWebhookEvent.create({ data: { ...base, signatureToken: 't1', eventId: 'e2' } }),
    ).rejects.toSatisfy(isUniqueViolation);
    await expect(
      db.mailgunWebhookEvent.create({ data: { ...base, signatureToken: 't2', eventId: 'e1' } }),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it('enqueues a job key only once', async () => {
    const job = {
      name: 'digest.create-draft',
      jobKey: 'digest.create-draft:2026-10-26',
      payload: { weekKey: '2026-10-26' },
      runAt: new Date('2026-10-26T15:00:00Z'),
    };
    await db.job.create({ data: job });
    await expect(db.job.create({ data: job })).rejects.toSatisfy(isUniqueViolation);
  });

  it('stores structured recruiting openings in order', async () => {
    const author = await member();
    const post = await db.newsPost.create({
      data: {
        slug: 'join-the-smc-team',
        tag: 'NOW RECRUITING',
        title: 'Join the SMC team',
        summary: 'SMC is growing. Help create experiences that connect students.',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-10-21T18:00:00Z'),
        applyEmail: 'smcommittee@uw.edu',
        applyChecklist: ['Your resume', 'The role you’re interested in'],
        createdById: author.id,
        openings: {
          create: [
            { position: 1, title: 'Finance Officers', openings: 2 },
            { position: 2, title: 'Operations', openings: 1 },
          ],
        },
      },
      include: { openings: { orderBy: { position: 'asc' } } },
    });
    expect(post.openings.map((o) => [o.title, o.openings])).toEqual([
      ['Finance Officers', 2],
      ['Operations', 1],
    ]);
    await expect(
      db.newsOpening.create({ data: { newsPostId: post.id, position: 1, title: 'Dup' } }),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it('keeps digest settings to a single row', async () => {
    await db.digestSettings.create({ data: {} });
    await expect(db.digestSettings.create({ data: {} })).rejects.toSatisfy(isUniqueViolation);
  });
});
