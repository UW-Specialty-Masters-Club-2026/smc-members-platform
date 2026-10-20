import { CLUB_TIMEZONE } from '@smc/core/time';
import { Cron } from 'croner';

/**
 * Wall-clock schedules in America/Los_Angeles (never hard-coded UTC): croner resolves each
 * occurrence in the club's timezone, so 08:00 PT stays 08:00 PT across PDT ↔ PST.
 */
export const DIGEST_CRONS = [
  { name: 'monday-draft', pattern: '0 8 * * 1' },
  { name: 'monday-send-gate', pattern: '0 9 * * 1' },
  { name: 'monday-expire', pattern: '0 18 * * 1' },
  { name: 'every-minute', pattern: '* * * * *' },
] as const;

/** Next occurrences of a pattern after `from`, in the club timezone. */
export function nextRuns(pattern: string, from: Date, count: number): Date[] {
  const cron = new Cron(pattern, { timezone: CLUB_TIMEZONE, paused: true });
  try {
    return cron.nextRuns(count, from);
  } finally {
    cron.stop();
  }
}

/** Start every digest schedule; each one simply triggers a (idempotent) tick. */
export function startDigestCrons(onTick: (name: string) => Promise<void>): () => void {
  let running = false;
  const jobs = DIGEST_CRONS.map(
    ({ name, pattern }) =>
      new Cron(pattern, { timezone: CLUB_TIMEZONE, protect: true }, async () => {
        if (running) return; // ticks never overlap
        running = true;
        try {
          await onTick(name);
        } finally {
          running = false;
        }
      }),
  );
  return () => jobs.forEach((j) => j.stop());
}
