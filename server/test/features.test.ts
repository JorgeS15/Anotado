import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppOptions } from '../src/app.ts';
import { Store } from '../src/db.ts';
import { UpdateChecker, compareVersions } from '../src/updates.ts';
import { makeNote } from './helpers.ts';

const TOKEN = 'a'.repeat(32);

function setup(options: Partial<AppOptions> = {}) {
  const store = new Store(':memory:');
  const backupDir = mkdtempSync(join(tmpdir(), 'anotado-test-'));
  const { app } = createApp({ store, password: 'pw', secret: 'secret', version: '1.0.0', backupDir, apiToken: TOKEN, ...options });
  let cookie = '';
  const call = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { cookie, ...(init.headers as Record<string, string>) } });
  const json = (path: string, method: string, body: unknown, headers: Record<string, string> = {}) =>
    call(path, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
  const login = async () => {
    const res = await json('/api/login', 'POST', { password: 'pw' });
    cookie = res.headers.get('set-cookie')!.split(';')[0];
  };
  const bearer = { authorization: `Bearer ${TOKEN}` };
  return { store, backupDir, call, json, login, bearer };
}

test('the API token authenticates automations, a wrong one does not', async () => {
  const { call, bearer } = setup();
  assert.equal((await call('/api/notes', { headers: bearer })).status, 200);
  assert.equal((await call('/api/notes', { headers: { authorization: `Bearer ${'b'.repeat(32)}` } })).status, 401);
  const noToken = setup({ apiToken: undefined });
  assert.equal((await noToken.call('/api/notes', { headers: { authorization: 'Bearer ' } })).status, 401);
});

test('adds items to a list by name, creating it and not duplicating items', async () => {
  const { json, store, bearer } = setup();
  let res = await json('/api/lists/items', 'POST', { list: 'Compras', items: ['Leite', 'Pão'] }, bearer);
  let body = await res.json();
  assert.equal(body.created, true);
  assert.deepEqual(body.added, ['Leite', 'Pão']);

  // Same list with other case and accents; "leite" is already there (ticked), so it is unticked.
  const list = store.all()[0];
  store.upsert({ ...list, items: list.items.map((i) => ({ ...i, done: i.text === 'Leite' })), updated_at: list.updated_at + 1 });
  res = await json('/api/lists/items', 'POST', { list: ' compras', text: 'leite\nOvos' }, bearer);
  body = await res.json();
  assert.equal(body.created, false);
  assert.deepEqual(body.added, ['Ovos']);
  assert.deepEqual(body.existing, ['Leite']);
  const items = store.all()[0].items;
  assert.equal(store.all().length, 1);
  assert.deepEqual(
    items.map((i) => [i.text, i.done]),
    [
      ['Leite', false],
      ['Pão', false],
      ['Ovos', false],
    ],
  );

  assert.equal((await json('/api/lists/items', 'POST', { list: '', items: ['x'] }, bearer)).status, 400);
  assert.equal((await json('/api/lists/items', 'POST', { list: 'Compras', items: [] }, bearer)).status, 400);
});

test('creates text and checklist notes from a simple body', async () => {
  const { json, store, bearer } = setup();
  const text = await (await json('/api/notes', 'POST', { title: 'Ideia', content: 'Olá', color: 'blue' }, bearer)).json();
  assert.equal(text.note.type, 'text');
  assert.equal(text.note.color, 'blue');
  const list = await (await json('/api/notes', 'POST', { title: 'Mala', items: ['Escova', 'Carregador'] }, bearer)).json();
  assert.equal(list.note.type, 'checklist');
  assert.equal(list.note.items.length, 2);
  assert.equal(store.all().length, 2);
  assert.equal((await json('/api/notes', 'POST', { color: 'pink' }, bearer)).status, 400);
  assert.equal((await json('/api/notes', 'POST', { title: 'x', color: 'teal' }, bearer)).status, 400);
});

