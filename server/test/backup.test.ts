import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dailyBackup } from '../src/backup.ts';
import { Store } from '../src/db.ts';
import { makeNote } from './helpers.ts';

test('writes one snapshot per day and prunes old ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anotado-backup-'));
  const store = new Store(':memory:');
  store.upsert(makeNote());
  for (const day of ['2026-01-01', '2026-01-02', '2026-01-03']) writeFileSync(join(dir, `anotado-${day}.json`), '{}');

  const file = dailyBackup(store, dir, 3, new Date(2026, 0, 10, 12));
  assert.ok(file?.endsWith('anotado-2026-01-10.json'));
  assert.equal(JSON.parse(readFileSync(file!, 'utf8')).notes.length, 1);
  assert.deepEqual(readdirSync(dir).sort(), ['anotado-2026-01-02.json', 'anotado-2026-01-03.json', 'anotado-2026-01-10.json']);

  assert.equal(dailyBackup(store, dir, 3, new Date(2026, 0, 10, 18)), null);
});
