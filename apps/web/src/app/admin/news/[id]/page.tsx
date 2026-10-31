'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AdminDelete } from '@/components/AdminDelete';
import { NewsForm } from '@/components/NewsForm';
import { api, type NewsView } from '@/lib/api';

type Action = 'publish' | 'archive';

export default function AdminNewsPostPage() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<NewsView | null>(null);
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<NewsView>(`/admin/news/${id}`);
    setPost(res.data);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: Action) {
    setConfirming(null);
    const res = await api<NewsView>(`/admin/news/${id}/${action}`, { method: 'POST' });
    if (res.ok && res.data) {
      setPost(res.data);
      setMessage(action === 'publish' ? 'Published.' : 'Archived.');
    } else {
      setMessage('That change isn’t possible for this post.');
    }
  }

  if (!post) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const actions: Action[] =
    post.status === 'DRAFT'
      ? ['publish', 'archive']
      : post.status === 'PUBLISHED'
        ? ['archive']
        : [];

  return (
    <main className="page">
      <p>
        <Link href="/admin/news">← All news</Link>
      </p>
      <h1 className="display" style={{ fontSize: 40 }}>
        {post.title}
      </h1>
      <p>
        <span className="tag">{post.status}</span>{' '}
        {post.status !== 'DRAFT' && <Link href={`/news/${post.slug}`}>View public page</Link>}
      </p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {actions.length > 0 && (
        <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
          {confirming ? (
            <>
              <span style={{ fontWeight: 600 }}>
                {confirming === 'publish'
                  ? 'Publish now? It will appear in next Monday’s digest.'
                  : 'Archive this post? It disappears from the news list.'}
              </span>
              <button className="btn" type="button" onClick={() => void run(confirming)}>
                Yes, {confirming}
              </button>
              <button
                className="btn btn--outline"
                type="button"
                onClick={() => setConfirming(null)}
              >
                Keep as is
              </button>
            </>
          ) : (
            actions.map((a) => (
              <button
                key={a}
                className={a === 'publish' ? 'btn' : 'btn btn--outline'}
                type="button"
                onClick={() => setConfirming(a)}
              >
                {a === 'publish' ? 'Publish' : 'Archive'}
              </button>
            ))
          )}
        </div>
      )}
      <NewsForm
        key={post.id + post.status}
        initial={post}
        disabled={post.status === 'ARCHIVED'}
        submitLabel="Save changes"
        onSubmit={async (body) => {
          const res = await api<NewsView>(`/admin/news/${id}`, { method: 'PATCH', body });
          if (res.ok && res.data) {
            setPost(res.data);
            setMessage('Saved.');
          }
          return res;
        }}
      />
      <AdminDelete
        endpoint={`/admin/news/${post.id}`}
        what="post"
        warning="Removes the post from the website. Digests that already went out keep their copy. To hide it but keep the record, archive it instead."
        backTo="/admin/news"
      />
    </main>
  );
}
