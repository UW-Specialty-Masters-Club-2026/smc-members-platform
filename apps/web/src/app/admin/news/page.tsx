'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type NewsView } from '@/lib/api';

export default function AdminNewsPage() {
  const router = useRouter();
  const [news, setNews] = useState<NewsView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ news: NewsView[] }>('/admin/news').then((res) => {
      if (res.status === 401) return router.replace('/login');
      if (res.status === 403) return setError('Only admins and organizers can manage news.');
      setNews(res.data?.news ?? []);
    });
  }, [router]);

  return (
    <main className="page">
      <h1 className="display">News</h1>
      {error ? (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      ) : (
        <>
          <div className="toolbar">
            <p className="muted" style={{ margin: 0 }}>
              Posts published between one Monday 8:00 AM PT and the next go into that Monday’s
              digest.
            </p>
            <Link className="btn" href="/admin/news/new">
              New post
            </Link>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Tag</th>
                  <th scope="col">Status</th>
                  <th scope="col">Published (PT)</th>
                </tr>
              </thead>
              <tbody>
                {(news ?? []).map((n) => (
                  <tr key={n.id}>
                    <td>
                      <Link href={`/admin/news/${n.id}`}>{n.title}</Link>
                    </td>
                    <td>{n.tag ?? '—'}</td>
                    <td>{n.status.toLowerCase()}</td>
                    <td>
                      {n.publishedAt
                        ? new Date(n.publishedAt).toLocaleString('en-US', {
                            timeZone: 'America/Los_Angeles',
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {news?.length === 0 && <p className="muted">No posts yet.</p>}
        </>
      )}
    </main>
  );
}
