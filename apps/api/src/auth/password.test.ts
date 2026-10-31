import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createHarness,
  hasTestDb,
  lastMagicLinkToken,
  WEB_ORIGIN,
  type TestHarness,
} from '../test/harness';
import { MAX_PASSWORD_FAILURES } from './service';

const PASSWORD = 'purple-husky-2026';

describe.skipIf(!hasTestDb)('password sign-in', () => {
  let h: TestHarness;
  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  const post = (path: string, body: object, cookie?: string) => {
    const r = request(h.app).post(path).set('Origin', WEB_ORIGIN);
    return (cookie ? r.set('Cookie', cookie) : r).send(body);
  };
  const login = (email: string, password: string) => post('/auth/login', { email, password });

  async function signUpAndVerify() {
    await post('/auth/signup', {
      email: 'mia@uw.edu',
      firstName: 'Mia',
      lastName: 'C',
      newsOptIn: false,
      password: PASSWORD,
    });
    await post('/auth/verify', { token: lastMagicLinkToken(h.mailer) });
  }

  it('signs in with the password chosen at sign-up, once the email is confirmed', async () => {
    await post('/auth/signup', {
      email: 'mia@uw.edu',
      firstName: 'Mia',
      lastName: 'C',
      newsOptIn: false,
      password: PASSWORD,
    });
    const stored = await h.prisma.member.findUniqueOrThrow({ where: { email: 'mia@uw.edu' } });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain(PASSWORD);

    h.mailer.sent.length = 0;
    const early = await login('mia@uw.edu', PASSWORD);
    expect(early.body).toEqual({ error: 'email_not_verified' });
    expect(h.mailer.sent).toHaveLength(1); // confirmation link sent again

    await post('/auth/verify', { token: lastMagicLinkToken(h.mailer) });
    const ok = await login(' MIA@uw.edu ', PASSWORD);
    expect(ok.status).toBe(200);
    const cookie = ok.headers['set-cookie']![0]!.split(';')[0]!;
    const me = await request(h.app).get('/me').set('Cookie', cookie);
    expect(me.body).toMatchObject({ email: 'mia@uw.edu', hasPassword: true });
  });

  it('answers the same for a wrong password, an unknown email and an account without a password', async () => {
    await signUpAndVerify();
    await h.prisma.member.create({
      data: {
        email: 'linkonly@uw.edu',
        firstName: 'L',
        lastName: 'O',
        emailVerifiedAt: new Date(),
      },
    });
    for (const [email, pw] of [
      ['mia@uw.edu', 'wrong-password-1'],
      ['nobody@uw.edu', PASSWORD],
      ['linkonly@uw.edu', PASSWORD],
    ]) {
      const res = await login(email!, pw!);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'invalid_credentials' });
    }
  });

  it(`pauses sign-in after ${MAX_PASSWORD_FAILURES} wrong passwords`, async () => {
    await signUpAndVerify();
    for (let i = 0; i < MAX_PASSWORD_FAILURES; i++) await login('mia@uw.edu', 'wrong-password-1');
    expect((await login('mia@uw.edu', PASSWORD)).body).toEqual({ error: 'too_many_attempts' });
    h.setNow(new Date(h.ctx.now().getTime() + 16 * 60_000));
    expect((await login('mia@uw.edu', PASSWORD)).status).toBe(200);
  });

  it('sets, then changes a password (needs the current one) and signs out other devices', async () => {
    await post('/auth/signup', {
      email: 'leo@uw.edu',
      firstName: 'Leo',
      lastName: 'G',
      newsOptIn: false,
    });
    const a = await post('/auth/verify', { token: lastMagicLinkToken(h.mailer) });
    const cookieA = a.headers['set-cookie']![0]!.split(';')[0]!;
    const put = (cookie: string, body: object) =>
      request(h.app).put('/me/password').set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);

    expect((await put(cookieA, { newPassword: 'short' })).status).toBe(400);
    expect((await put(cookieA, { newPassword: PASSWORD })).status).toBe(204);
    const b = await login('leo@uw.edu', PASSWORD);
    const cookieB = b.headers['set-cookie']![0]!.split(';')[0]!;

    expect((await put(cookieB, { newPassword: 'another-password-9' })).body).toEqual({
      error: 'wrong_current_password',
    });
    expect(
      (await put(cookieB, { currentPassword: PASSWORD, newPassword: 'another-password-9' })).status,
    ).toBe(204);
    expect((await request(h.app).get('/me').set('Cookie', cookieA)).status).toBe(401); // other device signed out
    expect((await request(h.app).get('/me').set('Cookie', cookieB)).status).toBe(200);
    expect((await login('leo@uw.edu', 'another-password-9')).status).toBe(200);

    const actions = (
      await h.prisma.auditLog.findMany({ where: { action: { startsWith: 'auth.password' } } })
    ).map((x) => x.action);
    expect(actions).toEqual(['auth.password.set', 'auth.password.changed']);
  });

  it('never stores or logs the password', async () => {
    await signUpAndVerify();
    await login('mia@uw.edu', 'wrong-password-1');
    const audit = JSON.stringify(await h.prisma.auditLog.findMany(), (_k, v) =>
      typeof v === 'bigint' ? String(v) : v,
    );
    expect(audit).not.toContain(PASSWORD);
    expect(audit).not.toContain('wrong-password-1');
    expect(h.logLines.join('')).not.toContain(PASSWORD);
  });
});
