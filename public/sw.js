// Luminary Service Worker — cache-first for static assets, network-first for API
const CACHE = 'luminary-v1';

// App shell files to pre-cache on install
const SHELL = ['/', '/index.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Remove any old cache versions
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Skip non-GET and cross-origin API requests (Supabase, Google Fonts, CrossRef, etc.)
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isExternal = url.origin !== self.location.origin;
  if (isExternal) return;

  // Navigation requests (HTML) — network-first, fall back to cached index.html (SPA)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets — cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
