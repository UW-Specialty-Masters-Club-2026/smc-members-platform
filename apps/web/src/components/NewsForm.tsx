'use client';

import { useState } from 'react';
import { NewsStory } from '@/components/NewsStory';
import type { NewsView } from '@/lib/api';

export interface NewsFormBody {
  tag: string | null;
  title: string;
  summary: string;
  body: string | null;
  linkUrl: string | null;
  applyEmail: string | null;
  applyChecklist: string[] | null;
  openings: { title: string; openings: number }[];
}

type Result = { ok: boolean; error: string | null; fields?: string[] };

/** Create/edit a news post, with a live preview in the digest's "Club news" style. */
export function NewsForm({
  initial,
  disabled,
  submitLabel,
  onSubmit,
}: {
  initial?: NewsView;
  disabled?: boolean;
  submitLabel: string;
  onSubmit: (body: NewsFormBody) => Promise<Result>;
}) {
  const [tag, setTag] = useState(initial?.tag ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl ?? '');
  const [applyEmail, setApplyEmail] = useState(initial?.applyEmail ?? '');
  const [checklist, setChecklist] = useState((initial?.applyChecklist ?? []).join('\n'));
  const [openings, setOpenings] = useState(initial?.openings ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badFields, setBadFields] = useState<string[]>([]);

  const formBody: NewsFormBody = {
    tag: tag.trim() || null,
    title: title.trim(),
    summary: summary.trim(),
    body: body.trim() || null,
    linkUrl: linkUrl.trim() || null,
    applyEmail: applyEmail.trim() || null,
    applyChecklist: checklist.trim()
      ? checklist
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      : null,
    openings: openings.filter((o) => o.title.trim()),
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await onSubmit(formBody);
    setBusy(false);
    setBadFields(res.fields ?? []);
    if (!res.ok) {
      setError(
        res.error === 'news_archived'
          ? 'Archived posts can’t be edited.'
          : 'Please check the highlighted fields.',
      );
    }
  }

  const invalid = (f: string) =>
    badFields.some((b) => b === f || b.startsWith(`${f}.`)) ? true : undefined;

  return (
    <div className="split">
      <form className="card" onSubmit={submit}>
        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}
        <fieldset disabled={disabled || busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <label className="field">
            Tag (optional, e.g. NOW RECRUITING)
            <input
              value={tag}
              maxLength={40}
              onChange={(e) => setTag(e.target.value)}
              aria-invalid={invalid('tag')}
            />
          </label>
          <label className="field">
            Title
            <input
              required
              minLength={3}
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={invalid('title')}
            />
          </label>
          <label className="field">
            Summary (shown in the weekly digest)
            <textarea
              required
              minLength={10}
              maxLength={600}
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              aria-invalid={invalid('summary')}
            />
          </label>
          <label className="field">
            Full text (optional, for the news page)
            <textarea
              rows={5}
              maxLength={20000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <label className="field">
            External link (optional; “Read more” goes here instead of our news page)
            <input
              type="url"
              value={linkUrl}
              maxLength={500}
              placeholder="https://"
              onChange={(e) => setLinkUrl(e.target.value)}
              aria-invalid={invalid('linkUrl')}
            />
          </label>

          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Open roles (recruiting posts)</h3>
          {openings.map((o, i) => (
            <div key={i} className="field-row" style={{ alignItems: 'end' }}>
              <label className="field">
                Role {i + 1}
                <input
                  value={o.title}
                  maxLength={120}
                  onChange={(e) =>
                    setOpenings((os) =>
                      os.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                  aria-invalid={invalid(`openings.${i}`)}
                />
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 16 }}>
                <label className="field" style={{ marginBottom: 0, flex: 1 }}>
                  Openings
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={o.openings}
                    onChange={(e) =>
                      setOpenings((os) =>
                        os.map((x, j) =>
                          j === i ? { ...x, openings: Number(e.target.value) || 1 } : x,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  style={{ minHeight: 48 }}
                  aria-label={`Remove role ${i + 1}`}
                  onClick={() => setOpenings((os) => os.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <p>
            <button
              type="button"
              className="btn btn--outline btn--small"
              disabled={openings.length >= 20}
              onClick={() => setOpenings((os) => [...os, { title: '', openings: 1 }])}
            >
              Add role
            </button>
          </p>

          <label className="field">
            How to apply: email (optional)
            <input
              type="email"
              value={applyEmail}
              maxLength={320}
              placeholder="smcommittee@uw.edu"
              onChange={(e) => setApplyEmail(e.target.value)}
              aria-invalid={invalid('applyEmail')}
            />
          </label>
          <label className="field">
            How to apply: what to include (one per line)
            <textarea
              rows={3}
              value={checklist}
              onChange={(e) => setChecklist(e.target.value)}
              aria-invalid={invalid('applyChecklist')}
            />
          </label>
          <button className="btn" type="submit">
            {busy ? 'Saving…' : submitLabel}
          </button>
        </fieldset>
      </form>

      <section aria-label="Preview">
        <p className="muted" style={{ marginTop: 0, fontWeight: 700 }}>
          Preview
        </p>
        <div className="news-list">
          <NewsStory
            post={{
              ...formBody,
              id: 'preview',
              slug: 'preview',
              title: formBody.title || 'Title',
              summary: formBody.summary || 'Summary',
              url: '#',
              status: 'DRAFT',
              publishedAt: null,
            }}
          />
        </div>
      </section>
    </div>
  );
}
