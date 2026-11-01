import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/db.ts';
import { makeNote } from './helpers.ts';

test('last write wins', () => {
  const store = new Store(':memory:');
  store.upsert(makeNote({ updated_at: 2000, content: 'new' }));
  const stale = store.upsert(makeNote({ updated_at: 1500, content: 'old' }));
  assert.equal(stale.applied, false);
  assert.equal(store.get('n1')?.content, 'new');
});

test('keeps the original created_at', () => {
  const store = new Store(':memory:');
  store.upsert(makeNote({ created_at: 500 }));
  store.upsert(makeNote({ created_at: 900, updated_at: 2000 }));
  assert.equal(store.get('n1')?.created_at, 500);
});

test('concurrent edits from two devices keep a conflict copy', () => {
  const store = new Store(':memory:');
  store.upsert(makeNote({ updated_at: 1000 }), { client: 'phone' });
  // The PC edits on top of version 1000…
  store.upsert(makeNote({ updated_at: 2000, content: 'PC' }), { client: 'pc', base: 1000 });
  // …while the phone, offline, also edited on top of 1000.
  const result = store.upsert(makeNote({ updated_at: 3000, content: 'Telemóvel' }), { client: 'phone', base: 1000 }, 5000);
  assert.equal(result.applied, true);
  assert.equal(store.get('n1')?.content, 'Telemóvel');
  assert.ok(result.conflict);
  assert.equal(result.conflict.content, 'PC');
  assert.equal(result.conflict.title, 'Título (conflito)');
  assert.equal(store.all().length, 2);
});

test('the older side of a conflict becomes the copy', () => {
  const store = new Store(':memory:');
  store.upsert(makeNote({ updated_at: 1000 }), { client: 'phone' });
  store.upsert(makeNote({ updated_at: 3000, content: 'PC' }), { client: 'pc', base: 1000 });
  const result = store.upsert(makeNote({ updated_at: 2000, content: 'Telemóvel' }), { client: 'phone', base: 1000 });
  assert.equal(result.applied, false);
  assert.equal(store.get('n1')?.content, 'PC');
  assert.equal(result.conflict?.content, 'Telemóvel');
});

test('no conflict for consecutive edits from the same device', () => {
  const store = new Store(':memory:');
  store.upsert(makeNote({ updated_at: 1000 }), { client: 'pc', base: undefined });
  store.upsert(makeNote({ updated_at: 2000, content: 'a' }), { client: 'pc', base: 1000 });
  const result = store.upsert(makeNote({ updated_at: 3000, content: 'b' }), { client: 'pc', base: 1000 });
  assert.equal(result.conflict, undefined);
  assert.equal(store.all().length, 1);
});

test('no conflict when only metadata differs', () => {
  const store = new Store(':memory:');
  store.upsert(makeNote({ updated_at: 1000 }), { client: 'phone' });
  store.upsert(makeNote({ updated_at: 2000, color: 'blue' }), { client: 'pc', base: 1000 });
  const result = store.upsert(makeNote({ updated_at: 3000, pinned: true }), { client: 'phone', base: 1000 });
  assert.equal(result.conflict, undefined);
});

test('history keeps previous contents, throttled', () => {
  const store = new Store(':memory:');
  store.upsert(makeNote({ content: 'v1' }), {}, 0);
  store.upsert(makeNote({ content: 'v2', updated_at: 2000 }), {}, 1_000);
  store.upsert(makeNote({ content: 'v3', updated_at: 3000 }), {}, 2_000); // within 10 min: no snapshot
  store.upsert(makeNote({ content: 'v4', updated_at: 4000 }), {}, 20 * 60_000);
  assert.deepEqual(
    store.versions('n1').map((v) => v.note.content),
    ['v3', 'v1'],
  );
  store.upsert(makeNote({ content: 'v5', updated_at: 5000 }), { forceVersion: true }, 20 * 60_000 + 1);
  assert.equal(store.versions('n1')[0].note.content, 'v4');
});

test('metadata-only changes do not create versions', () => {
  const store = new Store(':memory:');
  store.upsert(makeNote());
  store.upsert(makeNote({ color: 'red', updated_at: 2000 }));
  assert.equal(store.versions('n1').length, 0);
});

test('purging the trash removes old trashed notes and their history', () => {
  const store = new Store(':memory:');
  store.upsert(makeNote({ id: 'a', deleted_at: 100 }));
  store.upsert(makeNote({ id: 'a', deleted_at: 100, content: 'x', updated_at: 2000 }));
  store.upsert(makeNote({ id: 'b', deleted_at: 5000 }));
  store.upsert(makeNote({ id: 'c' }));
  assert.deepEqual(store.purgeTrash(1000), ['a']);
  assert.equal(store.versions('a').length, 0);
  assert.deepEqual(store.all().map((n) => n.id).sort(), ['b', 'c']);
});
