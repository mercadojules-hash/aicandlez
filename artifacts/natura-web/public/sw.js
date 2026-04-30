/* Natura AI — Service Worker (network-first, no HTML/JS caching in dev) */
const CACHE_NAME = 'natura-ai-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Network-first for everything — no stale caching */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).catch(() => {
      /* Only fall back to cache for navigate requests (offline support) */
      if (event.request.mode === 'navigate') {
        return caches.match('/natura-web/index.html');
      }
    })
  );
});
