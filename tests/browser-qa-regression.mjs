// Zero-dependency real-browser QA regression check over Chrome DevTools Protocol.
// Verifies mobile font-blocked layout, cross-tab completion sync, shared AudioContext reuse,
// offline missing-habit recovery, celebration overlay dismissal, and all 8 themes.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};
const ALL_THEMES = ['light', 'dark', 'sage', 'forest', 'midnight', 'ocean', 'purple', 'sunset'];

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  for (const cmd of ['google-chrome', 'chromium', 'chromium-browser', 'chrome', 'msedge']) {
    try {
      const locator = process.platform === 'win32' ? 'where' : 'which';
      const resolved = execFileSync(locator, [cmd], { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean);
      if (resolved && fs.existsSync(resolved)) return resolved;
    } catch {
      // Check next binary candidate.
    }
  }

  throw new Error('Could not find Chrome/Chromium/Edge. Set CHROME_PATH to run browser QA tests.');
}

const browserBin = findBrowserExecutable();
const screenshotDir = process.env.QA_SCREENSHOT_DIR ? path.resolve(process.env.QA_SCREENSHOT_DIR) : '';
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });

const server = http.createServer((req, res) => {
  const clean = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).slice(1) || 'index.html';
  if (clean === 'firebase-auth.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end('throw new Error("Offline browser QA test: Firebase intentionally disabled");');
    return;
  }
  const target = path.resolve(ROOT, clean);
  if (!target.startsWith(path.resolve(ROOT)) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'habitarc-qa-'));
let proc;
let ws;

