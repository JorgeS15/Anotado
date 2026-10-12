import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { generateSecret } from './auth.ts';
import { Store } from './db.ts';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const port = Number(process.env.PORT ?? 4008);
const dataDir = resolve(process.env.DATA_DIR ?? './data');
const webDir = resolve(process.env.WEB_DIR ?? resolve(import.meta.dirname, '../../web/dist'));
const password = process.env.ANOTADO_PASSWORD ?? '';

if (!password) {
  console.error('ANOTADO_PASSWORD is not set. Define it to choose the login password.');
  process.exit(1);
}

const store = new Store(resolve(dataDir, 'anotado.db'));

let secret = process.env.SESSION_SECRET || store.getMeta('session_secret');
if (!secret) {
  secret = generateSecret();
  store.setMeta('session_secret', secret);
}

const { app, broadcast } = createApp({ store, password, secret, webDir });

const purge = () => {
  for (const id of store.purgeTrash(Date.now() - TRASH_RETENTION_MS)) broadcast({ type: 'delete', id });
};
purge();
setInterval(purge, 6 * 60 * 60 * 1000).unref();

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Anotado listening on http://0.0.0.0:${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    process.exit(0);
  });
}
