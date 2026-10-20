import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, normalizeEmail } from './tokens';

describe('tokens', () => {
  it('generates distinct URL-safe tokens', () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it('hashes deterministically to 64 hex chars', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalizes emails', () => {
    expect(normalizeEmail('  Jane.Doe@UW.edu ')).toBe('jane.doe@uw.edu');
  });
});
