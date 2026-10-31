import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { monthYear, type Newsletter } from '@/content';
import { getContent } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Newsletter · Specialty Masters Club' };
export const dynamic = 'force-dynamic';

export default async function NewsletterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const n = await getContent<Newsletter>(`/newsletters/${encodeURIComponent(slug)}`);
  if (!n) notFound();
  return (
    <main className="page">
      <p>
        <Link href="/newsletters">← All newsletters</Link>
      </p>
      <p className="tag">
        {n.volume} · {monthYear(n.issuedAt)}
      </p>
      <h1 className="article-title">
        {n.title} — {n.volume}
      </h1>
      <p className="lead muted">{n.summary}</p>
      <h2 style={{ fontSize: 18 }}>Inside this issue</h2>
      <ul className="bullets">
        {n.highlights.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <div className="toolbar" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
        <a className="btn" href={n.pdfUrl} target="_blank" rel="noopener noreferrer">
          Open the PDF
        </a>
      </div>
      <iframe className="pdf-frame" src={n.pdfUrl} title={`${n.title} ${n.volume} (PDF)`} />
    </main>
  );
}
