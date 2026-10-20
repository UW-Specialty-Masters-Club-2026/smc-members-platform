import { apiEnvSchema, parseEnv } from '@smc/config';
import { createLogger } from '@smc/core';
import { createPrismaClient } from '@smc/db';
import { createApp } from './app';
import { createMailer } from './mailer';

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
