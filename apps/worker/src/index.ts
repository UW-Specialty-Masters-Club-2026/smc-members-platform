import { hostname } from 'node:os';
import { parseEnv, workerEnvSchema } from '@smc/config';
import { CLUB_TIMEZONE, createLogger } from '@smc/core';
import { createPrismaClient } from '@smc/db';
import { digestJobHandlers, startDigestCrons, tick, type WorkflowDeps } from '@smc/digest';
import { createBatchTransport, createMailer, recipientGuard } from '@smc/email';
import { runDueJobs } from '@smc/jobs';

// Background worker: Pacific-time schedules (croner) trigger idempotent ticks, and a poller
// drains the MySQL job queue. Several workers may run; SKIP LOCKED keeps them apart.
const env = parseEnv(workerEnvSchema);
const logger = createLogger({
  name: 'smc-worker',
  level: env.APP_ENV === 'development' ? 'debug' : 'info',
});
const workerId = `${hostname()}-${process.pid}`;
const db = createPrismaClient(env.DATABASE_URL);
const mailer = createMailer(env);
const transport = createBatchTransport(env);
const guard = recipientGuard(env.APP_ENV, env.EMAIL_ALLOWLIST);

const makeDeps = (runId: string): WorkflowDeps => ({
  db,
  transport,
  guard,
  mailer,
  from: env.MAIL_FROM,
  replyTo: env.MAIL_REPLY_TO,
  appBaseUrl: env.APP_BASE_URL,
  apiBaseUrl: env.API_BASE_URL,
  linkSigningSecret: env.LINK_SIGNING_SECRET,
  lookaheadDays: env.DIGEST_EVENT_LOOKAHEAD_DAYS,
  logoUrl: env.DIGEST_LOGO_URL ?? null,
  now: () => new Date(),
  runId,
});

async function runTick(trigger: string) {
  const runId = `tick-${trigger}-${Date.now()}`;
  try {
    const result = await tick(makeDeps(runId));
    logger.debug({ trigger, runId, ...result }, 'tick');
  } catch (err) {
    logger.error({ err, trigger, runId }, 'tick failed');
  }
}

let draining = false;
async function drainJobs() {
  if (draining) return;
  draining = true;
  try {
    const result = await runDueJobs(db, digestJobHandlers(makeDeps), {
      workerId,
      now: () => new Date(),
      onError: (job, err) => logger.warn({ err, job: job.name, key: job.jobKey }, 'job failed'),
    });
    if (result.succeeded + result.retried + result.dead > 0) logger.info(result, 'jobs processed');
  } catch (err) {
    logger.error({ err }, 'job polling failed');
  } finally {
    draining = false;
  }
}

const stopCrons = startDigestCrons(runTick);
const poller = setInterval(() => void drainJobs(), env.WORKER_POLL_MS);
logger.info(
  {
    appEnv: env.APP_ENV,
    timezone: CLUB_TIMEZONE,
    transport: env.MAIL_TRANSPORT,
    testMode: env.MAILGUN_TEST_MODE,
    allowlistSize: env.APP_ENV === 'production' ? null : env.EMAIL_ALLOWLIST.length,
    workerId,
  },
  'worker started',
);
// Catch up immediately after a restart instead of waiting for the next minute.
void runTick('startup').then(drainJobs);

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down worker');
  stopCrons();
  clearInterval(poller);
  const waitForJobs = setInterval(() => {
    if (draining) return;
    clearInterval(waitForJobs);
    void db.$disconnect().finally(() => process.exit(0));
  }, 100);
  setTimeout(() => process.exit(1), 30_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
