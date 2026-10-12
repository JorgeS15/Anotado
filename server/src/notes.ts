export const COLORS = [
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'blue',
  'green',
  'gray',
  'white',
] as const;

export type Color = (typeof COLORS)[number];
export type NoteType = 'text' | 'checklist';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  id: string;
  type: NoteType;
  title: string;
  content: string;
  items: ChecklistItem[];
  color: Color;
  pinned: boolean;
  archived: boolean;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export class ValidationError extends Error {}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXT = 200_000;
const MAX_ITEMS = 2_000;

function str(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  if (value.length > max) throw new ValidationError(`${field} is too long`);
  return value;
}

function time(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(`${field} must be a timestamp`);
  }
  return Math.floor(value);
}

export function validateId(id: unknown): string {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new ValidationError('invalid id');
  return id;
}

export function validateNote(input: unknown): Note {
  if (!input || typeof input !== 'object') throw new ValidationError('note must be an object');
  const n = input as Record<string, unknown>;

  const type = n.type === 'checklist' ? 'checklist' : 'text';
  const color = COLORS.includes(n.color as Color) ? (n.color as Color) : 'yellow';

  const rawItems = n.items ?? [];
  if (!Array.isArray(rawItems)) throw new ValidationError('items must be an array');
  if (rawItems.length > MAX_ITEMS) throw new ValidationError('too many items');
  const items = rawItems.map((raw, i): ChecklistItem => {
    if (!raw || typeof raw !== 'object') throw new ValidationError(`items[${i}] must be an object`);
    const item = raw as Record<string, unknown>;
    return {
      id: validateId(item.id),
      text: str(item.text, `items[${i}].text`, 10_000),
      done: item.done === true,
    };
  });

  const updated_at = time(n.updated_at, 'updated_at');
  return {
    id: validateId(n.id),
    type,
    title: str(n.title, 'title', 1_000),
    content: str(n.content, 'content', MAX_TEXT),
    items,
    color,
    pinned: n.pinned === true,
    archived: n.archived === true,
    deleted_at: n.deleted_at === null || n.deleted_at === undefined ? null : time(n.deleted_at, 'deleted_at'),
    created_at: n.created_at === undefined ? updated_at : time(n.created_at, 'created_at'),
    updated_at,
  };
}
