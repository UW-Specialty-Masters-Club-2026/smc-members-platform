import { parseEnv, workerEnvSchema } from '@smc/config';
import { CLUB_TIMEZONE, createLogger } from '@smc/core';

// Background worker: hosts the timezone-aware scheduler (croner) and the MySQL-backed
// job runner. Job handlers are registered in later steps.
const env = parseEnv(workerEnvSchema);
const logger = createLogger({
  name: 'smc-worker',
  level: env.APP_ENV === 'development' ? 'debug' : 'info',
});

logger.info({ appEnv: env.APP_ENV, timezone: CLUB_TIMEZONE }, 'worker started');

const keepAlive = setInterval(() => {}, 60_000);

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down worker');
  clearInterval(keepAlive);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
