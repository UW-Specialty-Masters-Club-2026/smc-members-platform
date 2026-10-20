/**
 * End-to-end privacy check: drive the whole platform (sign-up, events, check-in, news,
 * digest draft → approve → send, webhooks, unsubscribe), then scan everything we persist for
 * operations (audit log, webhook payloads, job and batch errors) and every log line for full
 * email addresses and secrets.
 */
import { randomBytes } from 'node:crypto';
import {
  approveDigest,
  digestJobHandlers,
  tick,
  unsubscribeLinks,
  type DigestTransport,
} from '@smc/digest';
import { recipientGuard, signMailgunWebhook, type BatchMessage } from '@smc/email';
import { runDueJobs } from '@smc/jobs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { workflowDeps } from './admin/digests';
import { get, send } from './test/fixtures';
import {
  createHarness,
  hasTestDb,
  lastMagicLinkToken,
  signedInMember,
  TEST_LINK_SECRET,
  TEST_WEBHOOK_KEY,
  WEB_ORIGIN,
  type TestHarness,
} from './test/harness';

/** A full address: something@domain.tld whose local part is not masked ("a***"). */
const FULL_EMAIL = /[A-Za-z0-9._%+-]{2,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ALLOWED_ADDRESSES = new Set(['smcommittee@uw.edu']); // the club's public contact

describe.skipIf(!hasTestDb)(
  'privacy: nothing sensitive is persisted for operations or logged',
  () => {
    let h: TestHarness;
    const secrets: string[] = [TEST_LINK_SECRET, TEST_WEBHOOK_KEY];
    const sent: BatchMessage[] = [];

    beforeAll(() => {
      h = createHarness();
    });
    afterAll(() => h.close());

    it('the scanner itself catches full addresses and ignores masked ones', () => {
      expect('bounce for jane.member@uw.edu'.match(FULL_EMAIL)).toEqual(['jane.member@uw.edu']);
      expect('bounce for j***@uw.edu'.match(FULL_EMAIL)).toBeNull();
    });

    it('runs the whole flow and finds no addresses or secrets at rest', async () => {
      await h.reset();
      h.setNow(new Date('2026-10-26T15:00:00Z')); // Mon 08:00 PDT

      // Sign-up + magic link.
      await request(h.app).post('/auth/signup').set('Origin', WEB_ORIGIN).send({
        email: 'jane.member@uw.edu',
        firstName: 'Jane',
        lastName: 'Member',
        newsOptIn: true,
      });
      const magic = lastMagicLinkToken(h.mailer);
      secrets.push(magic);
      const verified = await request(h.app)
        .post('/auth/verify')
        .set('Origin', WEB_ORIGIN)
        .send({ token: magic });
      const janeCookie = verified.headers['set-cookie']![0]!.split(';')[0]!;
      secrets.push(janeCookie.split('=')[1]!);
      const jane = await h.prisma.member.findUniqueOrThrow({
        where: { email: 'jane.member@uw.edu' },
      });

      const admin = await signedInMember(h, { role: 'ADMIN', email: 'ada.admin@uw.edu' });
      await signedInMember(h, { newsOptIn: true, email: 'leo.grad@gmail.com' });

      // Event, registration, news.
      const ev = await send(h, 'post', '/admin/events', admin.cookie, {
        title: 'AI at Work Workshop',
        summary: 'Hands-on session on AI tools in finance roles.',
        startsAtPt: '2026-10-28T18:00',
        endsAtPt: '2026-10-28T19:30',
        location: 'PACCAR Hall 192 · UW Seattle',
        capacity: 30,
      });
      await send(h, 'post', `/admin/events/${ev.body.id}/publish`, admin.cookie);
      await send(h, 'post', `/events/${ev.body.slug}/registration`, janeCookie);
      const news = await send(h, 'post', '/admin/news', admin.cookie, {
        tag: 'NOW RECRUITING',
        title: 'Join the SMC team',
        summary: 'SMC is growing. Help create experiences for students.',
        applyEmail: 'smcommittee@uw.edu',
        openings: [{ title: 'Operations', openings: 1 }],
      });
      h.setNow(new Date('2026-10-21T18:00:00Z'));
      await send(h, 'post', `/admin/news/${news.body.id}/publish`, admin.cookie);

      // Digest: draft → test send → approve → worker sends.
      h.setNow(new Date('2026-10-26T15:00:00Z'));
      const draft = await send(h, 'post', '/admin/digests/draft-now', admin.cookie);
      const digest = (await get(h, `/admin/digests/${draft.body.digestId}`, admin.cookie)).body;
      await send(h, 'post', `/admin/digests/${digest.id}/test-send`, admin.cookie);
      await approveDigest(
        workflowDeps(h.ctx, 'approve-run'),
        digest.id,
        admin.member.id,
        digest.version,
      );

      h.setNow(new Date('2026-10-26T16:00:00Z'));
      const transport: DigestTransport = {
        sendBatch: async (msg) => {
          sent.push(msg);
          return { kind: 'sent', messageId: '<batch@mg>' };
        },
        acceptedDeliveryIds: async () => new Set(),
      };
      const deps = (runId: string) => ({
        ...workflowDeps(h.ctx, runId),
        transport,
        guard: recipientGuard('production', []),
      });
      for (let i = 0; i < 4; i++) {
        await tick(deps(`tick-${i}`));
        await runDueJobs(h.prisma, digestJobHandlers(deps), { workerId: 'w', now: h.ctx.now });
      }
      expect(sent).toHaveLength(1);
      for (const r of sent[0]!.recipients) {
        secrets.push(new URL(r.variables.unsub_one_click_url!).searchParams.get('t')!);
      }

      // Webhooks: a bounce report quoting the address, and a complaint.
      const delivery = await h.prisma.digestDelivery.findFirstOrThrow({
        where: { memberId: jane.id },
      });
      const hook = (eventData: object) => {
        const timestamp = String(Math.floor(h.ctx.now().getTime() / 1000));
        const token = randomBytes(25).toString('hex');
        return request(h.app)
          .post('/webhooks/mailgun')
          .send({
            signature: {
              timestamp,
              token,
              signature: signMailgunWebhook(TEST_WEBHOOK_KEY, timestamp, token),
            },
            'event-data': eventData,
          });
      };
      await hook({
        id: 'e1',
        event: 'failed',
        severity: 'temporary',
        recipient: 'jane.member@uw.edu',
        'user-variables': { delivery_id: delivery.id },
        'delivery-status': { code: 452, message: 'jane.member@uw.edu mailbox full' },
      });
      await hook({
        id: 'e2',
        event: 'complained',
        recipient: 'leo.grad@gmail.com',
        'user-variables': {},
      });

      // Event day: check-in.
      h.setNow(new Date('2026-10-29T01:30:00Z'));
      const page = await get(h, `/events/${ev.body.slug}`, janeCookie);
      const code = new URL(page.body.checkIn.url.replace('#', '?')).searchParams.get('code')!;
      secrets.push(code);
      await send(h, 'post', '/staff/checkin', admin.cookie, { code });

      // Unsubscribe link.
      const links = unsubscribeLinks(
        {
          appBaseUrl: WEB_ORIGIN,
          apiBaseUrl: 'http://localhost:4000',
          linkSigningSecret: TEST_LINK_SECRET,
        },
        jane.id,
        h.ctx.now(),
      );
      const unsubToken = decodeURIComponent(new URL(links.oneClick).searchParams.get('t')!);
      secrets.push(unsubToken);
      await request(h.app)
        .post(`/email/unsubscribe/one-click?t=${encodeURIComponent(unsubToken)}`)
        .send();

      // ── Scan everything stored for operations ──
      const stringify = (v: unknown) =>
        JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
      const atRest = stringify({
        audit: await h.prisma.auditLog.findMany(),
        webhooks: await h.prisma.mailgunWebhookEvent.findMany({ select: { payload: true } }),
        jobs: await h.prisma.job.findMany({ select: { lastError: true, payload: true } }),
        batches: await h.prisma.digestBatch.findMany({ select: { lastError: true } }),
        deliveries: await h.prisma.digestDelivery.findMany({ select: { lastErrorMessage: true } }),
      });
      const logs = h.logLines.join('\n');

      for (const [where, text] of [
        ['stored operational data', atRest],
        ['logs', logs],
      ] as const) {
        const leaked = (text.match(FULL_EMAIL) ?? []).filter((a) => !ALLOWED_ADDRESSES.has(a));
        expect(leaked, `full email addresses in ${where}`).toEqual([]);
        for (const secret of secrets) expect(text, `secret in ${where}`).not.toContain(secret);
      }

      // The flow really did produce a rich trail (so the scan above is meaningful).
      const actions = new Set((await h.prisma.auditLog.findMany()).map((a) => a.action));
      for (const a of [
        'member.signup',
        'auth.login',
        'event.published',
        'registration.created',
        'news.published',
        'digest.drafted',
        'digest.test_sent',
        'digest.approved',
        'digest.batch.sent',
        'digest.sent',
        'mailgun.temporary_fail',
        'mailgun.complained',
        'attendance.checked_in',
        'member.news_opt_in.changed',
      ]) {
        expect(actions, a).toContain(a);
      }
      // Every entry carries a run id and a time.
      const audit = await h.prisma.auditLog.findMany();
      expect(audit.every((e) => e.runId.length > 0 && e.createdAt instanceof Date)).toBe(true);
      // Admin decisions name the admin.
      expect(audit.find((e) => e.action === 'digest.approved')).toMatchObject({
        actorType: 'ADMIN',
        actorId: admin.member.id,
      });
    });
  },
);
