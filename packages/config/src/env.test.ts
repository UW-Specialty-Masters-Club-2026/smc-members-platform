import { describe, expect, it } from 'vitest';
import { apiEnvSchema, EnvError, isUwAddress, parseEnv } from './env';

const valid = {
  APP_ENV: 'development',
  APP_BASE_URL: 'http://localhost:3000',
  API_BASE_URL: 'http://localhost:4000',
  DATABASE_URL: 'mysql://smc:secret@localhost:3306/smc',
  MAIL_FROM: 'Specialty Masters Club <news@mail.smc.example>',
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

describe('isUwAddress', () => {
  it('matches uw.edu and its subdomains only', () => {
    expect(isUwAddress('a@uw.edu')).toBe(true);
    expect(isUwAddress('SMC <A@Mail.UW.EDU>')).toBe(true);
    expect(isUwAddress('news@mail.smc.example')).toBe(false);
    expect(isUwAddress('x@notuw.edu')).toBe(false);
  });
});
