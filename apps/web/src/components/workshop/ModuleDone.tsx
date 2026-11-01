'use client';

import { useProgress } from './progress';

/** "Mark as complete" toggle at the end of a module. */
export function ModuleDone({ id, title }: { id: string; title: string }) {
  const { done, toggle } = useProgress();
  const isDone = done.includes(id);
  return (
    <div className="module-done">
      <button
        type="button"
        className={`btn btn--small ${isDone ? '' : 'btn--outline'}`}
        aria-pressed={isDone}
        onClick={() => toggle(id)}
      >
        {isDone ? '✓ Completed' : 'Mark as complete'}
        <span className="sr-only">: {title}</span>
      </button>
    </div>
  );
}
