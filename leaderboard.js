import { CHESTS, changeTreasure, clearedDays, inventory, leagueRunner } from './runner-treasures.js';
import { chestArt } from './treasure-art.js';
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
  let activeHeroFilter = 'all';
  let selectedName = null;
  let demoBoost = 0;

  function buildRoster(period) {
    const base = standings(period);
    const store = window.HabitArc;
    if (store?.isOnboardingComplete?.()) base.find(r => r.self).hero = leagueRunner(store.getSettings());
    if (!demoBoost) return base;
    const boosted = base.map(r => {
      if (!r.self) return r;
      const pts = r.points + demoBoost;
      return {
        ...r,
        points: pts,
        weeklyPoints: period === 'weekly' ? pts : r.weeklyPoints,
        allTimePoints: period === 'allTime' ? pts : r.allTimePoints,
        delta: r.delta + Math.max(1, Math.floor(demoBoost / 25)),
        tier: tierForPoints(pts, period),
      };
    });
    return boosted
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  function renderHeroFilters(list) {
    const wrap = find('companion-filters');
    if (!wrap) return;
    const items = [
      { id: 'all', label: `All (${list.length})` },
      ...Object.entries(COMPANION_META).map(([id, meta]) => ({
        id,
        label: `${meta.label} (${list.filter(r => r.hero === id).length})`,
      })),
    ];
    wrap.replaceChildren(...items.map(item => {
      const btn = el('button', 'lb-comp-pill', item.label);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(activeHeroFilter === item.id));
      btn.addEventListener('click', () => {
        activeHeroFilter = item.id;
        draw(activePeriod, false);
      });
      return btn;
    }));
  }

  function renderSpotlight(runner, mine) {
    const spot = find('runner-spotlight');
    if (!spot || !runner) return;
    const meta = COMPANION_META[runner.hero] || { label: runner.hero, role: 'Runner' };
    const head = el('div', 'lb-spot-head');
    const avatar = el('div', 'lb-spot-avatar');
    avatar.append(sprite(runner.hero, runner.rank === 1 ? 'cheer' : 'act'));

    const copy = el('div', 'lb-spot-copy');
    copy.append(el('p', 'lb-spot-kicker', `Selected runner · #${String(runner.rank).padStart(2, '0')}`));
    const nameRow = el('div', 'lb-spot-name-row');
    nameRow.append(el('h3', null, runner.name));
    if (runner.self) nameRow.append(el('small', 'lb-you', 'You'));
    nameRow.append(el('span', 'lb-tier-badge', runner.tier));
    copy.append(nameRow, el('p', 'lb-spot-sub', `${meta.label} · ${meta.role}`));
    head.append(avatar, copy);

    const stats = el('div', 'lb-spot-stats');
    const statItems = [
      ['Points', `${format.format(runner.points)} pts`],
      ['Streak', `${runner.streak}d`],
      ['30d Rate', `${runner.consistency}%`],
    ];
    for (const [k, v] of statItems) {
      const card = el('div', 'lb-spot-stat');
      card.append(el('span', null, k), el('strong', null, v));
      stats.append(card);
    }

    let compareText = `That's you! ${format.format(runner.points)} pts in ${activePeriod === 'weekly' ? 'this week\'s sprint' : 'all-time league'}.`;
    if (!runner.self) {
      const diff = runner.points - mine.points;
      if (diff > 0) compareText = `${runner.name} leads you by ${format.format(diff)} pts right now.`;
      else if (diff < 0) compareText = `You lead ${runner.name} by ${format.format(Math.abs(diff))} pts.`;
      else compareText = `Tied on points with ${runner.name}!`;
    }
    const h2h = el('p', 'lb-spot-h2h', compareText);
    spot.replaceChildren(head, stats, h2h);
  }

  function draw(period, announce) {
    activePeriod = period;
    const list = buildRoster(period);
    const mine = list.find(r => r.self);
    const ahead = mine.rank === 1 ? null : list[mine.rank - 2];
    const gap = ahead ? ahead.points - mine.points : 0;
    const topPoints = list[0]?.points || 1;
    const leadMargin = list.length > 1 ? list[0].points - list[1].points : 0;

    if (!selectedName || !list.some(r => r.name === selectedName)) {
      selectedName = list[0].name;
    }
    const inspected = list.find(r => r.name === selectedName) || list[0];

    // Podium header
    const podiumTitle = find('podium-title');
    if (podiumTitle) podiumTitle.textContent = period === 'weekly' ? 'Weekly front runners' : 'All-time legends';
    const leadChip = find('podium-lead');
    if (leadChip) leadChip.textContent = leadMargin ? `+${format.format(leadMargin)} pts lead` : 'Tied for #1';

    const slot = r => {
      const meta = COMPANION_META[r.hero] || { label: r.hero };
      const lane = el('button', 'lb-lane');
      lane.type = 'button';
      lane.dataset.rank = String(r.rank);
      lane.setAttribute('aria-pressed', String(r.name === inspected.name));
      lane.setAttribute('aria-label', `Rank ${r.rank} ${r.name}, ${format.format(r.points)} points`);
      if (r.rank === 1) lane.append(el('span', 'lb-crown', '★ Leader'));

      const spriteBox = el('div', 'lb-lane-sprite');
      spriteBox.append(sprite(r.hero, 'cheer'));

      const step = el('div', 'lb-plinth');
      step.append(
        el('span', 'lb-plinth-rank', `#${String(r.rank).padStart(2, '0')}`),
        el('strong', null, r.name),
        el('span', 'lb-plinth-meta', `${meta.label} · ${r.streak}d`),
        el('span', 'lb-plinth-pts', `${format.format(r.points)} pts`)
      );
      lane.append(spriteBox, step);
      lane.addEventListener('click', () => {
        selectedName = r.name;
        draw(activePeriod, false);
      });
      return lane;
    };
    find('podium').replaceChildren(...[list[1], list[0], list[2]].map(slot));

    // Your standing card
    const selfAvatar = find('self-avatar');
    if (selfAvatar) {
      selfAvatar.replaceChildren(sprite(mine.hero, mine.rank === 1 ? 'cheer' : 'act'));
      const settings = window.HabitArc?.isOnboardingComplete?.() && window.HabitArc.getSettings();
      selfAvatar.dataset.power = inventory(settings?.treasureRoom).equipped || '';
    }
    find('self-rank').textContent = '#' + mine.rank;
    const tierEl = find('self-tier');
    if (tierEl) tierEl.textContent = mine.tier;
    const deltaEl = find('self-delta');
    if (deltaEl) {
      deltaEl.textContent = deltaLabel(mine.delta);
      deltaEl.className = 'lb-delta-pill' + (mine.delta < 0 ? ' is-down' : mine.delta === 0 ? ' is-flat' : '');
    }
    find('self-gap').textContent = gap
      ? `${format.format(mine.points)} pts · ${format.format(gap)} pts behind #${ahead.rank} ${ahead.name}`
      : `${format.format(mine.points)} pts · Leading the league!`;

    const chasePct = ahead ? Math.max(8, Math.min(99, Math.round((mine.points / Math.max(1, ahead.points)) * 100))) : 100;
    const chaseLabel = find('self-chase-label');
    if (chaseLabel) chaseLabel.textContent = ahead ? `Closing in on #${ahead.rank} ${ahead.name}` : 'Holding #1 crown';
    const chasePctEl = find('self-chase-pct');
    if (chasePctEl) chasePctEl.textContent = `${chasePct}%`;
    const chaseBar = find('self-chase-bar');
    if (chaseBar) chaseBar.style.width = `${chasePct}%`;
    const chaseProgress = find('self-chase-progress');
    if (chaseProgress) chaseProgress.setAttribute('aria-valuenow', String(chasePct));

    const resetBtn = find('reset-boost-btn');
    if (resetBtn) resetBtn.hidden = demoBoost === 0;
    const boostBtn = find('boost-btn');
    if (boostBtn) boostBtn.textContent = demoBoost ? `+25 pts (+${demoBoost})` : '+25 pts';

    // Standings table + companion filters
    renderHeroFilters(list);
    const periodPill = find('standings-period-pill');
    if (periodPill) periodPill.textContent = period === 'weekly' ? 'Weekly sprint' : 'All-time';

    const visibleRows = activeHeroFilter === 'all' ? list : list.filter(r => r.hero === activeHeroFilter);
    find('entries').replaceChildren(...visibleRows.map(r => {
      const meta = COMPANION_META[r.hero] || { label: r.hero };
      const tr = el('tr');
      tr.dataset.runner = r.name;
      if (r.self) {
        tr.className = 'lb-mine';
        tr.tabIndex = -1;
      } else if (r.name === inspected.name) {
        tr.className = 'is-selected';
      }

      const rankTd = el('td');
      const rankWrap = el('div', 'lb-rank-cell');
      const medalCls = r.rank === 1 ? ' is-gold' : r.rank === 2 ? ' is-silver' : r.rank === 3 ? ' is-bronze' : '';
      rankWrap.append(el('span', `lb-rank-num${medalCls}`, String(r.rank).padStart(2, '0')));
      const dEl = el('span', `lb-row-delta${r.delta > 0 ? ' is-up' : r.delta < 0 ? ' is-down' : ''}`, deltaLabel(r.delta));
      rankWrap.append(dEl);
      rankTd.append(rankWrap);

      const nameTd = el('td');
      const btn = el('button', 'lb-runner-btn');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(r.name === inspected.name));
      const avatar = el('span', 'lb-pic');
      const img = sprite(r.hero, 'run0');
      avatar.append(img);

      const copy = el('span', 'lb-runner-copy');
      const nameLine = el('span', 'lb-runner-name-line');
      nameLine.append(el('span', 'lb-runner-name', r.name));
      if (r.self) nameLine.append(el('small', 'lb-you', 'You'));
      copy.append(nameLine, el('span', 'lb-runner-sub', `${meta.label} · ${r.streak}d streak · ${r.consistency}%`));
      btn.append(avatar, copy);
      btn.addEventListener('click', () => {
        selectedName = r.name;
        draw(activePeriod, false);
      });
      nameTd.append(btn);

      const ptsTd = el('td');
      const ptsWrap = el('div', 'lb-pts-cell');
      ptsWrap.append(el('span', 'lb-pts', format.format(r.points)));
      const bar = el('span', 'lb-pts-bar');
      const fill = el('span');
      fill.style.width = `${Math.max(12, Math.round((r.points / topPoints) * 100))}%`;
      bar.append(fill);
      ptsWrap.append(bar);
      ptsTd.append(ptsWrap);

      tr.append(rankTd, nameTd, ptsTd);
      return tr;
    }));

    find('roster').textContent = activeHeroFilter === 'all'
      ? `${list.length} demo runners`
      : `${visibleRows.length} of ${list.length} runners`;
    periodButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.period === period)));
    renderSpotlight(inspected, mine);

    if (announce) {
      find('announcement').textContent = `${period === 'weekly' ? 'Weekly' : 'All-time'} standings. Your demo rank is ${mine.rank} of ${list.length}.`;
    }
  }

  periodButtons.forEach(b => b.addEventListener('click', () => draw(b.dataset.period, true)));

  find('find-me').addEventListener('click', () => {
    if (activeHeroFilter !== 'all') {
      activeHeroFilter = 'all';
      draw(activePeriod, false);
    }
    const row = root.querySelector('.lb-mine');
    if (!row) return;
    row.focus({ preventScroll: true });
    row.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  });

  find('boost-btn')?.addEventListener('click', () => {
    demoBoost += 25;
    selectedName = 'Sarthak';
    draw(activePeriod, true);
  });

  find('reset-boost-btn')?.addEventListener('click', () => {
    demoBoost = 0;
    selectedName = null;
    draw(activePeriod, true);
  });

  draw('weekly', false);
  if (find('treasures')) mountTreasureRoom(root, find, () => draw(activePeriod, false));
}


