import type { Prisma, PrismaClient } from '@smc/db';

/**
 * Who receives the digest: active members with a verified email who opted in to news and
 * invitations and haven't been suppressed (unsubscribe, spam complaint, hard bounce).
 */
export const RECIPIENT_WHERE = {
  status: 'ACTIVE',
  newsOptIn: true,
  emailVerifiedAt: { not: null },
  emailSuppressedReason: null,
} satisfies Prisma.MemberWhereInput;

export const RECIPIENT_SCOPE =
  'Active members with a verified email who opted in to SMC news and invitations';

export interface RecipientSummary {
  total: number;
  scope: string;
  /** e.g. [{ domain: 'uw.edu', count: 212 }, { domain: 'gmail.com', count: 9 }] */
  byDomain: { domain: string; count: number }[];
}

/** Counts for the approval preview — no addresses leave the database. */
export async function recipientSummary(db: PrismaClient): Promise<RecipientSummary> {
  const rows = await db.$queryRaw<{ domain: string; n: bigint }[]>`
    SELECT LOWER(SUBSTRING_INDEX(email, '@', -1)) AS domain, COUNT(*) AS n
    FROM members
    WHERE status = 'ACTIVE'
      AND news_opt_in = TRUE
      AND email_verified_at IS NOT NULL
      AND email_suppressed_reason IS NULL
    GROUP BY domain
    ORDER BY n DESC, domain ASC`;
  const byDomain = rows.map((r) => ({ domain: r.domain, count: Number(r.n) }));
  return {
    total: byDomain.reduce((sum, d) => sum + d.count, 0),
    scope: RECIPIENT_SCOPE,
    byDomain,
  };
}

/** Page through recipients in stable id order (for batching at send time). */
export async function recipientPage(db: PrismaClient, afterId: string | null, take: number) {
  return db.member.findMany({
    where: { ...RECIPIENT_WHERE, ...(afterId && { id: { gt: afterId } }) },
    orderBy: { id: 'asc' },
    take,
    select: { id: true, email: true, firstName: true },
  });
}
