import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
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

export interface NoteVersion {
  id: number;
  note_id: string;
  saved_at: number;
  note: Note;
}

export interface UpsertOptions {
  /** The server `updated_at` the client based its edit on, if known. */
  base?: number;
  /** Which device made the edit. */
  client?: string;
  /** Always snapshot the previous version, ignoring the throttle. */
  forceVersion?: boolean;
}

export interface UpsertResult {
  note: Note;
  applied: boolean;
  /** A copy of the losing side, when two devices edited the same note concurrently. */
  conflict?: Note;
}

/** Snapshot the previous content at most this often while a note is being edited. */
const VERSION_INTERVAL = 10 * 60 * 1000;
const MAX_VERSIONS = 50;

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

export function sameContent(a: Note, b: Note): boolean {
  return (
    a.type === b.type &&
    a.title === b.title &&
    a.content === b.content &&
    JSON.stringify(a.items) === JSON.stringify(b.items)
  );
}

export class Store {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
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
      CREATE TABLE IF NOT EXISTS note_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT NOT NULL,
        saved_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS note_versions_note ON note_versions (note_id, saved_at);
    `);
    const columns = this.db.prepare('PRAGMA table_info(notes)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'last_client')) {
      this.db.exec('ALTER TABLE notes ADD COLUMN last_client TEXT');
    }
  }

  all(): Note[] {
    const rows = this.db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all() as unknown as NoteRow[];
    return rows.map(fromRow);
  }

  get(id: string): Note | undefined {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as unknown as NoteRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  private lastClient(id: string): string | null {
    const row = this.db.prepare('SELECT last_client FROM notes WHERE id = ?').get(id) as
      | { last_client: string | null }
      | undefined;
    return row?.last_client ?? null;
  }

  private write(note: Note, client: string | null) {
    this.db
      .prepare(
        `INSERT INTO notes (id, type, title, content, items, color, pinned, archived, deleted_at, created_at, updated_at, last_client)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type, title = excluded.title, content = excluded.content, items = excluded.items,
           color = excluded.color, pinned = excluded.pinned, archived = excluded.archived,
           deleted_at = excluded.deleted_at, created_at = excluded.created_at, updated_at = excluded.updated_at,
           last_client = excluded.last_client`,
      )
      .run(
        note.id,
        note.type,
        note.title,
        note.content,
        JSON.stringify(note.items),
        note.color,
        note.pinned ? 1 : 0,
        note.archived ? 1 : 0,
        note.deleted_at,
        note.created_at,
        note.updated_at,
        client,
      );
  }

  /**
   * Last-write-wins upsert with conflict detection: when the stored note was
   * changed by another device after the version this edit was based on, and
   * the contents differ, the losing side is kept as a separate "(conflito)" note.
   */
  upsert(note: Note, options: UpsertOptions = {}, now = Date.now()): UpsertResult {
    const client = options.client ?? null;
    return this.transaction(() => {
      const existing = this.get(note.id);
      if (!existing) {
        this.write(note, client);
        return { note, applied: true };
      }

      const incoming = { ...note, created_at: Math.min(existing.created_at, note.created_at) };
      const concurrent =
        options.base !== undefined &&
        existing.updated_at > options.base &&
        this.lastClient(note.id) !== client &&
        !sameContent(existing, incoming);

      const applied = incoming.updated_at >= existing.updated_at;
      let conflict: Note | undefined;
      if (concurrent) {
        const loser = applied ? existing : incoming;
        conflict = {
          ...loser,
          id: randomUUID(),
          title: `${loser.title || 'Nota'} (conflito)`,
          pinned: false,
          archived: false,
          deleted_at: null,
          created_at: now,
          updated_at: now,
        };
        this.write(conflict, 'conflict');
      }
      if (!applied) return { note: existing, applied: false, conflict };

      if (!sameContent(existing, incoming)) this.saveVersion(existing, now, options.forceVersion);
      this.write(incoming, client);
      return { note: incoming, applied: true, conflict };
    });
  }

  delete(id: string): boolean {
    this.db.prepare('DELETE FROM note_versions WHERE note_id = ?').run(id);
    return this.db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
  }

  /** Permanently removes notes that have been in the trash since before `before`. */
  purgeTrash(before: number): string[] {
    const rows = this.db
      .prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ? RETURNING id')
      .all(before) as unknown as { id: string }[];
    const ids = rows.map((r) => r.id);
    for (const id of ids) this.db.prepare('DELETE FROM note_versions WHERE note_id = ?').run(id);
    return ids;
  }

  // --- History ---------------------------------------------------------------

  private saveVersion(note: Note, now: number, force = false) {
    const last = this.db
      .prepare('SELECT saved_at FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC, id DESC LIMIT 1')
      .get(note.id) as { saved_at: number } | undefined;
    if (!force && last && now - last.saved_at < VERSION_INTERVAL) return;
    this.db
      .prepare('INSERT INTO note_versions (note_id, saved_at, data) VALUES (?, ?, ?)')
      .run(note.id, now, JSON.stringify(note));
    this.db
      .prepare(
        `DELETE FROM note_versions WHERE note_id = ? AND id NOT IN
           (SELECT id FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC, id DESC LIMIT ?)`,
      )
      .run(note.id, note.id, MAX_VERSIONS);
  }

  versions(noteId: string): NoteVersion[] {
    const rows = this.db
      .prepare('SELECT id, note_id, saved_at, data FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC, id DESC')
      .all(noteId) as unknown as { id: number; note_id: string; saved_at: number; data: string }[];
    return rows.map((r) => ({ id: r.id, note_id: r.note_id, saved_at: r.saved_at, note: JSON.parse(r.data) }));
  }

  version(noteId: string, versionId: number): NoteVersion | undefined {
    return this.versions(noteId).find((v) => v.id === versionId);
  }

  // --- Meta ------------------------------------------------------------------

  getMeta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  private depth = 0;

  transaction<T>(fn: () => T): T {
    // Nested calls join the outer transaction.
    if (this.depth > 0) return fn();
    this.depth++;
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    } finally {
      this.depth--;
    }
  }

  close() {
    this.db.close();
  }
}
