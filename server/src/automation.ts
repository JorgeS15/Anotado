import { randomUUID } from 'node:crypto';
import type { Store, UpsertResult } from './db.ts';
import { COLORS, ValidationError, validateNote, type ChecklistItem, type Color, type Note } from './notes.ts';

/**
 * Simple operations for automations (Home Assistant, iPhone Shortcuts, Tasker…),
 * which only know a list's name and some text, not note ids or the sync model.
 */

/** Lowercase, without accents or surrounding spaces, so "Compras" matches "compras ". */
export function normalizeTitle(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function newId(): string {
  return randomUUID();
}

function lines(value: unknown, field: string): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : null;
  if (!list || list.some((v) => typeof v !== 'string')) throw new ValidationError(`${field} must be text or a list of text`);
  return (list as string[]).map((v) => v.trim()).filter(Boolean);
}

function color(value: unknown): Color | undefined {
  if (value === undefined) return undefined;
  if (!COLORS.includes(value as Color)) throw new ValidationError(`color must be one of: ${COLORS.join(', ')}`);
  return value as Color;
}

/** The live (not in the trash) checklist with this title, if there is one. Pinned and recent ones first. */
export function findList(store: Store, title: string): Note | undefined {
  const wanted = normalizeTitle(title);
  return store
    .all()
    .filter((n) => n.type === 'checklist' && n.deleted_at === null && normalizeTitle(n.title) === wanted)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || Number(b.pinned) - Number(a.pinned) || b.updated_at - a.updated_at)[0];
}

export interface AddItemsResult extends UpsertResult {
  added: string[];
  /** Items that were already on the list, unticked again if they were done. */
  existing: string[];
  created: boolean;
}

/**
 * Adds items to the checklist named `list`, creating it if needed. An item
 * already on the list is not duplicated: if it was ticked, it is unticked.
 */
export function addItems(store: Store, body: Record<string, unknown>, client: string, now = Date.now()): AddItemsResult {
  if (typeof body.list !== 'string' || !body.list.trim()) throw new ValidationError('list must be the name of a checklist');
  const items = lines(body.items ?? body.item ?? body.text, 'items');
  if (!items.length) throw new ValidationError('items must not be empty');

  const existingNote = findList(store, body.list);
  const note: Note = existingNote
    ? structuredClone(existingNote)
    : {
        id: newId(),
        type: 'checklist',
        title: body.list.trim(),
        content: '',
        items: [],
        color: color(body.color) ?? 'yellow',
        pinned: false,
        archived: false,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      };

  const added: string[] = [];
  const existing: string[] = [];
  for (const text of items) {
    const same = note.items.find((i) => normalizeTitle(i.text) === normalizeTitle(text));
    if (same) {
      same.done = false;
      existing.push(same.text);
      continue;
    }
    const item: ChecklistItem = { id: newId(), text, done: false };
    // New items go after the last open one, like in the app.
    let at = note.items.length;
    while (at > 0 && note.items[at - 1].done) at--;
    note.items.splice(at, 0, item);
    added.push(text);
  }
  note.archived = false;
  note.updated_at = Math.max(now, (existingNote?.updated_at ?? 0) + 1);
  const result = store.upsert(validateNote(note), { client });
  return { ...result, added, existing, created: !existingNote };
}

/** Creates a note from a simple body: `{ title, content }` or `{ title, items: [...] }`. */
export function createNote(store: Store, body: Record<string, unknown>, client: string, now = Date.now()): UpsertResult {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const hasItems = body.items !== undefined;
  const items = hasItems ? lines(body.items, 'items').map((text) => ({ id: newId(), text, done: false })) : [];
  const content = typeof body.content === 'string' ? body.content : '';
  if (!title && !content.trim() && !items.length) throw new ValidationError('a note needs a title, content or items');
  const note = validateNote({
    id: newId(),
    type: hasItems ? 'checklist' : 'text',
    title,
    content: hasItems ? '' : content,
    items,
    color: color(body.color) ?? 'yellow',
    pinned: body.pinned === true,
    archived: false,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  });
  return store.upsert(note, { client });
}
