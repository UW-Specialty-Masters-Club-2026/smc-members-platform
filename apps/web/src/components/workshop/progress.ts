'use client';

import { useSyncExternalStore } from 'react';

/** Completed workshop modules, kept in this browser only. */
const KEY = 'smc-workshop-progress';
const EVENT = 'smc-workshop-progress';
const EMPTY: string[] = [];

let cache: { raw: string | null; ids: string[] } = { raw: null, ids: EMPTY };

function read(): string[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.ids;
  let ids = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    // Ignore a corrupted value; the next toggle overwrites it.
  }
  cache = { raw, ids };
  return ids;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useProgress() {
  const done = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = (id: string) => {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      return;
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return { done, toggle };
}
