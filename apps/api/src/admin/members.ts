import { Prisma, recordAudit } from '@smc/db';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { requireRole } from '../middleware/access';
import { profileView } from '../members/routes';

const PAGE_SIZE = 50;

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(40).optional(),
});

const nameSchema = z.string().trim().min(1).max(100);
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));

const updateBody = z
  .strictObject({
    role: z.enum(['MEMBER', 'ORGANIZER', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    email: emailSchema.optional(),
    newsOptIn: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'empty update' });

const createBody = z.strictObject({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  role: z.enum(['MEMBER', 'ORGANIZER', 'ADMIN']).default('MEMBER'),
});

/** Member directory and role management — admins only (member emails are personal data). */
export function adminMembersRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireRole(ctx, 'ADMIN'));

  router.get('/', async (req, res) => {
    const { q, cursor } = listQuery.parse(req.query);
    const where: Prisma.MemberWhereInput = q
      ? {
          OR: [
            { email: { contains: q } },
            { firstName: { contains: q } },
            { lastName: { contains: q } },
          ],
        }
      : {};
    const rows = await ctx.prisma.member.findMany({
      where,
      orderBy: { id: 'asc' },
      take: PAGE_SIZE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    const page = rows.slice(0, PAGE_SIZE);
    res.json({
      members: page.map(profileView),
      nextCursor: rows.length > PAGE_SIZE ? page.at(-1)!.id : null,
    });
  });

  router.patch('/:id', async (req, res) => {
    const body = updateBody.parse(req.body);
    const targetId = String(req.params.id);
    const actorId = req.auth!.memberId;

    const updated = await ctx.prisma.$transaction(async (tx) => {
      const before = await tx.member.findUnique({ where: { id: targetId } });
      if (!before) throw new HttpError(404, 'not_found');
      // Prevents an admin from locking the club out by demoting or deactivating themselves.
      const changesAccess =
        (body.role !== undefined && body.role !== before.role) ||
        (body.status !== undefined && body.status !== before.status);
      if (targetId === actorId && changesAccess) throw new HttpError(409, 'cannot_modify_self');
      const after = await tx.member
        .update({
          where: { id: targetId },
          data: {
            ...body,
            ...(body.newsOptIn !== undefined &&
              body.newsOptIn !== before.newsOptIn && { newsOptInUpdatedAt: ctx.now() }),
            // A changed address has not been verified yet.
            ...(body.email && body.email !== before.email && { emailVerifiedAt: null }),
          },
        })
        .catch((err: unknown) => {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            throw new HttpError(409, 'email_taken');
          }
          throw err;
        });
      if (body.status === 'INACTIVE' && before.status !== 'INACTIVE') {
        await tx.session.updateMany({
          where: { memberId: targetId, revokedAt: null },
          data: { revokedAt: ctx.now() },
        });
      }
      await recordAudit(tx, {
        runId: req.runId,
        actorType: 'ADMIN',
        actorId,
        action: 'member.access.changed',
        entityType: 'member',
        entityId: targetId,
        result: 'SUCCESS',
        metadata: {
          from: { role: before.role, status: before.status },
          to: { role: after.role, status: after.status },
          changed: Object.keys(body),
        },
      });
      return after;
    });

    res.json(profileView(updated));
  });

  /** Add a member by hand; they confirm their email the first time they sign in. */
  router.post('/', async (req, res) => {
    const body = createBody.parse(req.body);
    const member = await ctx.prisma.member
      .create({ data: { ...body, newsOptIn: false } })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new HttpError(409, 'email_taken');
        }
        throw err;
      });
    await recordAudit(ctx.prisma, {
      runId: req.runId,
      actorType: 'ADMIN',
      actorId: req.auth!.memberId,
      action: 'member.created',
      entityType: 'member',
      entityId: member.id,
      result: 'SUCCESS',
      metadata: { role: body.role },
    });
    res.status(201).json(profileView(member));
  });

  /** Permanently remove a member and their registrations, sessions and survey answers. */
  router.delete('/:id', async (req, res) => {
    const targetId = String(req.params.id);
    if (targetId === req.auth!.memberId) throw new HttpError(409, 'cannot_modify_self');
    const target = await ctx.prisma.member.findUnique({ where: { id: targetId } });
    if (!target) throw new HttpError(404, 'not_found');
    const [events, news, checkIns] = await Promise.all([
      ctx.prisma.event.count({ where: { createdById: targetId } }),
      ctx.prisma.newsPost.count({ where: { createdById: targetId } }),
      ctx.prisma.attendance.count({ where: { checkedInById: targetId } }),
    ]);
    // Events, news and other members' check-ins keep a reference to who made them;
    // deactivate such members instead.
    if (events + news + checkIns > 0) throw new HttpError(409, 'member_has_content');
    await ctx.prisma.$transaction(async (tx) => {
      await tx.weeklyDigest.updateMany({
        where: { approvedById: targetId },
        data: { approvedById: null },
      });
      await tx.weeklyDigest.updateMany({
        where: { rejectedById: targetId },
        data: { rejectedById: null },
      });
      await tx.member.delete({ where: { id: targetId } });
      await recordAudit(tx, {
        runId: req.runId,
        actorType: 'ADMIN',
        actorId: req.auth!.memberId,
        action: 'member.deleted',
        entityType: 'member',
        entityId: targetId,
        result: 'SUCCESS',
      });
    });
    res.status(204).end();
  });

  return router;
}
