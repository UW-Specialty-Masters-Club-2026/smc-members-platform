import { describe, expect, it } from 'vitest';
import { summarize } from './summary';

const events = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}` }));
const recruiting = (roles: number) => ({
  openings: Array.from({ length: roles }, (_, i) => ({ title: `Role ${i}`, openings: 1 })),
});
const update = { openings: [] };

describe('summarize', () => {
  it('reproduces the approved design copy', () => {
    expect(summarize(events(2), [recruiting(4)])).toBe(
      'Two events to save a seat for, and four open roles on the SMC team.',
    );
  });

  it('handles singulars and single parts', () => {
    expect(summarize(events(1), [])).toBe('One event to save a seat for.');
    expect(summarize([], [recruiting(1)])).toBe('One open role on the SMC team.');
    expect(summarize([], [update])).toBe('One club update.');
  });

  it('lists three parts with commas', () => {
    expect(summarize(events(3), [recruiting(2), update, update])).toBe(
      'Three events to save a seat for, two open roles on the SMC team, and two club updates.',
    );
  });

  it('falls back to digits above ten', () => {
    expect(summarize(events(12), [])).toBe('12 events to save a seat for.');
  });
});
