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
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
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
