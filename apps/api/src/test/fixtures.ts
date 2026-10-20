import request from 'supertest';
import { expect } from 'vitest';
import { signedInMember, WEB_ORIGIN, type TestHarness } from './harness';

/** Event on Wed Oct 28 2026, 6:00–7:30 PM PT (= 2026-10-29T01:00Z–02:30Z). */
export const EVENT_BODY = {
  title: 'AI at Work Workshop',
  summary: 'Hands-on session on using AI tools in finance and analytics roles.',
  startsAtPt: '2026-10-28T18:00',
  endsAtPt: '2026-10-28T19:30',
  location: 'PACCAR Hall, Room 192 · UW Seattle',
  capacity: 30,
};

export const DURING_EVENT = new Date('2026-10-29T01:30:00Z');
export const AFTER_EVENT = new Date('2026-10-29T03:00:00Z');

export function send(
  h: TestHarness,
  method: 'post' | 'put' | 'patch' | 'delete',
  path: string,
  cookie: string,
  body?: object,
) {
  return request(h.app)[method](path).set('Origin', WEB_ORIGIN).set('Cookie', cookie).send(body);
}

export function get(h: TestHarness, path: string, cookie: string) {
  return request(h.app).get(path).set('Cookie', cookie);
}

export async function publishedEvent(h: TestHarness, overrides: object = {}) {
  const staff = await signedInMember(h, { role: 'ORGANIZER' });
  const created = await send(h, 'post', '/admin/events', staff.cookie, {
    ...EVENT_BODY,
    ...overrides,
  });
  expect(created.status).toBe(201);
  const published = await send(h, 'post', `/admin/events/${created.body.id}/publish`, staff.cookie);
  expect(published.status).toBe(200);
  return { event: published.body as { id: string; slug: string }, staff };
}

/** A member with a confirmed seat; returns their check-in code from the event page. */
export async function registeredMember(h: TestHarness, slug: string) {
  const m = await signedInMember(h);
  const reg = await send(h, 'post', `/events/${slug}/registration`, m.cookie);
  expect(reg.body.status).toBeDefined();
  const page = await get(h, `/events/${slug}`, m.cookie);
  const url: string | undefined = page.body.checkIn?.url;
  const code = url ? new URL(url.replace('#', '?')).searchParams.get('code')! : null;
  return { ...m, status: reg.body.status as string, code };
}
