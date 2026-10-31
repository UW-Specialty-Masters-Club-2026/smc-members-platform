'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ptDateTime, type AuditEntry, type DigestStatus } from '@/lib/api';
import { useAdminMe } from './AdminShell';
import { Icon, type IconName } from './Icon';

interface Stats {
  members: { total: number; active: number; optedIn: number; new30d: number };
  registrations: { last8Weeks: number; perWeek: { weekStart: string; count: number }[] };
  checkIns8Weeks: number;
  publishedArticles: number;
  latestDigest: { id: string; weekKey: string; status: DigestStatus } | null;
  upcoming: {
    id: string;
    slug: string;
    title: string;
    startsAt: string;
    capacity: number | null;
    confirmed: number;
    waitlisted: number;
  }[];
  recentActivity: AuditEntry[];
}

const DIGEST_BADGE: Partial<Record<DigestStatus, string>> = {
  PENDING_APPROVAL: 'ax-badge--warn',
  SENT: 'ax-badge--success',
  PARTIALLY_FAILED: 'ax-badge--danger',
};

function Kpi(props: { icon: IconName; label: string; value: number | string; sub?: string }) {
  return (
    <div className="ax-card ax-kpi">
      <span className="ax-kpi-icon">
        <Icon name={props.icon} size={20} />
      </span>
      <div>
        <div className="ax-kpi-value">{props.value}</div>
        <div className="ax-kpi-label">{props.label}</div>
        {props.sub && <div className="ax-kpi-sub">{props.sub}</div>}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const me = useAdminMe();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    void api<Stats>('/admin/stats').then((res) => (res.ok ? setStats(res.data) : setError(true)));
  }, []);

  if (error) return <p className="ax-alert ax-alert--error">Could not load the dashboard.</p>;
  if (!stats) return <p className="ax-muted">Loading…</p>;

  const max = Math.max(1, ...stats.registrations.perWeek.map((w) => w.count));
  const optInRate = stats.members.active
    ? Math.round((stats.members.optedIn / stats.members.active) * 100)
    : 0;

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">Welcome back, {me.firstName}</h1>
          <p>What’s happening in the Specialty Masters Club.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="ax-btn" href="/admin/news/new">
            <Icon name="megaphone" size={16} /> Post news
          </Link>
          <Link className="ax-btn ax-btn--primary" href="/admin/events/new">
            <Icon name="plus" size={16} /> New event
          </Link>
        </div>
      </div>

      <div className="ax-grid ax-grid--kpi" style={{ marginBottom: 16 }}>
        <Kpi
          icon="users"
          label="Verified members"
          value={stats.members.active}
          sub={`+${stats.members.new30d} in the last 30 days`}
        />
        <Kpi
          icon="mail"
          label="Get the weekly digest"
          value={`${optInRate}%`}
          sub={`${stats.members.optedIn} members opted in`}
        />
        <Kpi
          icon="calendar"
          label="Registrations (8 weeks)"
          value={stats.registrations.last8Weeks}
          sub={`${stats.checkIns8Weeks} check-ins`}
        />
        <Kpi icon="article" label="Published articles" value={stats.publishedArticles} />
      </div>

      <div className="ax-grid ax-grid--2" style={{ marginBottom: 16 }}>
        <section className="ax-card" aria-labelledby="reg-chart">
          <div className="ax-card-head">
            <h2 id="reg-chart">Event registrations per week</h2>
            <span className="ax-muted">Last 8 weeks</span>
          </div>
          <div
            className="ax-bars"
            role="img"
            aria-label={stats.registrations.perWeek
              .map((w) => `${w.weekStart}: ${w.count}`)
              .join(', ')}
          >
            {stats.registrations.perWeek.map((w) => (
              <div key={w.weekStart} className="ax-bar">
                <span>{w.count}</span>
                <div className="ax-bar-track">
                  <div className="ax-bar-fill" style={{ height: `${(w.count / max) * 100}%` }} />
                </div>
                <span className="ax-bar-label">
                  {new Date(`${w.weekStart}T12:00:00Z`).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="ax-card" aria-labelledby="digest-card">
          <div className="ax-card-head">
            <h2 id="digest-card">Weekly digest</h2>
            <Link href="/admin/digests">Open</Link>
          </div>
          <div className="ax-pad">
            {stats.latestDigest ? (
              <>
                <p className="ax-muted" style={{ marginTop: 0 }}>
                  Latest issue · week of {stats.latestDigest.weekKey}
                </p>
                <span className={`ax-badge ${DIGEST_BADGE[stats.latestDigest.status] ?? ''}`}>
                  {stats.latestDigest.status.replace('_', ' ').toLowerCase()}
                </span>
                <p style={{ marginBottom: 0 }}>
                  <Link className="ax-btn" href={`/admin/digests/${stats.latestDigest.id}`}>
                    Review issue
                  </Link>
                </p>
              </>
            ) : (
              <p className="ax-muted" style={{ margin: 0 }}>
                No digest yet. One is drafted every Monday at 8:00 AM PT.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="ax-grid ax-grid--2">
        <section className="ax-card" aria-labelledby="upcoming">
          <div className="ax-card-head">
            <h2 id="upcoming">Upcoming events</h2>
            <Link href="/admin/events">All events</Link>
          </div>
          {stats.upcoming.length === 0 ? (
            <p className="ax-empty">No upcoming events.</p>
          ) : (
            <ul className="ax-list">
              {stats.upcoming.map((e) => (
                <li key={e.id}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link href={`/admin/events/${e.id}`}>
                      <strong>{e.title}</strong>
                    </Link>
                    <div className="ax-muted">{ptDateTime(e.startsAt)}</div>
                    {e.capacity !== null && (
                      <div className="ax-progress" aria-hidden="true">
                        <span
                          style={{ width: `${Math.min(100, (e.confirmed / e.capacity) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <span className="ax-muted" style={{ whiteSpace: 'nowrap' }}>
                    {e.confirmed}
                    {e.capacity !== null && ` / ${e.capacity}`} registered
                    {e.waitlisted > 0 && ` · ${e.waitlisted} waitlist`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {me.role === 'ADMIN' && (
          <section className="ax-card" aria-labelledby="activity">
            <div className="ax-card-head">
              <h2 id="activity">Recent activity</h2>
              <Link href="/admin/audit">Audit log</Link>
            </div>
            <ul className="ax-list">
              {stats.recentActivity.map((a) => (
                <li key={a.id}>
                  <span style={{ minWidth: 0 }}>
                    <code style={{ fontSize: 12 }}>{a.action}</code>
                    <div className="ax-muted">{a.actor?.name ?? a.actorType.toLowerCase()}</div>
                  </span>
                  <span className="ax-muted" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {ptDateTime(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
