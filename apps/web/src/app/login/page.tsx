'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email'));
    setBusy(true);
    setError(null);
    const res = await api('/auth/magic-link', { method: 'POST', body: { email } });
    setBusy(false);
    if (res.ok) setSent(true);
    else
      setError(
        res.error === 'too_many_requests'
          ? 'Too many attempts. Please wait a few minutes and try again.'
          : 'Please enter a valid email address.',
      );
  }

  return (
    <main className="page page--narrow">
      <h1 className="display">Sign in</h1>
      {sent ? (
        <div className="notice" role="status">
          If that address belongs to an SMC member, a sign-in link is on its way. It expires in 15
          minutes.
        </div>
      ) : (
        <form className="card" onSubmit={onSubmit}>
          {error && (
            <div className="notice notice--error" role="alert">
              {error}
            </div>
          )}
          <label className="field">
            Email
            <input name="email" type="email" autoComplete="email" required maxLength={320} />
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          <p className="muted" style={{ marginBottom: 0 }}>
            New here? <Link href="/signup">Join SMC</Link>
          </p>
        </form>
      )}
    </main>
  );
}
