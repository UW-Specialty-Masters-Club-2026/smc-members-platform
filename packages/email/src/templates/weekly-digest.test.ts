import type { DigestContent } from './digest-content';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast';
import { DESIGN_CONTENT } from './__fixtures__/digest-content';
import { personalize, PLACEHOLDERS, renderDigestEmail, TEXT_COLOR_PAIRS } from './weekly-digest';

const BASE = 'https://smc.example';
const render = (content: DigestContent = DESIGN_CONTENT, logoUrl?: string) =>
  renderDigestEmail({ content, issueNumber: 12, appBaseUrl: BASE, logoUrl });

/** Visible text of the HTML, for content assertions. */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('weekly digest email', () => {
  it('matches the reviewed snapshots (HTML and plain text)', async () => {
    const r = await render();
    expect(r.subject).toBe('This week at SMC · Oct 26');
    await expect(r.html).toMatchFileSnapshot('./__snapshots__/weekly-digest.html');
    await expect(r.text).toMatchFileSnapshot('./__snapshots__/weekly-digest.txt');
  });

  it('shows every fact from the snapshot, in Pacific Time', async () => {
    const text = visibleText((await render()).html);
    for (const s of [
      'News and events for UW Foster Specialty Master’s students',
      'View in browser',
      'WEEKLY DIGEST',
      'Monday, October 26, 2026',
      'ISSUE 12',
      'This week',
      'at SMC',
      'Two events to save a seat for, and four open roles on the SMC team.',
      'Upcoming events',
      '01',
      'AI at Work Workshop',
      'Wed, Oct 28 · 6:00–7:30 PM PT',
      'PACCAR Hall, Room 192 · UW Seattle',
      '18 of 30 seats left',
      'REGISTER',
      'Full · Join the waitlist',
      'JOIN WAITLIST',
      'Club news',
      'NOW RECRUITING',
      'Join the SMC team',
      'Finance Officers',
      '2 OPENINGS',
      'How to apply',
      'A brief note on why you’d like to join',
      'Instagram @smclub_uw',
      'UW Foster School of Business · Seattle, WA',
      'smcommittee@uw.edu',
      'You’re getting this because you opted in to SMC news and invitations.',
      'Manage email preferences',
      'Unsubscribe',
    ]) {
      expect(text).toContain(s);
    }
  });

  it('links registration, news, preferences, unsubscribe and the browser view', async () => {
    const { html, viewInBrowserUrl } = await render();
    expect(html).toContain('href="https://smc.example/events/ai-at-work-workshop-1a2b3c"');
    expect(html).toContain('href="https://smc.example/events/alumni-coffee-chat-4d5e6f"');
    expect(html).toContain('href="https://smc.example/news/join-the-smc-team-7a8b9c"');
    expect(html).toContain('href="https://smc.example/me/profile"');
    expect(html).toContain(`href="${PLACEHOLDERS.unsubscribeUrl}"`);
    expect(html).toContain('href="mailto:smcommittee@uw.edu"');
    expect(viewInBrowserUrl).toBe('https://smc.example/digest/2026-10-26');
  });

  it('uses no flexbox, grid or CSS variables, and no unsupported ribbon CSS', async () => {
    const { html } = await render();
    expect(html).not.toMatch(/display\s*:\s*(inline-)?(flex|grid)/i);
    expect(html).not.toMatch(/var\(--/);
    expect(html).not.toMatch(/writing-mode|clip-path/);
  });

  it('is table-based, 600px wide, stacks on phones and keeps 48px buttons', async () => {
    const { html } = await render();
    expect(html).toMatch(/max-width:600px/);
    expect(html).toMatch(/@media only screen and \(max-width: ?480px\)/);
    expect(html).toContain('table.btn-full { width: 100% !important; }');
    expect(html).toContain('.ev-num, .ev-body { display: block !important;');
    // Touch targets: filled button cell 48px; outlined cell 44px + 2px border top and bottom.
    expect(html).toMatch(/background-color:#7E41E6;height:48px;/);
    expect(html).toMatch(/border:2px solid #2D0A68;height:44px;/);
  });

  it('gives every image alt text and reads well with images off', async () => {
    const withLogo = (await render(DESIGN_CONTENT, 'https://smc.example/brand/logo@2x.png')).html;
    const imgs = withLogo.match(/<img\b[^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) expect(img).toMatch(/\balt="[^"]+"/);
    // Without a logo the wordmark is live text, so nothing depends on images.
    expect((await render()).html).not.toMatch(/<img\b/);
  });

  it('uses the short header date on phones and never splits role names', async () => {
    const { html } = await render();
    expect(html).toContain(
      '<span class="date-short" style="display:none;mso-hide:all;">Mon, Oct 26</span>',
    );
    expect(html).toContain('.date-short { display: inline !important; }');
    expect(html).toMatch(/class="op-title" style="[^"]*word-break:normal;/);
    expect(html).toMatch(/class="op-num" style="[^"]*white-space:nowrap;word-break:normal;/);
  });

  it('opts out of client dark-mode inversion', async () => {
    const { html } = await render();
    expect(html).toContain('<meta name="color-scheme" content="light only"');
  });

  it('escapes content and attribute values', async () => {
    const evil: DigestContent = {
      ...DESIGN_CONTENT,
      events: [
        {
          ...DESIGN_CONTENT.events[0]!,
          title: '<script>alert(1)</script> & "Friends"',
          url: 'https://smc.example/events/x?a=1&b="2"',
        },
      ],
    };
    const { html, text } = await render(evil);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Friends&quot;');
    expect(html).toContain('href="https://smc.example/events/x?a=1&amp;b=&quot;2&quot;"');
    expect(text).toContain('<script>alert(1)</script> & "Friends"'); // plain text stays literal
  });

  it('leaves out empty sections', async () => {
    const newsOnly = await render({ ...DESIGN_CONTENT, events: [] });
    expect(visibleText(newsOnly.html)).not.toContain('Upcoming events');
    expect(newsOnly.text).not.toContain('UPCOMING EVENTS');
    const eventsOnly = await render({ ...DESIGN_CONTENT, news: [] });
    expect(visibleText(eventsOnly.html)).not.toContain('Club news');
    expect(eventsOnly.text).not.toContain('CLUB NEWS');
  });

  it('stays under Gmail’s 102 KB clipping limit at maximum length', async () => {
    const ev = DESIGN_CONTENT.events[0]!;
    const post = DESIGN_CONTENT.news[0]!;
    const longest: DigestContent = {
      ...DESIGN_CONTENT,
      events: Array.from({ length: 8 }, (_, i) => ({
        ...ev,
        id: `e${i}`,
        title: 'T'.repeat(160),
        summary: 'S'.repeat(280),
        location: 'L'.repeat(200),
      })),
      news: Array.from({ length: 6 }, (_, i) => ({
        ...post,
        id: `n${i}`,
        title: 'T'.repeat(160),
        summary: 'S'.repeat(600),
        openings: Array.from({ length: 6 }, (__, j) => ({ title: `Role ${j}`, openings: 1 })),
      })),
    };
    const { html } = await render(longest);
    expect(Buffer.byteLength(html)).toBeLessThan(102 * 1024);
  });

  it('has a plain-text twin with the same content', async () => {
    const { text } = await render();
    expect(text).not.toMatch(/<[a-z]/i);
    for (const s of [
      'THIS WEEK AT SMC · ISSUE 12',
      'Monday, October 26, 2026',
      '01  AI at Work Workshop',
      'When:  Wed, Oct 28 · 6:00–7:30 PM PT',
      'Where: PACCAR Hall, Room 192 · UW Seattle',
      'Seats: 18 of 30 seats left',
      'Register: https://smc.example/events/ai-at-work-workshop-1a2b3c',
      'Join the waitlist: https://smc.example/events/alumni-coffee-chat-4d5e6f',
      '[NOW RECRUITING]',
      '01  Finance Officers (2 openings)',
      'How to apply: email smcommittee@uw.edu with:',
      '  - Your resume',
      'Read more: https://smc.example/news/join-the-smc-team-7a8b9c',
      'Manage email preferences: https://smc.example/me/profile',
      `Unsubscribe: ${PLACEHOLDERS.unsubscribeUrl}`,
    ]) {
      expect(text).toContain(s);
    }
  });

  it('personalizes safely for previews and test sends', async () => {
    const r = await render();
    const out = personalize(r, {
      firstName: 'Ana <b>',
      unsubscribeUrl: 'https://smc.example/email/unsubscribe#t=a&b',
    });
    expect(out.html).toContain('Hi Ana &lt;b&gt;,<br />');
    expect(out.html).toContain('href="https://smc.example/email/unsubscribe#t=a&amp;b"');
    expect(out.text).toContain('Hi Ana <b>,\nTwo events to save a seat for');
    expect(out.text).toContain('Unsubscribe: https://smc.example/email/unsubscribe#t=a&b');
    expect(out.html + out.text).not.toContain('%recipient.');
  });
});

describe('brand color contrast', () => {
  it.each(TEXT_COLOR_PAIRS)('$where: $fg on $bg meets WCAG AA', ({ fg, bg, large }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(large ? 3 : 4.5);
  });
});
