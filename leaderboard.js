import { CHESTS, changeTreasure, clearedDays, inventory } from './runner-treasures.js';
import {
  buildSelfLeagueMember,
  getLeagueProfileSettings,
  isValidSquadCode,
  normaliseLeagueHandle,
  normaliseSquadCode,
  normaliseSquadName,
  readCachedLeagueData,
  syncLiveLeague,
} from './league-store.js';
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

export function rankLeagueEntries(rawEntries = [], period = 'weekly', selfUid = 'local-self') {
  const isAllTime = period === 'allTime';
  const deduped = new Map();
  for (const item of rawEntries || []) {
    if (!item || typeof item !== 'object') continue;
    const uid = String(item.uid || item.name || '');
    if (!uid) continue;
    deduped.set(uid, {
      uid,
      name: normaliseLeagueHandle(item.name, 'Arc Runner'),
      tone: Number.isInteger(item.tone) ? ((item.tone % 8) + 8) % 8 : 0,
      weeklyPoints: Math.max(0, Math.floor(Number(item.weekly) || 0)),
      allTimePoints: Math.max(0, Math.floor(Number(item.allTime) || 0)),
      streak: Math.max(0, Math.floor(Number(item.streak) || 0)),
      clearDays: Math.max(0, Math.floor(Number(item.clearDays) || 0)),
    });
  }
  return Array.from(deduped.values())
    .map((r) => ({
      ...r,
      points: isAllTime ? r.allTimePoints : r.weeklyPoints,
      self: r.uid === selfUid,
    }))
    .sort((a, b) => b.points - a.points || b.streak - a.streak || a.name.localeCompare(b.name))
    .map((r, idx) => ({
      ...r,
      rank: idx + 1,
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
  const label = member?.placeholder ? '—' : memberInitials(member?.name);
  const badge = el('span', member?.placeholder ? `${cls} lb-avatar-empty` : cls, label);
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
  const scopeButtons = root.querySelectorAll('[data-league-scope]');
  const app = () => globalThis.window?.HabitArc;

  let activePeriod = 'weekly';
  const initialProfile = getLeagueProfileSettings(app());
  let activeScope = initialProfile.joined
    ? (initialProfile.squadCode ? 'squad' : 'global')
    : 'demo';
  let liveGlobal = [];
  let liveSquad = [];
  let squadMeta = initialProfile.squadCode
    ? { code: initialProfile.squadCode, name: initialProfile.squadName }
    : null;
  let syncInFlight = false;
  let toastTimer = null;

  function hydrateFromLocalCache() {
    const uid = app()?.getAuthUser?.()?.uid || 'local';
    const cached = readCachedLeagueData(uid);
    if (cached.globalMembers.length) liveGlobal = cached.globalMembers;
    if (cached.squadMembers.length) liveSquad = cached.squadMembers;
    if (cached.squad) squadMeta = cached.squad;
  }
  if (app()) hydrateFromLocalCache();

  function showToast(message) {
    const toastEl = find('league-toast');
    if (!toastEl) return;
    clearTimeout(toastTimer);
    if (!message) {
      toastEl.hidden = true;
      toastEl.textContent = '';
      return;
    }
    toastEl.hidden = false;
    toastEl.textContent = message;
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 3600);
  }

  function setStatus(message, isError = false, alsoToast = false) {
    const statusEl = find('league-sync-status');
    if (statusEl) {
      if (!message) {
        statusEl.hidden = true;
        statusEl.textContent = '';
      } else {
        statusEl.hidden = false;
        statusEl.dataset.tone = isError ? 'error' : 'info';
        statusEl.textContent = message;
      }
    }
    if (alsoToast && message) showToast(message);
  }

  function setSheetTab(tab = 'profile') {
    const isSquad = tab === 'squad';
    const optinSec = find('league-optin-bar');
    const squadSec = find('league-squad-panel');
    if (optinSec) optinSec.hidden = isSquad;
    if (squadSec) squadSec.hidden = !isSquad;
    root.querySelectorAll('[data-sheet-tab]').forEach((btn) => {
      btn.setAttribute('aria-selected', String(btn.dataset.sheetTab === (isSquad ? 'squad' : 'profile')));
    });
  }

  function openSheet(focusId = '', tab = 'profile') {
    const sheet = find('league-sheet');
    if (!sheet) return;
    updateLeagueChrome();
    setSheetTab(tab);
    if (!sheet.open && typeof sheet.showModal === 'function') {
      sheet.showModal();
    } else {
      sheet.setAttribute('open', '');
    }
    if (focusId) {
      find(focusId)?.focus({ preventScroll: true });
    }
  }

  function closeSheet() {
    const sheet = find('league-sheet');
    if (!sheet) return;
    if (sheet.open && typeof sheet.close === 'function') {
      sheet.close();
    } else {
      sheet.removeAttribute('open');
    }
  }

  async function copySquadCode() {
    const code = getLeagueProfileSettings(app()).squadCode;
    if (!code) return;
    try {
      await globalThis.navigator?.clipboard?.writeText(code);
      setStatus(`Copied squad code ${code}! Share it with friends.`, false, true);
    } catch {
      setStatus(`Squad code: ${code}`, false, true);
    }
  }

  function updateLeagueChrome() {
    const hasApp = Boolean(app());
    const profile = getLeagueProfileSettings(app());
    const selfMember = hasApp ? buildSelfLeagueMember(app()) : null;

    scopeButtons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.leagueScope === activeScope));
    });

    const bannerTitle = find('league-banner-title');
    const bannerSub = find('league-banner-sub');
    const bannerPrimary = find('league-banner-primary');
    const bannerSecondary = find('league-banner-secondary');

    if (bannerTitle && bannerSub && bannerPrimary && bannerSecondary && hasApp) {
      if (!profile.joined) {
        bannerTitle.textContent = `⚡ ${format.format(selfMember?.weekly || 0)} wk pts ready`;
        bannerSub.textContent = activeScope === 'squad'
          ? 'Create or join a 6-digit friend squad'
          : 'Join live league · Habit names stay private';
        bannerPrimary.textContent = activeScope === 'squad' ? 'Squad Setup' : 'Join Live';
        bannerPrimary.dataset.action = activeScope === 'squad' ? 'open-squad' : 'open-join';
        bannerSecondary.hidden = true;
      } else if (activeScope === 'squad' && !profile.squadCode) {
        bannerTitle.textContent = 'No squad joined yet';
        bannerSub.textContent = 'Create a 6-char code or enter a friend code';
        bannerPrimary.textContent = '+ Squad';
        bannerPrimary.dataset.action = 'open-squad';
        bannerSecondary.hidden = false;
        bannerSecondary.textContent = 'Manage';
        bannerSecondary.dataset.action = 'open-manage';
      } else if (activeScope === 'squad' && profile.squadCode) {
        bannerTitle.textContent = `${squadMeta?.name || profile.squadName || 'Habit Squad'} · ${profile.squadCode}`;
        bannerSub.textContent = 'Share code with friends to race live';
        bannerPrimary.textContent = 'Copy Code';
        bannerPrimary.dataset.action = 'copy-code';
        bannerSecondary.hidden = false;
        bannerSecondary.textContent = 'Manage';
        bannerSecondary.dataset.action = 'open-manage';
      } else if (activeScope === 'demo') {
        bannerTitle.textContent = 'Viewing sample preview';
        bannerSub.textContent = `Joined as ${profile.handle}`;
        bannerPrimary.textContent = 'Go Live';
        bannerPrimary.dataset.action = 'go-live';
        bannerSecondary.hidden = false;
        bannerSecondary.textContent = 'Manage';
        bannerSecondary.dataset.action = 'open-manage';
      } else {
        bannerTitle.textContent = `${profile.handle} · 🔥 ${selfMember?.streak || 0}d streak`;
        bannerSub.textContent = `${format.format(selfMember?.weekly || 0)} wk · ${format.format(selfMember?.allTime || 0)} total pts`;
        bannerPrimary.textContent = 'Friend Squad';
        bannerPrimary.dataset.action = 'switch-squad';
        bannerSecondary.hidden = false;
        bannerSecondary.textContent = 'Manage';
        bannerSecondary.dataset.action = 'open-manage';
      }
    }

    const memberActions = find('league-member-actions');
    const selfChip = find('league-self-chip');
    const handleInput = find('league-handle-input');
    const joinBtn = find('league-join-btn');
    const optinHeadline = find('league-optin-headline');
    const squadEmpty = find('league-squad-empty');
    const squadActive = find('league-squad-active');
    const squadActiveName = find('squad-active-name');
    const squadCodeDisplay = find('squad-code-display');
    const showLeagueBtn = find('show-league');

    if (showLeagueBtn && hasApp) {
      showLeagueBtn.textContent = 'League';
    }
    if (optinHeadline) {
      optinHeadline.textContent = profile.joined ? 'Your Public Handle' : 'Choose Handle to Join Live';
    }
    if (joinBtn) {
      joinBtn.textContent = profile.joined ? 'Save Handle' : 'Join Live';
    }
    if (handleInput && !handleInput.value) {
      handleInput.value = profile.handle;
    }
    if (memberActions) {
      memberActions.hidden = !profile.joined;
      if (selfChip && selfMember) {
        selfChip.textContent = `${profile.handle} · 🔥 ${selfMember.streak}d`;
      }
    }
    const hasSquad = Boolean(profile.squadCode);
    if (squadEmpty) squadEmpty.hidden = hasSquad;
    if (squadActive) squadActive.hidden = !hasSquad;
    if (hasSquad) {
      if (squadActiveName) squadActiveName.textContent = squadMeta?.name || profile.squadName || 'Habit Squad';
      if (squadCodeDisplay) squadCodeDisplay.textContent = profile.squadCode;
    }

    const scopeEl = find('lb-scope');
    const titleEl = find('lb-page-title');
    const introEl = find('lb-intro-text');
    const footerEl = find('league-footer');
    const treasuresEl = find('treasures');
    const inLeagueView = treasuresEl ? treasuresEl.hidden : true;

    if (inLeagueView && hasApp) {
      if (scopeEl) {
        scopeEl.textContent = activeScope === 'global'
          ? (profile.joined ? 'Live league' : 'Global preview')
          : activeScope === 'squad'
            ? (profile.squadCode ? `Squad · ${profile.squadCode}` : 'Friends squad')
            : 'Sample preview';
      }
      if (titleEl && find('treasures')) {
        titleEl.textContent = activeScope === 'global'
          ? 'Global League'
          : activeScope === 'squad'
            ? (squadMeta?.name || (profile.squadCode ? profile.squadName : 'Friends Squad'))
            : 'Practice League';
      }
      if (introEl && find('treasures')) {
        introEl.textContent = activeScope === 'demo'
          ? 'Sample weekly and all-time standings for reference.'
          : activeScope === 'squad'
            ? 'Compete privately with friends using a 6-character invite code.'
            : 'Ranked by habit completions, clear days, and streak XP.';
      }
      if (footerEl) {
        footerEl.textContent = activeScope === 'demo'
          ? '● Sample preview leaderboard for reference only; your own streaks stay private.'
          : '● +25 pts/check · +40–50 pts/clear day · +streak & chest XP. Habit names stay private.';
      }
    }
  }

  function buildRoster(period) {
    if (activeScope === 'demo' || !app()) {
      return standings(period);
    }
    const selfMember = buildSelfLeagueMember(app());
    const pool = activeScope === 'squad'
      ? (getLeagueProfileSettings(app()).squadCode ? [...liveSquad, selfMember] : [selfMember])
      : [...liveGlobal, selfMember];
    return rankLeagueEntries(pool, period, selfMember.uid);
  }

  function draw(period, announce) {
    activePeriod = period;
    updateLeagueChrome();
    const list = buildRoster(period);
    const mine = list.find(r => r.self) || list[0];
    const gap = !mine || mine.rank === 1 ? 0 : list[mine.rank - 2].points - mine.points;

    const slot = (r, fallbackRank) => {
      const entry = r || { rank: fallbackRank, name: 'Open slot', tone: fallbackRank, placeholder: true };
      const lane = el('div', entry.placeholder ? 'lb-lane lb-lane-empty' : 'lb-lane');
      lane.dataset.rank = String(entry.rank);
      const step = el('div', 'lb-plinth');
      step.append(el('b', null, String(entry.rank).padStart(2, '0')), el('strong', null, entry.name));
      lane.append(avatarBadge(entry, 'lb-podium-avatar'), step);
      return lane;
    };
    find('podium').replaceChildren(
      slot(list[1], 2),
      slot(list[0], 1),
      slot(list[2], 3),
    );

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
      } else if (activeScope !== 'demo' && r.streak > 0) {
        wrap.append(el('small', 'lb-streak-tag', `${r.streak}d`));
      }
      nameCell.append(wrap);
      tr.append(
        el('td', 'lb-rank', String(r.rank).padStart(2, '0')),
        nameCell,
        el('td', 'lb-pts', format.format(r.points))
      );
      return tr;
    }));

    find('self-rank').textContent = mine ? '#' + mine.rank : '—';
    find('self-gap').textContent = !mine
      ? 'Join to see your rank'
      : gap > 0
        ? `${format.format(mine.points)} pts · ${format.format(gap)} pts behind #${mine.rank - 1}`
        : activeScope === 'squad' && list.length === 1
          ? `${format.format(mine.points)} pts · Share your squad code to add friends`
          : activeScope === 'demo'
            ? 'Leading the league'
            : `${format.format(mine.points)} pts · Leading the league`;

    const isDemo = activeScope === 'demo' || !app();
    find('roster').textContent = isDemo
      ? `${list.length} demo members`
      : activeScope === 'squad'
        ? `${list.length} squad ${list.length === 1 ? 'member' : 'members'}`
        : `${list.length} live ${list.length === 1 ? 'member' : 'members'}`;

    periodButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.period === period)));
    if (announce && mine) {
      const label = period === 'weekly' ? 'Weekly' : 'All-time';
      find('announcement').textContent = isDemo
        ? `${label} standings. Your demo rank is ${mine.rank} of ${list.length}.`
        : `${label} standings. Your rank is ${mine.rank} of ${list.length}.`;
    }
  }

  async function runLeagueSync(action = 'sync', extra = {}, { notice = '', userInitiated = false } = {}) {
    if (!app() || syncInFlight) return;
    syncInFlight = true;
    const refreshBtn = find('league-refresh-btn');
    if (refreshBtn) refreshBtn.disabled = true;
    try {
      const res = await syncLiveLeague(action, extra, { app: app() });
      if (Array.isArray(res.globalMembers)) liveGlobal = res.globalMembers;
      if (Array.isArray(res.squadMembers)) liveSquad = res.squadMembers;
      if (res.squad !== undefined) squadMeta = res.squad;
      if (action === 'create-squad' && res.squad?.code) {
        const cur = getLeagueProfileSettings(app());
        app().updateSettings({
          leagueProfile: {
            ...cur,
            joined: true,
            squadCode: res.squad.code,
            squadName: res.squad.name || cur.squadName,
          },
        });
        setStatus(`Squad "${res.squad.name}" ready! Share code ${res.squad.code}.`, false, true);
      } else if (action === 'join-squad' && res.squad?.code) {
        const cur = getLeagueProfileSettings(app());
        app().updateSettings({
          leagueProfile: {
            ...cur,
            joined: true,
            squadCode: res.squad.code,
            squadName: res.squad.name || cur.squadName,
          },
        });
        setStatus(`Joined "${res.squad.name}" (${res.squad.code}).`, false, true);
        closeSheet();
      } else if (res.ok) {
        if (notice) setStatus(notice, false, userInitiated);
      } else if (userInitiated && res.message) {
        setStatus(res.message, res.mode !== 'local-only', false);
      }
    } catch (err) {
      if (userInitiated) setStatus(err?.message || 'Could not sync League right now.', true);
    } finally {
      syncInFlight = false;
      if (refreshBtn) refreshBtn.disabled = false;
      draw(activePeriod, false);
    }
  }

  find('league-banner-primary')?.addEventListener('click', () => {
    const action = find('league-banner-primary')?.dataset?.action;
    if (action === 'copy-code') {
      void copySquadCode();
    } else if (action === 'open-squad') {
      openSheet('squad-name-input', 'squad');
    } else if (action === 'go-live') {
      const cur = getLeagueProfileSettings(app());
      activeScope = cur.squadCode ? 'squad' : 'global';
      draw(activePeriod, true);
    } else if (action === 'switch-squad') {
      activeScope = 'squad';
      draw(activePeriod, true);
      if (!getLeagueProfileSettings(app()).squadCode) openSheet('squad-name-input', 'squad');
    } else {
      openSheet('league-handle-input', 'profile');
    }
  });

  find('league-banner-secondary')?.addEventListener('click', () => {
    openSheet('', activeScope === 'squad' ? 'squad' : 'profile');
  });

  root.querySelectorAll('[data-sheet-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSheetTab(btn.dataset.sheetTab || 'profile');
    });
  });

  find('league-sheet-close')?.addEventListener('click', closeSheet);
  find('league-sheet')?.addEventListener('click', (event) => {
    if (event.target === find('league-sheet')) closeSheet();
  });

  scopeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeScope = btn.dataset.leagueScope || 'demo';
      draw(activePeriod, true);
      if (activeScope !== 'demo' && getLeagueProfileSettings(app()).joined) {
        void runLeagueSync('sync');
      }
    });
  });

  find('league-optin-bar')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!app()) return;
    const cur = getLeagueProfileSettings(app());
    const wasJoined = cur.joined;
    const chosenHandle = normaliseLeagueHandle(find('league-handle-input')?.value, cur.handle);
    app().updateSettings({
      leagueProfile: {
        ...cur,
        joined: true,
        handle: chosenHandle,
      },
    });
    if (activeScope === 'demo') activeScope = cur.squadCode ? 'squad' : 'global';
    draw(activePeriod, true);
    closeSheet();
    showToast(wasJoined ? `Handle updated to ${chosenHandle}` : `Joined Live League as ${chosenHandle}!`);
    void runLeagueSync('sync', {}, { notice: `Active as ${chosenHandle}`, userInitiated: true });
  });

  find('league-refresh-btn')?.addEventListener('click', () => {
    void runLeagueSync('sync', {}, { notice: 'Standings synced.', userInitiated: true });
  });

  find('league-leave-btn')?.addEventListener('click', async () => {
    if (!app()) return;
    const cur = getLeagueProfileSettings(app());
    await runLeagueSync('leave-league', { squadCode: cur.squadCode }, { userInitiated: true });
    app().updateSettings({
      leagueProfile: {
        ...cur,
        joined: false,
        squadCode: '',
      },
    });
    liveSquad = [];
    squadMeta = null;
    activeScope = 'demo';
    closeSheet();
    showToast('Left Live League.');
    draw(activePeriod, true);
  });

  find('squad-create-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!app()) return;
    const cur = getLeagueProfileSettings(app());
    const squadName = normaliseSquadName(find('squad-name-input')?.value, 'Habit Squad');
    if (!cur.joined) {
      app().updateSettings({ leagueProfile: { ...cur, joined: true, squadName } });
    }
    activeScope = 'squad';
    await runLeagueSync('create-squad', { squadName }, { userInitiated: true });
  });

  find('squad-join-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!app()) return;
    const codeInput = find('squad-code-input');
    const code = normaliseSquadCode(codeInput?.value);
    if (!isValidSquadCode(code)) {
      setStatus('Enter a valid 6-character invite code (letters & numbers).', true);
      codeInput?.focus();
      return;
    }
    const cur = getLeagueProfileSettings(app());
    if (!cur.joined) {
      app().updateSettings({ leagueProfile: { ...cur, joined: true } });
    }
    activeScope = 'squad';
    await runLeagueSync('join-squad', { code, squadCode: code }, { userInitiated: true });
  });

  find('squad-copy-btn')?.addEventListener('click', () => {
    void copySquadCode();
  });

  find('squad-leave-btn')?.addEventListener('click', async () => {
    if (!app()) return;
    const cur = getLeagueProfileSettings(app());
    const prevCode = cur.squadCode;
    app().updateSettings({ leagueProfile: { ...cur, squadCode: '', squadName: 'Habit Squad' } });
    liveSquad = [];
    squadMeta = null;
    await runLeagueSync('leave-squad', { code: prevCode, squadCode: '' }, { notice: 'Left Friends Squad.', userInitiated: true });
    draw(activePeriod, true);
  });

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
  if (initialProfile.joined && app()) {
    void runLeagueSync('sync');
  }
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
    if (treasure) {
      const sheet = find('league-sheet');
      if (sheet?.open && typeof sheet.close === 'function') sheet.close();
    }
    for (const id of ['league-hub', 'league-view', 'league-footer', 'league-controls']) {
      const node = find(id);
      if (node) node.hidden = treasure;
    }
    find('treasures').hidden = !treasure;
    if (soundBtn) soundBtn.hidden = !treasure;
    find('show-treasures').setAttribute('aria-pressed', String(treasure));
    find('show-league').setAttribute('aria-pressed', String(!treasure));
    const scopeEl = find('lb-scope');
    if (scopeEl) scopeEl.hidden = treasure;
    const titleEl = find('lb-page-title');
    if (titleEl && treasure) titleEl.textContent = 'Rewards';
    if (treasure) {
      find('lb-intro-text').textContent = 'Complete every scheduled habit on a day to count a clear day.';
      render();
      wakeCardChestAnimations();
    } else {
      redrawLeague();
    }
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
  const openChestsFirst = window.location.hash === '#chests' || window.location.hash === '#treasures';
  switchView(openChestsFirst);
}
