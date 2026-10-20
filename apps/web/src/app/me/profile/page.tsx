'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type EventView, type Profile } from '@/lib/api';

const SUPPRESSION_NOTE: Record<NonNullable<Profile['emailSuppressedReason']>, string> = {
  UNSUBSCRIBED: 'You unsubscribed from an email.',
  COMPLAINED: 'An email from us was marked as spam.',
  HARD_BOUNCE: 'Our emails could not be delivered to your address.',
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myEvents, setMyEvents] = useState<EventView[]>([]);
  const [surveys, setSurveys] = useState<{ id: string; title: string; eventTitle: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<Profile>('/me').then((res) => {
      if (res.status === 401) router.replace('/login');
      else setProfile(res.data);
    });
    void api<{ registrations: EventView[] }>('/me/registrations').then((res) =>
      setMyEvents(res.data?.registrations ?? []),
    );
    void api<{ surveys: { id: string; title: string; eventTitle: string }[] }>('/me/surveys').then(
      (res) => setSurveys(res.data?.surveys ?? []),
    );
  }, [router]);

  async function setNewsOptIn(newsOptIn: boolean) {
    setSaving(true);
    setMessage(null);
    const res = await api<Profile>('/me', { method: 'PATCH', body: { newsOptIn } });
    setSaving(false);
    if (res.ok && res.data) {
      setProfile(res.data);
      setMessage(newsOptIn ? 'You’ll get news and invitations.' : 'News and invitations are off.');
    } else {
      setMessage('Could not save. Please try again.');
    }
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  if (!profile) {
    return (
      <main className="page page--narrow">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="page page--narrow">
      <h1 className="display">My profile</h1>
      <section className="card" aria-labelledby="who">
        <h2 id="who" style={{ marginTop: 0, fontSize: 20 }}>
          {profile.firstName} {profile.lastName}
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {profile.email}
          {profile.role !== 'MEMBER' && ` · ${profile.role.toLowerCase()}`}
        </p>

        <h3 style={{ fontSize: 16, marginBottom: 8 }}>Email preferences</h3>
        {profile.emailSuppressedReason && !profile.newsOptIn && (
          <div className="notice">
            {SUPPRESSION_NOTE[profile.emailSuppressedReason]} News emails were switched off. You can
            turn them back on below.
          </div>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={profile.newsOptIn}
            disabled={saving}
            onChange={(e) => void setNewsOptIn(e.target.checked)}
          />
          <span>
            Send me extra news and invitations (a weekly digest on Mondays). Account emails such as
            sign-in links are always sent.
          </span>
        </label>
        <p role="status" className="muted" style={{ minHeight: 24, margin: 0 }}>
          {message}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          {profile.role !== 'MEMBER' && (
            <>
              <Link className="btn btn--outline" href="/admin/events">
                Manage events
              </Link>
              <Link className="btn btn--outline" href="/admin/news">
                Manage news
              </Link>
            </>
          )}
          {profile.role !== 'MEMBER' && (
            <Link className="btn btn--outline" href="/admin/digests">
              Weekly digest
            </Link>
          )}
          {profile.role === 'ADMIN' && (
            <Link className="btn btn--outline" href="/admin/members">
              Manage members
            </Link>
          )}
          <button className="btn btn--outline" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </section>

      {surveys.length > 0 && (
        <section className="card" aria-labelledby="feedback" style={{ marginTop: 16 }}>
          <h2 id="feedback" style={{ marginTop: 0, fontSize: 20 }}>
            Feedback requested
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            {surveys.map((s) => (
              <li key={s.id}>
                <Link href={`/surveys/${s.id}`}>{s.title}</Link> · {s.eventTitle}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="my-events" style={{ marginTop: 16 }}>
        <h2 id="my-events" style={{ marginTop: 0, fontSize: 20 }}>
          My events
        </h2>
        {myEvents.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            You’re not registered for any upcoming events. <Link href="/events">Browse events</Link>
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            {myEvents.map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.slug}`}>{e.title}</Link> · {e.when}
                {e.status === 'CANCELLED'
                  ? ' · cancelled'
                  : e.myRegistration === 'WAITLISTED'
                    ? ' · waitlist'
                    : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
