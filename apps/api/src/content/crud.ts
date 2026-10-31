import { Prisma, recordAudit, type MemberRole, type PrismaClient } from '@smc/db';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { requireRole } from '../middleware/access';

/** The Prisma model methods a CRUD resource needs (each model delegate satisfies this). */
interface Delegate {
  findMany(args: object): Promise<Record<string, unknown>[]>;
  findUnique(args: object): Promise<Record<string, unknown> | null>;
  create(args: object): Promise<Record<string, unknown>>;
  update(args: object): Promise<Record<string, unknown>>;
  delete(args: object): Promise<Record<string, unknown>>;
}

export interface CrudOptions<C extends z.ZodType, U extends z.ZodType> {
  /** Audit/entity name, e.g. "team_member". */
  entity: string;
  delegate: (db: PrismaClient) => Delegate;
  roles: MemberRole[];
  create: C;
  update: U;
  orderBy: object | object[];
  /** Fields matched by ?q= (contains). */
  searchFields: string[];
  /** Shape a row for the admin UI. */
  view?: (row: Record<string, unknown>) => unknown;
  /** Turn validated input into Prisma data (e.g. derive a slug, stamp publishedAt). */
  toData?: (input: Record<string, unknown>, existing: Record<string, unknown> | null) => object;
}

function isUnique(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** List / read / create / update / delete for one content model, audited. */
export function crudRouter<C extends z.ZodType, U extends z.ZodType>(
  ctx: AppContext,
  o: CrudOptions<C, U>,
): Router {
  const router = Router();
  router.use(requireRole(ctx, ...o.roles));
  const db = () => o.delegate(ctx.prisma);
  const view = (row: Record<string, unknown>) => (o.view ? o.view(row) : row);
  const audit = (req: Express.Request, action: string, entityId: string, metadata?: object) =>
    recordAudit(ctx.prisma, {
      runId: req.runId,
      actorType: req.auth!.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
      actorId: req.auth!.memberId,
      action: `${o.entity}.${action}`,
      entityType: o.entity,
      entityId,
      result: 'SUCCESS',
      metadata: { role: req.auth!.role, ...metadata },
    });
  const find = async (id: string) => {
    const row = await db().findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'not_found');
    return row;
  };

  router.get('/', async (req, res) => {
    const q = z.string().trim().max(100).optional().parse(req.query.q);
    const where = q ? { OR: o.searchFields.map((f) => ({ [f]: { contains: q } })) } : {};
    const rows = await db().findMany({ where, orderBy: o.orderBy, take: 500 });
    res.json({ items: rows.map(view) });
  });

  router.get('/:id', async (req, res) => {
    res.json(view(await find(String(req.params.id))));
  });

  router.post('/', async (req, res) => {
    const input = o.create.parse(req.body) as Record<string, unknown>;
    try {
      const row = await db().create({ data: o.toData ? o.toData(input, null) : input });
      await audit(req, 'created', String(row.id));
      res.status(201).json(view(row));
    } catch (err) {
      if (isUnique(err)) throw new HttpError(409, 'duplicate');
      throw err;
    }
  });

  router.patch('/:id', async (req, res) => {
    const id = String(req.params.id);
    const existing = await find(id);
    const input = o.update.parse(req.body) as Record<string, unknown>;
    if (Object.keys(input).length === 0) throw new HttpError(400, 'empty_update');
    try {
      const row = await db().update({
        where: { id },
        data: o.toData ? o.toData(input, existing) : input,
      });
      await audit(req, 'updated', id, { changed: Object.keys(input) });
      res.json(view(row));
    } catch (err) {
      if (isUnique(err)) throw new HttpError(409, 'duplicate');
      throw err;
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = String(req.params.id);
    const existing = await find(id);
    await db().delete({ where: { id } });
    await audit(req, 'deleted', id, { name: existing.name ?? existing.title ?? null });
    res.status(204).end();
  });

  return router;
}
