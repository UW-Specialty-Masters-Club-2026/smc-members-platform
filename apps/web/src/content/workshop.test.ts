import { describe, expect, it } from 'vitest';
import { MODULES, PROMPTS, rankTasks, SAMPLE_TASKS, taskScore, WORKSHOP } from './workshop';

describe('workshop content', () => {
  it('keeps the official Luma title', () => {
    expect(WORKSHOP.title).toBe(
      'Build with Claude at UW Foster: Your AI Chief of Staff + Vibecoded App',
    );
  });

  it('has eight modules with unique ids', () => {
    expect(MODULES).toHaveLength(8);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(8);
  });

  it('gives every prompt a source', () => {
    for (const p of Object.values(PROMPTS)) expect(p.source).not.toBe('');
  });
});

describe('rankTasks', () => {
  it('sums the three dimensions', () => {
    expect(taskScore({ career: 5, joy: 2, urgency: 4 })).toBe(11);
  });

  it('puts the highest score first and keeps ties in their original order', () => {
    const tasks = [
      { id: 'a', title: 'A', career: 1, joy: 1, urgency: 1 },
      { id: 'b', title: 'B', career: 3, joy: 3, urgency: 3 },
      { id: 'c', title: 'C', career: 5, joy: 2, urgency: 2 },
    ];
    expect(rankTasks(tasks).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate its input', () => {
    const before = SAMPLE_TASKS.map((t) => t.id);
    rankTasks(SAMPLE_TASKS);
    expect(SAMPLE_TASKS.map((t) => t.id)).toEqual(before);
  });
});
