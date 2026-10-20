import { z } from 'zod';

/** True when the address (bare or `Name <addr>`) is on uw.edu or any of its subdomains. */
export function isUwAddress(value: string): boolean {
  const addr = /<([^>]+)>/.exec(value)?.[1] ?? value;
  const domain = addr.trim().toLowerCase().split('@')[1] ?? '';
  return domain === 'uw.edu' || domain.endsWith('.uw.edu');
}

export const appEnvSchema = z.enum(['development', 'test', 'staging', 'production']);
export type AppEnv = z.infer<typeof appEnvSchema>;

export const baseEnvSchema = z.object({
  APP_ENV: appEnvSchema.default('development'),
  /** Public URL of the Next.js web app (used in emails and redirects). */
  APP_BASE_URL: z.url(),
  /** Public URL of the Express API (webhooks, one-click unsubscribe). */
  API_BASE_URL: z.url(),
  DATABASE_URL: z
    .string()
    .regex(/^mysql:\/\//, 'DATABASE_URL must be a mysql:// connection string'),

  /** `dev-outbox` writes emails to a local folder; `mailgun` sends through the Mailgun HTTP API. */
  MAIL_TRANSPORT: z.enum(['dev-outbox', 'mailgun']).default('dev-outbox'),
  DEV_OUTBOX_DIR: z.string().default('.dev-outbox'),
  /** Sender on the club's own (sub)domain, e.g. `Specialty Masters Club <news@mail.example.org>`. */
  MAIL_FROM: z.string().refine((v) => !isUwAddress(v), {
    message: 'must not be a uw.edu address (we cannot set SPF/DKIM for UW domains)',
  }),
  MAIL_REPLY_TO: z.email().default('smcommittee@uw.edu'),
  /** HMAC key for login-free links (check-in QR codes, unsubscribe). 32+ random characters. */
  LINK_SIGNING_SECRET: z.string().min(32, 'must be at least 32 characters'),

  /** Mailgun HTTP API (required when MAIL_TRANSPORT=mailgun). Server-side secret only. */
  MAILGUN_API_KEY: z.string().min(10).optional(),
  /** Sending domain, e.g. `mail.example.org` (never a uw.edu domain). */
  MAILGUN_DOMAIN: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'must be a domain name')
    .refine((d) => !/(^|\.)uw\.edu$/i.test(d), { message: 'must not be a uw.edu domain' })
    .optional(),
  /** Region endpoint: US or EU. */
  MAILGUN_BASE_URL: z
    .enum(['https://api.mailgun.net', 'https://api.eu.mailgun.net'])
    .default('https://api.mailgun.net'),
  /** Mailgun accepts and drops the message (no delivery). For staging dry runs. */
  MAILGUN_TEST_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Outside production, email goes ONLY to these exact addresses (comma-separated);
   * everyone else is skipped. Ignored in production.
   */
  EMAIL_ALLOWLIST: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.email())),
});

export const apiEnvSchema = baseEnvSchema.extend({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

export const workerEnvSchema = baseEnvSchema.extend({
  /** How far ahead the digest looks for events. */
  DIGEST_EVENT_LOOKAHEAD_DAYS: z.coerce.number().int().min(1).max(90).default(21),
  /** Hosted logo (PNG) for emails; a text wordmark is used until it is set. */
  DIGEST_LOGO_URL: z.url({ protocol: /^https$/ }).optional(),
  /** Job queue polling interval. */
  WORKER_POLL_MS: z.coerce.number().int().min(500).max(60_000).default(5000),
});

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

/**
 * Parse and validate environment variables. Error messages name the variable
 * and the problem, never the value, so secrets do not leak into logs.
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const env = result.data as z.infer<S> & {
    APP_ENV?: AppEnv;
    APP_BASE_URL?: string;
    MAIL_TRANSPORT?: string;
    MAILGUN_API_KEY?: string;
    MAILGUN_DOMAIN?: string;
    MAIL_FROM?: string;
  };
  const problems: string[] = [];
  if (env.APP_ENV === 'production' || env.APP_ENV === 'staging') {
    if (env.APP_BASE_URL && !env.APP_BASE_URL.startsWith('https://')) {
      problems.push(`APP_BASE_URL: must use https in ${env.APP_ENV}`);
    }
    if (env.MAIL_TRANSPORT === 'dev-outbox') {
      problems.push(`MAIL_TRANSPORT: dev-outbox is not allowed in ${env.APP_ENV}`);
    }
  }
  if (env.MAIL_TRANSPORT === 'mailgun') {
    if (!env.MAILGUN_API_KEY)
      problems.push('MAILGUN_API_KEY: required when MAIL_TRANSPORT=mailgun');
    if (!env.MAILGUN_DOMAIN) problems.push('MAILGUN_DOMAIN: required when MAIL_TRANSPORT=mailgun');
    const fromDomain = (/<([^>]+)>/.exec(env.MAIL_FROM ?? '')?.[1] ?? env.MAIL_FROM ?? '')
      .split('@')[1]
      ?.toLowerCase();
    if (
      env.MAILGUN_DOMAIN &&
      fromDomain &&
      fromDomain !== env.MAILGUN_DOMAIN.toLowerCase() &&
      !fromDomain.endsWith(`.${env.MAILGUN_DOMAIN.toLowerCase()}`) &&
      !env.MAILGUN_DOMAIN.toLowerCase().endsWith(`.${fromDomain}`)
    ) {
      problems.push('MAIL_FROM: must use the Mailgun sending domain (or its parent) to pass DMARC');
    }
  }
  if (problems.length) throw new EnvError(problems);
  return env;
}
