import { createStore, del, delMany, entries, set, setMany, values } from 'idb-keyval';
import type { Note } from './types';

/**
 * Offline-first note store.
 *
 * Every change is applied to memory and IndexedDB first, then queued in an
 * outbox that is pushed to the server whenever it is reachable. The server
 * resolves conflicts with last-write-wins on `updated_at`, and pushes changes
 * from other devices back over Server-Sent Events.
 */

type OutboxEntry = { kind: 'put'; note: Note } | { kind: 'delete'; id: string };

class HttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

const notesDb = createStore('anotado-notes', 'notes');
const outboxDb = createStore('anotado-outbox', 'outbox');
const AUTH_KEY = 'anotado:authed';
const SAVE_DELAY = 300;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) throw new HttpError(res.status);
  return res.json() as Promise<T>;
}

function rememberAuth(value: boolean) {
  try {
    if (value) localStorage.setItem(AUTH_KEY, '1');
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

function hadAuth(): boolean {
  try {
    return localStorage.getItem(AUTH_KEY) === '1';
  } catch {
    return false;
  }
}

class NoteStore {
  notes = $state<Record<string, Note>>({});
  auth = $state<'unknown' | 'yes' | 'no'>('unknown');
  online = $state(true);
  pending = $state(0);
  loaded = $state(false);

  /** Bumped on every outbox write, so a finished request knows if it is stale. */
  private versions = new Map<string, number>();
  private outboxIds = new Set<string>();
  private dirty = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private flushing: Promise<void> | undefined;
  private flushAgain = false;
  private events: EventSource | undefined;
  private retryTimer: ReturnType<typeof setInterval> | undefined;

  async init() {
    try {
      const [stored, outbox] = await Promise.all([values<Note>(notesDb), entries<string, OutboxEntry>(outboxDb)]);
      const map: Record<string, Note> = {};
      for (const note of stored) map[note.id] = note;
      this.notes = map;
      for (const [id] of outbox) this.outboxIds.add(id);
      this.pending = this.outboxIds.size;
    } catch (err) {
      console.warn('IndexedDB indisponível', err);
    }
    this.loaded = true;

    window.addEventListener('online', () => this.sync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.sync();
      else this.persistNow();
    });
    window.addEventListener('pagehide', () => this.persistNow());

    await this.checkSession();
  }

  // --- Auth ------------------------------------------------------------------

  async checkSession() {
    try {
      const { authenticated } = await api<{ authenticated: boolean }>('/api/session');
      this.online = true;
      this.setAuth(authenticated);
    } catch {
      // Offline: trust the last known state so the notes stay usable.
      this.online = false;
      this.auth = hadAuth() ? 'yes' : 'no';
      this.startRetry();
    }
  }

  async login(password: string): Promise<string | null> {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return body.error ?? 'Não foi possível entrar.';
      }
      this.online = true;
      this.setAuth(true);
      return null;
    } catch {
      return 'Sem ligação ao servidor.';
    }
  }

  async logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    this.events?.close();
    this.events = undefined;
    await Promise.all([delMany(Object.keys(this.notes), notesDb), delMany([...this.outboxIds], outboxDb)]).catch(
      () => {},
    );
    this.notes = {};
    this.outboxIds.clear();
    this.pending = 0;
    this.setAuth(false);
  }

  private setAuth(authenticated: boolean) {
    rememberAuth(authenticated);
    this.auth = authenticated ? 'yes' : 'no';
    if (authenticated) {
      this.connectEvents();
      this.sync();
    } else {
      this.events?.close();
      this.events = undefined;
    }
  }

  // --- Local mutations --------------------------------------------------------

  /** Saves a note (new or changed). Stamps `updated_at` unless `touch` is false. */
  put(note: Note, touch = true) {
    if (touch) note.updated_at = Math.max(Date.now(), note.updated_at + 1);
    this.notes[note.id] = note;
    this.dirty.add(note.id);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistNow(), SAVE_DELAY);
  }

  update(id: string, patch: Partial<Note>) {
    const note = this.notes[id];
    if (note) this.put(Object.assign(note, patch));
  }

  /** Permanently deletes a note on every device. */
  purge(id: string) {
    this.dirty.delete(id);
    delete this.notes[id];
    del(id, notesDb).catch(() => {});
    this.queue({ kind: 'delete', id });
  }

  /** Drops a note that never left this device (e.g. a new, empty note). */
  discard(id: string) {
    if (this.outboxIds.has(id) || this.dirty.has(id)) {
      this.purge(id);
    } else {
      delete this.notes[id];
    }
  }

  persistNow() {
    clearTimeout(this.saveTimer);
    if (!this.dirty.size) return;
    const ids = [...this.dirty];
    this.dirty.clear();
    const snapshots = ids.map((id) => this.notes[id]).filter(Boolean).map((n) => $state.snapshot(n) as Note);
    setMany(
      snapshots.map((n) => [n.id, n]),
      notesDb,
    ).catch(() => {});
    for (const note of snapshots) this.queue({ kind: 'put', note }, false);
    this.flush();
  }

  private queue(entry: OutboxEntry, flush = true) {
    const id = entry.kind === 'put' ? entry.note.id : entry.id;
    this.versions.set(id, (this.versions.get(id) ?? 0) + 1);
    this.outboxIds.add(id);
    this.pending = this.outboxIds.size;
    set(id, entry, outboxDb).catch(() => {});
    if (flush) this.flush();
  }

  private hasPending(id: string) {
    return this.outboxIds.has(id) || this.dirty.has(id);
  }

  // --- Sync -------------------------------------------------------------------

  async sync() {
    if (this.auth !== 'yes') return;
    this.connectEvents();
    this.persistNow();
    await this.flush();
    if (this.online) await this.pull();
  }

  /** Pushes the outbox to the server, in order. Safe to call any time. */
  flush(): Promise<void> {
    if (this.auth !== 'yes') return Promise.resolve();
    if (this.flushing) {
      this.flushAgain = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      do {
        this.flushAgain = false;
        const outbox = await entries<string, OutboxEntry>(outboxDb).catch(() => []);
        for (const [id, entry] of outbox) {
          const version = this.versions.get(id) ?? 0;
          try {
            if (entry.kind === 'put') {
              const res = await api<{ note: Note; applied: boolean }>(`/api/notes/${encodeURIComponent(id)}`, {
                method: 'PUT',
                body: JSON.stringify(entry.note),
              });
              if (!res.applied && (this.versions.get(id) ?? 0) === version && !this.dirty.has(id)) {
                // The server has a newer version from another device.
                this.applyRemote(res.note, true);
              }
            } else {
              await api(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
            }
            this.online = true;
          } catch (err) {
            if (err instanceof HttpError && err.status === 401) {
              this.setAuth(false);
              return;
            }
            if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
              console.warn('Alteração rejeitada pelo servidor; descartada.', entry, err);
            } else {
              this.online = false;
              this.startRetry();
              return;
            }
          }
          if ((this.versions.get(id) ?? 0) === version) {
            this.outboxIds.delete(id);
            await del(id, outboxDb).catch(() => {});
          }
        }
        this.pending = this.outboxIds.size;
      } while (this.flushAgain);
    })().finally(() => {
      this.flushing = undefined;
      this.pending = this.outboxIds.size;
    });
    return this.flushing;
  }

  /** Fetches the full server state and reconciles it with local data. */
  async pull() {
    let serverNotes: Note[];
    try {
      serverNotes = (await api<{ notes: Note[] }>('/api/notes')).notes;
      this.online = true;
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) this.setAuth(false);
      else this.online = false;
      return;
    }
    const seen = new Set<string>();
    const toStore: Note[] = [];
    for (const note of serverNotes) {
      seen.add(note.id);
      if (this.hasPending(note.id)) continue;
      const local = this.notes[note.id];
      if (!local || local.updated_at !== note.updated_at) {
        this.notes[note.id] = note;
        toStore.push(note);
      }
    }
    // Notes deleted on another device.
    const removed = Object.keys(this.notes).filter((id) => !seen.has(id) && !this.hasPending(id));
    for (const id of removed) delete this.notes[id];
    await Promise.all([
      setMany(
        toStore.map((n) => [n.id, n]),
        notesDb,
      ),
      delMany(removed, notesDb),
    ]).catch(() => {});
  }

  private applyRemote(note: Note, force = false) {
    if (!force && this.hasPending(note.id)) return;
    const local = this.notes[note.id];
    if (!force && local && local.updated_at > note.updated_at) return;
    this.notes[note.id] = note;
    set(note.id, note, notesDb).catch(() => {});
  }

  private connectEvents() {
    if (this.events) return;
    const source = new EventSource('/api/events');
    this.events = source;
    source.addEventListener('ready', () => {
      // (Re)connected: catch up on anything missed while disconnected.
      this.online = true;
      this.stopRetry();
      this.sync();
    });
    source.addEventListener('change', (e) => {
      const event = JSON.parse((e as MessageEvent).data);
      if (event.type === 'upsert') this.applyRemote(event.note);
      else if (event.type === 'delete' && !this.hasPending(event.id)) {
        delete this.notes[event.id];
        del(event.id, notesDb).catch(() => {});
      } else if (event.type === 'reload') this.pull();
    });
    source.addEventListener('error', () => {
      if (source.readyState === EventSource.CLOSED) {
        // The browser gave up (e.g. 401 or server down); retry manually.
        this.events = undefined;
        this.online = false;
        this.startRetry();
      }
    });
  }

  private startRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(async () => {
      if (this.auth === 'no') return this.stopRetry();
      try {
        const { authenticated } = await api<{ authenticated: boolean }>('/api/session');
        this.stopRetry();
        this.online = true;
        this.setAuth(authenticated);
      } catch {
        /* still offline */
      }
    }, 15_000);
  }

  private stopRetry() {
    clearInterval(this.retryTimer);
    this.retryTimer = undefined;
  }

  // --- Backup -----------------------------------------------------------------

  async importBackup(file: File): Promise<string> {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return 'O ficheiro não é um JSON válido.';
    }
    const notes = Array.isArray(data) ? data : (data as { notes?: unknown })?.notes;
    if (!Array.isArray(notes)) return 'O ficheiro não parece ser um backup do Anotado.';
    try {
      const res = await api<{ imported: number; total: number }>('/api/import', {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      await this.pull();
      return `${res.imported} de ${res.total} notas importadas.`;
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) return 'O backup contém dados inválidos.';
      return 'Não foi possível importar (sem ligação?).';
    }
  }
}

export const store = new NoteStore();
