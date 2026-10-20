import { parsePtLocal } from '@smc/core/time';
import { createPrismaClient, type EventStatus, type PrismaClient } from '@smc/db';
import { assertTestDatabase, resetDatabase } from '@smc/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { composeDigest, MAX_EVENTS, selectEvents, selectNews } from './content';
import { RECIPIENT_WHERE, recipientPage, recipientSummary } from './recipients';

const url = process.env.TEST_DATABASE_URL;
const BASE = 'https://smc.example';
const WEEK = '2026-10-26';
const DRAFT_TIME = new Date('2026-10-26T15:00:00Z'); // Mon 08:00 PDT

describe.skipIf(!url)('digest composition (database)', () => {
  let db: PrismaClient;
  let authorId: string;
  let seq = 0;

  beforeAll(() => {
    assertTestDatabase(url!);
    db = createPrismaClient(url!);
  });
  beforeEach(async () => {
    await resetDatabase(db);
    authorId = (await member({ email: 'author@uw.edu' })).id;
  });
  afterAll(() => db.$disconnect());

  function member(over: Partial<Parameters<PrismaClient['member']['create']>[0]['data']> = {}) {
    seq += 1;
    return db.member.create({
      data: {
        email: `m${seq}@uw.edu`,
        firstName: 'M',
        lastName: String(seq),
        newsOptIn: true,
        emailVerifiedAt: new Date('2026-09-01T00:00:00Z'),
        ...over,
      },
    });
  }

  function event(title: string, startsAtPt: string, over: Record<string, unknown> = {}) {
    seq += 1;
    return db.event.create({
      data: {
        slug: `e-${seq}`,
        title,
        summary: `${title} summary`,
        startsAt: parsePtLocal(startsAtPt),
        endsAt: null,
        location: 'PACCAR Hall 192 · UW Seattle',
        status: 'PUBLISHED' as EventStatus,
        capacity: 30,
        createdById: authorId,
        ...over,
      },
    });
  }

  async function fill(eventId: string, n: number) {
    for (let i = 0; i < n; i++) {
      const m = await member();
      await db.registration.create({
        data: { eventId, memberId: m.id, status: 'CONFIRMED', registeredAt: DRAFT_TIME },
      });
    }
  }

  function news(title: string, publishedAt: Date | null, over: Record<string, unknown> = {}) {
    seq += 1;
    return db.newsPost.create({
      data: {
        slug: `n-${seq}`,
        title,
        summary: `${title} summary text`,
        status: publishedAt ? 'PUBLISHED' : 'DRAFT',
        publishedAt,
        createdById: authorId,
        ...over,
      },
    });
  }

  describe('events', () => {
    it('includes only upcoming, published events members can still join', async () => {
      const open = await event('Open', '2026-10-28T18:00', {
        endsAt: parsePtLocal('2026-10-28T19:30'),
      });
      const full = await event('Full with waitlist', '2026-10-29T18:00', { capacity: 2 });
      await fill(full.id, 2);
      const fullNoWl = await event('Full no waitlist', '2026-10-29T19:00', {
        capacity: 1,
        waitlistEnabled: false,
      });
      await fill(fullNoWl.id, 1);
      await event('Draft', '2026-10-28T12:00', { status: 'DRAFT' });
      await event('Cancelled', '2026-10-28T12:00', { status: 'CANCELLED' });
      await event('Completed', '2026-10-28T12:00', { status: 'COMPLETED' });
      await event('Already started', '2026-10-26T07:00');
      await event('Registration closed', '2026-10-30T12:00', { registrationOpen: false });
      await event('Deadline passed', '2026-10-30T12:00', {
        registrationClosesAt: new Date('2026-10-26T14:00:00Z'),
      });
      await event('Too far out', '2026-11-30T12:00');

      const selected = await selectEvents(db, DRAFT_TIME, BASE, 21);
      expect(selected.map((e) => e.title)).toEqual(['Open', 'Full with waitlist']);
      expect(selected[0]).toMatchObject({
        id: open.id,
        when: 'Wed, Oct 28 · 6:00–7:30 PM PT',
        location: 'PACCAR Hall 192 · UW Seattle',
        seats: '30 of 30 seats left',
        action: 'REGISTER',
        url: `${BASE}/events/${open.slug}`,
      });
      expect(selected[1]).toMatchObject({
        seats: 'Full · Join the waitlist',
        action: 'JOIN_WAITLIST',
      });
    });

    it('omits the seat line for unlimited events instead of guessing', async () => {
      await event('Unlimited', '2026-10-28T18:00', { capacity: null });
      const [e] = await selectEvents(db, DRAFT_TIME, BASE);
      expect(e!.seats).toBeNull();
      expect(e!.when).toBe('Wed, Oct 28 · 6:00 PM PT');
    });
  });

  describe('news', () => {
    it('takes posts published in [last Monday 08:00 PT, this Monday 08:00 PT)', async () => {
      await news('Too early', new Date('2026-10-19T14:59:59Z'));
      await news('First in window', new Date('2026-10-19T15:00:00Z'));
      await news('Midweek', new Date('2026-10-22T20:00:00Z'));
      await news('At cutoff (next week)', new Date('2026-10-26T15:00:00Z'));
      await news('Unpublished draft', null);
      await news('Archived', new Date('2026-10-22T20:00:00Z'), { status: 'ARCHIVED' });

      const selected = await selectNews(db, WEEK, BASE);
      expect(selected.map((n) => n.title)).toEqual(['First in window', 'Midweek']);
    });

    it('assigns posts around the DST change to the right week', async () => {
      // Mon Oct 26 08:30 PDT → week of Nov 2. Mon Nov 2 07:30 PST (15:30Z) → still week of Nov 2.
      await news('After Oct 26 draft', new Date('2026-10-26T15:30:00Z'));
      await news('Before Nov 2 draft', new Date('2026-11-02T15:30:00Z'));
      await news('After Nov 2 draft', new Date('2026-11-02T16:00:00Z'));
      expect((await selectNews(db, '2026-11-02', BASE)).map((n) => n.title)).toEqual([
        'After Oct 26 draft',
        'Before Nov 2 draft',
      ]);
    });

    it('keeps recruiting structure and prefers an external link', async () => {
      await news('Join the SMC team', new Date('2026-10-21T18:00:00Z'), {
        tag: 'NOW RECRUITING',
        applyEmail: 'smcommittee@uw.edu',
        applyChecklist: ['Your resume', 'The role you’re interested in'],
        openings: {
          create: [
            { position: 2, title: 'Operations', openings: 1 },
            { position: 1, title: 'Finance Officers', openings: 2 },
          ],
        },
      });
      const linked = await news('External story', new Date('2026-10-22T18:00:00Z'), {
        linkUrl: 'https://foster.uw.edu/story',
      });
      const [recruit, external] = await selectNews(db, WEEK, BASE);
      expect(recruit).toMatchObject({
        tag: 'NOW RECRUITING',
        openings: [
          { title: 'Finance Officers', openings: 2 },
          { title: 'Operations', openings: 1 },
        ],
        applyEmail: 'smcommittee@uw.edu',
        applyChecklist: ['Your resume', 'The role you’re interested in'],
      });
      expect(recruit!.url).toMatch(/^https:\/\/smc\.example\/news\/n-\d+$/);
      expect(external!.url).toBe('https://foster.uw.edu/story');
      expect(linked.id).toBe(external!.id);
    });
  });

  describe('composeDigest', () => {
    it('skips the week when there is nothing to say', async () => {
      await event('Draft only', '2026-10-28T18:00', { status: 'DRAFT' });
      const result = await composeDigest(db, { weekKey: WEEK, now: DRAFT_TIME, appBaseUrl: BASE });
      expect(result).toMatchObject({ kind: 'skip', reason: 'no_content' });
    });

    it('builds the snapshot with the Pacific date and template summary', async () => {
      await event('Workshop', '2026-10-28T18:00');
      await event('Coffee chat', '2026-11-04T17:30');
      await news('Join the SMC team', new Date('2026-10-21T18:00:00Z'), {
        openings: {
          create: ['Finance', 'Operations', 'Alumni', 'AI & Tech'].map((title, i) => ({
            position: i + 1,
            title,
          })),
        },
      });
      const result = await composeDigest(db, { weekKey: WEEK, now: DRAFT_TIME, appBaseUrl: BASE });
      if (result.kind !== 'content') throw new Error('expected content');
      expect(result.content.dateLabel).toBe('Monday, October 26, 2026');
      expect(result.content.summary).toBe(
        'Two events to save a seat for, and four open roles on the SMC team.',
      );
      expect(result.content.omitted).toEqual({ events: 0, news: 0 });
      // The snapshot is plain JSON (stored as-is in weekly_digests.content_snapshot).
      expect(JSON.parse(JSON.stringify(result.content))).toEqual(result.content);
    });

    it('caps long weeks and reports what was left out', async () => {
      for (let i = 0; i < MAX_EVENTS + 2; i++)
        await event(`Event ${i}`, `2026-10-${28 + (i % 3)}T1${i % 10}:00`);
      const result = await composeDigest(db, { weekKey: WEEK, now: DRAFT_TIME, appBaseUrl: BASE });
      if (result.kind !== 'content') throw new Error('expected content');
      expect(result.content.events).toHaveLength(MAX_EVENTS);
      expect(result.content.omitted.events).toBe(2);
    });
  });

  describe('recipients', () => {
    it('includes only active, verified, opted-in, unsuppressed members', async () => {
      await member({ email: 'yes@uw.edu' });
      await member({ email: 'yes2@gmail.com' });
      await member({ email: 'optout@uw.edu', newsOptIn: false });
      await member({ email: 'unverified@uw.edu', emailVerifiedAt: null });
      await member({ email: 'inactive@uw.edu', status: 'INACTIVE' });
      await member({ email: 'bounced@uw.edu', emailSuppressedReason: 'HARD_BOUNCE' });
      await member({ email: 'complained@uw.edu', emailSuppressedReason: 'COMPLAINED' });

      const page = await recipientPage(db, null, 100);
      expect(page.map((m) => m.email).sort()).toEqual([
        'author@uw.edu',
        'yes2@gmail.com',
        'yes@uw.edu',
      ]);

      const summary = await recipientSummary(db);
      expect(summary.total).toBe(3);
      expect(summary.byDomain).toEqual([
        { domain: 'uw.edu', count: 2 },
        { domain: 'gmail.com', count: 1 },
      ]);
      // The SQL count and the Prisma filter must agree.
      expect(summary.total).toBe(await db.member.count({ where: RECIPIENT_WHERE }));
    });

    it('pages through recipients in stable order', async () => {
      for (let i = 0; i < 5; i++) await member();
      const first = await recipientPage(db, null, 4);
      const second = await recipientPage(db, first.at(-1)!.id, 4);
      expect(first).toHaveLength(4);
      expect(second).toHaveLength(2);
      expect(new Set([...first, ...second].map((m) => m.id)).size).toBe(6);
    });
  });
});
