'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, rememberNext } from '@/lib/api';

interface Lookup {
  member: { firstName: string; lastName: string };
  event: { title: string; when: string };
  registrationStatus: 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED';
  checkedInAt: string | null;
}

const ERRORS: Record<string, string> = {
  invalid_code: 'This code isn’t valid.',
  not_confirmed: 'This registration isn’t confirmed (waitlisted or cancelled).',
  outside_checkin_window: 'Check-in is only open from 2 hours before to 3 hours after the event.',
  event_not_active: 'This event isn’t active (cancelled or not published).',
};

/**
 * Opened on an organizer's phone when they scan a member's QR with the camera app.
 * Members who open their own code are told to show it to an organizer instead.
 */
export default function CheckInPage() {
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'signin' }
    | { kind: 'not_staff' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; info: Lookup }
    | { kind: 'done'; info: Lookup; already: boolean }
  >({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = /(?:^#|&)code=([A-Za-z0-9_.-]+)/.exec(window.location.hash)?.[1] ?? null;
    setCode(value);
    if (!value) {
      setState({ kind: 'error', message: 'No check-in code in this link.' });
      return;
    }
    void api<Lookup>('/staff/checkin/lookup', { method: 'POST', body: { code: value } }).then(
      (res) => {
        if (res.status === 401) setState({ kind: 'signin' });
        else if (res.status === 403) setState({ kind: 'not_staff' });
        else if (!res.ok || !res.data)
          setState({ kind: 'error', message: ERRORS[res.error ?? ''] ?? 'Lookup failed.' });
        else setState({ kind: 'ready', info: res.data });
      },
    );
  }, []);

  async function confirm(info: Lookup) {
    if (!code) return;
    setBusy(true);
    const res = await api<{ alreadyCheckedIn: boolean }>('/staff/checkin', {
      method: 'POST',
      body: { code },
    });
    setBusy(false);
    if (res.ok && res.data) setState({ kind: 'done', info, already: res.data.alreadyCheckedIn });
    else setState({ kind: 'error', message: ERRORS[res.error ?? ''] ?? 'Check-in failed.' });
  }

  return (
    <main className="page page--narrow">
      <h1 className="display">Check-in</h1>
      <div className="card">
        {state.kind === 'loading' && <p className="muted">Looking up code…</p>}
        {state.kind === 'signin' && (
          <>
            <p className="muted">Organizers: sign in to check members in.</p>
            <Link
              className="btn"
              href="/login"
              onClick={() => rememberNext(`/checkin${window.location.hash}`)}
            >
              Sign in
            </Link>
          </>
        )}
        {state.kind === 'not_staff' && (
          <p className="muted" style={{ margin: 0 }}>
            This is your check-in code. Show the QR on your event page to an SMC organizer at the
            door.
          </p>
        )}
        {state.kind === 'error' && (
          <div className="notice notice--error" role="alert" style={{ marginBottom: 0 }}>
            {state.message}
          </div>
        )}
        {(state.kind === 'ready' || state.kind === 'done') && (
          <>
            <p style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>
              {state.info.member.firstName} {state.info.member.lastName}
            </p>
            <p className="muted" style={{ marginTop: 0 }}>
              {state.info.event.title} · {state.info.event.when}
            </p>
            {state.kind === 'done' ? (
              <div className="notice" role="status" style={{ marginBottom: 0 }}>
                {state.already ? 'Already checked in.' : 'Checked in ✓'}
              </div>
            ) : state.info.checkedInAt ? (
              <div className="notice" role="status" style={{ marginBottom: 0 }}>
                Already checked in.
              </div>
            ) : state.info.registrationStatus !== 'CONFIRMED' ? (
              <div className="notice notice--error" role="alert" style={{ marginBottom: 0 }}>
                {ERRORS.not_confirmed}
              </div>
            ) : (
              <button
                className="btn"
                type="button"
                style={{ width: '100%' }}
                disabled={busy}
                onClick={() => void confirm(state.info)}
              >
                {busy ? 'Checking in…' : 'Check in'}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
