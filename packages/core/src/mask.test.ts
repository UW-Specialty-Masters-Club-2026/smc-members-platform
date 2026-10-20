import { describe, expect, it } from 'vitest';
import { maskEmail, maskEmailsInText, redactForLog } from './mask';

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('jane.doe@uw.edu')).toBe('j***@uw.edu');
  });

  it('handles malformed input without leaking it', () => {
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('@uw.edu')).toBe('***');
  });
});

describe('maskEmailsInText', () => {
  it('masks every address in a message', () => {
    expect(maskEmailsInText('to a.b@uw.edu, cc x@mail.example.org')).toBe(
      'to a***@uw.edu, cc x***@mail.example.org',
    );
  });
});

describe('redactForLog', () => {
  it('masks nested strings and leaves other values intact', () => {
    const at = new Date('2026-10-26T16:00:00Z');
    expect(
      redactForLog({ to: ['jane@uw.edu'], meta: { note: 'bounce for bob@uw.edu', n: 3, at } }),
    ).toEqual({ to: ['j***@uw.edu'], meta: { note: 'bounce for b***@uw.edu', n: 3, at } });
  });
});
