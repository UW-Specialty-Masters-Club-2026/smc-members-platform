import type { Metadata } from 'next';
import Link from 'next/link';
import type { TeamMember } from '@/content';
import { getContent } from '@/lib/server-api';
import { TeamGrid } from './TeamGrid';

export const metadata: Metadata = { title: 'Core Team · Specialty Masters Club' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const team = (await getContent<{ items: TeamMember[] }>('/team'))?.items ?? [];
  return (
    <main className="page">
      <h1 className="display">Meet the core team</h1>
      <TeamGrid team={team} />
      <section className="card" style={{ marginTop: 40, textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Interested in joining the team?</h2>
        <Link className="btn" href="/join">
          Apply Now
        </Link>
      </section>
    </main>
  );
}
