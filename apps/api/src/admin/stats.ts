import { countsFor } from '@smc/db';
import { Router } from 'express';
import type { AppContext } from '../context';
import { requireRole } from '../middleware/access';
import { auditView } from './audit';

const DAY = 24 * 60 * 60_000;

/** Numbers for the admin dashboard. */
export function adminStatsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireRole(ctx, 'ADMIN', 'ORGANIZER'));

  router.get('/', async (req, res) => {
    const now = ctx.now();
    const weeks = 8;
    const since = new Date(now.getTime() - weeks * 7 * DAY);
    const db = ctx.prisma;
    const [
      members,
      activeMembers,
      optedIn,
      newMembers30,
      upcoming,
      registrations,
      checkIns,
      articles,
      digests,
      recent,
    ] = await Promise.all([
      db.member.count(),
      db.member.count({ where: { status: 'ACTIVE', emailVerifiedAt: { not: null } } }),
      db.member.count({
        where: {
          status: 'ACTIVE',
          newsOptIn: true,
          emailVerifiedAt: { not: null },
          emailSuppressedReason: null,
        },
      }),
      db.member.count({ where: { createdAt: { gt: new Date(now.getTime() - 30 * DAY) } } }),
      db.event.findMany({
        where: { status: 'PUBLISHED', startsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
        take: 5,
      }),
      db.registration.findMany({
        where: { registeredAt: { gt: since }, status: { not: 'CANCELLED' } },
        select: { registeredAt: true },
      }),
      db.attendance.count({ where: { checkedInAt: { gt: since } } }),
      db.article.count({ where: { status: 'PUBLISHED' } }),
      db.weeklyDigest.findMany({ orderBy: { weekKey: 'desc' }, take: 1 }),
      req.auth!.role === 'ADMIN'
        ? db.auditLog.findMany({ orderBy: { id: 'desc' }, take: 8 })
        : Promise.resolve([]),
    ]);

    // Registrations per week, oldest first.
    const perWeek = Array.from({ length: weeks }, (_, i) => {
      const start = new Date(since.getTime() + i * 7 * DAY);
      return { weekStart: start.toISOString().slice(0, 10), count: 0 };
    });
    for (const r of registrations) {
      const i = Math.min(
        weeks - 1,
        Math.floor((r.registeredAt.getTime() - since.getTime()) / (7 * DAY)),
      );
      if (i >= 0) perWeek[i]!.count += 1;
    }
    const counts = await countsFor(
      db,
      upcoming.map((e) => e.id),
    );

    res.json({
      members: { total: members, active: activeMembers, optedIn, new30d: newMembers30 },
      registrations: { last8Weeks: registrations.length, perWeek },
      checkIns8Weeks: checkIns,
      publishedArticles: articles,
      latestDigest: digests[0]
        ? { id: digests[0].id, weekKey: digests[0].weekKey, status: digests[0].status }
        : null,
      upcoming: upcoming.map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        startsAt: e.startsAt,
        capacity: e.capacity,
        confirmed: counts.get(e.id)!.confirmed,
        waitlisted: counts.get(e.id)!.waitlisted,
      })),
      recentActivity: await auditView(ctx, recent),
    });
  });

  return router;
}
