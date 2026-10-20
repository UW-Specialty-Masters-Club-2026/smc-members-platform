import { DateTime } from 'luxon';

/** The club's timezone. All schedules and displayed dates use it, labelled "PT". */
export const CLUB_TIMEZONE = 'America/Los_Angeles';

const LOCAL_INPUT = "yyyy-MM-dd'T'HH:mm";

export class InvalidLocalTimeError extends Error {
  constructor(
    public readonly input: string,
    public readonly reason: 'malformed' | 'nonexistent',
  ) {
    super(`${reason} Pacific Time: ${input}`);
    this.name = 'InvalidLocalTimeError';
  }
}

function inPt(date: Date): DateTime {
  return DateTime.fromJSDate(date, { zone: CLUB_TIMEZONE });
}

/**
 * Convert a Pacific wall-clock time (`YYYY-MM-DDTHH:mm`, as from `<input type="datetime-local">`)
 * to an absolute instant. Times skipped by the spring-forward jump are rejected; times repeated
 * by the fall-back hour resolve to the first occurrence (PDT).
 */
export function parsePtLocal(local: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    throw new InvalidLocalTimeError(local, 'malformed');
  }
  const dt = DateTime.fromFormat(local, LOCAL_INPUT, { zone: CLUB_TIMEZONE });
  if (!dt.isValid) throw new InvalidLocalTimeError(local, 'malformed');
  // Luxon moves a wall time inside the DST gap forward; a round-trip mismatch exposes it.
  if (dt.toFormat(LOCAL_INPUT) !== local) throw new InvalidLocalTimeError(local, 'nonexistent');
  return dt.toJSDate();
}

/** Instant → Pacific wall-clock string for pre-filling a datetime-local input. */
export function toPtLocalInput(date: Date): string {
  return inPt(date).toFormat(LOCAL_INPUT);
}

/** "Wed, Oct 28" */
export function formatPtDate(date: Date): string {
  return inPt(date).toFormat('ccc, LLL d');
}

/** "Monday, October 26, 2026" — for digest headers. */
export function formatPtLongDate(date: Date): string {
  return inPt(date).toFormat('cccc, LLLL d, yyyy');
}

/** "6:00 PM" */
export function formatPtTime(date: Date): string {
  return inPt(date).toFormat('h:mm a');
}

/**
 * Human event time in Pacific Time, always suffixed "PT":
 *   same day, same half: "Wed, Oct 28 · 6:00–7:30 PM PT"
 *   same day:            "Wed, Oct 28 · 11:00 AM – 1:00 PM PT"
 *   multi-day:           "Fri, Oct 30, 6:00 PM – Sat, Oct 31, 1:00 AM PT"
 */
export function formatPtRange(start: Date, end: Date | null): string {
  const s = inPt(start);
  if (!end) return `${s.toFormat('ccc, LLL d')} · ${s.toFormat('h:mm a')} PT`;
  const e = inPt(end);
  if (!s.hasSame(e, 'day')) {
    return `${s.toFormat('ccc, LLL d, h:mm a')} – ${e.toFormat('ccc, LLL d, h:mm a')} PT`;
  }
  const day = s.toFormat('ccc, LLL d');
  if (s.toFormat('a') === e.toFormat('a')) {
    return `${day} · ${s.toFormat('h:mm')}–${e.toFormat('h:mm a')} PT`;
  }
  return `${day} · ${s.toFormat('h:mm a')} – ${e.toFormat('h:mm a')} PT`;
}
