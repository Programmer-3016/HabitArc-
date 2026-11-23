import { CHESTS, changeTreasure, clearedDays, inventory } from './runner-treasures.js';
import {
  chestArt,
  createRevealStage,
  getTreasureSoundEnabled,
  playChestRevealAudio,
  setTreasureSoundEnabled,
  wakeCardChestAnimations,
} from './treasure-art.js';
// Public preview roster only. Never fetch or compare private habit documents here.
const members = [
  { name: 'mintfox', tone: 0, weekly: 410, allTime: 3320, streak: 19, consistency: 96, weeklyDelta: 0, allTimeDelta: 0 },
  { name: 'zenpanda', tone: 1, weekly: 385, allTime: 2480, streak: 16, consistency: 94, weeklyDelta: 1, allTimeDelta: 1 },
  { name: 'nightowl_k', tone: 2, weekly: 372, allTime: 2790, streak: 14, consistency: 91, weeklyDelta: 2, allTimeDelta: 0 },
  { name: 'Sarthak', tone: 3, weekly: 350, allTime: 1580, streak: 12, consistency: 89, weeklyDelta: 1, allTimeDelta: 2 },
  { name: 'riya.runs', tone: 4, weekly: 340, allTime: 1650, streak: 11, consistency: 86, weeklyDelta: -2, allTimeDelta: -1 },
  { name: 'codekarma', tone: 5, weekly: 318, allTime: 1420, streak: 9, consistency: 82, weeklyDelta: 0, allTimeDelta: 0 },
  { name: 'aarav_09', tone: 6, weekly: 296, allTime: 910, streak: 7, consistency: 79, weeklyDelta: 1, allTimeDelta: 1 },
  { name: 'lofi.lena', tone: 7, weekly: 262, allTime: 1180, streak: 6, consistency: 74, weeklyDelta: -1, allTimeDelta: -1 },
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
  return members
    .map(r => ({
      name: r.name,
      tone: r.tone,
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

function memberInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/[._\-\s]+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const clean = (parts[0] || 'HA').replace(/[^a-zA-Z0-9]/g, '');
  return (clean.slice(0, 2) || 'HA').toUpperCase();
}

function avatarBadge(member, cls) {
  const badge = el('span', cls, memberInitials(member?.name));
  badge.dataset.tone = String((Number(member?.tone) || 0) % 8);
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

function deltaLabel(delta) {
  if (delta > 0) return `▲ +${delta}`;
  if (delta < 0) return `▼ ${Math.abs(delta)}`;
  return '• 0';
}

const mounted = new WeakSet();

export async function mountLeaderboard(root) {
  if (!root.isConnected || mounted.has(root)) return;
  mounted.add(root);

  const find = id => root.querySelector('#' + id);
  const periodButtons = root.querySelectorAll('[data-period]');
  let activePeriod = 'weekly';

  function buildRoster(period) {
    return standings(period);
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
      lane.append(avatarBadge(r, 'lb-podium-avatar'), step);
      return lane;
    };
    find('podium').replaceChildren(...[list[1], list[0], list[2]].map(slot));

    find('entries').replaceChildren(...list.map(r => {
      const tr = el('tr');
      const nameCell = el('td');
      const wrap = el('div', 'lb-runner');
      const avatar = avatarBadge(r, 'lb-pic');
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
    find('roster').textContent = `${list.length} demo members`;
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
  const soundBtn = find('treasure-sound-toggle');
  if (soundBtn) {
    const syncSoundBtn = () => {
      const on = getTreasureSoundEnabled();
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.title = on ? 'Chest sound on' : 'Chest sound muted';
      soundBtn.setAttribute('aria-label', on ? 'Mute chest sound effects' : 'Enable chest sound effects');
    };
    syncSoundBtn();
    soundBtn.addEventListener('click', () => {
      const next = !getTreasureSoundEnabled();
      setTreasureSoundEnabled(next);
      syncSoundBtn();
    });
  }
  // Keep the dialog inside the route root for SPA teardown. showModal() puts
  // it in the browser's top layer, above the header and bottom navigation.
  function reveal(chest, sample, trigger) {
    if (showing) return;
    const {scope, ready} = read();
    const dialog = el('dialog', 'lb-reveal');
    dialog.tabIndex = -1;
    dialog.dataset.tier = chest.id;
    dialog.dataset.phase = 'sealed';
    dialog.setAttribute('aria-label', chest.name + (sample ? ' preview' : ' reward') + '. Click anywhere to open.');
    const stageCtrl = createRevealStage(chest, false);
    const art = stageCtrl.stage;
    const kicker = el('div', 'lb-reveal-kicker');
    const stateLabel = el('span', 'lb-reveal-badge', sample ? 'Opening preview' : 'Chest unlocked');
    const headline = el('strong', 'lb-reveal-chest-name', chest.name);
    kicker.append(stateLabel, headline);
    const title = el('h2', 'lb-reveal-title', `${chest.days}-day milestone`);
    const detail = el('p', 'lb-reveal-detail', sample ? 'Preview only' : `+${chest.xp} XP · Milestone unlocked`);
    const done = el('button', 'lb-reveal-done', 'Back to chests');
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
      if (!sample) stateLabel.textContent = 'Unlocked';
      copy.hidden = done.hidden = false;
      announce.textContent = `${chest.name} ${detail.textContent}.`;
      if (document.activeElement === dialog) done.focus({ preventScroll: true });
    }
    function triggerOpen() {
      if (!dialog.open || dialog.dataset.phase !== 'sealed') return;
      if (!sample && !applyTreasure(chest, 'open', scope)) {
        dialog.close();
        render();
        find('announcement').textContent = 'Your collection changed. Check the chest and try again.';
        return;
      }
      dialog.dataset.phase = 'opening';
      dialog.focus({ preventScroll: true });
      typeHeadline(sample ? 'Preview chest' : 'Chest unlocked');
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
  function applyTreasure(chest, action, scope) {
    const current = read();
    if (!current.writable || current.scope !== scope) return false;
    const updated = changeTreasure(current.settings.treasureRoom, chest.id, action, current.count);
    if (!updated) return false;
    store().updateSettings({ treasureRoom: updated });
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
    return { ready, writable, scope, settings, count, bag: inventory(settings.treasureRoom) };
  }
  function render() {
    const { ready, writable, scope, count, bag } = read();
    if (showing && (scope !== showing.scope || (showing.ready && !ready))) showing.dialog.close();
    const key = JSON.stringify([ready, writable, scope, count, bag]);
    if (key === lastRenderKey) return;
    lastRenderKey = key;
    const focusNode = root.contains(document.activeElement) && document.activeElement;
    const focused = focusNode?.dataset?.chest, focusedCard = focusNode?.dataset?.tier;

    const clearsEl = find('treasure-clears');
    if (clearsEl) clearsEl.textContent = String(count);
    const openedCountEl = find('treasure-opened-count');
    if (openedCountEl) openedCountEl.textContent = `${bag.opened.length} / ${CHESTS.length}`;

    const summaryEl = find('treasure-summary');
    if (summaryEl) {
      const next = CHESTS.find(c => !bag.opened.includes(c.id));
      summaryEl.textContent = !ready
        ? 'Finish setup to track clear days and unlock milestone chests.'
        : !next
          ? `All ${CHESTS.length} milestone chests unlocked.`
          : count >= next.days
            ? `${next.name} is ready to open.`
            : `${next.days - count} more clear ${next.days - count === 1 ? 'day' : 'days'} until ${next.name}.`;
    }

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
      const canOpen = writable && !opened && count >= c.days;
      const state = opened ? 'collected' : canOpen ? 'ready' : 'locked';
      const isLocked = state === 'locked';

      const card = el('article', 'lb-chest');
      card.dataset.tier = c.id;
      card.dataset.state = state;

      const media = el('div', 'lb-chest-media');
      const shownDays = Math.min(count, c.days);
      const stampText = opened ? 'Opened' : canOpen ? 'Ready' : 'Locked';
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
      preview.setAttribute('aria-label', `${previewLabel}: ${c.name}`);
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
      const buttonLabel = opened
        ? '✓ Unlocked'
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
      button.disabled = opened;
      button.setAttribute(
        'aria-label',
        isLocked
          ? `${c.name}: Locked, ${daysLeft} clear ${daysLeft === 1 ? 'day' : 'days'} left to unlock at ${daysLabel}. Tap to preview.`
          : `${c.name}: ${buttonLabel}`
      );
      button.addEventListener('click', () => {
        if (!opened) reveal(c, !canOpen, button);
      });

      const milestoneLine = el(
        'p',
        'lb-power-name',
        `${c.days}-day milestone`
      );

      body.append(
        heading,
        milestoneLine,
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
    if (soundBtn) soundBtn.hidden = !treasure;
    find('show-treasures').setAttribute('aria-pressed', String(treasure));
    find('show-league').setAttribute('aria-pressed', String(!treasure));
    const scopeEl = find('lb-scope');
    if (scopeEl) scopeEl.hidden = treasure;
    const titleEl = find('lb-page-title');
    if (titleEl) titleEl.textContent = treasure ? 'Rewards' : 'Practice League';
    find('lb-intro-text').textContent = treasure
      ? 'Complete every scheduled habit on a day to count a clear day.'
      : 'Sample weekly and all-time standings for reference.';
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
  switchView(window.location.hash !== '#league');
}
