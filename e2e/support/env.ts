import { resolve } from 'node:path';

/** Everything the API, web app and worker need for an E2E run — no .env file required. */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'mysql://smc:smc_local@127.0.0.1:3306/smc_e2e';

export const OUTBOX_DIR = resolve(import.meta.dirname, '../../.e2e-outbox');

export const ADMIN_EMAIL = 'ada.e2e@uw.edu';
export const MEMBER_EMAILS = ['mia.e2e@uw.edu', 'leo.e2e@gmail.com'];
export const NEW_MEMBER_EMAIL = 'nora.e2e@uw.edu';

export const E2E_ENV: Record<string, string> = {
  APP_ENV: 'development',
  APP_BASE_URL: 'http://localhost:3000',
  API_BASE_URL: 'http://localhost:4000',
  API_PORT: '4000',
  DATABASE_URL: E2E_DATABASE_URL,
  MAIL_TRANSPORT: 'dev-outbox',
  DEV_OUTBOX_DIR: OUTBOX_DIR,
  MAIL_FROM: 'Specialty Masters Club <news@mail.smc.example>',
  LINK_SIGNING_SECRET: 'e2e-link-signing-secret-0123456789abcdef',
  // Outside production only these addresses ever receive mail.
  EMAIL_ALLOWLIST: [ADMIN_EMAIL, ...MEMBER_EMAILS, NEW_MEMBER_EMAIL].join(','),
  WORKER_POLL_MS: '500',
};
