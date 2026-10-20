import type { NewsView } from '@/lib/api';

/** A news post in the club style: tag, title, summary, numbered openings, how-to-apply box. */
export function NewsStory({ post, full = false }: { post: NewsView; full?: boolean }) {
  return (
    <article className="news-story">
      {post.tag && <p className="tag">{post.tag}</p>}
      <h2 className="news-story__title">{post.title}</h2>
      <p className="muted">{post.summary}</p>
      {full && post.body && (
        <div className="muted" style={{ whiteSpace: 'pre-line' }}>
          {post.body}
        </div>
      )}
      {post.openings.length > 0 && (
        <ol className="openings">
          {post.openings.map((o, i) => (
            <li key={o.title}>
              <span className="openings__num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="openings__title">{o.title}</span>
              <span className="openings__count">
                {o.openings} {o.openings === 1 ? 'opening' : 'openings'}
              </span>
            </li>
          ))}
        </ol>
      )}
      {post.applyEmail && (
        <div className="apply-box">
          <p className="apply-box__title">How to apply</p>
          <div>
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
              Email <a href={`mailto:${post.applyEmail}`}>{post.applyEmail}</a>
              {post.applyChecklist?.length ? ' with:' : ''}
            </p>
            {post.applyChecklist && post.applyChecklist.length > 0 && (
              <ul>
                {post.applyChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
