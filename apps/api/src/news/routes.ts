import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { requireRole } from '../middleware/access';
import { createNews, newsView, transitionNews, updateNews, type NewsInput } from './service';

const withOpenings = { openings: { orderBy: { position: 'asc' as const } } };
const STAFF = new Set(['ADMIN', 'ORGANIZER']);

const fields = {
  tag: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.toUpperCase())
    .nullable(),
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(10).max(600),
  body: z.string().trim().max(20_000).nullable(),
  linkUrl: z
    .url({ protocol: /^https?$/ })
    .max(500)
    .nullable(),
  applyEmail: z.email().max(320).nullable(),
  applyChecklist: z.array(z.string().trim().min(1).max(200)).max(10).nullable(),
  openings: z
    .array(
      z.strictObject({
        title: z.string().trim().min(2).max(120),
        openings: z.number().int().min(1).max(99),
      }),
    )
    .max(20),
};

const createBody = z.strictObject({
  ...fields,
  tag: fields.tag.default(null),
  body: fields.body.default(null),
  linkUrl: fields.linkUrl.default(null),
  applyEmail: fields.applyEmail.default(null),
  applyChecklist: fields.applyChecklist.default(null),
  openings: fields.openings.default([]),
});
const updateBody = z.strictObject(fields).partial();

/** Club news as members see it: published posts only (archived ones stay readable by link). */
export function newsRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const posts = await ctx.prisma.newsPost.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      include: withOpenings,
    });
    res.json({ news: posts.map((p) => newsView(p, ctx.config.appBaseUrl)) });
  });

  router.get('/:slug', async (req, res) => {
    const post = await ctx.prisma.newsPost.findUnique({
      where: { slug: req.params.slug },
      include: withOpenings,
    });
    const isStaff = req.auth && STAFF.has(req.auth.role);
    if (!post || (post.status === 'DRAFT' && !isStaff)) throw new HttpError(404, 'news_not_found');
    res.json(newsView(post, ctx.config.appBaseUrl));
  });

  return router;
}

export function adminNewsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireRole(ctx, 'ADMIN', 'ORGANIZER'));
  const staff = (req: Express.Request) => ({ memberId: req.auth!.memberId, role: req.auth!.role });

  router.get('/', async (_req, res) => {
    const posts = await ctx.prisma.newsPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: withOpenings,
    });
    res.json({ news: posts.map((p) => newsView(p, ctx.config.appBaseUrl)) });
  });

  router.post('/', async (req, res) => {
    const post = await createNews(
      ctx,
      req.runId,
      staff(req),
      createBody.parse(req.body) as NewsInput,
    );
    res.status(201).json(newsView(post, ctx.config.appBaseUrl));
  });

  router.get('/:id', async (req, res) => {
    const post = await ctx.prisma.newsPost.findUnique({
      where: { id: req.params.id },
      include: withOpenings,
    });
    if (!post) throw new HttpError(404, 'news_not_found');
    res.json(newsView(post, ctx.config.appBaseUrl));
  });

  router.patch('/:id', async (req, res) => {
    const input = updateBody.parse(req.body);
    if (Object.keys(input).length === 0) throw new HttpError(400, 'empty_update');
    const post = await updateNews(ctx, req.runId, staff(req), req.params.id, input);
    res.json(newsView(post, ctx.config.appBaseUrl));
  });

  for (const action of ['publish', 'archive'] as const) {
    router.post(`/:id/${action}`, async (req, res) => {
      const post = await transitionNews(ctx, req.runId, staff(req), req.params.id, action);
      res.json(newsView(post, ctx.config.appBaseUrl));
    });
  }

  return router;
}
