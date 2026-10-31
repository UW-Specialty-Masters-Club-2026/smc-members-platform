import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ARTICLES, monthYear } from '@/content';

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = ARTICLES.find((x) => x.slug === slug);
  return { title: a ? `${a.title} · SMC` : 'Article not found' };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = ARTICLES.find((x) => x.slug === slug);
  if (!a) notFound();
  return (
    <main className="page page--article">
      <p>
        <Link href="/articles">← All articles</Link>
      </p>
      <p className="tag">{a.category}</p>
      <h1 className="article-title">{a.title}</h1>
      <p className="lead muted">{a.subtitle}</p>
      <p className="article-card__meta">
        {a.author} · {monthYear(a.date)}
      </p>
      {a.image && <img className="article-hero" src={a.image} alt={a.imageAlt} />}
      {/* Imported from the club's previous site and reduced to plain formatting tags at import time. */}
      <div className="prose article-body" dangerouslySetInnerHTML={{ __html: a.html }} />
    </main>
  );
}
