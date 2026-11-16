// Offline-capable app-shell service worker for HabitArc PWA.
// Network-first keeps online HTML, scripts, and authenticated state fresh;
// only static UI runtime CDNs and same-origin app shell assets fall back offline.
const CACHE_NAME = 'habitarc-shell-v5';
const CDN_CACHE_NAME = 'habitarc-cdn-v1';
const OFFLINE_URL = '/offline.html';
const SHELL_ASSETS = [
  OFFLINE_URL,
  '/index.html',
  '/Dashboard.html',
  '/Habits.html',
  '/Insights.html',
  '/Arc_AI.html',
  '/Profile.html',
  '/Settings.html',
  '/Add_Habit.html',
  '/Habit_Detail.html',
  '/Onboarding.html',
  '/app-ui.css',
  '/app-ui.js',
  '/app.js',
  '/habit-analytics.js',
  '/firebase-auth.js',
  '/pwa-register.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
  '/logo.png',
];
const SHELL_ASSET_SET = new Set(SHELL_ASSETS);
const UI_CDN_ORIGINS = new Set([
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
]);
const NOTIFICATION_DESTINATIONS = new Set([
  '/Dashboard.html',
  '/Habits.html',
  '/Insights.html',
  '/Arc_AI.html',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const validCaches = new Set([CACHE_NAME, CDN_CACHE_NAME]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('habitarc-') && !validCaches.has(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isAllowedUiCdn(url) {
  return UI_CDN_ORIGINS.has(url.origin);
}

function shouldBypassCache(request, url) {
  if (request.method !== 'GET') return true;
  if (url.origin !== self.location.origin) {
    return !isAllowedUiCdn(url);
  }
  return url.pathname === '/__'
    || url.pathname.startsWith('/__/')
    || url.pathname === '/api'
    || url.pathname.startsWith('/api/');
}

function isCacheableResponse(response, { allowOpaque = false } = {}) {
  if (!response) return false;
  if (allowOpaque && response.type === 'opaque') return true;
  return Boolean(response.ok) && response.type !== 'error' && response.type !== 'opaque';
}

async function cacheClone(cachePromise, key, response) {
  const copy = response.clone();
  const cache = await cachePromise;
  await cache.put(key, copy);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept OAuth helpers, API calls, mutations, Firebase backends,
  // or arbitrary external traffic.
  if (shouldBypassCache(request, url)) return;

  // Stale-while-revalidate for static UI CDNs (Tailwind runtime + Google Fonts)
  // so offline app pages stay styled after first visit.
  if (isAllowedUiCdn(url)) {
    event.respondWith(
      caches.open(CDN_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const refreshing = fetch(request)
          .then(async (response) => {
            if (isCacheableResponse(response, { allowOpaque: true })) {
              await cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil?.(refreshing);
          return cached;
        }
        return (await refreshing) || new Response('', { status: 503 });
      }),
    );
    return;
  }

  // Same-origin page navigation: always network-first, falling back cleanly
  // to the cached page pathname (stripping query params like ?id=...), then offline.html.
  if (request.mode === 'navigate') {
    const pageKey = url.pathname === '/' ? '/index.html' : url.pathname;
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (isCacheableResponse(response) && SHELL_ASSET_SET.has(pageKey)) {
            await cacheClone(caches.open(CACHE_NAME), pageKey, response);
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedPage = await cache.match(pageKey);
          if (cachedPage) return cachedPage;
          const fallback = await cache.match(OFFLINE_URL);
          return fallback || new Response('You are offline. Reconnect and try again.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }),
    );
    return;
  }

  // Same-origin static assets & scripts: network-first with cache fallback when
  // pathname matches the app shell without cache-busting search parameters.
  if (SHELL_ASSET_SET.has(url.pathname) && !url.search) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (isCacheableResponse(response)) {
            await cacheClone(caches.open(CACHE_NAME), url.pathname, response);
          }
          return response;
        })
        .catch(async () => {
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
