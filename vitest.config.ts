import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Local runs pick up TEST_DATABASE_URL from .env; CI sets it directly.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./vitest.global-setup.ts'],
    // Integration tests share one MySQL test database, so files run one at a time.
    fileParallelism: false,
    // Pin the test process to UTC so Pacific Time logic never leans on the host clock's zone.
    env: { TZ: 'UTC' },
  },
});
