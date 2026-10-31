'use client';

import type { Profile } from '@/lib/api';
import { ResourceManager } from '../ResourceManager';

const ROLES = [
  { value: 'MEMBER', label: 'Member' },
  { value: 'ORGANIZER', label: 'Organizer' },
  { value: 'ADMIN', label: 'Admin' },
];

function newsLabel(m: Profile) {
  if (m.newsOptIn) return <span className="ax-badge ax-badge--success">On</span>;
  if (m.emailSuppressedReason)
    return (
      <span className="ax-badge ax-badge--danger">
        Off · {m.emailSuppressedReason.toLowerCase().replace('_', ' ')}
      </span>
    );
  return <span className="ax-badge">Off</span>;
}

export default function AdminMembersPage() {
  return (
    <ResourceManager<Profile & Record<string, unknown>>
      title="Members"
      description="Everyone with an SMC account. Deleting removes their registrations too; set a member to Inactive to keep their history."
      endpoint="/admin/members"
      listKey="members"
      singular="Member"
      defaults={{ role: 'MEMBER' }}
      columns={[
        {
          label: 'Member',
          render: (m) => (
            <div className="ax-cell-main">
              <span className="ax-avatar" aria-hidden="true">
                {m.firstName.charAt(0)}
                {m.lastName.charAt(0)}
              </span>
              <span>
                <strong>
                  {m.firstName} {m.lastName}
                </strong>
                <small>{m.email}</small>
              </span>
            </div>
          ),
        },
        {
          label: 'Role',
          render: (m) => (
            <span className={`ax-badge ${m.role === 'MEMBER' ? '' : 'ax-badge--primary'}`}>
              {m.role.toLowerCase()}
            </span>
          ),
        },
        {
          label: 'Verified',
          render: (m) =>
            m.emailVerified ? 'Yes' : <span className="ax-badge ax-badge--warn">Not yet</span>,
        },
        { label: 'Weekly digest', render: newsLabel },
        {
          label: 'Status',
          render: (m) => (
            <span className={`ax-badge ${m.status === 'ACTIVE' ? 'ax-badge--success' : ''}`}>
              {m.status.toLowerCase()}
            </span>
          ),
        },
      ]}
      fields={[
        { name: 'firstName', label: 'First name', type: 'text', required: true, row: 'a' },
        { name: 'lastName', label: 'Last name', type: 'text', required: true, row: 'a' },
        {
          name: 'email',
          label: 'Email',
          type: 'text',
          required: true,
          help: 'Changing it means the member confirms the new address the next time they sign in.',
        },
        { name: 'role', label: 'Role', type: 'select', options: ROLES, row: 'b' },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          editOnly: true,
          row: 'b',
          options: [
            { value: 'ACTIVE', label: 'Active' },
            { value: 'INACTIVE', label: 'Inactive (signed out, no emails)' },
          ],
        },
        {
          name: 'newsOptIn',
          label: 'Gets news and the weekly digest',
          type: 'toggle',
          editOnly: true,
        },
      ]}
    />
  );
}
