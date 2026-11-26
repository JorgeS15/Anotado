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

const HIDE_DONE_KEY = 'anotado:hide-done';

/** Checklists whose ticked items are collapsed on this device. */
export function hiddenDone(): Set<string> {
  try {
    const ids = JSON.parse(localStorage.getItem(HIDE_DONE_KEY) ?? '[]');
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

export function setHiddenDone(id: string, hidden: boolean): void {
  const ids = hiddenDone();
  if (hidden) ids.add(id);
  else ids.delete(id);
  try {
    localStorage.setItem(HIDE_DONE_KEY, JSON.stringify([...ids].slice(-500)));
  } catch {
    /* ignore */
  }
}

const reminderFormat = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const reminderTime = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' });

/** "hoje, 18:00", "amanhã, 09:00" or "seg., 3/11, 09:00". */
export function formatReminder(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return `hoje, ${reminderTime.format(d)}`;
  if (d.toDateString() === tomorrow.toDateString()) return `amanhã, ${reminderTime.format(d)}`;
  return reminderFormat.format(d);
}

const dayFormat = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

/** "Hoje", "Amanhã" or "quinta-feira, 3 de dezembro", for grouping by day. */
export function formatDay(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã';
  const label = dayFormat.format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
