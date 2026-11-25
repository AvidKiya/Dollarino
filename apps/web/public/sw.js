const CACHE_NAME = 'dollarino-pwa-v11.6.5';
const APP_SHELL = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve cached stale API responses, downloads, or service worker script itself
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/downloads/') || url.pathname === '/sw.js') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(
        () =>
          new Response(JSON.stringify({ ok: false, offline: true, error: 'آفلاین هستید' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    );
    return;
  }

  // Navigation requests & images: always Network-First so UI updates and icon refreshes appear immediately
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/images/')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // Hashed Vite assets (/assets/*): cache-first safe because filenames contain content hashes
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // Other static assets: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
