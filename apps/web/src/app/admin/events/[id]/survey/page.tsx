'use client';

import { toPtLocalInput } from '@smc/core/time';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, type QuestionKind, type SurveyQuestion } from '@/lib/api';

interface StaffSurvey {
  id: string;
  title: string;
  intro: string | null;
  audience: 'ATTENDEES' | 'REGISTRANTS';
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  open: boolean;
  closesAt: string | null;
  responseCount: number;
  questions: SurveyQuestion[];
}

type ResultQuestion = SurveyQuestion & {
  answered: number;
  average?: number | null;
  distribution?: number[];
  counts?: Record<string, number>;
  texts?: string[];
};

interface Results {
  responseCount: number;
  eligibleCount: number;
  questions: ResultQuestion[];
}

interface DraftQuestion {
  kind: QuestionKind;
  prompt: string;
  required: boolean;
  options: string;
}

const STARTER: DraftQuestion[] = [
  { kind: 'RATING', prompt: 'Overall, how was the event?', required: true, options: '' },
  {
    kind: 'TEXT',
    prompt: 'What should we do differently next time?',
    required: false,
    options: '',
  },
];

const ERRORS: Record<string, string> = {
  event_not_started: 'You can release the survey once the event has started.',
  event_not_active: 'Surveys can’t be released for draft or cancelled events.',
  survey_has_no_questions: 'Add at least one question first.',
  survey_locked: 'Questions can’t change after the survey is released.',
  invalid_request: 'Check the questions: single-choice questions need 2–10 distinct options.',
};

