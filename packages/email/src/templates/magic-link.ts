import { escapeHtml } from '../escape';

export interface MagicLinkEmailInput {
  firstName: string;
  url: string;
  purpose: 'SIGNUP' | 'LOGIN';
  expiresInMinutes: number;
}

const INK = '#2D0A68';
const ACCENT = '#7E41E6';
const PAGE = '#EFE7FA';
const BODY = '#3E2C66';
const FONT = "Montserrat, 'Helvetica Neue', Arial, sans-serif";

/** Transactional sign-in email: table layout, inline styles, plain-text twin. */
export function renderMagicLinkEmail(input: MagicLinkEmailInput) {
  const isSignup = input.purpose === 'SIGNUP';
  const subject = isSignup
    ? 'Confirm your email for Specialty Masters Club'
    : 'Your Specialty Masters Club sign-in link';
  const heading = isSignup ? 'Confirm your email' : 'Sign in to SMC';
  const lead = isSignup
    ? 'Thanks for joining the Specialty Masters Club. Confirm your email to finish signing up.'
    : 'Use the button below to sign in.';
  const cta = isSignup ? 'CONFIRM EMAIL' : 'SIGN IN';
  const note = `This link works once and expires in ${input.expiresInMinutes} minutes. If you didn't request it, you can ignore this email.`;
  const name = escapeHtml(input.firstName);
  const url = escapeHtml(input.url);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${PAGE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;">
<tr><td style="background:${INK};padding:20px 28px;font-family:${FONT};font-size:13px;font-weight:800;letter-spacing:2px;color:#F3D35C;">SPECIALTY MASTERS CLUB</td></tr>
<tr><td style="padding:32px 28px 8px;font-family:${FONT};color:${INK};">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">${heading}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BODY};">Hi ${name},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BODY};">${lead}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${ACCENT};">
<a href="${url}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:14px;font-weight:800;letter-spacing:1.4px;color:#FFFFFF;text-decoration:none;">${cta}</a>
</td></tr></table>
<p style="margin:24px 0 8px;font-size:13px;line-height:1.6;color:${BODY};">${escapeHtml(note)}</p>
<p style="margin:0 0 28px;font-size:12px;line-height:1.6;color:${BODY};word-break:break-all;">Or paste this link into your browser:<br>${url}</p>
</td></tr>
<tr><td style="background:${INK};padding:20px 28px;font-family:${FONT};font-size:12px;line-height:1.6;color:#F8E6FE;">Specialty Masters Club · UW Foster School of Business · Seattle, WA<br>Questions? <a href="mailto:smcommittee@uw.edu" style="color:#FFFFFF;">smcommittee@uw.edu</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    heading,
    '',
    `Hi ${input.firstName},`,
    '',
    lead,
    '',
    `${cta}: ${input.url}`,
    '',
    note,
    '',
    '--',
    'Specialty Masters Club · UW Foster School of Business · Seattle, WA',
    'Questions? smcommittee@uw.edu',
  ].join('\n');

  return { subject, html, text };
}
