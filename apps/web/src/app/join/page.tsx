import type { Metadata } from 'next';
import Link from 'next/link';
import { JOIN } from '@/content';

export const metadata: Metadata = { title: 'Join SMC · Specialty Masters Club' };

export default function JoinPage() {
  return (
    <main className="page">
      <h1 className="display">{JOIN.title}</h1>
      <p className="muted lead">{JOIN.lead}</p>
      <Link className="btn" href="/signup">
        Register Now
      </Link>

      <h2 className="section-title">Why join SMC?</h2>
      <ul className="card-grid">
        {JOIN.why.map((w) => (
          <li key={w.title} className="card">
            <h3 className="card__title">{w.title}</h3>
            <p className="muted" style={{ marginBottom: 0 }}>
              {w.text}
            </p>
          </li>
        ))}
      </ul>

      <h2 className="section-title">How to join</h2>
      <ol className="card-grid join-steps">
        {JOIN.steps.map((s, i) => (
          <li key={s.title} className="card">
            <p className="tag">Step {i + 1}</p>
            <h3 className="card__title">{s.title}</h3>
            <p className="muted" style={{ marginBottom: 0 }}>
              {s.text}
            </p>
          </li>
        ))}
      </ol>

      <section className="card" style={{ marginTop: 40, textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Ready to get started?</h2>
        <p className="muted">{JOIN.closing}</p>
        <Link className="btn" href="/signup">
          Register Now
        </Link>
      </section>
    </main>
  );
}
