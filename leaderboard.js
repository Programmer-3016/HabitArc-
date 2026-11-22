import { CHESTS, changeTreasure, clearedDays, inventory, leagueRunner } from './runner-treasures.js';
import {
  chestArt,
  createRevealStage,
  getTreasureSoundEnabled,
  playChestEquipChime,
  playChestRevealAudio,
  setTreasureSoundEnabled,
  wakeCardChestAnimations,
} from './treasure-art.js';
// Public preview roster only. Never fetch or compare private habit documents here.
export const COMPANION_META = Object.freeze({
  arcy: { label: 'Arcy', role: 'Classic Spark' },
  ninja: { label: 'Shinobi', role: 'Red Scarf Ninja' },
  specops: { label: 'Ghost Ops', role: 'NVG Tactical' },
  astro: { label: 'Astro Nova', role: 'Rocket Pilot' },
});

const runners = [
  { name: 'mintfox', hero: 'arcy', weekly: 410, allTime: 3320, streak: 19, consistency: 96, weeklyDelta: 0, allTimeDelta: 0 },
  { name: 'zenpanda', hero: 'ninja', weekly: 385, allTime: 2480, streak: 16, consistency: 94, weeklyDelta: 1, allTimeDelta: 1 },
  { name: 'nightowl_k', hero: 'astro', weekly: 372, allTime: 2790, streak: 14, consistency: 91, weeklyDelta: 2, allTimeDelta: 0 },
  { name: 'Sarthak', hero: 'specops', weekly: 350, allTime: 1580, streak: 12, consistency: 89, weeklyDelta: 1, allTimeDelta: 2 },
  { name: 'riya.runs', hero: 'astro', weekly: 340, allTime: 1650, streak: 11, consistency: 86, weeklyDelta: -2, allTimeDelta: -1 },
  { name: 'codekarma', hero: 'ninja', weekly: 318, allTime: 1420, streak: 9, consistency: 82, weeklyDelta: 0, allTimeDelta: 0 },
  { name: 'aarav_09', hero: 'arcy', weekly: 296, allTime: 910, streak: 7, consistency: 79, weeklyDelta: 1, allTimeDelta: 1 },
  { name: 'lofi.lena', hero: 'specops', weekly: 262, allTime: 1180, streak: 6, consistency: 74, weeklyDelta: -1, allTimeDelta: -1 },
];

export function tierForPoints(points, period = 'weekly') {
  if (period === 'allTime') {
    if (points >= 3000) return 'Apex Arc';
    if (points >= 2200) return 'Gold Arc';
    if (points >= 1400) return 'Silver Arc';
    return 'Bronze Arc';
  }
  if (points >= 400) return 'Apex Arc';
  if (points >= 360) return 'Gold Arc';
  if (points >= 310) return 'Silver Arc';
  return 'Bronze Arc';
}

