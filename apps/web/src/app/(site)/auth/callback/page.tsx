'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, takeNext } from '@/lib/api';

/**
 * Magic-link landing page. The token is in the URL fragment (never sent to a server),
 * and is redeemed only when the member clicks — email link scanners don't click buttons.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const match = /(?:^#|&)token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    // A second run (React dev mode runs effects twice) finds the fragment already cleared;
    // keep the token from the first run.
    if (!match) return;
    setToken(match[1]!);
    // Drop the token from the address bar and history.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function confirm() {
    if (!token) return;
    setBusy(true);
    const res = await api('/auth/verify', { method: 'POST', body: { token } });
    setBusy(false);
    if (res.ok) {
      router.replace(takeNext() ?? '/me/profile');
    } else {
      setError(
        res.error === 'account_inactive'
          ? 'This account is inactive. Contact smcommittee@uw.edu if you think this is a mistake.'
          : 'This link has expired or was already used. Request a new one.',
      );
    }
  }

  return (
    <main className="page page--narrow">
      <h1 className="display">Sign in</h1>
      <div className="card">
        {error ? (
          <>
            <div className="notice notice--error" role="alert">
              {error}
            </div>
            <Link className="btn btn--outline" href="/login">
              Get a new link
            </Link>
          </>
        ) : token ? (
          <>
            <p className="muted">Confirm to finish signing in to the Specialty Masters Club.</p>
            <button className="btn" type="button" onClick={confirm} disabled={busy}>
              {busy ? 'Signing in…' : 'Continue'}
            </button>
          </>
        ) : (
          <>
            <p className="muted">This sign-in link is incomplete. Request a new one.</p>
            <Link className="btn btn--outline" href="/login">
              Get a new link
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
