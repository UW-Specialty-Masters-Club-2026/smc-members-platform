import { escapeHtml } from '../escape';

export type AdminNoticeKind =
  'approval_needed' | 'skipped' | 'expired' | 'sent' | 'partially_failed' | 'job_failed';

export interface AdminNoticeInput {
  kind: AdminNoticeKind;
  /** "Monday, October 26, 2026" */
  dateLabel: string;
  /** Link to the digest in the admin workspace. */
  adminUrl: string;
  /** Extra facts: recipient count, skip reason, failure counts… */
  details: string[];
}

const COPY: Record<AdminNoticeKind, { subject: string; lead: string; cta: string }> = {
  approval_needed: {
    subject: 'Weekly digest ready for approval',
    lead: 'This week’s digest is drafted. Review the preview, send yourself a test, and approve it by 6:00 PM PT today — otherwise it expires and nothing is sent.',
    cta: 'REVIEW AND APPROVE',
  },
  skipped: {
    subject: 'Weekly digest skipped this week',
    lead: 'No digest was drafted this week because there was nothing to include.',
    cta: 'OPEN DIGESTS',
  },
  expired: {
    subject: 'Weekly digest expired without approval',
    lead: 'This week’s digest was not approved by 6:00 PM PT, so it expired and was not sent.',
    cta: 'OPEN DIGEST',
  },
  sent: {
    subject: 'Weekly digest sent',
    lead: 'This week’s digest was handed to Mailgun for every recipient.',
    cta: 'VIEW RESULTS',
  },
  job_failed: {
    subject: 'Background job failed',
    lead: 'A background job stopped retrying. Anything it was doing (for example sending a digest batch) has not completed. Check the audit log, fix the cause, then re-run it.',
    cta: 'OPEN AUDIT LOG',
  },
  partially_failed: {
    subject: 'Weekly digest sent with failures',
    lead: 'This week’s digest went out, but some recipients could not be sent to. Review the failures in the admin workspace.',
    cta: 'REVIEW FAILURES',
  },
};

/** Short operational email to admins; plain layout, same brand colors as the digest. */
export function renderAdminNotice(input: AdminNoticeInput) {
  const c = COPY[input.kind];
  const subject = `${c.subject} · ${input.dateLabel}`;
  const details = input.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('');
  const label = input.kind === 'job_failed' ? 'SMC ADMIN · SYSTEM' : 'SMC ADMIN · WEEKLY DIGEST';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 16px;background:#EFE7FA;font-family:Montserrat,'Helvetica Neue',Arial,sans-serif;color:#2D0A68;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;">
<tr><td style="background:#2D0A68;padding:18px 24px;color:#F3D35C;font-size:12px;font-weight:800;letter-spacing:2px;">${label}</td></tr>
<tr><td style="padding:24px;">
<h1 style="margin:0 0 8px;font-size:20px;">${escapeHtml(c.subject)}</h1>
<p style="margin:0 0 12px;font-size:14px;color:#3E2C66;">${escapeHtml(input.dateLabel)}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3E2C66;">${escapeHtml(c.lead)}</p>
${details ? `<ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.7;color:#3E2C66;">${details}</ul>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7E41E6" style="background:#7E41E6;"><a href="${escapeHtml(input.adminUrl)}" style="display:inline-block;padding:14px 24px;color:#FFFFFF;font-size:13px;font-weight:800;letter-spacing:1.4px;text-decoration:none;">${c.cta}</a></td></tr></table>
</td></tr></table></body></html>`;
  const text = [
    c.subject,
    input.dateLabel,
    '',
    c.lead,
    ...(input.details.length ? ['', ...input.details.map((d) => `- ${d}`)] : []),
    '',
    `${c.cta}: ${input.adminUrl}`,
  ].join('\n');
  return { subject, html, text };
}
