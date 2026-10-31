import type { Metadata } from 'next';
import type { Newsletter } from '@/content';
import { getContent } from '@/lib/server-api';
import { NewsletterList } from './NewsletterList';

export const metadata: Metadata = { title: 'Newsletters · Specialty Masters Club' };
export const dynamic = 'force-dynamic';

export default async function NewslettersPage() {
  const items = (await getContent<{ items: Newsletter[] }>('/newsletters'))?.items ?? [];
  return (
    <main className="page">
      <h1 className="display">SMC Newsletters</h1>
      <p className="muted lead">
        Stay updated with the latest news, insights, and stories from the Specialty Masters Club
        community.
      </p>
      <NewsletterList newsletters={items} />
    </main>
  );
}
