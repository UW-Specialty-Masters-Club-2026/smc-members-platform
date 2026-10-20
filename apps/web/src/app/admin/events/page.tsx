'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type EventView } from '@/lib/api';

const STATUSES = ['', 'DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'] as const;

export default function AdminEventsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>('');
  const [events, setEvents] = useState<EventView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ events: EventView[] }>(`/admin/events${status ? `?status=${status}` : ''}`).then(
      (res) => {
        if (res.status === 401) return router.replace('/login');
        if (res.status === 403) return setError('Only admins and organizers can manage events.');
        setEvents(res.data?.events ?? []);
      },
    );
  }, [status, router]);

  return (
    <main className="page">
      <h1 className="display">Events</h1>
      {error ? (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="sr-only">Filter by status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All statuses'}
                  </option>
                ))}
              </select>
            </label>
            <Link className="btn" href="/admin/events/new">
              New event
            </Link>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">When (PT)</th>
                  <th scope="col">Status</th>
                  <th scope="col">Registered</th>
                  <th scope="col">Waitlist</th>
                </tr>
              </thead>
              <tbody>
                {(events ?? []).map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/admin/events/${e.id}`}>{e.title}</Link>
                    </td>
                    <td>{e.when}</td>
                    <td>{e.status.toLowerCase()}</td>
                    <td>
                      {e.confirmedCount}
                      {e.capacity !== null && ` / ${e.capacity}`}
                    </td>
                    <td>{e.waitlistCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {events?.length === 0 && <p className="muted">No events yet.</p>}
        </>
      )}
    </main>
  );
}
