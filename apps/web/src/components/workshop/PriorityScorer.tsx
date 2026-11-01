'use client';

import { useId, useState, type FormEvent } from 'react';
import { rankTasks, SAMPLE_TASKS, taskScore, type ScoredTask } from '@/content/workshop';

type Dimension = 'career' | 'joy' | 'urgency';

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: 'career', label: 'Career' },
  { key: 'joy', label: 'Joy' },
  { key: 'urgency', label: 'Urgency' },
];

/** Interactive Career / Joy / Urgency ranking. Nothing is saved or sent anywhere. */
export function PriorityScorer() {
  const [tasks, setTasks] = useState<ScoredTask[]>(SAMPLE_TASKS);
  const [draft, setDraft] = useState('');
  const [nextId, setNextId] = useState(1);
  const inputId = useId();

  const ranked = rankTasks(tasks);
  const set = (id: string, key: Dimension, value: number) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, [key]: value } : t)));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setTasks((ts) => [...ts, { id: `new-${nextId}`, title, career: 3, joy: 3, urgency: 3 }]);
    setNextId((n) => n + 1);
    setDraft('');
  };

  return (
    <div className="scorer">
      <ol className="scorer__list" aria-label="Tasks ranked by total score">
        {ranked.map((t, i) => (
          <li key={t.id} className="scorer__task">
            <div className="scorer__head">
              <span className="scorer__rank" aria-hidden="true">
                {i + 1}
              </span>
              <h4 className="scorer__title">{t.title}</h4>
              <span className="scorer__total">
                {taskScore(t)}
                <span className="scorer__of">/15</span>
              </span>
              <button
                type="button"
                className="scorer__remove"
                onClick={() => setTasks((ts) => ts.filter((x) => x.id !== t.id))}
              >
                <span aria-hidden="true">×</span>
                <span className="sr-only">Remove “{t.title}”</span>
              </button>
            </div>
            <div className="scorer__sliders">
              {DIMENSIONS.map((d) => (
                <label key={d.key} className="scorer__slider">
                  <span>
                    {d.label} <strong>{t[d.key]}</strong>
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={t[d.key]}
                    aria-label={`${d.label} for ${t.title}`}
                    onChange={(e) => set(t.id, d.key, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {tasks.length === 0 && <p className="muted">No tasks yet. Add one below.</p>}
      <form className="scorer__add" onSubmit={add}>
        <label htmlFor={inputId} className="sr-only">
          New task
        </label>
        <input
          id={inputId}
          value={draft}
          maxLength={120}
          placeholder="Add one of your own tasks"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn--small">
          Add task
        </button>
        <button type="button" className="link-button" onClick={() => setTasks(SAMPLE_TASKS)}>
          Reset examples
        </button>
      </form>
    </div>
  );
}
