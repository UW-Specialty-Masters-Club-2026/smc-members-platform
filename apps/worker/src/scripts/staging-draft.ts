/**
 * Staging helper: draft this week's digest as if it were Monday 08:30 PT, and open a one-hour
 * approval window starting now, so the full approve → send flow can be tested on any day.
 *   npm run staging:draft -w @smc/worker
 * Refuses to run in production. Sending still goes only to EMAIL_ALLOWLIST.
 */
import { randomUUID } from 'node:crypto';
import { parseEnv, workerEnvSchema } from '@smc/config';
import { createLogger } from '@smc/core';
import { createPrismaClient, recordAudit } from '@smc/db';
import { createDraft, weekKeyFor } from '@smc/digest';
import { createBatchTransport, createMailer, recipientGuard } from '@smc/email';

const env = parseEnv(workerEnvSchema);
const logger = createLogger({ name: 'staging-draft' });
if (env.APP_ENV === 'production') {
  logger.error('staging-draft is disabled in production');
  process.exit(2);
}

const db = createPrismaClient(env.DATABASE_URL);
const runId = `staging-draft-${randomUUID()}`;
try {
  const now = new Date();
  const weekKey = weekKeyFor(now);
  const mondayMorning = new Date(`${weekKey}T16:30:00Z`); // 08:30 PST / 09:30 PDT
  const result = await createDraft(
    {
      db,
      mailer: createMailer(env),
      transport: createBatchTransport(env),
      guard: recipientGuard(env.APP_ENV, env.EMAIL_ALLOWLIST),
      from: env.MAIL_FROM,
      replyTo: env.MAIL_REPLY_TO,
      appBaseUrl: env.APP_BASE_URL,
      apiBaseUrl: env.API_BASE_URL,
      linkSigningSecret: env.LINK_SIGNING_SECRET,
      lookaheadDays: env.DIGEST_EVENT_LOOKAHEAD_DAYS,
      logoUrl: env.DIGEST_LOGO_URL ?? null,
      now: () => mondayMorning,
      runId,
    },
    weekKey,
  );
  if (result.kind === 'pending_approval') {
    await db.weeklyDigest.update({
      where: { id: result.digestId },
      data: { sendNotBefore: now, expiresAt: new Date(now.getTime() + 60 * 60_000) },
    });
    await recordAudit(db, {
      runId,
      actorType: 'SYSTEM',
      action: 'digest.staging_window_opened',
      entityType: 'weekly_digest',
      entityId: result.digestId,
      result: 'SUCCESS',
      metadata: { appEnv: env.APP_ENV, expiresAt: new Date(now.getTime() + 60 * 60_000) },
    });
  }
  logger.info(
    { weekKey, ...result, adminUrl: `${env.APP_BASE_URL}/admin/digests` },
    'staging draft',
  );
} finally {
  await db.$disconnect();
}