test('settings are validated, stored and shared', async () => {
  const { call, json, login } = setup();
  await login();
  assert.deepEqual(await (await call('/api/settings')).json(), { color_names: {} });
  const res = await json('/api/settings', 'PUT', { color_names: { green: ' Compras ', blue: '' } });
  assert.deepEqual(await res.json(), { color_names: { green: 'Compras' } });
  assert.deepEqual(await (await call('/api/settings')).json(), { color_names: { green: 'Compras' } });
  assert.equal((await json('/api/settings', 'PUT', { color_names: { teal: 'x' } })).status, 400);
});

test('lists, downloads and restores backups', async () => {
  const { call, login, store, backupDir } = setup();
  await login();
  const old = [makeNote({ id: 'a', content: 'antes' }), makeNote({ id: 'gone', content: 'apagada' })];
  writeFileSync(join(backupDir, 'anotado-2026-01-01.json'), JSON.stringify({ app: 'anotado', notes: old }));
  writeFileSync(join(backupDir, 'outro.json'), '{}');

  store.upsert(makeNote({ id: 'a', content: 'depois', updated_at: 5000 }));
  store.upsert(makeNote({ id: 'new', content: 'nova', updated_at: 5000 }));

  const status = await (await call('/api/status')).json();
  assert.deepEqual(
    status.backups.map((b: { name: string }) => b.name),
    ['anotado-2026-01-01.json'],
  );
  assert.equal(status.notes, 2);
  assert.equal(status.api_token, true);

  const download = await call('/api/backups/anotado-2026-01-01.json');
  assert.equal(download.status, 200);
  assert.equal((await download.json()).notes.length, 2);
  assert.equal((await call('/api/backups/outro.json')).status, 404);
  assert.equal((await call('/api/backups/..%2Fanotado.db')).status, 404);

  const res = await call('/api/backups/anotado-2026-01-01.json/restore', { method: 'POST' });
  assert.deepEqual(await res.json(), { restored: 2, total: 2 });
  assert.equal(store.get('a')?.content, 'antes');
  assert.equal(store.get('gone')?.content, 'apagada');
  assert.equal(store.get('new')?.content, 'nova');
  // The content it replaced stays in the history.
  assert.equal(store.versions('a')[0].note.content, 'depois');

  // Restoring again changes nothing.
  const again = await (await call('/api/backups/anotado-2026-01-01.json/restore', { method: 'POST' })).json();
  assert.equal(again.restored, 0);
});

test('the session tells a logged in device the trash period and available update', async () => {
  const updates = new UpdateChecker('1.0.0', (async () =>
    new Response(JSON.stringify({ tag_name: 'v1.2.0', html_url: 'https://example.com/r' }))) as typeof fetch);
  await updates.check();
  const { call, login } = setup({ trashDays: 7, updates });
  assert.equal((await (await call('/api/session')).json()).trash_days, undefined);
  await login();
  const session = await (await call('/api/session')).json();
  assert.equal(session.trash_days, 7);
  assert.deepEqual(session.update, { version: '1.2.0', url: 'https://example.com/r' });
});

test('the update check ignores older releases and failures', async () => {
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
  assert.equal(compareVersions('v1.2.0', '1.2.0'), 0);
  const older = new UpdateChecker('2.0.0', (async () => new Response(JSON.stringify({ tag_name: 'v1.9.0' }))) as typeof fetch);
  await older.check();
  assert.equal(older.available(), null);
  const failing = new UpdateChecker('1.0.0', (async () => {
    throw new Error('offline');
  }) as typeof fetch);
  await failing.check();
  assert.equal(failing.available(), null);
});

test('forwarded addresses are ignored for the login limit unless the proxy is trusted', async () => {
  for (const trustProxy of [true, false]) {
    const { json } = setup({ trustProxy });
    for (let i = 0; i < 10; i++) await json('/api/login', 'POST', { password: 'x' }, { 'x-forwarded-for': `10.0.0.${i}` });
    const status = (await json('/api/login', 'POST', { password: 'x' }, { 'x-forwarded-for': '10.0.0.99' })).status;
    // Trusted: each address has its own limit. Untrusted: they are all the same client, now blocked.
    assert.equal(status, trustProxy ? 401 : 429);
  }
});
