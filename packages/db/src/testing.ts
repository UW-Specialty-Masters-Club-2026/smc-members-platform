import type { PrismaClient } from './generated/prisma/client';

/** Every table, children before parents, so rows can be deleted without disabling FKs. */
const TABLES = [
  'jobs',
  'mailgun_webhook_events',
  'digest_deliveries',
  'digest_batches',
  'weekly_digests',
  'digest_settings',
  'news_openings',
  'news_posts',
  'audit_logs',
  'survey_answers',
  'survey_responses',
  'survey_questions',
  'surveys',
  'attendance',
  'registrations',
  'events',
  'sessions',
  'magic_link_tokens',
  'members',
];

export function assertTestDatabase(url: string): void {
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('refusing to run against a database whose name does not end in _test');
  }
}

/**
 * Empty all tables. DELETE (not TRUNCATE) because pooled connections would not share
 * a session-level FOREIGN_KEY_CHECKS=0.
 */
export async function resetDatabase(db: PrismaClient): Promise<void> {
  for (const table of TABLES) await db.$executeRawUnsafe(`DELETE FROM \`${table}\``);
}
