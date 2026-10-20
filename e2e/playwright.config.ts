import { defineConfig, devices } from '@playwright/test';
import { E2E_ENV } from './support/env';

/**
 * Runs the built apps (npm run build first) against the smc_e2e database:
 * API :4000 and web :3000 (proxies /api) here; the background worker is started by
 * global-setup (it has no HTTP port for Playwright to wait on).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  globalSetup: './support/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node apps/api/dist/server.js',
      cwd: '..',
      url: 'http://localhost:4000/health',
      env: E2E_ENV,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx next start --port 3000',
      cwd: '../apps/web',
      url: 'http://localhost:3000',
      env: E2E_ENV,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
