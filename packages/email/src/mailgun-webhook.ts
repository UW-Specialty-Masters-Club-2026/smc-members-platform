import { createHmac, timingSafeEqual } from 'node:crypto';

/** Webhooks older (or further in the future) than this are rejected as possible replays. */
export const WEBHOOK_MAX_SKEW_MS = 5 * 60_000;

export interface MailgunSignature {
  timestamp: string;
  token: string;
  signature: string;
}

export type SignatureCheck =
  { ok: true } | { ok: false; reason: 'malformed' | 'bad_signature' | 'stale' };

/**
 * Mailgun signs `timestamp + token` with HMAC-SHA256 using the webhook signing key.
 * Token replay is checked separately against stored tokens (see mailgun_webhook_events).
 */
export function verifyMailgunSignature(
  signingKey: string,
  sig: Partial<MailgunSignature> | undefined,
  now: Date,
): SignatureCheck {
  if (
    !sig ||
    typeof sig.timestamp !== 'string' ||
    typeof sig.token !== 'string' ||
    typeof sig.signature !== 'string' ||
    !/^\d{9,11}$/.test(sig.timestamp) ||
    !/^[0-9a-f]{64}$/i.test(sig.signature) ||
    sig.token.length < 10 ||
    sig.token.length > 100
  ) {
    return { ok: false, reason: 'malformed' };
  }
  const expected = createHmac('sha256', signingKey)
    .update(sig.timestamp + sig.token)
    .digest();
  const given = Buffer.from(sig.signature, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (Math.abs(now.getTime() - Number(sig.timestamp) * 1000) > WEBHOOK_MAX_SKEW_MS) {
    return { ok: false, reason: 'stale' };
  }
  return { ok: true };
}

/** For tests and local tooling: sign like Mailgun does. */
export function signMailgunWebhook(signingKey: string, timestamp: string, token: string): string {
  return createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');
}
