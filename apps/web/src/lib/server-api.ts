import type { SiteSettings } from '@/content';

const API = process.env.API_BASE_URL ?? 'http://localhost:4000';

/** Server components only: read public content from the API; null if it isn't available. */
export async function getContent<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}/content${path}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function getSettings(): Promise<SiteSettings> {
  return (await getContent<SiteSettings>('/site')) ?? {};
}
