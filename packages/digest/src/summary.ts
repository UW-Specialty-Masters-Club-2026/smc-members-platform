import type { DigestEvent, DigestNews } from '@smc/email';

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

function count(n: number, singular: string, plural: string): string {
  return `${WORDS[n] ?? String(n)} ${n === 1 ? singular : plural}`;
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]}, and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

/**
 * The hero sentence, built only from counts in the snapshot — e.g.
 * "Two events to save a seat for, and four open roles on the SMC team."
 */
export function summarize(
  events: Pick<DigestEvent, 'id'>[],
  news: Pick<DigestNews, 'openings'>[],
): string {
  const roles = news.reduce((n, p) => n + p.openings.length, 0);
  const updates = news.filter((p) => p.openings.length === 0).length;

  const parts: string[] = [];
  if (events.length)
    parts.push(count(events.length, 'event to save a seat for', 'events to save a seat for'));
  if (roles) parts.push(count(roles, 'open role on the SMC team', 'open roles on the SMC team'));
  if (updates) parts.push(count(updates, 'club update', 'club updates'));

  const sentence = joinParts(parts);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
