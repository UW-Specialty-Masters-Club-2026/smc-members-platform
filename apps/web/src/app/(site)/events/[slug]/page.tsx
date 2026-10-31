'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CheckInCode } from '@/components/CheckInCode';
import { CLOSED_MESSAGE, EventFacts } from '@/components/EventFacts';
import { api, rememberNext, type EventView } from '@/lib/api';

const ERRORS: Record<string, string> = {
  event_full: 'This event is full.',
  registration_closed: 'Registration is closed.',
  event_cancelled: 'This event was cancelled.',
  event_started: 'This event has already started.',
};

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<EventView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ev, me] = await Promise.all([api<EventView>(`/events/${slug}`), api('/me')]);
    if (ev.status === 404) setNotFound(true);
    setEvent(ev.data);
    setSignedIn(me.ok);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function register() {
    setBusy(true);
    setMessage(null);
    const res = await api<{ status: string }>(`/events/${slug}/registration`, { method: 'POST' });
    setBusy(false);
    if (res.ok) {
      setMessage(
        res.data?.status === 'CONFIRMED'
          ? 'You’re registered. See you there!'
          : 'You’re on the waitlist. We’ll move you up if a seat opens.',
      );
    } else {
      setMessage(ERRORS[res.error ?? ''] ?? 'Something went wrong. Please try again.');
    }
    await load();
  }

  async function cancel() {
    setBusy(true);
    const res = await api(`/events/${slug}/registration`, { method: 'DELETE' });
    setBusy(false);
    setMessage(res.ok ? 'Your registration was cancelled.' : 'Could not cancel. Please try again.');
    await load();
  }

  if (notFound) {
    return (
      <main className="page page--narrow">
        <h1 className="display">Event not found</h1>
        <Link href="/events">See upcoming events</Link>
      </main>
    );
  }
  if (!event) {
    return (
      <main className="page page--narrow">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const a = event.availability;
  return (
    <main className="page page--narrow">
      <p>
        <Link href="/events">← All events</Link>
      </p>
      <article className="card">
        {event.status === 'CANCELLED' && <p className="tag tag--alert">Cancelled</p>}
        <h1 style={{ margin: '0 0 12px', fontSize: 28, lineHeight: 1.25 }}>{event.title}</h1>
        <p className="muted">{event.summary}</p>
        <EventFacts event={event} />
        {event.details && (
          <div className="muted" style={{ whiteSpace: 'pre-line', marginBottom: 20 }}>
            {event.details}
          </div>
        )}

        <p role="status" className="notice" hidden={!message}>
          {message}
        </p>

        {event.myRegistration ? (
          <>
            <p className="tag">
              {event.myRegistration === 'CONFIRMED'
                ? 'You’re registered'
                : 'You’re on the waitlist'}
            </p>
            {a.kind !== 'closed' || a.reason === 'registration_closed' ? (
              <button className="btn btn--outline" type="button" onClick={cancel} disabled={busy}>
                Cancel registration
              </button>
            ) : null}
          </>
        ) : a.kind === 'closed' ? (
          <p className="muted">{CLOSED_MESSAGE[a.reason]}</p>
        ) : a.kind === 'full' ? (
          <p className="muted">This event is full.</p>
        ) : !signedIn ? (
          <Link className="btn" href="/login" onClick={() => rememberNext(`/events/${event.slug}`)}>
            Sign in to {a.kind === 'waitlist' ? 'join the waitlist' : 'register'}
          </Link>
        ) : (
          <button
            className={a.kind === 'waitlist' ? 'btn btn--outline' : 'btn'}
            type="button"
            onClick={register}
            disabled={busy}
          >
            {a.kind === 'waitlist' ? 'Join waitlist' : 'Register'}
          </button>
        )}
        {event.checkIn && event.status === 'PUBLISHED' && (
          <CheckInCode
            url={event.checkIn.url}
            checkedInAt={event.checkIn.checkedInAt}
            opensAt={event.checkIn.opensAt}
          />
        )}
      </article>
    </main>
  );
}
