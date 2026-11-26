import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { createApp } from '../src/app.ts';
import { Store } from '../src/db.ts';
import { reminderPayload, sendDueReminders } from '../src/reminders.ts';
import { generateVapidKeys } from '../src/webpush.ts';
import { makeNote } from './helpers.ts';

function subscription(endpoint: string) {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  return { endpoint, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } };
}

test('due reminders are sent once to every device, and expired subscriptions are forgotten', async () => {
  const store = new Store(':memory:');
  store.upsert(makeNote({ id: 'due', title: 'Ligar ao médico', reminder_at: 5000 }));
  store.upsert(makeNote({ id: 'later', reminder_at: 50_000 }));
  store.upsert(makeNote({ id: 'trash', reminder_at: 1000, deleted_at: 2000 }));
  store.addSubscription(subscription('https://push.example/ok'));
  store.addSubscription(subscription('https://push.example/gone'));

  const calls: string[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push(url);
    assert.match(new Headers(init.headers).get('authorization')!, /^vapid t=.+, k=.+$/);
    return new Response(null, { status: url.endsWith('gone') ? 410 : 201 });
  }) as unknown as typeof fetch;
  const push = { keys: generateVapidKeys(), subject: 'mailto:a@b.c', fetcher };
  const shown: string[] = [];

  assert.equal(await sendDueReminders(store, push, (n) => shown.push(n.id), 10_000), 1);
  assert.deepEqual(shown, ['due']);
  assert.deepEqual(calls.sort(), ['https://push.example/gone', 'https://push.example/ok']);
  assert.deepEqual(
    store.subscriptions().map((s) => s.endpoint),
    ['https://push.example/ok'],
  );

  // Not sent again, until the reminder gets a new time.
  assert.equal(await sendDueReminders(store, push, () => {}, 20_000), 0);
  store.upsert(makeNote({ id: 'due', title: 'Ligar ao médico', reminder_at: 15_000, updated_at: 3000 }));
  assert.equal(await sendDueReminders(store, push, () => {}, 20_000), 1);
});

test('the reminder text shows the title and the open items', () => {
  const payload = reminderPayload(
    makeNote({
      title: 'Compras',
      type: 'checklist',
      content: '',
      items: [
        { id: 'a', text: 'Leite', done: false },
        { id: 'b', text: 'Pão', done: true },
      ],
    }),
  );
  assert.deepEqual(payload, { title: 'Compras', body: '☐ Leite', id: 'n1' });
  assert.deepEqual(reminderPayload(makeNote({ title: '', content: 'Primeira linha\nresto' })), {
    title: 'Primeira linha',
    body: 'resto',
    id: 'n1',
  });
});

test('reminders survive edits from devices that do not know about them', async () => {
  const store = new Store(':memory:');
  const { app } = createApp({ store, password: 'pw', secret: 's' });
  const login = await app.request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password: 'pw' }),
    headers: { 'content-type': 'application/json' },
  });
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const put = (body: object) =>
    app.request('/api/notes/n1', { method: 'PUT', body: JSON.stringify(body), headers: { cookie, 'content-type': 'application/json' } });

  await put(makeNote({ reminder_at: 9000 }));
  const { reminder_at: _, ...old } = makeNote({ content: 'editada noutro', updated_at: 2000 });
  await put(old);
  assert.equal(store.get('n1')?.content, 'editada noutro');
  assert.equal(store.get('n1')?.reminder_at, 9000);
  await put(makeNote({ reminder_at: null, updated_at: 3000 }));
  assert.equal(store.get('n1')?.reminder_at, null);

  const subscribe = (body: object) =>
    app.request('/api/push/subscribe', { method: 'POST', body: JSON.stringify(body), headers: { cookie, 'content-type': 'application/json' } });
  assert.equal((await subscribe(subscription('https://push.example/1'))).status, 200);
  assert.equal((await subscribe(subscription('http://169.254.169.254/'))).status, 400);
  assert.equal(store.subscriptions().length, 1);
});
