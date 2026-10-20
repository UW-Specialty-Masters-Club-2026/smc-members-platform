import { parsePtLocal } from '@smc/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { get, send } from '../test/fixtures';
import { createHarness, hasTestDb, signedInMember, type TestHarness } from '../test/harness';

const MONDAY_0800 = new Date('2026-10-26T15:00:00Z'); // 08:00 PDT

describe.skipIf(!hasTestDb)('admin digest workspace', () => {
  let h: TestHarness;
  let admin: Awaited<ReturnType<typeof signedInMember>>;
  let organizer: Awaited<ReturnType<typeof signedInMember>>;

  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(async () => {
    await h.reset();
    h.setNow(MONDAY_0800);
    admin = await signedInMember(h, { role: 'ADMIN', email: 'ada.admin@uw.edu' });
    organizer = await signedInMember(h, { role: 'ORGANIZER' });
    for (let i = 0; i < 3; i++) await signedInMember(h, { newsOptIn: true });
    await signedInMember(h, { newsOptIn: true, email: 'grad@gmail.com' });
    await h.prisma.event.create({
      data: {
        slug: 'ai-at-work',
        title: 'AI at Work Workshop',
        summary: 'Hands-on session on AI tools in finance roles.',
        startsAt: parsePtLocal('2026-10-28T18:00'),
        endsAt: parsePtLocal('2026-10-28T19:30'),
        location: 'PACCAR Hall 192 · UW Seattle',
        status: 'PUBLISHED',
        capacity: 30,
        createdById: admin.member.id,
      },
    });
  });
  afterAll(() => h.close());

  async function draft() {
    const res = await send(h, 'post', '/admin/digests/draft-now', admin.cookie);
    expect(res.status).toBe(201);
    return (await get(h, `/admin/digests/${res.body.digestId}`, admin.cookie)).body;
  }

  it('drafts on demand and shows the facts, schedule and recipient scope for review', async () => {
    const d = await draft();
    expect(d).toMatchObject({
      status: 'PENDING_APPROVAL',
      weekKey: '2026-10-26',
      canApprove: true,
      recipients: {
        total: 4,
        previewTotal: 4,
        byDomain: [
          { domain: 'uw.edu', count: 3 },
          { domain: 'gmail.com', count: 1 },
        ],
      },
      schedule: {
        labels: {
          draftAt: 'Mon, Oct 26 · 8:00 AM PT',
          sendNotBefore: 'Mon, Oct 26 · 9:00 AM PT',
          expiresAt: 'Mon, Oct 26 · 6:00 PM PT',
        },
      },
    });
    expect(d.content.events[0]).toMatchObject({
      title: 'AI at Work Workshop',
      when: 'Wed, Oct 28 · 6:00–7:30 PM PT',
      location: 'PACCAR Hall 192 · UW Seattle',
      url: 'http://localhost:3000/events/ai-at-work',
    });
    // Admins were asked to approve.
    expect(h.mailer.sent.map((m) => m.subject)).toEqual([
      'Weekly digest ready for approval · Monday, October 26, 2026',
    ]);
  });

  it('serves a script-free, personalised preview (HTML and text)', async () => {
    const d = await draft();
    const html = await get(h, `/admin/digests/${d.id}/preview`, admin.cookie);
    expect(html.status).toBe(200);
    expect(html.headers['content-type']).toMatch(/text\/html/);
    expect(html.headers['content-security-policy']).toContain("default-src 'none'");
    expect(html.text).toContain('Hi Test,');
    expect(html.text).not.toContain('%recipient.');
    const text = await get(h, `/admin/digests/${d.id}/preview?format=text`, organizer.cookie);
    expect(text.text).toContain('When:  Wed, Oct 28 · 6:00–7:30 PM PT');
  });

  it('test-sends only to the requesting admin', async () => {
    const d = await draft();
    h.mailer.sent.length = 0;
    const res = await send(h, 'post', `/admin/digests/${d.id}/test-send`, admin.cookie);
    expect(res.body).toEqual({ status: 'sent', to: 'ada.admin@uw.edu' });
    expect(h.mailer.sent).toHaveLength(1);
    expect(h.mailer.sent[0]).toMatchObject({ to: 'ada.admin@uw.edu', tag: 'digest-test' });
    expect(h.mailer.sent[0]!.subject).toMatch(/^\[TEST\] This week at SMC/);
    expect(h.mailer.sent[0]!.html).not.toContain('%recipient.');

    // There is no way to name another recipient.
    const other = await send(h, 'post', `/admin/digests/${d.id}/test-send`, admin.cookie, {
      to: 'member@uw.edu',
    });
    expect(h.mailer.sent.every((m) => m.to === 'ada.admin@uw.edu')).toBe(true);
    expect(other.status).toBe(200);
    expect(await h.prisma.auditLog.count({ where: { action: 'digest.test_sent' } })).toBe(2);
  });

  it('lets admins approve once, and queues the send for 09:00 PT', async () => {
    const d = await draft();
    const first = await send(h, 'post', `/admin/digests/${d.id}/approve`, admin.cookie, {
      version: d.version,
    });
    expect(first.body).toEqual({ kind: 'approved', issueNumber: 1 });
    const again = await send(h, 'post', `/admin/digests/${d.id}/approve`, admin.cookie, {
      version: d.version,
    });
    expect(again.body).toEqual({ kind: 'already_approved' });

    const job = await h.prisma.job.findFirstOrThrow({ where: { name: 'digest.start-send' } });
    expect(job.runAt).toEqual(new Date('2026-10-26T16:00:00Z'));
    expect(await h.prisma.job.count()).toBe(1);
  });

  it('refuses approvals from organizers, stale previews and after the deadline', async () => {
    const d = await draft();
    expect(
      (
        await send(h, 'post', `/admin/digests/${d.id}/approve`, organizer.cookie, {
          version: d.version,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send(h, 'post', `/admin/digests/${d.id}/approve`, admin.cookie, {
          version: d.version + 1,
        })
      ).body,
    ).toEqual({ error: 'stale_version' });
    h.setNow(new Date('2026-10-27T01:00:00Z')); // 18:00 PDT
    expect(
      (
        await send(h, 'post', `/admin/digests/${d.id}/approve`, admin.cookie, {
          version: d.version,
        })
      ).body,
    ).toEqual({ error: 'expired' });
  });

  it('rejects with a reason', async () => {
    const d = await draft();
    expect(
      (await send(h, 'post', `/admin/digests/${d.id}/reject`, admin.cookie, { version: d.version }))
        .status,
    ).toBe(400);
    const res = await send(h, 'post', `/admin/digests/${d.id}/reject`, admin.cookie, {
      version: d.version,
      reason: 'Room changed',
    });
    expect(res.body).toEqual({ status: 'rejected' });
    expect((await get(h, `/admin/digests/${d.id}`, admin.cookie)).body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Room changed',
    });
  });

  it('pauses (audited) and refuses to draft while paused', async () => {
    const paused = await send(h, 'put', '/admin/digests/settings', admin.cookie, {
      paused: true,
      pausedUntilPt: '2026-12-01T00:00',
      pausedReason: 'Fall break',
    });
    expect(paused.body).toMatchObject({
      paused: true,
      pausedNow: true,
      pausedReason: 'Fall break',
    });
    expect((await send(h, 'post', '/admin/digests/draft-now', admin.cookie)).body).toEqual({
      error: 'paused',
    });
    expect(await h.prisma.auditLog.count({ where: { action: 'digest.paused' } })).toBe(1);
    expect(
      (await send(h, 'put', '/admin/digests/settings', organizer.cookie, { paused: false })).status,
    ).toBe(403);
  });

  it('only drafts inside Monday 08:00–18:00 PT', async () => {
    h.setNow(new Date('2026-10-26T14:59:00Z'));
    expect((await send(h, 'post', '/admin/digests/draft-now', admin.cookie)).body).toEqual({
      error: 'before_draft_time',
    });
    h.setNow(new Date('2026-10-27T01:00:00Z'));
    expect((await send(h, 'post', '/admin/digests/draft-now', admin.cookie)).body).toEqual({
      error: 'after_deadline',
    });
  });

  it('reports results and lets admins filter failed deliveries', async () => {
    const d = await draft();
    const members = await h.prisma.member.findMany({ where: { newsOptIn: true } });
    await h.prisma.digestDelivery.createMany({
      data: members.map((m, i) => ({
        digestId: d.id,
        memberId: m.id,
        weekKey: d.weekKey,
        idempotencyKey: `digest:${d.weekKey}:${m.id}`,
        status: (['DELIVERED', 'DELIVERED', 'FAILED', 'UNSUBSCRIBED'] as const)[i]!,
        mailgunMessageId: '<x@mg>',
        lastErrorCode: i === 2 ? '550' : null,
        lastErrorMessage: i === 2 ? 'mailbox does not exist' : null,
      })),
    });
    const detail = (await get(h, `/admin/digests/${d.id}`, admin.cookie)).body;
    expect(detail.results.deliveries.summary).toEqual({
      sent: 4,
      delivered: 2,
      failed: 1,
      optedOut: 1,
      skipped: 0,
      pending: 0,
    });
    const failed = await get(h, `/admin/digests/${d.id}/deliveries?status=FAILED`, admin.cookie);
    expect(failed.body.deliveries).toHaveLength(1);
    expect(failed.body.deliveries[0]).toMatchObject({
      lastErrorCode: '550',
      lastErrorMessage: 'mailbox does not exist',
    });
  });

  it('keeps the workspace away from members', async () => {
    const { cookie } = await signedInMember(h);
    expect((await get(h, '/admin/digests', cookie)).status).toBe(403);
  });

  it('shows sent issues in the browser without any recipient data', async () => {
    const d = await draft();
    expect((await request(h.app).get(`/digest/${d.weekKey}/html`)).status).toBe(404);
    await h.prisma.weeklyDigest.update({ where: { id: d.id }, data: { status: 'SENT' } });
    const page = await request(h.app).get(`/digest/${d.weekKey}/html`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Hi there,');
    expect(page.text).toContain('href="http://localhost:3000/me/profile"');
    expect(page.text).not.toContain('%recipient.');
  });
});
