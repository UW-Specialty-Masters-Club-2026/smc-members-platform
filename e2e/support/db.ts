import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createPrismaClient, type PrismaClient } from '@smc/db';
import { resetDatabase } from '@smc/db/testing';
import { createDraft, weekKeyFor } from '@smc/digest';
import { DevOutboxMailer } from '@smc/email';
import { ADMIN_EMAIL, E2E_DATABASE_URL, E2E_ENV, MEMBER_EMAILS, OUTBOX_DIR } from './env';

let client: PrismaClient | null = null;
export function db(): PrismaClient {
  client ??= createPrismaClient(E2E_DATABASE_URL);
  return client;
}

export async function resetAll() {
  if (!new URL(E2E_DATABASE_URL).pathname.endsWith('_e2e')) throw new Error('not the e2e database');
  await resetDatabase(db());
  await rm(OUTBOX_DIR, { recursive: true, force: true });
  await mkdir(OUTBOX_DIR, { recursive: true });
}

export interface OutboxItem {
  file: string;
  to?: string;
  subject?: string;
  text?: string;
  tag: string;
  recipients?: { email: string; variables: Record<string, string> }[];
}

export async function outbox(): Promise<OutboxItem[]> {
  const files = (await readdir(OUTBOX_DIR).catch(() => [])).sort();
  return Promise.all(
    files.map(async (file) => ({
      file,
      ...JSON.parse(await readFile(join(OUTBOX_DIR, file), 'utf8')),
    })),
  );
}

/** Wait for the newest single email to `to` matching `subject`. */
export async function waitForEmail(
  to: string,
  subject: RegExp,
  timeoutMs = 10_000,
): Promise<OutboxItem> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await outbox())
      .filter((m) => m.to === to && subject.test(m.subject ?? ''))
      .at(-1);
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`no email to ${to} matching ${subject}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

export function magicToken(mail: OutboxItem): string {
  const m = /#token=([A-Za-z0-9_-]+)/.exec(mail.text ?? '');
  if (!m) throw new Error('no magic link in email');
  return m[1]!;
}

async function member(email: string, extra: Record<string, unknown> = {}) {
  return db().member.create({
    data: {
      email,
      firstName: email.split('.')[0]!.replace(/^\w/, (c) => c.toUpperCase()),
      lastName: 'E2E',
      newsOptIn: true,
      emailVerifiedAt: new Date(),
      ...extra,
    },
  });
}

/**
 * An admin, two opted-in members, one opted-out member, an upcoming event, and this week's
 * digest drafted as if at Monday 08:30 PT, with its approval window moved to "now" so the
 * test can approve and the worker can send immediately.
 */
export async function seedDigestAwaitingApproval() {
  const admin = await member(ADMIN_EMAIL, { role: 'ADMIN', newsOptIn: false });
  for (const email of MEMBER_EMAILS) await member(email);
  await member('optout.e2e@uw.edu', { newsOptIn: false });

  const now = new Date();
  const startsAt = new Date(now.getTime() + 2 * 24 * 60 * 60_000);
  await db().event.create({
    data: {
      slug: 'ai-at-work-e2e',
      title: 'AI at Work Workshop',
      summary: 'Hands-on session on putting AI tools to work in finance roles.',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 90 * 60_000),
      location: 'PACCAR Hall, Room 192 · UW Seattle',
      status: 'PUBLISHED',
      capacity: 30,
      createdById: admin.id,
    },
  });

  const weekKey = weekKeyFor(now);
  const mondayMorning = new Date(`${weekKey}T16:30:00Z`); // ≥ 08:30 PT in either DST state
  const result = await createDraft(
    {
      db: db(),
      mailer: new DevOutboxMailer(OUTBOX_DIR),
      transport: {
        sendBatch: () => Promise.reject(new Error('not used')),
        acceptedDeliveryIds: () => Promise.resolve(new Set<string>()),
      },
      guard: { allowlist: new Set() },
      from: E2E_ENV.MAIL_FROM!,
      replyTo: 'smcommittee@uw.edu',
      appBaseUrl: E2E_ENV.APP_BASE_URL!,
      apiBaseUrl: E2E_ENV.API_BASE_URL!,
      linkSigningSecret: E2E_ENV.LINK_SIGNING_SECRET!,
      lookaheadDays: 21,
      now: () => mondayMorning,
      runId: 'e2e-seed',
    },
    weekKey,
  );
  if (result.kind !== 'pending_approval') throw new Error(`seed draft failed: ${result.kind}`);
  await db().weeklyDigest.update({
    where: { id: result.digestId },
    data: {
      sendNotBefore: new Date(now.getTime() - 60_000),
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    },
  });
  return { adminId: admin.id, digestId: result.digestId, weekKey };
}
