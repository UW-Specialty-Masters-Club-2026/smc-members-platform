import { formatPtRange, signToken, verifyToken } from '@smc/core';
import { Prisma, recordAudit, type CheckInMethod } from '@smc/db';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import type { Staff } from '../events/service';

const PURPOSE = 'checkin';
/** Check-in opens this long before the start… */
export const CHECKIN_OPENS_BEFORE_MS = 2 * 60 * 60_000;
/** …and closes this long after the end (or after the start, when no end is set). */
export const CHECKIN_CLOSES_AFTER_END_MS = 3 * 60 * 60_000;
export const CHECKIN_CLOSES_AFTER_START_MS = 6 * 60 * 60_000;

/** The member's personal check-in code (encoded in their QR). No expiry: it's bound to one registration. */
export function checkInCodeFor(ctx: AppContext, registrationId: string): string {
  return signToken(ctx.config.linkSigningSecret, PURPOSE, registrationId);
}

export function checkInUrl(ctx: AppContext, registrationId: string): string {
  return `${ctx.config.appBaseUrl}/checkin#code=${checkInCodeFor(ctx, registrationId)}`;
}

export function checkInWindow(event: { startsAt: Date; endsAt: Date | null }) {
  return {
    opensAt: new Date(event.startsAt.getTime() - CHECKIN_OPENS_BEFORE_MS),
    closesAt: event.endsAt
      ? new Date(event.endsAt.getTime() + CHECKIN_CLOSES_AFTER_END_MS)
      : new Date(event.startsAt.getTime() + CHECKIN_CLOSES_AFTER_START_MS),
  };
}

function registrationIdFromCode(ctx: AppContext, code: string): string {
  const result = verifyToken(ctx.config.linkSigningSecret, PURPOSE, code, ctx.now());
  if (!result.ok) throw new HttpError(400, 'invalid_code');
  return result.subject;
}

async function loadRegistration(ctx: AppContext, registrationId: string) {
  const registration = await ctx.prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      event: true,
      member: { select: { id: true, firstName: true, lastName: true } },
      attendance: true,
    },
  });
  if (!registration) throw new HttpError(400, 'invalid_code');
  return registration;
}

/** What the organizer sees after scanning, before tapping "Check in". */
export async function lookupCode(ctx: AppContext, code: string) {
  const r = await loadRegistration(ctx, registrationIdFromCode(ctx, code));
  return {
    registrationId: r.id,
    member: { firstName: r.member.firstName, lastName: r.member.lastName },
    event: {
      id: r.event.id,
      title: r.event.title,
      when: formatPtRange(r.event.startsAt, r.event.endsAt),
    },
    registrationStatus: r.status,
    checkedInAt: r.attendance?.checkedInAt ?? null,
  };
}

export async function checkInByCode(ctx: AppContext, runId: string, staff: Staff, code: string) {
  return checkIn(ctx, runId, staff, registrationIdFromCode(ctx, code), 'QR');
}

/**
 * Record attendance. Idempotent: scanning the same code twice returns the first check-in
 * (the unique index on registration_id settles concurrent scans).
 */
export async function checkIn(
  ctx: AppContext,
  runId: string,
  staff: Staff,
  registrationId: string,
  method: CheckInMethod,
) {
  const now = ctx.now();
  const r = await loadRegistration(ctx, registrationId);
  if (r.attendance) return { alreadyCheckedIn: true, checkedInAt: r.attendance.checkedInAt };

  if (r.status !== 'CONFIRMED') throw new HttpError(409, 'not_confirmed');
  if (r.event.status !== 'PUBLISHED' && r.event.status !== 'COMPLETED') {
    throw new HttpError(409, 'event_not_active');
  }
  const window = checkInWindow(r.event);
  if (now < window.opensAt || now > window.closesAt) {
    throw new HttpError(409, 'outside_checkin_window');
  }

  try {
    const attendance = await ctx.prisma.$transaction(async (tx) => {
      const created = await tx.attendance.create({
        data: {
          eventId: r.eventId,
          registrationId: r.id,
          memberId: r.memberId,
          method,
          checkedInAt: now,
          checkedInById: staff.memberId,
        },
      });
      await recordAudit(tx, {
        runId,
        actorType: 'ADMIN',
        actorId: staff.memberId,
        action: 'attendance.checked_in',
        entityType: 'registration',
        entityId: r.id,
        result: 'SUCCESS',
        metadata: { eventId: r.eventId, memberId: r.memberId, method, role: staff.role },
      });
      return created;
    });
    return { alreadyCheckedIn: false, checkedInAt: attendance.checkedInAt };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await ctx.prisma.attendance.findUniqueOrThrow({
        where: { registrationId: r.id },
      });
      return { alreadyCheckedIn: true, checkedInAt: existing.checkedInAt };
    }
    throw err;
  }
}

export async function undoCheckIn(
  ctx: AppContext,
  runId: string,
  staff: Staff,
  registrationId: string,
) {
  await ctx.prisma.$transaction(async (tx) => {
    const removed = await tx.attendance.deleteMany({ where: { registrationId } });
    if (removed.count === 0) throw new HttpError(404, 'not_checked_in');
    await recordAudit(tx, {
      runId,
      actorType: 'ADMIN',
      actorId: staff.memberId,
      action: 'attendance.undone',
      entityType: 'registration',
      entityId: registrationId,
      result: 'SUCCESS',
      metadata: { role: staff.role },
    });
  });
}
