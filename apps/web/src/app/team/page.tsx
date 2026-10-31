import type { Metadata } from 'next';
import Link from 'next/link';
import { TeamGrid } from './TeamGrid';

export const metadata: Metadata = { title: 'Core Team · Specialty Masters Club' };

export default function TeamPage() {
  return (
    <main className="page">
      <h1 className="display">Meet the core team</h1>
      <TeamGrid />
      <section className="card" style={{ marginTop: 40, textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Interested in joining the team?</h2>
        <Link className="btn" href="/join">
          Apply Now
        </Link>
      </section>
    </main>
  );
}
