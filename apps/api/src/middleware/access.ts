import { hashToken } from '@smc/core';
import { recordAudit, type MemberRole } from '@smc/db';
import type { RequestHandler } from 'express';
import type { AppContext } from '../context';
import { HttpError } from '../errors';

export const SESSION_COOKIE = 'smc_session';
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Access layer, step 1: resolve the session cookie to an identity and role.
 * Revoked, expired or inactive-member sessions are treated as anonymous.
 */
export function loadSession(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) return next();

    const session = await ctx.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { member: { select: { id: true, role: true, status: true } } },
    });
    const now = ctx.now();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.member.status !== 'ACTIVE'
    ) {
      return next();
    }

    req.auth = { sessionId: session.id, memberId: session.member.id, role: session.member.role };
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await ctx.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw new HttpError(401, 'unauthenticated');
  next();
};

/** Access layer, step 2: role check. Denials are written to the audit log. */
export function requireRole(ctx: AppContext, ...roles: MemberRole[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) throw new HttpError(401, 'unauthenticated');
    if (!roles.includes(req.auth.role)) {
      await recordAudit(ctx.prisma, {
        runId: req.runId,
        actorType: 'MEMBER',
        actorId: req.auth.memberId,
        action: 'access.denied',
        result: 'DENIED',
        metadata: { method: req.method, path: req.originalUrl, required: roles },
      });
      throw new HttpError(403, 'forbidden');
    }
    next();
  };
}

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Origins the browser may send for cookie-authenticated mutations. In development the same
 * port on any loopback name also counts, so opening http://127.0.0.1:3000 instead of
 * http://localhost:3000 still works.
 */
export function allowedOrigins(appBaseUrl: string, appEnv: string): Set<string> {
  const base = new URL(appBaseUrl);
  const origins = new Set([base.origin]);
  if (appEnv === 'development' && LOOPBACK.includes(base.hostname)) {
    for (const host of LOOPBACK)
      origins.add(`${base.protocol}//${host}${base.port ? `:${base.port}` : ''}`);
  }
  return origins;
}

/**
 * CSRF guard for cookie-authenticated mutations: the browser's Origin must be our web app.
 * (Webhooks and one-click unsubscribe are mounted outside this guard.)
 */
export function requireSameOrigin(appBaseUrl: string, appEnv = 'production'): RequestHandler {
  const allowed = allowedOrigins(appBaseUrl, appEnv);
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!allowed.has(req.get('origin') ?? '')) throw new HttpError(403, 'bad_origin');
    next();
  };
}
