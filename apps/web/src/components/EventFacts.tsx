import type { ReactNode } from 'react';
import type { EventView } from '@/lib/api';

const icon = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function Fact({ label, children, svg }: { label: string; children: ReactNode; svg: ReactNode }) {
  return (
    <li className="fact">
      {svg}
      <span className="sr-only">{label}: </span>
      <span>{children}</span>
    </li>
  );
}

/** Date/time (PT), place and seats — the same three lines as the digest email. */
export function EventFacts({ event }: { event: EventView }) {
  return (
    <ul className="facts">
      <Fact
        label="When"
        svg={
          <svg {...icon}>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        }
      >
        {event.when}
      </Fact>
      <Fact
        label="Where"
        svg={
          <svg {...icon}>
            <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
        }
      >
        {event.location}
      </Fact>
      {event.seats && (
        <Fact
          label="Seats"
          svg={
            <svg {...icon}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        >
          {event.seats}
        </Fact>
      )}
    </ul>
  );
}

export const CLOSED_MESSAGE: Record<string, string> = {
  not_published: 'This event isn’t published yet.',
  cancelled: 'This event was cancelled.',
  completed: 'This event has ended.',
  started: 'This event has already started.',
  registration_closed: 'Registration is closed.',
};
