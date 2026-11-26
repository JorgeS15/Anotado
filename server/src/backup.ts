import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from './db.ts';

const NAME_RE = /^anotado-\d{4}-\d{2}-\d{2}\.json$/;

/**
 * Writes one JSON snapshot of all notes per day to `dir`, keeping the newest `keep`.
 * Returns the file written, or null if today's snapshot already exists.
 */
export function dailyBackup(store: Store, dir: string, keep: number, now = new Date()): string | null {
  mkdirSync(dir, { recursive: true });
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
  const file = join(dir, `anotado-${date}.json`);
  let written: string | null = null;
  if (!existsSync(file)) {
    const data = { app: 'anotado', version: 1, exported_at: now.getTime(), notes: store.all() };
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
    written = file;
  }
  const old = readdirSync(dir)
    .filter((f) => NAME_RE.test(f))
    .sort()
    .reverse()
    .slice(keep);
  for (const f of old) unlinkSync(join(dir, f));
  return written;
}

export interface BackupInfo {
  name: string;
  size: number;
  /** When the backup was written. */
  created_at: number;
}

/** Daily backups in `dir`, newest first. */
export function listBackups(dir: string): BackupInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => NAME_RE.test(f))
    .sort()
    .reverse()
    .map((name) => {
      const stat = statSync(join(dir, name));
      return { name, size: stat.size, created_at: stat.mtimeMs };
    });
}

/** The path of a backup by name, or null if the name is not a backup in `dir`. */
export function backupPath(dir: string, name: string): string | null {
  if (!NAME_RE.test(name)) return null;
  const file = join(dir, name);
  return existsSync(file) ? file : null;
}

/** Reads the notes of a backup file (raw, to be validated by the caller). */
export function readBackup(file: string): unknown[] {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const notes = Array.isArray(data) ? data : data?.notes;
  if (!Array.isArray(notes)) throw new Error('not an Anotado backup');
  return notes;
}
