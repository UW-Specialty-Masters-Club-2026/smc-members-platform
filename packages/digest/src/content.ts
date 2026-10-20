import { eventAvailability, seatsLabel } from '@smc/core/events';
import { formatPtLongDate, formatPtRange } from '@smc/core/time';
import { countsFor, type PrismaClient } from '@smc/db';
import { digestSchedule } from './schedule';
import type { DigestContent, DigestEvent, DigestNews } from '@smc/email';
import { summarize } from './summary';

export type { DigestContent, DigestEvent, DigestNews };

export const MAX_EVENTS = 8;
export const MAX_NEWS = 6;
export const DEFAULT_LOOKAHEAD_DAYS = 21;

export interface ComposeOptions {
  weekKey: string;
  /** Composition time; events must start after it. */
  now: Date;
  appBaseUrl: string;
  lookaheadDays?: number;
}

export type ComposeResult =
  | { kind: 'content'; content: DigestContent }
  | { kind: 'skip'; reason: 'no_content'; detail: string };

export async function selectNews(db: PrismaClient, weekKey: string, appBaseUrl: string) {
  const { windowStart, windowEnd } = digestSchedule(weekKey);
  const posts = await db.newsPost.findMany({
    where: { status: 'PUBLISHED', publishedAt: { gte: windowStart, lt: windowEnd } },
    orderBy: { publishedAt: 'asc' },
    include: { openings: { orderBy: { position: 'asc' } } },
  });
  return posts.map((p): DigestNews => ({
    id: p.id,
    tag: p.tag,
    title: p.title,
    summary: p.summary,
    url: p.linkUrl ?? `${appBaseUrl}/news/${p.slug}`,
    publishedAt: p.publishedAt!.toISOString(),
    openings: p.openings.map((o) => ({ title: o.title, openings: o.openings })),
    applyEmail: p.applyEmail,
    applyChecklist: (p.applyChecklist as string[] | null) ?? [],
  }));
}

/**
 * Upcoming published events members can still sign up for (a seat or the waitlist).
 * Draft, cancelled, completed, started, closed and full-without-waitlist events are excluded
 * by the same availability rule the registration endpoint enforces.
 */
export async function selectEvents(
  db: PrismaClient,
  now: Date,
  appBaseUrl: string,
  lookaheadDays = DEFAULT_LOOKAHEAD_DAYS,
) {
  const until = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60_000);
  const events = await db.event.findMany({
    where: { status: 'PUBLISHED', startsAt: { gt: now, lte: until } },
    orderBy: { startsAt: 'asc' },
  });
  const counts = await countsFor(
    db,
    events.map((e) => e.id),
  );
  const selected: DigestEvent[] = [];
  for (const e of events) {
    const c = counts.get(e.id)!;
    const availability = eventAvailability({ ...e, confirmedCount: c.confirmed }, now);
    if (availability.kind !== 'open' && availability.kind !== 'waitlist') continue;
    selected.push({
      id: e.id,
      title: e.title,
      summary: e.summary,
      when: formatPtRange(e.startsAt, e.endsAt),
      startsAt: e.startsAt.toISOString(),
      location: e.location,
      seats: seatsLabel(e.capacity, c.confirmed),
      action: availability.kind === 'open' ? 'REGISTER' : 'JOIN_WAITLIST',
      url: `${appBaseUrl}/events/${e.slug}`,
    });
  }
  return selected;
}

/** Build the week's digest content, or explain why there is nothing to send. */
export async function composeDigest(
  db: PrismaClient,
  opts: ComposeOptions,
): Promise<ComposeResult> {
  const schedule = digestSchedule(opts.weekKey);
  const [allNews, allEvents] = await Promise.all([
    selectNews(db, opts.weekKey, opts.appBaseUrl),
    selectEvents(db, opts.now, opts.appBaseUrl, opts.lookaheadDays),
  ]);

  if (allNews.length === 0 && allEvents.length === 0) {
    return {
      kind: 'skip',
      reason: 'no_content',
      detail:
        'No news was published in the past week and no upcoming events have open registration.',
    };
  }

  const events = allEvents.slice(0, MAX_EVENTS);
  const news = allNews.slice(0, MAX_NEWS);
  return {
    kind: 'content',
    content: {
      weekKey: opts.weekKey,
      dateLabel: formatPtLongDate(schedule.draftAt),
      summary: summarize(events, news),
      events,
      news,
      omitted: { events: allEvents.length - events.length, news: allNews.length - news.length },
    },
  };
}