export default function SurveyAdminPage() {
  const { id } = useParams<{ id: string }>();
  const [survey, setSurvey] = useState<StaffSurvey | null | undefined>(undefined);
  const [results, setResults] = useState<Results | null>(null);
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [audience, setAudience] = useState<'ATTENDEES' | 'REGISTRANTS'>('ATTENDEES');
  const [closesAtPt, setClosesAtPt] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>(STARTER);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<StaffSurvey>(`/admin/events/${id}/survey`);
    const s = res.ok ? res.data : null;
    setSurvey(s);
    if (s) {
      setTitle(s.title);
      setIntro(s.intro ?? '');
      setAudience(s.audience);
      setClosesAtPt(s.closesAt ? toPtLocalInput(new Date(s.closesAt)) : '');
      setQuestions(
        s.questions.map((q) => ({
          kind: q.kind,
          prompt: q.prompt,
          required: q.required,
          options: (q.options ?? []).join('\n'),
        })),
      );
      if (s.status !== 'DRAFT') {
        const r = await api<Results>(`/admin/events/${id}/survey/results`);
        setResults(r.data);
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateQuestion(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }

  async function save() {
    setMessage(null);
    const res = await api<StaffSurvey>(`/admin/events/${id}/survey`, {
      method: 'PUT',
      body: {
        title,
        intro: intro.trim() || null,
        audience,
        closesAtPt: closesAtPt || null,
        questions: questions.map((q) => ({
          kind: q.kind,
          prompt: q.prompt,
          required: q.required,
          options:
            q.kind === 'SINGLE_CHOICE'
              ? q.options
                  .split('\n')
                  .map((o) => o.trim())
                  .filter(Boolean)
              : null,
        })),
      },
    });
    setMessage(res.ok ? 'Draft saved.' : (ERRORS[res.error ?? ''] ?? 'Could not save.'));
    if (res.ok) await load();
  }

  async function setStatus(action: 'open' | 'close') {
    const res = await api(`/admin/events/${id}/survey/${action}`, { method: 'POST' });
    setMessage(
      res.ok
        ? action === 'open'
          ? 'Survey released. Eligible members can now answer it.'
          : 'Survey closed.'
        : (ERRORS[res.error ?? ''] ?? 'That change isn’t possible.'),
    );
    await load();
  }

  if (survey === undefined) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const editable = !survey || survey.status === 'DRAFT';

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <p>
        <Link href={`/admin/events/${id}`}>← Back to event</Link>
      </p>
      <h1 className="display" style={{ fontSize: 40 }}>
        Feedback survey
      </h1>
      {survey && (
        <p>
          <span className="tag">{survey.status}</span>{' '}
          <span className="muted">{survey.responseCount} responses</span>
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      {editable ? (
        <div className="card">
          <label className="field">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
          </label>
          <label className="field">
            Intro (optional)
            <textarea
              rows={2}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              maxLength={1000}
            />
          </label>
          <div className="field-row">
            <label className="field">
              Who can answer
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as typeof audience)}
              >
                <option value="ATTENDEES">Checked-in attendees</option>
                <option value="REGISTRANTS">Everyone with a confirmed seat</option>
              </select>
            </label>
            <label className="field">
              Closes (Pacific Time, optional)
              <input
                type="datetime-local"
                value={closesAtPt}
                onChange={(e) => setClosesAtPt(e.target.value)}
              />
            </label>
          </div>

          <h2 style={{ fontSize: 18 }}>Questions</h2>
          <ol className="question-list">
            {questions.map((q, i) => (
              <li key={i} className="question-edit">
                <div className="field-row">
                  <label className="field">
                    Type
                    <select
                      value={q.kind}
                      onChange={(e) => updateQuestion(i, { kind: e.target.value as QuestionKind })}
                    >
                      <option value="RATING">Rating 1–5</option>
                      <option value="SINGLE_CHOICE">Single choice</option>
                      <option value="TEXT">Free text</option>
                    </select>
                  </label>
                  <label className="field">
                    Question
                    <input
                      value={q.prompt}
                      maxLength={300}
                      onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
                    />
                  </label>
                </div>
                {q.kind === 'SINGLE_CHOICE' && (
                  <label className="field">
                    Options (one per line)
                    <textarea
                      rows={3}
                      value={q.options}
                      onChange={(e) => updateQuestion(i, { options: e.target.value })}
                    />
                  </label>
                )}
                <div className="toolbar" style={{ marginBottom: 0 }}>
                  <label className="check" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                    />
                    <span>Required</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn--outline btn--small"
                    onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                    aria-label={`Remove question ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="toolbar">
            <button
              type="button"
              className="btn btn--outline"
              disabled={questions.length >= 20}
              onClick={() =>
                setQuestions((qs) => [
                  ...qs,
                  { kind: 'RATING', prompt: '', required: true, options: '' },
                ])
              }
            >
              Add question
            </button>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--outline" onClick={() => void save()}>
                Save draft
              </button>
              {survey && (
                <button type="button" className="btn" onClick={() => void setStatus('open')}>
                  Release survey
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {survey?.status === 'OPEN' && (
            <p>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => void setStatus('close')}
              >
                Close survey
              </button>
            </p>
          )}
          {results && <SurveyResults results={results} />}
        </>
      )}
    </main>
  );
}

function SurveyResults({ results }: { results: Results }) {
  return (
    <section aria-labelledby="results">
      <h2 id="results">
        Results · {results.responseCount} of {results.eligibleCount} eligible responded
      </h2>
      <p className="muted">Answers are shown without names.</p>
      {results.questions.map((q) => (
        <div key={q.id} className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0, fontSize: 16 }}>
            {q.position}. {q.prompt}
          </h3>
          {q.kind === 'RATING' && (
            <>
              <p style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>
                {q.average ?? '–'}{' '}
                <span className="muted" style={{ fontSize: 14 }}>
                  / 5 · {q.answered} answers
                </span>
              </p>
              <table className="data" style={{ maxWidth: 320 }}>
                <tbody>
                  {q.distribution!.map((n, i) => (
                    <tr key={i}>
                      <th scope="row" style={{ width: 60 }}>
                        {i + 1}
                      </th>
                      <td>{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {q.kind === 'SINGLE_CHOICE' && (
            <table className="data" style={{ maxWidth: 420 }}>
              <tbody>
                {Object.entries(q.counts!).map(([option, n]) => (
                  <tr key={option}>
                    <th scope="row">{option}</th>
                    <td>{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {q.kind === 'TEXT' &&
            (q.texts!.length ? (
              <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
                {q.texts!.map((t, i) => (
                  <li key={i} style={{ whiteSpace: 'pre-line', marginBottom: 6 }}>
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No answers yet.</p>
            ))}
        </div>
      ))}
    </section>
  );
}