function mountTreasureRoom(root, find, redrawLeague) {
  let active = false, lastRenderKey = '';
  let showing = null;
  // Keep the dialog inside the route root for SPA teardown. showModal() puts
  // it in the browser's top layer, above the header and bottom navigation.
  function reveal(chest, sample, trigger) {
    if (showing) return;
    const {scope, ready, hero} = read();
    const dialog = el('dialog', 'lb-reveal');
    dialog.dataset.tier = chest.id;
    dialog.dataset.phase = 'sealed';
    dialog.setAttribute('aria-label', chest.name + (sample ? ' preview' : ' reward'));
    const art = chestArt(chest, false);
    const kicker = el('div','lb-reveal-kicker');
    const stateLabel = el('span','lb-reveal-badge',sample ? 'Opening preview' : 'Treasure unlocked');
    kicker.append(stateLabel, el('strong','lb-reveal-chest-name',chest.name));
    const orbit = el('div','lb-reveal-orbit');
    orbit.setAttribute('aria-hidden','true');
    const pulse = el('div','lb-reveal-wave');
    pulse.setAttribute('aria-hidden','true');
    const open = el('button','lb-reveal-open');
    open.type = 'button'; open.autofocus = true;
    open.setAttribute('aria-label','Tap to open ' + chest.name);
    open.append(el('span','lb-reveal-prompt','Tap to open'));
    const close = el('button','lb-reveal-close','×');
    close.type = 'button'; close.setAttribute('aria-label','Close treasure');
    const title = el('h2','lb-reveal-title',chest.power);
    const detail = el('p','lb-reveal-detail', sample ? 'Preview only · No XP awarded' : '+' + chest.xp + ' XP · Power equipped');
    const done = el('button','lb-reveal-done','Back to treasures');
    done.type = 'button';
    const copy = el('div','lb-reveal-copy');
    copy.append(title, detail);
    copy.hidden = done.hidden = true;
    const announce = el('div','lb-sr'); announce.setAttribute('role','status');
    dialog.append(orbit, kicker, pulse, art, open, copy, done, close, announce);
    showing = {dialog, scope, ready};
    let finishTimer;
    function finish() {
      if (!dialog.open || dialog.dataset.phase !== 'opening') return;
      clearTimeout(finishTimer);
      dialog.dataset.phase = 'revealed';
      if (!sample) stateLabel.textContent = 'Reward unlocked';
      copy.hidden = done.hidden = false;
      announce.textContent = chest.power + '. ' + detail.textContent;
      if (document.activeElement === dialog) done.focus({preventScroll:true});
    }
    open.addEventListener('click', () => {
      if (!dialog.open || dialog.dataset.phase !== 'sealed') return;
      if (!sample && !applyTreasure(chest,'open',scope,hero)) {
        dialog.close();
        render();
        find('announcement').textContent = 'Your collection changed. Check the chest and try again.';
        return;
      }
      dialog.dataset.phase = 'opening';
      dialog.focus({preventScroll:true});
      open.hidden = true;
      art.dataset.open = 'true';
      // The relic is the last animated beat. A bounded fallback also handles
      // background tabs, cancelled animations and motion-preference changes.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
      art.querySelector('.lb-chest-relic').addEventListener('animationend', finish, {once:true});
      finishTimer = setTimeout(finish,2400);
    });
    dialog.addEventListener('close', () => {
      clearTimeout(finishTimer);
      if (showing?.dialog === dialog) showing = null;
      dialog.remove();
      if (!root.isConnected || !active) return;
      const card = find('treasure-cards').querySelector('[data-tier="' + chest.id + '"]');
      const fallback = card?.querySelector('[data-chest]:enabled, .lb-chest-preview') || card;
      if (fallback === card && card) card.tabIndex = -1;
      (trigger?.isConnected && !trigger.disabled ? trigger : fallback)?.focus({preventScroll:true});
    }, {once:true});
    close.addEventListener('click', () => dialog.close());
    done.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog || dialog.dataset.phase === 'opening') return;
      const box = art.getBoundingClientRect();
      const outside = event.clientX < box.left || event.clientX > box.right ||
        event.clientY < box.top || event.clientY > box.bottom;
      if (outside) dialog.close();
    });
    root.append(dialog);
    dialog.showModal();
  }
  function applyTreasure(chest, action, scope, hero) {
    const current = read();
    if (!current.writable || current.scope !== scope || current.hero !== hero) return false;
    const updated = changeTreasure(current.settings.treasureRoom, chest.id, action, current.count, hero);
    if (!updated) return false;
    store().updateSettings({ treasureRoom:updated, leagueCompanion:hero });
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
    const writable = ready && (!sync?.signedIn || sync.connected);
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
    find('treasure-avatar').dataset.power = bag.equipped || '';
    find('treasure-avatar').replaceChildren(sprite(hero, bag.equipped ? 'cheer' : 'run0'));
    find('treasure-runner').textContent = ready ? COMPANION_META[hero].label : 'Your companion';
    find('treasure-xp').textContent = bag.xp + ' treasure XP';
    const next = CHESTS.find(c => !bag.opened.includes(c.id));
    find('treasure-summary').textContent = !ready ? 'Finish onboarding to start your collection.' :
      !writable ? 'Waiting for your account to sync before changing your collection.' :
      !next ? 'Collection complete. Equip any of your three powers below.' :
      count >= next.days ? next.name + ' ready to open.' :
      (next.days - count) + ' more clear ' + (next.days - count === 1 ? 'day' : 'days') + ' to your ' + next.name.toLowerCase() + '.';
    const cards = CHESTS.map(c => {
      const opened = bag.opened.includes(c.id), equipped = bag.equipped === c.id;
      const card = el('article', 'lb-chest');
      card.dataset.tier = c.id;
      const heading = el('div', 'lb-chest-kicker');
      heading.append(el('h3', null, c.name), el('span', 'lb-chest-stamp', opened ? 'Collected' : count >= c.days ? 'Ready' : 'Locked'));
      const art = chestArt(c, opened);
      const progress = el('progress');
      progress.max = c.days; progress.value = opened ? c.days : Math.min(count, c.days);
      progress.setAttribute('aria-label', c.name + ' clear days');
      const daysLabel = c.days === 1 ? '1 clear day' : c.days + ' clear days';
      const button = el('button', 'lb-chest-action', equipped ? 'Equipped' : opened ? 'Equip ' + c.power : count >= c.days ? 'Open chest' : 'Unlock at ' + daysLabel);
      button.type = 'button'; button.dataset.chest = c.id;
      button.disabled = !writable || equipped || (!opened && count < c.days);
      button.setAttribute('aria-label', c.name + ': ' + button.textContent);
      button.addEventListener('click', () => {
        if (!opened) { reveal(c, false, button); return; }
        if (!applyTreasure(c,'equip',scope,hero)) { render(); return; }
        find('announcement').textContent = 'Equipped ' + c.power + '.';
        const card = find('treasure-cards').querySelector('[data-tier="' + c.id + '"]');
        card.tabIndex = -1; card.focus({preventScroll:true});
      });
      const actions = el('div','lb-chest-actions');
      actions.append(button);
      card.append(heading, art, el('strong', 'lb-power-name', c.power + ' · +' + c.xp + ' XP'),
        el('p', null, c.description), progress, el('small', null, opened ? 'Milestone earned' : Math.min(count, c.days) + ' / ' + daysLabel), actions);
      if (opened || c.id === 'wood') {
        const preview = el('button', 'lb-chest-preview', opened ? 'Replay opening' : 'Preview opening');
        preview.type = 'button';
        preview.setAttribute('aria-label', preview.textContent + ': ' + c.name + ' (no XP awarded)');
        preview.addEventListener('click', () => reveal(c, true, preview));
        actions.append(preview);
      }
      return card;
    });
    find('treasure-cards').replaceChildren(...cards);
    if (focused) find('treasure-cards').querySelector('[data-chest="' + focused + '"]:not(:disabled)')?.focus({ preventScroll:true });
    if (focusedCard) {
      const card = find('treasure-cards').querySelector('[data-tier="' + focusedCard + '"]');
      if (card) { card.tabIndex = -1; card.focus({preventScroll:true}); }
    }
  }
  function switchView(treasure) {
    active = treasure;
    if (!treasure && showing) showing.dialog.close();
    for (const id of ['league-view', 'league-footer', 'league-controls']) find(id).hidden = treasure;
    find('treasures').hidden = !treasure;
    find('show-treasures').setAttribute('aria-pressed', String(treasure));
    find('show-league').setAttribute('aria-pressed', String(!treasure));
    find('lb-scope').textContent = treasure ? 'Arc League · Your collection' : 'Arc League · Season 01 Demo';
    find('lb-intro-text').textContent = treasure ? 'Earn powers for your companion by showing up for your own routine.' :
      'Compare pixel companions, active streaks, and XP sprint gaps across the league.';
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
