// Service worker for Pulse.
//
// Network-first: a student must never see a stale deadline because the cache
// answered first. The cache exists only so a navigation still resolves when the
// connection drops.

const CACHE = 'pulse-shell-v1';
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only navigations are cached. API and auth traffic must always hit the network.
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(OFFLINE_URL, copy));
        return response;
      })
      .catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())),
  );
});
