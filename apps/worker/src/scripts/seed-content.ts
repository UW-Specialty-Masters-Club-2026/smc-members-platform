/**
 * Load the club's website content (carried over from the previous site) into the database:
 *   npm run seed:content -w @smc/worker
 * Only fills empty tables, so it never overwrites edits made in the admin workspace.
 * Run once per environment after migrating.
 */
import { randomUUID } from 'node:crypto';
import { parseEnv, workerEnvSchema } from '@smc/config';
import { createLogger } from '@smc/core';
import { createPrismaClient, recordAudit, type Prisma, type PrismaClient } from '@smc/db';
import TurndownService from 'turndown';
import articles from '../seed/articles.json' with { type: 'json' };
import newsletters from '../seed/newsletters.json' with { type: 'json' };
import pastEvents from '../seed/past-events.json' with { type: 'json' };
import settings from '../seed/site-settings.json' with { type: 'json' };
import skills from '../seed/skills.json' with { type: 'json' };
import team from '../seed/team.json' with { type: 'json' };

const logger = createLogger({ name: 'seed-content' });
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
const noon = (date: string) => new Date(`${date}T12:00:00Z`);

async function fill(name: string, count: () => Promise<number>, insert: () => Promise<number>) {
  if ((await count()) > 0) {
    logger.info({ table: name }, 'already has content, skipped');
    return;
  }
  logger.info({ table: name, inserted: await insert() }, 'seeded');
}

export async function seedContent(prisma: PrismaClient) {
  await fill(
    'team_members',
    () => prisma.teamMember.count(),
    async () =>
      (
        await prisma.teamMember.createMany({
          data: team.map((t, i) => ({
            name: t.name,
            role: t.role,
            departments: t.departments,
            major: t.major,
            linkedinUrl: t.linkedin ?? null,
            websiteUrl: t.website ?? null,
            imageUrl: t.image,
            sortOrder: i * 10,
          })),
        })
      ).count,
  );

  await fill(
    'articles',
    () => prisma.article.count(),
    async () =>
      (
        await prisma.article.createMany({
          data: articles.map((a) => ({
            slug: a.slug,
            title: a.title,
            subtitle: a.subtitle,
            category: a.category,
            author: a.author,
            body: turndown.turndown(a.html),
            imageUrl: a.image,
            imageAlt: a.imageAlt || null,
            status: 'PUBLISHED' as const,
            publishedAt: noon(a.date),
          })),
        })
      ).count,
  );

  await fill(
    'newsletters',
    () => prisma.newsletter.count(),
    async () =>
      (
        await prisma.newsletter.createMany({
          data: newsletters.map((n) => ({
            slug: n.slug,
            volume: n.volume,
            title: n.title,
            summary: n.summary,
            highlights: n.highlights,
            pdfUrl: n.pdfUrl,
            issuedAt: noon(n.date),
          })),
        })
      ).count,
  );

  await fill(
    'skill_items',
    () => prisma.skillItem.count(),
    async () =>
      (
        await prisma.skillItem.createMany({
          data: skills.map((s) => ({ ...s, group: s.group as 'CAREER' | 'STARTER' | 'BUILT_IN' })),
        })
      ).count,
  );

  for (const [key, value] of Object.entries(settings)) {
    const exists = await prisma.siteSetting.count({ where: { key } });
    if (!exists)
      await prisma.siteSetting.create({ data: { key, value: value as Prisma.InputJsonValue } });
  }

  // Past events need an author; the first admin is used (sign up and grant-admin first).
  const admin = await prisma.member.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  for (const e of pastEvents) {
    if (await prisma.event.count({ where: { slug: e.slug } })) continue;
    if (!admin) {
      logger.warn({ event: e.slug }, 'no admin yet, past event skipped (rerun after grant-admin)');
      continue;
    }
    await prisma.event.create({
      data: {
        slug: e.slug,
        title: e.title,
        summary: e.title,
        startsAt: new Date(e.startAt),
        endsAt: new Date(e.endAt),
        location: 'See event page',
        imageUrl: e.image,
        externalUrl: e.registerUrl,
        status: 'COMPLETED',
        completedAt: new Date(e.endAt),
        registrationOpen: false,
        capacity: null,
        createdById: admin.id,
      },
    });
  }

  await recordAudit(prisma, {
    runId: `seed-content-${randomUUID()}`,
    actorType: 'SYSTEM',
    action: 'content.seeded',
    result: 'SUCCESS',
  });
}

if (process.argv[1]?.endsWith('seed-content.ts')) {
  const env = parseEnv(workerEnvSchema);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    await seedContent(db);
  } finally {
    await db.$disconnect();
  }
}
