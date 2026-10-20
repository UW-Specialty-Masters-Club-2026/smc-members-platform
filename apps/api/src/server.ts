import { apiEnvSchema, parseEnv } from '@smc/config';
import { createApp } from './app';
import { createLogger } from '@smc/core';

const env = parseEnv(apiEnvSchema);
const logger = createLogger({
  name: 'smc-api',
  level: env.APP_ENV === 'development' ? 'debug' : 'info',
});
const app = createApp({ logger });

const server = app.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT, appEnv: env.APP_ENV }, 'api listening');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down api');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
