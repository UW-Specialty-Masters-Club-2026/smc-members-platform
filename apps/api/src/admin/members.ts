import { recordAudit, type Prisma } from '@smc/db';
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

const updateBody = z
  .strictObject({
    role: z.enum(['MEMBER', 'ORGANIZER', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine((b) => b.role !== undefined || b.status !== undefined, { message: 'empty update' });

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
    // Prevents an admin from locking the club out by demoting or deactivating themselves.
    if (targetId === actorId) throw new HttpError(409, 'cannot_modify_self');

    const updated = await ctx.prisma.$transaction(async (tx) => {
      const before = await tx.member.findUnique({ where: { id: targetId } });
      if (!before) throw new HttpError(404, 'not_found');
      const after = await tx.member.update({ where: { id: targetId }, data: body });
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
        },
      });
      return after;
    });

    res.json(profileView(updated));
  });

  return router;
}
