import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHEST_THEMES,
  REVEAL_CLIMAX_FRAME,
  REVEAL_FRAME_COUNT,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  TREASURE_SOUND_KEY,
  chestArt,
  computeStageDimensions,
  createRevealStage,
  getTreasureSoundEnabled,
  paintCardChestFrame,
  playChestEquipChime,
  playChestRevealAudio,
  renderChestPixels,
  renderRevealFrame,
  sealedIdlePose,
  setTreasureSoundEnabled,
} from '../treasure-art.js';
import { CHESTS } from '../runner-treasures.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function fakeNode(tag) {
  return {
    tag, children: [], attrs: {}, dataset: {}, className: '',
    setAttribute(name, value) { this.attrs[name] = String(value); },
    append(child) { this.children.push(child); return child; },
  };
}
function render(fn, id, opened = false) {
  const old = globalThis.document;
  globalThis.document = {
    createElement: fakeNode,
    createElementNS(_ns, name) { return fakeNode(name); },
  };
  try { return fn({ id }, opened); } finally { globalThis.document = old; }
}

test('All four chest tiers render unified 64x64 3/4 pixel sprites with tier-specific accents', () => {
  assert.deepEqual(CHESTS.map(c => c.id), ['wood', 'iron', 'gold', 'ruby']);
  const signatures = new Set();
  for (const id of ['wood', 'iron', 'gold', 'ruby']) {
    for (const opened of [false, true]) {
      const art = render(chestArt, id, opened);
      assert.equal(art.className, 'lb-chest-art');
      assert.equal(art.dataset.tier, id);
      assert.equal(art.dataset.open, String(opened));
      assert.equal(art.dataset.style, 'pixel-game');
      assert.equal(art.attrs['aria-hidden'], 'true');
      const canvas = art.children[0];
      assert.equal(canvas.tag, 'canvas');
      assert.equal(canvas.className, 'lb-chest-canvas');
      assert.equal(canvas.width, 64);
      assert.equal(canvas.height, 64);
    }

    const closed = renderChestPixels(id, 0);
    const open = renderChestPixels(id, 10);
    assert.equal(closed.length, 64 * 64);
    assert.equal(open.length, 64 * 64);
    const closedColors = new Set(closed.filter(Boolean));
    assert.ok(closedColors.size >= 14, id + ' palette depth: ' + closedColors.size);
    assert.notDeepEqual(closed, open, id + ' open sprite differs from closed sprite');
    signatures.add(closed.filter(Boolean).slice(0, 120).join(','));
  }
  assert.equal(signatures.size, 4, 'every tier has a distinct pixel palette/detail signature');

  // Iron sapphire rune inside padlock, Gold ruby-eyed skull clasp & Ruby horned dragon boss clasp
  const ironClosed = renderChestPixels('iron', 0);
  assert.ok(ironClosed.includes('#38bdf8'), 'iron chest has sapphire rune core');
  const goldClosed = renderChestPixels('gold', 0);
  assert.ok(goldClosed.includes('#ff4d6d'), 'gold boss chest has ruby skull eyes');
  const rubyClosed = renderChestPixels('ruby', 0);
  assert.ok(rubyClosed.includes('#47e393'), 'apex vault has glowing neon-mint reactor clasp');
  assert.ok(rubyClosed.some((_, idx) => (idx % 64) <= 7 && Boolean(rubyClosed[idx])), 'apex vault includes side handle silhouette');
});

test('56-frame 112x96 reveal stage keeps neutral dark background behind chest and distinct item backlights', () => {
  assert.equal(STAGE_WIDTH, 112);
  assert.equal(STAGE_HEIGHT, 96);
  assert.equal(REVEAL_FRAME_COUNT, 56);
  assert.ok(REVEAL_CLIMAX_FRAME >= 28 && REVEAL_CLIMAX_FRAME < 56);

  const stageCtrl = render(c => createRevealStage(c, false), 'gold');
  const stageWrap = stageCtrl.stage;
  stageCtrl.stop();
  assert.equal(stageWrap.dataset.style, 'pixel-reveal');
  assert.equal(stageWrap.children[0].className, 'lb-reveal-canvas');
  assert.equal(stageWrap.children[0].width, 112);
  assert.equal(stageWrap.children[0].height, 96);

  const cornerColors = new Set();
  for (const id of ['wood', 'iron', 'gold', 'ruby']) {
    const sealed = renderRevealFrame(id, 0);
    assert.equal(sealed.length, 112 * 96);
    // Neutral void corner pixels during closed chest phase
    assert.equal(sealed[0], '#0a090e', id + ' top-left starts neutral void');
    assert.equal(sealed[111], '#0a090e', id + ' top-right starts neutral void');

    const centerReveal = renderRevealFrame(id, 34);
    assert.equal(centerReveal.length, 112 * 96);
    cornerColors.add(centerReveal[0]);
    assert.ok(CHEST_THEMES[id].glowName.length > 4);
  }
  // Legendary god-rays reach frame corners; all 4 tiers stay distinct in reveal frame palette
  assert.notDeepEqual(renderRevealFrame('wood', 34), renderRevealFrame('iron', 34));
  assert.notDeepEqual(renderRevealFrame('iron', 34), renderRevealFrame('gold', 34));
  assert.notDeepEqual(renderRevealFrame('gold', 34), renderRevealFrame('ruby', 34));
  assert.ok(cornerColors.size >= 3);
});

