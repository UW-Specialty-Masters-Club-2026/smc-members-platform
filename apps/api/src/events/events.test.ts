import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createHarness,
  hasTestDb,
  signedInMember,
  WEB_ORIGIN,
  type TestHarness,
} from '../test/harness';

describe.skipIf(!hasTestDb)('events & registrations', () => {
  let h: TestHarness;
  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  // Harness clock: 2026-10-19T17:00Z (Mon 10:00 AM PDT).
  const eventBody = {
    title: 'AI at Work Workshop',
    summary: 'Hands-on session on using AI tools in finance and analytics roles.',
    startsAtPt: '2026-10-28T18:00',
    endsAtPt: '2026-10-28T19:30',
    location: 'PACCAR Hall, Room 192 · UW Seattle',
    capacity: 30,
  };

  const send = (method: 'post' | 'patch' | 'delete', path: string, cookie: string, body?: object) =>
    request(h.app)[method](path).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);

  async function staffCookie(role: 'ADMIN' | 'ORGANIZER' = 'ORGANIZER') {
    return (await signedInMember(h, { role })).cookie;
  }

  async function publishedEvent(overrides: object = {}) {
    const cookie = await staffCookie();
    const created = await send('post', '/admin/events', cookie, { ...eventBody, ...overrides });
    expect(created.status).toBe(201);
    const published = await send('post', `/admin/events/${created.body.id}/publish`, cookie);
    expect(published.status).toBe(200);
    return { event: published.body, staff: cookie };
  }

  async function members(n: number) {
    return Promise.all(Array.from({ length: n }, () => signedInMember(h)));
  }

  it('stores Pacific input as UTC and shows it back in PT', async () => {
    const cookie = await staffCookie();
    const res = await send('post', '/admin/events', cookie, eventBody);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.startsAt).toBe('2026-10-29T01:00:00.000Z'); // 6 PM PDT
    expect(res.body.when).toBe('Wed, Oct 28 · 6:00–7:30 PM PT');
    expect(res.body.slug).toMatch(/^ai-at-work-workshop-[0-9a-f]{6}$/);

    const afterDst = await send('post', '/admin/events', cookie, {
      ...eventBody,
      startsAtPt: '2026-11-04T18:00',
      endsAtPt: null,
    });
    expect(afterDst.body.startsAt).toBe('2026-11-05T02:00:00.000Z'); // 6 PM PST
  });

  it('rejects impossible times', async () => {
    const cookie = await staffCookie();
    const gap = await send('post', '/admin/events', cookie, {
      ...eventBody,
      startsAtPt: '2027-03-14T02:30',
      endsAtPt: null,
    });
    expect(gap.status).toBe(400);
    expect(gap.body.fields).toContain('startsAtPt');

    const backwards = await send('post', '/admin/events', cookie, {
      ...eventBody,
      endsAtPt: '2026-10-28T17:00',
    });
    expect(backwards.body).toEqual({ error: 'ends_before_start' });
  });

  it('only staff manage events', async () => {
    const { cookie } = await signedInMember(h);
    expect((await send('post', '/admin/events', cookie, eventBody)).status).toBe(403);
  });

  it('hides drafts from members and lists only upcoming published events', async () => {
    const cookie = await staffCookie();
    const draft = await send('post', '/admin/events', cookie, eventBody);
    const { event: live } = await publishedEvent({ title: 'Networking Night' });
    const { event: cancelled, staff } = await publishedEvent({ title: 'Cancelled Mixer' });
    await send('post', `/admin/events/${cancelled.id}/cancel`, staff);

    const list = await request(h.app).get('/events');
    expect(list.body.events.map((e: { title: string }) => e.title)).toEqual(['Networking Night']);
    expect((await request(h.app).get(`/events/${draft.body.slug}`)).status).toBe(404);

    // Cancelled events stay reachable so old links explain themselves.
    const gone = await request(h.app).get(`/events/${cancelled.slug}`);
    expect(gone.body.status).toBe('CANCELLED');
    expect(gone.body.availability).toEqual({ kind: 'closed', reason: 'cancelled' });
    expect(live.availability).toEqual({ kind: 'open', seatsLeft: 30 });
  });

  it('publishing twice is a no-op error, and audited once', async () => {
    const { event, staff } = await publishedEvent();
    const again = await send('post', `/admin/events/${event.id}/publish`, staff);
    expect(again.status).toBe(409);
    expect(await h.prisma.auditLog.count({ where: { action: 'event.published' } })).toBe(1);
  });

  it('registers once per member and reports seats like the digest', async () => {
    const { event } = await publishedEvent({ capacity: 2 });
    const [a] = await members(1);
    const first = await send('post', `/events/${event.slug}/registration`, a!.cookie);
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ status: 'CONFIRMED', created: true });

    const repeat = await send('post', `/events/${event.slug}/registration`, a!.cookie);
    expect(repeat.status).toBe(200);
    expect(repeat.body).toEqual({ status: 'CONFIRMED', created: false });

    const view = await request(h.app).get(`/events/${event.slug}`).set('Cookie', a!.cookie);
    expect(view.body.seats).toBe('1 of 2 seats left');
    expect(view.body.myRegistration).toBe('CONFIRMED');
  });

  it('never oversells under concurrent registrations', async () => {
    const { event } = await publishedEvent({ capacity: 5 });
    const crowd = await members(12);
    const results = await Promise.all(
      crowd.map((m) => send('post', `/events/${event.slug}/registration`, m.cookie)),
    );
    const statuses = results.map((r) => r.body.status);
    expect(statuses.filter((s) => s === 'CONFIRMED')).toHaveLength(5);
    expect(statuses.filter((s) => s === 'WAITLISTED')).toHaveLength(7);

    const view = await request(h.app).get(`/events/${event.slug}`);
    expect(view.body.seats).toBe('Full · Join the waitlist');
    expect(view.body.availability).toEqual({ kind: 'waitlist' });
  });

  it('promotes the earliest waitlisted member when a seat frees up', async () => {
    const { event } = await publishedEvent({ capacity: 1 });
    const [a, b, c] = await members(3);
    await send('post', `/events/${event.slug}/registration`, a!.cookie);
    h.setNow(new Date('2026-10-19T17:01:00Z'));
    await send('post', `/events/${event.slug}/registration`, b!.cookie);
    h.setNow(new Date('2026-10-19T17:02:00Z'));
    await send('post', `/events/${event.slug}/registration`, c!.cookie);

    const cancel = await send('delete', `/events/${event.slug}/registration`, a!.cookie);
    expect(cancel.status).toBe(204);

    const regs = await h.prisma.registration.findMany({ where: { eventId: event.id } });
    const statusOf = (id: string) => regs.find((r) => r.memberId === id)!.status;
    expect(statusOf(a!.member.id)).toBe('CANCELLED');
    expect(statusOf(b!.member.id)).toBe('CONFIRMED');
    expect(statusOf(c!.member.id)).toBe('WAITLISTED');
    expect(await h.prisma.auditLog.count({ where: { action: 'registration.promoted' } })).toBe(1);
  });

  it('lets a member re-register after cancelling, at the back of the line', async () => {
    const { event } = await publishedEvent({ capacity: 1 });
    const [a, b] = await members(2);
    await send('post', `/events/${event.slug}/registration`, a!.cookie);
    await send('delete', `/events/${event.slug}/registration`, a!.cookie);
    await send('post', `/events/${event.slug}/registration`, b!.cookie);
    const again = await send('post', `/events/${event.slug}/registration`, a!.cookie);
    expect(again.body).toEqual({ status: 'WAITLISTED', created: true });
  });

  it('refuses when full without a waitlist, closed, cancelled or unauthenticated', async () => {
    const { event: noWaitlist } = await publishedEvent({ capacity: 1, waitlistEnabled: false });
    const [a, b] = await members(2);
    await send('post', `/events/${noWaitlist.slug}/registration`, a!.cookie);
    const full = await send('post', `/events/${noWaitlist.slug}/registration`, b!.cookie);
    expect(full.status).toBe(409);
    expect(full.body).toEqual({ error: 'event_full' });

    const { event: closed } = await publishedEvent({ registrationOpen: false });
    expect((await send('post', `/events/${closed.slug}/registration`, a!.cookie)).body).toEqual({
      error: 'registration_closed',
    });

    const { event: cancelled, staff } = await publishedEvent();
    await send('post', `/admin/events/${cancelled.id}/cancel`, staff);
    expect((await send('post', `/events/${cancelled.slug}/registration`, a!.cookie)).body).toEqual({
      error: 'event_cancelled',
    });

    const anon = await request(h.app)
      .post(`/events/${cancelled.slug}/registration`)
      .set('Origin', WEB_ORIGIN);
    expect(anon.status).toBe(401);
  });

  it('closes registration once the event starts', async () => {
    const { event } = await publishedEvent();
    const [a] = await members(1);
    h.setNow(new Date('2026-10-29T01:00:00Z'));
    const res = await send('post', `/events/${event.slug}/registration`, a!.cookie);
    expect(res.body).toEqual({ error: 'event_started' });
  });

  it('guards capacity changes and fills new seats from the waitlist', async () => {
    const { event, staff } = await publishedEvent({ capacity: 2 });
    const crowd = await members(4);
    for (const m of crowd) await send('post', `/events/${event.slug}/registration`, m.cookie);

    const tooSmall = await send('patch', `/admin/events/${event.id}`, staff, { capacity: 1 });
    expect(tooSmall.body).toEqual({ error: 'capacity_below_confirmed' });

    const bigger = await send('patch', `/admin/events/${event.id}`, staff, { capacity: 3 });
    expect(bigger.status).toBe(200);
    expect(bigger.body.confirmedCount).toBe(3);
    expect(bigger.body.waitlistCount).toBe(1);
  });

  it('cannot edit cancelled events', async () => {
    const { event, staff } = await publishedEvent();
    await send('post', `/admin/events/${event.id}/cancel`, staff);
    const res = await send('patch', `/admin/events/${event.id}`, staff, { title: 'New title' });
    expect(res.body).toEqual({ error: 'event_locked' });
  });

  it("lists a member's upcoming registrations", async () => {
    const { event } = await publishedEvent();
    const [a] = await members(1);
    await send('post', `/events/${event.slug}/registration`, a!.cookie);
    const mine = await request(h.app).get('/me/registrations').set('Cookie', a!.cookie);
    expect(mine.body.registrations).toHaveLength(1);
    expect(mine.body.registrations[0]).toMatchObject({
      slug: event.slug,
      myRegistration: 'CONFIRMED',
    });
  });

  it('gives organizers the roster in registration order', async () => {
    const { event, staff } = await publishedEvent({ capacity: 1 });
    const [a, b] = await members(2);
    await send('post', `/events/${event.slug}/registration`, a!.cookie);
    await send('post', `/events/${event.slug}/registration`, b!.cookie);
    const roster = await request(h.app)
      .get(`/admin/events/${event.id}/registrations`)
      .set('Cookie', staff);
    expect(roster.body.registrations.map((r: { status: string }) => r.status)).toEqual([
      'CONFIRMED',
      'WAITLISTED',
    ]);
  });
});
