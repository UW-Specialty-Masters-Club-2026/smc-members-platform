import articles from './articles.json';
import gallery from './gallery.json';
import newsletters from './newsletters.json';
import pastEvents from './past-events.json';
import team from './team.json';

export * from './site';
export * from './skills';

export type Article = (typeof articles)[number];
export type TeamMember = (typeof team)[number];
export type Newsletter = (typeof newsletters)[number];
export type PastEvent = (typeof pastEvents)[number];

export const ARTICLES: Article[] = articles;
export const TEAM: TeamMember[] = team;
export const NEWSLETTERS: Newsletter[] = newsletters;
export const PAST_EVENTS: PastEvent[] = pastEvents;
export const GALLERY = gallery;

export const ARTICLE_CATEGORIES = [...new Set(ARTICLES.map((a) => a.category))];

/** "February 2026" from an ISO date (the old site showed month and year). */
export function monthYear(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
