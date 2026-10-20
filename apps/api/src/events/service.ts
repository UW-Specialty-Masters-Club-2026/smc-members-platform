import { randomBytes } from 'node:crypto';
import {
  eventAvailability,
  formatPtRange,
  seatsLabel,
  type Availability,
  type ClosedReason,
} from '@smc/core';
import {
  Prisma,
  recordAudit,
  type Event,
  type MemberRole,
  type PrismaClient,
  type RegistrationStatus,
} from '@smc/db';
import type { AppContext } from '../context';
import { HttpError } from '../errors';

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

export interface EventCounts {
  confirmed: number;
  waitlisted: number;
}

const ACTIVE: RegistrationStatus[] = ['CONFIRMED', 'WAITLISTED'];

// ─── Reading ───────────────────────────────────────────────────────

export async function countsFor(db: Db, eventIds: string[]): Promise<Map<string, EventCounts>> {
  const rows = await db.registration.groupBy({
    by: ['eventId', 'status'],
    where: { eventId: { in: eventIds }, status: { in: ACTIVE } },
    _count: { _all: true },
  });
  const map = new Map<string, EventCounts>(
    eventIds.map((id) => [id, { confirmed: 0, waitlisted: 0 }]),
  );
  for (const row of rows) {
    const c = map.get(row.eventId)!;
    if (row.status === 'CONFIRMED') c.confirmed = row._count._all;
    else c.waitlisted = row._count._all;
  }
  return map;
}

export function availabilityOf(event: Event, counts: EventCounts, now: Date): Availability {
  return eventAvailability({ ...event, confirmedCount: counts.confirmed }, now);
}

export function eventView(
  event: Event,
  counts: EventCounts,
  now: Date,
  myRegistration: RegistrationStatus | null = null,
) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    details: event.details,
    status: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    when: formatPtRange(event.startsAt, event.endsAt),
    location: event.location,
    capacity: event.capacity,
    waitlistEnabled: event.waitlistEnabled,
    registrationOpen: event.registrationOpen,
    registrationClosesAt: event.registrationClosesAt,
    confirmedCount: counts.confirmed,
    waitlistCount: counts.waitlisted,
    seats: seatsLabel(event.capacity, counts.confirmed),
    availability: availabilityOf(event, counts, now),
    myRegistration: myRegistration === 'CANCELLED' ? null : myRegistration,
  };
}

// ─── Registration ──────────────────────────────────────────────────

/**
 * Seat decisions run in READ COMMITTED so that, once the event row lock is held, every
 * read sees registrations committed by transactions that held it before us. (Under
 * MySQL's default REPEATABLE READ a snapshot taken before the lock would hide them.)
 */
const SEAT_TX = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

/**
 * Lock the event row and return it. Must be the transaction's first statement: it
 * serializes every seat decision for the event.
 */
async function lockEvent(tx: Tx, where: { id: string } | { slug: string }): Promise<Event | null> {
  const rows =
    'id' in where
      ? await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM events WHERE id = ${where.id} FOR UPDATE`
      : await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM events WHERE slug = ${where.slug} FOR UPDATE`;
  const id = rows[0]?.id;
  return id ? tx.event.findUniqueOrThrow({ where: { id } }) : null;
}

const CLOSED_CODE: Record<ClosedReason, string> = {
  not_published: 'event_not_found',
  cancelled: 'event_cancelled',
  completed: 'event_completed',
  started: 'event_started',
  registration_closed: 'registration_closed',
};

export interface RegisterResult {
  status: RegistrationStatus;
  /** false when the member was already registered (repeat clicks are harmless). */
  created: boolean;
}

/**
 * Register a member: a confirmed seat while seats remain, otherwise the waitlist.
 * The event row lock makes concurrent registrations unable to oversell.
 */
