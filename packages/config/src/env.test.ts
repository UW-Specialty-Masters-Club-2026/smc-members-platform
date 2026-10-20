import { describe, expect, it } from 'vitest';
import { apiEnvSchema, EnvError, parseEnv } from './env';

const valid = {
  APP_ENV: 'development',
  APP_BASE_URL: 'http://localhost:3000',
  API_BASE_URL: 'http://localhost:4000',
  DATABASE_URL: 'mysql://smc:secret@localhost:3306/smc',
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
