import { describe, expect, it } from 'vitest';
import { eventAvailability, seatsLabel, type AvailabilityInput } from './events';

const now = new Date('2026-10-26T16:00:00Z');
const base: AvailabilityInput = {
  status: 'PUBLISHED',
  startsAt: new Date('2026-10-28T01:00:00Z'),
  registrationOpen: true,
  registrationClosesAt: null,
  capacity: 30,
  waitlistEnabled: true,
  confirmedCount: 12,
};

describe('eventAvailability', () => {
  it('is open with seats left', () => {
    expect(eventAvailability(base, now)).toEqual({ kind: 'open', seatsLeft: 18 });
  });

  it('is open without a seat count when capacity is unlimited', () => {
    expect(eventAvailability({ ...base, capacity: null }, now)).toEqual({
      kind: 'open',
      seatsLeft: null,
    });
  });

  it('offers the waitlist when full, or nothing if the waitlist is off', () => {
    expect(eventAvailability({ ...base, confirmedCount: 30 }, now)).toEqual({ kind: 'waitlist' });
    expect(eventAvailability({ ...base, confirmedCount: 30, waitlistEnabled: false }, now)).toEqual(
      {
        kind: 'full',
      },
    );
  });

  it.each([
    ['DRAFT', 'not_published'],
    ['CANCELLED', 'cancelled'],
    ['COMPLETED', 'completed'],
  ] as const)('is closed for %s events', (status, reason) => {
    expect(eventAvailability({ ...base, status }, now)).toEqual({ kind: 'closed', reason });
  });

  it('closes once the event has started', () => {
    expect(eventAvailability({ ...base, startsAt: now }, now)).toEqual({
      kind: 'closed',
      reason: 'started',
    });
  });

  it('respects the registration switch and deadline', () => {
    expect(eventAvailability({ ...base, registrationOpen: false }, now)).toMatchObject({
      reason: 'registration_closed',
    });
    expect(
      eventAvailability({ ...base, registrationClosesAt: new Date('2026-10-26T15:59:00Z') }, now),
    ).toMatchObject({ reason: 'registration_closed' });
    expect(
      eventAvailability({ ...base, registrationClosesAt: new Date('2026-10-27T00:00:00Z') }, now),
    ).toMatchObject({ kind: 'open' });
  });
});

describe('seatsLabel', () => {
  it('matches the digest wording', () => {
    expect(seatsLabel(30, 12)).toBe('18 of 30 seats left');
    expect(seatsLabel(30, 29)).toBe('1 of 30 seats left');
    expect(seatsLabel(1, 0)).toBe('1 of 1 seat left');
    expect(seatsLabel(30, 30)).toBe('Full · Join the waitlist');
    expect(seatsLabel(30, 31)).toBe('Full · Join the waitlist');
    expect(seatsLabel(null, 5)).toBeNull();
  });
});
