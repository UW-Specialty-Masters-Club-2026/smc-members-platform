'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EventForm } from '@/components/EventForm';
import { api, type EventView, type RegistrationStatus } from '@/lib/api';

interface RosterRow {
  id: string;
  status: RegistrationStatus;
  registeredAt: string;
  member: { firstName: string; lastName: string; email: string };
  checkedInAt: string | null;
  checkInMethod: 'QR' | 'MANUAL' | null;
}

const CHECKIN_ERRORS: Record<string, string> = {
  outside_checkin_window: 'Check-in opens 2 hours before the event and closes 3 hours after it.',
  not_confirmed: 'Only confirmed registrations can be checked in.',
  event_not_active: 'This event isn’t active.',
};

type Action = 'publish' | 'cancel' | 'complete';

const ACTION_LABEL: Record<Action, string> = {
  publish: 'Publish',
  cancel: 'Cancel event',
  complete: 'Mark completed',
};

export default function AdminEventPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventView | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ev, regs] = await Promise.all([
      api<EventView>(`/admin/events/${id}`),
      api<{ registrations: RosterRow[] }>(`/admin/events/${id}/registrations`),
    ]);
    setEvent(ev.data);
    setRoster(regs.data?.registrations ?? []);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: Action) {
    setConfirming(null);
    const res = await api<EventView>(`/admin/events/${id}/${action}`, { method: 'POST' });
    if (res.ok && res.data) {
      setEvent(res.data);
      setMessage(`Event ${res.data.status.toLowerCase()}.`);
    } else {
      setMessage(
        res.error === 'event_in_past'
          ? 'Events in the past can’t be published.'
          : 'That change isn’t possible for this event.',
      );
    }
  }

  async function toggleCheckIn(r: RosterRow) {
    const res = await api(`/admin/events/${id}/registrations/${r.id}/checkin`, {
      method: r.checkedInAt ? 'DELETE' : 'POST',
    });
    if (!res.ok) setMessage(CHECKIN_ERRORS[res.error ?? ''] ?? 'Check-in update failed.');
    await load();
  }

  if (!event) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const actions: Action[] =
    event.status === 'DRAFT'
      ? ['publish', 'cancel']
      : event.status === 'PUBLISHED'
        ? ['complete', 'cancel']
        : [];
  const locked = event.status === 'CANCELLED' || event.status === 'COMPLETED';

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <p>
        <Link href="/admin/events">← All events</Link>
      </p>
      <h1 className="display" style={{ fontSize: 40 }}>
        {event.title}
      </h1>
      <p>
        <span className="tag">{event.status}</span>{' '}
        {event.status !== 'DRAFT' && <Link href={`/events/${event.slug}`}>View public page</Link>}
        {' · '}
        <Link href={`/admin/events/${event.id}/survey`}>Feedback survey</Link>
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
                {ACTION_LABEL[confirming]}? {confirming === 'cancel' && 'This can’t be undone.'}
              </span>
              <button className="btn" type="button" onClick={() => void run(confirming)}>
                Yes, {ACTION_LABEL[confirming].toLowerCase()}
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
                {ACTION_LABEL[a]}
              </button>
            ))
          )}
        </div>
      )}

      <EventForm
        key={event.id + event.status}
        initial={event}
        disabled={locked}
        submitLabel="Save changes"
        onSubmit={async (body) => {
          const res = await api<EventView>(`/admin/events/${id}`, { method: 'PATCH', body });
          if (res.ok && res.data) {
            setEvent(res.data);
            setMessage('Saved.');
            void load();
          }
          return res;
        }}
      />

      <h2 style={{ marginTop: 32 }}>
        Registrations · {event.confirmedCount} confirmed
        {event.capacity !== null && ` of ${event.capacity}`} · {event.waitlistCount} waitlisted ·{' '}
        {roster.filter((r) => r.checkedInAt).length} checked in
      </h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Status</th>
              <th scope="col">Registered</th>
              <th scope="col">Check-in</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.member.firstName} {r.member.lastName}
                </td>
                <td>{r.member.email}</td>
                <td>{r.status.toLowerCase()}</td>
                <td>
                  {new Date(r.registeredAt).toLocaleString('en-US', {
                    timeZone: 'America/Los_Angeles',
                  })}{' '}
                  PT
                </td>
                <td>
                  {r.status === 'CONFIRMED' && (
                    <button
                      type="button"
                      className="btn btn--outline btn--small"
                      onClick={() => void toggleCheckIn(r)}
                      aria-label={`${r.checkedInAt ? 'Undo check-in for' : 'Check in'} ${r.member.firstName} ${r.member.lastName}`}
                    >
                      {r.checkedInAt
                        ? `✓ ${r.checkInMethod === 'QR' ? 'QR' : 'Manual'} · Undo`
                        : 'Check in'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {roster.length === 0 && <p className="muted">No registrations yet.</p>}
    </main>
  );
}
