'use client';

import { useState } from 'react';
import { TEAM, TEAM_FILTERS } from '@/content';

export function TeamGrid() {
  const [filter, setFilter] = useState<string | null>(null);
  const people = filter ? TEAM.filter((t) => t.departments.includes(filter)) : TEAM;
  return (
    <>
      <div className="filters" role="group" aria-label="Filter by team">
        {TEAM_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            className={`chip${filter === f.key ? ' is-active' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="team-grid">
        {people.map((t) => (
          <li key={t.slug} className="team-card">
            <img src={t.image} alt={t.name} loading="lazy" />
            <h2>{t.name}</h2>
            <p className="team-card__role">{t.role}</p>
            {t.major && <p className="muted team-card__major">{t.major}</p>}
            {(t.linkedin || t.website) && (
              <a href={(t.linkedin || t.website)!} target="_blank" rel="noopener noreferrer">
                {t.linkedin ? 'Connect on LinkedIn' : 'Website'}
                <span className="sr-only"> ({t.name})</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
