'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { NewsStory } from '@/components/NewsStory';
import { api, type NewsView } from '@/lib/api';

export default function NewsPage() {
  const [news, setNews] = useState<NewsView[] | null>(null);
  useEffect(() => {
    void api<{ news: NewsView[] }>('/news').then((res) => setNews(res.data?.news ?? []));
  }, []);

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <h1 className="display">Club news</h1>
      {news === null ? (
        <p className="muted">Loading…</p>
      ) : news.length === 0 ? (
        <p className="muted">No news yet.</p>
      ) : (
        <div className="news-list">
          {news.map((n) => (
            <div key={n.id}>
              <NewsStory post={n} />
              <p>
                <Link href={`/news/${n.slug}`}>Read more</Link>
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
