import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { encryptForTest } from '../src/colornote.ts';
import { Store } from '../src/db.ts';
import { makeNote } from './helpers.ts';

function setup() {
  const store = new Store(':memory:');
  const { app } = createApp({ store, password: 'pw', secret: 'secret', version: '9.9.9' });
  let cookie = '';
  const call = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { cookie, ...(init.headers as Record<string, string>) } });
  const json = (path: string, method: string, body: unknown, headers: Record<string, string> = {}) =>
    call(path, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
  const login = async () => {
    const res = await json('/api/login', 'POST', { password: 'pw' });
    cookie = res.headers.get('set-cookie')!.split(';')[0];
  };
  return { store, call, json, login };
}

test('requires login', async () => {
  const { call, json, login } = setup();
  assert.equal((await call('/api/notes')).status, 401);
  assert.equal((await json('/api/login', 'POST', { password: 'nope' })).status, 401);
  await login();
  assert.equal((await call('/api/notes')).status, 200);
});

test('session and health report version and server time', async () => {
  const { call } = setup();
  const session = await (await call('/api/session')).json();
  assert.equal(session.authenticated, false);
  assert.equal(session.version, '9.9.9');
  assert.ok(Math.abs(session.now - Date.now()) < 5000);
  assert.equal((await (await call('/api/health')).json()).version, '9.9.9');
});

test('PUT detects concurrent edits from different devices', async () => {
  const { json, login, store } = setup();
  await login();
  await json('/api/notes/n1', 'PUT', makeNote(), { 'x-client-id': 'phone' });
  await json('/api/notes/n1', 'PUT', { ...makeNote({ content: 'PC', updated_at: 2000 }), synced: 1000 }, { 'x-client-id': 'pc' });
  const res = await json(
    '/api/notes/n1',
    'PUT',
    { ...makeNote({ content: 'phone', updated_at: 3000 }), synced: 1000 },
    { 'x-client-id': 'phone' },
  );
  const body = await res.json();
  assert.equal(body.applied, true);
  assert.equal(body.conflict.content, 'PC');
  assert.equal(store.all().length, 2);
});

test('history can be listed and restored', async () => {
  const { json, call, login, store } = setup();
  await login();
  await json('/api/notes/n1', 'PUT', makeNote({ content: 'original' }));
  await json('/api/notes/n1', 'PUT', makeNote({ content: 'changed', updated_at: 2000 }));
  const { versions } = await (await call('/api/notes/n1/versions')).json();
  assert.equal(versions.length, 1);
  assert.equal(versions[0].note.content, 'original');

  const res = await call(`/api/notes/n1/versions/${versions[0].id}/restore`, { method: 'POST' });
  assert.equal((await res.json()).note.content, 'original');
  assert.equal(store.get('n1')?.content, 'original');
  // The overwritten content is itself kept in the history.
  assert.equal(store.versions('n1')[0].note.content, 'changed');
});

test('imports a ColorNote backup with a colour mapping', async () => {
  const { call, json, login, store } = setup();
  await login();
  const backup = new Uint8Array(encryptForTest(
    Buffer.from(
      JSON.stringify([
        { uuid: 'u1', title: 'Lista', note: '[ ] Pão', type: 16, color_index: 4, created_date: 1, modified_date: 2 },
        { uuid: 'u2', title: 'Texto', note: 'Olá', type: 0, color_index: 1, created_date: 1, modified_date: 2 },
      ]),
    ),
  ));
  const preview = await (
    await call('/api/colornote/preview', { method: 'POST', body: backup, headers: { 'x-backup-password': '0000' } })
  ).json();
  assert.equal(preview.records.length, 2);
  assert.deepEqual(
    preview.colors.map((c: { index: number; suggested: string }) => [c.index, c.suggested]),
    [
      [1, 'red'],
      [4, 'green'],
    ],
  );

  const result = await (await json('/api/colornote/import', 'POST', { records: preview.records, colors: { 4: 'blue' } })).json();
  assert.deepEqual(result, { imported: 2, total: 2 });
  assert.equal(store.get('cn-u1')?.color, 'blue');
  assert.equal(store.get('cn-u1')?.type, 'checklist');
  assert.equal(store.get('cn-u2')?.color, 'red');

  const bad = await call('/api/colornote/preview', { method: 'POST', body: backup, headers: { 'x-backup-password': 'x' } });
  assert.equal(bad.status, 400);
});
