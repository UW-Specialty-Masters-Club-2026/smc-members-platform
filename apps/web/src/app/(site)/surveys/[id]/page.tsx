'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type SurveyQuestion } from '@/lib/api';

type Answer = { questionId: string; rating?: number; choice?: string; text?: string };

interface MemberSurvey {
  id: string;
  title: string;
  intro: string | null;
  event: { title: string; when: string };
  open: boolean;
  responded: boolean;
  questions: SurveyQuestion[];
}

export default function SurveyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [survey, setSurvey] = useState<MemberSurvey | null>(null);
  const [state, setState] = useState<'loading' | 'missing' | 'form' | 'done'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<MemberSurvey>(`/surveys/${id}`).then((res) => {
      if (res.status === 401) return router.replace('/login');
      if (!res.ok || !res.data) return setState('missing');
      setSurvey(res.data);
      setState(res.data.responded ? 'done' : 'form');
    });
  }, [id, router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!survey) return;
    const f = new FormData(e.currentTarget);
    const answers = survey.questions.flatMap((q): Answer[] => {
      const v = f.get(q.id);
      if (v === null || v === '') return [];
      if (q.kind === 'RATING') return [{ questionId: q.id, rating: Number(v) }];
      if (q.kind === 'SINGLE_CHOICE') return [{ questionId: q.id, choice: String(v) }];
      return [{ questionId: q.id, text: String(v) }];
    });
    setBusy(true);
    setError(null);
    const res = await api(`/surveys/${id}/responses`, { method: 'POST', body: { answers } });
    setBusy(false);
    if (res.ok || res.error === 'already_responded') setState('done');
    else
      setError(
        res.error === 'survey_closed'
          ? 'This survey has closed.'
          : res.error === 'missing_required_answers'
            ? 'Please answer the required questions.'
            : 'Could not submit. Please check your answers.',
      );
  }

  if (state === 'loading') {
    return (
      <main className="page page--narrow">
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (state === 'missing' || !survey) {
    return (
      <main className="page page--narrow">
        <h1 className="display">Survey not found</h1>
        <Link href="/me/profile">Back to My profile</Link>
      </main>
    );
  }

  return (
    <main className="page page--narrow" style={{ maxWidth: 640 }}>
      <h1 className="display" style={{ fontSize: 36 }}>
        {survey.title}
      </h1>
      <p className="muted">
        {survey.event.title} · {survey.event.when}
      </p>
      {state === 'done' ? (
        <div className="notice" role="status">
          Thanks for your feedback! <Link href="/me/profile">Back to My profile</Link>
        </div>
      ) : !survey.open ? (
        <div className="notice">This survey has closed.</div>
      ) : (
        <form className="card" onSubmit={submit}>
          {survey.intro && <p className="muted">{survey.intro}</p>}
          {error && (
            <div className="notice notice--error" role="alert">
              {error}
            </div>
          )}
          {survey.questions.map((q) => (
            <fieldset key={q.id} className="survey-q">
              <legend>
                {q.position}. {q.prompt}
                {!q.required && <span className="muted"> (optional)</span>}
              </legend>
              {q.kind === 'RATING' && (
                <div className="rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n}>
                      <input type="radio" name={q.id} value={n} required={q.required} />
                      <span>{n}</span>
                    </label>
                  ))}
                  <span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>
                    1 = poor · 5 = excellent
                  </span>
                </div>
              )}
              {q.kind === 'SINGLE_CHOICE' && (
                <div>
                  {(q.options ?? []).map((o) => (
                    <label key={o} className="check" style={{ margin: '0 0 8px' }}>
                      <input type="radio" name={q.id} value={o} required={q.required} />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              )}
              {q.kind === 'TEXT' && (
                <label className="field" style={{ marginBottom: 0 }}>
                  <span className="sr-only">{q.prompt}</span>
                  <textarea name={q.id} rows={4} maxLength={2000} required={q.required} />
                </label>
              )}
            </fieldset>
          ))}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Submit feedback'}
          </button>
        </form>
      )}
    </main>
  );
}
