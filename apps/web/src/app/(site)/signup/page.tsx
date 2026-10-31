'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, describeError } from '@/lib/api';

export default function SignupPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get('password') !== form.get('passwordAgain')) {
      setError('The two passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api('/auth/signup', {
      method: 'POST',
      body: {
        email: String(form.get('email')),
        firstName: String(form.get('firstName')),
        lastName: String(form.get('lastName')),
        newsOptIn: form.get('newsOptIn') === 'on',
        password: String(form.get('password')),
      },
    });
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(describeError(res));
  }

  return (
    <main className="page page--narrow">
      <h1 className="display">Join SMC</h1>
      {sent ? (
        <div className="notice" role="status">
          Check your inbox. We sent a link to confirm your email. After that you can sign in with
          your password. The link expires in 15 minutes.
        </div>
      ) : (
        <form className="card" onSubmit={onSubmit}>
          {error && (
            <div className="notice notice--error" role="alert">
              {error}
            </div>
          )}
          <label className="field">
            UW email
            <input name="email" type="email" autoComplete="email" required maxLength={320} />
          </label>
          <label className="field">
            First name
            <input name="firstName" autoComplete="given-name" required maxLength={100} />
          </label>
          <label className="field">
            Last name
            <input name="lastName" autoComplete="family-name" required maxLength={100} />
          </label>
          <label className="field" style={{ marginBottom: 4 }}>
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              aria-describedby="pw-help"
            />
          </label>
          <p id="pw-help" className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
            At least 10 characters.
          </p>
          <label className="field">
            Repeat password
            <input
              name="passwordAgain"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
            />
          </label>
          <label className="check">
            <input type="checkbox" name="newsOptIn" />
            <span>
              Send me extra news and invitations (a weekly digest on Mondays). You can change this
              anytime in My profile.
            </span>
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <p className="muted" style={{ marginBottom: 0 }}>
            Already a member? <Link href="/login">Sign in</Link>
          </p>
        </form>
      )}
    </main>
  );
}
