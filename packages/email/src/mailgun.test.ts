import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isAllowed,
  MAILGUN_BATCH_LIMIT,
  MailgunClient,
  MailgunMailer,
  recipientGuard,
  type BatchMessage,
} from './mailgun';

interface Captured {
  method: string;
  path: string;
  auth: string | undefined;
  form: FormData | null;
}

let server: Server | null = null;
afterEach(
  () => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())),
);

/** A local stand-in for the Mailgun API that records what it receives. */
async function fakeMailgun(
  respond: (req: Captured) => { status: number; body?: unknown; delayMs?: number },
) {
  const seen: Captured[] = [];
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks);
    const form =
      req.method === 'POST'
        ? await new Request('http://x', {
            method: 'POST',
            headers: { 'content-type': req.headers['content-type'] ?? '' },
            body: raw,
          }).formData()
        : null;
    const captured = { method: req.method!, path: req.url!, auth: req.headers.authorization, form };
    seen.push(captured);
    const out = respond(captured);
    setTimeout(() => {
      res.writeHead(out.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.body ?? {}));
    }, out.delayMs ?? 0);
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const { port } = server!.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, seen };
}

function client(
  baseUrl: string,
  extra: Partial<ConstructorParameters<typeof MailgunClient>[0]> = {},
) {
  return new MailgunClient({
    apiKey: 'key-test-123',
    domain: 'mail.smc.example',
    baseUrl,
    testMode: false,
    ...extra,
  });
}

