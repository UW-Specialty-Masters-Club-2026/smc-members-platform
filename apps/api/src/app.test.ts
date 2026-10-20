import { Writable } from 'node:stream';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createLogger } from '@smc/core';

function captureLogger() {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { logger: createLogger({ level: 'debug' }, sink), lines };
}

describe('api app', () => {
  it('responds to /health', async () => {
    const { logger } = captureLogger();
    const res = await request(createApp({ logger })).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns JSON 404 for unknown routes', async () => {
    const { logger } = captureLogger();
    const res = await request(createApp({ logger })).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});

describe('logger', () => {
  it('masks email addresses in messages and objects', () => {
    const { logger, lines } = captureLogger();
    logger.info({ to: 'jane.doe@uw.edu' }, 'sent to bob@uw.edu');
    const out = lines.join('');
    expect(out).toContain('j***@uw.edu');
    expect(out).toContain('b***@uw.edu');
    expect(out).not.toContain('jane.doe@uw.edu');
    expect(out).not.toContain('bob@uw.edu');
  });
});
