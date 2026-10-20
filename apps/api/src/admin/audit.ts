import type { AuditLog, Prisma } from '@smc/db';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { requireRole } from '../middleware/access';

const PAGE = 100;

const query = z.object({
  runId: z.string().max(64).optional(),
  /** Prefix match, e.g. "digest." or "mailgun.". */
  action: z.string().max(100).optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(64).optional(),
  actorId: z.string().max(64).optional(),
  result: z.enum(['SUCCESS', 'FAILURE', 'SKIPPED', 'DENIED']).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.string().regex(/^\d+$/).optional(),
});

/** Audit rows as JSON (BigInt ids as strings) with actor names resolved. */
export async function auditView(ctx: AppContext, rows: AuditLog[]) {
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
  const actors = await ctx.prisma.member.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
  const byId = new Map(actors.map((a) => [a.id, a]));
  return rows.map((r) => ({
    id: r.id.toString(),
    runId: r.runId,
    at: r.createdAt,
    actorType: r.actorType,
    actor: r.actorId
      ? {
          id: r.actorId,
          name: byId.has(r.actorId)
            ? `${byId.get(r.actorId)!.firstName} ${byId.get(r.actorId)!.lastName}`
            : null,
        }
      : null,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    result: r.result,
    metadata: r.metadata,
  }));
}

/** Searchable run + audit log for admins: who did what, when, with what result. */
export function adminAuditRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireRole(ctx, 'ADMIN'));

  router.get('/', async (req, res) => {
    const q = query.parse(req.query);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.runId && { runId: q.runId }),
      ...(q.action && { action: { startsWith: q.action } }),
      ...(q.entityType && { entityType: q.entityType }),
      ...(q.entityId && { entityId: q.entityId }),
      ...(q.actorId && { actorId: q.actorId }),
      ...(q.result && { result: q.result }),
      ...((q.from || q.to) && {
        createdAt: {
          ...(q.from && { gte: new Date(q.from) }),
          ...(q.to && { lt: new Date(q.to) }),
        },
      }),
      ...(q.cursor && { id: { lt: BigInt(q.cursor) } }),
    };
    const rows = await ctx.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    res.json({
      entries: await auditView(ctx, page),
      nextCursor: rows.length > PAGE ? page.at(-1)!.id.toString() : null,
    });
  });

  return router;
}
