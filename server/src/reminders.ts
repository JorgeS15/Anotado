import type { Store } from './db.ts';
import type { Note } from './notes.ts';
import { sendPush, type VapidKeys } from './webpush.ts';

export interface PushConfig {
  keys: VapidKeys;
  /** Contact for push services (mailto: or https:), required by VAPID. */
  subject: string;
  fetcher?: typeof fetch;
}

/** What the service worker shows. */
export interface ReminderPayload {
  title: string;
  body: string;
  /** The note to open when the notification is tapped. */
  id: string;
}

export function reminderPayload(note: Note): ReminderPayload {
  const items = note.items.filter((i) => !i.done).map((i) => `☐ ${i.text}`);
  const body = (note.type === 'checklist' ? items.join('\n') : note.content).trim().slice(0, 300);
  const title = note.title.trim() || body.split('\n')[0]?.slice(0, 60) || 'Lembrete';
  return { title, body: note.title.trim() ? body : body.split('\n').slice(1).join('\n'), id: note.id };
}

/** Sends a notification to every subscribed device. Forgets subscriptions the push service says are gone. */
export async function notifyAll(store: Store, push: PushConfig, payload: unknown): Promise<number> {
  let sent = 0;
  for (const sub of store.subscriptions()) {
    const result = await sendPush(sub, payload, push.keys, push.subject, push.fetcher);
    if (result === 'gone') store.removeSubscription(sub.endpoint);
    if (result === 'sent') sent++;
  }
  return sent;
}

/**
 * Sends the reminders that are due. Each reminder is sent once; changing its
 * time makes it due again. `onsent` lets the app tell open devices too.
 */
export async function sendDueReminders(
  store: Store,
  push: PushConfig | undefined,
  onsent: (note: Note) => void,
  now = Date.now(),
): Promise<number> {
  const due = store.dueReminders(now);
  for (const note of due) {
    // Mark first, so a slow or failing push service never sends the same reminder twice.
    store.markReminded(note.id, note.reminder_at!);
    onsent(note);
    if (push) await notifyAll(store, push, reminderPayload(note));
  }
  return due.length;
}
