'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NewsStory } from '@/components/NewsStory';
import { api, type NewsView } from '@/lib/api';

export default function NewsPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<NewsView | null | undefined>(undefined);
  useEffect(() => {
    void api<NewsView>(`/news/${slug}`).then((res) => setPost(res.ok ? res.data : null));
  }, [slug]);

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <p>
        <Link href="/news">← All news</Link>
      </p>
      {post === undefined ? (
        <p className="muted">Loading…</p>
      ) : post === null ? (
        <h1 className="display">Post not found</h1>
      ) : (
        <div className="news-list">
          {post.status === 'ARCHIVED' && <p className="notice">This post is archived.</p>}
          <NewsStory post={post} full />
          {post.linkUrl && (
            <p>
              <a href={post.linkUrl} rel="noopener noreferrer">
                Read the full story
              </a>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
