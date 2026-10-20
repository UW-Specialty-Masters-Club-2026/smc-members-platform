import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createHarness,
  hasTestDb,
  signedInMember,
  WEB_ORIGIN,
  type TestHarness,
} from '../test/harness';

describe.skipIf(!hasTestDb)('admin members (access layer)', () => {
  let h: TestHarness;
  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  it.each(['MEMBER', 'ORGANIZER'] as const)('denies %s and audits the attempt', async (role) => {
    const { member, cookie } = await signedInMember(h, { role });
    const res = await request(h.app).get('/admin/members').set('Cookie', cookie);
    expect(res.status).toBe(403);
    const denied = await h.prisma.auditLog.findFirstOrThrow({ where: { action: 'access.denied' } });
    expect(denied.actorId).toBe(member.id);
    expect(denied.result).toBe('DENIED');
  });

  it('lists and searches members for admins', async () => {
    const { cookie } = await signedInMember(h, { role: 'ADMIN', email: 'admin@uw.edu' });
    await signedInMember(h, { email: 'alice@uw.edu' });
    const all = await request(h.app).get('/admin/members').set('Cookie', cookie);
    expect(all.status).toBe(200);
    expect(all.body.members).toHaveLength(2);

    const found = await request(h.app).get('/admin/members?q=alice').set('Cookie', cookie);
    expect(found.body.members.map((m: { email: string }) => m.email)).toEqual(['alice@uw.edu']);
  });

  it('changes a role with an audit entry naming the admin', async () => {
    const admin = await signedInMember(h, { role: 'ADMIN' });
    const { member } = await signedInMember(h);
    const res = await request(h.app)
      .patch(`/admin/members/${member.id}`)
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', admin.cookie)
      .send({ role: 'ORGANIZER' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ORGANIZER');

    const entry = await h.prisma.auditLog.findFirstOrThrow({
      where: { action: 'member.access.changed' },
    });
    expect(entry).toMatchObject({
      actorType: 'ADMIN',
      actorId: admin.member.id,
      entityId: member.id,
    });
  });

  it('deactivating a member revokes their sessions', async () => {
    const admin = await signedInMember(h, { role: 'ADMIN' });
    const target = await signedInMember(h);
    await request(h.app)
      .patch(`/admin/members/${target.member.id}`)
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', admin.cookie)
      .send({ status: 'INACTIVE' });
    expect((await request(h.app).get('/me').set('Cookie', target.cookie)).status).toBe(401);
  });

  it('stops admins from changing their own access', async () => {
    const admin = await signedInMember(h, { role: 'ADMIN' });
    const res = await request(h.app)
      .patch(`/admin/members/${admin.member.id}`)
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', admin.cookie)
      .send({ role: 'MEMBER' });
    expect(res.status).toBe(409);
  });

  it('requires our Origin for admin mutations', async () => {
    const admin = await signedInMember(h, { role: 'ADMIN' });
    const { member } = await signedInMember(h);
    const res = await request(h.app)
      .patch(`/admin/members/${member.id}`)
      .set('Cookie', admin.cookie)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(403);
  });
});
