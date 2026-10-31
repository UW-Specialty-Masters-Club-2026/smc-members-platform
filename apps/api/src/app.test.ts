import { Writable } from 'node:stream';
import { createLogger } from '@smc/core';
import type { PrismaClient } from '@smc/db';
import { MemoryMailer } from '@smc/email';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

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

/** App wired with no database: only routes that never reach Prisma may be exercised. */
function appWithoutDb() {
  return createApp({
    prisma: {} as PrismaClient,
    logger: captureLogger().logger,
    mailer: new MemoryMailer(),
    now: () => new Date(),
    config: {
      appEnv: 'test',
      appBaseUrl: 'http://localhost:3000',
      authRateLimitPerIp: 100,
      linkSigningSecret: 'x'.repeat(32),
      apiBaseUrl: 'http://localhost:4000',
      mailFrom: 'Specialty Masters Club <news@mail.smc.example>',
      mailReplyTo: 'smcommittee@uw.edu',
      emailAllowlist: [],
      digestLookaheadDays: 21,
      digestLogoUrl: null,
      mailgunWebhookSigningKey: null,
      uploadDir: '.test-uploads',
    },
  });
}

describe('api app', () => {
  it('responds to /health with a request id', async () => {
    const res = await request(appWithoutDb()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(appWithoutDb()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('rejects mutations from a foreign or missing Origin before touching the database', async () => {
    const app = appWithoutDb();
    const foreign = await request(app)
      .post('/auth/magic-link')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@uw.edu' });
    expect(foreign.status).toBe(403);
    expect(foreign.body).toEqual({ error: 'bad_origin' });

    const missing = await request(app).post('/auth/magic-link').send({ email: 'a@uw.edu' });
    expect(missing.status).toBe(403);
  });

  it('answers malformed JSON with 400', async () => {
    const res = await request(appWithoutDb())
      .post('/auth/magic-link')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_json' });
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

describe('origin check', () => {
  const app = (appEnv: 'development' | 'production', appBaseUrl: string) =>
    createApp({
      prisma: {} as PrismaClient,
      logger: captureLogger().logger,
      mailer: new MemoryMailer(),
      now: () => new Date(),
      config: {
        appEnv,
        appBaseUrl,
        authRateLimitPerIp: 100,
        linkSigningSecret: 'x'.repeat(32),
        apiBaseUrl: 'http://localhost:4000',
        mailFrom: 'SMC <news@mail.smc.example>',
        mailReplyTo: 'smcommittee@uw.edu',
        emailAllowlist: [],
        digestLookaheadDays: 21,
        digestLogoUrl: null,
        mailgunWebhookSigningKey: null,
        uploadDir: '.test-uploads',
      },
    });
  // Passing the origin check reaches body validation (400) without touching the database.
  const post = (a: ReturnType<typeof app>, origin: string) =>
    request(a).post('/auth/magic-link').set('Origin', origin).send({});

  it('accepts 127.0.0.1 for a localhost site in development only', async () => {
    const dev = app('development', 'http://localhost:3000');
    expect((await post(dev, 'http://127.0.0.1:3000')).status).toBe(400);
    expect((await post(dev, 'http://127.0.0.1:3001')).status).toBe(403);
    expect((await post(dev, 'http://10.0.0.5:3000')).status).toBe(403);
    const prod = app('production', 'https://smc.example');
    expect((await post(prod, 'https://smc.example')).status).toBe(400);
    expect((await post(prod, 'http://localhost:3000')).status).toBe(403);
  });
});
