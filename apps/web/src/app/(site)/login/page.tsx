'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, describeError, takeNext } from '@/lib/api';

const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials:
    'That email and password don’t match. Check them, or sign in with an email link below.',
  too_many_attempts:
    'Too many wrong passwords. Wait 15 minutes, or sign in with an email link below.',
  email_not_verified: 'Please confirm your email first. We just sent you a new confirmation link.',
  account_inactive:
    'This account is inactive. Contact smcommittee@uw.edu if you think this is a mistake.',
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function passwordSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password'));
    setBusy(true);
    setError(null);
    const res = await api('/auth/login', { method: 'POST', body: { email, password } });
    setBusy(false);
    if (res.ok) router.replace(takeNext() ?? '/me/profile');
    else setError(LOGIN_ERRORS[res.error ?? ''] ?? describeError(res));
  }

  async function sendLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api('/auth/magic-link', { method: 'POST', body: { email } });
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(describeError(res));
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
        <form className="card" onSubmit={mode === 'password' ? passwordSignIn : sendLink}>
          {error && (
            <div className="notice notice--error" role="alert">
              {error}
            </div>
          )}
          <label className="field">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={320}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {mode === 'password' ? (
            <>
              <label className="field">
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </label>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <p className="muted" style={{ marginBottom: 0 }}>
                Forgot your password, or never set one?{' '}
                <button type="button" className="link-button" onClick={() => setMode('link')}>
                  Email me a sign-in link
                </button>
              </p>
            </>
          ) : (
            <>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Email me a sign-in link'}
              </button>
              <p className="muted" style={{ marginBottom: 0 }}>
                After signing in you can set a new password in My profile.{' '}
                <button type="button" className="link-button" onClick={() => setMode('password')}>
                  Use my password instead
                </button>
              </p>
            </>
          )}
          <p className="muted" style={{ marginBottom: 0 }}>
            New here? <Link href="/signup">Join SMC</Link>
          </p>
        </form>
      )}
    </main>
  );
}
