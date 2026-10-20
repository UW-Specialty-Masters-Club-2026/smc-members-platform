import { describe, expect, it } from 'vitest';
import { digestSchedule, isPaused, weekKeyFor } from './schedule';

const iso = (d: Date) => d.toISOString();

describe('weekKeyFor', () => {
  it('maps any instant to its Pacific-time Monday', () => {
    expect(weekKeyFor(new Date('2026-10-26T15:00:00Z'))).toBe('2026-10-26'); // Mon 08:00 PDT
    expect(weekKeyFor(new Date('2026-10-28T20:00:00Z'))).toBe('2026-10-26'); // Wed
    expect(weekKeyFor(new Date('2026-11-02T06:59:00Z'))).toBe('2026-10-26'); // Sun 22:59 PST
    expect(weekKeyFor(new Date('2026-11-02T08:00:00Z'))).toBe('2026-11-02'); // Mon 00:00 PST
  });

  it('uses the Pacific date, not the UTC date', () => {
    // Monday 2026-10-26 01:00 UTC is still Sunday evening in Seattle.
    expect(weekKeyFor(new Date('2026-10-26T01:00:00Z'))).toBe('2026-10-19');
  });
});

describe('digestSchedule', () => {
  it('computes a normal PDT Monday', () => {
    const s = digestSchedule('2026-10-26');
    expect(iso(s.draftAt)).toBe('2026-10-26T15:00:00.000Z'); // 08:00 PDT
    expect(iso(s.sendNotBefore)).toBe('2026-10-26T16:00:00.000Z'); // 09:00 PDT
    expect(iso(s.expiresAt)).toBe('2026-10-27T01:00:00.000Z'); // 18:00 PDT
    expect(iso(s.windowStart)).toBe('2026-10-19T15:00:00.000Z');
    expect(iso(s.windowEnd)).toBe(iso(s.draftAt));
  });

  it('handles the first Monday after DST ends (Nov 1, 2026)', () => {
    const s = digestSchedule('2026-11-02');
    expect(iso(s.draftAt)).toBe('2026-11-02T16:00:00.000Z'); // 08:00 PST
    expect(iso(s.sendNotBefore)).toBe('2026-11-02T17:00:00.000Z');
    expect(iso(s.expiresAt)).toBe('2026-11-03T02:00:00.000Z');
    // Window starts at the previous Monday's 08:00 PDT, so it spans 7 days + 1 hour.
    expect(iso(s.windowStart)).toBe('2026-10-26T15:00:00.000Z');
    expect(s.windowEnd.getTime() - s.windowStart.getTime()).toBe((7 * 24 + 1) * 3_600_000);
  });

  it('handles the first Monday after DST starts (Mar 14, 2027)', () => {
    const s = digestSchedule('2027-03-15');
    expect(iso(s.draftAt)).toBe('2027-03-15T15:00:00.000Z'); // 08:00 PDT
    expect(iso(s.windowStart)).toBe('2027-03-08T16:00:00.000Z'); // 08:00 PST
    expect(s.windowEnd.getTime() - s.windowStart.getTime()).toBe((7 * 24 - 1) * 3_600_000);
  });

  it('leaves no gap or overlap between consecutive weeks', () => {
    const weeks = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'].map(digestSchedule);
    for (let i = 1; i < weeks.length; i++) {
      expect(iso(weeks[i]!.windowStart)).toBe(iso(weeks[i - 1]!.windowEnd));
    }
  });

  it('rejects keys that are not Mondays', () => {
    expect(() => digestSchedule('2026-10-27')).toThrow(/Monday/);
    expect(() => digestSchedule('2026-10-26T08:00')).toThrow(/Monday/);
  });
});

describe('isPaused', () => {
  const now = new Date('2026-07-06T15:00:00Z');
  it('honours manual pauses and pause-until dates', () => {
    expect(isPaused(null, now)).toBe(false);
    expect(isPaused({ paused: false, pausedUntil: null }, now)).toBe(false);
    expect(isPaused({ paused: true, pausedUntil: null }, now)).toBe(true);
    expect(isPaused({ paused: true, pausedUntil: new Date('2026-09-28T07:00:00Z') }, now)).toBe(
      true,
    );
    expect(isPaused({ paused: true, pausedUntil: new Date('2026-07-01T07:00:00Z') }, now)).toBe(
      false,
    );
  });
});
