// Bumped so browsers that already have an old service worker installed
// pick up this fix and drop their old cached entries.
const CACHE_NAME = 'style-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/~oauth') ||
    url.hostname.includes('supabase') ||
    url.protocol === 'chrome-extension:'
  ) {
    return;
  }

  // BUG FIX: the HTML document itself (navigation requests, and any
  // path without a file extension — i.e. every app route since this is
  // a single-page app) must NEVER be served from cache. It references
  // the current build's hashed JS/CSS filenames; caching it could leave
  // a user permanently stuck on an old version even after we ship real
  // fixes, since the old HTML keeps pointing at old (possibly missing)
  // asset hashes. Only the hashed static assets (JS/CSS/images, whose
  // filenames change on every build) are safe to cache long-term.
  const isNavigation = event.request.mode === 'navigate' || !url.pathname.includes('.');
  if (isNavigation) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const title = payload.title || 'STYLE';
  const options = {
    body: payload.message || payload.body || 'Nuova notifica',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: payload.notification_id || payload.tag || 'style-notification',
    data: {
      url: payload.url || payload.data?.url || '/notifications',
      ...payload.data,
    },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
