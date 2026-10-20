import Link from 'next/link';
import { ptDateTime, type AuditEntry } from '@/lib/api';

/** Audit entries: when (PT), who, what, result, run id (links to the whole run), details. */
export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="muted">No entries.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Who</th>
            <th scope="col">Action</th>
            <th scope="col">Result</th>
            <th scope="col">Entity</th>
            <th scope="col">Run</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{ptDateTime(e.at)}</td>
              <td>{e.actor?.name ?? e.actorType.toLowerCase()}</td>
              <td>
                <code>{e.action}</code>
              </td>
              <td>
                <span className={`result result--${e.result.toLowerCase()}`}>
                  {e.result.toLowerCase()}
                </span>
              </td>
              <td>{e.entityType ? `${e.entityType} ${e.entityId?.slice(0, 10) ?? ''}` : '—'}</td>
              <td>
                <Link href={`/admin/audit?runId=${encodeURIComponent(e.runId)}`}>
                  {e.runId.slice(0, 12)}
                </Link>
              </td>
              <td style={{ whiteSpace: 'normal', maxWidth: 360 }}>
                {e.metadata ? <code className="meta">{JSON.stringify(e.metadata)}</code> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
