'use client';

import { useRouter } from 'next/navigation';
import { NewsForm } from '@/components/NewsForm';
import { api, type NewsView } from '@/lib/api';

export default function NewNewsPage() {
  const router = useRouter();
  return (
    <main className="page">
      <h1 className="display">New post</h1>
      <p className="muted">New posts start as drafts. Members see them once you publish.</p>
      <NewsForm
        submitLabel="Save draft"
        onSubmit={async (body) => {
          const res = await api<NewsView>('/admin/news', { method: 'POST', body });
          if (res.ok && res.data) router.push(`/admin/news/${res.data.id}`);
          return res;
        }}
      />
    </main>
  );
}
