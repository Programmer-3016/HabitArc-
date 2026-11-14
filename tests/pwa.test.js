import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workerSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const registrationSource = readFileSync(new URL('../pwa-register.js', import.meta.url), 'utf8');
const origin = 'https://habit-arc.vercel.app';

function worker({ offline = false, cachedFallback = true, clients = [] } = {}) {
  const listeners = {};
  const added = [];
  const removed = [];
  const openedWindows = [];
  const matched = [];
  const fallback = new Response('<h1>Offline fallback</h1>');
  let claimed = false;
  let skippedWaiting = false;
  const cache = {
    addAll: async (urls) => added.push(...urls),
    match: async (url) => {
      matched.push(url);
      return cachedFallback && url === '/offline.html' ? fallback : undefined;
    },
  };
  vm.runInNewContext(workerSource, {
    URL,
    Response,
    fetch: async () => {
      if (offline) throw new TypeError('Network unavailable');
      return new Response('Fresh from network');
    },
    caches: {
      open: async () => cache,
      keys: async () => ['habitarc-shell-v1', 'habitarc-offline-v2', 'another-app-cache'],
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
    added, removed, openedWindows, matched,
    get claimed() { return claimed; },
    get skippedWaiting() { return skippedWaiting; },
    async lifecycle(type) {
      let work;
      listeners[type]({ waitUntil: (promise) => { work = promise; } });
      await work;
    },
    fetch(path, { method = 'GET', mode = 'same-origin' } = {}) {
      let response;
      listeners.fetch({
        request: { url: new URL(path, origin).href, method, mode },
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

test('PWA only precaches the self-contained fallback, never application or auth files', async () => {
  const app = worker();
  await app.lifecycle('install');
  assert.deepEqual(app.added, ['/offline.html', '/logo.png']);
  assert.equal(app.skippedWaiting, true);
});

test('PWA removes previous HabitArc caches without removing unrelated caches', async () => {
  const app = worker();
  await app.lifecycle('activate');
  assert.deepEqual(app.removed, ['habitarc-shell-v1']);
  assert.equal(app.claimed, true);
});

test('PWA never intercepts auth helpers, APIs, mutations, or external requests', () => {
  const app = worker();
  for (const path of ['/__', '/__/auth/handler', '/__/firebase/init.json', '/api', '/api/coach', 'https://accounts.google.com/auth', 'https://cdn.tailwindcss.com/']) {
    assert.equal(app.fetch(path, { mode: 'navigate' }), undefined, path);
  }
  assert.equal(app.fetch('/Dashboard.html', { method: 'POST', mode: 'navigate' }), undefined);
});

test('PWA does not cache or intercept application scripts and manifests', () => {
  const app = worker();
  for (const path of ['/app.js', '/firebase-auth.js', '/pwa-register.js', '/manifest.webmanifest', '/logo.png?version=2']) {
    assert.equal(app.fetch(path), undefined, path);
  }
});

test('online navigation always returns the network page', async () => {
  const app = worker();
  const response = await app.fetch('/Dashboard.html', { mode: 'navigate' });
  assert.equal(await response.text(), 'Fresh from network');
  assert.deepEqual(app.matched, []);
});

test('offline navigation returns a safe fallback, not stale application HTML', async () => {
  const app = worker({ offline: true });
  const response = await app.fetch('/Habits.html?view=all', { mode: 'navigate' });
  assert.equal(await response.text(), '<h1>Offline fallback</h1>');
  assert.deepEqual(app.matched, ['/offline.html']);
});

test('missing offline cache still gives a readable error response', async () => {
  const app = worker({ offline: true, cachedFallback: false });
  const response = await app.fetch('/Dashboard.html', { mode: 'navigate' });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Reconnect/);
});

test('notification clicks only open allowlisted same-origin destinations', async () => {
  for (const url of ['https://evil.example/Insights.html', '//evil.example/Dashboard.html', '/__/auth/handler', 'javascript:alert(1)', 'http://[', '/Profile.html', undefined]) {
    const app = worker();
    await app.notification(url);
    assert.deepEqual(app.openedWindows, [`${origin}/Dashboard.html`]);
  }
  const app = worker();
  await app.notification(`${origin}/Insights.html?redirect=evil#fragment`);
  assert.deepEqual(app.openedWindows, [`${origin}/Insights.html`]);
});

test('notification focuses an existing destination window', async () => {
  let focused = false;
  const app = worker({ clients: [{ url: `${origin}/Dashboard.html`, focus: async () => { focused = true; } }] });
  await app.notification('/Dashboard.html');
  assert.equal(focused, true);
  assert.deepEqual(app.openedWindows, []);
});

test('registration works after load and bypasses worker HTTP cache without reload loops', () => {
  const calls = [];
  vm.runInNewContext(registrationSource, {
    navigator: { serviceWorker: { register: (url, options) => {
      calls.push({ url, ...options });
      return Promise.resolve();
    } } },
    document: { readyState: 'complete' },
    window: { isSecureContext: true },
    console,
  });
  assert.deepEqual(calls, [{ url: '/sw.js', scope: '/', updateViaCache: 'none' }]);
});

test('registration waits for load while the document is loading', () => {
  let loadHandler;
  let registrations = 0;
  vm.runInNewContext(registrationSource, {
    navigator: { serviceWorker: { register: () => { registrations++; return Promise.resolve(); } } },
    document: { readyState: 'loading' },
    window: { isSecureContext: true, addEventListener: (type, handler) => {
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
