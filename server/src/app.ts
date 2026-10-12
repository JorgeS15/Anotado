import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
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
}

export function createApp({ store, password, secret, webDir }: AppOptions) {
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

  const isHttps = (c: Context) =>
    c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';

  app.onError((err, c) => {
    if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
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

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/session', (c) =>
    c.json({ authenticated: sessions.verify(getCookie(c, SESSION_COOKIE)) }),
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
    const note = validateNote(await c.req.json());
    if (note.id !== c.req.param('id')) throw new ValidationError('id mismatch');
    const result = store.upsert(note);
    if (result.applied) broadcast({ type: 'upsert', note: result.note });
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
    const imported = store.transaction(() => notes.filter((n: Note) => store.upsert(n).applied).length);
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
