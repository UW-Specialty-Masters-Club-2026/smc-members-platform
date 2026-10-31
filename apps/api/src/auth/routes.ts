import { PASSWORD_MAX, PASSWORD_MIN } from '@smc/core';
import { Router, type CookieOptions } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { secureCookies, type AppContext } from '../context';
import { requireAuth, SESSION_COOKIE } from '../middleware/access';
import { logout, passwordLogin, requestLogin, signup, verifyMagicLink } from './service';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));
const nameSchema = z.string().trim().min(1).max(100);

const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

const signupBody = z.strictObject({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  newsOptIn: z.boolean(),
  password: passwordSchema.optional(),
});
const loginBody = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX),
});
const magicLinkBody = z.strictObject({ email: emailSchema });
const verifyBody = z.strictObject({ token: z.string().min(20).max(200) });

/** Same answer whether or not the address is registered. */
const CHECK_EMAIL = { status: 'check_email' } as const;

export function authRouter(ctx: AppContext): Router {
  const router = Router();
  const cookieBase: CookieOptions = {
    httpOnly: true,
    secure: secureCookies(ctx.config),
    sameSite: 'lax',
    path: '/',
  };

  const emailLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: ctx.config.authRateLimitPerIp,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'too_many_requests' },
  });

  router.post('/signup', emailLimiter, async (req, res) => {
    await signup(ctx, req.runId, signupBody.parse(req.body));
    res.status(202).json(CHECK_EMAIL);
  });

  router.post('/magic-link', emailLimiter, async (req, res) => {
    await requestLogin(ctx, req.runId, magicLinkBody.parse(req.body).email);
    res.status(202).json(CHECK_EMAIL);
  });

  router.post('/verify', async (req, res) => {
    const { token } = verifyBody.parse(req.body);
    const { member, sessionToken, sessionExpiresAt } = await verifyMagicLink(ctx, req.runId, token);
    res.cookie(SESSION_COOKIE, sessionToken, { ...cookieBase, expires: sessionExpiresAt });
    res.json({ member: { id: member.id, firstName: member.firstName, role: member.role } });
  });

  router.post('/login', emailLimiter, async (req, res) => {
    const { email, password } = loginBody.parse(req.body);
    const { member, sessionToken, sessionExpiresAt } = await passwordLogin(
      ctx,
      req.runId,
      email,
      password,
    );
    res.cookie(SESSION_COOKIE, sessionToken, { ...cookieBase, expires: sessionExpiresAt });
    res.json({ member: { id: member.id, firstName: member.firstName, role: member.role } });
  });

  router.post('/logout', requireAuth, async (req, res) => {
    await logout(ctx, req.runId, req.auth!.sessionId, req.auth!.memberId);
    res.clearCookie(SESSION_COOKIE, cookieBase);
    res.status(204).end();
  });

  return router;
}