export async function register(
  ctx: AppContext,
  runId: string,
  slug: string,
  memberId: string,
): Promise<RegisterResult> {
  const now = ctx.now();
  return ctx.prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, { slug });
    if (!event) throw new HttpError(404, 'event_not_found');

    const existing = await tx.registration.findUnique({
      where: { eventId_memberId: { eventId: event.id, memberId } },
    });
    if (existing && ACTIVE.includes(existing.status)) {
      return { status: existing.status, created: false };
    }

    const counts = (await countsFor(tx, [event.id])).get(event.id)!;
    const availability = availabilityOf(event, counts, now);
    let status: RegistrationStatus;
    if (availability.kind === 'open') status = 'CONFIRMED';
    else if (availability.kind === 'waitlist') status = 'WAITLISTED';
    else if (availability.kind === 'full') throw new HttpError(409, 'event_full');
    else
      throw new HttpError(
        availability.reason === 'not_published' ? 404 : 409,
        CLOSED_CODE[availability.reason],
      );

    const data = {
      status,
      registeredAt: now,
      confirmedAt: status === 'CONFIRMED' ? now : null,
      cancelledAt: null,
    };
    const registration = existing
      ? await tx.registration.update({ where: { id: existing.id }, data })
      : await tx.registration.create({ data: { ...data, eventId: event.id, memberId } });

    await recordAudit(tx, {
      runId,
      actorType: 'MEMBER',
      actorId: memberId,
      action: 'registration.created',
      entityType: 'registration',
      entityId: registration.id,
      result: 'SUCCESS',
      metadata: { eventId: event.id, status },
    });
    return { status, created: true };
  }, SEAT_TX);
}

/** Cancel the member's own registration; a freed seat goes to the head of the waitlist. */
export async function cancelRegistration(
  ctx: AppContext,
  runId: string,
  slug: string,
  memberId: string,
): Promise<void> {
  const now = ctx.now();
  await ctx.prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, { slug });
    if (!event) throw new HttpError(404, 'event_not_found');
    if (event.startsAt <= now) throw new HttpError(409, 'event_started');

    const registration = await tx.registration.findUnique({
      where: { eventId_memberId: { eventId: event.id, memberId } },
    });
    if (!registration || !ACTIVE.includes(registration.status)) {
      throw new HttpError(404, 'registration_not_found');
    }
    await tx.registration.update({
      where: { id: registration.id },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    await recordAudit(tx, {
      runId,
      actorType: 'MEMBER',
      actorId: memberId,
      action: 'registration.cancelled',
      entityType: 'registration',
      entityId: registration.id,
      result: 'SUCCESS',
      metadata: { eventId: event.id, from: registration.status },
    });
    if (registration.status === 'CONFIRMED') await promoteWaitlist(tx, event, now, runId);
  }, SEAT_TX);
}

/** Fill free seats from the waitlist in sign-up order. Caller must hold the event lock. */
async function promoteWaitlist(tx: Tx, event: Event, now: Date, runId: string): Promise<void> {
  if (event.status !== 'PUBLISHED' || event.startsAt <= now) return;
  const { confirmed } = (await countsFor(tx, [event.id])).get(event.id)!;
  const free = event.capacity === null ? Number.MAX_SAFE_INTEGER : event.capacity - confirmed;
  if (free <= 0) return;

  const next = await tx.registration.findMany({
    where: { eventId: event.id, status: 'WAITLISTED' },
    orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
    take: Math.min(free, 1000),
  });
  for (const r of next) {
    await tx.registration.update({
      where: { id: r.id },
      data: { status: 'CONFIRMED', confirmedAt: now },
    });
    await recordAudit(tx, {
      runId,
      actorType: 'SYSTEM',
      action: 'registration.promoted',
      entityType: 'registration',
      entityId: r.id,
      result: 'SUCCESS',
      metadata: { eventId: event.id, memberId: r.memberId },
    });
  }
}

// ─── Staff: create, edit, status changes ───────────────────────────

export interface EventInput {
  title: string;
  summary: string;
  details: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  capacity: number | null;
  waitlistEnabled: boolean;
  registrationOpen: boolean;
  registrationClosesAt: Date | null;
}

export interface Staff {
  memberId: string;
  role: MemberRole;
}

