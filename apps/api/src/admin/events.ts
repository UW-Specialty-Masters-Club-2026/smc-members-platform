import { InvalidLocalTimeError, parsePtLocal } from '@smc/core';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import {
  countsFor,
  createEvent,
  eventView,
  transitionEvent,
  updateEvent,
  type EventInput,
  type Staff,
} from '../events/service';
import { requireRole } from '../middleware/access';

/** Pacific wall-clock input ("2026-10-28T18:00") → UTC instant. */
const ptTime = z.string().transform((value, issueCtx) => {
  try {
    return parsePtLocal(value);
  } catch (err) {
    issueCtx.addIssue({
      code: 'custom',
      message:
        err instanceof InvalidLocalTimeError && err.reason === 'nonexistent'
          ? 'time does not exist in Pacific Time (DST change)'
          : 'expected YYYY-MM-DDTHH:mm in Pacific Time',
    });
    return z.NEVER;
  }
});

const fields = {
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(10).max(280),
  details: z.string().trim().max(10_000).nullable(),
  startsAtPt: ptTime,
  endsAtPt: ptTime.nullable(),
  location: z.string().trim().min(2).max(200),
  capacity: z.number().int().min(1).max(10_000).nullable(),
  waitlistEnabled: z.boolean(),
  registrationOpen: z.boolean(),
  registrationClosesAtPt: ptTime.nullable(),
};

const createBody = z.strictObject({
  ...fields,
  details: fields.details.default(null),
  endsAtPt: fields.endsAtPt.default(null),
  capacity: fields.capacity.default(null),
  waitlistEnabled: fields.waitlistEnabled.default(true),
  registrationOpen: fields.registrationOpen.default(true),
  registrationClosesAtPt: fields.registrationClosesAtPt.default(null),
});
const updateBody = z.strictObject(fields).partial();

type Parsed = Partial<z.infer<typeof createBody>>;

function toInput(b: Parsed): Partial<EventInput> {
  const { startsAtPt, endsAtPt, registrationClosesAtPt, ...rest } = b;
  return {
    ...rest,
    ...(startsAtPt !== undefined && { startsAt: startsAtPt }),
    ...(endsAtPt !== undefined && { endsAt: endsAtPt }),
    ...(registrationClosesAtPt !== undefined && { registrationClosesAt: registrationClosesAtPt }),
  };
}

const listQuery = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']).optional(),
});

/** Event management for admins and organizers. */
export function adminEventsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireRole(ctx, 'ADMIN', 'ORGANIZER'));
  const staff = (req: Express.Request): Staff => ({
    memberId: req.auth!.memberId,
    role: req.auth!.role,
  });

  router.get('/', async (req, res) => {
    const { status } = listQuery.parse(req.query);
    const events = await ctx.prisma.event.findMany({
      where: status ? { status } : {},
      orderBy: { startsAt: 'desc' },
      take: 200,
    });
    const counts = await countsFor(
      ctx.prisma,
      events.map((e) => e.id),
    );
    const now = ctx.now();
    res.json({ events: events.map((e) => eventView(e, counts.get(e.id)!, now)) });
  });

  router.post('/', async (req, res) => {
    const input = toInput(createBody.parse(req.body)) as EventInput;
    const event = await createEvent(ctx, req.runId, staff(req), input);
    res.status(201).json(eventView(event, { confirmed: 0, waitlisted: 0 }, ctx.now()));
  });

  router.get('/:id', async (req, res) => {
    const event = await ctx.prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) throw new HttpError(404, 'event_not_found');
    const counts = (await countsFor(ctx.prisma, [event.id])).get(event.id)!;
    res.json(eventView(event, counts, ctx.now()));
  });

  router.patch('/:id', async (req, res) => {
    const input = toInput(updateBody.parse(req.body));
    if (Object.keys(input).length === 0) throw new HttpError(400, 'empty_update');
    const event = await updateEvent(ctx, req.runId, staff(req), req.params.id, input);
    const counts = (await countsFor(ctx.prisma, [event.id])).get(event.id)!;
    res.json(eventView(event, counts, ctx.now()));
  });

  for (const action of ['publish', 'cancel', 'complete'] as const) {
    router.post(`/:id/${action}`, async (req, res) => {
      const event = await transitionEvent(ctx, req.runId, staff(req), req.params.id, action);
      const counts = (await countsFor(ctx.prisma, [event.id])).get(event.id)!;
      res.json(eventView(event, counts, ctx.now()));
    });
  }

  /** Roster for check-in and planning. */
  router.get('/:id/registrations', async (req, res) => {
    const rows = await ctx.prisma.registration.findMany({
      where: { eventId: req.params.id },
      include: { member: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: [{ status: 'asc' }, { registeredAt: 'asc' }],
    });
    res.json({
      registrations: rows.map((r) => ({
        id: r.id,
        status: r.status,
        registeredAt: r.registeredAt,
        confirmedAt: r.confirmedAt,
        cancelledAt: r.cancelledAt,
        member: r.member,
      })),
    });
  });

  return router;
}
