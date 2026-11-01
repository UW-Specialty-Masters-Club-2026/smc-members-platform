'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { MODULES } from '@/content/workshop';
import { useProgress } from './progress';

const icon = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const ICONS: Record<(typeof MODULES)[number]['icon'], ReactNode> = {
  play: (
    <svg {...icon}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m10 9 5 3-5 3z" />
    </svg>
  ),
  layers: (
    <svg {...icon}>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  ),
  doc: (
    <svg {...icon}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 11h7M9 15h7" />
    </svg>
  ),
  user: (
    <svg {...icon}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  ),
  chart: (
    <svg {...icon}>
      <path d="M5 20V12M10 20V8M15 20V4M20 20v-6" />
    </svg>
  ),
  bolt: (
    <svg {...icon}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  code: (
    <svg {...icon}>
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
    </svg>
  ),
  help: (
    <svg {...icon}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" />
    </svg>
  ),
};

/** Sticky module list: highlights the section in view and shows completed modules. */
export function LearningNav() {
  const [active, setActive] = useState<string>(MODULES[0].id);
  const [open, setOpen] = useState(false);
  const { done } = useProgress();

  useEffect(() => {
    const sections = MODULES.map((m) => document.getElementById(m.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    // The active module is the last one whose top has passed the upper third of the screen.
    const update = () => {
      const line = window.innerHeight / 3;
      let current = sections[0]?.id;
      for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s.id;
      if (current) setActive(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const current = MODULES.find((m) => m.id === active) ?? MODULES[0];

  return (
    <nav className="learn-nav" aria-labelledby="learn-nav-title">
      <h2 id="learn-nav-title" className="learn-nav__title">
        Learning path
      </h2>
      <p className="learn-nav__progress">
        {done.length} of {MODULES.length} completed
      </p>
      <button
        type="button"
        className="learn-nav__toggle"
        aria-expanded={open}
        aria-controls="learn-nav-list"
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          {current.num} · {current.title}
        </span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
        <span className="sr-only">{open ? 'Hide' : 'Show'} all modules</span>
      </button>
      <ol id="learn-nav-list" className={`learn-nav__list${open ? ' is-open' : ''}`}>
        {MODULES.map((m) => {
          const isDone = done.includes(m.id);
          return (
            <li key={m.id}>
              <a
                href={`#${m.id}`}
                aria-current={active === m.id ? 'location' : undefined}
                onClick={() => setOpen(false)}
              >
                {ICONS[m.icon]}
                <span className="learn-nav__num">{m.num}</span>
                <span className="learn-nav__label">{m.title}</span>
                {isDone && (
                  <span className="learn-nav__check" title="Completed">
                    ✓<span className="sr-only"> (completed)</span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
