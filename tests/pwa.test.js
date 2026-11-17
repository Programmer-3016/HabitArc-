import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workerSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const registrationSource = readFileSync(new URL('../pwa-register.js', import.meta.url), 'utf8');
const origin = 'https://habit-arc.vercel.app';

function worker({
  offline = false,
  cachedRoutes = ['/offline.html', '/index.html', '/Dashboard.html', '/Habits.html', '/Habit_Detail.html', '/app.js'],
  cachedCdnUrls = [],
  clients = [],
  opaqueCdn = false,
} = {}) {
  const listeners = {};
  const added = [];
  const puts = [];
  const removed = [];
  const openedWindows = [];
  const matched = [];
  const store = new Map();
  for (const route of cachedRoutes) {
    store.set(route, new Response(`Cached:${route}`, { status: 200 }));
  }
  for (const url of cachedCdnUrls) {
    store.set(url, new Response(`CachedCDN:${url}`, { status: 200 }));
  }

  const cache = {
    addAll: async (urls) => added.push(...urls),
    put: async (key, response) => {
      const k = typeof key === 'string' ? key : key.url;
      puts.push(k);
      store.set(k, response);
    },
    match: async (key) => {
      const k = typeof key === 'string' ? key : key.url;
      matched.push(k);
      return store.get(k);
    },
  };

  let claimed = false;
  let skippedWaiting = false;

  vm.runInNewContext(workerSource, {
    URL,
    Response,
    fetch: async (req) => {
      if (offline) throw new TypeError('Network unavailable');
      const target = typeof req === 'string' ? req : req.url;
      if (opaqueCdn && target.startsWith('https://cdn.tailwindcss.com')) {
        return { ok: false, type: 'opaque', status: 0, clone() { return this; } };
      }
      return new Response(`Network:${target}`, { status: 200 });
    },
    caches: {
      open: async () => cache,
      keys: async () => ['habitarc-offline-v2', 'habitarc-shell-v7', 'habitarc-shell-v8', 'habitarc-cdn-v1', 'another-app-cache'],
      delete: async (key) => removed.push(key),
    },
    self: {
      location: { origin },
      addEventListener: (type, listener) => { listeners[type] = listener; },
      skipWaiting: async () => { skippedWaiting = true; },
      clients: {
        claim: async () => { claimed = true; },
        matchAll: async () => clients,
        openWindow: async (url) => openedWindows.push(url),
      },
    },
  });

  return {
    added,
    puts,
    removed,
    openedWindows,
    matched,
    get claimed() { return claimed; },
    get skippedWaiting() { return skippedWaiting; },
    async lifecycle(type) {
      let work;
      listeners[type]({ waitUntil: (promise) => { work = promise; } });
      await work;
    },
    fetch(path, { method = 'GET', mode = 'same-origin' } = {}) {
      let response;
      const href = path.startsWith('http') ? path : new URL(path, origin).href;
      listeners.fetch({
        request: { url: href, method, mode },
        respondWith: (promise) => { response = promise; },
      });
      return response;
    },
    async notification(url) {
      let work;
      let closed = false;
      listeners.notificationclick({
        notification: { data: { url }, close: () => { closed = true; } },
        waitUntil: (promise) => { work = promise; },
      });
      await work;
      assert.equal(closed, true);
    },
  };
}

test('PWA precaches complete HabitArc app shell and square/maskable icons', async () => {
  const app = worker();
  await app.lifecycle('install');
  for (const required of [
    '/offline.html',
    '/index.html',
    '/Dashboard.html',
    '/Habits.html',
    '/Arc_AI.html',
    '/app.js',
    '/app-ui.css',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png',
  ]) {
    assert.ok(app.added.includes(required), `missing precache asset: ${required}`);
  }
  assert.equal(app.skippedWaiting, true);
});

test('PWA removes obsolete HabitArc caches without removing active CDN or foreign caches', async () => {
  const app = worker();
  await app.lifecycle('activate');
  assert.deepEqual(app.removed, ['habitarc-offline-v2', 'habitarc-shell-v7']);
  assert.equal(app.claimed, true);
});

test('PWA never intercepts auth helpers, APIs, mutations, or Firebase/OAuth origins', () => {
  const app = worker();
  for (const path of [
    '/__',
    '/__/auth/handler',
    '/__/firebase/init.json',
    '/api',
    '/api/coach',
    'https://accounts.google.com/auth',
    'https://firestore.googleapis.com/v1/projects/x',
    'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js',
  ]) {
    assert.equal(app.fetch(path, { mode: 'navigate' }), undefined, path);
  }
  assert.equal(app.fetch('/Dashboard.html', { method: 'POST', mode: 'navigate' }), undefined);
  assert.equal(app.fetch('/app.js?version=2'), undefined);
});

