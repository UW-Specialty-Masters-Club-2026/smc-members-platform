import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './signed-token';

const SECRET = 'a'.repeat(32);
const now = new Date('2026-10-28T18:00:00Z');

describe('signed tokens', () => {
  it('round-trips subject and purpose', () => {
    const t = signToken(SECRET, 'checkin', 'reg_123');
    expect(verifyToken(SECRET, 'checkin', t, now)).toEqual({ ok: true, subject: 'reg_123' });
  });

  it('rejects a different secret or a tampered payload', () => {
    const t = signToken(SECRET, 'checkin', 'reg_123');
    expect(verifyToken('b'.repeat(32), 'checkin', t, now)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    const forged = Buffer.from(JSON.stringify({ p: 'checkin', s: 'reg_999' })).toString(
      'base64url',
    );
    expect(verifyToken(SECRET, 'checkin', `${forged}.${t.split('.')[1]}`, now)).toMatchObject({
      reason: 'bad_signature',
    });
  });

  it('will not accept a token minted for another purpose', () => {
    const t = signToken(SECRET, 'unsubscribe', 'mem_1');
    expect(verifyToken(SECRET, 'checkin', t, now)).toEqual({ ok: false, reason: 'wrong_purpose' });
  });

  it('enforces expiry', () => {
    const t = signToken(SECRET, 'unsubscribe', 'mem_1', new Date('2026-10-28T18:00:00Z'));
    expect(verifyToken(SECRET, 'unsubscribe', t, now)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyToken(SECRET, 'unsubscribe', t, new Date('2026-10-28T17:59:59Z')).ok).toBe(true);
  });

  it('rejects malformed input', () => {
    for (const bad of ['', 'abc', 'a.b.c', '.x', 'x.']) {
      expect(verifyToken(SECRET, 'checkin', bad, now).ok).toBe(false);
    }
  });

  it('refuses weak secrets', () => {
    expect(() => signToken('short', 'checkin', 'x')).toThrow(/32 characters/);
  });
});
