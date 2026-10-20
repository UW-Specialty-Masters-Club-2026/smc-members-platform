import type { Prisma, PrismaClient, RegistrationStatus } from './generated/prisma/client';

export interface EventCounts {
  confirmed: number;
  waitlisted: number;
}

const ACTIVE: RegistrationStatus[] = ['CONFIRMED', 'WAITLISTED'];

/** Confirmed and waitlisted registration counts per event. */
export async function countsFor(
  db: PrismaClient | Prisma.TransactionClient,
  eventIds: string[],
): Promise<Map<string, EventCounts>> {
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
