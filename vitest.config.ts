import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.test.ts'],
    environment: 'node',
    // Pin the test process to UTC so Pacific Time logic never leans on the host clock's zone.
    env: { TZ: 'UTC' },
  },
});
