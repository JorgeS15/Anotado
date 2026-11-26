// Loaded by the generated service worker: shows reminders sent by the Anotado server.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Anotado', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Anotado', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.id ? `note-${data.id}` : 'anotado',
      renotify: true,
      data: { id: data.id || '' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.id;
  const url = id ? `/?note=${encodeURIComponent(id)}` : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        client.postMessage({ type: 'open-note', id });
        return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
