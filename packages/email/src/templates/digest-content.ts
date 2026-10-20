/** The weekly digest's content model (the snapshot the admin approves and the template renders). */

/**
 * Everything the email shows, copied from the database at draft time. The admin previews
 * and approves exactly this snapshot; nothing in it is invented or inferred.
 */
export interface DigestContent {
  weekKey: string;
  /** "Monday, October 26, 2026" (Pacific date). */
  dateLabel: string;
  /** One-sentence hero line built from the counts below (template, not AI). */
  summary: string;
  events: DigestEvent[];
  news: DigestNews[];
  /** Items left out to keep the email short; shown to the admin in the preview. */
  omitted: { events: number; news: number };
}

export interface DigestEvent {
  id: string;
  title: string;
  summary: string;
  /** "Wed, Oct 28 · 6:00–7:30 PM PT" */
  when: string;
  startsAt: string;
  location: string;
  /** "18 of 30 seats left" | "Full · Join the waitlist" | null (unlimited) */
  seats: string | null;
  action: 'REGISTER' | 'JOIN_WAITLIST';
  url: string;
}

export interface DigestNews {
  id: string;
  tag: string | null;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  openings: { title: string; openings: number }[];
  applyEmail: string | null;
  applyChecklist: string[];
}
