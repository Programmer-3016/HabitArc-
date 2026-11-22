// Offline-capable app-shell service worker for HabitArc PWA.
// Static shell files return from cache while they refresh; query navigations
// stay network-first and never replace the public shell with their responses.
const CACHE_NAME = 'habitarc-shell-v43';
const CDN_CACHE_NAME = 'habitarc-cdn-v1';
const OFFLINE_URL = '/offline.html';
const SHELL_ASSETS = [
  OFFLINE_URL,
  '/index.html',
  '/Dashboard.html',
  '/Habits.html',
  '/Notes.html',
  '/notes-studio.css',
  '/notes-studio.js',
  '/notes-cloud.js',
  '/data-backup.js',
  '/data-restore.js',
  '/productivity-hub.js',
  '/productivity-hub.css',
  '/month-calendar.js',
  '/consistency-shield.js',
  '/consistency-shield.css',
  '/device-readiness.js',
  '/privacy.html',
  '/task-store.js',
  '/plan-tasks.js',
  '/rescue-planner.js',
  '/rescue-mode.js',
  '/arc-context.js',
  '/push-subscriptions.js',
  '/rescue-mode.css',
  '/plan-tasks.css',
  '/day-workspace.js',
  '/day-workspace.css',
  '/focus-store.js',
  '/Insights.html',
  '/Leaderboard.html',
  '/leaderboard.css',
  '/leaderboard.js',
  '/runner-treasures.js',
  '/treasure-art.js',
  '/icons/iron-chest-sheet.png',
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
  '/companion-sprites.js',
  '/streak-runner.js',
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

function offlineNavigation(cache) {
  return cache.match(OFFLINE_URL).then(page => page || new Response('You are offline. Reconnect to load HabitArc.', {
    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  }));
}


// Serve pre-cached app-shell files immediately; update them in the background.
// Only public static shell assets take this route (never API/Firebase/user data).
async function respondFromShellCache(request, key, event, { navigation = false } = {}) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(key);
  const refreshing = fetch(request)
    .then(async (response) => {
      if (isCacheableResponse(response)) {
        // A full cache must not turn a successful network response into a 503.
        await cache.put(key, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(refreshing);
    return cached;
  }
  const fresh = await refreshing;
  if (fresh) return fresh;
  if (navigation) {
    return offlineNavigation(cache);
  }
  return new Response('', { status: 503 });
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
              await cache.put(request, response.clone()).catch(() => {});
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

  // Known static PWA pages are already pre-cached on installation. Return
  // them without an extra network round-trip when switching tabs.
  if (request.mode === 'navigate') {
    const pageKey = url.pathname === '/' ? '/index.html' : url.pathname;
    if (SHELL_ASSET_SET.has(pageKey) && !url.search) {
      event.respondWith(respondFromShellCache(request, pageKey, event, { navigation: true }));
      return;
    }
    // Dynamic/query navigation stays network-first (OAuth, detail links, etc.).
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(pageKey);
        return cached || offlineNavigation(cache);
      }),
    );
    return;
  }

  // The SPA router fetches same-origin HTML with normal fetch(), not navigate
  // mode. Those responses must be cache-first too for instant tab changes.
  if (SHELL_ASSET_SET.has(url.pathname) && !url.search) {
    event.respondWith(respondFromShellCache(request, url.pathname, event));
  }
});

/* Secure browser Web Push delivery when app windows are closed.
 * The server sends only bounded, user-consented daily digests. */
self.addEventListener('push',event=>{
 let payload={};
 try{if(event.data)payload=event.data.json();}catch{}
 const allowed=NOTIFICATION_DESTINATIONS.has(payload?.url)?payload.url:'/Habits.html';
 const title=typeof payload?.title==='string'&&payload.title.length<90?payload.title:'HabitArc daily check-in';
 const body=typeof payload?.body==='string'?payload.body.slice(0,200):'Open HabitArc to review your daily plan.';
 const tag=typeof payload?.tag==='string'?payload.tag.slice(0,90):'habitarc-daily';
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
  tag,renotify:false,data:{url:allowed}
 }));
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
