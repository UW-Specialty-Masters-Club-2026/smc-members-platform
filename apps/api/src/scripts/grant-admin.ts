/**
 * Bootstrap the first admin (there is no admin yet to do it through the UI):
 *   npm run grant-admin -w @smc/api -- someone@uw.edu
 * The member must have signed up first. The change is audit-logged as a SYSTEM action.
 */
import { randomUUID } from 'node:crypto';
import { baseEnvSchema, parseEnv } from '@smc/config';
import { createLogger, maskEmail, normalizeEmail } from '@smc/core';
import { createPrismaClient, recordAudit } from '@smc/db';

const logger = createLogger({ name: 'grant-admin' });
const email = process.argv[2];
if (!email) {
  logger.error('usage: grant-admin <email>');
  process.exit(2);
}

const env = parseEnv(baseEnvSchema);
const prisma = createPrismaClient(env.DATABASE_URL);
try {
  const member = await prisma.member.findUnique({ where: { email: normalizeEmail(email) } });
  if (!member) {
    logger.error({ email: maskEmail(email) }, 'no member with that email — sign up first');
    process.exitCode = 1;
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.member.update({ where: { id: member.id }, data: { role: 'ADMIN' } });
      await recordAudit(tx, {
        runId: randomUUID(),
        actorType: 'SYSTEM',
        action: 'member.access.changed',
        entityType: 'member',
        entityId: member.id,
        result: 'SUCCESS',
        metadata: { from: { role: member.role }, to: { role: 'ADMIN' }, via: 'grant-admin script' },
      });
    });
    logger.info({ memberId: member.id }, 'granted ADMIN');
  }
} finally {
  await prisma.$disconnect();
}
