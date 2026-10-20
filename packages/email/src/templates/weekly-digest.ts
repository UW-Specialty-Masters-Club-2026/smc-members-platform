// MJML 5 ships no types (and @types/mjml describes v4's sync API); our declaration must also
// be visible when other workspaces type-check this file.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../mjml.d.ts" />
import type { DigestContent, DigestEvent, DigestNews } from './digest-content';
import mjml2html from 'mjml';
import { escapeHtml } from '../escape';

/** Brand palette (approved design). */
export const COLORS = {
  ink: '#2D0A68',
  accent: '#7E41E6',
  gold: '#F3D35C',
  lavender: '#F8E6FE',
  page: '#EFE7FA',
  body: '#3E2C66',
  soft: '#B48CF0',
  muted: '#D9C8F5',
  preheader: '#4B3A73',
  white: '#FFFFFF',
} as const;

/** Every text color / background pair the template uses, for the contrast test. */
export const TEXT_COLOR_PAIRS: { fg: string; bg: string; large: boolean; where: string }[] = [
  { fg: COLORS.preheader, bg: COLORS.page, large: false, where: 'preheader row' },
  { fg: COLORS.gold, bg: COLORS.ink, large: false, where: 'WEEKLY DIGEST label, counts' },
  { fg: COLORS.lavender, bg: COLORS.ink, large: false, where: 'date, hero summary' },
  { fg: COLORS.ink, bg: COLORS.gold, large: false, where: 'ISSUE label, news tag' },
  { fg: COLORS.accent, bg: COLORS.white, large: true, where: 'section heading, event numbers' },
  { fg: COLORS.ink, bg: COLORS.white, large: false, where: 'event title, facts' },
  { fg: COLORS.body, bg: COLORS.white, large: false, where: 'event summary' },
  { fg: COLORS.accent, bg: COLORS.white, large: false, where: 'fact labels' },
  { fg: COLORS.white, bg: COLORS.accent, large: false, where: 'REGISTER button, apply box' },
  { fg: COLORS.ink, bg: COLORS.lavender, large: false, where: 'news heading and title' },
  { fg: COLORS.body, bg: COLORS.lavender, large: false, where: 'news summary' },
  { fg: COLORS.accent, bg: COLORS.lavender, large: false, where: 'read more link' },
  { fg: COLORS.white, bg: COLORS.ink, large: false, where: 'opening titles, footer links' },
  { fg: COLORS.soft, bg: COLORS.ink, large: true, where: 'opening numbers' },
  { fg: COLORS.muted, bg: COLORS.ink, large: false, where: 'footer opt-in note' },
];

const SANS = "Montserrat, 'Helvetica Neue', Arial, sans-serif";
const DISPLAY = "Anton, Impact, 'Arial Narrow Bold', sans-serif";
const INSTAGRAM_URL = 'https://www.instagram.com/smclub_uw';
const CONTACT_EMAIL = 'smcommittee@uw.edu';

/**
 * Per-recipient values, substituted by Mailgun from `recipient-variables` at send time.
 * Mailgun does not HTML-escape substitutions, so the HTML gets a pre-escaped name variant.
 */
export const PLACEHOLDERS = {
  firstNameHtml: '%recipient.first_name_html%',
  firstName: '%recipient.first_name%',
  unsubscribeUrl: '%recipient.unsub_url%',
} as const;

export interface DigestEmailInput {
  content: DigestContent;
  issueNumber: number;
  appBaseUrl: string;
  /** Hosted logo (PNG, ≥2× size). Until provided, a text wordmark is used. */
  logoUrl?: string | null;
}

export interface RenderedDigestEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  viewInBrowserUrl: string;
  preferencesUrl: string;
}

const e = escapeHtml;
const pad2 = (n: number) => String(n).padStart(2, '0');

