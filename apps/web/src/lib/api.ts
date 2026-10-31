export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  /** Invalid field names on a 400 `invalid_request`. */
  fields?: string[];
}

/** Same-origin JSON call to the Express API through the /api proxy. */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, status: 0, data: null, error: 'request_failed' };
  }
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return {
    ok: res.ok,
    status: res.status,
    data: res.ok ? (json as T) : null,
    error: res.ok ? null : ((json as { error?: string } | null)?.error ?? 'request_failed'),
    fields: res.ok ? undefined : (json as { fields?: string[] } | null)?.fields,
  };
}

export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'MEMBER' | 'ORGANIZER' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE';
  emailVerified: boolean;
  newsOptIn: boolean;
  newsOptInUpdatedAt: string | null;
  emailSuppressedReason: 'UNSUBSCRIBED' | 'COMPLAINED' | 'HARD_BOUNCE' | null;
}

export type Availability =
  | { kind: 'open'; seatsLeft: number | null }
  | { kind: 'waitlist' }
  | { kind: 'full' }
  | {
      kind: 'closed';
      reason: 'not_published' | 'cancelled' | 'completed' | 'started' | 'registration_closed';
    };

export type RegistrationStatus = 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';

export interface EventView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  details: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
  startsAt: string;
  endsAt: string | null;
  when: string;
  location: string;
  capacity: number | null;
  waitlistEnabled: boolean;
  registrationOpen: boolean;
  registrationClosesAt: string | null;
  confirmedCount: number;
  waitlistCount: number;
  seats: string | null;
  availability: Availability;
  myRegistration: RegistrationStatus | null;
  /** Present only for the signed-in member's own confirmed registration. */
  checkIn?: { url: string; checkedInAt: string | null; opensAt: string; closesAt: string } | null;
}

/** Only same-site paths are allowed as post-login destinations. */
export function safeNext(value: string | null | undefined): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

const NEXT_KEY = 'smc:next';

export function rememberNext(path: string | null) {
  try {
    if (path) localStorage.setItem(NEXT_KEY, path);
  } catch {
    /* storage unavailable: fall back to the profile page */
  }
}

export function takeNext(): string | null {
  try {
    const value = localStorage.getItem(NEXT_KEY);
    localStorage.removeItem(NEXT_KEY);
    return safeNext(value);
  } catch {
    return null;
  }
}

export type QuestionKind = 'RATING' | 'TEXT' | 'SINGLE_CHOICE';

export interface SurveyQuestion {
  id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  required: boolean;
  options: string[] | null;
}

export interface NewsView {
  id: string;
  slug: string;
  tag: string | null;
  title: string;
  summary: string;
  body: string | null;
  linkUrl: string | null;
  url: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  applyEmail: string | null;
  applyChecklist: string[] | null;
  openings: { title: string; openings: number }[];
}

export type DigestStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENDING'
  | 'SENT'
  | 'PARTIALLY_FAILED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SKIPPED';

export interface DigestSummaryView {
  id: string;
  weekKey: string;
  status: DigestStatus;
  issueNumber: number | null;
  subject: string | null;
  summaryText: string | null;
  recipientCountPreview: number | null;
  skipReason: string | null;
  approvedAt: string | null;
  completedAt: string | null;
}

export interface DigestScheduleView {
  labels: { draftAt: string; sendNotBefore: string; expiresAt: string };
  newsWindow: { start: string; end: string };
}

export interface DigestDetailView extends DigestSummaryView {
  version: number;
  schedule: DigestScheduleView;
  content: {
    dateLabel: string;
    summary: string;
    events: {
      id: string;
      title: string;
      summary: string;
      when: string;
      location: string;
      seats: string | null;
      action: 'REGISTER' | 'JOIN_WAITLIST';
      url: string;
    }[];
    news: {
      id: string;
      tag: string | null;
      title: string;
      summary: string;
      url: string;
      openings: { title: string; openings: number }[];
    }[];
    omitted: { events: number; news: number };
  } | null;
  recipients: {
    total: number;
    previewTotal: number | null;
    scope: string;
    byDomain: { domain: string; count: number }[];
  };
  approvedBy: { firstName: string; lastName: string } | null;
  rejectedBy: { firstName: string; lastName: string } | null;
  rejectReason: string | null;
  results: {
    deliveries: {
      total: number;
      summary: {
        sent: number;
        delivered: number;
        failed: number;
        optedOut: number;
        skipped: number;
        pending: number;
      };
    };
    batches: {
      batchNo: number;
      status: string;
      recipientCount: number;
      attempts: number;
      nextAttemptAt: string | null;
      lastError: string | null;
    }[];
  };
  canApprove: boolean;
}

export const DIGEST_STATUS_LABEL: Record<DigestStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  SENDING: 'Sending',
  SENT: 'Sent',
  PARTIALLY_FAILED: 'Partially failed',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  SKIPPED: 'Skipped',
};

export interface AuditEntry {
  id: string;
  runId: string;
  at: string;
  actorType: 'SYSTEM' | 'MEMBER' | 'ADMIN' | 'WEBHOOK';
  actor: { id: string; name: string | null } | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  result: 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'DENIED';
  metadata: unknown;
}

export function ptDateTime(iso: string): string {
  return `${new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })} PT`;
}

const FIELD_LABELS: Record<string, string> = {
  email: 'email',
  firstName: 'first name',
  lastName: 'last name',
  newsOptIn: 'news preference',
};

/** What went wrong with a request, in words a member can act on. */
export function describeError(
  res: Pick<ApiResult<unknown>, 'status' | 'error' | 'fields'>,
): string {
  if (res.error === 'too_many_requests')
    return 'Too many attempts. Please wait a few minutes and try again.';
  if (res.error === 'bad_origin') {
    return 'This page was opened from a different address than the site expects. Open the site from its usual address and try again.';
  }
  if (res.error === 'invalid_request' && res.fields?.length) {
    const names = res.fields.map((f) => FIELD_LABELS[f] ?? f).join(', ');
    return `Please check: ${names}.`;
  }
  if (res.status >= 500 || res.error === 'request_failed') {
    return 'The server isn’t responding right now. Please try again in a minute.';
  }
  return 'Something went wrong. Please try again.';
}
