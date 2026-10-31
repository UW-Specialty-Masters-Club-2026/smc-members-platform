import { describe, expect, it } from 'vitest';
import { poolConfigFromUrl } from './index';

describe('poolConfigFromUrl', () => {
  it('parses credentials and pins the session timezone to UTC', () => {
    expect(
      poolConfigFromUrl('mysql://smc:p%40ss@db.local:3307/smc_dev?connection_limit=5'),
    ).toEqual({
      host: 'db.local',
      port: 3307,
      user: 'smc',
      password: 'p@ss',
      database: 'smc_dev',
      timezone: 'Z',
      connectionLimit: 5,
      allowPublicKeyRetrieval: false,
    });
  });

  it('rejects non-mysql URLs', () => {
    expect(() => poolConfigFromUrl('postgres://x@localhost/db')).toThrow(/mysql/);
  });

  it('allows RSA key retrieval only for local databases unless opted in', () => {
    expect(poolConfigFromUrl('mysql://u:p@127.0.0.1:3306/smc').allowPublicKeyRetrieval).toBe(true);
    expect(poolConfigFromUrl('mysql://u:p@db.example.com:3306/smc').allowPublicKeyRetrieval).toBe(
      false,
    );
    expect(
      poolConfigFromUrl('mysql://u:p@db.example.com/smc?allowPublicKeyRetrieval=true')
        .allowPublicKeyRetrieval,
    ).toBe(true);
  });
});
