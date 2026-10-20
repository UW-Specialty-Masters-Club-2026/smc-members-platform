import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createHarness,
  hasTestDb,
  lastMagicLinkToken,
  WEB_ORIGIN,
  type TestHarness,
} from '../test/harness';
import { MAGIC_LINK_TTL_MINUTES, MAX_LINKS_PER_WINDOW } from './service';

describe.skipIf(!hasTestDb)('magic link auth', () => {
  let h: TestHarness;
  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  const post = (path: string, body: object) =>
    request(h.app).post(path).set('Origin', WEB_ORIGIN).send(body);

  const signupBody = {
    email: '  Jane.Doe@UW.edu ',
    firstName: 'Jane',
    lastName: 'Doe',
    newsOptIn: true,
  };

  it('signs up an unverified member with their news choice and emails a confirmation', async () => {
    const res = await post('/auth/signup', signupBody);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'check_email' });

    const member = await h.prisma.member.findUniqueOrThrow({ where: { email: 'jane.doe@uw.edu' } });
    expect(member.emailVerifiedAt).toBeNull();
    expect(member.newsOptIn).toBe(true);
    expect(member.newsOptInUpdatedAt).not.toBeNull();
    expect(member.role).toBe('MEMBER');

    expect(h.mailer.sent).toHaveLength(1);
    expect(h.mailer.sent[0]!.subject).toMatch(/Confirm your email/);
    expect(h.mailer.sent[0]!.tag).toBe('auth');

    const actions = (await h.prisma.auditLog.findMany()).map((a) => a.action);
    expect(actions).toEqual(['member.signup', 'auth.magic_link.sent']);
  });

  it('does not reveal or overwrite an existing account on repeat sign-up', async () => {
    await post('/auth/signup', signupBody);
    const res = await post('/auth/signup', {
      ...signupBody,
      firstName: 'Mallory',
      newsOptIn: false,
    });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'check_email' });

    const member = await h.prisma.member.findUniqueOrThrow({ where: { email: 'jane.doe@uw.edu' } });
    expect(member.firstName).toBe('Jane');
    expect(member.newsOptIn).toBe(true);
    expect(h.mailer.sent.at(-1)!.subject).toMatch(/sign-in link/);
  });

  it('answers the same for unknown addresses and sends nothing', async () => {
    const res = await post('/auth/magic-link', { email: 'nobody@uw.edu' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'check_email' });
    expect(h.mailer.sent).toHaveLength(0);
  });

  it('verifies the email, starts a session and lets the member read their profile', async () => {
    await post('/auth/signup', signupBody);
    const res = await post('/auth/verify', { token: lastMagicLinkToken(h.mailer) });
    expect(res.status).toBe(200);

    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^smc_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const me = await request(h.app).get('/me').set('Cookie', cookie.split(';')[0]!);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      email: 'jane.doe@uw.edu',
      emailVerified: true,
      newsOptIn: true,
    });
  });

  it('redeems a link only once, even under concurrent clicks', async () => {
    await post('/auth/signup', signupBody);
    const token = lastMagicLinkToken(h.mailer);
    const results = await Promise.all([
      post('/auth/verify', { token }),
      post('/auth/verify', { token }),
      post('/auth/verify', { token }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400]);
    expect(await h.prisma.session.count()).toBe(1);

    const again = await post('/auth/verify', { token });
    expect(again.status).toBe(400);
    expect(again.body).toEqual({ error: 'invalid_or_expired_link' });
  });

  it('rejects an expired link', async () => {
    await post('/auth/signup', signupBody);
    h.setNow(new Date(h.ctx.now().getTime() + (MAGIC_LINK_TTL_MINUTES + 1) * 60_000));
    const res = await post('/auth/verify', { token: lastMagicLinkToken(h.mailer) });
    expect(res.status).toBe(400);
    expect(await h.prisma.session.count()).toBe(0);
  });

  it('does not email inactive members', async () => {
    await post('/auth/signup', signupBody);
    await h.prisma.member.update({
      where: { email: 'jane.doe@uw.edu' },
      data: { status: 'INACTIVE' },
    });
    h.mailer.sent.length = 0;
    await post('/auth/magic-link', { email: 'jane.doe@uw.edu' });
    expect(h.mailer.sent).toHaveLength(0);
  });

  it(`caps links per address at ${MAX_LINKS_PER_WINDOW} per window`, async () => {
    await post('/auth/signup', signupBody); // 1st link
    for (let i = 0; i < MAX_LINKS_PER_WINDOW; i++) {
      await post('/auth/magic-link', { email: 'jane.doe@uw.edu' });
    }
    expect(h.mailer.sent).toHaveLength(MAX_LINKS_PER_WINDOW);
    const skipped = await h.prisma.auditLog.count({
      where: { action: 'auth.magic_link.rate_limited' },
    });
    expect(skipped).toBe(1);
  });

  it('logs out by revoking the session', async () => {
    await post('/auth/signup', signupBody);
    const res = await post('/auth/verify', { token: lastMagicLinkToken(h.mailer) });
    const cookie = res.headers['set-cookie']![0]!.split(';')[0]!;

    const out = await request(h.app)
      .post('/auth/logout')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie);
    expect(out.status).toBe(204);
    const me = await request(h.app).get('/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
  });

  it('keeps raw tokens and full email addresses out of logs and audit metadata', async () => {
    await post('/auth/signup', signupBody);
    const token = lastMagicLinkToken(h.mailer);
    await post('/auth/verify', { token });
    await post('/auth/verify', { token: 'x'.repeat(43) });

    const audit = JSON.stringify(await h.prisma.auditLog.findMany(), (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    const logs = h.logLines.join('');
    for (const text of [audit, logs]) {
      expect(text).not.toContain(token);
      expect(text).not.toContain('jane.doe@uw.edu');
    }
  });

  it('validates input', async () => {
    const res = await post('/auth/signup', { email: 'not-an-email', firstName: '', lastName: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.fields).toEqual(expect.arrayContaining(['email', 'firstName', 'newsOptIn']));
  });
});
