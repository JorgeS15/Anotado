import { uid } from './util';

/**
 * Device clocks can be wrong. Timestamps decide which edit wins, so they are
 * corrected by the offset to the server clock, measured on every session check.
 */
const OFFSET_KEY = 'anotado:clock-offset';
const CLIENT_KEY = 'anotado:client';

let offset = 0;
try {
  offset = Number(localStorage.getItem(OFFSET_KEY)) || 0;
} catch {
  /* ignore */
}

export function now(): number {
  return Date.now() + offset;
}

/** Records the server time, given when the request started and ended (local clock). */
export function syncClock(serverNow: number, sentAt: number, receivedAt: number) {
  if (!Number.isFinite(serverNow) || receivedAt - sentAt > 5000) return; // too slow to be accurate
  const measured = serverNow - (sentAt + receivedAt) / 2;
  offset = Math.abs(measured) < 1000 ? 0 : Math.round(measured);
  try {
    localStorage.setItem(OFFSET_KEY, String(offset));
  } catch {
    /* ignore */
  }
}

/** A stable id for this browser, so the server can tell devices apart. */
export const clientId: string = (() => {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = uid().replace(/[^A-Za-z0-9_-]/g, '');
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return uid().replace(/[^A-Za-z0-9_-]/g, '');
  }
})();
