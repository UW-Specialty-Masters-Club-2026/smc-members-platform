import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { monthYear, NEWSLETTERS } from '@/content';

export function generateStaticParams() {
  return NEWSLETTERS.map((n) => ({ slug: n.slug }));
}

export const metadata: Metadata = { title: 'Newsletter · Specialty Masters Club' };

export default async function NewsletterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const n = NEWSLETTERS.find((x) => x.slug === slug);
  if (!n) notFound();
  return (
    <main className="page">
      <p>
        <Link href="/newsletters">← All newsletters</Link>
      </p>
      <p className="tag">
        {n.volume} · {monthYear(n.date)}
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
