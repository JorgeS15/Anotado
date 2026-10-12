import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Note } from './notes.ts';

interface NoteRow {
  id: string;
  type: string;
  title: string;
  content: string;
  items: string;
  color: string;
  pinned: number;
  archived: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

function fromRow(row: NoteRow): Note {
  return {
    id: row.id,
    type: row.type as Note['type'],
    title: row.title,
    content: row.content,
    items: JSON.parse(row.items),
    color: row.color as Note['color'],
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class Store {
  private db: DatabaseSync;

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'text',
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        items TEXT NOT NULL DEFAULT '[]',
        color TEXT NOT NULL DEFAULT 'yellow',
        pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        deleted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  all(): Note[] {
    const rows = this.db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all() as unknown as NoteRow[];
    return rows.map(fromRow);
  }

  get(id: string): Note | undefined {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as unknown as NoteRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  /** Last-write-wins upsert. Returns the stored note and whether the incoming one was applied. */
  upsert(note: Note): { note: Note; applied: boolean } {
    const existing = this.get(note.id);
    if (existing && existing.updated_at > note.updated_at) {
      return { note: existing, applied: false };
    }
    const stored = existing ? { ...note, created_at: Math.min(existing.created_at, note.created_at) } : note;
    this.db
      .prepare(
        `INSERT INTO notes (id, type, title, content, items, color, pinned, archived, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type, title = excluded.title, content = excluded.content, items = excluded.items,
           color = excluded.color, pinned = excluded.pinned, archived = excluded.archived,
           deleted_at = excluded.deleted_at, created_at = excluded.created_at, updated_at = excluded.updated_at`,
      )
      .run(
        stored.id,
        stored.type,
        stored.title,
        stored.content,
        JSON.stringify(stored.items),
        stored.color,
        stored.pinned ? 1 : 0,
        stored.archived ? 1 : 0,
        stored.deleted_at,
        stored.created_at,
        stored.updated_at,
      );
    return { note: stored, applied: true };
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
  }

  /** Permanently removes notes that have been in the trash since before `before`. */
  purgeTrash(before: number): string[] {
    const rows = this.db
      .prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ? RETURNING id')
      .all(before) as unknown as { id: string }[];
    return rows.map((r) => r.id);
  }

  getMeta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
