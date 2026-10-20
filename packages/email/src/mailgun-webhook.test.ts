import { describe, expect, it } from 'vitest';
import { signMailgunWebhook, verifyMailgunSignature } from './mailgun-webhook';

const KEY = 'whsec-0123456789abcdef';
const now = new Date('2026-10-26T16:10:00Z');
const ts = String(now.getTime() / 1000);
const token = 'a'.repeat(50);

describe('verifyMailgunSignature', () => {
  it('accepts a correctly signed, fresh webhook', () => {
    const signature = signMailgunWebhook(KEY, ts, token);
    expect(verifyMailgunSignature(KEY, { timestamp: ts, token, signature }, now)).toEqual({
      ok: true,
    });
  });

  it('rejects a forged or tampered signature', () => {
    const signature = signMailgunWebhook('another-signing-key', ts, token);
    expect(verifyMailgunSignature(KEY, { timestamp: ts, token, signature }, now)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    const good = signMailgunWebhook(KEY, ts, token);
    expect(
      verifyMailgunSignature(KEY, { timestamp: ts, token: 'b'.repeat(50), signature: good }, now),
    ).toMatchObject({ reason: 'bad_signature' });
  });

  it('rejects old and far-future timestamps', () => {
    for (const offset of [-6 * 60, 6 * 60]) {
      const t = String(now.getTime() / 1000 + offset);
      const signature = signMailgunWebhook(KEY, t, token);
      expect(verifyMailgunSignature(KEY, { timestamp: t, token, signature }, now)).toEqual({
        ok: false,
        reason: 'stale',
      });
    }
  });

  it('rejects malformed input', () => {
    expect(verifyMailgunSignature(KEY, undefined, now)).toMatchObject({ reason: 'malformed' });
    expect(
      verifyMailgunSignature(KEY, { timestamp: 'x', token, signature: 'y' }, now),
    ).toMatchObject({
      reason: 'malformed',
    });
  });
});
