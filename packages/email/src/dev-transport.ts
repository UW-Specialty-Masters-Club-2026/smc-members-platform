import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BatchMessage, SendOutcome } from './mailgun';

/** Development stand-in for Mailgun batches: writes each batch to the local outbox. */
export class DevOutboxBatchTransport {
  constructor(private readonly dir: string) {}

  async sendBatch(msg: BatchMessage): Promise<SendOutcome> {
    const messageId = `<dev-${randomUUID()}@outbox>`;
    await mkdir(this.dir, { recursive: true });
    const file = join(this.dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-batch.json`);
    await writeFile(file, JSON.stringify({ messageId, ...msg }, null, 2), 'utf8');
    return { kind: 'sent', messageId };
  }

  async acceptedDeliveryIds(): Promise<Set<string>> {
    return new Set();
  }
}
