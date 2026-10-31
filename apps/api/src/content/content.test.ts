import { rm } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { get, publishedEvent, send } from '../test/fixtures';
import {
  createHarness,
  hasTestDb,
  signedInMember,
  TEST_UPLOAD_DIR,
  WEB_ORIGIN,
  type TestHarness,
} from '../test/harness';
import { renderMarkdown } from './markdown';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

describe('renderMarkdown', () => {
  it('keeps formatting and strips anything executable', () => {
    const html = renderMarkdown(
      '## Title\n\n**bold** [ok](https://uw.edu) [bad](javascript:alert(1))\n\n<script>alert(1)</script><img src=x onerror=alert(1)>\n\n![p](/api/uploads/a.png)',
    );
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain(
      '<a href="https://uw.edu" target="_blank" rel="noopener noreferrer">ok</a>',
    );
    expect(html).not.toMatch(/javascript:|<script|onerror/);
    expect(html).toContain('<img src="/api/uploads/a.png" alt="p" loading="lazy" />');
  });
});

describe.skipIf(!hasTestDb)('website content admin', () => {
  let h: TestHarness;
  let admin: Awaited<ReturnType<typeof signedInMember>>;
  let organizer: Awaited<ReturnType<typeof signedInMember>>;

  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(async () => {
    await h.reset();
    admin = await signedInMember(h, { role: 'ADMIN' });
    organizer = await signedInMember(h, { role: 'ORGANIZER' });
  });
  afterAll(async () => {
    await rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
    await h.close();
  });

  it('creates, lists, edits and deletes team members, with an audit trail', async () => {
    const created = await send(h, 'post', '/admin/content/team', organizer.cookie, {
      name: 'Nora Lee',
      role: 'Head, Operations',
      departments: ['operations'],
      major: 'MSBA',
      linkedinUrl: 'https://www.linkedin.com/in/nora',
      imageUrl: '/content/2026-09-alyssa.jpg',
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    expect(
      (await request(h.app).get('/content/team')).body.items.map((t: { name: string }) => t.name),
    ).toEqual(['Nora Lee']);

    const edited = await send(h, 'patch', `/admin/content/team/${id}`, organizer.cookie, {
      isPublished: false,
    });
    expect(edited.body.isPublished).toBe(false);
    expect((await request(h.app).get('/content/team')).body.items).toEqual([]);

    expect((await send(h, 'delete', `/admin/content/team/${id}`, organizer.cookie)).status).toBe(
      204,
    );
    const actions = (
      await h.prisma.auditLog.findMany({ where: { entityType: 'team_member' } })
    ).map((a) => a.action);
    expect(actions).toEqual(['team_member.created', 'team_member.updated', 'team_member.deleted']);
  });

  it('rejects unsafe links and unknown fields', async () => {
    const res = await send(h, 'post', '/admin/content/team', admin.cookie, {
      name: 'X',
      role: 'Y',
      departments: ['tech'],
      linkedinUrl: 'javascript:alert(1)',
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toContain('linkedinUrl');
    const extra = await send(h, 'post', '/admin/content/skills', admin.cookie, {
      group: 'CAREER',
      name: 'A',
      description: 'B',
      evil: true,
    });
    expect(extra.status).toBe(400);
  });

  it('publishes articles: slug from title, date stamped, drafts hidden, body rendered', async () => {
    const draft = await send(h, 'post', '/admin/content/articles', organizer.cookie, {
      title: 'Why Case Competitions Matter',
      subtitle: 'Lessons learned',
      category: 'Career',
      author: 'Huy Nguyen',
      body: '## Hello\n\nText with **bold**.',
    });
    expect(draft.body).toMatchObject({
      slug: 'why-case-competitions-matter',
      status: 'DRAFT',
      publishedAt: null,
    });
    expect(
      (await request(h.app).get('/content/articles/why-case-competitions-matter')).status,
    ).toBe(404);

    await send(h, 'patch', `/admin/content/articles/${draft.body.id}`, organizer.cookie, {
      status: 'PUBLISHED',
    });
    const pub = await request(h.app).get('/content/articles/why-case-competitions-matter');
    expect(pub.body.html).toContain('<h2>Hello</h2>');
    expect(pub.body.publishedAt).toBe(h.ctx.now().toISOString().slice(0, 10));
    const list = await request(h.app).get('/content/articles');
    expect(list.body.items[0]).not.toHaveProperty('html');

    const dup = await send(h, 'post', '/admin/content/articles', organizer.cookie, {
      title: 'Another',
      slug: 'why-case-competitions-matter',
      subtitle: 's',
      category: 'c',
      author: 'a',
      body: '',
    });
    expect(dup.body).toEqual({ error: 'duplicate' });
  });

  it('manages newsletters and skills', async () => {
    const n = await send(h, 'post', '/admin/content/newsletters', organizer.cookie, {
      volume: 'Vol. 4',
      title: 'SMC Newsletter',
      summary: 'Fall edition',
      highlights: ['One', 'Two'],
      pdfUrl: 'https://sites.uw.edu/smcommittee/files/vol4.pdf',
      issuedAt: '2026-11-01',
    });
    expect(n.body).toMatchObject({ slug: 'vol-4', issuedAt: '2026-11-01', status: 'PUBLISHED' });
    expect((await request(h.app).get('/content/newsletters/vol-4')).body.highlights).toEqual([
      'One',
      'Two',
    ]);

    await send(h, 'post', '/admin/content/skills', organizer.cookie, {
      group: 'BUILT_IN',
      name: 'Excel',
      description: 'Sheets',
    });
    expect((await request(h.app).get('/content/skills')).body.items).toHaveLength(1);
  });

  it('lets only admins edit site settings, with validation', async () => {
    const body = { paragraphs: ['First paragraph.', 'Second.'] };
    expect(
      (await send(h, 'put', '/admin/content/settings/about', organizer.cookie, body)).status,
    ).toBe(403);
    expect((await send(h, 'put', '/admin/content/settings/about', admin.cookie, body)).status).toBe(
      200,
    );
    expect((await send(h, 'put', '/admin/content/settings/nope', admin.cookie, body)).status).toBe(
      404,
    );
    expect(
      (await send(h, 'put', '/admin/content/settings/about', admin.cookie, { paragraphs: [] }))
        .status,
    ).toBe(400);
    expect((await request(h.app).get('/content/site')).body.about).toEqual(body);
  });

  it('keeps members out of the content admin', async () => {
    const m = await signedInMember(h);
    expect((await get(h, '/admin/content/team', m.cookie)).status).toBe(403);
    expect((await get(h, '/admin/stats', m.cookie)).status).toBe(403);
  });

  it('accepts real images only and serves them back', async () => {
    const up = await request(h.app)
      .post('/admin/uploads')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', organizer.cookie)
      .set('Content-Type', 'image/png')
      .send(PNG);
    expect(up.status).toBe(201);
    expect(up.body.url).toMatch(/^\/api\/uploads\/[0-9a-f]{24}\.png$/);
    const served = await request(h.app).get(up.body.url.replace('/api', ''));
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');

    const svg = await request(h.app)
      .post('/admin/uploads')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', organizer.cookie)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    expect(svg.status).toBe(415);
    const anon = await request(h.app)
      .post('/admin/uploads')
      .set('Origin', WEB_ORIGIN)
      .set('Content-Type', 'image/png')
      .send(PNG);
    expect(anon.status).toBe(401);
  });

  it('serves dashboard numbers', async () => {
    const { event } = await publishedEvent(h);
    const m = await signedInMember(h, { newsOptIn: true });
    await send(h, 'post', `/events/${event.slug}/registration`, m.cookie);
    const res = await get(h, '/admin/stats', admin.cookie);
    expect(res.body.registrations.last8Weeks).toBe(1);
    expect(res.body.registrations.perWeek).toHaveLength(8);
    expect(res.body.upcoming[0]).toMatchObject({ title: 'AI at Work Workshop', confirmed: 1 });
    expect(res.body.members.optedIn).toBe(1);
    expect(res.body.recentActivity.length).toBeGreaterThan(0);
    expect((await get(h, '/admin/stats', organizer.cookie)).body.recentActivity).toEqual([]);
  });
});

describe.skipIf(!hasTestDb)('deleting club records', () => {
  let h: TestHarness;
  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  it('admins add, edit and delete members; authors and self are protected', async () => {
    const admin = await signedInMember(h, { role: 'ADMIN' });
    const created = await send(h, 'post', '/admin/members', admin.cookie, {
      email: ' New.Person@UW.edu ',
      firstName: 'New',
      lastName: 'Person',
    });
    expect(created.body).toMatchObject({
      email: 'new.person@uw.edu',
      emailVerified: false,
      role: 'MEMBER',
    });
    expect(
      (
        await send(h, 'post', '/admin/members', admin.cookie, {
          email: 'new.person@uw.edu',
          firstName: 'A',
          lastName: 'B',
        })
      ).body,
    ).toEqual({ error: 'email_taken' });

    // Editing your own name is fine; changing your own role is not.
    expect(
      (
        await send(h, 'patch', `/admin/members/${admin.member.id}`, admin.cookie, {
          firstName: 'Ada',
          role: 'ADMIN',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(h, 'patch', `/admin/members/${admin.member.id}`, admin.cookie, {
          role: 'MEMBER',
        })
      ).body,
    ).toEqual({ error: 'cannot_modify_self' });

    expect(
      (await send(h, 'delete', `/admin/members/${created.body.id}`, admin.cookie)).status,
    ).toBe(204);
    expect(await h.prisma.member.count({ where: { id: created.body.id } })).toBe(0);
    expect(
      (await send(h, 'delete', `/admin/members/${admin.member.id}`, admin.cookie)).status,
    ).toBe(409);

    const { staff } = await publishedEvent(h);
    expect(
      (await send(h, 'delete', `/admin/members/${staff.member.id}`, admin.cookie)).body,
    ).toEqual({ error: 'member_has_content' });
  });

  it('organizers delete draft events only; admins delete any with registrations', async () => {
    const organizer = await signedInMember(h, { role: 'ORGANIZER' });
    const admin = await signedInMember(h, { role: 'ADMIN' });
    const { event } = await publishedEvent(h);
    const m = await signedInMember(h);
    await send(h, 'post', `/events/${event.slug}/registration`, m.cookie);
    expect((await send(h, 'delete', `/admin/events/${event.id}`, organizer.cookie)).body).toEqual({
      error: 'admins_only',
    });
    expect((await send(h, 'delete', `/admin/events/${event.id}`, admin.cookie)).status).toBe(204);
    expect(await h.prisma.registration.count()).toBe(0);
    const audit = await h.prisma.auditLog.findFirstOrThrow({ where: { action: 'event.deleted' } });
    expect(audit.metadata).toMatchObject({ registrations: 1 });
  });
});
