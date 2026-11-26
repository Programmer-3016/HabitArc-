import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function createStorage(seed = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, String(v)]));
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
  };
}

test('firebase-auth.js eliminates post-init setPersistence race and awaits authStateReady', () => {
  const src = read('firebase-auth.js');
  assert.match(src, /initializeAuth\(app,\s*\{/, 'Must initialize persistence upfront via initializeAuth');
  assert.match(src, /\[browserLocalPersistence,\s*indexedDBLocalPersistence\]/, 'Must prioritize browserLocalPersistence with IndexedDB fallback');
  assert.doesNotMatch(src, /await\s+setPersistence\s*\(/, 'Must never call setPersistence after getAuth() (causes refresh & cross-tab logout races)');
  assert.match(src, /auth\.authStateReady\(\)/, 'Must await auth.authStateReady() before treating null as signed-out');
  assert.match(src, /Promise\.all\(\[\s*importFirebaseModule/, 'Must load Firebase SDK modules in parallel with retry');
  assert.match(src, /function ensureGoogleRedirectResult\(\)/, 'Must evaluate getRedirectResult lazily instead of on every refresh');
});

test('app.js preserves optimistic cached auth user across refresh, slow Firebase boot, offline & cross-tab visibility, and clears on explicit signOut', async () => {
  const localStorage = createStorage({
    habitarc_active_uid: 'uid_sarth',
    habitarc_auth_user_cache: JSON.stringify({
      uid: 'uid_sarth',
      displayName: 'Sarth',
      email: 'sarth@example.com',
      photoURL: '',
      isAnonymous: false,
    }),
    'habitarc_data:uid_sarth': JSON.stringify({
      habits: [{ id: 'h1', name: 'Read', category: 'Learning', reminder: '08:00', repeat: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], createdAt: '2026-10-01', completions: {} }],
      completionHistory: {},
      settings: { userName: 'Sarth', theme: 'light', aiName: 'KAI' },
      onboardingComplete: true,
    }),
    'firebase:authUser:AIzaSyTest:[DEFAULT]': JSON.stringify({
      uid: 'uid_sarth',
      stsTokenManager: { refreshToken: 'rt_valid' },
    }),
  });

  const winListeners = new Map();
  const docListeners = new Map();
  let replacedUrl = null;
  let resolveAuthReady;
  let subscribedCb = null;
  let currentLiveUser = null;
  let signedOutCalls = 0;

  const mockAuthClient = {
    getCurrentUser: () => currentLiveUser,
    getPublicUser: () => (currentLiveUser ? {
      uid: currentLiveUser.uid,
      displayName: currentLiveUser.displayName || '',
      email: currentLiveUser.email || '',
      photoURL: '',
      isAnonymous: false,
    } : null),
    waitForInitialAuthState: () => new Promise((r) => { resolveAuthReady = r; }),
    subscribe(cb) {
      subscribedCb = cb;
      return () => {};
    },
    loadUserData: async () => ({ exists: false, profile: {}, data: {} }),
    saveUserData: async () => {},
    saveCompletionHistory: async () => {},
    subscribeToUserData: () => () => {},
    async signOut() {
      signedOutCalls += 1;
      currentLiveUser = null;
      localStorage.removeItem('firebase:authUser:AIzaSyTest:[DEFAULT]');
      subscribedCb?.(null);
    },
  };

  const navigatorObj = { onLine: true };
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class Event { constructor(type) { this.type = type; } },
    localStorage,
    sessionStorage: createStorage(),
    navigator: navigatorObj,
    location: {
      pathname: '/Dashboard.html',
      href: 'https://habit-arc.vercel.app/Dashboard.html',
      replace(url) { replacedUrl = url; },
    },
    document: {
      hidden: false,
      documentElement: { setAttribute() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener(type, fn) {
        if (!docListeners.has(type)) docListeners.set(type, []);
        docListeners.get(type).push(fn);
      },
    },
    window: null,
  });
  context.window = context;
  context.window.HabitArcAuthReady = Promise.resolve(mockAuthClient);
  context.window.addEventListener = (type, fn) => {
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  };
  context.window.dispatchEvent = () => {};

  const appCode = read('app.js').replace(
    `import('./firebase-auth.js')`,
    `Promise.resolve()`
  );
  vm.runInContext(appCode, context);

  // 1) Immediately at 0ms on refresh (BEFORE waitForInitialAuthState resolves!),
  // getAuthUser() MUST return cached Sarth instead of null!
  const earlyUser = context.HabitArc.getAuthUser();
  assert.equal(earlyUser?.uid, 'uid_sarth', 'getAuthUser() must return cached user during startup refresh window');
  assert.equal(earlyUser?.displayName, 'Sarth');
  assert.equal(context.HabitArc.getHabits()[0]?.name, 'Read', 'Scoped habits must stay loaded during refresh');

  // 2) Even if another tab briefly blips habitarc_active_uid before auth settles,
  // visibilitychange must NOT wipe activeUserId to null while Firebase token exists!
  localStorage.removeItem('habitarc_active_uid');
  for (const fn of (docListeners.get('visibilitychange') || [])) fn();
  assert.equal(context.HabitArc.getHabits()[0]?.name, 'Read', 'Cross-tab visibility check must not drop activeUserId while persisted token exists');
  localStorage.setItem('habitarc_active_uid', 'uid_sarth');

  // 3) Settle Firebase Auth with live user (let microtask chain reach waitForInitialAuthState)
  await new Promise((r) => setTimeout(r, 10));
  currentLiveUser = { uid: 'uid_sarth', displayName: 'Sarth', email: 'sarth@example.com' };
  resolveAuthReady?.(currentLiveUser);
  await new Promise((r) => setTimeout(r, 20));
  subscribedCb?.(currentLiveUser);
  assert.equal(replacedUrl, null, 'Must never redirect to Onboarding.html on authenticated refresh');

  // 4) Offline transient null emission must NOT kick signed-in user to Onboarding.html
  navigatorObj.onLine = false;
  currentLiveUser = null;
  subscribedCb?.(null);
  assert.equal(replacedUrl, null, 'Offline state must never redirect signed-in user to Onboarding.html');
  assert.equal(context.HabitArc.getAuthUser()?.uid, 'uid_sarth', 'Offline getAuthUser() must still return cached user');

  // 5) Explicit signOut() while back online MUST clear caches and redirect cleanly
  navigatorObj.onLine = true;
  await context.HabitArc.signOut();
  assert.equal(signedOutCalls, 1);
  assert.equal(localStorage.getItem('habitarc_active_uid'), null);
  assert.equal(localStorage.getItem('habitarc_auth_user_cache'), null);
  assert.equal(context.HabitArc.getAuthUser(), null);
  assert.equal(replacedUrl, 'Onboarding.html');
});

test('app-ui.js SPA pageAbortController never kills Firebase SDK or persistent module listeners on tab switch', () => {
  const uiSrc = read('app-ui.js');
  assert.match(uiSrc, /PERSISTENT_MODULE_RE/, 'SPA listener scoping must exempt Firebase SDK and persistent modules');
  assert.match(uiSrc, /gstatic\\\.com/, 'Firebase CDN modules must never receive pageAbortController signal');

  const onboardingSrc = read('Onboarding.html');
  assert.match(onboardingSrc, /window\.location\.replace\('Dashboard\.html'\)/, 'Onboarding must self-heal already-onboarded signed-in members back to Dashboard');

  const indexSrc = read('index.html');
  assert.match(indexSrc, /const firebaseUnavailable = !window\.HabitArcAuth/, 'index.html must keep cached signed-in users in app when Firebase CDN fails while navigator.onLine is true');
});
