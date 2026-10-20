import { generateToken, hashToken, normalizeEmail } from '@smc/core';
import { recordAudit, type MagicLinkPurpose, type Member } from '@smc/db';
import { renderMagicLinkEmail } from '@smc/email';
import type { AppContext } from '../context';
import { HttpError } from '../errors';

export const MAGIC_LINK_TTL_MINUTES = 15;
export const SESSION_TTL_DAYS = 30;
/** Per-address cap on links within one TTL window (on top of the per-IP limit). */
export const MAX_LINKS_PER_WINDOW = 3;

export interface SignupInput {
  email: string;
  firstName: string;
  lastName: string;
  newsOptIn: boolean;
}

/**
 * Create the member (unverified) and email a confirmation link. If the address already
 * belongs to a member, send a normal sign-in link instead and leave the profile untouched,
 * so the response never reveals whether an address is registered.
 */
export async function signup(ctx: AppContext, runId: string, input: SignupInput): Promise<void> {
  const email = normalizeEmail(input.email);
  const existing = await ctx.prisma.member.findUnique({ where: { email } });
  if (existing) {
    await sendMagicLink(ctx, runId, existing, 'LOGIN');
    return;
  }

  const now = ctx.now();
  const member = await ctx.prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        newsOptIn: input.newsOptIn,
        newsOptInUpdatedAt: now,
      },
    });
    await recordAudit(tx, {
      runId,
      actorType: 'MEMBER',
      actorId: created.id,
      action: 'member.signup',
      entityType: 'member',
      entityId: created.id,
      result: 'SUCCESS',
      metadata: { newsOptIn: input.newsOptIn },
    });
    return created;
  });
  await sendMagicLink(ctx, runId, member, 'SIGNUP');
}

/** Email a sign-in link if the address belongs to an active member; silent otherwise. */
export async function requestLogin(
  ctx: AppContext,
  runId: string,
  rawEmail: string,
): Promise<void> {
  const member = await ctx.prisma.member.findUnique({ where: { email: normalizeEmail(rawEmail) } });
  if (!member) {
    await recordAudit(ctx.prisma, {
      runId,
      actorType: 'SYSTEM',
      action: 'auth.magic_link.unknown_email',
      result: 'SKIPPED',
    });
    return;
  }
  await sendMagicLink(ctx, runId, member, 'LOGIN');
}

async function sendMagicLink(
  ctx: AppContext,
  runId: string,
  member: Member,
  purpose: MagicLinkPurpose,
): Promise<void> {
  const audit = { runId, actorType: 'SYSTEM' as const, entityType: 'member', entityId: member.id };

  if (member.status !== 'ACTIVE') {
    await recordAudit(ctx.prisma, {
      ...audit,
      action: 'auth.magic_link.inactive',
      result: 'SKIPPED',
    });
    return;
  }

  const now = ctx.now();
  const windowStart = new Date(now.getTime() - MAGIC_LINK_TTL_MINUTES * 60_000);
  const recent = await ctx.prisma.magicLinkToken.count({
    where: { memberId: member.id, createdAt: { gt: windowStart } },
  });
  if (recent >= MAX_LINKS_PER_WINDOW) {
    await recordAudit(ctx.prisma, {
      ...audit,
      action: 'auth.magic_link.rate_limited',
      result: 'SKIPPED',
    });
    return;
  }

  const token = generateToken();
  await ctx.prisma.magicLinkToken.create({
    data: {
      memberId: member.id,
      tokenHash: hashToken(token),
      purpose,
      createdAt: now,
      expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MINUTES * 60_000),
    },
  });

  // Token travels in the URL fragment: it never reaches server logs or Referer headers,
  // and the callback page only redeems it on an explicit click (defeats link scanners).
  const url = `${ctx.config.appBaseUrl}/auth/callback#token=${token}`;
  const email = renderMagicLinkEmail({
    firstName: member.firstName,
    url,
    purpose,
    expiresInMinutes: MAGIC_LINK_TTL_MINUTES,
  });

  try {
    const { messageId } = await ctx.mailer.send({ to: member.email, tag: 'auth', ...email });
    await recordAudit(ctx.prisma, {
      ...audit,
      action: 'auth.magic_link.sent',
      result: 'SUCCESS',
      metadata: { purpose, messageId },
    });
  } catch (err) {
    ctx.logger.error({ err, runId, memberId: member.id }, 'magic link email failed');
    await recordAudit(ctx.prisma, {
      ...audit,
      action: 'auth.magic_link.sent',
      result: 'FAILURE',
      metadata: { purpose, error: err instanceof Error ? err.message : 'unknown' },
    });
  }
}

export interface VerifiedLogin {
  member: Member;
  sessionToken: string;
  sessionExpiresAt: Date;
}

/**
 * Redeem a magic link exactly once: the conditional update claims the token atomically,
 * so a double click or a replay can never create a second session.
 */
export async function verifyMagicLink(
  ctx: AppContext,
  runId: string,
  token: string,
): Promise<VerifiedLogin> {
  const now = ctx.now();
  const tokenHash = hashToken(token);

  const outcome = await ctx.prisma.$transaction(async (tx) => {
    const claimed = await tx.magicLinkToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return { kind: 'invalid' as const };

    const link = await tx.magicLinkToken.findUniqueOrThrow({
      where: { tokenHash },
      include: { member: true },
    });
    if (link.member.status !== 'ACTIVE')
      return { kind: 'inactive' as const, memberId: link.memberId };

    let member = link.member;
    if (!member.emailVerifiedAt) {
      member = await tx.member.update({ where: { id: member.id }, data: { emailVerifiedAt: now } });
      await recordAudit(tx, {
        runId,
        actorType: 'MEMBER',
        actorId: member.id,
        action: 'member.email_verified',
        entityType: 'member',
        entityId: member.id,
        result: 'SUCCESS',
      });
    }

    const sessionToken = generateToken();
    const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60_000);
    const session = await tx.session.create({
      data: {
        memberId: member.id,
        tokenHash: hashToken(sessionToken),
        expiresAt: sessionExpiresAt,
        createdAt: now,
        lastSeenAt: now,
      },
    });
    await recordAudit(tx, {
      runId,
      actorType: 'MEMBER',
      actorId: member.id,
      action: 'auth.login',
      entityType: 'session',
      entityId: session.id,
      result: 'SUCCESS',
      metadata: { purpose: link.purpose },
    });
    return { kind: 'ok' as const, member, sessionToken, sessionExpiresAt };
  });

  if (outcome.kind === 'ok') return outcome;

  await recordAudit(ctx.prisma, {
    runId,
    actorType: 'SYSTEM',
    action: 'auth.login',
    result: 'FAILURE',
    entityType: outcome.kind === 'inactive' ? 'member' : undefined,
    entityId: outcome.kind === 'inactive' ? outcome.memberId : undefined,
    metadata: { reason: outcome.kind },
  });
  throw outcome.kind === 'inactive'
    ? new HttpError(403, 'account_inactive')
    : new HttpError(400, 'invalid_or_expired_link');
}

export async function logout(ctx: AppContext, runId: string, sessionId: string, memberId: string) {
  await ctx.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: ctx.now() } });
  await recordAudit(ctx.prisma, {
    runId,
    actorType: 'MEMBER',
    actorId: memberId,
    action: 'auth.logout',
    entityType: 'session',
    entityId: sessionId,
    result: 'SUCCESS',
  });
}
