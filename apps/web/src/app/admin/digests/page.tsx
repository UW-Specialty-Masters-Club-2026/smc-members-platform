'use client';

import { toPtLocalInput } from '@smc/core/time';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  DIGEST_STATUS_LABEL,
  type DigestScheduleView,
  type DigestSummaryView,
} from '@/lib/api';

interface Settings {
  paused: boolean;
  pausedUntil: string | null;
  pausedReason: string | null;
  pausedNow: boolean;
}

interface ListView {
  digests: DigestSummaryView[];
  settings: Settings;
  thisWeek: DigestScheduleView & { weekKey: string; exists: boolean; canDraftNow: boolean };
}

const DRAFT_ERRORS: Record<string, string> = {
  paused: 'The digest is paused. Resume it first.',
  before_draft_time: 'Drafting opens Monday at 8:00 AM PT.',
  after_deadline: 'This week’s approval deadline (Monday 6:00 PM PT) has passed.',
};

export default function AdminDigestsPage() {
  const router = useRouter();
  const [data, setData] = useState<ListView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const res = await api<ListView>('/admin/digests');
    if (res.status === 401) return router.replace('/login');
    if (res.status === 403)
      return setError('Only admins and organizers can open the digest workspace.');
    if (!res.data) return;
    setData(res.data);
    setPaused(res.data.settings.paused);
    setUntil(
      res.data.settings.pausedUntil ? toPtLocalInput(new Date(res.data.settings.pausedUntil)) : '',
    );
    setReason(res.data.settings.pausedReason ?? '');
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    const res = await api('/admin/digests/settings', {
      method: 'PUT',
      body: {
        paused,
        pausedUntilPt: paused && until ? until : null,
        pausedReason: paused ? reason || null : null,
      },
    });
    setMessage(
      res.ok
        ? paused
          ? 'Digest paused.'
          : 'Digest resumed.'
        : res.status === 403
          ? 'Only admins can change this.'
          : 'Could not save.',
    );
    await load();
  }

  async function draftNow() {
    const res = await api<{ digestId: string }>('/admin/digests/draft-now', { method: 'POST' });
    if (res.ok && res.data?.digestId) router.push(`/admin/digests/${res.data.digestId}`);
    else
      setMessage(
        DRAFT_ERRORS[res.error ?? ''] ??
          (res.status === 403 ? 'Only admins can draft.' : 'Could not draft.'),
      );
  }

  if (error) {
    return (
      <main className="page">
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const w = data.thisWeek;
  return (
    <main className="page">
      <h1 className="display">Weekly digest</h1>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      <div className="split" style={{ marginBottom: 24 }}>
        <section className="card" aria-labelledby="this-week">
          <h2 id="this-week" style={{ marginTop: 0, fontSize: 18 }}>
            This week ({w.weekKey})
          </h2>
          <ul className="muted" style={{ paddingLeft: 18, margin: '0 0 16px', lineHeight: 1.8 }}>
            <li>Drafted: {w.labels.draftAt}</li>
            <li>Sends from: {w.labels.sendNotBefore} (after approval)</li>
            <li>Expires if not approved: {w.labels.expiresAt}</li>
            <li>
              News window: {w.newsWindow.start} → {w.newsWindow.end}
            </li>
          </ul>
          {!w.exists && (
            <button
              className="btn"
              type="button"
              disabled={!w.canDraftNow}
              onClick={() => void draftNow()}
            >
              Draft now
            </button>
          )}
        </section>

        <section className="card" aria-labelledby="pause">
          <h2 id="pause" style={{ marginTop: 0, fontSize: 18 }}>
            Pause (summer, breaks)
          </h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {data.settings.pausedNow
              ? 'Paused — no digests are drafted.'
              : 'Active — a digest is drafted every Monday at 8:00 AM PT.'}
          </p>
          <label className="check">
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
            <span>Pause the weekly digest</span>
          </label>
          {paused && (
            <>
              <label className="field">
                Resume automatically on (Pacific Time, optional)
                <input
                  type="datetime-local"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
              <label className="field">
                Reason (optional)
                <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
              </label>
            </>
          )}
          <button className="btn btn--outline" type="button" onClick={() => void saveSettings()}>
            Save
          </button>
        </section>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col">Issue</th>
              <th scope="col">Status</th>
              <th scope="col">Recipients</th>
              <th scope="col">Summary</th>
            </tr>
          </thead>
          <tbody>
            {data.digests.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/admin/digests/${d.id}`}>{d.weekKey}</Link>
                </td>
                <td>{d.issueNumber ?? '—'}</td>
                <td>{DIGEST_STATUS_LABEL[d.status]}</td>
                <td>{d.recipientCountPreview ?? '—'}</td>
                <td style={{ whiteSpace: 'normal', minWidth: 240 }}>
                  {d.summaryText ?? d.skipReason ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.digests.length === 0 && <p className="muted">No digests yet.</p>}
    </main>
  );
}
