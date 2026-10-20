import { createHash, randomBytes } from 'node:crypto';

/** 256-bit URL-safe random token. The raw value is only ever sent to the member. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex digest — what we store and look tokens up by. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