function checkTimes(input: Pick<EventInput, 'startsAt' | 'endsAt' | 'registrationClosesAt'>) {
  if (input.endsAt && input.endsAt <= input.startsAt) throw new HttpError(400, 'ends_before_start');
  if (input.registrationClosesAt && input.registrationClosesAt > input.startsAt) {
    throw new HttpError(400, 'registration_closes_after_start');
  }
}

export function slugify(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return `${base || 'event'}-${randomBytes(3).toString('hex')}`;
}

export async function createEvent(ctx: AppContext, runId: string, staff: Staff, input: EventInput) {
  checkTimes(input);
  return ctx.prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: { ...input, slug: slugify(input.title), createdById: staff.memberId },
    });
    await recordAudit(tx, {
      runId,
      actorType: 'ADMIN',
      actorId: staff.memberId,
      action: 'event.created',
      entityType: 'event',
      entityId: event.id,
      result: 'SUCCESS',
      metadata: { role: staff.role, title: event.title },
    });
    return event;
  });
}

export async function updateEvent(
  ctx: AppContext,
  runId: string,
  staff: Staff,
  eventId: string,
  input: Partial<EventInput>,
) {
  const now = ctx.now();
  return ctx.prisma.$transaction(async (tx) => {
    const before = await lockEvent(tx, { id: eventId });
    if (!before) throw new HttpError(404, 'event_not_found');
    if (before.status === 'CANCELLED' || before.status === 'COMPLETED') {
      throw new HttpError(409, 'event_locked');
    }
    checkTimes({ ...before, ...input });

    if (input.capacity !== undefined && input.capacity !== null) {
      const { confirmed } = (await countsFor(tx, [eventId])).get(eventId)!;
      if (input.capacity < confirmed) throw new HttpError(409, 'capacity_below_confirmed');
    }

    const event = await tx.event.update({ where: { id: eventId }, data: input });
    const changed = Object.keys(input).filter(
      (k) => String(before[k as keyof Event]) !== String(event[k as keyof Event]),
    );
    await recordAudit(tx, {
      runId,
      actorType: 'ADMIN',
      actorId: staff.memberId,
      action: 'event.updated',
      entityType: 'event',
      entityId: eventId,
      result: 'SUCCESS',
      metadata: { role: staff.role, changed },
    });
    await promoteWaitlist(tx, event, now, runId);
    return event;
  }, SEAT_TX);
}

const TRANSITIONS = {
  publish: { from: ['DRAFT'], to: 'PUBLISHED', stamp: 'publishedAt' },
  cancel: { from: ['DRAFT', 'PUBLISHED'], to: 'CANCELLED', stamp: 'cancelledAt' },
  complete: { from: ['PUBLISHED'], to: 'COMPLETED', stamp: 'completedAt' },
} as const;

export type EventAction = keyof typeof TRANSITIONS;

/**
 * Move an event through Draft → Published → Cancelled/Completed. The conditional update
 * makes a repeated click a no-op error instead of a second transition.
 */
export async function transitionEvent(
  ctx: AppContext,
  runId: string,
  staff: Staff,
  eventId: string,
  action: EventAction,
) {
  const t = TRANSITIONS[action];
  const now = ctx.now();
  return ctx.prisma.$transaction(async (tx) => {
    const before = await tx.event.findUnique({ where: { id: eventId } });
    if (!before) throw new HttpError(404, 'event_not_found');
    if (action === 'publish' && before.startsAt <= now) {
      throw new HttpError(409, 'event_in_past');
    }
    const updated = await tx.event.updateMany({
      where: { id: eventId, status: { in: [...t.from] } },
      data: { status: t.to, [t.stamp]: now },
    });
    if (updated.count !== 1) throw new HttpError(409, 'invalid_transition');

    await recordAudit(tx, {
      runId,
      actorType: 'ADMIN',
      actorId: staff.memberId,
      action: `event.${action === 'publish' ? 'published' : action === 'cancel' ? 'cancelled' : 'completed'}`,
      entityType: 'event',
      entityId: eventId,
      result: 'SUCCESS',
      metadata: { role: staff.role, from: before.status, to: t.to },
    });
    return tx.event.findUniqueOrThrow({ where: { id: eventId } });
  });
}
