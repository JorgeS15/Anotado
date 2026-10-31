import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { ColorNoteError, colorFor, noteIdFor, parseColorNote, type ColorNoteRecord } from './colornote.ts';
import { join } from 'node:path';
import { LoginLimiter, SESSION_COOKIE, SESSION_MAX_AGE, Sessions, passwordMatches } from './auth.ts';
import type { Store } from './db.ts';
import { ValidationError, validateId, validateNote, type Note } from './notes.ts';

export type ServerEvent =
  | { type: 'upsert'; note: Note }
  | { type: 'delete'; id: string }
  | { type: 'reload' };

export interface AppOptions {
  store: Store;
  password: string;
  secret: string;
  webDir?: string;
  version?: string;
}

export function createApp({ store, password, secret, webDir, version = 'dev' }: AppOptions) {
  const app = new Hono();
  const sessions = new Sessions(secret, password);
  const limiter = new LoginLimiter();
  const listeners = new Set<(event: ServerEvent) => void>();

  const broadcast = (event: ServerEvent) => {
    for (const listener of listeners) listener(event);
  };

  const clientKey = (c: Context) => {
    // Behind Caddy the real client is the last hop Caddy appended.
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) return forwarded.split(',').at(-1)!.trim();
    try {
      return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const clientId = (c: Context) => {
    const id = c.req.header('x-client-id');
    return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : undefined;
  };

  const isHttps = (c: Context) =>
    c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';

  app.onError((err, c) => {
    if (err instanceof ValidationError || err instanceof ColorNoteError) return c.json({ error: err.message }, 400);
    if (err instanceof SyntaxError) return c.json({ error: 'invalid JSON' }, 400);
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  app.use('/api/*', bodyLimit({ maxSize: 20 * 1024 * 1024 }));
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });

  // --- Public endpoints ---------------------------------------------------

  app.get('/api/health', (c) => c.json({ ok: true, version }));

  app.get('/api/session', (c) =>
    c.json({ authenticated: sessions.verify(getCookie(c, SESSION_COOKIE)), now: Date.now(), version }),
  );

  app.post('/api/login', async (c) => {
    const key = clientKey(c);
    if (limiter.blocked(key)) {
      return c.json({ error: 'Demasiadas tentativas. Tenta novamente mais tarde.' }, 429);
    }
    const body = await c.req.json().catch(() => ({}));
    const input = typeof body?.password === 'string' ? body.password : '';
    if (!passwordMatches(input, password)) {
      limiter.fail(key);
      return c.json({ error: 'Password errada.' }, 401);
    }
    limiter.reset(key);
    setCookie(c, SESSION_COOKIE, sessions.create(), {
      httpOnly: true,
      secure: isHttps(c),
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return c.json({ ok: true });
  });

  app.post('/api/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // --- Authenticated endpoints --------------------------------------------

  app.use('/api/*', async (c, next) => {
    if (!sessions.verify(getCookie(c, SESSION_COOKIE))) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  });

  app.get('/api/notes', (c) => c.json({ notes: store.all(), now: Date.now() }));

  app.put('/api/notes/:id', async (c) => {
    const body = await c.req.json();
    const note = validateNote(body);
    if (note.id !== c.req.param('id')) throw new ValidationError('id mismatch');
    // `synced` is the server version this edit started from, used to detect concurrent edits.
    const base = typeof body.synced === 'number' ? body.synced : undefined;
    const result = store.upsert(note, { base, client: clientId(c) });
    if (result.applied) broadcast({ type: 'upsert', note: result.note });
    if (result.conflict) broadcast({ type: 'upsert', note: result.conflict });
    return c.json(result);
  });

  app.get('/api/notes/:id/versions', (c) => {
    const id = validateId(c.req.param('id'));
    return c.json({ versions: store.versions(id) });
  });

  app.post('/api/notes/:id/versions/:version/restore', (c) => {
    const id = validateId(c.req.param('id'));
    const current = store.get(id);
    const version = store.version(id, Number(c.req.param('version')));
    if (!current || !version) return c.json({ error: 'not found' }, 404);
    const { type, title, content, items } = version.note;
    const restored = { ...current, type, title, content, items, updated_at: Math.max(Date.now(), current.updated_at + 1) };
    const result = store.upsert(restored, { client: clientId(c), forceVersion: true });
    broadcast({ type: 'upsert', note: result.note });
    return c.json(result);
  });

  app.delete('/api/notes/:id', (c) => {
    const id = validateId(c.req.param('id'));
    if (store.delete(id)) broadcast({ type: 'delete', id });
    return c.json({ ok: true });
  });

  app.get('/api/export', (c) => {
    const date = new Date().toISOString().slice(0, 10);
    c.header('Content-Disposition', `attachment; filename="anotado-${date}.json"`);
    return c.json({ app: 'anotado', version: 1, exported_at: Date.now(), notes: store.all() });
  });

  app.post('/api/import', async (c) => {
    const body = await c.req.json();
    if (!body || !Array.isArray(body.notes)) throw new ValidationError('expected { notes: [...] }');
    const notes = body.notes.map(validateNote);
    const imported = store.transaction(
      () => notes.filter((n: Note) => store.upsert(n, { client: 'import' }).applied).length,
    );
    broadcast({ type: 'reload' });
    return c.json({ imported, total: notes.length });
  });

  app.post('/api/colornote/preview', async (c) => {
    const password = decodeURIComponent(c.req.header('x-backup-password') ?? '') || '0000';
    const records = parseColorNote(Buffer.from(await c.req.arrayBuffer()), password);
    const colors = new Map<number, { index: number; count: number; samples: string[]; suggested: string }>();
    for (const r of records) {
      const entry = colors.get(r.color_index) ?? {
        index: r.color_index,
        count: 0,
        samples: [],
        suggested: colorFor(r.color_index),
      };
      entry.count++;
      const label = (r.title || r.content || r.items[0]?.text || '').trim().slice(0, 40);
      if (label && entry.samples.length < 3) entry.samples.push(label);
      colors.set(r.color_index, entry);
    }
    return c.json({ records, colors: [...colors.values()].sort((a, b) => a.index - b.index) });
  });

  app.post('/api/colornote/import', async (c) => {
    const body = await c.req.json();
    if (!body || !Array.isArray(body.records)) throw new ValidationError('expected { records: [...] }');
    const map = body.colors && typeof body.colors === 'object' ? body.colors : {};
    const notes = (body.records as ColorNoteRecord[]).map((r) =>
      validateNote({
        id: noteIdFor(String(r.source_id)),
        type: r.type,
        title: r.title,
        content: r.content,
        items: r.items,
        color: colorFor(Number(r.color_index), map),
        pinned: false,
        archived: r.archived === true,
        deleted_at: null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }),
    );
    const imported = store.transaction(
      () => notes.filter((n) => store.upsert(n, { client: 'import' }).applied).length,
    );
    broadcast({ type: 'reload' });
    return c.json({ imported, total: notes.length });
  });

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const queue: ServerEvent[] = [];
      let wake: (() => void) | undefined;
      const listener = (event: ServerEvent) => {
        queue.push(event);
        wake?.();
      };
      listeners.add(listener);
      stream.onAbort(() => {
        listeners.delete(listener);
        wake?.();
      });

      await stream.writeSSE({ event: 'ready', data: '{}' });
      while (!stream.aborted) {
        const event = queue.shift();
        if (event) {
          await stream.writeSSE({ event: 'change', data: JSON.stringify(event) });
          continue;
        }
        // Wait for the next event, or send a keep-alive every 25s so proxies keep the connection open.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 25_000);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        wake = undefined;
        if (!queue.length && !stream.aborted) await stream.write(': ping\n\n');
      }
      listeners.delete(listener);
    }),
  );

  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

  // --- Frontend -----------------------------------------------------------

  if (webDir && existsSync(join(webDir, 'index.html'))) {
    const indexHtml = readFileSync(join(webDir, 'index.html'), 'utf8');

    app.use('/assets/*', async (c, next) => {
      await next();
      if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable');
    });
    app.use('*', async (c, next) => {
      await next();
      if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-cache');
    });
    app.use('*', serveStatic({ root: webDir }));
    // SPA fallback.
    app.get('*', (c) => c.html(indexHtml));
  }

  return { app, broadcast };
}
