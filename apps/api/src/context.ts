import type { AppEnv } from '@smc/config';
import type { PrismaClient } from '@smc/db';
import type { Mailer } from '@smc/email';
import type { Logger } from 'pino';

export interface AppConfig {
  appEnv: AppEnv;
  /** Public web origin; magic links point here and mutating requests must come from it. */
  appBaseUrl: string;
  /** Max auth emails requested per IP per 15 minutes. */
  authRateLimitPerIp: number;
  /** HMAC key for login-free links (check-in codes, unsubscribe). */
  linkSigningSecret: string;
  /** Public API origin (one-click unsubscribe links). */
  apiBaseUrl: string;
  mailFrom: string;
  mailReplyTo: string;
  /** Outside production only these addresses may receive email. */
  emailAllowlist: string[];
  digestLookaheadDays: number;
  digestLogoUrl: string | null;
  /** null until Mailgun webhooks are configured; the webhook endpoint then answers 503. */
  mailgunWebhookSigningKey: string | null;
  /** Where uploaded images are stored (served at /uploads). */
  uploadDir: string;
}

/** Everything a request handler needs, injected so tests can swap the clock and mailer. */
export interface AppContext {
  prisma: PrismaClient;
  logger: Logger;
  mailer: Mailer;
  now: () => Date;
  config: AppConfig;
}

export function secureCookies(config: AppConfig): boolean {
  return config.appEnv === 'production' || config.appEnv === 'staging';
}
