import { recordAudit, type Article, type Newsletter, type Prisma } from '@smc/db';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { slugify } from '../events/service';
import { requireRole } from '../middleware/access';
import { crudRouter } from './crud';
import { renderMarkdown } from './markdown';

// ─── Shared field rules ────────────────────────────────────────────

/** An outside https link, or an image already on this site (/content/… or an upload). */
export const linkOrPath = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\/[^\s]+$/.test(v) || /^\/(content|api\/uploads)\/[\w.-]+$/.test(v), {
    message: 'must be an http(s) link or an uploaded image',
  });
const optionalLink = linkOrPath.nullable().optional();
const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
const lines = (maxItems: number, maxLen = 200) => z.array(text(maxLen)).max(maxItems);
const status = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
const DEPARTMENTS = ['leads', 'strategy', 'alumni', 'tech', 'casecomp', 'operations'] as const;
const date = z.iso.date().transform((d) => new Date(`${d}T12:00:00Z`));

// ─── Team ──────────────────────────────────────────────────────────

const teamFields = {
  name: text(120),
  role: text(160),
  departments: z.array(z.enum(DEPARTMENTS)).min(1).max(6),
  major: text(160).nullable().optional(),
  linkedinUrl: optionalLink,
  websiteUrl: optionalLink,
  imageUrl: optionalLink,
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isPublished: z.boolean().optional(),
};

// ─── Articles ──────────────────────────────────────────────────────

const articleFields = {
  title: text(200, 3),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase words separated by dashes')
    .max(160)
    .optional(),
  subtitle: text(400),
  category: text(60),
  author: text(300),
  body: z.string().max(200_000),
  imageUrl: optionalLink,
  imageAlt: text(300).nullable().optional(),
  status: status.optional(),
  publishedAt: date.nullable().optional(),
};

const articleData =
  (now: () => Date) =>
  (input: Record<string, unknown>, existing: Record<string, unknown> | null) => {
    const data: Record<string, unknown> = { ...input };
    if (!existing && !input.slug)
      data.slug = slugify(String(input.title)).replace(/-[0-9a-f]{6}$/, '');
    // Publishing without a date stamps today; the date can still be edited afterwards.
    if (input.status === 'PUBLISHED' && !input.publishedAt && !existing?.publishedAt) {
      data.publishedAt = now();
    }
    return data;
  };

export function articleView(a: Article, withHtml = false) {
  return {
    ...a,
    publishedAt: a.publishedAt?.toISOString().slice(0, 10) ?? null,
    ...(withHtml && { html: renderMarkdown(a.body) }),
  };
}

// ─── Newsletters ───────────────────────────────────────────────────

const newsletterFields = {
  volume: text(40),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80)
    .optional(),
  title: text(200),
  summary: text(500),
  highlights: lines(12),
  pdfUrl: linkOrPath,
  issuedAt: date,
  status: status.optional(),
};

function newsletterData(input: Record<string, unknown>, existing: Record<string, unknown> | null) {
  const data: Record<string, unknown> = { ...input };
  if (!existing && !input.slug)
    data.slug = slugify(String(input.volume)).replace(/-[0-9a-f]{6}$/, '');
  return data;
}

export function newsletterView(n: Newsletter) {
  return { ...n, issuedAt: n.issuedAt.toISOString().slice(0, 10) };
}

// ─── Skills ────────────────────────────────────────────────────────

const skillFields = {
  group: z.enum(['CAREER', 'STARTER', 'BUILT_IN']),
  name: text(120),
  description: text(500),
  prompt: text(300).nullable().optional(),
  downloadUrl: optionalLink,
  linkUrl: optionalLink,
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isPublished: z.boolean().optional(),
};

// ─── Site settings ─────────────────────────────────────────────────

export const SETTINGS = {
  about: z.object({ paragraphs: lines(6, 1000).min(1) }),
  pillars: z.object({
    items: z
      .array(z.object({ title: text(120), items: lines(10) }))
      .min(1)
      .max(6),
  }),
  contact: z.object({
    email: z.email(),
    linkedinLabel: text(160),
    linkedinUrl: linkOrPath,
    instagramLabel: text(80),
    instagramUrl: linkOrPath,
    address: lines(4, 160).min(1),
  }),
  join: z.object({
    lead: text(400),
    why: z.array(z.object({ title: text(120), text: text(400) })).max(6),
    steps: z.array(z.object({ title: text(120), text: text(400) })).max(6),
    closing: text(400),
  }),
} as const;
export type SettingKey = keyof typeof SETTINGS;

// ─── Routers ───────────────────────────────────────────────────────

const STAFF = ['ADMIN', 'ORGANIZER'] as const;

