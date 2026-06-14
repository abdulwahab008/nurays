// Nuray service worker — installable PWA + offline shell.
// Bump CACHE when the precache list changes to evict the old one.
const CACHE = 'nuray-v1';
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Leave cross-origin (the API server) and any /api call to the network.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  // Page navigations: network-first, fall back to the offline page when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Hashed static assets / images / fonts: cache-first (immutable).
  const isStatic =
    url.pathname.startsWith('/_next/static') ||
    /\.(?:png|svg|jpg|jpeg|webp|gif|ico|woff2?|ttf)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          })
      )
    );
  }
});
