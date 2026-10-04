/*
 * Nuray service worker: shows push notifications (new orders, order updates, payments)
 * and opens the right page when one is tapped. It caches nothing.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nuray', {
      body: data.body || '',
      icon: '/brand/icon-192.png',
      badge: '/brand/badge-72.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const exact = windows.find((w) => w.url === target);
      if (exact) return exact.focus();
      const ours = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (ours && 'navigate' in ours) {
        await ours.focus();
        return ours.navigate(target);
      }
      return self.clients.openWindow(target);
    })()
  );
});
