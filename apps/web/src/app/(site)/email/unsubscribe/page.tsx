'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type State = 'loading' | 'ready' | 'preview' | 'missing' | 'done' | 'already' | 'expired' | 'error';

/**
 * Footer "Unsubscribe" target. The signed token sits in the URL fragment (never sent to a
 * server by the browser) and is only used when the member clicks — mail scanners don't.
 */
export default function UnsubscribePage() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const t = /(?:^#|&)t=([A-Za-z0-9_.-]+)/.exec(hash)?.[1] ?? null;
    if (!hash) {
      // Either there never was a fragment, or a repeated effect run already consumed it.
      setState((s) => (s === 'loading' ? 'missing' : s));
      return;
    }
    setToken(t);
    setState(t ? 'ready' : /^#(preview|test)$/.test(hash) ? 'preview' : 'missing');
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function confirm() {
    if (!token) return;
    setBusy(true);
    const res = await api<{ alreadyUnsubscribed: boolean }>('/email/unsubscribe', {
      method: 'POST',
      body: { token },
    });
    setBusy(false);
    if (res.ok) setState(res.data?.alreadyUnsubscribed ? 'already' : 'done');
    else setState(res.error === 'invalid_or_expired_link' ? 'expired' : 'error');
  }

  return (
    <main className="page page--narrow">
      <h1 className="display">Email preferences</h1>
      <div className="card">
        {state === 'loading' && <p className="muted">Loading…</p>}
        {state === 'ready' && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Stop receiving SMC news and invitations, including the Monday weekly digest? You’ll
              still get emails you ask for, like sign-in links.
            </p>
            <button className="btn" type="button" onClick={() => void confirm()} disabled={busy}>
              {busy ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
          </>
        )}
        {(state === 'done' || state === 'already') && (
          <div role="status">
            <p style={{ marginTop: 0, fontWeight: 700 }}>
              {state === 'done' ? 'You’re unsubscribed.' : 'You were already unsubscribed.'}
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              Changed your mind? <Link href="/me/profile">Turn news back on in My profile</Link>.
            </p>
          </div>
        )}
        {state === 'expired' && (
          <p className="muted" role="alert" style={{ margin: 0 }}>
            This link has expired. <Link href="/login">Sign in</Link> and switch off news in My
            profile, or email <a href="mailto:smcommittee@uw.edu">smcommittee@uw.edu</a>.
          </p>
        )}
        {state === 'preview' && (
          <p className="muted" style={{ margin: 0 }}>
            This is the unsubscribe link from a preview or test email, so it doesn’t change
            anything.
          </p>
        )}
        {(state === 'missing' || state === 'error') && (
          <p className="muted" role="alert" style={{ margin: 0 }}>
            We couldn’t read this link. <Link href="/me/profile">Manage email preferences</Link>{' '}
            instead.
          </p>
        )}
      </div>
    </main>
  );
}
