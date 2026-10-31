import { apiEnvSchema, parseEnv } from '@smc/config';
import { createLogger } from '@smc/core';
import { createPrismaClient } from '@smc/db';
import { createMailer } from '@smc/email';
import { createApp } from './app';

const env = parseEnv(apiEnvSchema);
const logger = createLogger({
  name: 'smc-api',
  level: env.APP_ENV === 'development' ? 'debug' : 'info',
});
const prisma = createPrismaClient(env.DATABASE_URL);

const app = createApp({
  prisma,
  logger,
  mailer: createMailer(env),
  now: () => new Date(),
  config: {
    appEnv: env.APP_ENV,
    appBaseUrl: env.APP_BASE_URL,
    authRateLimitPerIp: 10,
    linkSigningSecret: env.LINK_SIGNING_SECRET,
    apiBaseUrl: env.API_BASE_URL,
    mailFrom: env.MAIL_FROM,
    mailReplyTo: env.MAIL_REPLY_TO,
    emailAllowlist: env.EMAIL_ALLOWLIST,
    digestLookaheadDays: env.DIGEST_EVENT_LOOKAHEAD_DAYS,
    digestLogoUrl: env.DIGEST_LOGO_URL ?? null,
    mailgunWebhookSigningKey: env.MAILGUN_WEBHOOK_SIGNING_KEY ?? null,
    uploadDir: env.UPLOAD_DIR,
  },
});

const server = app.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT, appEnv: env.APP_ENV }, 'api listening');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down api');
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
