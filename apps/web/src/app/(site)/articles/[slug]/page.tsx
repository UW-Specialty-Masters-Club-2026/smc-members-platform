import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { monthYear, type Article } from '@/content';
import { getContent } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };
const load = async (slug: string) => getContent<Article>(`/articles/${encodeURIComponent(slug)}`);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const a = await load((await params).slug);
  return { title: a ? `${a.title} · SMC` : 'Article not found' };
}

export default async function ArticlePage({ params }: Params) {
  const a = await load((await params).slug);
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
        {a.author} · {monthYear(a.publishedAt)}
      </p>
      {a.imageUrl && <img className="article-hero" src={a.imageUrl} alt={a.imageAlt ?? ''} />}
      {/* Rendered from Markdown and sanitised by the API. */}
      <div className="prose article-body" dangerouslySetInnerHTML={{ __html: a.html }} />
    </main>
  );
}
