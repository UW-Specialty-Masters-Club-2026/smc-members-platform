export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
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
