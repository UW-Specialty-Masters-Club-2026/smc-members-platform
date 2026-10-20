'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EventFacts } from '@/components/EventFacts';
import { api, type EventView } from '@/lib/api';

export default function EventsPage() {
  const [events, setEvents] = useState<EventView[] | null>(null);

  useEffect(() => {
    void api<{ events: EventView[] }>('/events').then((res) => setEvents(res.data?.events ?? []));
  }, []);

  return (
    <main className="page">
      <h1 className="display">Upcoming events</h1>
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
    </main>
  );
}
