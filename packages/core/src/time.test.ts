import { describe, expect, it } from 'vitest';
import {
  formatPtLongDate,
  formatPtRange,
  InvalidLocalTimeError,
  parsePtLocal,
  toPtLocalInput,
} from './time';

// DST in America/Los_Angeles: ends Sun 2026-11-01 02:00 PDT → 01:00 PST,
// starts Sun 2027-03-14 02:00 PST → 03:00 PDT.

describe('parsePtLocal', () => {
  it('uses PDT (UTC-7) before the November switch and PST (UTC-8) after', () => {
    expect(parsePtLocal('2026-10-26T08:00').toISOString()).toBe('2026-10-26T15:00:00.000Z');
    expect(parsePtLocal('2026-11-02T08:00').toISOString()).toBe('2026-11-02T16:00:00.000Z');
  });

  it('switches back to PDT in March', () => {
    expect(parsePtLocal('2027-03-08T08:00').toISOString()).toBe('2027-03-08T16:00:00.000Z');
    expect(parsePtLocal('2027-03-15T08:00').toISOString()).toBe('2027-03-15T15:00:00.000Z');
  });

  it('rejects wall times skipped by spring-forward', () => {
    expect(() => parsePtLocal('2027-03-14T02:30')).toThrow(InvalidLocalTimeError);
  });

  it('resolves the repeated fall-back hour to its first (PDT) occurrence', () => {
    expect(parsePtLocal('2026-11-01T01:30').toISOString()).toBe('2026-11-01T08:30:00.000Z');
  });

  it('rejects malformed input', () => {
    for (const bad of ['2026-10-26', '2026-10-26 08:00', '2026-13-01T08:00', '2026-10-26T08:00Z']) {
      expect(() => parsePtLocal(bad)).toThrow(InvalidLocalTimeError);
    }
  });

  it('round-trips through toPtLocalInput', () => {
    for (const local of ['2026-10-26T18:30', '2026-11-02T09:00', '2027-03-15T07:45']) {
      expect(toPtLocalInput(parsePtLocal(local))).toBe(local);
    }
  });
});

describe('formatPtRange', () => {
  const pt = parsePtLocal;

  it('formats a same-day range within one half of the day', () => {
    expect(formatPtRange(pt('2026-10-28T18:00'), pt('2026-10-28T19:30'))).toBe(
      'Wed, Oct 28 · 6:00–7:30 PM PT',
    );
  });

  it('formats a range crossing noon', () => {
    expect(formatPtRange(pt('2026-10-28T11:00'), pt('2026-10-28T13:00'))).toBe(
      'Wed, Oct 28 · 11:00 AM – 1:00 PM PT',
    );
  });

  it('formats a multi-day range', () => {
    expect(formatPtRange(pt('2026-10-30T18:00'), pt('2026-10-31T01:00'))).toBe(
      'Fri, Oct 30, 6:00 PM – Sat, Oct 31, 1:00 AM PT',
    );
  });

  it('shows the Pacific date even when the UTC date differs', () => {
    // 2026-11-03T05:00Z is still Monday evening in Seattle.
    expect(formatPtRange(new Date('2026-11-03T05:00:00Z'), null)).toBe('Mon, Nov 2 · 9:00 PM PT');
  });

  it('labels both PDT and PST times simply "PT"', () => {
    expect(formatPtRange(pt('2026-10-26T09:00'), null)).toMatch(/9:00 AM PT$/);
    expect(formatPtRange(pt('2026-11-02T09:00'), null)).toMatch(/9:00 AM PT$/);
  });
});

describe('formatPtLongDate', () => {
  it('names the Pacific calendar day', () => {
    expect(formatPtLongDate(new Date('2026-10-26T15:00:00Z'))).toBe('Monday, October 26, 2026');
  });
});
