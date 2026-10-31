import type { Metadata } from 'next';
import Link from 'next/link';
import { getSettings } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Join SMC · Specialty Masters Club' };
export const dynamic = 'force-dynamic';

export default async function JoinPage() {
  const { join } = await getSettings();
  return (
    <main className="page">
      <h1 className="display">Join SMC Today</h1>
      {join?.lead && <p className="muted lead">{join.lead}</p>}
      <Link className="btn" href="/signup">
        Register Now
      </Link>

      {join?.why && join.why.length > 0 && (
        <>
          <h2 className="section-title">Why join SMC?</h2>
          <ul className="card-grid">
            {join.why.map((w) => (
              <li key={w.title} className="card">
                <h3 className="card__title">{w.title}</h3>
                <p className="muted" style={{ marginBottom: 0 }}>
                  {w.text}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {join?.steps && join.steps.length > 0 && (
        <>
          <h2 className="section-title">How to join</h2>
          <ol className="card-grid join-steps">
            {join.steps.map((s, i) => (
              <li key={s.title} className="card">
                <p className="tag">Step {i + 1}</p>
                <h3 className="card__title">{s.title}</h3>
                <p className="muted" style={{ marginBottom: 0 }}>
                  {s.text}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}

      <section className="card" style={{ marginTop: 40, textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Ready to get started?</h2>
        {join?.closing && <p className="muted">{join.closing}</p>}
        <Link className="btn" href="/signup">
          Register Now
        </Link>
      </section>
    </main>
  );
}
