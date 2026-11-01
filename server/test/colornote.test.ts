import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ColorNoteError, colorFor, encryptForTest, noteIdFor, parseColorNote } from '../src/colornote.ts';

const records = [
  { _id: 1, uuid: 'aaa-1', title: 'Compras', note: '[ ] Leite\n[V] Ovos\n', type: 16, color_index: 4, created_date: 1000, modified_date: 2000, space: 0 },
  { _id: 2, uuid: 'bbb-2', title: 'Ideia', note: 'Texto {com} chavetas "aspas"', type: 0, color_index: 3, created_date: 1000, modified_date: 1500, space: 16 },
  // An older copy of the first note: the newest wins.
  { _id: 1, uuid: 'aaa-1', title: 'Compras (antigo)', note: '[ ] Leite', type: 16, color_index: 4, created_date: 1000, modified_date: 1000 },
];

/** Mimics the V2 layout: binary preamble, then length-prefixed JSON records. */
function framed(): Buffer {
  const parts = [Buffer.alloc(16, 7)];
  for (const r of records) {
    const json = Buffer.from(JSON.stringify(r));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(json.length);
    parts.push(len, json);
  }
  return Buffer.concat(parts);
}

test('decrypts and parses a V2 backup (28-byte header)', () => {
  const notes = parseColorNote(encryptForTest(framed()));
  assert.equal(notes.length, 2);
  const list = notes.find((n) => n.source_id === 'aaa-1')!;
  assert.equal(list.title, 'Compras');
  assert.equal(list.type, 'checklist');
  assert.deepEqual(
    list.items.map((i) => [i.text, i.done]),
    [
      ['Leite', false],
      ['Ovos', true],
    ],
  );
  assert.equal(list.color_index, 4);
  const text = notes.find((n) => n.source_id === 'bbb-2')!;
  assert.equal(text.type, 'text');
  assert.equal(text.content, 'Texto {com} chavetas "aspas"');
  assert.equal(text.archived, true);
});

test('decrypts a V1 backup (no header) with a custom password', () => {
  const notes = parseColorNote(encryptForTest(framed(), 'segredo', Buffer.alloc(0)), 'segredo');
  assert.equal(notes.length, 2);
});

test('accepts an already decrypted JSON export', () => {
  const notes = parseColorNote(Buffer.from(JSON.stringify(records)));
  assert.equal(notes.length, 2);
});

test('wrong password is reported clearly', () => {
  assert.throws(() => parseColorNote(encryptForTest(framed()), '1234'), ColorNoteError);
});

test('colour mapping and ids', () => {
  assert.equal(colorFor(4), 'green');
  assert.equal(colorFor(4, { 4: 'blue' }), 'blue');
  assert.equal(colorFor(4, { 4: 'not-a-colour' }), 'green');
  assert.equal(colorFor(99), 'yellow');
  assert.equal(noteIdFor('aaa-1'), 'cn-aaa-1');
  assert.match(noteIdFor('%%%'), /^cn-[0-9a-f]{20}$/);
});
