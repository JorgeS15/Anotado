import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { generateSecret } from './auth.ts';
import { dailyBackup, listBackups } from './backup.ts';
import { Store } from './db.ts';
import { WebDavUploader } from './remote.ts';
import { UpdateChecker } from './updates.ts';

const port = Number(process.env.PORT ?? 4008);
const dataDir = resolve(process.env.DATA_DIR ?? './data');
const webDir = resolve(process.env.WEB_DIR ?? resolve(import.meta.dirname, '../../web/dist'));
const password = process.env.ANOTADO_PASSWORD ?? '';
const backupKeep = Number(process.env.BACKUP_KEEP ?? 30);
const trashDays = Number(process.env.TRASH_DAYS ?? 30);
const trustProxy = !/^(0|false|no)$/i.test(process.env.TRUST_PROXY ?? 'true');
const apiToken = process.env.ANOTADO_API_TOKEN || undefined;
const updateCheck = !/^(0|false|no)$/i.test(process.env.UPDATE_CHECK ?? 'true');
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));

// The example value from docker-compose.yml / README must never protect a real server.
const EXAMPLE_PASSWORD = 'muda-esta-password';

if (!password) {
  console.error('ANOTADO_PASSWORD is not set. Define it to choose the login password.');
  process.exit(1);
}
if (password === EXAMPLE_PASSWORD) {
  console.error('ANOTADO_PASSWORD is still the example value. Choose your own password.');
  process.exit(1);
}
if (password.length < 8) {
  console.warn('ANOTADO_PASSWORD is shorter than 8 characters. Consider a longer password.');
}

if (!(trashDays >= 1)) {
  console.error('TRASH_DAYS must be a number of days, 1 or more.');
  process.exit(1);
}
if (apiToken && (apiToken.length < 24 || apiToken === password)) {
  console.error('ANOTADO_API_TOKEN must have at least 24 characters and differ from the password. Try: openssl rand -hex 24');
  process.exit(1);
}

const dbFile = resolve(dataDir, 'anotado.db');
const backupDir = resolve(process.env.BACKUP_DIR || resolve(dataDir, 'backups'));
const remote = process.env.BACKUP_WEBDAV_URL
  ? new WebDavUploader(process.env.BACKUP_WEBDAV_URL, process.env.BACKUP_WEBDAV_USER, process.env.BACKUP_WEBDAV_PASSWORD)
  : undefined;
const store = new Store(dbFile);

let secret = process.env.SESSION_SECRET || store.getMeta('session_secret');
if (!secret) {
  secret = generateSecret();
  store.setMeta('session_secret', secret);
}

const updates = updateCheck ? new UpdateChecker(version) : undefined;
const { app, broadcast } = createApp({
  store,
  password,
  secret,
  webDir,
  version,
  trashDays,
  trustProxy,
  apiToken,
  backupDir,
  dbFile,
  updates,
  remote,
});

const purge = () => {
  for (const id of store.purgeTrash(Date.now() - trashDays * 24 * 60 * 60 * 1000)) broadcast({ type: 'delete', id });
};
purge();
setInterval(purge, 6 * 60 * 60 * 1000).unref();

const backup = () => {
  if (!(backupKeep > 0)) return;
  try {
    const file = dailyBackup(store, backupDir, backupKeep);
    if (file) console.log(`Backup written: ${file}`);
    // Send the newest backup to WebDAV; a failed upload is retried on the next hourly run.
    const latest = listBackups(backupDir)[0];
    if (remote && latest && remote.pending(latest.name)) {
      void remote.upload(resolve(backupDir, latest.name)).then((ok) => {
        if (ok) console.log(`Backup copied to ${remote.status.target}`);
        else console.error(`Backup copy to ${remote.status.target} failed: ${remote.status.last_error?.message}`);
      });
    }
  } catch (err) {
    console.error('Backup failed:', err);
  }
};
backup();
setInterval(backup, 60 * 60 * 1000).unref();

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Anotado ${version} listening on http://0.0.0.0:${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    process.exit(0);
  });
}
