import { signToken } from '@smc/core';
import { unsubscribeLinks } from '@smc/digest';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createHarness,
  hasTestDb,
  signedInMember,
  TEST_LINK_SECRET,
  WEB_ORIGIN,
  type TestHarness,
} from '../test/harness';

describe.skipIf(!hasTestDb)('unsubscribe', () => {
  let h: TestHarness;
  let member: Awaited<ReturnType<typeof signedInMember>>['member'];
  let cookie: string;
  let links: { page: string; oneClick: string };

  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(async () => {
    await h.reset();
    ({ member, cookie } = await signedInMember(h, { newsOptIn: true }));
    links = unsubscribeLinks(
      {
        appBaseUrl: WEB_ORIGIN,
        apiBaseUrl: 'http://localhost:4000',
        linkSigningSecret: TEST_LINK_SECRET,
      },
      member.id,
      h.ctx.now(),
    );
  });
  afterAll(() => h.close());

  const tokenOf = (url: string) =>
    decodeURIComponent(
      url.includes('#t=') ? url.split('#t=')[1]! : new URL(url).searchParams.get('t')!,
    );
  const fresh = () => h.prisma.member.findUniqueOrThrow({ where: { id: member.id } });

  it('one-click POST (RFC 8058) unsubscribes without login, cookies or Origin', async () => {
    const res = await request(h.app)
      .post(`/email/unsubscribe/one-click?t=${encodeURIComponent(tokenOf(links.oneClick))}`)
      .type('form')
      .send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(200);
    expect(await fresh()).toMatchObject({
      newsOptIn: false,
      emailSuppressedReason: 'UNSUBSCRIBED',
    });
    const audit = await h.prisma.auditLog.findFirstOrThrow({
      where: { action: 'member.news_opt_in.changed' },
    });
    expect(audit.metadata).toMatchObject({ source: 'one_click', reason: 'UNSUBSCRIBED' });
  });

  it('never unsubscribes on GET (link scanners)', async () => {
    const res = await request(h.app).get(
      `/email/unsubscribe/one-click?t=${encodeURIComponent(tokenOf(links.oneClick))}`,
    );
    expect(res.status).toBe(405);
    expect((await fresh()).newsOptIn).toBe(true);
  });

  it('confirms through the web page and is idempotent', async () => {
    const post = () =>
      request(h.app)
        .post('/email/unsubscribe')
        .set('Origin', WEB_ORIGIN)
        .send({ token: tokenOf(links.page) });
    expect((await post()).body).toEqual({ status: 'unsubscribed', alreadyUnsubscribed: false });
    expect((await post()).body).toEqual({ status: 'unsubscribed', alreadyUnsubscribed: true });
    expect(await h.prisma.auditLog.count({ where: { action: 'member.news_opt_in.changed' } })).toBe(
      1,
    );
  });

  it('rejects forged, expired and wrong-purpose tokens', async () => {
    const attempt = (t: string) =>
      request(h.app)
        .post(`/email/unsubscribe/one-click?t=${encodeURIComponent(t)}`)
        .send();
    const real = tokenOf(links.oneClick);
    expect((await attempt(`${real.split('.')[0]}.AAAA`)).status).toBe(400);
    expect((await attempt(signToken(TEST_LINK_SECRET, 'checkin', member.id))).status).toBe(400);
    h.setNow(new Date(h.ctx.now().getTime() + 61 * 24 * 60 * 60_000));
    expect((await attempt(real)).body).toEqual({ error: 'invalid_or_expired_link' });
    expect((await fresh()).newsOptIn).toBe(true);
  });

  it('a member can opt back in from My profile afterwards', async () => {
    await request(h.app)
      .post('/email/unsubscribe')
      .set('Origin', WEB_ORIGIN)
      .send({ token: tokenOf(links.page) });
    const res = await request(h.app)
      .patch('/me')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', cookie)
      .send({ newsOptIn: true });
    expect(res.body).toMatchObject({ newsOptIn: true, emailSuppressedReason: null });
  });
});
