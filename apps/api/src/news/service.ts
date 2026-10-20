import { recordAudit, type NewsOpening, type NewsPost } from '@smc/db';
import type { AppContext } from '../context';
import { HttpError } from '../errors';
import { slugify, type Staff } from '../events/service';

export interface NewsInput {
  tag: string | null;
  title: string;
  summary: string;
  body: string | null;
  linkUrl: string | null;
  applyEmail: string | null;
  applyChecklist: string[] | null;
  openings: { title: string; openings: number }[];
}

type PostWithOpenings = NewsPost & { openings: NewsOpening[] };

export function newsView(post: PostWithOpenings, appBaseUrl: string) {
  return {
    id: post.id,
    slug: post.slug,
    tag: post.tag,
    title: post.title,
    summary: post.summary,
    body: post.body,
    linkUrl: post.linkUrl,
    /** Where "Read more" goes: the external link if set, else our news page. */
    url: post.linkUrl ?? `${appBaseUrl}/news/${post.slug}`,
    status: post.status,
    publishedAt: post.publishedAt,
    applyEmail: post.applyEmail,
    applyChecklist: (post.applyChecklist as string[] | null) ?? null,
    openings: [...post.openings]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ title: o.title, openings: o.openings })),
  };
}

const withOpenings = { openings: { orderBy: { position: 'asc' as const } } };

export async function createNews(ctx: AppContext, runId: string, staff: Staff, input: NewsInput) {
  return ctx.prisma.$transaction(async (tx) => {
    const { openings, applyChecklist, ...fields } = input;
    const post = await tx.newsPost.create({
      data: {
        ...fields,
        applyChecklist: applyChecklist ?? undefined,
        slug: slugify(input.title),
        createdById: staff.memberId,
        openings: { create: openings.map((o, i) => ({ ...o, position: i + 1 })) },
      },
      include: withOpenings,
    });
    await recordAudit(tx, {
      runId,
      actorType: 'ADMIN',
      actorId: staff.memberId,
      action: 'news.created',
      entityType: 'news_post',
      entityId: post.id,
      result: 'SUCCESS',
      metadata: { role: staff.role, title: post.title },
    });
    return post;
  });
}

export async function updateNews(
  ctx: AppContext,
  runId: string,
  staff: Staff,
  id: string,
  input: Partial<NewsInput>,
) {
  return ctx.prisma.$transaction(async (tx) => {
    const before = await tx.newsPost.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'news_not_found');
    if (before.status === 'ARCHIVED') throw new HttpError(409, 'news_archived');
    const { openings, applyChecklist, ...fields } = input;
    if (openings) await tx.newsOpening.deleteMany({ where: { newsPostId: id } });
    const post = await tx.newsPost.update({
      where: { id },
      data: {
        ...fields,
        ...(applyChecklist !== undefined && { applyChecklist: applyChecklist ?? [] }),
        ...(openings && {
          openings: { create: openings.map((o, i) => ({ ...o, position: i + 1 })) },
        }),
      },
      include: withOpenings,
    });
    await recordAudit(tx, {
      runId,
      actorType: 'ADMIN',
      actorId: staff.memberId,
      action: 'news.updated',
      entityType: 'news_post',
      entityId: id,
      result: 'SUCCESS',
      metadata: { role: staff.role, changed: Object.keys(input) },
    });
    return post;
  });
}

const TRANSITIONS = {
  publish: { from: ['DRAFT'], to: 'PUBLISHED' },
  archive: { from: ['DRAFT', 'PUBLISHED'], to: 'ARCHIVED' },
} as const;

/** Publishing stamps publishedAt, which decides which weekly digest the post lands in. */
export async function transitionNews(
  ctx: AppContext,
  runId: string,
  staff: Staff,
  id: string,
  action: keyof typeof TRANSITIONS,
) {
  const t = TRANSITIONS[action];
  return ctx.prisma.$transaction(async (tx) => {
    const updated = await tx.newsPost.updateMany({
      where: { id, status: { in: [...t.from] } },
      data: { status: t.to, ...(action === 'publish' && { publishedAt: ctx.now() }) },
    });
    if (updated.count !== 1) {
      const exists = await tx.newsPost.count({ where: { id } });
      throw exists
        ? new HttpError(409, 'invalid_transition')
        : new HttpError(404, 'news_not_found');
    }
    await recordAudit(tx, {
      runId,
      actorType: 'ADMIN',
      actorId: staff.memberId,
      action: action === 'publish' ? 'news.published' : 'news.archived',
      entityType: 'news_post',
      entityId: id,
      result: 'SUCCESS',
      metadata: { role: staff.role },
    });
    return tx.newsPost.findUniqueOrThrow({ where: { id }, include: withOpenings });
  });
}
