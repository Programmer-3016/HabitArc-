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
      const ex = data.params.exceptionDetails;
      const msg = `${ex?.url || ''}:${ex?.lineNumber ?? ''} ${ex?.exception?.description || ex?.text || 'Runtime exception'}`;
      if (!/Offline browser QA test: Firebase intentionally disabled/.test(msg)) {
        errors.push(msg);
      }
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
    if (width === 320 || width === 390) {
      await go(`${base}/Add_Habit.html`);
      const addHabitCheck = await ev(`(() => {
        const sub = document.getElementById('habit-form-submit')?.getBoundingClientRect();
        const cancel = document.getElementById('habit-form-cancel')?.getBoundingClientRect();
        const nameInp = document.getElementById('habit-name-input')?.getBoundingClientRect();
        return {
          subRightOk: Boolean(sub && sub.right <= innerWidth + 1 && sub.left >= 0),
          cancelLeftOk: Boolean(cancel && cancel.left >= 0 && cancel.right <= innerWidth + 1),
          inputFit: Boolean(nameInp && nameInp.right <= innerWidth + 1)
        };
      })()`);
      assert.equal(addHabitCheck.subRightOk, true, `Add_Habit submit fits ${width}px viewport`);
      assert.equal(addHabitCheck.cancelLeftOk, true, `Add_Habit cancel fits ${width}px viewport`);
      assert.equal(addHabitCheck.inputFit, true, `Add_Habit name input fits ${width}px viewport`);
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

  // 1b) Tablet (768px) & Desktop (1366px) A-Z layout alignment & overflow checks
  const allShellPages = ['Dashboard.html', 'Habits.html', 'Arc_AI.html', 'Leaderboard.html', 'Insights.html', 'Notes.html', 'Habit_Detail.html?id=h1', 'Add_Habit.html', 'Settings.html', 'Profile.html', 'privacy.html', 'offline.html'];
  await cdp('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: true });
  for (const page of allShellPages) {
    await go(`${base}/${page}`);
    const m = await ev(`({ vw: innerWidth, sw: document.documentElement.scrollWidth })`);
    assert.ok(m.vw <= 768 && m.sw <= 768, `${page} overflow at 768px tablet: ${JSON.stringify(m)}`);
  }

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const page of allShellPages) {
    await go(`${base}/${page}`);
    const m = await ev(`({ vw: innerWidth, sw: document.documentElement.scrollWidth })`);
    assert.ok(m.vw <= 1366 && m.sw <= 1366, `${page} overflow at 1366px desktop: ${JSON.stringify(m)}`);
  }
  await go(`${base}/Dashboard.html`);
  const hdrAlign = await ev(`(() => {
    const links = [...document.querySelectorAll('header.md\\\\:block nav a')].map(a => {
      const r = a.getBoundingClientRect();
      return { text: a.textContent.trim(), top: r.top, height: r.height };
    });
    const tops = links.map(l => l.top);
    const heights = links.map(l => l.height);
    return {
      count: links.length,
      maxTopSpread: Math.max(...tops) - Math.min(...tops),
      maxHeightSpread: Math.max(...heights) - Math.min(...heights)
    };
  })()`);
  assert.equal(hdrAlign.count, 6, 'Desktop header shows all 6 primary tabs');
  assert.ok(hdrAlign.maxTopSpread <= 1.5, `Desktop header tabs must align vertically (spread ${hdrAlign.maxTopSpread}px)`);
  assert.ok(hdrAlign.maxHeightSpread <= 1.5, `Desktop header tabs must share uniform height (spread ${hdrAlign.maxHeightSpread}px)`);

  await go(`${base}/Habits.html`);
  const planAlign = await ev(`(() => {
    const modes = document.querySelector('.ha-plan-modes');
    const parent = modes?.parentElement;
    if (!modes || !parent) return { ratio: 0 };
    return { ratio: modes.getBoundingClientRect().width / parent.getBoundingClientRect().width };
  })()`);
  assert.ok(planAlign.ratio >= 0.95, `Habits mode switcher spans full desktop column (ratio ${planAlign.ratio.toFixed(2)})`);

  await go(`${base}/Notes.html`);
  const notesToolbarGap = await ev(`(() => {
    const s = document.querySelector('.notes-search')?.getBoundingClientRect();
    const f = document.querySelector('.notes-filters')?.getBoundingClientRect();
    if (!s || !f) return { gap: 999 };
    return { gap: Math.round(f.left - s.right) };
  })()`);
  assert.ok(notesToolbarGap.gap <= 32 && notesToolbarGap.gap >= 0, `Notes search fills desktop toolbar cleanly (gap ${notesToolbarGap.gap}px)`);

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

  // 6) Font-enabled Plan action pill integrity + all 8 themes settled & persisted
  await go(`${base}/Habits.html`);
  const badgeRect = await ev(`(() => {
    const r = document.querySelector('#ha-plan-v1-add, .ha-plan-badge').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  })()`);
  assert.ok(badgeRect.w >= 44 && badgeRect.h >= 28, `Expected crisp Plan CTA pill, got ${JSON.stringify(badgeRect)}`);

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
  const leagueDefaultCheck = await ev(`({
    overflow: document.documentElement.scrollWidth > innerWidth,
    leaguePressed: document.querySelector('#show-league')?.getAttribute('aria-pressed'),
    leagueHidden: document.querySelector('#league-view')?.hidden,
    treasuresHidden: document.querySelector('#treasures')?.hidden,
    podiumTop: document.getElementById('podium')?.getBoundingClientRect().top || 999
  })`);
  assert.equal(leagueDefaultCheck.overflow, false, 'League default view renders cleanly at 390px without overflow');
  assert.equal(leagueDefaultCheck.leaguePressed, 'true', 'Leaderboard opens to League view first');
  assert.equal(leagueDefaultCheck.leagueHidden, false, 'League standings visible by default');
  assert.equal(leagueDefaultCheck.treasuresHidden, true, 'Chests hidden until Chests tab is selected');
  assert.ok(leagueDefaultCheck.podiumTop < 380, `Expected Podium above the fold on mobile, got top=${leagueDefaultCheck.podiumTop}`);

  await ev(`document.querySelector('#show-treasures')?.click()`);
  await sleep(120);
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
  assert.equal(vaultCheck.defaultTabPressed, 'true', 'Chests tab activates cleanly on click');
  assert.equal(vaultCheck.leagueHidden, true, 'League hides when Chests tab is active');
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

  // 9) Custom AI Name + Pixel Level 1->2 UI across Onboarding Step 5, Settings, Dashboard & ARC AI at 390px
  await ev(`localStorage.removeItem('habitarc_data')`);
  await go(`${base}/Onboarding.html`);
  for (let i = 0; i < 4; i++) {
    await ev(`document.getElementById('next-step-btn')?.click()`);
    await sleep(160);
  }
  const obAi = await ev(`(() => {
    const inp = document.getElementById('ai-name-input');
    inp.value = 'NOVA';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      step5Active: document.getElementById('step-5')?.classList.contains('active'),
      indicator: document.getElementById('step-indicator')?.textContent.trim(),
      preview: document.getElementById('ob-ai-preview-name')?.textContent.trim(),
      inline: document.getElementById('ob-ai-preview-inline')?.textContent.trim(),
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  })()`);
  await saveShot('onboarding-ai-name-390.png');
  assert.equal(obAi.step5Active, true, 'Onboarding advances cleanly to Step 5 Name your AI');
  assert.equal(obAi.indicator, '5 / 8');
  assert.equal(obAi.preview, 'NOVA');
  assert.equal(obAi.inline, 'NOVA');
  assert.equal(obAi.overflow, false, 'Onboarding Step 5 fits 390px without horizontal overflow');

  await go(`${base}/Settings.html`);
  await ev(`(() => {
    const today = HabitArc.today();
    const d = {
      habits: [{ id: 'h1', name: 'Stretch', category: 'Health', reminder: '08:00', repeat: ['mon','tue','wed','thu','fri','sat','sun'], createdAt: today, completions: {} }],
      completionHistory: {},
      settings: { userName: 'Alex', theme: 'light', aiName: 'ARC' },
      onboardingComplete: true
    };
    localStorage.setItem('habitarc_data', JSON.stringify(d));
    window.dispatchEvent(new CustomEvent('habitarc:data-changed', { detail: { source: 'storage' } }));
  })()`);
  await go(`${base}/Settings.html`);
  await ev(`(() => {
    const inp = document.getElementById('settings-ai-name-input');
    inp.value = 'NOVA';
    document.getElementById('settings-ai-save-btn').click();
  })()`);
  await sleep(150);
  const settingsAi = await ev(`({
    levelPill: document.getElementById('settings-ai-level-pill')?.textContent.trim(),
    summary: document.getElementById('settings-ai-power-summary')?.textContent.trim(),
    status: document.getElementById('settings-ai-status')?.textContent.trim(),
    savedName: HabitArc.getSettings().aiName,
    overflow: document.documentElement.scrollWidth > innerWidth
  })`);
  await ev(`document.getElementById('settings-ai-save-btn')?.scrollIntoView({ block: 'center' })`);
  await sleep(100);
  await saveShot('settings-ai-390.png');
  assert.equal(settingsAi.savedName, 'NOVA');
  assert.equal(settingsAi.levelPill, 'LVL 1 · HABIT BUILDER');
  assert.match(settingsAi.summary, /Right now NOVA can make habits for you/);
  assert.match(settingsAi.status, /Saved AI name as NOVA/);
  assert.equal(settingsAi.overflow, false, 'Settings HabitArc AI section fits 390px cleanly');

  await go(`${base}/Dashboard.html`);
  const dashLvl1 = await ev(`(() => {
    const firstHabit = document.querySelector('.ha-dashboard-habit');
    const dock = document.querySelector('.ha-bottom-nav');
    const hRect = firstHabit ? firstHabit.getBoundingClientRect() : null;
    const dRect = dock ? dock.getBoundingClientRect() : null;
    return {
      pill: document.getElementById('dash-ai-pill-label')?.textContent.trim(),
      bannerName: document.getElementById('dash-ai-name')?.textContent.trim(),
      bannerRank: document.getElementById('dash-ai-rank')?.textContent.trim(),
      bannerLvl: document.getElementById('dash-ai-level-badge')?.textContent.trim(),
      copy: document.getElementById('dash-ai-power-copy')?.textContent.trim(),
      firstHabitVisibleAboveDock: Boolean(hRect && dRect && hRect.top < dRect.top - 40),
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  })()`);
  await saveShot('dashboard-ai-lvl1-390.png');
  assert.equal(dashLvl1.pill, 'NOVA · LVL 1');
  assert.equal(dashLvl1.bannerName, 'NOVA');
  assert.equal(dashLvl1.bannerRank, 'HABIT BUILDER');
  assert.equal(dashLvl1.bannerLvl, 'LVL 1');
  assert.match(dashLvl1.copy, /Right now NOVA can make habits for you/);
  assert.equal(dashLvl1.firstHabitVisibleAboveDock, true, 'Dashboard keeps first habit above dock with AI pill + banner');
  assert.equal(dashLvl1.overflow, false, 'Dashboard with AI pill & pixel banner fits 390px without overflow');

  await go(`${base}/Arc_AI.html`);
  await saveShot('arc-ai-lvl1-light-390.png');
  const arcLvl1 = await ev(`(() => {
    const comp = document.getElementById('ai-coach-form')?.getBoundingClientRect();
    const dock = document.querySelector('nav.ha-bottom-nav')?.getBoundingClientRect();
    const hasTopLevelCard = Boolean(document.getElementById('arc-level-card'));
    const hasChatJourney = Boolean(document.getElementById('arc-thread-journey'));
    document.getElementById('arc-open-hub-btn')?.click();
    const hubOpen = Boolean(document.getElementById('arc-hub-dialog')?.hasAttribute('open'));
    document.getElementById('arc-lvl1-try-btn')?.click();
    const hubClosedAfterTry = !document.getElementById('arc-hub-dialog')?.hasAttribute('open');
    return {
      hasTopLevelCard,
      hasChatJourney,
      hubOpen,
      hubClosedAfterTry,
      buddy: document.getElementById('arc-ai-buddy-name')?.textContent.trim(),
      lvl: document.getElementById('arc-ai-lvl-badge')?.textContent.trim(),
      nextTxt: document.getElementById('arc-ai-next-txt')?.textContent.trim(),
      t1: document.getElementById('arc-tier-state-1')?.textContent.trim(),
      t2: document.getElementById('arc-tier-state-2')?.textContent.trim(),
      t4: document.getElementById('arc-tier-state-4')?.textContent.trim(),
      powerCopy: document.getElementById('arc-ai-power-copy')?.textContent.trim(),
      prefill: document.getElementById('ai-coach-question')?.value,
      composerClear: Boolean(comp && dock && comp.bottom <= dock.top - 4),
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  })()`);
  assert.equal(arcLvl1.hasTopLevelCard, false, 'Top Zen level card must stay removed cleanly');
  assert.equal(arcLvl1.hasChatJourney, false, 'Top chat journey card must stay removed cleanly');
  assert.equal(arcLvl1.hubOpen, true, 'Compact pill opens #arc-hub-dialog');
  assert.equal(arcLvl1.hubClosedAfterTry, true, 'Try button closes hub modal and prefills prompt');
  assert.equal(arcLvl1.buddy, 'NOVA');
  assert.equal(arcLvl1.lvl, 'LVL 1');
  assert.equal(arcLvl1.nextTxt, '0/3 QUESTS');
  assert.equal(arcLvl1.t1, 'ACTIVE');
  assert.equal(arcLvl1.t2, 'LOCKED');
  assert.equal(arcLvl1.t4, 'LOCKED');
  assert.match(arcLvl1.powerCopy, /Right now at Level 1 you can use NOVA to create habits for you/);
  assert.equal(arcLvl1.prefill, 'Create a 10-min stretching habit at 08:00');
  assert.equal(arcLvl1.composerClear, true, 'ARC AI Zen composer sits cleanly above bottom dock with zero overlap');
  assert.equal(arcLvl1.overflow, false, 'ARC AI Zen top pill bar fits 390px without overflow');

  await ev(`(() => {
    HabitArc.completeHabit('h1');
    const h2 = HabitArc.addHabit({ name: 'Read 10m' }).habit;
    const h3 = HabitArc.addHabit({ name: 'Walk 15m' }).habit;
    HabitArc.completeHabit(h2.id);
    HabitArc.completeHabit(h3.id);
    HabitArc.recordAiAction('create');
    HabitArc.setTheme('dark');
  })()`);
  await go(`${base}/Arc_AI.html`);
  const arcLvl2 = await ev(`({
    lvl: document.getElementById('arc-ai-lvl-badge')?.textContent.trim(),
    rank: document.getElementById('arc-ai-rank')?.textContent.trim(),
    t1: document.getElementById('arc-tier-state-1')?.textContent.trim(),
    t2: document.getElementById('arc-tier-state-2')?.textContent.trim(),
    questTitle: document.getElementById('arc-quest-hdr-title')?.textContent.trim(),
    theme: document.documentElement.dataset.theme,
    overflow: document.documentElement.scrollWidth > innerWidth
  })`);
  await saveShot('arc-ai-lvl2-dark-390.png');
  assert.equal(arcLvl2.lvl, 'LVL 2');
  assert.equal(arcLvl2.rank, 'ROUTINE MANAGER');
  assert.equal(arcLvl2.t1, 'ON ✓');
  assert.equal(arcLvl2.t2, 'ACTIVE');
  assert.equal(arcLvl2.questTitle, 'QUESTS TO LVL 3');
  assert.equal(arcLvl2.theme, 'dark');
  assert.equal(arcLvl2.overflow, false, 'ARC AI dark theme LVL 2 fits 390px without overflow');

  await ev(`(() => {
    const uid = localStorage.getItem('habitarc_active_uid') || 'local';
    const now = Date.now();
    const chats = [
      {
        id: 'chat_seed_1',
        title: 'Delete Stretch habit and add review task',
        createdAt: now - 120000,
        updatedAt: now - 60000,
        deleted: false,
        turns: [
          { question: 'How can I stay steady this week?', answer: 'Pick one morning anchor habit.', timestamp: now - 110000 },
          { question: 'Should I schedule reminders?', answer: 'Yes, anchor at 08:00 after breakfast.', timestamp: now - 100000 },
          { question: 'What if a day is busy?', answer: 'Drop to a 2-minute Plan B fallback.', timestamp: now - 90000 },
          { question: 'And weekends?', answer: 'Keep the same cue so the streak holds.', timestamp: now - 80000 },
          {
            question: 'Delete Stretch habit and add review task',
            answer: 'With LVL 2 powers unlocked, I can now edit, delete, complete habits, or add tasks directly with 1-tap Undo.',
            timestamp: now - 60000
          }
        ],
        lastEvidence: 'Window: 28d · Guidance only.'
      },
      {
        id: 'chat_seed_2',
        title: 'Morning water habit check-in',
        createdAt: now - 86400000 - 5000,
        updatedAt: now - 86400000 - 5000,
        deleted: false,
        turns: [{ question: 'Morning water habit check-in', answer: 'Keep a glass right beside your alarm clock.', timestamp: now - 86400000 - 5000 }],
        lastEvidence: ''
      }
    ];
    localStorage.setItem('habitarc_arc_chats:' + uid, JSON.stringify(chats));
    localStorage.setItem('habitarc_arc_active_chat:' + uid, 'chat_seed_1');
  })()`);
  await go(`${base}/Arc_AI.html`);
  const reloadedChat = await ev(`(() => {
    window.dispatchEvent(new CustomEvent('habitarc:ai-level-up', { detail: { fromLevel: 1, toLevel: 2, prog: HabitArc.getAiProgression() } }));
    const sc = document.getElementById('arc-scroll-area');
    if (sc) sc.scrollTop = sc.scrollHeight;
    const hdrBtn = document.getElementById('arc-thread-history-btn')?.getBoundingClientRect();
    const newBtn = document.getElementById('ai-coach-clear')?.getBoundingClientRect();
    const topHdr = document.querySelector('header.md\\\\:hidden')?.getBoundingClientRect();
    return {
      inThread: !document.getElementById('arc-thread-view')?.classList.contains('hidden'),
      asked: document.getElementById('ai-coach-asked')?.textContent.trim(),
      threadLvl: document.getElementById('arc-thread-lvl-badge')?.textContent.trim(),
      respLvl: document.getElementById('ai-coach-resp-lvl')?.textContent.trim(),
      lvlUpShown: !document.getElementById('arc-lvlup-banner')?.classList.contains('hidden'),
      lvlUpText: document.getElementById('arc-lvlup-text')?.textContent.trim(),
      histCount: document.getElementById('arc-zen-hist-count')?.textContent.trim(),
      stickyThreadHistVisible: Boolean(hdrBtn && topHdr && hdrBtn.top >= topHdr.bottom - 2 && hdrBtn.bottom <= innerHeight - 80),
      stickyNewVisible: Boolean(newBtn && topHdr && newBtn.top >= topHdr.bottom - 2),
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  })()`);
  await saveShot('arc-ai-thread-clean-390.png');
  assert.equal(reloadedChat.inThread, true, 'Active conversation restores automatically on page reload');
  assert.equal(reloadedChat.asked, 'Delete Stretch habit and add review task');
  assert.equal(reloadedChat.threadLvl, 'LVL 2');
  assert.equal(reloadedChat.respLvl, 'LVL 2');
  assert.equal(reloadedChat.lvlUpShown, true);
  assert.match(reloadedChat.lvlUpText, /LEVEL UP! NOVA LVL 1 → LVL 2/);
  assert.equal(reloadedChat.histCount, '2');
  assert.equal(reloadedChat.stickyThreadHistVisible, true, 'History button stays sticky visible while scrolled in a multi-turn thread');
  assert.equal(reloadedChat.stickyNewVisible, true, '+ NEW stays sticky visible while scrolled in thread');
  assert.equal(reloadedChat.overflow, false, 'Clean active thread fits 390px without overflow');

  const histDrawer = await ev(`(() => {
    document.getElementById('arc-thread-history-btn')?.click();
    const dlg = document.getElementById('arc-history-dialog');
    return {
      isOpen: Boolean(dlg?.hasAttribute('open')),
      groups: [...document.querySelectorAll('#arc-hist-list .ha-ai-hist-group-lbl')].map(el => el.textContent.trim()),
      items: document.querySelectorAll('#arc-hist-list .ha-ai-hist-item').length,
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  })()`);
  await saveShot('arc-ai-history-drawer-390.png');
  assert.equal(histDrawer.isOpen, true, 'History button opens ChatGPT-style drawer');
  assert.deepEqual(histDrawer.groups, ['Today', 'Yesterday']);
  assert.equal(histDrawer.items, 2);
  assert.equal(histDrawer.overflow, false, 'Chat history drawer fits 390px without overflow');

  const afterSwitchAndNew = await ev(`(() => {
    document.querySelector('#arc-hist-list [data-chat-open="chat_seed_2"]')?.click();
    const switchedAsked = document.getElementById('ai-coach-asked')?.textContent.trim();
    document.getElementById('ai-coach-clear')?.click();
    return {
      switchedAsked,
      backOnZen: !document.getElementById('arc-zen-home')?.classList.contains('hidden'),
      histCountAfterNew: document.getElementById('arc-zen-hist-count')?.textContent.trim()
    };
  })()`);
  assert.equal(afterSwitchAndNew.switchedAsked, 'Morning water habit check-in');
  assert.equal(afterSwitchAndNew.backOnZen, true, '+ NEW returns cleanly to Zen Home');
  assert.equal(afterSwitchAndNew.histCountAfterNew, '2', '+ NEW keeps all archived chats in History');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 560, deviceScaleFactor: 2, mobile: true });
  const zenScrollSticky = await ev(`(() => {
    window.scrollTo(0, 240);
    const zenHist = document.getElementById('arc-zen-history-btn')?.getBoundingClientRect();
    const topHdr = document.querySelector('header.md\\\\:hidden')?.getBoundingClientRect();
    const bar = document.querySelector('.ha-arc-zen-bar')?.getBoundingClientRect();
    return {
      scrolledY: Math.round(window.scrollY),
      stickyVisible: Boolean(zenHist && topHdr && zenHist.top >= topHdr.bottom - 2 && zenHist.bottom <= innerHeight - 80),
      barGapOk: Boolean(bar && topHdr && bar.top >= topHdr.bottom - 3)
    };
  })()`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ev(`window.scrollTo(0, 0)`);
  assert.ok(zenScrollSticky.scrolledY > 0, 'Short mobile Zen Home can scroll');
  assert.equal(zenScrollSticky.stickyVisible, true, 'Chats history button stays sticky visible when scrolling down Zen Home');
  assert.equal(zenScrollSticky.barGapOk, true, 'Sticky Zen control bar does not collide with mobile header');

  const hubDrawer = await ev(`(() => {
    document.getElementById('arc-open-hub-btn')?.click();
    const dlg = document.getElementById('arc-hub-dialog');
    const visibleQuests = [...document.querySelectorAll('#arc-hub-dialog .ha-arc-quest-row:not(.hidden) .ha-arc-q-lbl')];
    const anyEllipsis = visibleQuests.some(el => el.textContent.includes('...') || el.scrollWidth > el.clientWidth + 2);
    return {
      isOpen: Boolean(dlg?.hasAttribute('open')),
      questCount: visibleQuests.length,
      anyEllipsis,
      toneLock: document.getElementById('arc-tone-lock')?.textContent.trim(),
      overflow: document.documentElement.scrollWidth > innerWidth
    };
  })()`);
  await saveShot('arc-ai-hub-drawer-390.png');
  assert.equal(hubDrawer.isOpen, true, 'Clicking Zen pill opens #arc-hub-dialog');
  assert.equal(hubDrawer.questCount, 3, 'Quest hub dialog shows all 3 quests');
  assert.equal(hubDrawer.anyEllipsis, false, 'Quest labels inside hub drawer render untruncated');
  assert.equal(hubDrawer.toneLock, 'LOCKED · LVL 4');
  assert.equal(hubDrawer.overflow, false, 'Quest hub drawer fits 390px without horizontal overflow');

  // 6) Switching from another tab to ARC AI renders active chat in-place with zero Zen Home flash
  await ev(`(() => {
    const uid = HabitArc.getAuthUser?.()?.uid || localStorage.getItem('habitarc_active_uid') || 'local';
    localStorage.setItem('habitarc_arc_active_chat:' + uid, 'chat_seed_1');
  })()`);
  await go(`${base}/Dashboard.html`);
  await ev(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__haSpaDocMarker = 'same-doc';
    window.__haZenFlashSeen = false;
    const dockBefore = document.querySelector('nav.ha-bottom-nav')?.getBoundingClientRect();
    window.__haDockBefore = dockBefore ? { top: Math.round(dockBefore.top), height: Math.round(dockBefore.height) } : null;
    window.__haObs = new MutationObserver(() => {
      const z = document.getElementById('arc-zen-home');
      if (z && getComputedStyle(z).display !== 'none' && !document.documentElement.classList.contains('ha-arc-restoring-thread')) {
        window.__haZenFlashSeen = true;
      }
    });
    window.__haObs.observe(document.body, { childList: true, subtree: true, attributes: true });
    document.getElementById('ha-arc-fab')?.click();
    window.__haSheetOpened = Boolean(document.getElementById('ha-arc-sheet')?.hasAttribute('open'));
    window.__haInputFocusedOnOpen = document.activeElement?.id === 'ha-arc-sheet-input';
    await wait(260);
    const comp1 = document.querySelector('.ha-arc-sheet-composer-wrap')?.getBoundingClientRect();
    window.__haCompVisible1 = Boolean(comp1 && comp1.height >= 44 && comp1.top >= 0 && comp1.bottom <= window.innerHeight + 1);
    // Verify in-sheet Saved Chats & Quests/Tones drawers open right inside #ha-arc-sheet WITHOUT navigating away!
    document.getElementById('ha-arc-sheet-history-btn')?.click();
    window.__haInSheetHistOpen = !document.getElementById('ha-arc-sheet-hist-drawer')?.hidden
      && location.pathname.endsWith('Dashboard.html')
      && document.querySelectorAll('#ha-sheet-hist-list .ha-sheet-hist-item').length === 2;
    document.querySelector('#ha-sheet-hist-list [data-sheet-chat-open="chat_seed_1"]')?.click();
    window.__haInSheetThreadLoaded = !document.getElementById('ha-arc-sheet-body')?.hidden
      && document.getElementById('ha-arc-sheet-body')?.textContent.includes('Delete Stretch habit and add review task');
    document.querySelector('[data-open-sheet-hub]')?.click();
    window.__haInSheetHubOpen = !document.getElementById('ha-arc-sheet-hub-drawer')?.hidden
      && document.querySelectorAll('#ha-arc-sheet-hub-drawer .ha-sheet-quest-row').length === 3;
    document.getElementById('ha-sheet-hub-close')?.click();
    document.getElementById('ha-arc-sheet-new')?.click();
    // Re-seed active chat id for step 6 SPA check below, then test close + reopen
    const uid = HabitArc.getAuthUser?.()?.uid || localStorage.getItem('habitarc_active_uid') || 'local';
    localStorage.setItem('habitarc_arc_active_chat:' + uid, 'chat_seed_1');
    const arcInput = document.getElementById('ha-arc-sheet-input');
    arcInput?.focus();
    arcInput?.blur();
    document.getElementById('ha-arc-sheet-close')?.click();
    await wait(60);
    document.getElementById('ha-arc-fab')?.click();
    window.__haSheetReopened = Boolean(document.getElementById('ha-arc-sheet')?.hasAttribute('open'));
    window.__haInputFocusedOnReopen = document.activeElement?.id === 'ha-arc-sheet-input';
    await wait(260);
    const comp2 = document.querySelector('.ha-arc-sheet-composer-wrap')?.getBoundingClientRect();
    const inp2 = document.getElementById('ha-arc-sheet-input')?.getBoundingClientRect();
    window.__haCompVisible2 = Boolean(
      comp2 && inp2 &&
      comp2.height >= 44 &&
      inp2.height >= 30 &&
      comp2.top >= 0 &&
      comp2.bottom <= window.innerHeight + 1 &&
      getComputedStyle(document.querySelector('.ha-arc-sheet-composer-wrap')).display !== 'none'
    );
    document.getElementById('ha-arc-sheet-close')?.click();
    document.querySelector('header a[href="Arc_AI.html"]')?.click();
  })()`);
  await sleep(350);
  const spaSwitch = await ev(`(() => {
    try { window.__haObs?.disconnect?.(); } catch {}
    const dockAfter = document.querySelector('nav.ha-bottom-nav')?.getBoundingClientRect();
    const compAfter = document.getElementById('arc-composer-wrap')?.getBoundingClientRect();
    document.getElementById('arc-thread-history-btn')?.click();
    const histOpened = Boolean(document.getElementById('arc-history-dialog')?.hasAttribute('open'));
    document.getElementById('arc-hist-close-btn')?.click();
    document.getElementById('arc-thread-lvl-badge')?.click();
    const hubOpened = Boolean(document.getElementById('arc-hub-dialog')?.hasAttribute('open'));
    document.getElementById('arc-hub-close')?.click();
    return {
      path: location.pathname.split('/').pop(),
      sameDoc: window.__haSpaDocMarker === 'same-doc',
      sheetOpened: Boolean(window.__haSheetOpened),
      sheetReopened: Boolean(window.__haSheetReopened),
      inputFocusedOnOpen: Boolean(window.__haInputFocusedOnOpen),
      inputFocusedOnReopen: Boolean(window.__haInputFocusedOnReopen),
      compVisible1: Boolean(window.__haCompVisible1),
      compVisible2: Boolean(window.__haCompVisible2),
      inSheetHistOpen: Boolean(window.__haInSheetHistOpen),
      inSheetThreadLoaded: Boolean(window.__haInSheetThreadLoaded),
      inSheetHubOpen: Boolean(window.__haInSheetHubOpen),
      fabHiddenOnArc: Boolean(document.getElementById('ha-arc-fab')?.hidden),
      zenFlashSeen: Boolean(window.__haZenFlashSeen),
      dockStable: Boolean(window.__haDockBefore && dockAfter && Math.abs(window.__haDockBefore.top - dockAfter.top) <= 1.5 && Math.abs(window.__haDockBefore.height - dockAfter.height) <= 1.5),
      compClearOfDock: Boolean(compAfter && dockAfter && compAfter.bottom <= dockAfter.top - 2),
      zenHidden: Boolean(document.getElementById('arc-zen-home')?.classList.contains('hidden')),
      threadVisible: !document.getElementById('arc-thread-view')?.classList.contains('hidden'),
      bodyActive: document.body.classList.contains('is-arc-thread-active'),
      restoringCleared: !document.documentElement.classList.contains('ha-arc-restoring-thread'),
      asked: document.getElementById('ai-coach-asked')?.textContent.trim(),
      histOpened,
      hubOpened
    };
  })()`);
  assert.equal(spaSwitch.sheetOpened, true, 'Floating Ask ARC pill opens contextual slide-up ARC sheet');
  assert.equal(spaSwitch.inputFocusedOnOpen, false, 'Opening Ask ARC does NOT auto-focus input or pop phone keyboard');
  assert.equal(spaSwitch.compVisible1, true, 'Ask ARC prompt composer bar is 100% visible inside viewport on first open');
  assert.equal(spaSwitch.inSheetHistOpen, true, 'History icon opens Saved Chats drawer right inside Ask ARC without leaving page');
  assert.equal(spaSwitch.inSheetThreadLoaded, true, 'Selecting a saved chat loads conversation directly inside Ask ARC');
  assert.equal(spaSwitch.inSheetHubOpen, true, 'LVL badge opens Quests, Powers & AI Tones drawer directly inside Ask ARC');
  assert.equal(spaSwitch.sheetReopened, true, 'Ask ARC sheet reopens cleanly after keyboard dismiss & close');
  assert.equal(spaSwitch.inputFocusedOnReopen, false, 'Reopening Ask ARC does NOT auto-focus input');
  assert.equal(spaSwitch.compVisible2, true, 'Ask ARC prompt composer bar stays 100% visible inside viewport on reopen');
  assert.equal(spaSwitch.path, 'Arc_AI.html', 'ARC sheet History link SPA-navigated to Arc_AI.html');
  assert.equal(spaSwitch.fabHiddenOnArc, true, 'Floating Ask ARC pill hides automatically on full Arc_AI.html');
  assert.equal(spaSwitch.sameDoc, true, 'Dashboard -> ARC AI tab switch runs in-place without triggering a full-page fallback reload');
  assert.equal(spaSwitch.zenFlashSeen, false, 'Switching to ARC AI never flashes Zen Home before showing active thread');
  assert.equal(spaSwitch.dockStable, true, 'Mobile bottom dock keeps uniform size and position on Dashboard -> ARC AI switch');
  assert.equal(spaSwitch.compClearOfDock, true, 'Composer clears mobile bottom dock cleanly after SPA tab switch');
  assert.equal(spaSwitch.zenHidden, true);
  assert.equal(spaSwitch.threadVisible, true);
  assert.equal(spaSwitch.bodyActive, true);
  assert.equal(spaSwitch.restoringCleared, true);
  assert.equal(spaSwitch.asked, 'Delete Stretch habit and add review task');
  assert.equal(spaSwitch.histOpened, true, 'History drawer works cleanly after SPA navigation to Arc_AI.html');
  assert.equal(spaSwitch.hubOpened, true, 'Quest hub drawer works cleanly after SPA navigation to Arc_AI.html');

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
