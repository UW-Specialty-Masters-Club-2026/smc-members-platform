'use client';

import { useState } from 'react';
import { TEAM_FILTERS, type TeamMember } from '@/content';

export function TeamGrid({ team }: { team: TeamMember[] }) {
  const [filter, setFilter] = useState<string | null>(null);
  const people = filter ? team.filter((t) => t.departments.includes(filter)) : team;
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
      {people.length === 0 && <p className="muted">No team members to show.</p>}
      <ul className="team-grid">
        {people.map((t) => {
          const link = t.linkedinUrl || t.websiteUrl;
          return (
            <li key={t.id} className="team-card">
              {t.imageUrl && <img src={t.imageUrl} alt={t.name} loading="lazy" />}
              <h2>{t.name}</h2>
              <p className="team-card__role">{t.role}</p>
              {t.major && <p className="muted team-card__major">{t.major}</p>}
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer">
                  {t.linkedinUrl ? 'Connect on LinkedIn' : 'Website'}
                  <span className="sr-only"> ({t.name})</span>
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
