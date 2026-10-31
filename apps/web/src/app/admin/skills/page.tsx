'use client';

import { ResourceManager } from '../ResourceManager';

interface SkillRow {
  id: string;
  group: 'CAREER' | 'STARTER' | 'BUILT_IN';
  name: string;
  description: string;
  sortOrder: number;
  isPublished: boolean;
}

const GROUPS = [
  { value: 'CAREER', label: 'Career skills (made by SMC)' },
  { value: 'STARTER', label: 'Starter picks from Anthropic' },
  { value: 'BUILT_IN', label: 'Already in Claude' },
];

export default function AdminSkillsPage() {
  return (
    <ResourceManager<SkillRow & Record<string, unknown>>
      title="Skills library"
      description="Claude skills listed on the Skills page."
      endpoint="/admin/content/skills"
      singular="Skill"
      publicUrl={() => '/skills'}
      defaults={{ group: 'CAREER', isPublished: true, sortOrder: 100 }}
      columns={[
        {
          label: 'Skill',
          render: (s) => (
            <span>
              <strong>{s.name}</strong>
              <br />
              <small className="ax-muted">{s.description}</small>
            </span>
          ),
        },
        {
          label: 'Group',
          render: (s) => (
            <span className="ax-badge">{GROUPS.find((g) => g.value === s.group)?.label}</span>
          ),
        },
        { label: 'Order', render: (s) => s.sortOrder },
        {
          label: 'Status',
          render: (s) => (
            <span className={`ax-badge ${s.isPublished ? 'ax-badge--success' : ''}`}>
              {s.isPublished ? 'Shown' : 'Hidden'}
            </span>
          ),
        },
      ]}
      fields={[
        { name: 'name', label: 'Name', type: 'text', required: true, row: 'a' },
        { name: 'group', label: 'Group', type: 'select', options: GROUPS, row: 'a' },
        { name: 'description', label: 'Description', type: 'textarea', required: true },
        { name: 'prompt', label: '“Try it” prompt', type: 'text' },
        { name: 'downloadUrl', label: 'ZIP download link', type: 'link', row: 'b' },
        { name: 'linkUrl', label: 'More info link', type: 'link', row: 'b' },
        { name: 'sortOrder', label: 'Order', type: 'number', row: 'c' },
        { name: 'isPublished', label: 'Show on the website', type: 'toggle' },
      ]}
    />
  );
}
