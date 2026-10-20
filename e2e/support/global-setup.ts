import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { E2E_DATABASE_URL, E2E_ENV } from './env';

const root = resolve(import.meta.dirname, '../..');

/**
 * Migrate the E2E database and start the background worker; returns the teardown that
 * stops it. (Data is reset per test, see db.ts.)
 */
export default async function globalSetup() {
  if (!new URL(E2E_DATABASE_URL).pathname.endsWith('_e2e')) {
    throw new Error('E2E_DATABASE_URL must point at a database whose name ends in _e2e');
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: resolve(root, 'packages/db'),
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'pipe',
  });

  const worker = spawn('node', ['apps/worker/dist/index.js'], {
    cwd: root,
    env: { ...process.env, ...E2E_ENV },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise<void>((ready, fail) => {
    const timer = setTimeout(() => fail(new Error(`worker did not start:\n${output}`)), 30_000);
    worker.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('worker started')) {
        clearTimeout(timer);
        ready();
      }
    });
    worker.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    worker.on('exit', (code) => fail(new Error(`worker exited (${code}):\n${output}`)));
  });

  return async () => {
    worker.kill('SIGTERM');
    await new Promise((r) => worker.once('exit', r));
  };
}
