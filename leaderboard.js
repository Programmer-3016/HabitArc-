import { CHESTS, changeTreasure, clearedDays, inventory, leagueRunner } from './runner-treasures.js';
import {
  chestArt,
  createRevealStage,
  getTreasureSoundEnabled,
  playChestEquipChime,
  playChestRevealAudio,
  setTreasureSoundEnabled,
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
        ? `Vault complete! All ${CHESTS.length} chests unlocked. Equip any relic power below.`
        : count >= next.days
          ? `${next.name} is unlocked and ready to open! Tap it to claim +${next.xp} XP.`
          : `${next.days - count} more clear ${next.days - count === 1 ? 'day' : 'days'} until ${next.name} unlocks.`;

    const shortNames = { wood: 'Wooden', iron: 'Iron', gold: 'Gold', ruby: 'Dragon' };
    const questTags = { wood: 'LVL 1', iron: 'LVL 2', gold: 'LVL 3', ruby: 'BOSS' };
    const cards = CHESTS.map(c => {
      const opened = bag.opened.includes(c.id);
      const equipped = bag.equipped === c.id;
      const canOpen = writable && !opened && count >= c.days;
      const state = equipped ? 'equipped' : opened ? 'collected' : canOpen ? 'ready' : 'locked';

      const card = el('article', 'lb-chest');
      card.dataset.tier = c.id;
      card.dataset.state = state;

      const heading = el('div', 'lb-chest-kicker');
      heading.append(el('h3', null, shortNames[c.id] || c.name));
      const shownDays = Math.min(count, c.days);
      const stampText = equipped ? 'Active' : opened ? 'Opened' : canOpen ? 'Ready' : `${shownDays}/${c.days}d`;
      heading.append(el('span', 'lb-chest-stamp', stampText));

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
      const questChip = el('span', 'lb-quest-chip', questTags[c.id] || `${c.days}D`);
      questChip.setAttribute('aria-hidden', 'true');
      const lootChip = el('span', 'lb-loot-chip', `+${c.xp} XP`);
      lootChip.setAttribute('aria-hidden', 'true');
      stageBtn.append(chestArt(c, opened), questChip, lootChip);
      stageBtn.addEventListener('click', () => reveal(c, !canOpen, stageBtn));

      const progressWrap = el('div', 'lb-xp-bar');
      const progress = el('progress');
      progress.max = c.days;
      progress.value = opened ? c.days : shownDays;
      progress.setAttribute('aria-label', `${c.name} clear days`);
      progressWrap.append(progress);

      const daysLabel = c.days === 1 ? '1 clear day' : `${c.days} clear days`;
      const button = el(
        'button',
        'lb-chest-action',
        equipped
          ? '★ Equipped'
          : opened
            ? 'Equip relic'
            : canOpen
              ? 'Open chest'
              : `${c.days}d quest`
      );
      button.type = 'button';
      button.dataset.chest = c.id;
      button.disabled = !writable || equipped || (!opened && count < c.days);
      button.setAttribute('aria-label', `${c.name} (${c.description}): ${button.textContent}${!opened && count < c.days ? `, unlock at ${daysLabel}` : ''}`);
      button.addEventListener('click', () => {
        if (!opened) { reveal(c, false, button); return; }
        if (!applyTreasure(c, 'equip', scope, hero)) { render(); return; }
        playChestEquipChime();
        find('announcement').textContent = `Equipped ${c.power}.`;
        const currentCard = find('treasure-cards').querySelector('[data-tier="' + c.id + '"]');
        currentCard.tabIndex = -1;
        currentCard.focus({ preventScroll: true });
      });

      const preview = el('button', 'lb-chest-preview', opened ? 'Replay opening' : 'Preview chest');
      preview.type = 'button';
      preview.setAttribute('aria-label', `${preview.textContent}: ${c.name} (no XP awarded)`);
      preview.addEventListener('click', () => reveal(c, true, preview));

      const actions = el('div', 'lb-chest-actions');
      actions.append(button, preview);

      card.append(
        heading,
        stageBtn,
        el('strong', 'lb-power-name', `★ ${c.power}`),
        progressWrap,
        actions
      );
      return card;
    });

    find('treasure-cards').replaceChildren(...cards);
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
    if (treasure) render(); else redrawLeague();
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