function shortDate(weekKey: string): string {
  return new Date(`${weekKey}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Mon, Oct 26" — the phone header's short date (design: "Mon, [DATE]"). */
function shortWeekday(weekKey: string): string {
  return new Date(`${weekKey}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function digestSubject(content: DigestContent): string {
  return `This week at SMC · ${shortDate(content.weekKey)}`;
}

// ─── MJML pieces ───────────────────────────────────────────────────

function wordmark(size: number): string {
  return `<mj-text padding="0" font-family="${SANS}" font-size="${size}px" font-weight="800" letter-spacing="2px" line-height="1.25" color="${COLORS.gold}">SPECIALTY<br />MASTERS CLUB</mj-text>`;
}

function logo(input: DigestEmailInput, height: number): string {
  if (!input.logoUrl) return wordmark(height >= 50 ? 14 : 12);
  return `<mj-image padding="0" align="left" height="${height}px" width="${height * 2}px" src="${e(input.logoUrl)}" alt="Specialty Masters Club" />`;
}

function header(input: DigestEmailInput): string {
  return `
<mj-section background-color="${COLORS.ink}" padding="28px 36px 0" css-class="pad-x">
  <mj-group>
    <mj-column width="55%" vertical-align="middle">${logo(input, 56)}</mj-column>
    <mj-column width="45%" vertical-align="middle">
      <mj-text align="right" padding="0" font-size="12px" font-weight="800" letter-spacing="2px" color="${COLORS.gold}" css-class="wd-label">WEEKLY DIGEST</mj-text>
      <mj-text align="right" padding="4px 0 0" font-size="14px" font-weight="500" color="${COLORS.lavender}"><span class="date-long">${e(input.content.dateLabel)}</span><span class="date-short" style="display:none;mso-hide:all;">${e(shortWeekday(input.content.weekKey))}</span></mj-text>
    </mj-column>
  </mj-group>
</mj-section>`;
}

function hero(input: DigestEmailInput): string {
  // The design's vertical, notched "ISSUE" ribbon needs writing-mode/clip-path, which email
  // clients don't support; it becomes a gold label instead.
  return `
<mj-section background-color="${COLORS.ink}" padding="32px 36px 44px" css-class="pad-x">
  <mj-column>
    <mj-text padding="0 0 20px">
      <span style="display:inline-block;background-color:${COLORS.gold};color:${COLORS.ink};font-family:${DISPLAY};font-size:20px;letter-spacing:1px;line-height:1;padding:8px 12px;">ISSUE ${input.issueNumber}</span>
    </mj-text>
    <mj-text padding="0" font-family="${DISPLAY}" font-size="84px" line-height="0.95" css-class="hero-title">
      <span style="color:${COLORS.lavender};text-transform:uppercase;">This week</span><br /><span style="color:${COLORS.gold};text-transform:uppercase;">at SMC</span>
    </mj-text>
    <mj-text padding="24px 0 0" font-size="17px" line-height="1.55" color="${COLORS.lavender}" css-class="hero-copy">Hi ${PLACEHOLDERS.firstNameHtml},<br />${e(input.content.summary)}</mj-text>
  </mj-column>
</mj-section>`;
}

function sectionHeading(
  text: string,
  color: string,
  rule: string,
  bg: string,
  top: string,
): string {
  return `
<mj-section background-color="${bg}" padding="${top} 36px 4px" css-class="pad-x">
  <mj-column>
    <mj-text padding="0 0 12px" font-family="${DISPLAY}" font-size="44px" line-height="1" color="${color}" css-class="h2"><span style="text-transform:uppercase;">${e(text)}</span></mj-text>
    <mj-divider padding="0 0 24px" border-width="2px" border-color="${rule}" />
  </mj-column>
</mj-section>`;
}

function fact(label: string, value: string): string {
  return `<span style="display:inline-block;width:56px;font-size:11px;font-weight:800;letter-spacing:1px;color:${COLORS.accent};">${label}</span>${e(value)}`;
}

/** Bulletproof 48px button: a table cell carries the fill/border so Outlook renders it too. */
function button(label: string, href: string, filled: boolean): string {
  const cell = filled
    ? `background-color:${COLORS.accent};`
    : `background-color:${COLORS.white};border:2px solid ${COLORS.ink};`;
  const color = filled ? COLORS.white : COLORS.ink;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-full" style="margin-top:18px;border-collapse:separate;"><tr><td align="center" valign="middle" height="${filled ? 48 : 44}" bgcolor="${filled ? COLORS.accent : COLORS.white}" style="${cell}height:${filled ? 48 : 44}px;padding:0 ${filled ? 28 : 26}px;"><a href="${e(href)}" style="display:inline-block;font-family:${SANS};font-size:14px;font-weight:800;letter-spacing:1.4px;line-height:${filled ? 48 : 44}px;color:${color};text-decoration:none;">${label}</a></td></tr></table>`;
}

function eventRow(ev: DigestEvent, index: number): string {
  const facts = [fact('WHEN', ev.when), fact('WHERE', ev.location)];
  if (ev.seats) facts.push(fact('SEATS', ev.seats));
  const divider = index > 0 ? `border-top:2px solid ${COLORS.gold};` : '';
  const top = index > 0 ? 'padding-top:28px;' : '';
  return `<tr>
<td class="ev-num" valign="top" style="${divider}${top}width:96px;padding-bottom:28px;font-family:${DISPLAY};font-size:64px;line-height:0.9;color:${COLORS.accent};">${pad2(index + 1)}</td>
<td class="ev-body" valign="top" style="${divider}${top}padding-bottom:28px;font-family:${SANS};">
<div style="font-size:22px;font-weight:800;line-height:1.25;color:${COLORS.ink};">${e(ev.title)}</div>
<div style="padding-top:10px;font-size:15px;line-height:1.55;color:${COLORS.body};">${e(ev.summary)}</div>
<div style="padding-top:12px;font-size:14px;font-weight:600;line-height:1.8;color:${COLORS.ink};">${facts.join('<br />')}</div>
${button(ev.action === 'REGISTER' ? 'REGISTER' : 'JOIN WAITLIST', ev.url, ev.action === 'REGISTER')}
</td>
</tr>`;
}

/** All events in one section: one table row each (stacked on phones by CSS). */
function eventsBlock(events: DigestEvent[]): string {
  return `
<mj-section background-color="${COLORS.white}" padding="0 36px 16px" css-class="pad-x">
  <mj-column>
    <mj-table padding="0" cellpadding="0" cellspacing="0" width="100%">${events.map(eventRow).join('\n')}</mj-table>
  </mj-column>
</mj-section>`;
}

function openingsTable(post: DigestNews): string {
  const rows = post.openings
    .map((o, i) => {
      const border = i < post.openings.length - 1 ? `border-bottom:1px solid ${COLORS.gold};` : '';
      return `<tr><td class="op-num" style="${border}padding:16px 16px 16px 0;width:44px;font-family:${DISPLAY};font-size:34px;line-height:1;color:${COLORS.soft};white-space:nowrap;word-break:normal;">${pad2(i + 1)}</td><td class="op-title" style="${border}padding:16px 12px 16px 0;font-family:${SANS};font-size:16px;font-weight:800;letter-spacing:1px;color:${COLORS.white};text-transform:uppercase;word-break:normal;overflow-wrap:normal;">${e(o.title)}</td><td class="op-count" style="${border}padding:16px 0;font-family:${SANS};font-size:13px;font-weight:800;letter-spacing:1px;color:${COLORS.gold};text-align:right;white-space:nowrap;">${o.openings} ${o.openings === 1 ? 'OPENING' : 'OPENINGS'}</td></tr>`;
    })
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.ink}" style="margin-top:20px;background-color:${COLORS.ink};"><tr><td style="padding:8px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
}

function applyBox(post: DigestNews): string {
  if (!post.applyEmail) return '';
  const intro = `Email <a href="mailto:${e(post.applyEmail)}" style="color:${COLORS.white};font-weight:800;">${e(post.applyEmail)}</a>${post.applyChecklist.length ? ' with:' : ''}`;
  const items = post.applyChecklist
    .map((item) => `<span style="color:${COLORS.gold};">&#9632;</span>&nbsp;&nbsp;${e(item)}`)
    .join('<br />');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.accent}" style="margin-top:20px;background-color:${COLORS.accent};"><tr>
<td class="apply-head" valign="top" style="width:130px;padding:24px 0 24px 24px;font-family:${DISPLAY};font-size:34px;line-height:1.02;color:${COLORS.white};text-transform:uppercase;">How to apply</td>
<td class="apply-body" valign="top" style="padding:24px;font-family:${SANS};font-size:15px;line-height:1.5;color:${COLORS.white};"><div style="font-weight:700;">${intro}</div>${items ? `<div style="padding-top:10px;line-height:1.8;">${items}</div>` : ''}</td>
</tr></table>`;
}

function newsBlock(post: DigestNews, last: boolean): string {
  const tag = post.tag
    ? `<div style="padding-bottom:14px;"><span style="display:inline-block;background-color:${COLORS.gold};color:${COLORS.ink};font-size:12px;font-weight:800;letter-spacing:2px;padding:6px 12px;">${e(post.tag)}</span></div>`
    : '';
  const rule = last
    ? ''
    : `<div style="margin-top:32px;border-top:2px solid ${COLORS.accent};font-size:0;line-height:0;">&nbsp;</div>`;
  return `
<mj-section background-color="${COLORS.lavender}" padding="0 36px ${last ? '44px' : '32px'}" css-class="pad-x">
  <mj-column>
    <mj-text padding="0">${tag}<div class="news-title" style="font-family:${DISPLAY};font-size:48px;line-height:1;color:${COLORS.ink};text-transform:uppercase;">${e(post.title)}</div>
<div style="padding-top:14px;font-size:16px;line-height:1.6;color:${COLORS.body};">${e(post.summary)}</div>
<div style="padding-top:12px;font-size:14px;font-weight:700;"><a href="${e(post.url)}" style="color:${COLORS.accent};">Read more</a></div>${post.openings.length ? openingsTable(post) : ''}${applyBox(post)}${rule}</mj-text>
  </mj-column>
</mj-section>`;
}

function footer(input: DigestEmailInput, urls: { preferences: string }): string {
  return `
<mj-section background-color="${COLORS.ink}" padding="36px 36px 12px" css-class="pad-x">
  <mj-column width="60%" vertical-align="middle">${logo(input, 44)}</mj-column>
  <mj-column width="40%" vertical-align="middle">
    <mj-text align="right" padding="8px 0 0" font-size="14px" font-weight="700" css-class="left-mobile"><a href="${INSTAGRAM_URL}" style="color:${COLORS.gold};text-decoration:none;">Instagram @smclub_uw</a></mj-text>
  </mj-column>
</mj-section>
<mj-section background-color="${COLORS.ink}" padding="12px 36px 36px" css-class="pad-x">
  <mj-column>
    <mj-text padding="0" font-size="13px" line-height="1.6" color="${COLORS.lavender}">Specialty Masters Club · UW Foster School of Business · Seattle, WA<br />Questions? <a href="mailto:${CONTACT_EMAIL}" style="color:${COLORS.white};">${CONTACT_EMAIL}</a></mj-text>
    <mj-text padding="16px 0 0" font-size="12px" line-height="1.6" color="${COLORS.muted}">You’re getting this because you opted in to SMC news and invitations. <a href="${e(urls.preferences)}" style="color:${COLORS.white};">Manage email preferences</a> · <a href="${PLACEHOLDERS.unsubscribeUrl}" style="color:${COLORS.white};">Unsubscribe</a></mj-text>
  </mj-column>
</mj-section>`;
}

const MOBILE_CSS = `
@media only screen and (max-width: 480px) {
  .pad-x { padding-left: 20px !important; padding-right: 20px !important; }
  .hero-title div { font-size: 58px !important; }
  .hero-copy div { font-size: 15px !important; }
  .h2 div { font-size: 34px !important; }
  .news-title { font-size: 38px !important; }
  .ev-num, .ev-body { display: block !important; width: 100% !important; }
  .ev-num { font-size: 44px !important; padding-bottom: 10px !important; }
  .ev-body { border-top: 0 !important; padding-top: 0 !important; }
  .apply-head, .apply-body { display: block !important; width: auto !important; }
  .apply-head { padding: 22px 20px 0 !important; font-size: 30px !important; }
  .apply-body { padding: 14px 20px 22px !important; }
  .op-num { font-size: 26px !important; width: 36px !important; padding-right: 12px !important; }
  .op-title { font-size: 13px !important; letter-spacing: 0.5px !important; }
  .date-long { display: none !important; }
  .date-short { display: inline !important; }
  .wd-label div { font-size: 11px !important; letter-spacing: 1.4px !important; }
  .op-count { font-size: 11px !important; }
  table.btn-full { width: 100% !important; }
  .left-mobile div { text-align: left !important; }
}`;

function document(
  input: DigestEmailInput,
  urls: { view: string; preferences: string },
  subject: string,
): string {
  const { content } = input;
  const events = content.events.length
    ? sectionHeading('Upcoming events', COLORS.accent, COLORS.gold, COLORS.white, '44px') +
      eventsBlock(content.events)
    : '';
  const news = content.news.length
    ? sectionHeading('Club news', COLORS.ink, COLORS.accent, COLORS.lavender, '44px') +
      content.news.map((p, i) => newsBlock(p, i === content.news.length - 1)).join('')
    : '';

  return `<mjml lang="en">
<mj-head>
  <mj-title>${e(subject)}</mj-title>
  <mj-preview>${e(content.summary)}</mj-preview>
  <mj-font name="Anton" href="https://fonts.googleapis.com/css2?family=Anton&amp;display=swap" />
  <mj-font name="Montserrat" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&amp;display=swap" />
  <mj-breakpoint width="480px" />
  <mj-attributes>
    <mj-all font-family="${SANS}" />
    <mj-section padding="0" />
    <mj-column padding="0" />
    <mj-text padding="0" color="${COLORS.body}" font-size="15px" line-height="1.55" />
  </mj-attributes>
  <mj-raw>
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
  </mj-raw>
  <mj-style>${MOBILE_CSS}</mj-style>
</mj-head>
<mj-body background-color="${COLORS.page}" width="600px">
  <mj-section padding="20px 16px 12px">
    <mj-group>
      <mj-column width="70%"><mj-text padding="0" font-size="12px" line-height="1.4" color="${COLORS.preheader}">News and events for UW Foster Specialty Master’s students</mj-text></mj-column>
      <mj-column width="30%"><mj-text padding="0" align="right" font-size="12px" line-height="1.4"><a href="${e(urls.view)}" style="color:${COLORS.preheader};">View in browser</a></mj-text></mj-column>
    </mj-group>
  </mj-section>
  ${header(input)}
  ${hero(input)}
  ${events}
  ${news}
  ${footer(input, urls)}
  <mj-section padding="0 0 32px"><mj-column><mj-spacer height="1px" /></mj-column></mj-section>
</mj-body>
</mjml>`;
}

// ─── Plain text ────────────────────────────────────────────────────

function textVersion(input: DigestEmailInput, urls: { view: string; preferences: string }): string {
  const { content } = input;
  const lines: string[] = [
    `THIS WEEK AT SMC · ISSUE ${input.issueNumber}`,
    content.dateLabel,
    '',
    `Hi ${PLACEHOLDERS.firstName},`,
    content.summary,
  ];

  if (content.events.length) {
    lines.push('', 'UPCOMING EVENTS', '===============');
    content.events.forEach((ev, i) => {
      lines.push(
        '',
        `${pad2(i + 1)}  ${ev.title}`,
        `    ${ev.summary}`,
        `    When:  ${ev.when}`,
        `    Where: ${ev.location}`,
        ...(ev.seats ? [`    Seats: ${ev.seats}`] : []),
        `    ${ev.action === 'REGISTER' ? 'Register' : 'Join the waitlist'}: ${ev.url}`,
      );
    });
  }

  if (content.news.length) {
    lines.push('', 'CLUB NEWS', '=========');
    for (const post of content.news) {
      lines.push('');
      if (post.tag) lines.push(`[${post.tag}]`);
      lines.push(post.title, post.summary);
      if (post.openings.length) {
        lines.push('', 'Open roles:');
        post.openings.forEach((o, i) =>
          lines.push(
            `  ${pad2(i + 1)}  ${o.title} (${o.openings} ${o.openings === 1 ? 'opening' : 'openings'})`,
          ),
        );
      }
      if (post.applyEmail) {
        lines.push(
          '',
          `How to apply: email ${post.applyEmail}${post.applyChecklist.length ? ' with:' : ''}`,
        );
        for (const item of post.applyChecklist) lines.push(`  - ${item}`);
      }
      lines.push(`Read more: ${post.url}`);
    }
  }

  lines.push(
    '',
    '--',
    'Specialty Masters Club · UW Foster School of Business · Seattle, WA',
    `Questions? ${CONTACT_EMAIL}`,
    `Instagram @smclub_uw: ${INSTAGRAM_URL}`,
    '',
    'You’re getting this because you opted in to SMC news and invitations.',
    `Manage email preferences: ${urls.preferences}`,
    `Unsubscribe: ${PLACEHOLDERS.unsubscribeUrl}`,
    `View in browser: ${urls.view}`,
  );
  return `${lines.join('\n')}\n`;
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Render the weekly digest once per issue. Recipient-specific values stay as Mailgun
 * placeholders (see PLACEHOLDERS); use `personalize` for previews and test sends.
 */
export async function renderDigestEmail(input: DigestEmailInput): Promise<RenderedDigestEmail> {
  const subject = digestSubject(input.content);
  const urls = {
    view: `${input.appBaseUrl}/digest/${input.content.weekKey}`,
    preferences: `${input.appBaseUrl}/me/profile`,
  };
  const { html, errors } = await mjml2html(document(input, urls, subject), {
    validationLevel: 'strict',
  });
  if (errors.length) {
    throw new Error(`MJML errors:\n${errors.map((er) => er.formattedMessage).join('\n')}`);
  }
  return {
    subject,
    preheader: input.content.summary,
    // Drop indentation/newline runs between tags (keeps Gmail under its 102 KB clip limit);
    // single spaces between inline elements are left alone.
    html: html.replace(/>\s*\n\s*</g, '><'),
    text: textVersion(input, urls),
    viewInBrowserUrl: urls.view,
    preferencesUrl: urls.preferences,
  };
}

/** Fill the recipient placeholders (for admin preview, test sends and the browser view). */
export function personalize(
  rendered: Pick<RenderedDigestEmail, 'html' | 'text'>,
  vars: { firstName: string; unsubscribeUrl: string },
): { html: string; text: string } {
  const fill = (s: string, html: boolean) =>
    s
      .split(PLACEHOLDERS.firstNameHtml)
      .join(escapeHtml(vars.firstName))
      .split(PLACEHOLDERS.firstName)
      .join(html ? escapeHtml(vars.firstName) : vars.firstName)
      .split(PLACEHOLDERS.unsubscribeUrl)
      .join(html ? escapeHtml(vars.unsubscribeUrl) : vars.unsubscribeUrl);
  return { html: fill(rendered.html, true), text: fill(rendered.text, false) };
}