export function standings(period) {
  const isAllTime = period === 'allTime';
  return runners
    .map(r => ({
      name: r.name,
      hero: r.hero,
      points: isAllTime ? r.allTime : r.weekly,
      weeklyPoints: r.weekly,
      allTimePoints: r.allTime,
      streak: r.streak,
      consistency: r.consistency,
      delta: isAllTime ? r.allTimeDelta : r.weeklyDelta,
      self: r.name === 'Sarthak',
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .map((r, i) => ({
      ...r,
      rank: i + 1,
      tier: tierForPoints(r.points, isAllTime ? 'allTime' : 'weekly'),
    }));
}

const format = new Intl.NumberFormat('en');

function el(tag, cls, txt) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (txt !== undefined) node.textContent = txt;
  return node;
}

function sprite(hero, pose) {
  const img = el('img');
  img.alt = '';
  const frames = window.HabitArcSprites?.[hero];
  const src = (frames?.[pose] || frames?.run0)?.src;
  if (src) img.src = src;
  return img;
}

function deltaLabel(delta) {
  if (delta > 0) return `▲ +${delta}`;
  if (delta < 0) return `▼ ${Math.abs(delta)}`;
  return '• 0';
}

const mounted = new WeakSet();

export async function mountLeaderboard(root) {
  if (!root.isConnected || mounted.has(root)) return;
  if (!window.HabitArcSprites) await import('./companion-sprites.js');
  if (!root.isConnected || mounted.has(root)) return;
  mounted.add(root);

  const find = id => root.querySelector('#' + id);
  const periodButtons = root.querySelectorAll('[data-period]');
  let activePeriod = 'weekly';

  function buildRoster(period) {
    const base = standings(period);
    const store = window.HabitArc;
    if (store?.isOnboardingComplete?.()) base.find(r => r.self).hero = leagueRunner(store.getSettings());
    return base;
  }

  function draw(period, announce) {
    activePeriod = period;
    const list = buildRoster(period);
    const mine = list.find(r => r.self);
    const gap = mine.rank === 1 ? 0 : list[mine.rank - 2].points - mine.points;

    const slot = r => {
      const lane = el('div', 'lb-lane');
      lane.dataset.rank = String(r.rank);
      const step = el('div', 'lb-plinth');
      step.append(el('b', null, String(r.rank).padStart(2, '0')), el('strong', null, r.name));
      lane.append(sprite(r.hero, 'cheer'), step);
      return lane;
    };
    find('podium').replaceChildren(...[list[1], list[0], list[2]].map(slot));

    find('entries').replaceChildren(...list.map(r => {
      const tr = el('tr');
      const nameCell = el('td');
      const wrap = el('div', 'lb-runner');
      const avatar = el('span', 'lb-pic');
      avatar.append(sprite(r.hero, 'run0'));
      wrap.append(avatar, el('span', null, r.name));
      if (r.self) {
        tr.className = 'lb-mine';
        tr.tabIndex = -1;
        wrap.append(el('small', 'lb-you', 'You'));
      }
      nameCell.append(wrap);
      tr.append(
        el('td', 'lb-rank', String(r.rank).padStart(2, '0')),
        nameCell,
        el('td', 'lb-pts', format.format(r.points))
      );
      return tr;
    }));

    find('self-rank').textContent = '#' + mine.rank;
    find('self-gap').textContent = gap
      ? `${format.format(mine.points)} pts · ${format.format(gap)} pts behind #${mine.rank - 1}`
      : 'Leading the league';
    find('roster').textContent = `${list.length} demo runners`;
    periodButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.period === period)));
    if (announce) {
      find('announcement').textContent = `${period === 'weekly' ? 'Weekly' : 'All-time'} standings. Your demo rank is ${mine.rank} of ${list.length}.`;
    }
  }

  periodButtons.forEach(b => b.addEventListener('click', () => draw(b.dataset.period, true)));
  find('find-me')?.addEventListener('click', () => {
    const row = root.querySelector('.lb-mine');
    if (!row) return;
    row.focus({ preventScroll: true });
    row.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  });

  draw('weekly', false);
  if (find('treasures')) mountTreasureRoom(root, find, () => draw(activePeriod, false));
}


