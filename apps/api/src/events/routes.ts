import type { RegistrationStatus } from '@smc/db';
import { Router } from 'express';
import { checkInUrl, checkInWindow } from '../attendance/service';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { requireAuth } from '../middleware/access';
import { cancelRegistration, countsFor, eventView, register } from './service';

const STAFF = new Set(['ADMIN', 'ORGANIZER']);

/** Public event pages plus member registration. Drafts are invisible to non-staff. */
export function eventsRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const now = ctx.now();
    const events = await ctx.prisma.event.findMany({
      where: { status: 'PUBLISHED', startsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
      take: 100,
    });
    const counts = await countsFor(
      ctx.prisma,
      events.map((e) => e.id),
    );
    const mine = req.auth
      ? await ctx.prisma.registration.findMany({
          where: { memberId: req.auth.memberId, eventId: { in: events.map((e) => e.id) } },
          select: { eventId: true, status: true },
        })
      : [];
    const myStatus = new Map<string, RegistrationStatus>(mine.map((r) => [r.eventId, r.status]));
    res.json({
      events: events.map((e) => eventView(e, counts.get(e.id)!, now, myStatus.get(e.id) ?? null)),
    });
  });

  router.get('/:slug', async (req, res) => {
    const event = await ctx.prisma.event.findUnique({ where: { slug: req.params.slug } });
    const isStaff = req.auth && STAFF.has(req.auth.role);
    // Cancelled/completed events stay viewable so links in older emails explain what happened.
    if (!event || (event.status === 'DRAFT' && !isStaff))
      throw new HttpError(404, 'event_not_found');
    const counts = (await countsFor(ctx.prisma, [event.id])).get(event.id)!;
    const mine = req.auth
      ? await ctx.prisma.registration.findUnique({
          where: { eventId_memberId: { eventId: event.id, memberId: req.auth.memberId } },
          select: { id: true, status: true, attendance: { select: { checkedInAt: true } } },
        })
      : null;
    res.json({
      ...eventView(event, counts, ctx.now(), mine?.status ?? null),
      // Only the registered member ever receives their own check-in code.
      checkIn:
        mine?.status === 'CONFIRMED'
          ? {
              url: checkInUrl(ctx, mine.id),
              checkedInAt: mine.attendance?.checkedInAt ?? null,
              ...checkInWindow(event),
            }
          : null,
    });
  });

  router.post('/:slug/registration', requireAuth, async (req, res) => {
    const result = await register(ctx, req.runId, String(req.params.slug), req.auth!.memberId);
    res.status(result.created ? 201 : 200).json(result);
  });

  router.delete('/:slug/registration', requireAuth, async (req, res) => {
    await cancelRegistration(ctx, req.runId, String(req.params.slug), req.auth!.memberId);
    res.status(204).end();
  });

  return router;
}

/** The signed-in member's upcoming registrations (for My profile). */
export function myRegistrationsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth);
  router.get('/', async (req, res) => {
    const now = ctx.now();
    const rows = await ctx.prisma.registration.findMany({
      where: {
        memberId: req.auth!.memberId,
        status: { in: ['CONFIRMED', 'WAITLISTED'] },
        event: { startsAt: { gt: now }, status: { in: ['PUBLISHED', 'CANCELLED'] } },
      },
      include: { event: true },
      orderBy: { event: { startsAt: 'asc' } },
    });
    const counts = await countsFor(
      ctx.prisma,
      rows.map((r) => r.eventId),
    );
    res.json({
      registrations: rows.map((r) => eventView(r.event, counts.get(r.eventId)!, now, r.status)),
    });
  });
  return router;
}
