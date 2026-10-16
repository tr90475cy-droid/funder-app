/* ═══════════════════════════════════════════════════════════
   FUNDAR Service Worker
   - Caches the app shell for instant loads
   - Serves offline fallback for the feed
   - Never caches API responses, uploads, or auth pages
   ═══════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'fundar-v1';
const SHELL = [
  '/',
  '/home',
  '/static/css/theme.css',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/apple-touch-icon.png',
];

// ── INSTALL — pre-cache shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] skip', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE — clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH — cache-first for assets, network-only for API ──
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GETs on our own origin
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache API, uploads, sockets, auth, or admin
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/signup') ||
    url.pathname.startsWith('/verify') ||
    url.pathname.startsWith('/pending') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/.well-known/')
  ) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          // Only cache valid basic 200 responses
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          // Offline fallback for navigation
          if (req.mode === 'navigate') {
            return caches.match('/home').then((r) => r || caches.match('/'));
          }
          return cached;
        });

      // Serve cached immediately, refresh in background
      return cached || networkFetch;
    })
  );
});

// ── PUSH NOTIFICATIONS (placeholder for future) ──
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'New activity on FUNDAR',
    icon: '/static/icons/icon-192.png',
    badge: '/static/icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/home' },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'FUNDAR', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data.url || '/home';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});