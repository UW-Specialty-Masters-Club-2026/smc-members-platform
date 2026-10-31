'use client';

import Link from 'next/link';
import { useState } from 'react';
import { monthYear, NEWSLETTERS } from '@/content';

export default function NewslettersPage() {
  const [vol, setVol] = useState<string | null>(null);
  const list = vol ? NEWSLETTERS.filter((n) => n.volume === vol) : NEWSLETTERS;
  return (
    <main className="page">
      <h1 className="display">SMC Newsletters</h1>
      <p className="muted lead">
        Stay updated with the latest news, insights, and stories from the Specialty Masters Club
        community.
      </p>
      <div className="filters" role="group" aria-label="Filter by edition">
        {[null, ...NEWSLETTERS.map((n) => n.volume)].map((v) => (
          <button
            key={v ?? 'all'}
            type="button"
            className={`chip${vol === v ? ' is-active' : ''}`}
            aria-pressed={vol === v}
            onClick={() => setVol(v)}
          >
            {v ?? 'All Editions'}
          </button>
        ))}
      </div>
      <ul className="card-grid">
        {list.map((n) => (
          <li key={n.slug} className="card">
            <p className="tag">{n.volume}</p>
            <h2 className="card__title">
              <Link href={`/newsletters/${n.slug}`}>{n.title}</Link>
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {monthYear(n.date)}
            </p>
            <p className="muted">{n.summary}</p>
            <ul className="bullets">
              {n.highlights.slice(0, 3).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <Link className="btn btn--outline btn--small" href={`/newsletters/${n.slug}`}>
              Read Newsletter
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
