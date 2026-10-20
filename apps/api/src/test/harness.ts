import { Writable } from 'node:stream';
import { createLogger, generateToken, hashToken } from '@smc/core';
import { createPrismaClient, type MemberRole, type PrismaClient } from '@smc/db';
import { assertTestDatabase, resetDatabase } from '@smc/db/testing';
import { MemoryMailer } from '@smc/email';
import { createApp } from '../app';
import type { AppContext } from '../context';
import { SESSION_COOKIE } from '../middleware/access';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasTestDb = Boolean(TEST_DATABASE_URL);
export const WEB_ORIGIN = 'http://localhost:3000';
export const TEST_LINK_SECRET = 'test-link-signing-secret-0123456789abcdef';

export interface TestHarness {
  ctx: AppContext;
  app: ReturnType<typeof createApp>;
  prisma: PrismaClient;
  mailer: MemoryMailer;
  logLines: string[];
  /** Move the injected clock. */
  setNow(date: Date): void;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createHarness(): TestHarness {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
  assertTestDatabase(TEST_DATABASE_URL);
  const prisma = createPrismaClient(TEST_DATABASE_URL);
  const mailer = new MemoryMailer();
  const logLines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      logLines.push(String(chunk));
      cb();
    },
  });
  let now = new Date('2026-10-19T17:00:00Z');
  const ctx: AppContext = {
    prisma,
    logger: createLogger({ level: 'debug' }, sink),
    mailer,
    now: () => new Date(now),
    config: {
      appEnv: 'test',
      appBaseUrl: WEB_ORIGIN,
      authRateLimitPerIp: 1000,
      linkSigningSecret: TEST_LINK_SECRET,
      apiBaseUrl: 'http://localhost:4000',
      mailFrom: 'Specialty Masters Club <news@mail.smc.example>',
      mailReplyTo: 'smcommittee@uw.edu',
      emailAllowlist: [],
      digestLookaheadDays: 21,
      digestLogoUrl: null,
    },
  };

  return {
    ctx,
    app: createApp(ctx),
    prisma,
    mailer,
    logLines,
    setNow(date) {
      now = date;
    },
    async reset() {
      await resetDatabase(prisma);
      mailer.sent.length = 0;
      logLines.length = 0;
      now = new Date('2026-10-19T17:00:00Z');
    },
    close: () => prisma.$disconnect(),
  };
}

/** Insert a verified, active member and return a valid session cookie for them. */
export async function signedInMember(
  h: TestHarness,
  opts: { email?: string; role?: MemberRole; newsOptIn?: boolean } = {},
) {
  const member = await h.prisma.member.create({
    data: {
      email: opts.email ?? `member-${Math.random().toString(36).slice(2)}@uw.edu`,
      firstName: 'Test',
      lastName: 'Member',
      role: opts.role ?? 'MEMBER',
      newsOptIn: opts.newsOptIn ?? false,
      emailVerifiedAt: h.ctx.now(),
    },
  });
  const token = generateToken();
  await h.prisma.session.create({
    data: {
      memberId: member.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(h.ctx.now().getTime() + 30 * 86_400_000),
    },
  });
  return { member, cookie: `${SESSION_COOKIE}=${token}` };
}

/** Pull the raw token out of the most recent magic-link email. */
export function lastMagicLinkToken(mailer: MemoryMailer): string {
  const last = mailer.sent.at(-1);
  const match = last && /#token=([A-Za-z0-9_-]+)/.exec(last.text);
  if (!match?.[1]) throw new Error('no magic link email was sent');
  return match[1];
}
