import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { get, send } from '../test/fixtures';
import { createHarness, hasTestDb, signedInMember, type TestHarness } from '../test/harness';

const RECRUITING = {
  tag: 'now recruiting',
  title: 'Join the SMC team',
  summary: 'SMC is growing. Help create experiences that connect Specialty Master’s students.',
  applyEmail: 'smcommittee@uw.edu',
  applyChecklist: ['Your resume', 'The role you’re interested in', 'A brief note on why'],
  openings: [
    { title: 'Finance Officers', openings: 2 },
    { title: 'Operations', openings: 1 },
  ],
};

describe.skipIf(!hasTestDb)('club news', () => {
  let h: TestHarness;
  beforeAll(() => {
    h = createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  async function draft(body: object = RECRUITING) {
    const staff = await signedInMember(h, { role: 'ORGANIZER' });
    const res = await send(h, 'post', '/admin/news', staff.cookie, body);
    expect(res.status).toBe(201);
    return { post: res.body, staff };
  }

  it('creates a recruiting post with ordered openings and an upper-case tag', async () => {
    const { post } = await draft();
    expect(post).toMatchObject({
      status: 'DRAFT',
      tag: 'NOW RECRUITING',
      publishedAt: null,
      openings: RECRUITING.openings,
      applyChecklist: RECRUITING.applyChecklist,
    });
    expect(post.url).toBe(`http://localhost:3000/news/${post.slug}`);
  });

  it('stamps publishedAt on publish, which decides the digest week', async () => {
    const { post, staff } = await draft();
    h.setNow(new Date('2026-10-21T18:00:00Z'));
    const published = await send(h, 'post', `/admin/news/${post.id}/publish`, staff.cookie);
    expect(published.body.publishedAt).toBe('2026-10-21T18:00:00.000Z');
    expect((await send(h, 'post', `/admin/news/${post.id}/publish`, staff.cookie)).status).toBe(
      409,
    );
    expect(await h.prisma.auditLog.count({ where: { action: 'news.published' } })).toBe(1);
  });

  it('shows members published posts only', async () => {
    const { post: hidden } = await draft({ ...RECRUITING, title: 'Hidden draft' });
    const { post, staff } = await draft();
    await send(h, 'post', `/admin/news/${post.id}/publish`, staff.cookie);

    const list = await request(h.app).get('/news');
    expect(list.body.news.map((n: { title: string }) => n.title)).toEqual(['Join the SMC team']);
    expect((await request(h.app).get(`/news/${hidden.slug}`)).status).toBe(404);
    expect((await get(h, `/news/${hidden.slug}`, staff.cookie)).status).toBe(200);
  });

  it('replaces openings on edit and locks archived posts', async () => {
    const { post, staff } = await draft();
    const edited = await send(h, 'patch', `/admin/news/${post.id}`, staff.cookie, {
      openings: [{ title: 'AI & Tech', openings: 1 }],
    });
    expect(edited.body.openings).toEqual([{ title: 'AI & Tech', openings: 1 }]);

    await send(h, 'post', `/admin/news/${post.id}/archive`, staff.cookie);
    const locked = await send(h, 'patch', `/admin/news/${post.id}`, staff.cookie, { title: 'New' });
    expect(locked.body).toEqual({ error: 'news_archived' });
  });

  it('accepts only http(s) links', async () => {
    const staff = await signedInMember(h, { role: 'ADMIN' });
    const res = await send(h, 'post', '/admin/news', staff.cookie, {
      ...RECRUITING,
      linkUrl: 'javascript:alert(1)',
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toContain('linkUrl');
  });

  it('keeps news management to staff', async () => {
    const { cookie } = await signedInMember(h);
    expect((await send(h, 'post', '/admin/news', cookie, RECRUITING)).status).toBe(403);
  });
});
