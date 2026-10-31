'use client';

import { ResourceManager } from '../ResourceManager';

interface NewsletterRow {
  id: string;
  slug: string;
  volume: string;
  title: string;
  issuedAt: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export default function AdminNewslettersPage() {
  return (
    <ResourceManager<NewsletterRow & Record<string, unknown>>
      title="Newsletters"
      description="Newsletter editions (PDF) listed on the Newsletter page."
      endpoint="/admin/content/newsletters"
      singular="Newsletter"
      publicUrl={(n) => (n.status === 'PUBLISHED' ? `/newsletters/${n.slug}` : null)}
      defaults={{ status: 'PUBLISHED', title: 'Specialty Masters Club Newsletter', highlights: [] }}
      columns={[
        { label: 'Edition', render: (n) => <strong>{n.volume}</strong> },
        { label: 'Title', render: (n) => n.title },
        { label: 'Date', render: (n) => n.issuedAt },
        {
          label: 'Status',
          render: (n) => (
            <span
              className={`ax-badge ${n.status === 'PUBLISHED' ? 'ax-badge--success' : 'ax-badge--warn'}`}
            >
              {n.status.toLowerCase()}
            </span>
          ),
        },
      ]}
      fields={[
        {
          name: 'volume',
          label: 'Edition',
          type: 'text',
          required: true,
          row: 'a',
          help: 'e.g. Vol. 4',
        },
        { name: 'issuedAt', label: 'Date', type: 'date', required: true, row: 'a' },
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'summary', label: 'Summary', type: 'textarea', required: true },
        { name: 'highlights', label: 'Inside this issue (one per line)', type: 'lines' },
        { name: 'pdfUrl', label: 'PDF link', type: 'link', required: true },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'PUBLISHED', label: 'Published' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'ARCHIVED', label: 'Archived' },
          ],
        },
        {
          name: 'slug',
          label: 'Web address',
          type: 'text',
          help: 'Leave empty to create it from the edition.',
        },
      ]}
    />
  );
}
