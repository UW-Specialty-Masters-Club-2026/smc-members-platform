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
    });
  });

  it('rejects non-mysql URLs', () => {
    expect(() => poolConfigFromUrl('postgres://x@localhost/db')).toThrow(/mysql/);
  });
});
