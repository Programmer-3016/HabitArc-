// Keep the offline response self-contained until styles and fonts are bundled
// locally. Caching application HTML but not its CDN dependencies would leave a
// broken, unstyled dashboard offline. Application code is always network-fresh.
const CACHE_NAME = 'habitarc-offline-v2';
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/logo.png'];
const NOTIFICATION_DESTINATIONS = new Set(['/Dashboard.html', '/Insights.html']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('habitarc-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function shouldBypassCache(request, url) {
  return request.method !== 'GET'
    || url.origin !== self.location.origin
    || url.pathname === '/__'
    || url.pathname.startsWith('/__/')
    || url.pathname === '/api'
    || url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept OAuth helpers, API calls, mutations, external dependencies,
  // or user data. This also prevents caching authenticated server responses.
  if (shouldBypassCache(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(OFFLINE_URL)
          || new Response('You are offline. Reconnect and try again.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
      }),
    );
    return;
  }

  // Only assets needed by the fallback are available offline. JS, manifests,
  // app pages, and any future endpoints retain their normal network behavior.
  if (OFFLINE_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(url.pathname);
        if (cached) return cached;
        return new Response('', { status: 503 });
      }),
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Notification data is not a trusted URL. Keep clicks inside HabitArc and
  // restrict them to the two destinations used by the reminder scheduler.
  let pathname = '/Dashboard.html';
  try {
    const target = new URL(event.notification.data?.url || pathname, self.location.origin);
    if (target.origin === self.location.origin && NOTIFICATION_DESTINATIONS.has(target.pathname)) {
      pathname = target.pathname;
    }
  } catch {
    // Malformed data falls back to the dashboard without interrupting clicks.
  }

  const destination = new URL(pathname, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => client.url === destination);
      if (existing && 'focus' in existing) return existing.focus();
      return self.clients.openWindow(destination);
    }),
  );
});
