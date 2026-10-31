'use client';

import { ResourceManager } from '../ResourceManager';

interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  author: string;
  imageUrl: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
}

const STATUS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];
const BADGE = { DRAFT: 'ax-badge--warn', PUBLISHED: 'ax-badge--success', ARCHIVED: '' };

export default function AdminArticlesPage() {
  return (
    <ResourceManager<ArticleRow & Record<string, unknown>>
      title="Articles"
      description="Long-form stories and opinions on the Articles page. Write in Markdown."
      endpoint="/admin/content/articles"
      singular="Article"
      publicUrl={(a) => (a.status === 'DRAFT' ? null : `/articles/${a.slug}`)}
      defaults={{ status: 'DRAFT', category: 'Opinion', body: '' }}
      columns={[
        {
          label: 'Article',
          render: (a) => (
            <div className="ax-cell-main">
              {a.imageUrl ? <img src={a.imageUrl} alt="" /> : null}
              <span>
                <strong>{a.title}</strong>
                <small>{a.author}</small>
              </span>
            </div>
          ),
        },
        {
          label: 'Category',
          render: (a) => <span className="ax-badge ax-badge--primary">{a.category}</span>,
        },
        { label: 'Published', render: (a) => a.publishedAt ?? '—' },
        {
          label: 'Status',
          render: (a) => (
            <span className={`ax-badge ${BADGE[a.status]}`}>{a.status.toLowerCase()}</span>
          ),
        },
      ]}
      fields={[
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'subtitle', label: 'Subtitle', type: 'textarea', required: true },
        {
          name: 'category',
          label: 'Category',
          type: 'text',
          required: true,
          row: 'a',
          help: 'e.g. Competition, Career, Opinion',
        },
        { name: 'author', label: 'Author(s)', type: 'text', required: true, row: 'a' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS, row: 'b' },
        { name: 'publishedAt', label: 'Publish date', type: 'date', row: 'b' },
        {
          name: 'slug',
          label: 'Web address',
          type: 'text',
          help: 'Leave empty to create it from the title.',
        },
        { name: 'imageUrl', label: 'Cover image', type: 'image' },
        { name: 'imageAlt', label: 'Cover image description', type: 'text' },
        {
          name: 'body',
          label: 'Body (Markdown)',
          type: 'markdown',
          help: '## Heading · **bold** · *italic* · [link](https://…) · ![image](/api/uploads/…) · > quote · - list',
        },
      ]}
    />
  );
}
