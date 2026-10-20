export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

export interface AvailabilityInput {
  status: EventStatus;
  startsAt: Date;
  registrationOpen: boolean;
  registrationClosesAt: Date | null;
  /** null = unlimited seats */
  capacity: number | null;
  waitlistEnabled: boolean;
  confirmedCount: number;
}

export type ClosedReason =
  'not_published' | 'cancelled' | 'completed' | 'started' | 'registration_closed';

export type Availability =
  | { kind: 'open'; seatsLeft: number | null }
  | { kind: 'waitlist' }
  | { kind: 'full' }
  | { kind: 'closed'; reason: ClosedReason };

/**
 * Single source of truth for "can a member sign up right now, and how": used by the
 * registration endpoint, the event pages and the weekly digest's event selection.
 */
export function eventAvailability(e: AvailabilityInput, now: Date): Availability {
  if (e.status === 'DRAFT') return { kind: 'closed', reason: 'not_published' };
  if (e.status === 'CANCELLED') return { kind: 'closed', reason: 'cancelled' };
  if (e.status === 'COMPLETED') return { kind: 'closed', reason: 'completed' };
  if (e.startsAt <= now) return { kind: 'closed', reason: 'started' };
  if (!e.registrationOpen || (e.registrationClosesAt && e.registrationClosesAt <= now)) {
    return { kind: 'closed', reason: 'registration_closed' };
  }
  if (e.capacity === null) return { kind: 'open', seatsLeft: null };
  const seatsLeft = Math.max(0, e.capacity - e.confirmedCount);
  if (seatsLeft > 0) return { kind: 'open', seatsLeft };
  return e.waitlistEnabled ? { kind: 'waitlist' } : { kind: 'full' };
}

/** Seat line shown on event pages and in the digest, or null when seats are unlimited. */
export function seatsLabel(capacity: number | null, confirmedCount: number): string | null {
  if (capacity === null) return null;
  const left = Math.max(0, capacity - confirmedCount);
  if (left === 0) return 'Full · Join the waitlist';
  return `${left} of ${capacity} ${capacity === 1 ? 'seat' : 'seats'} left`;
}
