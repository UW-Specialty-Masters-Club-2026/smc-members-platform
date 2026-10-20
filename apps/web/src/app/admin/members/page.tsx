'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Profile } from '@/lib/api';

interface MemberPage {
  members: Profile[];
  nextCursor: string | null;
}

export default function AdminMembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Profile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string, cursor?: string) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (cursor) params.set('cursor', cursor);
      const res = await api<MemberPage>(`/admin/members?${params}`);
      if (res.status === 401) return router.replace('/login');
      if (res.status === 403) return setError('Only admins can manage members.');
      if (!res.data) return setError('Could not load members.');
      setMembers((prev) => (cursor ? [...prev, ...res.data!.members] : res.data!.members));
      setNextCursor(res.data.nextCursor);
    },
    [router],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  async function update(id: string, change: Partial<Pick<Profile, 'role' | 'status'>>) {
    setError(null);
    const res = await api<Profile>(`/admin/members/${id}`, { method: 'PATCH', body: change });
    if (res.ok && res.data) {
      setMembers((prev) => prev.map((m) => (m.id === id ? res.data! : m)));
    } else {
      setError(
        res.error === 'cannot_modify_self'
          ? 'You can’t change your own role or status.'
          : 'Update failed.',
      );
    }
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load(query.trim());
  }

  return (
    <main className="page">
      <h1 className="display">Members</h1>
      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}
      <form
        onSubmit={onSearch}
        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}
      >
        <label className="field" style={{ flex: '1 1 240px', marginBottom: 0 }}>
          <span className="sr-only">Search members</span>
          <input
            type="search"
            placeholder="Search by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Verified</th>
              <th scope="col">News</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.firstName} {m.lastName}
                </td>
                <td>{m.email}</td>
                <td>{m.emailVerified ? 'Yes' : 'No'}</td>
                <td>{newsLabel(m)}</td>
                <td>
                  <select
                    aria-label={`Role for ${m.firstName} ${m.lastName}`}
                    value={m.role}
                    onChange={(e) => void update(m.id, { role: e.target.value as Profile['role'] })}
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ORGANIZER">Organizer</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td>
                  <select
                    aria-label={`Status for ${m.firstName} ${m.lastName}`}
                    value={m.status}
                    onChange={(e) =>
                      void update(m.id, { status: e.target.value as Profile['status'] })
                    }
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && (
        <p>
          <button
            className="btn btn--outline"
            type="button"
            onClick={() => void load(query.trim(), nextCursor)}
          >
            Load more
          </button>
        </p>
      )}
    </main>
  );
}

function newsLabel(m: Profile): string {
  if (m.newsOptIn) return 'On';
  if (m.emailSuppressedReason)
    return `Off (${m.emailSuppressedReason.toLowerCase().replace('_', ' ')})`;
  return 'Off';
}