function mountTreasureRoom(root, find, redrawLeague) {
  let active = false, lastRenderKey = '';
  let showing = null;
  const statsRow = root.querySelector('.lb-vault-stats');
  if (statsRow && !statsRow.querySelector('#treasure-sound-toggle')) {
    const soundBtn = el('button', 'lb-vault-stat lb-sound-toggle');
    soundBtn.type = 'button';
    soundBtn.id = 'treasure-sound-toggle';
    const syncSoundBtn = () => {
      const on = getTreasureSoundEnabled();
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.textContent = on ? '8-bit SFX: On' : '8-bit SFX: Off';
      soundBtn.setAttribute('aria-label', on ? 'Mute chest sound effects' : 'Enable chest sound effects');
    };
    syncSoundBtn();
    soundBtn.addEventListener('click', () => {
      const next = !getTreasureSoundEnabled();
      setTreasureSoundEnabled(next);
      syncSoundBtn();
      if (next) playChestEquipChime();
    });
    statsRow.append(soundBtn);
  }
  // Keep the dialog inside the route root for SPA teardown. showModal() puts
  // it in the browser's top layer, above the header and bottom navigation.
  function reveal(chest, sample, trigger) {
    if (showing) return;
    const {scope, ready, hero} = read();
    const dialog = el('dialog', 'lb-reveal');
    dialog.tabIndex = -1;
    dialog.dataset.tier = chest.id;
    dialog.dataset.phase = 'sealed';
    dialog.setAttribute('aria-label', chest.name + (sample ? ' preview' : ' reward') + '. Click anywhere to open.');
    const stageCtrl = createRevealStage(chest, false);
    const art = stageCtrl.stage;
    const kicker = el('div', 'lb-reveal-kicker');
    const stateLabel = el('span', 'lb-reveal-badge', sample ? 'Opening preview' : 'Treasure unlocked');
    const headline = el('strong', 'lb-reveal-chest-name', chest.name);
    kicker.append(stateLabel, headline);
    const title = el('h2', 'lb-reveal-title', chest.power);
    const detail = el('p', 'lb-reveal-detail', sample ? 'Preview only · No XP awarded' : '+' + chest.xp + ' XP · Power equipped');
    const done = el('button', 'lb-reveal-done', 'Back to treasures');
    done.type = 'button';
    const copy = el('div', 'lb-reveal-copy');
    copy.append(title, detail);
    copy.hidden = done.hidden = true;
    const slot = el('div', 'lb-reveal-slot');
    slot.append(copy, done);
    const announce = el('div', 'lb-sr'); announce.setAttribute('role', 'status');
    dialog.append(art, kicker, slot, announce);
    showing = { dialog, scope, ready };
    const docEl = document.documentElement;
    const themeMeta = document.querySelector?.('meta[name="theme-color"]');
    const prevThemeColor = themeMeta?.getAttribute('content');
    docEl?.classList?.add('lb-reveal-active');
    themeMeta?.setAttribute('content', '#0a090e');
    let finishTimer, typeTimer, stopSound = () => {};
    function typeHeadline(targetText) {
      clearInterval(typeTimer);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        headline.textContent = targetText;
        return;
      }
      let idx = 1;
      headline.textContent = targetText.slice(0, idx);
      typeTimer = setInterval(() => {
        idx += 1;
        headline.textContent = targetText.slice(0, idx);
        if (idx >= targetText.length) clearInterval(typeTimer);
      }, 34);
    }
    function finish() {
      if (!dialog.open || dialog.dataset.phase !== 'opening') return;
      clearTimeout(finishTimer);
      dialog.dataset.phase = 'revealed';
      if (!sample) stateLabel.textContent = 'Reward unlocked';
      copy.hidden = done.hidden = false;
      announce.textContent = chest.power + '. ' + detail.textContent;
      if (document.activeElement === dialog) done.focus({ preventScroll: true });
    }
    function triggerOpen() {
      if (!dialog.open || dialog.dataset.phase !== 'sealed') return;
      if (!sample && !applyTreasure(chest, 'open', scope, hero)) {
        dialog.close();
        render();
        find('announcement').textContent = 'Your collection changed. Check the chest and try again.';
        return;
      }
      dialog.dataset.phase = 'opening';
      dialog.focus({ preventScroll: true });
      typeHeadline(sample ? 'Preview Item' : 'New Item');
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      stopSound();
      stopSound = playChestRevealAudio(chest.id, { reducedMotion: reduced });
      stageCtrl.play({ reducedMotion: reduced, onClimax: finish });
      if (!reduced) finishTimer = setTimeout(finish, 1900);
    }
    dialog.addEventListener('click', () => {
      if (dialog.dataset.phase === 'sealed') triggerOpen();
    });
    dialog.addEventListener('keydown', event => {
      if (dialog.dataset.phase === 'sealed' && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        triggerOpen();
      }
    });
    dialog.addEventListener('close', () => {
      stopSound();
      stageCtrl.stop();
      clearTimeout(finishTimer);
      clearInterval(typeTimer);
      docEl?.classList?.remove('lb-reveal-active');
      if (themeMeta && prevThemeColor !== null && prevThemeColor !== undefined) {
        themeMeta.setAttribute('content', prevThemeColor);
      }
      if (showing?.dialog === dialog) showing = null;
      dialog.remove();
      if (!root.isConnected || !active) return;
      const card = find('treasure-cards').querySelector('[data-tier="' + chest.id + '"]');
      const fallback = card?.querySelector('[data-chest]:enabled, .lb-chest-preview') || card;
      if (fallback === card && card) card.tabIndex = -1;
      (trigger?.isConnected && !trigger.disabled ? trigger : fallback)?.focus({preventScroll:true});
    }, {once:true});
    done.addEventListener('click', event => {
      event.stopPropagation();
      dialog.close();
    });
    root.append(dialog);
    dialog.showModal();
    dialog.focus({ preventScroll: true });
  }
  function applyTreasure(chest, action, scope, hero) {
    const current = read();
    if (!current.writable || current.scope !== scope || current.hero !== hero) return false;
    const updated = changeTreasure(current.settings.treasureRoom, chest.id, action, current.count, hero);
    if (!updated) return false;
    store().updateSettings({ treasureRoom: updated, leagueCompanion: hero });
    render();
    return true;
  }
  const store = () => window.HabitArc;
  function read() {
    const app = store();
    const sync = app?.getCloudSyncStatus?.();
    const scope = sync?.userId || 'local';
    const accountMatches = (!sync?.signedIn && !sync?.userId) || (sync?.signedIn && scope === app.getAuthUser()?.uid);
    const ready = Boolean(accountMatches && app?.isOnboardingComplete?.());
    // Allow local unlocks/equips even while cloud sync is reconnecting; app.js queues writes cleanly.
    const writable = ready;
    const settings = ready ? app.getSettings() : {};
    const count = ready ? clearedDays(app.getHabits(), app.getCompletionHistory(), app.today()).length : 0;
    return { ready, writable, scope, settings, count, bag: inventory(settings.treasureRoom), hero: leagueRunner(settings) };
  }
  function render() {
    const { ready, writable, scope, count, bag, hero } = read();
    if (showing && (scope !== showing.scope || (showing.ready && !ready))) showing.dialog.close();
    const key = JSON.stringify([ready, writable, scope, count, bag, hero]);
    if (key === lastRenderKey) return;
    lastRenderKey = key;
    const focusNode = root.contains(document.activeElement) && document.activeElement;
    const focused = focusNode?.dataset?.chest, focusedCard = focusNode?.dataset?.tier;

    const equippedChest = CHESTS.find(c => c.id === bag.equipped);
    find('treasure-avatar').dataset.power = bag.equipped || '';
    find('treasure-avatar').replaceChildren(sprite(hero, bag.equipped ? 'cheer' : 'run0'));
    find('treasure-runner').textContent = ready ? COMPANION_META[hero].label : 'Your companion';
    const maxXp = CHESTS.reduce((sum, c) => sum + c.xp, 0) || 500;
    const level = bag.opened.length + 1;
    const levelEl = find('treasure-level');
    if (levelEl) levelEl.textContent = level > CHESTS.length ? `LVL ${level} MAX` : `LVL ${level}`;
    const xpBarEl = find('treasure-xp-bar');
    if (xpBarEl) {
      xpBarEl.max = maxXp;
      xpBarEl.value = Math.min(maxXp, bag.xp);
    }
    find('treasure-xp').textContent = String(bag.xp);
    const clearsEl = find('treasure-clears');
    if (clearsEl) clearsEl.textContent = String(count);
    const openedCountEl = find('treasure-opened-count');
    if (openedCountEl) openedCountEl.textContent = `${bag.opened.length} / ${CHESTS.length}`;
    const powerLabelEl = find('treasure-power-label');
    if (powerLabelEl) {
      powerLabelEl.textContent = equippedChest ? `★ ${equippedChest.power} active` : 'No power equipped';
      powerLabelEl.dataset.equipped = bag.equipped || '';
    }

    const next = CHESTS.find(c => !bag.opened.includes(c.id));
    find('treasure-summary').textContent = !ready
      ? 'Finish onboarding to track clear days and unlock chests — tap any chest below to preview its animation.'
      : !next
        ? `Vault complete! All ${CHESTS.length} chests unlocked. Equip any runner power below.`
        : count >= next.days
          ? `${next.name} is unlocked and ready to open! Tap it to claim +${next.xp} XP.`
          : `${next.days - count} more clear ${next.days - count === 1 ? 'day' : 'days'} until ${next.name} unlocks.`;

function makeReplayIcon(opened) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (opened) {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M3 12a9 9 0 1 0 3-6.7L3 8');
    const arrow = document.createElementNS(ns, 'polyline');
    arrow.setAttribute('points', '3 3 3 8 8 8');
    svg.append(path, arrow);
  } else {
    svg.setAttribute('fill', 'currentColor');
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', '7 5 19 12 7 19 7 5');
    svg.append(poly);
  }
  return svg;
}

function makeLockIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.3');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const body = document.createElementNS(ns, 'rect');
  body.setAttribute('x', '4');
  body.setAttribute('y', '11');
  body.setAttribute('width', '16');
  body.setAttribute('height', '10');
  body.setAttribute('rx', '2');
  const shackle = document.createElementNS(ns, 'path');
  shackle.setAttribute('d', 'M8 11V7a4 4 0 0 1 8 0v4');
  svg.append(body, shackle);
  return svg;
}

    const shortNames = { wood: 'Wooden', iron: 'Iron', gold: 'Gold', ruby: 'Dragon' };
    const cards = CHESTS.map(c => {
      const opened = bag.opened.includes(c.id);
      const equipped = bag.equipped === c.id;
      const canOpen = writable && !opened && count >= c.days;
      const state = equipped ? 'equipped' : opened ? 'collected' : canOpen ? 'ready' : 'locked';
      const isLocked = state === 'locked';

      const card = el('article', 'lb-chest');
      card.dataset.tier = c.id;
      card.dataset.state = state;

      const media = el('div', 'lb-chest-media');
      const shownDays = Math.min(count, c.days);
      const stampText = equipped ? 'Active' : opened ? 'Opened' : canOpen ? 'Ready' : 'Locked';
      const stamp = el('span', 'lb-chest-stamp', stampText);

      const stageBtn = el('button', 'lb-chest-stage-btn');
      stageBtn.type = 'button';
      stageBtn.setAttribute(
        'aria-label',
        canOpen
          ? `Open ${c.name}`
          : opened
            ? `Replay ${c.name} opening`
            : `Preview ${c.name} opening`
      );
      stageBtn.append(chestArt(c, opened, { state }));
      stageBtn.addEventListener('click', () => reveal(c, !canOpen, stageBtn));

      const preview = el('button', 'lb-chest-preview');
      preview.type = 'button';
      const previewLabel = opened ? 'Replay opening' : 'Preview chest';
      preview.title = previewLabel;
      preview.setAttribute('aria-label', `${previewLabel}: ${c.name} (no XP awarded)`);
      preview.append(makeReplayIcon(opened));
      preview.addEventListener('click', () => reveal(c, true, preview));

      media.append(stageBtn, stamp, preview);

      const body = el('div', 'lb-chest-body');
      const heading = el('div', 'lb-chest-kicker');
      heading.append(el('h3', null, shortNames[c.id] || c.name));
      heading.append(el('span', 'lb-chest-days', opened ? `${c.days}d` : `${shownDays}/${c.days}d`));

      const daysLabel = c.days === 1 ? '1 clear day' : `${c.days} clear days`;
      const pct = Math.max(0, Math.min(100, Math.round((shownDays / Math.max(1, c.days)) * 100)));
      const daysLeft = Math.max(0, c.days - shownDays);
      const buttonLabel = equipped
        ? '✓ Active'
        : opened
          ? 'Equip power'
          : canOpen
            ? 'Open now'
            : `${daysLeft}d left`;

      const button = el('button', isLocked ? 'lb-chest-action lb-chest-action-locked' : 'lb-chest-action');
      button.type = 'button';
      button.dataset.chest = c.id;
      if (isLocked) {
        button.style.setProperty('--quest-fill', `${pct}%`);
        if (pct === 0) button.dataset.zero = 'true';
        const fill = el('span', 'lb-quest-fill');
        fill.setAttribute('aria-hidden', 'true');
        const labelWrap = el('span', 'lb-quest-label');
        labelWrap.append(makeLockIcon(), el('span', null, buttonLabel));
        button.append(fill, labelWrap);
      } else {
        button.textContent = buttonLabel;
      }
      button.disabled = equipped || (opened && !writable);
      button.setAttribute(
        'aria-label',
        isLocked
          ? `${c.name} (${c.description}): Locked, ${daysLeft} clear ${daysLeft === 1 ? 'day' : 'days'} left to unlock at ${daysLabel}. Tap to preview.`
          : `${c.name} (${c.description}): ${buttonLabel}`
      );
      button.addEventListener('click', () => {
        if (!opened) { reveal(c, !canOpen, button); return; }
        if (!applyTreasure(c, 'equip', scope, hero)) { render(); return; }
        playChestEquipChime();
        find('announcement').textContent = `Equipped ${c.power}.`;
        const currentCard = find('treasure-cards').querySelector('[data-tier="' + c.id + '"]');
        currentCard.tabIndex = -1;
        currentCard.focus({ preventScroll: true });
      });

      const powerLine = el('p', 'lb-power-name');
      powerLine.append(el('span', 'lb-power-kicker', 'Power: '), el('strong', null, c.power));

      body.append(
        heading,
        powerLine,
        button
      );

      card.append(media, body);
      return card;
    });

    find('treasure-cards').replaceChildren(...cards);
    wakeCardChestAnimations();
    if (focused) find('treasure-cards').querySelector('[data-chest="' + focused + '"]:not(:disabled)')?.focus({ preventScroll: true });
    if (focusedCard) {
      const card = find('treasure-cards').querySelector('[data-tier="' + focusedCard + '"]');
      if (card) { card.tabIndex = -1; card.focus({ preventScroll: true }); }
    }
  }
  function switchView(treasure) {
    active = treasure;
    if (!treasure && showing) showing.dialog.close();
    for (const id of ['league-view', 'league-footer', 'league-controls']) find(id).hidden = treasure;
    find('treasures').hidden = !treasure;
    find('show-treasures').setAttribute('aria-pressed', String(treasure));
    find('show-league').setAttribute('aria-pressed', String(!treasure));
    find('lb-scope').textContent = treasure ? 'Arc League · Your collection' : 'Arc League · Demo';
    find('lb-intro-text').textContent = treasure ? 'Earn powers for your companion by showing up for your own routine.' :
      'See how your runner stacks up against the league.';
    if (treasure) { render(); wakeCardChestAnimations(); } else redrawLeague();
  }
  find('show-treasures').addEventListener('click', () => switchView(true));
  find('show-league').addEventListener('click', () => switchView(false));
  let queued = false;
  const refresh = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!root.isConnected) return;
      if (active) render(); else redrawLeague();
    });
  };
  for (const name of ['habitarc:data-changed', 'habitarc:sync-status-changed', 'habitarc-auth-state-changed']) window.addEventListener(name, refresh);
  if (window.location.hash === '#treasures') switchView(true);
}
