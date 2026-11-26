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

test('copies a backup to WebDAV, keeping the error when it fails', async () => {
  const { WebDavUploader } = await import('../src/remote.ts');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'anotado-remote-'));
  const file = join(dir, 'anotado-2026-01-02.json');
  writeFileSync(file, '{"notes":[]}');

  const calls: { url: string; auth: string | null; body: string }[] = [];
  let status = 201;
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, auth: new Headers(init.headers).get('authorization'), body: String(init.body) });
    return new Response(null, { status });
  }) as unknown as typeof fetch;

  const up = new WebDavUploader('https://user:secret@cloud.example/dav/Anotado', 'jo', 'pw', fake);
  assert.equal(up.status.target, 'https://cloud.example/dav/Anotado/');
  assert.equal(up.pending('anotado-2026-01-02.json'), true);
  assert.equal(await up.upload(file, 10), true);
  assert.equal(calls[0].url, 'https://cloud.example/dav/Anotado/anotado-2026-01-02.json');
  assert.equal(calls[0].auth, `Basic ${Buffer.from('jo:pw').toString('base64')}`);
  assert.equal(calls[0].body, '{"notes":[]}');
  assert.equal(up.pending('anotado-2026-01-02.json'), false);

  // Credentials in the URL are used when no user is given.
  const fromUrl = new WebDavUploader('https://ana:s%40l@cloud.example/dav', undefined, undefined, fake);
  await fromUrl.upload(file);
  assert.equal(calls[1].auth, `Basic ${Buffer.from('ana:s@l').toString('base64')}`);

  status = 409;
  assert.equal(await up.upload(file, 20), false);
  assert.match(up.status.last_error!.message, /409/);
  assert.equal(up.status.last_ok?.at, 10);
});
