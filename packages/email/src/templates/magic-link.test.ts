import { describe, expect, it } from 'vitest';
import { renderMagicLinkEmail } from './magic-link';

describe('renderMagicLinkEmail', () => {
  const input = {
    firstName: '<Jane>',
    url: 'https://smc.example/auth/callback#token=abc&x=1',
    purpose: 'LOGIN' as const,
    expiresInMinutes: 15,
  };

  it('escapes user-provided values in HTML', () => {
    const { html } = renderMagicLinkEmail(input);
    expect(html).toContain('Hi &lt;Jane&gt;,');
    expect(html).not.toContain('<Jane>');
    expect(html).toContain('href="https://smc.example/auth/callback#token=abc&amp;x=1"');
  });

  it('has a plain-text twin with the raw link and expiry', () => {
    const { text, subject } = renderMagicLinkEmail(input);
    expect(subject).toMatch(/sign-in link/);
    expect(text).toContain('SIGN IN: https://smc.example/auth/callback#token=abc&x=1');
    expect(text).toContain('expires in 15 minutes');
  });

  it('uses confirm wording for sign-up', () => {
    const { subject, text } = renderMagicLinkEmail({ ...input, purpose: 'SIGNUP' });
    expect(subject).toMatch(/Confirm your email/);
    expect(text).toContain('CONFIRM EMAIL:');
  });

  it('uses no flexbox, grid or CSS variables', () => {
    const { html } = renderMagicLinkEmail(input);
    expect(html).not.toMatch(/display:\s*(flex|grid)|var\(--/);
  });
});
