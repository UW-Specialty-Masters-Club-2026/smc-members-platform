'use client';

import { TEAM_FILTERS } from '@/content';
import { ResourceManager } from '../ResourceManager';

interface TeamRow {
  id: string;
  name: string;
  role: string;
  major: string | null;
  departments: string[];
  imageUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
}

const DEPTS = TEAM_FILTERS.filter((f) => f.key).map((f) => ({ value: f.key!, label: f.label }));

export default function AdminTeamPage() {
  return (
    <ResourceManager<TeamRow & Record<string, unknown>>
      title="Team"
      description="People shown on the Team page. Lower order numbers appear first."
      endpoint="/admin/content/team"
      singular="Team member"
      publicUrl={() => '/team'}
      defaults={{ departments: [], isPublished: true, sortOrder: 100 }}
      columns={[
        {
          label: 'Name',
          render: (t) => (
            <div className="ax-cell-main">
              {t.imageUrl ? <img src={t.imageUrl} alt="" /> : null}
              <span>
                <strong>{t.name}</strong>
                <small>{t.major}</small>
              </span>
            </div>
          ),
        },
        { label: 'Role', render: (t) => t.role },
        {
          label: 'Teams',
          render: (t) =>
            t.departments.map((d) => (
              <span key={d} className="ax-badge" style={{ marginRight: 4 }}>
                {DEPTS.find((x) => x.value === d)?.label ?? d}
              </span>
            )),
        },
        { label: 'Order', render: (t) => t.sortOrder },
        {
          label: 'Status',
          render: (t) => (
            <span className={`ax-badge ${t.isPublished ? 'ax-badge--success' : ''}`}>
              {t.isPublished ? 'Shown' : 'Hidden'}
            </span>
          ),
        },
      ]}
      fields={[
        { name: 'name', label: 'Name', type: 'text', required: true, row: 'a' },
        { name: 'role', label: 'Role', type: 'text', required: true, row: 'a' },
        { name: 'major', label: 'Program / major', type: 'text', row: 'b' },
        { name: 'sortOrder', label: 'Order', type: 'number', row: 'b' },
        {
          name: 'departments',
          label: 'Teams',
          type: 'checks',
          options: DEPTS,
          help: 'Used by the filters on the Team page.',
        },
        { name: 'imageUrl', label: 'Photo', type: 'image' },
        { name: 'linkedinUrl', label: 'LinkedIn', type: 'link', row: 'c' },
        { name: 'websiteUrl', label: 'Website', type: 'link', row: 'c' },
        { name: 'isPublished', label: 'Show on the website', type: 'toggle' },
      ]}
    />
  );
}