/** Everything an admin or organizer can create, edit and delete on the public site. */
export function adminContentRouter(ctx: AppContext): Router {
  const router = Router();

  router.use(
    '/team',
    crudRouter(ctx, {
      entity: 'team_member',
      delegate: (db) => db.teamMember,
      roles: [...STAFF],
      create: z.strictObject(teamFields),
      update: z.strictObject(teamFields).partial(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      searchFields: ['name', 'role', 'major'],
    }),
  );

  router.use(
    '/articles',
    crudRouter(ctx, {
      entity: 'article',
      delegate: (db) => db.article,
      roles: [...STAFF],
      create: z.strictObject(articleFields),
      update: z.strictObject(articleFields).partial(),
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      searchFields: ['title', 'subtitle', 'author', 'category'],
      view: (row) => articleView(row as unknown as Article),
      toData: articleData(ctx.now),
    }),
  );

  router.use(
    '/newsletters',
    crudRouter(ctx, {
      entity: 'newsletter',
      delegate: (db) => db.newsletter,
      roles: [...STAFF],
      create: z.strictObject(newsletterFields),
      update: z.strictObject(newsletterFields).partial(),
      orderBy: { issuedAt: 'desc' },
      searchFields: ['volume', 'title', 'summary'],
      view: (row) => newsletterView(row as unknown as Newsletter),
      toData: newsletterData,
    }),
  );

  router.use(
    '/skills',
    crudRouter(ctx, {
      entity: 'skill',
      delegate: (db) => db.skillItem,
      roles: [...STAFF],
      create: z.strictObject(skillFields),
      update: z.strictObject(skillFields).partial(),
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      searchFields: ['name', 'description'],
    }),
  );

  // Site copy: admins only.
  router.get('/settings', requireRole(ctx, 'ADMIN'), async (_req, res) => {
    const rows = await ctx.prisma.siteSetting.findMany();
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  });

  router.put('/settings/:key', requireRole(ctx, 'ADMIN'), async (req, res) => {
    const key = String(req.params.key);
    if (!(key in SETTINGS)) throw new HttpError(404, 'unknown_setting');
    const value = SETTINGS[key as SettingKey].parse(req.body) as Prisma.InputJsonValue;
    await ctx.prisma.siteSetting.upsert({
      where: { key },
      create: { key, value, updatedById: req.auth!.memberId },
      update: { value, updatedById: req.auth!.memberId },
    });
    await recordAudit(ctx.prisma, {
      runId: req.runId,
      actorType: 'ADMIN',
      actorId: req.auth!.memberId,
      action: 'site_setting.updated',
      entityType: 'site_setting',
      entityId: key,
      result: 'SUCCESS',
    });
    res.json({ key, value });
  });

  return router;
}

/** Published content for the public pages. */
export function publicContentRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/site', async (_req, res) => {
    const rows = await ctx.prisma.siteSetting.findMany();
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  });

  router.get('/team', async (_req, res) => {
    const items = await ctx.prisma.teamMember.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ items });
  });

  router.get('/articles', async (_req, res) => {
    const items = await ctx.prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      omit: { body: true },
    });
    res.json({ items: items.map((a) => articleView({ ...a, body: '' })) });
  });

  router.get('/articles/:slug', async (req, res) => {
    const a = await ctx.prisma.article.findUnique({ where: { slug: String(req.params.slug) } });
    if (!a || a.status === 'DRAFT') throw new HttpError(404, 'not_found');
    res.json(articleView(a, true));
  });

  router.get('/newsletters', async (_req, res) => {
    const items = await ctx.prisma.newsletter.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { issuedAt: 'desc' },
    });
    res.json({ items: items.map(newsletterView) });
  });

  router.get('/newsletters/:slug', async (req, res) => {
    const n = await ctx.prisma.newsletter.findUnique({ where: { slug: String(req.params.slug) } });
    if (!n || n.status === 'DRAFT') throw new HttpError(404, 'not_found');
    res.json(newsletterView(n));
  });

  router.get('/skills', async (_req, res) => {
    const items = await ctx.prisma.skillItem.findMany({
      where: { isPublished: true },
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    });
    res.json({ items });
  });

  router.get('/past-events', async (_req, res) => {
    const now = ctx.now();
    const items = await ctx.prisma.event.findMany({
      where: {
        OR: [{ status: 'COMPLETED' }, { status: 'PUBLISHED', startsAt: { lte: now } }],
      },
      orderBy: { startsAt: 'desc' },
      take: 24,
      select: {
        slug: true,
        title: true,
        summary: true,
        startsAt: true,
        endsAt: true,
        location: true,
        imageUrl: true,
        externalUrl: true,
      },
    });
    res.json({ items });
  });

  return router;
}
