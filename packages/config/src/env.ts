import { z } from 'zod';

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
  const env = result.data as z.infer<S> & { APP_ENV?: AppEnv; APP_BASE_URL?: string };
  if (
    env.APP_ENV === 'production' &&
    env.APP_BASE_URL &&
    !env.APP_BASE_URL.startsWith('https://')
  ) {
    throw new EnvError(['APP_BASE_URL: must use https in production']);
  }
  return env;
}
