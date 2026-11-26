import { clientId } from './clock';

/** Web Push on this device, for reminders. */

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function registration() {
  // In development there is no service worker: give up instead of waiting forever.
  const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 4000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks for permission and subscribes this device. Must start from a tap or click. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const { publicKey } = await fetch('/api/push/key', { credentials: 'same-origin' }).then((r) => r.json());
  if (!publicKey) return 'unsupported';
  let sub = await reg.pushManager.getSubscription();
  // A subscription made for another server key cannot be used.
  const current = sub?.options.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...keyBytes(publicKey)))) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await post('/api/push/subscribe', sub.toJSON());
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = supported() ? await registration() : undefined;
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}

/** Sends a test notification to every subscribed device. */
export async function testPush(): Promise<number> {
  return (await post('/api/push/test', {})).sent;
}

/** Keeps the server's copy of this device's subscription up to date (it can change or be lost). */
export async function refreshPush() {
  if (!supported() || Notification.permission !== 'granted') return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await post('/api/push/subscribe', sub.toJSON()).catch(() => {});
}
