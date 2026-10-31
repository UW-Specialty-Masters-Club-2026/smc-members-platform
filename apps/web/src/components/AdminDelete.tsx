'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, describeError } from '@/lib/api';

/** Delete with an in-page confirmation, then go back to the list. */
export function AdminDelete(props: {
  endpoint: string;
  what: string;
  warning: string;
  backTo: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const res = await api(props.endpoint, { method: 'DELETE' });
    if (res.ok) router.push(props.backTo);
    else {
      setError(describeError(res));
      setConfirming(false);
    }
  }

  return (
    <section className="ax-card ax-pad" style={{ marginTop: 24 }} aria-label="Danger zone">
      <h2 style={{ marginTop: 0, fontSize: 15 }}>Delete {props.what}</h2>
      <p className="ax-muted">{props.warning}</p>
      {error && (
        <p className="ax-alert ax-alert--error" role="alert">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="ax-confirm">
          <span>Delete permanently? This can’t be undone.</span>
          <button type="button" className="ax-btn ax-btn--danger" onClick={() => void remove()}>
            Yes, delete
          </button>
          <button type="button" className="ax-btn" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="ax-btn"
          style={{ color: 'var(--ax-danger)' }}
          onClick={() => setConfirming(true)}
        >
          Delete {props.what}
        </button>
      )}
    </section>
  );
}
