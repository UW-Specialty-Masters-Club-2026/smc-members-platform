import { DevOutboxMailer, type Mailer } from '@smc/email';

export function createMailer(env: { MAIL_TRANSPORT: string; DEV_OUTBOX_DIR: string }): Mailer {
  switch (env.MAIL_TRANSPORT) {
    case 'dev-outbox':
      return new DevOutboxMailer(env.DEV_OUTBOX_DIR);
    default:
      // Mailgun transport is implemented in step 4; refuse to start rather than drop email.
      throw new Error(`MAIL_TRANSPORT "${env.MAIL_TRANSPORT}" is not available yet`);
  }
}
