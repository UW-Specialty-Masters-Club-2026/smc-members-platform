import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { get, send } from '../test/fixtures';
import { createHarness, hasTestDb, signedInMember, type TestHarness } from '../test/harness';

describe.skipIf(!hasTestDb)('audit log viewer', () => {
  let h: TestHarness;
  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  it('is admin-only', async () => {
    const organizer = await signedInMember(h, { role: 'ORGANIZER' });
    expect((await get(h, '/admin/audit', organizer.cookie)).status).toBe(403);
  });

  it('lists who did what and when, newest first, with actor names', async () => {
    const admin = await signedInMember(h, { role: 'ADMIN' });
    const target = await signedInMember(h);
    await send(h, 'patch', `/admin/members/${target.member.id}`, admin.cookie, {
      role: 'ORGANIZER',
    });
    const res = await get(h, '/admin/audit', admin.cookie);
    const entry = res.body.entries.find(
      (e: { action: string }) => e.action === 'member.access.changed',
    );
    expect(entry).toMatchObject({
      actorType: 'ADMIN',
      actor: { id: admin.member.id, name: 'Test Member' },
      entityType: 'member',
      entityId: target.member.id,
      result: 'SUCCESS',
      metadata: { from: { role: 'MEMBER' }, to: { role: 'ORGANIZER' } },
    });
    expect(entry.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof entry.id).toBe('string');
  });

  it('filters by run id, action prefix and result', async () => {
    const admin = await signedInMember(h, { role: 'ADMIN' });
    const member = await signedInMember(h);
    // One request = one run id across its audit entries.
    const denied = await get(h, '/admin/members', member.cookie);
    const runId = denied.headers['x-request-id'] as string;
    const byRun = await get(h, `/admin/audit?runId=${runId}`, admin.cookie);
    expect(byRun.body.entries.map((e: { action: string }) => e.action)).toEqual(['access.denied']);

    const byResult = await get(h, '/admin/audit?result=DENIED&action=access.', admin.cookie);
    expect(byResult.body.entries).toHaveLength(1);
    expect((await get(h, '/admin/audit?action=digest.', admin.cookie)).body.entries).toEqual([]);
  });

  it('pages with a cursor', async () => {
    const admin = await signedInMember(h, { role: 'ADMIN' });
    await h.prisma.auditLog.createMany({
      data: Array.from({ length: 130 }, (_, i) => ({
        runId: `r${i}`,
        actorType: 'SYSTEM' as const,
        action: 'test.bulk',
        result: 'SUCCESS' as const,
      })),
    });
    const first = await get(h, '/admin/audit?action=test.', admin.cookie);
    expect(first.body.entries).toHaveLength(100);
    const second = await get(
      h,
      `/admin/audit?action=test.&cursor=${first.body.nextCursor}`,
      admin.cookie,
    );
    expect(second.body.entries).toHaveLength(30);
    expect(second.body.nextCursor).toBeNull();
  });
});
