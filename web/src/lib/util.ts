import type { ChecklistItem, Note } from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

/** Lowercase and strip accents, so "acucar" finds "Açúcar". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function isEmpty(note: Note): boolean {
  return !note.title.trim() && !note.content.trim() && !note.items.some((i) => i.text.trim());
}

export function searchText(note: Note): string {
  return normalize([note.title, note.content, ...note.items.map((i) => i.text)].join('\n'));
}

export function textToItems(text: string): ChecklistItem[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ id: uid(), text: line, done: false }));
}

export function itemsToText(items: ChecklistItem[]): string {
  return items.map((i) => i.text).join('\n');
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

export function findLinks(text: string): string[] {
  return [...new Set(text.match(URL_RE) ?? [])];
}

const fullDate = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' });
const shortDate = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' });
const timeOnly = new Intl.DateTimeFormat('pt-PT', { timeStyle: 'short' });

export function formatFull(ts: number): string {
  return fullDate.format(ts);
}

export function formatShort(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return timeOnly.format(d);
  if (d.getFullYear() === now.getFullYear()) return shortDate.format(d);
  return d.toLocaleDateString('pt-PT');
}

export function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(`anotado:${key}`);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(`anotado:${key}`, value);
  } catch {
    /* ignore */
  }
}
