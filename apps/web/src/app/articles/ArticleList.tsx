'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ARTICLE_CATEGORIES, ARTICLES, monthYear } from '@/content';

export function ArticleList() {
  const [category, setCategory] = useState<string | null>(null);
  const list = category ? ARTICLES.filter((a) => a.category === category) : ARTICLES;
  return (
    <>
      <div className="filters" role="group" aria-label="Filter by category">
        {[null, ...ARTICLE_CATEGORIES].map((c) => (
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
      <ul className="article-grid">
        {list.map((a) => (
          <li key={a.slug} className="article-card">
            {a.image && <img src={a.image} alt="" loading="lazy" />}
            <div className="article-card__body">
              <p className="tag">{a.category}</p>
              <h2>
                <Link href={`/articles/${a.slug}`}>{a.title}</Link>
              </h2>
              <p className="muted">{a.subtitle}</p>
              <p className="article-card__meta">
                {a.author} · {monthYear(a.date)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
