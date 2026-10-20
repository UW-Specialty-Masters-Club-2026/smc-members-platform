'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, DIGEST_STATUS_LABEL, type DigestDetailView } from '@/lib/api';

interface DeliveryRow {
  id: string;
  status: string;
  member: { firstName: string; lastName: string; email: string };
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastEventAt: string | null;
}

const APPROVE_ERRORS: Record<string, string> = {
  expired: 'The approval deadline (Monday 6:00 PM PT) has passed.',
  stale_version: 'This digest changed since you opened it. Reload and review again.',
  not_pending: 'This digest is no longer waiting for approval.',
};

const WIDTHS = { desktop: 720, mobile: 390 } as const;

export default function AdminDigestPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<DigestDetailView | null>(null);
  const [width, setWidth] = useState<keyof typeof WIDTHS>('desktop');
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [failures, setFailures] = useState<DeliveryRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<DigestDetailView>(`/admin/digests/${id}`);
    setD(res.data);
    if (res.data && ['SENDING', 'SENT', 'PARTIALLY_FAILED'].includes(res.data.status)) {
      const f = await api<{ deliveries: DeliveryRow[] }>(
        `/admin/digests/${id}/deliveries?status=FAILED`,
      );
      setFailures(f.data?.deliveries ?? []);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function testSend() {
    setBusy(true);
    const res = await api<{ to: string }>(`/admin/digests/${id}/test-send`, { method: 'POST' });
    setBusy(false);
    setMessage(
      res.ok
        ? {
            text: `Test sent to ${res.data!.to}. Check it on your phone and in Outlook if you can.`,
          }
        : {
            text:
              res.error === 'too_many_test_sends'
                ? 'Too many test sends — try again in an hour.'
                : 'Test send failed.',
            error: true,
          },
    );
  }

  async function approve() {
    if (!d) return;
    setBusy(true);
    const res = await api<{ kind: string; issueNumber?: number }>(`/admin/digests/${id}/approve`, {
      method: 'POST',
      body: { version: d.version },
    });
    setBusy(false);
    setConfirm(null);
    if (res.ok) {
      setMessage({
        text:
          res.data?.kind === 'approved'
            ? `Approved as issue ${res.data.issueNumber}. It goes out from ${d.schedule.labels.sendNotBefore}.`
            : 'Already approved.',
      });
    } else {
      setMessage({ text: APPROVE_ERRORS[res.error ?? ''] ?? 'Approval failed.', error: true });
    }
    await load();
  }

  async function reject() {
    if (!d) return;
    setBusy(true);
    const res = await api(`/admin/digests/${id}/reject`, {
      method: 'POST',
      body: { version: d.version, reason },
    });
    setBusy(false);
    setConfirm(null);
    setMessage(
      res.ok
        ? { text: 'Rejected. It will not be sent.' }
        : { text: 'Could not reject.', error: true },
    );
    await load();
  }

  if (!d) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const c = d.content;
  const r = d.results.deliveries.summary;
  const sending = ['SENDING', 'SENT', 'PARTIALLY_FAILED'].includes(d.status);

  return (
    <main className="page" style={{ maxWidth: 1200 }}>
      <p>
        <Link href="/admin/digests">← All digests</Link>
      </p>
      <h1 className="display" style={{ fontSize: 40 }}>
        Week of {d.weekKey}
      </h1>
      <p>
        <span className="tag">{DIGEST_STATUS_LABEL[d.status]}</span>{' '}
        {d.issueNumber && <span className="muted">Issue {d.issueNumber}</span>}
        {d.approvedBy && (
          <span className="muted">
            {' '}
            · approved by {d.approvedBy.firstName} {d.approvedBy.lastName}
          </span>
        )}
      </p>
      {d.skipReason && <p className="notice">Skipped: {d.skipReason}</p>}
      {d.rejectReason && <p className="notice">Rejected: {d.rejectReason}</p>}
      {message && (
        <p
          className={`notice${message.error ? ' notice--error' : ''}`}
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}

      {c && (
        <div className="digest-review">
          <section aria-label="Email preview">
            <div className="toolbar">
              <div role="group" aria-label="Preview width" style={{ display: 'flex', gap: 8 }}>
                {(Object.keys(WIDTHS) as (keyof typeof WIDTHS)[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`btn btn--small${width === w ? '' : ' btn--outline'}`}
                    aria-pressed={width === w}
                    onClick={() => setWidth(w)}
                  >
                    {w === 'desktop' ? 'Desktop 720' : 'Mobile 390'}
                  </button>
                ))}
              </div>
              <a
                href={`/api/admin/digests/${id}/preview?format=text`}
                target="_blank"
                rel="noopener"
              >
                Plain-text version
              </a>
            </div>
            <div className="preview-frame" style={{ width: WIDTHS[width] }}>
              <iframe
                title={`Email preview (${width})`}
                src={`/api/admin/digests/${id}/preview`}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                width={WIDTHS[width]}
                height={1700}
              />
            </div>
          </section>

          <aside className="digest-side">
            <section className="card">
              <h2 className="side-h">Schedule (Pacific Time)</h2>
              <ul className="facts-list">
                <li>Drafted {d.schedule.labels.draftAt}</li>
                <li>Sends from {d.schedule.labels.sendNotBefore}</li>
                <li>Expires {d.schedule.labels.expiresAt}</li>
              </ul>
            </section>

            <section className="card">
              <h2 className="side-h">Recipients</h2>
              <p style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>
                {d.recipients.total}
              </p>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                {d.recipients.scope}. Re-checked at send time; anyone who opts out before then is
                skipped.
              </p>
              <ul className="facts-list">
                {d.recipients.byDomain.map((x) => (
                  <li key={x.domain}>
                    @{x.domain}: {x.count}
                  </li>
                ))}
              </ul>
            </section>

            <section className="card">
              <h2 className="side-h">Check the facts</h2>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                Everything below is copied from the database. Open each link before approving.
              </p>
              {c.events.length > 0 && <h3 className="side-h3">Events</h3>}
              <ol className="check-list">
                {c.events.map((e) => (
                  <li key={e.id}>
                    <strong>{e.title}</strong>
                    <br />
                    {e.when}
                    <br />
                    {e.location}
                    {e.seats && (
                      <>
                        <br />
                        {e.seats}
                      </>
                    )}
                    <br />
                    <a href={e.url} target="_blank" rel="noopener">
                      {e.action === 'REGISTER' ? 'Register link' : 'Waitlist link'}
                    </a>
                  </li>
                ))}
              </ol>
              {c.news.length > 0 && <h3 className="side-h3">News</h3>}
              <ol className="check-list">
                {c.news.map((n) => (
                  <li key={n.id}>
                    {n.tag && (
                      <span className="tag" style={{ marginBottom: 4 }}>
                        {n.tag}
                      </span>
                    )}
                    <br />
                    <strong>{n.title}</strong>
                    {n.openings.length > 0 && <> · {n.openings.length} roles</>}
                    <br />
                    <a href={n.url} target="_blank" rel="noopener">
                      Read-more link
                    </a>
                  </li>
                ))}
              </ol>
              {(c.omitted.events > 0 || c.omitted.news > 0) && (
                <p className="notice" style={{ marginBottom: 0 }}>
                  Left out to keep the email short: {c.omitted.events} event(s), {c.omitted.news}{' '}
                  news post(s).
                </p>
              )}
            </section>

            <section className="card">
              <h2 className="side-h">Actions</h2>
              <button
                className="btn btn--outline"
                type="button"
                disabled={busy}
                onClick={() => void testSend()}
                style={{ width: '100%', marginBottom: 12 }}
              >
                Send test to me
              </button>
              {d.canApprove &&
                (confirm === 'approve' ? (
                  <div className="confirm">
                    <p style={{ margin: '0 0 12px', fontWeight: 600 }}>
                      Send issue to {d.recipients.total} members from{' '}
                      {d.schedule.labels.sendNotBefore}?
                    </p>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => void approve()}
                    >
                      Yes, approve
                    </button>{' '}
                    <button
                      className="btn btn--outline"
                      type="button"
                      onClick={() => setConfirm(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : confirm === 'reject' ? (
                  <div className="confirm">
                    <label className="field">
                      Why are you rejecting it?
                      <input
                        value={reason}
                        minLength={3}
                        maxLength={500}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || reason.trim().length < 3}
                      onClick={() => void reject()}
                    >
                      Reject
                    </button>{' '}
                    <button
                      className="btn btn--outline"
                      type="button"
                      onClick={() => setConfirm(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button className="btn" type="button" onClick={() => setConfirm('approve')}>
                      Approve
                    </button>
                    <button
                      className="btn btn--outline"
                      type="button"
                      onClick={() => setConfirm('reject')}
                    >
                      Reject
                    </button>
                  </div>
                ))}
              {!d.canApprove && d.status === 'PENDING_APPROVAL' && (
                <p className="muted">The approval deadline has passed.</p>
              )}
            </section>
          </aside>
        </div>
      )}

      {sending && (
        <section aria-labelledby="results" style={{ marginTop: 32 }}>
          <h2 id="results">Results</h2>
          <div className="stat-row">
            {(
              [
                ['Sent', r.sent],
                ['Delivered', r.delivered],
                ['Failed', r.failed],
                ['Opted out', r.optedOut],
                ['Skipped', r.skipped],
                ['Pending', r.pending],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="stat">
                <div className="stat__n">{n}</div>
                <div className="stat__label">{label}</div>
              </div>
            ))}
          </div>
          <h3>Batches</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Status</th>
                  <th scope="col">Recipients</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Last error</th>
                </tr>
              </thead>
              <tbody>
                {d.results.batches.map((b) => (
                  <tr key={b.batchNo}>
                    <td>{b.batchNo}</td>
                    <td>{b.status.toLowerCase().replace('_', ' ')}</td>
                    <td>{b.recipientCount}</td>
                    <td>{b.attempts}</td>
                    <td style={{ whiteSpace: 'normal' }}>{b.lastError ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Failed deliveries</h3>
          {failures.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Member</th>
                    <th scope="col">Email</th>
                    <th scope="col">Code</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((f) => (
                    <tr key={f.id}>
                      <td>
                        {f.member.firstName} {f.member.lastName}
                      </td>
                      <td>{f.member.email}</td>
                      <td>{f.lastErrorCode ?? '—'}</td>
                      <td style={{ whiteSpace: 'normal' }}>{f.lastErrorMessage ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
