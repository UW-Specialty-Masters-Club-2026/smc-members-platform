import { CLUB_TIMEZONE, parsePtLocal } from '@smc/core/time';
import { DateTime } from 'luxon';

/** Monday times in Pacific Time (America/Los_Angeles); DST is handled by the timezone math. */
export const DRAFT_TIME_PT = '08:00';
export const SEND_NOT_BEFORE_PT = '09:00';
export const EXPIRES_AT_PT = '18:00';

const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The digest week an instant belongs to, identified by that week's Monday as a Pacific
 * calendar date. Weeks run Monday 00:00 to Sunday 23:59 PT.
 */
export function weekKeyFor(instant: Date): string {
  return DateTime.fromJSDate(instant, { zone: CLUB_TIMEZONE }).startOf('week').toISODate()!;
}

export function assertWeekKey(weekKey: string): void {
  const day = DateTime.fromISO(weekKey, { zone: CLUB_TIMEZONE });
  if (!WEEK_KEY.test(weekKey) || !day.isValid || day.weekday !== 1) {
    throw new Error(`not a Monday week key: ${weekKey}`);
  }
}

export interface DigestSchedule {
  weekKey: string;
  /** Monday 08:00 PT: the scheduler drafts the issue and asks for approval. */
  draftAt: Date;
  /** Monday 09:00 PT: the earliest an approved issue may go out. */
  sendNotBefore: Date;
  /** Monday 18:00 PT: an issue still unapproved expires. */
  expiresAt: Date;
  /** News published in [windowStart, windowEnd) — the previous draft time to this one. */
  windowStart: Date;
  windowEnd: Date;
}

export function digestSchedule(weekKey: string): DigestSchedule {
  assertWeekKey(weekKey);
  const previousMonday = DateTime.fromISO(weekKey, { zone: CLUB_TIMEZONE })
    .minus({ weeks: 1 })
    .toISODate()!;
  const at = (day: string, time: string) => parsePtLocal(`${day}T${time}`);
  return {
    weekKey,
    draftAt: at(weekKey, DRAFT_TIME_PT),
    sendNotBefore: at(weekKey, SEND_NOT_BEFORE_PT),
    expiresAt: at(weekKey, EXPIRES_AT_PT),
    windowStart: at(previousMonday, DRAFT_TIME_PT),
    windowEnd: at(weekKey, DRAFT_TIME_PT),
  };
}

export interface PauseSettings {
  paused: boolean;
  pausedUntil: Date | null;
}

/** Paused until unpaused by hand, or until `pausedUntil` passes. */
export function isPaused(settings: PauseSettings | null, now: Date): boolean {
  if (!settings?.paused) return false;
  return settings.pausedUntil === null || settings.pausedUntil > now;
}
