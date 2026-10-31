'use client';

import Link from 'next/link';
import { useState } from 'react';
import { monthYear, type Newsletter } from '@/content';

export function NewsletterList({ newsletters }: { newsletters: Newsletter[] }) {
  const [vol, setVol] = useState<string | null>(null);
  const list = vol ? newsletters.filter((n) => n.volume === vol) : newsletters;
  return (
    <>
      <div className="filters" role="group" aria-label="Filter by edition">
        {[null, ...newsletters.map((n) => n.volume)].map((v) => (
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
      {list.length === 0 && <p className="muted">No newsletters yet.</p>}
      <ul className="card-grid">
        {list.map((n) => (
          <li key={n.slug} className="card">
            <p className="tag">{n.volume}</p>
            <h2 className="card__title">
              <Link href={`/newsletters/${n.slug}`}>{n.title}</Link>
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {monthYear(n.issuedAt)}
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
    </>
  );
}
