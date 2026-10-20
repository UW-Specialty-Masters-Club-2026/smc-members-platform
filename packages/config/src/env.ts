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

  /** `dev-outbox` writes emails to a local folder; `mailgun` arrives in step 4. */
  MAIL_TRANSPORT: z.enum(['dev-outbox', 'mailgun']).default('dev-outbox'),
  DEV_OUTBOX_DIR: z.string().default('.dev-outbox'),
  /** Sender on the club's own (sub)domain, e.g. `Specialty Masters Club <news@mail.example.org>`. */
  MAIL_FROM: z.string().refine((v) => !isUwAddress(v), {
    message: 'must not be a uw.edu address (we cannot set SPF/DKIM for UW domains)',
  }),
  MAIL_REPLY_TO: z.email().default('smcommittee@uw.edu'),
  /** HMAC key for login-free links (check-in QR codes, unsubscribe). 32+ random characters. */
  LINK_SIGNING_SECRET: z.string().min(32, 'must be at least 32 characters'),
});

export const apiEnvSchema = baseEnvSchema.extend({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

export const workerEnvSchema = baseEnvSchema;

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
  if (problems.length) throw new EnvError(problems);
  return env;
}