test('online navigation returns network-fresh HTML and updates app-shell cache under canonical pathname', async () => {
  const app = worker();
  const response = await app.fetch('/Habit_Detail.html?id=h-123', { mode: 'navigate' });
  assert.match(await response.text(), /^Network:https:\/\/habit-arc\.vercel\.app\/Habit_Detail\.html\?id=h-123/);
  assert.ok(app.puts.includes('/Habit_Detail.html'));
});

test('offline navigation serves cached app page first and falls back to offline.html when uncached', async () => {
  const app = worker({ offline: true });
  const habitsResp = await app.fetch('/Habits.html?view=all', { mode: 'navigate' });
  assert.equal(await habitsResp.text(), 'Cached:/Habits.html');

  const rootResp = await app.fetch('/?source=pwa', { mode: 'navigate' });
  assert.equal(await rootResp.text(), 'Cached:/index.html');

  const scriptResp = await app.fetch('/app.js');
  assert.equal(await scriptResp.text(), 'Cached:/app.js');

  const uncachedApp = worker({ offline: true, cachedRoutes: ['/offline.html'] });
  const uncachedResp = await uncachedApp.fetch('/Profile.html', { mode: 'navigate' });
  assert.equal(await uncachedResp.text(), 'Cached:/offline.html');

  const missingAll = worker({ offline: true, cachedRoutes: [] });
  const errorResp = await missingAll.fetch('/Dashboard.html', { mode: 'navigate' });
  assert.equal(errorResp.status, 503);
  assert.match(await errorResp.text(), /Reconnect/);
});

test('allowlisted static UI CDNs cache safely (including opaque responses) for offline styling', async () => {
  const cdnUrl = 'https://cdn.tailwindcss.com/?plugins=forms,container-queries';
  const onlineApp = worker({ opaqueCdn: true });
  const res = await onlineApp.fetch(cdnUrl);
  assert.equal(res.type, 'opaque');
  assert.ok(onlineApp.puts.includes(cdnUrl));

  const offlineApp = worker({ offline: true, cachedCdnUrls: [cdnUrl] });
  const cachedRes = await offlineApp.fetch(cdnUrl);
  assert.equal(await cachedRes.text(), `CachedCDN:${cdnUrl}`);
});

test('notification clicks only open allowlisted same-origin destinations', async () => {
  for (const url of ['https://evil.example/Insights.html', '//evil.example/Dashboard.html', '/__/auth/handler', 'javascript:alert(1)', 'http://[', '/Profile.html', undefined]) {
    const app = worker();
    await app.notification(url);
    assert.deepEqual(app.openedWindows, [`${origin}/Dashboard.html`]);
  }
  const app = worker();
  await app.notification(`${origin}/Arc_AI.html?redirect=evil#fragment`);
  assert.deepEqual(app.openedWindows, [`${origin}/Arc_AI.html`]);
});

test('notification focuses an existing destination window', async () => {
  let focused = false;
  const app = worker({ clients: [{ url: `${origin}/Dashboard.html`, focus: async () => { focused = true; } }] });
  await app.notification('/Dashboard.html');
  assert.equal(focused, true);
  assert.deepEqual(app.openedWindows, []);
});

test('registration works after load, bypasses HTTP cache, and announces updates when waiting', async () => {
  const calls = [];
  const dispatched = [];
  const waitingWorker = { state: 'installed' };
  vm.runInNewContext(registrationSource, {
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    navigator: {
      serviceWorker: {
        controller: {},
        register: (url, options) => {
          calls.push({ url, ...options });
          return Promise.resolve({ waiting: waitingWorker, addEventListener() {} });
        },
      },
    },
    document: { readyState: 'complete' },
    window: { isSecureContext: true, dispatchEvent: (ev) => dispatched.push(ev.type) },
    console,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [{ url: '/sw.js', scope: '/', updateViaCache: 'none' }]);
  assert.deepEqual(dispatched, ['habitarc:sw-update-ready']);
});

test('registration waits for load while the document is loading', () => {
  let loadHandler;
  let registrations = 0;
  vm.runInNewContext(registrationSource, {
    CustomEvent: class CustomEvent {},
    navigator: { serviceWorker: { register: () => { registrations++; return Promise.resolve(); } } },
    document: { readyState: 'loading' },
    window: { isSecureContext: true, dispatchEvent() {}, addEventListener: (type, handler) => {
      assert.equal(type, 'load');
      loadHandler = handler;
    } },
    console,
  });
  assert.equal(registrations, 0);
  loadHandler();
  assert.equal(registrations, 1);
});

test('unsupported or insecure contexts do not register a worker', () => {
  for (const navigator of [{}, { serviceWorker: {} }]) {
    vm.runInNewContext(registrationSource, { navigator, window: { isSecureContext: false } });
  }
});
