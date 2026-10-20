import { DevOutboxBatchTransport } from './dev-transport';
import { DevOutboxMailer, type Mailer } from './mailer';
import { MailgunClient, MailgunMailer, recipientGuard } from './mailgun';

export interface MailerEnv {
  APP_ENV: string;
  MAIL_TRANSPORT: string;
  DEV_OUTBOX_DIR: string;
  MAIL_FROM: string;
  MAIL_REPLY_TO: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  MAILGUN_BASE_URL: string;
  MAILGUN_TEST_MODE: boolean;
  EMAIL_ALLOWLIST: string[];
}

export function createMailgunClient(env: MailerEnv): MailgunClient {
  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN) throw new Error('Mailgun is not configured');
  return new MailgunClient({
    apiKey: env.MAILGUN_API_KEY,
    domain: env.MAILGUN_DOMAIN,
    baseUrl: env.MAILGUN_BASE_URL,
    testMode: env.MAILGUN_TEST_MODE,
  });
}

export function createMailer(env: MailerEnv): Mailer {
  switch (env.MAIL_TRANSPORT) {
    case 'dev-outbox':
      return new DevOutboxMailer(env.DEV_OUTBOX_DIR);
    case 'mailgun':
      return new MailgunMailer(
        createMailgunClient(env),
        recipientGuard(env.APP_ENV, env.EMAIL_ALLOWLIST),
        env.MAIL_FROM,
        env.MAIL_REPLY_TO,
      );
    default:
      throw new Error(`unknown MAIL_TRANSPORT "${env.MAIL_TRANSPORT}"`);
  }
}

/** Digest batch transport for the configured environment (Mailgun, or the local outbox in dev). */
export function createBatchTransport(env: MailerEnv): MailgunClient | DevOutboxBatchTransport {
  return env.MAIL_TRANSPORT === 'mailgun'
    ? createMailgunClient(env)
    : new DevOutboxBatchTransport(env.DEV_OUTBOX_DIR);
}
