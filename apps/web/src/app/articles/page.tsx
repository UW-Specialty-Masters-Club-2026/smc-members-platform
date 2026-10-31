import type { Metadata } from 'next';
import { SITE } from '@/content';
import { ArticleList } from './ArticleList';

export const metadata: Metadata = { title: 'Articles & Opinions · Specialty Masters Club' };

export default function ArticlesPage() {
  return (
    <main className="page">
      <p className="eyebrow">Articles & opinions</p>
      <h1 className="display">Your monthly dopamine dose</h1>
      <p className="muted lead">
        Insights, opinions, and stories from the SMC community. Fresh perspectives on business,
        technology, and leadership.
      </p>
      <ArticleList />
      <section className="card" style={{ marginTop: 40 }}>
        <h2 style={{ marginTop: 0 }}>Want to contribute?</h2>
        <p className="muted">
          We’re looking for passionate writers to share their insights on business, technology,
          leadership, and student life. Join our editorial team!
        </p>
        <a className="btn" href={SITE.writeForUsUrl} target="_blank" rel="noopener noreferrer">
          Apply to Write
        </a>
      </section>
    </main>
  );
}
