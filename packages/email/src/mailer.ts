import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Provider tag, e.g. "auth" or "weekly-digest". */
  tag: string;
  /** Custom variables echoed back by provider webhooks. */
  variables?: Record<string, string>;
}

export interface SendResult {
  messageId: string;
}

/** Transport-agnostic sender. The Mailgun implementation is added in step 4. */
export interface Mailer {
  send(email: OutgoingEmail): Promise<SendResult>;
}

/** Development only: writes each email as JSON to a local, git-ignored folder. */
export class DevOutboxMailer implements Mailer {
  constructor(private readonly dir: string) {}

  async send(email: OutgoingEmail): Promise<SendResult> {
    const messageId = `dev-${randomUUID()}`;
    await mkdir(this.dir, { recursive: true });
    const file = join(
      this.dir,
      `${new Date().toISOString().replace(/[:.]/g, '-')}-${messageId}.json`,
    );
    await writeFile(file, JSON.stringify({ messageId, ...email }, null, 2), 'utf8');
    return { messageId };
  }
}

/** Tests: keeps sent emails in memory. */
export class MemoryMailer implements Mailer {
  readonly sent: Array<OutgoingEmail & SendResult> = [];

  async send(email: OutgoingEmail): Promise<SendResult> {
    const messageId = `mem-${this.sent.length + 1}`;
    this.sent.push({ ...email, messageId });
    return { messageId };
  }
}