test('Modal reveal uses fullscreen tap-anywhere UX without Tap to open button or close cross', () => {
  assert.equal(render(chestArt, 'wood', true).dataset.open, 'true');
  const dimsDesktop = computeStageDimensions(1366, 900);
  const dimsPhone = computeStageDimensions(390, 844);
  assert.ok(dimsDesktop.width >= 160 && dimsDesktop.height >= 110);
  assert.ok(dimsPhone.width >= 96 && dimsPhone.height >= 160);
  assert.equal(renderRevealFrame('gold', 34, dimsDesktop.width, dimsDesktop.height).length, dimsDesktop.width * dimsDesktop.height);

  const js = read('leaderboard.js');
  const css = read('leaderboard.css');
  assert.match(js, /createRevealStage\(chest, false\)/);
  assert.match(js, /stageCtrl\.play\(/);
  assert.match(js, /stageCtrl\.stop\(/);
  assert.match(js, /dialog\.addEventListener\('click'/);
  assert.match(js, /meta\[name="theme-color"\]/);
  assert.match(js, /lb-reveal-active/);
  assert.match(js, /changeTreasure\(/);
  assert.doesNotMatch(js, /lb-reveal-open|lb-reveal-close|Tap to open/);
  assert.match(css, /\.lb-reveal \.lb-reveal-stage\s*\{[^}]*position:\s*fixed;\s*inset:\s*0/);
  assert.match(css, /html\.lb-reveal-active/);

  // Sealed idle chest produces an upward jump + wiggle motion across its cycle
  const idlePoses = Array.from({ length: 12 }, (_, k) => sealedIdlePose(k * 95));
  assert.ok(idlePoses.some(p => p.jumpY < 0), 'idle chest jumps upward');
  assert.ok(idlePoses.some(p => p.shakeX !== 0), 'idle chest wiggles gently');

  // Opening timeline reacts immediately on tap and reaches climax ~1.43s
  const oldRaf = globalThis.requestAnimationFrame;
  const oldCancelRaf = globalThis.cancelAnimationFrame;
  const oldDoc = globalThis.document;
  let queuedTick = null;
  let paints = 0;
  globalThis.requestAnimationFrame = cb => { queuedTick = cb; return 1; };
  globalThis.cancelAnimationFrame = () => { queuedTick = null; };
  globalThis.document = {
    createElement(tag) {
      const n = fakeNode(tag);
      if (tag === 'canvas') {
        n.getContext = () => ({
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => { paints += 1; },
        });
      }
      return n;
    },
  };
  try {
    const ctrl = createRevealStage({ id: 'wood' }, false);
    const baseMs = performance.now();
    let climaxCount = 0;
    ctrl.play({ onClimax: () => { climaxCount += 1; } });
    assert.ok(paints >= 1 && queuedTick, 'paints immediate tap rattle without waiting');
    for (const dt of [60, 220, 560, 950, 1360, 1450]) {
      if (queuedTick) queuedTick(baseMs + dt);
    }
    assert.equal(climaxCount, 1, 'triggers climax promptly once after snappy open');
    ctrl.stop();
  } finally {
    globalThis.requestAnimationFrame = oldRaf;
    globalThis.cancelAnimationFrame = oldCancelRaf;
    globalThis.document = oldDoc;
  }
  const rewards = read('runner-treasures.js');
  assert.match(rewards, /days: 1, xp: 30/);
  assert.match(rewards, /days: 7, xp: 70/);
  assert.match(rewards, /days: 14, xp: 140/);
  assert.match(rewards, /days: 30, xp: 260/);
});

test('Both top tab groups remain operable at 320px and 480px', () => {
  const html = read('Leaderboard.html'), css = read('leaderboard.css');
  for (const id of ['show-league', 'show-treasures', 'league-controls']) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /data-period="weekly"/);
  assert.match(html, /data-period="allTime"/);
  assert.match(css, /\.lb-view-switch\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.lb-controls\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /@media \(max-width:480px\)/);
  assert.match(css, /@media \(max-width:359px\)/);
  assert.match(css, /\.lb-controls \.lb-filters\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.lb-view-switch button\s*\{[^}]*min-height:46px/);
  assert.match(html, /lb-mobile-topbar/);
  assert.match(html, /lb-desktop-topbar/);
  assert.match(css, /\.lb-desktop-topbar nav\s*\{[^}]*overflow-x:auto/);
  assert.match(css, /\.lb-mobile-topbar\s*\{[^}]*padding-inline:10px/);
});

test('Treasure scope, all-tier previews, and PWA refresh stay isolated', () => {
  const html = read('Leaderboard.html'), worker = read('sw.js'), css = read('leaderboard.css'), js = read('leaderboard.js');
  assert.equal((html.match(/class="ha-bottom-nav-link"/g) || []).length, 4);
  for (const asset of ['/Leaderboard.html', '/leaderboard.css', '/leaderboard.js', '/treasure-art.js']) {
    assert.ok(worker.includes("'" + asset + "'"), asset);
  }
  const rev = worker.match(/const CACHE_NAME = 'habitarc-shell-v(\d+)'/);
  assert.ok(Number(rev?.[1]) >= 40, 'PWA shell cache bumped to v40 or newer');
  for (const id of ['treasures', 'treasure-cards', 'treasure-sound-toggle', 'show-treasures', 'show-league']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.doesNotMatch(html, /Pixel loot|runner powers|Equip power|Relic room|lb-vault-head|lb-vault-stat/);
  assert.doesNotMatch(js, /opened \|\| c\.id === 'wood'/);
  assert.match(js, /lb-chest-stage-btn/);
  assert.match(js, /lb-chest-action-locked/);
  assert.match(js, /\? 'Open' :/);
  assert.doesNotMatch(js, /'Open now'|'✓ Unlocked'|'Opened'|'Ready'/);
  assert.match(js, /chestCycle\(/);
  assert.match(js, /reveal\(c, !canOpen, button\)/);
  assert.match(js, /playChestRevealAudio\(/);
  assert.match(js, /stopSound\(\)/);
  assert.match(html, /lb-sound-toggle/);
  assert.match(js, /treasure-sound-toggle/);
  assert.doesNotMatch(css, /\nbody\s*\{/);
  assert.doesNotMatch(css, /\ntable\s*\{/);
});

test('8-bit chest sound effects respect mute preference, play tier tracks, and clean up cleanly', () => {
  const oldWin = globalThis.window;
  const storage = new Map();
  let oscCount = 0;
  let disconnects = 0;
  class MockAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    createGain() {
      return {
        gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() { disconnects += 1; },
      };
    }
    createOscillator() {
      oscCount += 1;
      return {
        type: 'square',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
  }
  globalThis.window = {
    AudioContext: MockAudioContext,
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
  };
  try {
    assert.equal(getTreasureSoundEnabled(), true, 'sound defaults ON');
    const woodStop = playChestRevealAudio('wood');
    const woodOsc = oscCount;
    assert.ok(woodOsc >= 15, 'wood reveal schedules multi-stage 8-bit chiptune tones');
    woodStop();
    assert.equal(disconnects, 1, 'stop() disconnects audio master node cleanly');

    oscCount = 0;
    const reducedStop = playChestRevealAudio('gold', { reducedMotion: true });
    assert.ok(oscCount > 0 && oscCount < woodOsc, 'reduced motion skips buildup and plays climax fanfare only');
    reducedStop();

    oscCount = 0;
    playChestEquipChime();
    assert.equal(oscCount, 3, 'equip chime schedules 3 retro sparkle tones');

    setTreasureSoundEnabled(false);
    assert.equal(storage.get(TREASURE_SOUND_KEY), '0');
    assert.equal(getTreasureSoundEnabled(), false);

    oscCount = 0;
    const mutedStop = playChestRevealAudio('iron');
    playChestEquipChime();
    assert.equal(oscCount, 0, 'muted preference skips scheduling any audio nodes');
    mutedStop();
  } finally {
    globalThis.window = oldWin;
  }
});

test('Vault card chests animate crisply per state across ready, equipped, collected, and locked', () => {
  const frameFor = (tier, opened, state, elapsedMs) => {
    const g = new Array(64 * 64).fill(null);
    const surface = {
      is32: false, w: 64, h: 64, g,
      put(c, x, y) {
        const px = Math.round(x), py = Math.round(y);
        if (px >= 0 && px < 64 && py >= 0 && py < 64) g[py * 64 + px] = c;
      },
      rect(c, x, y, rw, rh) {
        const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + rw), y1 = Math.round(y + rh);
        for (let py = Math.max(0, y0); py < Math.min(64, y1); py++) {
          for (let px = Math.max(0, x0); px < Math.min(64, x1); px++) g[py * 64 + px] = c;
        }
      },
    };
    paintCardChestFrame(surface, tier, opened, state, elapsedMs);
    return g;
  };

  assert.notDeepEqual(frameFor('gold', false, 'ready', 0), frameFor('gold', false, 'ready', 620), 'ready chest hops and sparkles over time');
  assert.notDeepEqual(frameFor('iron', true, 'equipped', 0), frameFor('iron', true, 'equipped', 440), 'equipped open chest streams sparks and aura');
  assert.notDeepEqual(frameFor('wood', true, 'collected', 0), frameFor('wood', true, 'collected', 330), 'collected open chest streams rising sparks');
  assert.notDeepEqual(frameFor('ruby', false, 'locked', 0), frameFor('ruby', false, 'locked', 750), 'locked chest gently shimmers over time');
});
