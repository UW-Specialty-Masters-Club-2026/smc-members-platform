import { execFileSync } from 'node:child_process';

/** Bring the test database schema up to date before any integration test runs. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    process.stderr.write('[vitest] TEST_DATABASE_URL not set; database tests will be skipped\n');
    return;
  }
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must point at a database whose name ends in _test');
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: 'packages/db',
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
