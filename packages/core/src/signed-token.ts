import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless signed tokens: `base64url(payload).base64url(HMAC-SHA256)`.
 * Used where a link must work without a login (check-in QR codes, unsubscribe links).
 * The purpose is signed in, so a token minted for one feature can't be replayed in another.
 */
export interface SignedPayload {
  /** purpose, e.g. "checkin" or "unsubscribe" */
  p: string;
  /** subject id */
  s: string;
  /** expiry, unix seconds (optional) */
  e?: number;
}

export type VerifyFailure = 'malformed' | 'bad_signature' | 'wrong_purpose' | 'expired';

function mac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function signToken(
  secret: string,
  purpose: string,
  subject: string,
  expiresAt?: Date,
): string {
  if (secret.length < 32) throw new Error('signing secret must be at least 32 characters');
  const payload: SignedPayload = { p: purpose, s: subject };
  if (expiresAt) payload.e = Math.floor(expiresAt.getTime() / 1000);
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(secret, body).toString('base64url')}`;
}

export function verifyToken(
  secret: string,
  purpose: string,
  token: string,
  now: Date,
): { ok: true; subject: string } | { ok: false; reason: VerifyFailure } {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts as [string, string];

  const expected = mac(secret, body);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: SignedPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof payload.s !== 'string' || payload.p !== purpose) {
    return { ok: false, reason: 'wrong_purpose' };
  }
  if (payload.e !== undefined && payload.e * 1000 <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, subject: payload.s };
}
