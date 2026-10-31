'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EventFacts } from '@/components/EventFacts';
import { api, type EventView } from '@/lib/api';

/** Next few published events from the platform, for the home page. */
export function UpcomingEvents({ limit = 3 }: { limit?: number }) {
  const [events, setEvents] = useState<EventView[] | null>(null);
  useEffect(() => {
    void api<{ events: EventView[] }>('/events').then((res) => setEvents(res.data?.events ?? []));
  }, []);

  if (events === null) return <p className="muted">Loading events…</p>;
  if (events.length === 0) {
    return (
      <p className="muted">
        No upcoming events yet. <Link href="/events">See past events</Link>
      </p>
    );
  }
  return (
    <ul className="card-grid">
      {events.slice(0, limit).map((e) => (
        <li key={e.id} className="card">
          <h3 className="card__title">
            <Link href={`/events/${e.slug}`}>{e.title}</Link>
          </h3>
          <p className="muted">{e.summary}</p>
          <EventFacts event={e} />
        </li>
      ))}
    </ul>
  );
}
