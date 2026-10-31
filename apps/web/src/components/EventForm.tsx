'use client';

import { toPtLocalInput } from '@smc/core/time';
import { useState, type FormEvent } from 'react';
import { ImageField } from '@/components/ImageField';
import type { EventView } from '@/lib/api';

export interface EventFormBody {
  title: string;
  summary: string;
  details: string | null;
  startsAtPt: string;
  endsAtPt: string | null;
  location: string;
  capacity: number | null;
  waitlistEnabled: boolean;
  registrationOpen: boolean;
  registrationClosesAtPt: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
}

const ERRORS: Record<string, string> = {
  ends_before_start: 'The end time must be after the start time.',
  registration_closes_after_start: 'Registration must close before the event starts.',
  capacity_below_confirmed: 'Capacity can’t be lower than the number of confirmed registrations.',
  event_locked: 'Cancelled or completed events can’t be edited.',
  invalid_request: 'Please check the highlighted fields.',
};

const pt = (iso: string | null | undefined) => (iso ? toPtLocalInput(new Date(iso)) : '');

/** Create/edit form. All times are entered and shown in Pacific Time. */
export function EventForm({
  initial,
  disabled,
  submitLabel,
  onSubmit,
}: {
  initial?: EventView;
  disabled?: boolean;
  submitLabel: string;
  onSubmit: (
    body: EventFormBody,
  ) => Promise<{ ok: boolean; error: string | null; fields?: string[] }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badFields, setBadFields] = useState<string[]>([]);

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim();
    const capacity = text('capacity');
    setBusy(true);
    setError(null);
    const res = await onSubmit({
      title: text('title'),
      summary: text('summary'),
      details: text('details') || null,
      startsAtPt: text('startsAtPt'),
      endsAtPt: text('endsAtPt') || null,
      location: text('location'),
      capacity: capacity ? Number(capacity) : null,
      waitlistEnabled: f.get('waitlistEnabled') === 'on',
      registrationOpen: f.get('registrationOpen') === 'on',
      registrationClosesAtPt: text('registrationClosesAtPt') || null,
      imageUrl: text('imageUrl') || null,
      externalUrl: text('externalUrl') || null,
    });
    setBusy(false);
    setBadFields(res.fields ?? []);
    if (!res.ok) setError(ERRORS[res.error ?? ''] ?? 'Could not save the event.');
  }

  const invalid = (name: string) => (badFields.includes(name) ? true : undefined);

  return (
    <form className="card" onSubmit={handle}>
      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}
      <fieldset disabled={disabled || busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <label className="field">
          Title
          <input
            name="title"
            required
            minLength={3}
            maxLength={160}
            defaultValue={initial?.title}
            aria-invalid={invalid('title')}
          />
        </label>
        <label className="field">
          One-line summary (shown in listings and the weekly digest)
          <input
            name="summary"
            required
            minLength={10}
            maxLength={280}
            defaultValue={initial?.summary}
            aria-invalid={invalid('summary')}
          />
        </label>
        <label className="field">
          Details (optional)
          <textarea
            name="details"
            rows={5}
            maxLength={10000}
            defaultValue={initial?.details ?? ''}
          />
        </label>
        <div className="field-row">
          <label className="field">
            Starts (Pacific Time)
            <input
              type="datetime-local"
              name="startsAtPt"
              required
              defaultValue={pt(initial?.startsAt)}
              aria-invalid={invalid('startsAtPt')}
            />
          </label>
          <label className="field">
            Ends (Pacific Time, optional)
            <input
              type="datetime-local"
              name="endsAtPt"
              defaultValue={pt(initial?.endsAt)}
              aria-invalid={invalid('endsAtPt')}
            />
          </label>
        </div>
        <label className="field">
          Location
          <input
            name="location"
            required
            minLength={2}
            maxLength={200}
            placeholder="PACCAR Hall, Room 192 · UW Seattle"
            defaultValue={initial?.location}
            aria-invalid={invalid('location')}
          />
        </label>
        <div className="field-row">
          <label className="field">
            Capacity (blank = unlimited)
            <input
              type="number"
              name="capacity"
              min={1}
              max={10000}
              defaultValue={initial?.capacity ?? ''}
              aria-invalid={invalid('capacity')}
            />
          </label>
          <label className="field">
            Registration closes (Pacific Time, optional)
            <input
              type="datetime-local"
              name="registrationClosesAtPt"
              defaultValue={pt(initial?.registrationClosesAt)}
              aria-invalid={invalid('registrationClosesAtPt')}
            />
          </label>
        </div>
        <ImageField
          name="imageUrl"
          label="Poster or photo (optional)"
          defaultValue={initial?.imageUrl}
        />
        <label className="field">
          Outside event page (optional, e.g. Luma)
          <input
            type="url"
            name="externalUrl"
            placeholder="https://"
            defaultValue={initial?.externalUrl ?? ''}
            aria-invalid={invalid('externalUrl')}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            name="registrationOpen"
            defaultChecked={initial?.registrationOpen ?? true}
          />
          <span>Registration open</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            name="waitlistEnabled"
            defaultChecked={initial?.waitlistEnabled ?? true}
          />
          <span>Offer a waitlist when full</span>
        </label>
        <button className="btn" type="submit">
          {busy ? 'Saving…' : submitLabel}
        </button>
      </fieldset>
    </form>
  );
}
