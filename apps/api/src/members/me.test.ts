import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createHarness,
  hasTestDb,
  signedInMember,
  WEB_ORIGIN,
  type TestHarness,
} from '../test/harness';

describe.skipIf(!hasTestDb)('My profile', () => {
  let h: TestHarness;
  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  const patchMe = (cookie: string, body: object) =>
    request(h.app).patch('/me').set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);

  it('requires a session', async () => {
    expect((await request(h.app).get('/me')).status).toBe(401);
  });

  it('lets a member switch news & invitations off and on, with an audit trail', async () => {
    const { member, cookie } = await signedInMember(h, { newsOptIn: true });

    const off = await patchMe(cookie, { newsOptIn: false });
    expect(off.status).toBe(200);
    expect(off.body.newsOptIn).toBe(false);

    h.setNow(new Date('2026-10-20T09:00:00Z'));
    const on = await patchMe(cookie, { newsOptIn: true });
    expect(on.body.newsOptIn).toBe(true);
    expect(new Date(on.body.newsOptInUpdatedAt).toISOString()).toBe('2026-10-20T09:00:00.000Z');

    const audit = await h.prisma.auditLog.findMany({
      where: { action: 'member.news_opt_in.changed', entityId: member.id },
      orderBy: { id: 'asc' },
    });
    expect(audit.map((a) => a.metadata)).toEqual([
      expect.objectContaining({ from: true, to: false, source: 'profile' }),
      expect.objectContaining({ from: false, to: true, source: 'profile' }),
    ]);
  });

  it('does not write an audit entry when nothing changed', async () => {
    const { cookie } = await signedInMember(h, { newsOptIn: true });
    await patchMe(cookie, { newsOptIn: true, firstName: 'Renamed' });
    expect(await h.prisma.auditLog.count()).toBe(0);
  });

  it('clears an automatic suppression when the member opts back in', async () => {
    const { member, cookie } = await signedInMember(h, { newsOptIn: false });
    await h.prisma.member.update({
      where: { id: member.id },
      data: { emailSuppressedReason: 'UNSUBSCRIBED' },
    });
    const res = await patchMe(cookie, { newsOptIn: true });
    expect(res.body.emailSuppressedReason).toBeNull();
  });

  it('rejects fields members may not change', async () => {
    const { cookie } = await signedInMember(h);
    const res = await patchMe(cookie, { role: 'ADMIN' });
    expect(res.status).toBe(400);
  });
});
