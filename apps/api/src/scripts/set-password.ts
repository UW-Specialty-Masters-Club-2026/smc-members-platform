/**
 * Set a member's password from the terminal (e.g. the first admin, or a demo account):
 *   npm run set-password -w @smc/api -- someone@uw.edu
 * The password is typed at a hidden prompt, never passed on the command line.
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { baseEnvSchema, parseEnv } from '@smc/config';
import {
  createLogger,
  hashPassword,
  maskEmail,
  normalizeEmail,
  PASSWORD_MAX,
  PASSWORD_MIN,
} from '@smc/core';
import { createPrismaClient, recordAudit } from '@smc/db';

const logger = createLogger({ name: 'set-password' });
const email = process.argv[2];
if (!email) {
  logger.error('usage: set-password <email>');
  process.exit(2);
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Echo nothing while the password is typed.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
    if (s.startsWith(question)) process.stdout.write(question);
  };
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    }),
  );
}

const env = parseEnv(baseEnvSchema);
const prisma = createPrismaClient(env.DATABASE_URL);
try {
  const member = await prisma.member.findUnique({ where: { email: normalizeEmail(email) } });
  if (!member) {
    logger.error({ email: maskEmail(email) }, 'no member with that email');
    process.exitCode = 1;
  } else {
    const password = await ask(`New password (${PASSWORD_MIN}+ characters): `);
    const again = await ask('Repeat password: ');
    if (password !== again) throw new Error('the passwords do not match');
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      throw new Error(`use ${PASSWORD_MIN}–${PASSWORD_MAX} characters`);
    }
    const now = new Date();
    await prisma.member.update({
      where: { id: member.id },
      // Setting a password from the server also confirms the address.
      data: {
        passwordHash: await hashPassword(password),
        passwordUpdatedAt: now,
        emailVerifiedAt: member.emailVerifiedAt ?? now,
      },
    });
    await recordAudit(prisma, {
      runId: randomUUID(),
      actorType: 'SYSTEM',
      action: 'auth.password.set',
      entityType: 'member',
      entityId: member.id,
      result: 'SUCCESS',
      metadata: { via: 'set-password script' },
    });
    logger.info({ memberId: member.id }, 'password set');
  }
} catch (err) {
  logger.error({ err: err instanceof Error ? err.message : err }, 'password not set');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
