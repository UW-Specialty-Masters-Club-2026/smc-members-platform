import type { Mailer, OutgoingEmail, SendResult } from './mailer';

export const MAILGUN_BATCH_LIMIT = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface MailgunConfig {
  apiKey: string;
  domain: string;
  /** https://api.mailgun.net (US) or https://api.eu.mailgun.net (EU) */
  baseUrl: string;
  /** o:testmode — Mailgun accepts and discards; nothing is delivered. */
  testMode: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * How a send attempt ended, and therefore what a retry may do:
 * - `sent`      accepted by Mailgun
 * - `transient` not accepted, safe to retry (429, 5xx, connection refused)
 * - `permanent` not accepted, retrying won't help (bad request, auth, domain)
 * - `unknown`   the request may have been accepted (timeout / dropped response):
 *               never retry blindly — reconcile against Mailgun events first
 */
export type SendOutcome =
  | { kind: 'sent'; messageId: string }
  | { kind: 'transient'; status: number | null; error: string }
  | { kind: 'permanent'; status: number; error: string }
  | { kind: 'unknown'; error: string };

/**
 * Network errors that happen before the request reaches Mailgun — nothing was sent.
 * (ECONNRESET is deliberately absent: it can also happen after Mailgun accepted the message.)
 */
const CONNECT_ERRORS = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

function classifyThrown(err: unknown): SendOutcome {
  const e = err as { name?: string; message?: string; cause?: { code?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return { kind: 'unknown', error: 'request timed out' };
  }
  const code = e?.cause?.code;
  if (code && CONNECT_ERRORS.has(code)) return { kind: 'transient', status: null, error: code };
  return { kind: 'unknown', error: code ?? e?.message ?? 'network error' };
}

async function classifyResponse(res: Response): Promise<SendOutcome> {
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (res.ok && body?.id) return { kind: 'sent', messageId: body.id };
  const error = (body?.message ?? res.statusText ?? 'error').slice(0, 500);
  if (res.ok) return { kind: 'unknown', error: 'accepted without a message id' };
  if (res.status === 429 || res.status >= 500)
    return { kind: 'transient', status: res.status, error };
  return { kind: 'permanent', status: res.status, error };
}

export interface BatchRecipient {
  email: string;
  /** Substituted into %recipient.<name>% placeholders. */
  variables: Record<string, string>;
}

export interface BatchMessage {
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  tag: string;
  recipients: BatchRecipient[];
  /** v:<name> custom variables; values may use %recipient.*% placeholders. */
  customVariables: Record<string, string>;
  /** Extra MIME headers (h:<name>); values may use %recipient.*% placeholders. */
  headers: Record<string, string>;
}

export class MailgunClient {
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly config: MailgunConfig) {
    this.fetch = config.fetch ?? globalThis.fetch;
    this.timeoutMs = config.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  private get auth(): string {
    return `Basic ${Buffer.from(`api:${this.config.apiKey}`).toString('base64')}`;
  }

  private url(path: string): string {
    return `${this.config.baseUrl}/v3/${encodeURIComponent(this.config.domain)}${path}`;
  }

  /**
   * One Mailgun batch request: every recipient gets an individual copy (recipient-variables),
   * so no one sees anyone else's address.
   */
  async sendBatch(msg: BatchMessage): Promise<SendOutcome> {
    if (msg.recipients.length === 0) throw new Error('batch has no recipients');
    if (msg.recipients.length > MAILGUN_BATCH_LIMIT) {
      throw new Error(`batch exceeds ${MAILGUN_BATCH_LIMIT} recipients`);
    }
    const form = new FormData();
    form.append('from', msg.from);
    for (const r of msg.recipients) form.append('to', r.email);
    form.append('subject', msg.subject);
    form.append('html', msg.html);
    form.append('text', msg.text);
    form.append('h:Reply-To', msg.replyTo);
    form.append('o:tag', msg.tag);
    // No open pixels or rewritten links: better privacy, and rewritten links would
    // push the HTML toward Gmail's 102 KB clipping limit.
    form.append('o:tracking', 'no');
    form.append('o:tracking-clicks', 'no');
    form.append('o:tracking-opens', 'no');
    if (this.config.testMode) form.append('o:testmode', 'yes');
    for (const [k, v] of Object.entries(msg.customVariables)) form.append(`v:${k}`, v);
    for (const [k, v] of Object.entries(msg.headers)) form.append(`h:${k}`, v);
    form.append(
      'recipient-variables',
      JSON.stringify(Object.fromEntries(msg.recipients.map((r) => [r.email, r.variables]))),
    );
    return this.post('/messages', form);
  }

  /** Single transactional message (sign-in links). */
  async sendOne(email: OutgoingEmail & { from: string; replyTo: string }): Promise<SendOutcome> {
    const form = new FormData();
    form.append('from', email.from);
    form.append('to', email.to);
    form.append('subject', email.subject);
    form.append('html', email.html);
    form.append('text', email.text);
    form.append('h:Reply-To', email.replyTo);
    form.append('o:tag', email.tag);
    form.append('o:tracking', 'no');
    if (this.config.testMode) form.append('o:testmode', 'yes');
    for (const [k, v] of Object.entries(email.variables ?? {})) form.append(`v:${k}`, v);
    return this.post('/messages', form);
  }

  private async post(path: string, form: FormData): Promise<SendOutcome> {
    try {
      const res = await this.fetch(this.url(path), {
        method: 'POST',
        headers: { Authorization: this.auth },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return await classifyResponse(res);
    } catch (err) {
      return classifyThrown(err);
    }
  }

  /**
   * delivery_ids Mailgun accepted for a digest since `begin` — used to settle batches whose
   * send outcome was unknown before anything is retried.
   */
  async acceptedDeliveryIds(digestId: string, begin: Date): Promise<Set<string>> {
    const ids = new Set<string>();
    const params = new URLSearchParams({
      event: 'accepted',
      begin: String(Math.floor(begin.getTime() / 1000)),
      ascending: 'yes',
      limit: '300',
      'user-variables': JSON.stringify({ digest_id: digestId }),
    });
    let next: string | null = this.url(`/events?${params}`);
    for (let page = 0; next && page < 50; page++) {
      const res: Response = await this.fetch(next, {
        headers: { Authorization: this.auth },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`Mailgun events request failed: ${res.status}`);
      const body = (await res.json()) as {
        items: { 'user-variables'?: { delivery_id?: string } }[];
        paging?: { next?: string };
      };
      if (body.items.length === 0) break;
      for (const item of body.items) {
        const id = item['user-variables']?.delivery_id;
        if (id) ids.add(id);
      }
      next = body.paging?.next ?? null;
    }
    return ids;
  }
}

// ─── Environment guard ─────────────────────────────────────────────

export interface RecipientGuard {
  /** null = everyone may receive (production). */
  allowlist: Set<string> | null;
}

/**
 * Outside production only allowlisted addresses may receive email. This protects real
 * members from staging/dev sends no matter what the database contains.
 */
export function recipientGuard(appEnv: string, allowlist: string[]): RecipientGuard {
  return {
    allowlist: appEnv === 'production' ? null : new Set(allowlist.map((a) => a.toLowerCase())),
  };
}

export function isAllowed(guard: RecipientGuard, email: string): boolean {
  return guard.allowlist === null || guard.allowlist.has(email.trim().toLowerCase());
}

/** Mailer for transactional mail (sign-in links) over Mailgun, behind the same guard. */
export class MailgunMailer implements Mailer {
  constructor(
    private readonly client: MailgunClient,
    private readonly guard: RecipientGuard,
    private readonly from: string,
    private readonly replyTo: string,
  ) {}

  async send(email: OutgoingEmail): Promise<SendResult> {
    if (!isAllowed(this.guard, email.to)) {
      throw new Error('recipient is not on EMAIL_ALLOWLIST for this environment');
    }
    const outcome = await this.client.sendOne({ ...email, from: this.from, replyTo: this.replyTo });
    if (outcome.kind !== 'sent') throw new Error(`Mailgun ${outcome.kind}: ${outcome.error}`);
    return { messageId: outcome.messageId };
  }
}
