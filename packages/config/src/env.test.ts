import { describe, expect, it } from 'vitest';
import { apiEnvSchema, EnvError, isUwAddress, parseEnv } from './env';

const valid = {
  APP_ENV: 'development',
  APP_BASE_URL: 'http://localhost:3000',
  API_BASE_URL: 'http://localhost:4000',
  DATABASE_URL: 'mysql://smc:secret@localhost:3306/smc',
  MAIL_FROM: 'Specialty Masters Club <news@mail.smc.example>',
  LINK_SIGNING_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('parses a valid environment and applies defaults', () => {
    const env = parseEnv(apiEnvSchema, valid);
    expect(env.API_PORT).toBe(4000);
    expect(env.APP_ENV).toBe('development');
  });

  it('rejects a non-mysql DATABASE_URL', () => {
    expect(() =>
      parseEnv(apiEnvSchema, { ...valid, DATABASE_URL: 'postgres://x@localhost/db' }),
    ).toThrow(EnvError);
  });

  it('requires https APP_BASE_URL in production', () => {
    expect(() => parseEnv(apiEnvSchema, { ...valid, APP_ENV: 'production' })).toThrow(/https/);
  });

  it('rejects a uw.edu sender', () => {
    expect(() =>
      parseEnv(apiEnvSchema, { ...valid, MAIL_FROM: 'SMC <smcommittee@uw.edu>' }),
    ).toThrow(/MAIL_FROM/);
    expect(() => parseEnv(apiEnvSchema, { ...valid, MAIL_FROM: 'news@foster.uw.edu' })).toThrow(
      /MAIL_FROM/,
    );
  });

  it('defaults Reply-To to the committee inbox', () => {
    expect(parseEnv(apiEnvSchema, valid).MAIL_REPLY_TO).toBe('smcommittee@uw.edu');
  });

  it('forbids the dev outbox outside development', () => {
    expect(() =>
      parseEnv(apiEnvSchema, {
        ...valid,
        APP_ENV: 'staging',
        APP_BASE_URL: 'https://staging.smc.example',
      }),
    ).toThrow(/dev-outbox/);
  });

  it('requires a strong link signing secret', () => {
    expect(() => parseEnv(apiEnvSchema, { ...valid, LINK_SIGNING_SECRET: 'short' })).toThrow(
      /LINK_SIGNING_SECRET/,
    );
  });

  it('never includes secret values in the error message', () => {
    try {
      parseEnv(apiEnvSchema, { ...valid, DATABASE_URL: 'postgres://user:topsecret@db/x' });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('DATABASE_URL');
      expect((err as Error).message).not.toContain('topsecret');
    }
  });
});

describe('Mailgun settings', () => {
  const mailgun = {
    ...valid,
    MAIL_TRANSPORT: 'mailgun',
    MAILGUN_API_KEY: 'key-0123456789abcdef',
    MAILGUN_DOMAIN: 'mail.smc.example',
  };

  it('accepts a complete Mailgun configuration with US default region', () => {
    const env = parseEnv(apiEnvSchema, mailgun);
    expect(env.MAILGUN_BASE_URL).toBe('https://api.mailgun.net');
    expect(env.MAILGUN_TEST_MODE).toBe(false);
  });

  it('requires the key and domain', () => {
    expect(() => parseEnv(apiEnvSchema, { ...mailgun, MAILGUN_API_KEY: undefined })).toThrow(
      /MAILGUN_API_KEY/,
    );
    expect(() => parseEnv(apiEnvSchema, { ...mailgun, MAILGUN_DOMAIN: undefined })).toThrow(
      /MAILGUN_DOMAIN/,
    );
  });

  it('allows only the US or EU endpoints', () => {
    expect(
      parseEnv(apiEnvSchema, { ...mailgun, MAILGUN_BASE_URL: 'https://api.eu.mailgun.net' })
        .MAILGUN_BASE_URL,
    ).toBe('https://api.eu.mailgun.net');
    expect(() =>
      parseEnv(apiEnvSchema, { ...mailgun, MAILGUN_BASE_URL: 'https://evil.example' }),
    ).toThrow(/MAILGUN_BASE_URL/);
  });

  it('refuses a uw.edu sending domain and a From outside the sending domain', () => {
    expect(() => parseEnv(apiEnvSchema, { ...mailgun, MAILGUN_DOMAIN: 'mail.uw.edu' })).toThrow(
      /MAILGUN_DOMAIN/,
    );
    expect(() =>
      parseEnv(apiEnvSchema, { ...mailgun, MAIL_FROM: 'SMC <news@other.example>' }),
    ).toThrow(/DMARC/);
  });

  it('parses the allowlist and rejects malformed entries', () => {
    expect(
      parseEnv(apiEnvSchema, { ...valid, EMAIL_ALLOWLIST: ' Tester@UW.edu, b@uw.edu ,' })
        .EMAIL_ALLOWLIST,
    ).toEqual(['tester@uw.edu', 'b@uw.edu']);
    expect(() => parseEnv(apiEnvSchema, { ...valid, EMAIL_ALLOWLIST: '@uw.edu' })).toThrow(
      /EMAIL_ALLOWLIST/,
    );
  });

  it('never echoes the API key in errors', () => {
    try {
      parseEnv(apiEnvSchema, { ...mailgun, MAILGUN_DOMAIN: 'not a domain' });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('key-0123456789abcdef');
    }
  });
});

describe('isUwAddress', () => {
  it('matches uw.edu and its subdomains only', () => {
    expect(isUwAddress('a@uw.edu')).toBe(true);
    expect(isUwAddress('SMC <A@Mail.UW.EDU>')).toBe(true);
    expect(isUwAddress('news@mail.smc.example')).toBe(false);
    expect(isUwAddress('x@notuw.edu')).toBe(false);
  });
});