try {
  proc = spawn(
    browserBin,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      `--user-data-dir=${userDir}`,
      'about:blank'
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(stderr || 'Timed out waiting for Chrome CDP endpoint')), 12000);
    const onData = chunk => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);
  });

  const targets = await (await fetch(wsUrl.replace('ws://', 'http://').replace(/\/devtools.*/, '/json/list'))).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));

  let msgId = 1;
  const pending = new Map();
  const errors = [];
  let blockFonts = false;
  let blockedFontReqs = 0;
  const blockedReqIds = new Map();

  ws.addEventListener('message', ev => {
    const data = JSON.parse(ev.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id).resolve(data.result);
      pending.delete(data.id);
    } else if (data.method === 'Runtime.exceptionThrown') {
      errors.push(data.params.exceptionDetails?.text || 'Runtime exception');
    } else if (data.method === 'Network.requestWillBeSent') {
      if (blockFonts && /fonts\.(googleapis|gstatic)\.com/i.test(data.params.request.url)) {
        blockedReqIds.set(data.params.requestId, data.params.request.url);
      }
    } else if (data.method === 'Network.loadingFailed') {
      if (blockedReqIds.has(data.params.requestId)) blockedFontReqs++;
    }
  });

  const cdp = (method, params = {}) => new Promise(resolve => {
    const id = msgId++;
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const ev = async expression => {
    const res = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(`${res.exceptionDetails.text}: ${res.exceptionDetails.exception?.description || ''}`);
    }
    return res.result?.value;
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const go = async url => {
    await cdp('Page.navigate', { url });
    await sleep(850);
  };
  const saveShot = async name => {
    if (!screenshotDir) return;
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, name), Buffer.from(shot.data, 'base64'));
  };

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `if (!localStorage.getItem('habitarc_data')) localStorage.setItem('habitarc_data', JSON.stringify({
      onboardingComplete: true,
      habits: [
        { id: 'h1', name: 'Read 20 pages', icon: 'menu_book', category: 'Learning', repeat: ['sun','mon','tue','wed','thu','fri','sat'], createdAt: '2026-11-01', completions: {} },
        { id: 'h2', name: 'Workout', icon: 'fitness_center', category: 'Health', repeat: ['sun','mon','tue','wed','thu','fri','sat'], createdAt: '2026-11-01', completions: {} }
      ],
      completionHistory: {},
      settings: { userName: 'Sarthak', theme: 'light', cleanThemeChosen: true }
    }));`
  });

  // 1) Font-blocked mobile:true overflow checks at 390px and 320px before any font/SW caching
  blockedFontReqs = 0;
  blockFonts = true;
  for (const width of [390, 320]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
    for (const page of ['Dashboard.html', 'Habits.html', 'Arc_AI.html', 'Leaderboard.html', 'Insights.html', 'Notes.html', 'Habit_Detail.html?id=h1', 'Add_Habit.html', 'Settings.html', 'Profile.html']) {
      await go(`${base}/${page}`);
      const metrics = await ev(`({ vw: innerWidth, sw: document.documentElement.scrollWidth })`);
      assert.ok(metrics.vw <= width && metrics.sw <= width, `${page} font-blocked overflow at ${width}px: ${JSON.stringify(metrics)}`);
    }
    await go(`${base}/Habits.html`);
    for (const mode of ['tasks', 'day', 'habits']) {
      await ev(`document.querySelector('[data-plan-mode="${mode}"]')?.click()`);
      await sleep(150);
      const metrics = await ev(`({ vw: innerWidth, sw: document.documentElement.scrollWidth })`);
      assert.ok(metrics.vw <= width && metrics.sw <= width, `Habits (${mode}) font-blocked overflow at ${width}px: ${JSON.stringify(metrics)}`);
    }
    if (width === 390) await saveShot('habits-390-fontblocked.png');
    await go(`${base}/Arc_AI.html`);
    if (width === 390) {
      const materialLoaded = await ev(`[...document.fonts].filter(f => /Material/i.test(f.family) && f.status === 'loaded').length`);
      assert.equal(materialLoaded, 0, 'Confirmed Material Symbols font stayed blocked during mobile font-blocked check');
      await saveShot('arc-390-fontblocked.png');
    }
    await ev(`document.querySelector('#arc-zen-home').classList.add('hidden'); document.querySelector('#arc-thread-view').classList.remove('hidden');`);
    await sleep(100);
    const arcThread = await ev(`({ vw: innerWidth, sw: document.documentElement.scrollWidth })`);
    assert.ok(arcThread.vw <= width && arcThread.sw <= width, `Arc_AI thread font-blocked overflow at ${width}px: ${JSON.stringify(arcThread)}`);
  }
  blockFonts = false;
  await cdp('Network.setBlockedURLs', { urls: [] });
  assert.ok(blockedFontReqs > 0, 'Confirmed Google Fonts requests were blocked during test');

  // 2) Cross-tab stale-button undo guard + focus + StorageEvent refresh across Habits, Dashboard, Habit_Detail
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const [pageName, sel] of [
    ['Habits.html', '.habit-toggle[data-id="h1"]'],
    ['Dashboard.html', '.habit-toggle[data-id="h1"]'],
    ['Habit_Detail.html?id=h1', '#complete-today-btn']
  ]) {
    await go(`${base}/${pageName}`);
    await ev(`HabitArc.uncompleteHabit('h1'); document.querySelector('#haSrCtaBtn')?.click();`);
    await sleep(100);
    await ev(`window.dispatchEvent(new CustomEvent('habitarc:data-changed', { detail: { source: 'user-cache' } }))`);
    assert.equal(await ev(`document.querySelector('${sel}').getAttribute('aria-pressed')`), 'false', `${pageName}: starts unchecked`);

    await ev(`(() => {
      const d = JSON.parse(localStorage.getItem('habitarc_data'));
      const today = HabitArc.today();
      const h = d.habits.find(x => x.id === 'h1');
      h.completions = h.completions || {};
      h.completions[today] = true;
      d.completionHistory = d.completionHistory || {};
      const now = new Date().toISOString();
      d.completionHistory['h1_' + today] = { id: 'h1_' + today, habitId: 'h1', date: today, status: 'completed', completedAt: now, updatedAt: now };
      localStorage.setItem('habitarc_data', JSON.stringify(d));
    })()`);
    assert.equal(await ev(`HabitArc.isCompletedToday('h1')`), true);
    assert.equal(await ev(`document.querySelector('${sel}').getAttribute('aria-pressed')`), 'false', `${pageName}: button reflects stale tab state before click`);

    await ev(`document.querySelector('${sel}').click()`);
    assert.equal(await ev(`HabitArc.isCompletedToday('h1')`), true, `${pageName}: stale click must not undo completed habit`);
    assert.equal(await ev(`document.querySelector('${sel}').getAttribute('aria-pressed')`), 'true', `${pageName}: button resyncs to completed`);

    await ev(`(() => {
      const d = JSON.parse(localStorage.getItem('habitarc_data'));
      const today = HabitArc.today();
      const h = d.habits.find(x => x.id === 'h1');
      if (h.completions) delete h.completions[today];
      d.completionHistory['h1_' + today] = { id: 'h1_' + today, habitId: 'h1', date: today, status: 'not_completed', completedAt: null, updatedAt: new Date().toISOString() };
      localStorage.setItem('habitarc_data', JSON.stringify(d));
      window.dispatchEvent(new Event('focus'));
    })()`);
    assert.equal(await ev(`document.querySelector('${sel}').getAttribute('aria-pressed')`), 'false', `${pageName}: foreground focus refreshes state`);

    await ev(`(() => {
      const d = JSON.parse(localStorage.getItem('habitarc_data'));
      const today = HabitArc.today();
      d.habits.find(x => x.id === 'h1').completions[today] = true;
      const now = new Date().toISOString();
      d.completionHistory['h1_' + today] = { id: 'h1_' + today, habitId: 'h1', date: today, status: 'completed', completedAt: now, updatedAt: now };
      localStorage.setItem('habitarc_data', JSON.stringify(d));
      window.dispatchEvent(new StorageEvent('storage', { key: 'habitarc_data', newValue: JSON.stringify(d) }));
    })()`);
    assert.equal(await ev(`document.querySelector('${sel}').getAttribute('aria-pressed')`), 'true', `${pageName}: StorageEvent syncs state`);
  }

  // 3) Completing all daily habits leaves #edit-habit-btn unobstructed (no runner overlay)
  await go(`${base}/Habit_Detail.html?id=h1`);
  await ev(`HabitArc.uncompleteHabit('h1'); HabitArc.completeHabit('h2'); window.dispatchEvent(new Event('focus'));`);
  await sleep(150);
  await ev(`document.querySelector('#complete-today-btn').click()`);
  await sleep(260);
  const editUnblocked = await ev(`(() => {
    const edit = document.querySelector('#edit-habit-btn');
    const r = edit.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !document.querySelector('#haSrCtaBtn') && !!hit && (hit === edit || edit.contains(hit));
  })()`);
  assert.equal(editUnblocked, true, 'Completing all daily habits keeps #edit-habit-btn unobstructed');

  // 4) Single shared AudioContext reused across 100 completions
  await go(`${base}/Habits.html`);
  const audioStats = await ev(`(() => {
    let created = 0, oscs = 0;
    const RealCtx = window.AudioContext || window.webkitAudioContext;
    window.AudioContext = window.webkitAudioContext = function() {
      created++;
      const c = new RealCtx();
      const origOsc = c.createOscillator.bind(c);
      c.createOscillator = () => { oscs++; return origOsc(); };
      return c;
    };
    for (let i = 0; i < 100; i++) {
      HabitArc.completeHabit('h1');
      HabitArc.uncompleteHabit('h1');
    }
    return { created, oscs };
  })()`);
  assert.equal(audioStats.created, 1, 'Creates only 1 shared AudioContext across 100 completions');
  assert.ok(audioStats.oscs >= 200, `Schedules all 200 oscillators cleanly (${audioStats.oscs})`);

  // 5) Fast offline/local missing habit recovery with immediate Back to Habits link
  const recoveryStart = Date.now();
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: `${base}/Habit_Detail.html?id=invalid-missing-id` });
  let backHref = '';
  for (let i = 0; i < 40; i++) {
    await sleep(50);
    backHref = await ev(`([...document.querySelectorAll('a')].find(a => a.textContent.includes('Back to Habits'))?.getAttribute('href')) || ''`).catch(() => '');
    if (backHref) break;
  }
  assert.equal(backHref, 'Habits.html', 'Immediate Back to Habits recovery link appears');
  let alertText = '';
  for (let i = 0; i < 60; i++) {
    alertText = await ev(`document.querySelector('[role="alert"]')?.textContent || ''`).catch(() => '');
    if (alertText.includes('could not be loaded')) break;
    await sleep(50);
  }
  const elapsed = Date.now() - recoveryStart;
  assert.ok(elapsed < 3000, `Missing habit recovery took too long: ${elapsed}ms`);
  assert.ok(alertText.includes('could not be loaded'), `Unexpected alert message: ${alertText}`);

  // 6) Font-enabled badge integrity + all 8 themes settled & persisted
  await go(`${base}/Habits.html`);
  const badgeRect = await ev(`(() => {
    const r = document.querySelector('.ha-plan-badge').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  })()`);
  assert.ok(badgeRect.w >= 44 && badgeRect.w === badgeRect.h, `Expected padded square badge, got ${JSON.stringify(badgeRect)}`);

  await go(`${base}/Settings.html`);
  const themeColors = {};
  for (const theme of ALL_THEMES) {
    const settled = await ev(`(async () => {
      const btn = document.querySelector('[data-theme-val="${theme}"]');
      btn.click();
      for (let i = 0; i < 20 && document.documentElement.dataset.theme !== '${theme}'; i++) await new Promise(r => setTimeout(r, 20));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        dataTheme: document.documentElement.dataset.theme,
        bg: getComputedStyle(document.body).backgroundColor
      };
    })()`);
    assert.equal(settled.dataTheme, theme, `${theme}: data-theme updated`);
    themeColors[theme] = settled.bg;
    await go(`${base}/Dashboard.html`);
    assert.equal(await ev(`document.documentElement.dataset.theme`), theme, `${theme}: persisted across navigation`);
    await go(`${base}/Settings.html`);
  }
  assert.equal(new Set(Object.values(themeColors)).size, ALL_THEMES.length, `Expected 8 distinct theme backgrounds: ${JSON.stringify(themeColors)}`);

  // 7) Rewards Chests (default tab) Quest Fill Pill + Open now + Unlocked cards at mobile 390px
  await go(`${base}/Leaderboard.html`);
  await ev(`(() => {
    const d = JSON.parse(localStorage.getItem('habitarc_data'));
    const h = d.habits[0];
    d.completionHistory = d.completionHistory || {};
    for (let i = 1; i <= 14; i++) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const key = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
      h.completions[key] = true;
      d.completionHistory[h.id + '_' + key] = { id: h.id + '_' + key, habitId: h.id, date: key, status: 'completed', completedAt: key + 'T10:00:00.000Z', updatedAt: key + 'T10:00:00.000Z' };
    }
    d.habits = [h];
    d.settings.theme = 'light';
    d.settings.treasureRoom = { opened: ['wood', 'iron'] };
    localStorage.setItem('habitarc_data', JSON.stringify(d));
    window.dispatchEvent(new CustomEvent('habitarc:data-changed', { detail: { source: 'storage' } }));
  })()`);
  await go(`${base}/Leaderboard.html`);
  const vaultCheck = await ev(`({
    overflow: document.documentElement.scrollWidth > innerWidth,
    fitsOneScreen: document.documentElement.scrollHeight <= innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight,
    defaultTabPressed: document.querySelector('#show-treasures')?.getAttribute('aria-pressed'),
    leagueHidden: document.querySelector('#league-view')?.hidden,
    wood: document.querySelector('[data-tier="wood"] .lb-chest-action')?.textContent.trim(),
    iron: document.querySelector('[data-tier="iron"] .lb-chest-action')?.textContent.trim(),
    gold: document.querySelector('[data-tier="gold"] .lb-chest-action')?.textContent.trim(),
    ruby: document.querySelector('[data-tier="ruby"] .lb-chest-action')?.textContent.trim(),
    rubyLockedClass: document.querySelector('[data-tier="ruby"] .lb-chest-action')?.classList.contains('lb-chest-action-locked')
  })`);
  await saveShot('rewards-clean-390.png');
  assert.equal(vaultCheck.overflow, false, 'Rewards renders cleanly at 390px without overflow');
  assert.equal(vaultCheck.fitsOneScreen, true, `Rewards Chests view fits cleanly without trailing blank scroll: ${vaultCheck.scrollHeight} vs ${vaultCheck.innerHeight}`);
  assert.equal(vaultCheck.defaultTabPressed, 'true', 'Rewards opens to Chests view cleanly');
  assert.equal(vaultCheck.leagueHidden, true, 'Demo standings stay hidden behind preview toggle');
  assert.equal(vaultCheck.wood, '✓ Unlocked');
  assert.equal(vaultCheck.iron, '✓ Unlocked');
  assert.equal(vaultCheck.gold, 'Open now');
  assert.equal(vaultCheck.rubyLockedClass, true);
  assert.ok(/d left$/.test(vaultCheck.ruby), `Expected countdown pill label on Dragon card, got: ${vaultCheck.ruby}`);
  await ev(`document.querySelector('[data-tier="ruby"] .lb-chest-action').click()`);
  await sleep(150);
  const previewDetail = await ev(`({ open: !!document.querySelector('dialog.lb-reveal[open]'), badge: document.querySelector('.lb-reveal-badge')?.textContent })`);
  assert.equal(previewDetail.open, true, 'Tapping locked Dragon Quest Fill Pill opens safe preview modal');
  assert.equal(previewDetail.badge, 'Opening preview', 'Locked pill opens preview only without claiming XP');
  await ev(`document.querySelector('dialog.lb-reveal')?.close()`);

  // 8) Dashboard unified progress+day strip above the fold + bottom dock fade scrim at 390px
  await go(`${base}/Dashboard.html`);
  const dashCheck = await ev(`(() => {
    const hero = document.querySelector('.ha-progress-card');
    const peek = document.getElementById('ha-day-dashboard-peek');
    const firstHabit = document.querySelector('.ha-dashboard-habit');
    const dock = document.querySelector('.ha-bottom-nav');
    const scrimBg = getComputedStyle(document.body, '::after').backgroundImage;
    const hRect = firstHabit ? firstHabit.getBoundingClientRect() : null;
    const dRect = dock ? dock.getBoundingClientRect() : null;
    return {
      unified: Boolean(hero && peek && hero.contains(peek)),
      noDuplicateHabitsChip: !document.getElementById('ha-day-dashboard-stats')?.textContent.includes('habits'),
      firstPaintOpacity: getComputedStyle(document.querySelector('.fade-up')).opacity,
      firstHabitVisibleAboveDock: Boolean(hRect && dRect && hRect.top < dRect.top - 40),
      hasBottomScrim: Boolean(scrimBg && scrimBg.includes('linear-gradient'))
    };
  })()`);
  assert.equal(dashCheck.unified, true, 'Dashboard merges Day at a Glance inside main progress card');
  assert.equal(dashCheck.noDuplicateHabitsChip, true, 'Dashboard summary strip omits redundant habits chip');
  assert.equal(dashCheck.firstPaintOpacity, '1', 'Dashboard cards render immediately without fade-up lag');
  assert.equal(dashCheck.firstHabitVisibleAboveDock, true, 'First habit lifts cleanly above bottom dock on 390px phone');
  assert.equal(dashCheck.hasBottomScrim, true, 'Mobile bottom dock renders smooth gradient fade scrim');
  assert.equal(errors.length, 0, `Unexpected browser runtime errors: ${errors.join('; ')}`);

  console.log(JSON.stringify({
    status: 'PASS',
    blockedFontReqs,
    audioStats,
    recoveryMs: elapsed,
    badgeRect,
    themesVerified: ALL_THEMES.length,
    distinctBackgrounds: new Set(Object.values(themeColors)).size
  }));
} finally {
  try { ws?.close(); } catch {}
  try { proc?.kill(); } catch {}
  server.close();
  try { fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch {}
}
