'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { AuditTable } from '@/components/AuditTable';
import { api, type AuditEntry } from '@/lib/api';

const FILTERS = ['runId', 'action', 'entityType', 'entityId', 'actorId', 'result'] as const;

function AuditLog() {
  const router = useRouter();
  const params = useSearchParams();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(
    (cursor?: string) => {
      const q = new URLSearchParams();
      for (const f of FILTERS) {
        const v = params.get(f);
        if (v) q.set(f, v);
      }
      if (cursor) q.set('cursor', cursor);
      return q.toString();
    },
    [params],
  );

  const load = useCallback(
    async (cursor?: string) => {
      const res = await api<{ entries: AuditEntry[]; nextCursor: string | null }>(
        `/admin/audit?${query(cursor)}`,
      );
      if (res.status === 401) return router.replace('/login');
      if (res.status === 403) return setError('Only admins can read the audit log.');
      setEntries((prev) =>
        cursor ? [...(prev ?? []), ...(res.data?.entries ?? [])] : (res.data?.entries ?? []),
      );
      setNext(res.data?.nextCursor ?? null);
    },
    [query, router],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    for (const key of FILTERS) {
      const v = String(f.get(key) ?? '').trim();
      if (v) q.set(key, v);
    }
    router.push(`/admin/audit?${q}`);
  }

  if (error) {
    return (
      <div className="notice notice--error" role="alert">
        {error}
      </div>
    );
  }

  return (
    <>
      <form className="card audit-filters" onSubmit={apply}>
        <label className="field">
          Run ID
          <input name="runId" defaultValue={params.get('runId') ?? ''} />
        </label>
        <label className="field">
          Action starts with
          <input
            name="action"
            placeholder="digest. / mailgun. / auth."
            defaultValue={params.get('action') ?? ''}
          />
        </label>
        <label className="field">
          Entity type
          <input
            name="entityType"
            placeholder="weekly_digest, member, job…"
            defaultValue={params.get('entityType') ?? ''}
          />
        </label>
        <label className="field">
          Entity ID
          <input name="entityId" defaultValue={params.get('entityId') ?? ''} />
        </label>
        <label className="field">
          Result
          <select name="result" defaultValue={params.get('result') ?? ''}>
            <option value="">Any</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
            <option value="SKIPPED">Skipped</option>
            <option value="DENIED">Denied</option>
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
          <button className="btn" type="submit">
            Filter
          </button>
          <button
            className="btn btn--outline"
            type="button"
            onClick={() => router.push('/admin/audit')}
          >
            Clear
          </button>
        </div>
      </form>
      {entries === null ? <p className="muted">Loading…</p> : <AuditTable entries={entries} />}
      {next && (
        <p>
          <button className="btn btn--outline" type="button" onClick={() => void load(next)}>
            Load older
          </button>
        </p>
      )}
    </>
  );
}

export default function AuditPage() {
  return (
    <main className="page" style={{ maxWidth: 1280 }}>
      <h1 className="display">Audit log</h1>
      <p className="muted">
        Every action, approval, delivery, failure and retry. Times in Pacific Time; email addresses
        are masked.
      </p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <AuditLog />
      </Suspense>
    </main>
  );
}
