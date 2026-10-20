import { randomBytes } from 'node:crypto';
import { signMailgunWebhook } from '@smc/email';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createHarness,
  hasTestDb,
  signedInMember,
  TEST_WEBHOOK_KEY,
  type TestHarness,
} from '../test/harness';

const NOW = new Date('2026-10-26T16:30:00Z');

describe.skipIf(!hasTestDb)('Mailgun webhooks', () => {
  let h: TestHarness;
  let member: Awaited<ReturnType<typeof signedInMember>>['member'];
  let deliveryId: string;

  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(async () => {
    await h.reset();
    h.setNow(NOW);
    member = (await signedInMember(h, { email: 'mia@uw.edu', newsOptIn: true })).member;
    const digest = await h.prisma.weeklyDigest.create({
      data: {
        weekKey: '2026-10-26',
        status: 'SENT',
        windowStart: new Date('2026-10-19T15:00:00Z'),
        windowEnd: new Date('2026-10-26T15:00:00Z'),
        sendNotBefore: new Date('2026-10-26T16:00:00Z'),
        expiresAt: new Date('2026-10-27T01:00:00Z'),
        runId: 'r',
      },
    });
    deliveryId = (
      await h.prisma.digestDelivery.create({
        data: {
          digestId: digest.id,
          memberId: member.id,
          weekKey: digest.weekKey,
          idempotencyKey: `digest:${digest.weekKey}:${member.id}`,
          status: 'SUBMITTED',
          mailgunMessageId: '<m1@mg>',
        },
      })
    ).id;
  });
  afterAll(() => h.close());

  function signed(
    eventData: Record<string, unknown>,
    opts: { key?: string; at?: Date; token?: string } = {},
  ) {
    const timestamp = String(Math.floor((opts.at ?? NOW).getTime() / 1000));
    const token = opts.token ?? randomBytes(25).toString('hex');
    return {
      signature: {
        timestamp,
        token,
        signature: signMailgunWebhook(opts.key ?? TEST_WEBHOOK_KEY, timestamp, token),
      },
      'event-data': eventData,
    };
  }

  const event = (event: string, extra: Record<string, unknown> = {}) => ({
    id: `evt-${randomBytes(6).toString('hex')}`,
    event,
    recipient: 'mia@uw.edu',
    timestamp: NOW.getTime() / 1000,
    tags: ['weekly-digest'],
    'user-variables': { digest_id: 'd', delivery_id: deliveryId },
    ...extra,
  });

  // Mailgun calls without a browser Origin; the route must not require one.
  const post = (body: object) => request(h.app).post('/webhooks/mailgun').send(body);
  const delivery = () => h.prisma.digestDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  const fresh = () => h.prisma.member.findUniqueOrThrow({ where: { id: member.id } });

  it('rejects forged signatures and stores nothing', async () => {
    const res = await post(signed(event('complained'), { key: 'attacker-guessed-key-123' }));
    expect(res.status).toBe(401);
    expect(await h.prisma.mailgunWebhookEvent.count()).toBe(0);
    expect((await fresh()).newsOptIn).toBe(true);
    expect(await h.prisma.auditLog.count({ where: { action: 'mailgun.webhook.rejected' } })).toBe(
      1,
    );
  });

  it('rejects stale timestamps', async () => {
    const res = await post(
      signed(event('delivered'), { at: new Date(NOW.getTime() - 10 * 60_000) }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects a replayed signature carrying a different event', async () => {
    const token = randomBytes(25).toString('hex');
    expect((await post(signed(event('delivered'), { token }))).status).toBe(200);
    const replay = await post(signed(event('complained'), { token }));
    expect(replay.status).toBe(403);
    expect((await fresh()).newsOptIn).toBe(true);
  });

  it('applies an event once even if Mailgun delivers it again', async () => {
    const e = event('delivered');
    expect((await post(signed(e))).body).toEqual({ status: 'ok' });
    expect((await post(signed(e))).body).toEqual({ status: 'duplicate' });
    expect((await delivery()).status).toBe('DELIVERED');
    expect(await h.prisma.auditLog.count({ where: { action: 'mailgun.delivered' } })).toBe(1);
  });

  it('records a permanent bounce and switches news off', async () => {
    await post(
      signed(
        event('failed', {
          severity: 'permanent',
          reason: 'bounce',
          'delivery-status': { code: 550, message: '5.1.1 mia@uw.edu: user unknown' },
        }),
      ),
    );
    expect(await delivery()).toMatchObject({
      status: 'FAILED',
      lastErrorCode: '550',
      lastErrorMessage: '5.1.1 m***@uw.edu: user unknown',
    });
    expect(await fresh()).toMatchObject({ newsOptIn: false, emailSuppressedReason: 'HARD_BOUNCE' });
    const audit = await h.prisma.auditLog.findFirstOrThrow({
      where: { action: 'member.news_opt_in.changed' },
    });
    expect(audit).toMatchObject({ actorType: 'WEBHOOK' });
  });

  it('keeps a temporary failure retryable without touching preferences', async () => {
    await post(
      signed(event('failed', { severity: 'temporary', 'delivery-status': { code: 421 } })),
    );
    expect((await delivery()).status).toBe('TEMP_FAILED');
    expect((await fresh()).newsOptIn).toBe(true);
  });

  it('treats complaints and unsubscribes as opt-outs', async () => {
    await post(signed(event('complained')));
    expect((await delivery()).status).toBe('COMPLAINED');
    expect(await fresh()).toMatchObject({ newsOptIn: false, emailSuppressedReason: 'COMPLAINED' });
  });

  it('never moves a delivery backwards', async () => {
    await post(signed(event('delivered')));
    await post(signed(event('failed', { severity: 'temporary' })));
    expect((await delivery()).status).toBe('DELIVERED');
  });

  it('honours bounces of non-digest mail by recipient address', async () => {
    await post(
      signed(event('failed', { severity: 'permanent', 'user-variables': {}, tags: ['auth'] })),
    );
    expect((await fresh()).emailSuppressedReason).toBe('HARD_BOUNCE');
  });

  it('ignores a delivery id that does not match the recipient', async () => {
    await post(signed(event('complained', { recipient: 'someone-else@uw.edu' })));
    expect((await delivery()).status).toBe('SUBMITTED');
    expect((await fresh()).newsOptIn).toBe(true);
  });

  it('acknowledges untracked events', async () => {
    const res = await post(signed(event('opened')));
    expect(res.body).toEqual({ status: 'ok' });
    expect((await delivery()).status).toBe('SUBMITTED');
  });

  it('stores only a masked copy of the payload', async () => {
    await post(signed(event('delivered')));
    const stored = await h.prisma.mailgunWebhookEvent.findFirstOrThrow();
    expect(JSON.stringify(stored.payload)).not.toContain('mia@uw.edu');
    expect(stored.processedAt).toEqual(NOW);
  });
});
