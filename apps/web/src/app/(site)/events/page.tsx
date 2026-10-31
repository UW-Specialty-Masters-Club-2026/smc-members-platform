'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EventFacts } from '@/components/EventFacts';
import type { PastEvent } from '@/content';
import { api, type EventView } from '@/lib/api';

export default function EventsPage() {
  const [events, setEvents] = useState<EventView[] | null>(null);
  const [past, setPast] = useState<PastEvent[]>([]);

  useEffect(() => {
    void api<{ events: EventView[] }>('/events').then((res) => setEvents(res.data?.events ?? []));
    void api<{ items: PastEvent[] }>('/content/past-events').then((res) =>
      setPast(res.data?.items ?? []),
    );
  }, []);

  return (
    <main className="page">
      <h1 className="display">Events</h1>
      <h2 className="section-title">Upcoming</h2>
      {events === null ? (
        <p className="muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="muted">No upcoming events right now. Check back soon.</p>
      ) : (
        <ol className="event-list">
          {events.map((e, i) => (
            <li key={e.id} className="event-item">
              <span className="event-item__num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="event-item__body">
                <h2 className="event-item__title">
                  <Link href={`/events/${e.slug}`}>{e.title}</Link>
                </h2>
                <p className="muted">{e.summary}</p>
                <EventFacts event={e} />
                {e.myRegistration && (
                  <p className="tag">
                    {e.myRegistration === 'CONFIRMED'
                      ? 'You’re registered'
                      : 'You’re on the waitlist'}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <h2 className="section-title" style={{ marginTop: 48 }}>
        Past events
      </h2>
      <ul className="card-grid">
        {past.map((e) => (
          <li key={e.slug} className="card past-event">
            {e.imageUrl && <img src={e.imageUrl} alt={`${e.title} poster`} loading="lazy" />}
            <h3 className="card__title">{e.title}</h3>
            <p className="muted">
              {new Date(e.startsAt).toLocaleString('en-US', {
                timeZone: 'America/Los_Angeles',
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
              –
              {e.endsAt &&
                new Date(e.endsAt).toLocaleTimeString('en-US', {
                  timeZone: 'America/Los_Angeles',
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
              PT
            </p>
            {e.externalUrl && (
              <a href={e.externalUrl} target="_blank" rel="noopener noreferrer">
                Event page ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
