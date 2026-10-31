import { mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
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
