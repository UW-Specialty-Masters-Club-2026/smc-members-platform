'use client';

import { useState, type FormEvent } from 'react';
import { api, describeError } from '@/lib/api';

/** Set a first password, or change it (needs the current one). */
export function PasswordSettings({
  hasPassword,
  onSaved,
}: {
  hasPassword: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get('newPassword') !== f.get('again')) {
      setMessage({ text: 'The two new passwords don’t match.', error: true });
      return;
    }
    setBusy(true);
    const res = await api('/me/password', {
      method: 'PUT',
      body: {
        ...(hasPassword && { currentPassword: String(f.get('currentPassword')) }),
        newPassword: String(f.get('newPassword')),
      },
    });
    setBusy(false);
    if (res.ok) {
      form.reset();
      setMessage({
        text: hasPassword
          ? 'Password changed. Other devices were signed out.'
          : 'Password set. You can now sign in with it.',
      });
      onSaved();
    } else {
      setMessage({
        text:
          res.error === 'wrong_current_password'
            ? 'Your current password isn’t right.'
            : res.error === 'invalid_request'
              ? 'Use at least 10 characters.'
              : describeError(res),
        error: true,
      });
    }
  }

  return (
    <form onSubmit={submit}>
      <h3 style={{ fontSize: 16, marginBottom: 8 }}>
        {hasPassword ? 'Change password' : 'Set a password'}
      </h3>
      {!hasPassword && (
        <p className="muted" style={{ marginTop: 0 }}>
          You sign in with email links today. Set a password to sign in with it instead.
        </p>
      )}
      {message && (
        <p
          className={`notice${message.error ? ' notice--error' : ''}`}
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      {hasPassword && (
        <label className="field">
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
      )}
      <label className="field">
        New password (10+ characters)
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
        />
      </label>
      <label className="field">
        Repeat new password
        <input
          name="again"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
        />
      </label>
      <button className="btn btn--outline" type="submit" disabled={busy}>
        {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
      </button>
    </form>
  );
}
