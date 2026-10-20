import { recordAudit, type EmailSuppressionReason, type Prisma, type PrismaClient } from '@smc/db';

export type SuppressionSource = 'unsubscribe_link' | 'one_click' | 'mailgun_webhook';

/** A complaint outranks a hard bounce, which outranks a plain unsubscribe. */
const RANK: Record<EmailSuppressionReason, number> = {
  UNSUBSCRIBED: 1,
  HARD_BOUNCE: 2,
  COMPLAINED: 3,
};

/**
 * Switch a member's news & invitations off (unsubscribe, spam complaint, hard bounce).
 * Idempotent: an already-suppressed member is left as is and nothing is re-audited.
 */
export async function suppressMember(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    memberId: string;
    reason: EmailSuppressionReason;
    source: SuppressionSource;
    runId: string;
    now: Date;
    metadata?: Record<string, unknown>;
  },
): Promise<'suppressed' | 'already' | 'not_found'> {
  const member = await db.member.findUnique({
    where: { id: input.memberId },
    select: { id: true, newsOptIn: true, emailSuppressedReason: true },
  });
  if (!member) return 'not_found';
  const current = member.emailSuppressedReason;
  if (!member.newsOptIn && current !== null && RANK[current] >= RANK[input.reason])
    return 'already';

  await db.member.update({
    where: { id: member.id },
    data: {
      newsOptIn: false,
      newsOptInUpdatedAt: input.now,
      emailSuppressedReason: input.reason,
    },
  });
  await recordAudit(db, {
    runId: input.runId,
    actorType: input.source === 'mailgun_webhook' ? 'WEBHOOK' : 'MEMBER',
    actorId: input.source === 'mailgun_webhook' ? null : member.id,
    action: 'member.news_opt_in.changed',
    entityType: 'member',
    entityId: member.id,
    result: 'SUCCESS',
    metadata: {
      from: member.newsOptIn,
      to: false,
      reason: input.reason,
      source: input.source,
      ...input.metadata,
    },
  });
  return 'suppressed';
}
