import { signToken } from '@smc/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DURING_EVENT, get, publishedEvent, registeredMember, send } from '../test/fixtures';
import {
  createHarness,
  hasTestDb,
  signedInMember,
  TEST_LINK_SECRET,
  type TestHarness,
} from '../test/harness';

describe.skipIf(!hasTestDb)('QR attendance', () => {
  let h: TestHarness;
  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  it('gives only confirmed members their own check-in code', async () => {
    const { event } = await publishedEvent(h, { capacity: 1 });
    const confirmed = await registeredMember(h, event.slug);
    const waitlisted = await registeredMember(h, event.slug);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.code).toBeTruthy();
    expect(waitlisted.status).toBe('WAITLISTED');
    expect(waitlisted.code).toBeNull();

    const page = await get(h, `/events/${event.slug}`, confirmed.cookie);
    expect(page.body.checkIn.url).toMatch(/^http:\/\/localhost:3000\/checkin#code=/);
    expect(page.body.checkIn.opensAt).toBe('2026-10-28T23:00:00.000Z');
  });

  it('lets an organizer preview and check in a scanned code, once', async () => {
    const { event, staff } = await publishedEvent(h);
    const m = await registeredMember(h, event.slug);
    h.setNow(DURING_EVENT);

    const preview = await send(h, 'post', '/staff/checkin/lookup', staff.cookie, { code: m.code });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      member: { firstName: 'Test' },
      event: { title: 'AI at Work Workshop', when: 'Wed, Oct 28 · 6:00–7:30 PM PT' },
      registrationStatus: 'CONFIRMED',
      checkedInAt: null,
    });

    const first = await send(h, 'post', '/staff/checkin', staff.cookie, { code: m.code });
    expect(first.body).toEqual({
      alreadyCheckedIn: false,
      checkedInAt: DURING_EVENT.toISOString(),
    });
    const again = await send(h, 'post', '/staff/checkin', staff.cookie, { code: m.code });
    expect(again.body.alreadyCheckedIn).toBe(true);
    expect(await h.prisma.attendance.count()).toBe(1);
    expect(await h.prisma.auditLog.count({ where: { action: 'attendance.checked_in' } })).toBe(1);
  });

  it('records a single row even when several organizers scan at once', async () => {
    const { event, staff } = await publishedEvent(h);
    const m = await registeredMember(h, event.slug);
    const other = await signedInMember(h, { role: 'ADMIN' });
    h.setNow(DURING_EVENT);
    const scans = await Promise.all(
      [staff.cookie, other.cookie, staff.cookie, other.cookie].map((c) =>
        send(h, 'post', '/staff/checkin', c, { code: m.code }),
      ),
    );
    expect(scans.every((s) => s.status === 200)).toBe(true);
    expect(scans.filter((s) => s.body.alreadyCheckedIn === false)).toHaveLength(1);
    expect(await h.prisma.attendance.count()).toBe(1);
  });

  it('only opens check-in around the event', async () => {
    const { event, staff } = await publishedEvent(h);
    const m = await registeredMember(h, event.slug);
    h.setNow(new Date('2026-10-28T22:59:00Z')); // 2h01m before start
    expect((await send(h, 'post', '/staff/checkin', staff.cookie, { code: m.code })).body).toEqual({
      error: 'outside_checkin_window',
    });
    h.setNow(new Date('2026-10-29T05:31:00Z')); // 3h01m after end
    expect((await send(h, 'post', '/staff/checkin', staff.cookie, { code: m.code })).body).toEqual({
      error: 'outside_checkin_window',
    });
  });

  it('rejects forged, foreign-purpose and member-side scans', async () => {
    const { event, staff } = await publishedEvent(h);
    const m = await registeredMember(h, event.slug);
    h.setNow(DURING_EVENT);

    const tampered = `${m.code!.split('.')[0]}.AAAA`;
    expect(
      (await send(h, 'post', '/staff/checkin', staff.cookie, { code: tampered })).body,
    ).toEqual({
      error: 'invalid_code',
    });
    const regId = (await h.prisma.registration.findFirstOrThrow()).id;
    const wrongPurpose = signToken(TEST_LINK_SECRET, 'unsubscribe', regId);
    expect(
      (await send(h, 'post', '/staff/checkin', staff.cookie, { code: wrongPurpose })).body,
    ).toEqual({ error: 'invalid_code' });

    // A member scanning their own (or a friend's) QR cannot check anyone in.
    expect((await send(h, 'post', '/staff/checkin', m.cookie, { code: m.code })).status).toBe(403);
  });

  it('supports manual check-in from the roster, and undo', async () => {
    const { event, staff } = await publishedEvent(h);
    await registeredMember(h, event.slug);
    const reg = await h.prisma.registration.findFirstOrThrow();
    h.setNow(DURING_EVENT);

    const path = `/admin/events/${event.id}/registrations/${reg.id}/checkin`;
    expect((await send(h, 'post', path, staff.cookie)).body.alreadyCheckedIn).toBe(false);
    const roster = await get(h, `/admin/events/${event.id}/registrations`, staff.cookie);
    expect(roster.body.registrations[0]).toMatchObject({ checkInMethod: 'MANUAL' });

    expect((await send(h, 'delete', path, staff.cookie)).status).toBe(204);
    expect(await h.prisma.attendance.count()).toBe(0);
    expect(await h.prisma.auditLog.count({ where: { action: 'attendance.undone' } })).toBe(1);
  });

  it('refuses waitlisted registrations and cancelled events', async () => {
    const { event, staff } = await publishedEvent(h, { capacity: 1 });
    await registeredMember(h, event.slug);
    await registeredMember(h, event.slug);
    const waitlisted = await h.prisma.registration.findFirstOrThrow({
      where: { status: 'WAITLISTED' },
    });
    h.setNow(DURING_EVENT);
    const res = await send(
      h,
      'post',
      `/admin/events/${event.id}/registrations/${waitlisted.id}/checkin`,
      staff.cookie,
    );
    expect(res.body).toEqual({ error: 'not_confirmed' });

    h.setNow(new Date('2026-10-19T17:00:00Z'));
    const { event: cancelled, staff: s2 } = await publishedEvent(h, { title: 'Cancelled thing' });
    const m = await registeredMember(h, cancelled.slug);
    await send(h, 'post', `/admin/events/${cancelled.id}/cancel`, s2.cookie);
    h.setNow(DURING_EVENT);
    expect((await send(h, 'post', '/staff/checkin', s2.cookie, { code: m.code })).body).toEqual({
      error: 'event_not_active',
    });
  });
});