const message = (n = 2): BatchMessage => ({
  from: 'Specialty Masters Club <news@mail.smc.example>',
  replyTo: 'smcommittee@uw.edu',
  subject: 'This week at SMC · Oct 26',
  html: '<p>Hi %recipient.first_name_html%</p>',
  text: 'Hi %recipient.first_name%',
  tag: 'weekly-digest',
  recipients: Array.from({ length: n }, (_, i) => ({
    email: `m${i}@uw.edu`,
    variables: {
      delivery_id: `d${i}`,
      first_name: `M${i}`,
      unsub_one_click_url: `https://api.smc.example/u?t=${i}`,
    },
  })),
  customVariables: { digest_id: 'dig_1', delivery_id: '%recipient.delivery_id%' },
  headers: {
    'List-Unsubscribe': '<%recipient.unsub_one_click_url%>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
});

describe('MailgunClient.sendBatch', () => {
  it('posts one multipart batch with per-recipient variables, headers and tracking off', async () => {
    const mg = await fakeMailgun(() => ({
      status: 200,
      body: { id: '<abc@mail.smc.example>', message: 'Queued' },
    }));
    const outcome = await client(mg.baseUrl).sendBatch(message());
    expect(outcome).toEqual({ kind: 'sent', messageId: '<abc@mail.smc.example>' });

    const [req] = mg.seen;
    expect(req!.path).toBe('/v3/mail.smc.example/messages');
    expect(req!.auth).toBe(`Basic ${Buffer.from('api:key-test-123').toString('base64')}`);
    const f = req!.form!;
    expect(f.getAll('to')).toEqual(['m0@uw.edu', 'm1@uw.edu']);
    expect(f.get('from')).toBe('Specialty Masters Club <news@mail.smc.example>');
    expect(f.get('h:Reply-To')).toBe('smcommittee@uw.edu');
    expect(f.get('o:tag')).toBe('weekly-digest');
    expect(f.get('o:tracking')).toBe('no');
    expect(f.get('o:tracking-clicks')).toBe('no');
    expect(f.get('o:tracking-opens')).toBe('no');
    expect(f.get('o:testmode')).toBeNull();
    expect(f.get('v:digest_id')).toBe('dig_1');
    expect(f.get('v:delivery_id')).toBe('%recipient.delivery_id%');
    expect(f.get('h:List-Unsubscribe')).toBe('<%recipient.unsub_one_click_url%>');
    expect(f.get('h:List-Unsubscribe-Post')).toBe('List-Unsubscribe=One-Click');
    expect(JSON.parse(String(f.get('recipient-variables')))).toEqual({
      'm0@uw.edu': {
        delivery_id: 'd0',
        first_name: 'M0',
        unsub_one_click_url: 'https://api.smc.example/u?t=0',
      },
      'm1@uw.edu': {
        delivery_id: 'd1',
        first_name: 'M1',
        unsub_one_click_url: 'https://api.smc.example/u?t=1',
      },
    });
  });

  it('adds o:testmode when configured', async () => {
    const mg = await fakeMailgun(() => ({ status: 200, body: { id: '<x>' } }));
    await client(mg.baseUrl, { testMode: true }).sendBatch(message(1));
    expect(mg.seen[0]!.form!.get('o:testmode')).toBe('yes');
  });

  it('refuses batches over the Mailgun limit', async () => {
    await expect(
      client('http://127.0.0.1:1').sendBatch(message(MAILGUN_BATCH_LIMIT + 1)),
    ).rejects.toThrow(/1000/);
  });

  it.each([
    [429, 'transient'],
    [500, 'transient'],
    [503, 'transient'],
    [400, 'permanent'],
    [401, 'permanent'],
    [404, 'permanent'],
  ] as const)('classifies HTTP %i as %s', async (status, kind) => {
    const mg = await fakeMailgun(() => ({ status, body: { message: 'nope' } }));
    const outcome = await client(mg.baseUrl).sendBatch(message(1));
    expect(outcome).toMatchObject({ kind, status, error: 'nope' });
  });

  it('treats a timeout as unknown (it may have been accepted)', async () => {
    const mg = await fakeMailgun(() => ({ status: 200, body: { id: '<late>' }, delayMs: 300 }));
    const outcome = await client(mg.baseUrl, { timeoutMs: 50 }).sendBatch(message(1));
    expect(outcome.kind).toBe('unknown');
  });

  it('treats a refused connection as transient (nothing was sent)', async () => {
    const mg = await fakeMailgun(() => ({ status: 200 }));
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
    const outcome = await client(mg.baseUrl).sendBatch(message(1));
    expect(outcome).toMatchObject({ kind: 'transient', error: 'ECONNREFUSED' });
  });

  it('treats 200 without a message id as unknown', async () => {
    const mg = await fakeMailgun(() => ({ status: 200, body: {} }));
    expect((await client(mg.baseUrl).sendBatch(message(1))).kind).toBe('unknown');
  });
});

describe('MailgunClient.acceptedDeliveryIds', () => {
  it('pages through accepted events filtered by digest id', async () => {
    const base = () => `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
    let calls = 0;
    const mg = await fakeMailgun((req) => {
      calls += 1;
      if (calls === 1) {
        const q = new URL(req.path, 'http://x').searchParams;
        expect(q.get('event')).toBe('accepted');
        expect(JSON.parse(q.get('user-variables')!)).toEqual({ digest_id: 'dig_1' });
        return {
          status: 200,
          body: {
            items: [
              { 'user-variables': { delivery_id: 'd1' } },
              { 'user-variables': { delivery_id: 'd2' } },
            ],
            paging: {
              next: `${base()}/v3/mail.smc.example/events/page2`,
            },
          },
        };
      }
      if (calls === 2)
        return {
          status: 200,
          body: {
            items: [{ 'user-variables': { delivery_id: 'd3' } }],
            paging: {
              next: `${base()}/v3/mail.smc.example/events/page3`,
            },
          },
        };
      return { status: 200, body: { items: [] } };
    });
    const ids = await client(mg.baseUrl).acceptedDeliveryIds(
      'dig_1',
      new Date('2026-10-26T16:00:00Z'),
    );
    expect([...ids].sort()).toEqual(['d1', 'd2', 'd3']);
  });
});

describe('recipient guard', () => {
  it('lets everyone through in production only', () => {
    expect(isAllowed(recipientGuard('production', []), 'anyone@uw.edu')).toBe(true);
    const staging = recipientGuard('staging', ['tester@uw.edu']);
    expect(isAllowed(staging, 'Tester@UW.edu')).toBe(true);
    expect(isAllowed(staging, 'member@uw.edu')).toBe(false);
    expect(isAllowed(recipientGuard('development', []), 'tester@uw.edu')).toBe(false);
  });

  it('blocks transactional mail to non-allowlisted addresses before calling Mailgun', async () => {
    const mg = await fakeMailgun(() => ({ status: 200, body: { id: '<x>' } }));
    const mailer = new MailgunMailer(
      client(mg.baseUrl),
      recipientGuard('staging', ['tester@uw.edu']),
      'SMC <news@mail.smc.example>',
      'smcommittee@uw.edu',
    );
    const email = { subject: 's', html: 'h', text: 't', tag: 'auth' };
    await expect(mailer.send({ ...email, to: 'member@uw.edu' })).rejects.toThrow(/ALLOWLIST/);
    expect(mg.seen).toHaveLength(0);
    await expect(mailer.send({ ...email, to: 'tester@uw.edu' })).resolves.toEqual({
      messageId: '<x>',
    });
    expect(mg.seen[0]!.form!.get('o:tag')).toBe('auth');
  });
});
