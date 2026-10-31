'use client';

import Link from 'next/link';
import { useState } from 'react';
import { monthYear, type ArticleSummary } from '@/content';

export function ArticleList({ articles }: { articles: ArticleSummary[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const categories = [...new Set(articles.map((a) => a.category))];
  const list = category ? articles.filter((a) => a.category === category) : articles;
  return (
    <>
      <div className="filters" role="group" aria-label="Filter by category">
        {[null, ...categories].map((c) => (
          <button
            key={c ?? 'all'}
            type="button"
            className={`chip${category === c ? ' is-active' : ''}`}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c ?? 'All'}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="muted">No articles yet.</p>}
      <ul className="article-grid">
        {list.map((a) => (
          <li key={a.slug} className="article-card">
            {a.imageUrl && <img src={a.imageUrl} alt="" loading="lazy" />}
            <div className="article-card__body">
              <p className="tag">{a.category}</p>
              <h2>
                <Link href={`/articles/${a.slug}`}>{a.title}</Link>
              </h2>
              <p className="muted">{a.subtitle}</p>
              <p className="article-card__meta">
                {a.author} · {monthYear(a.publishedAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
