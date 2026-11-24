/* Privacy-safe opt-in Global League & 6-character Friends Squad store.
 * Only aggregate points, streak, clear days, and chosen handle/tone leave the device.
 * Individual habit titles, notes, tasks, and email addresses are never shared.
 */
import { CHESTS, clearedDays, inventory } from './runner-treasures.js';

const CACHE_PREFIX = 'habitarc_league_cache:';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function shiftDateKey(dateKey, deltaDays) {
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0, 0);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function normaliseLeagueHandle(value, fallback = 'Arc Runner') {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const withoutEmail = cleaned.includes('@') ? cleaned.split('@')[0].trim() : cleaned;
  return (withoutEmail.slice(0, 20) || fallback).slice(0, 20);
}

export function normaliseSquadCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function isValidSquadCode(value) {
  return /^[A-Z0-9]{6}$/.test(String(value || ''));
}

export function normaliseSquadName(value, fallback = 'Habit Squad') {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned.slice(0, 28) || fallback).slice(0, 28);
}

export function generateSquadCode(randomFn = Math.random) {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(randomFn() * CODE_ALPHABET.length) % CODE_ALPHABET.length;
    out += CODE_ALPHABET[Math.max(0, idx)];
  }
  return out;
}

export function computeLiveLeagueScore({
  habits = [],
  completionHistory = [],
  today = '',
  treasureRoom = {},
  streak = 0,
} = {}) {
  const safeToday = /^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))
    ? today
    : new Date().toISOString().slice(0, 10);
  const weekStart = shiftDateKey(safeToday, -6);

  const completedPairs = new Set();
  const rawList = Array.isArray(completionHistory)
    ? completionHistory
    : Object.values(completionHistory || {});
  const historyList = [...rawList];
  const seenRecordPairs = new Set(
    rawList
      .filter((r) => r?.habitId && r?.date)
      .map((r) => `${r.habitId}|${r.date}`),
  );
  const explicitNotCompleted = new Set();

  for (const rec of rawList) {
    if (!rec?.habitId || !/^\d{4}-\d{2}-\d{2}$/.test(String(rec.date || '')) || rec.date > safeToday) continue;
    const key = `${rec.habitId}|${rec.date}`;
    if (rec.status === 'completed') {
      const habitObj = (habits || []).find((h) => h?.id === rec.habitId);
      const isSeed = habitObj?.starterHabit && rec.updatedAt === `${rec.date}T12:00:00.000Z` && rec.completedAt === rec.updatedAt;
      if (!isSeed) completedPairs.add(key);
    } else if (rec.status === 'not_completed') {
      explicitNotCompleted.add(key);
    }
  }

  for (const habit of habits || []) {
    if (!habit?.id || !habit.completions || typeof habit.completions !== 'object') continue;
    for (const [date, done] of Object.entries(habit.completions)) {
      if (!done || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > safeToday) continue;
      const key = `${habit.id}|${date}`;
      if (habit.starterHabit && !seenRecordPairs.has(key)) continue;
      if (!explicitNotCompleted.has(key)) {
        completedPairs.add(key);
        if (!seenRecordPairs.has(key)) {
          seenRecordPairs.add(key);
          historyList.push({ habitId: habit.id, date, status: 'completed' });
        }
      }
    }
  }

  let weeklyChecks = 0;
  for (const pair of completedPairs) {
    const date = pair.split('|')[1];
    if (date >= weekStart && date <= safeToday) weeklyChecks += 1;
  }

  const totalChecks = completedPairs.size;
  const clearList = clearedDays(habits || [], historyList, safeToday);
  const weeklyClearCount = clearList.filter((d) => d >= weekStart && d <= safeToday).length;
  const openedChests = new Set(inventory(treasureRoom).opened);
  const chestXp = CHESTS.reduce((sum, chest) => sum + (openedChests.has(chest.id) ? chest.xp : 0), 0);
  const cleanStreak = Math.max(0, Math.min(3650, Math.floor(Number(streak) || 0)));
  const streakBonus = Math.min(cleanStreak, 30) * 5;

  const weekly = Math.min(50000, (weeklyChecks * 25) + (weeklyClearCount * 40) + streakBonus);
  const allTime = Math.min(500000, (totalChecks * 25) + (clearList.length * 50) + chestXp);

  return {
    weekly,
    allTime,
    streak: cleanStreak,
    clearDays: clearList.length,
    weeklyChecks,
    totalChecks,
  };
}

export function getLeagueProfileSettings(app = globalThis.window?.HabitArc) {
  const settings = app?.getSettings?.() || {};
  const user = app?.getAuthUser?.() || null;
  const raw = settings.leagueProfile && typeof settings.leagueProfile === 'object'
    ? settings.leagueProfile
    : {};
  const defaultName = (settings.userName && settings.userName !== 'Alex Thorne' ? settings.userName : '')
    || user?.displayName
    || user?.email?.split('@')[0]
    || 'Arc Runner';
  const uidSeed = String(user?.uid || defaultName || '0');
  let defaultTone = 0;
  for (let i = 0; i < uidSeed.length; i += 1) defaultTone = (defaultTone + uidSeed.charCodeAt(i)) % 8;

  const squadCode = normaliseSquadCode(raw.squadCode);
  return {
    joined: Boolean(raw.joined),
    handle: normaliseLeagueHandle(raw.handle, defaultName),
    tone: Number.isInteger(raw.tone) ? ((raw.tone % 8) + 8) % 8 : defaultTone,
    squadCode: isValidSquadCode(squadCode) ? squadCode : '',
    squadName: normaliseSquadName(raw.squadName, 'Habit Squad'),
  };
}

export function buildSelfLeagueMember(app = globalThis.window?.HabitArc) {
  const profile = getLeagueProfileSettings(app);
  const uid = app?.getAuthUser?.()?.uid || 'local-self';
  const score = computeLiveLeagueScore({
    habits: app?.getHabits?.() || [],
    completionHistory: app?.getCompletionHistory?.() || [],
    today: app?.today?.() || '',
    treasureRoom: app?.getSettings?.()?.treasureRoom || {},
    streak: app?.getOverallCurrentStreak?.() || 0,
  });
  return {
    uid,
    name: profile.handle,
    tone: profile.tone,
    weekly: score.weekly,
    allTime: score.allTime,
    streak: score.streak,
    clearDays: score.clearDays,
    squadCode: profile.squadCode,
    updatedAt: new Date().toISOString(),
  };
}

function cacheKey(uid = 'local') {
  return `${CACHE_PREFIX}${uid || 'local'}`;
}

export function readCachedLeagueData(uid = 'local') {
  try {
    const raw = globalThis.localStorage?.getItem(cacheKey(uid));
    if (!raw) return { globalMembers: [], squadMembers: [], squad: null, syncedAt: '' };
    const parsed = JSON.parse(raw);
    return {
      globalMembers: Array.isArray(parsed?.globalMembers) ? parsed.globalMembers : [],
      squadMembers: Array.isArray(parsed?.squadMembers) ? parsed.squadMembers : [],
      squad: parsed?.squad && typeof parsed.squad === 'object' ? parsed.squad : null,
      syncedAt: typeof parsed?.syncedAt === 'string' ? parsed.syncedAt : '',
    };
  } catch {
    return { globalMembers: [], squadMembers: [], squad: null, syncedAt: '' };
  }
}

export function writeCachedLeagueData(uid = 'local', payload = {}) {
  try {
    const prev = readCachedLeagueData(uid);
    const next = {
      globalMembers: Array.isArray(payload.globalMembers) ? payload.globalMembers.slice(0, 60) : prev.globalMembers,
      squadMembers: Array.isArray(payload.squadMembers) ? payload.squadMembers.slice(0, 35) : prev.squadMembers,
      squad: payload.squad !== undefined ? payload.squad : prev.squad,
      syncedAt: payload.syncedAt || new Date().toISOString(),
    };
    globalThis.localStorage?.setItem(cacheKey(uid), JSON.stringify(next));
    return next;
  } catch {
    return payload;
  }
}

async function callLeagueApi(action, body = {}, authClient = globalThis.window?.HabitArcAuth) {
  if (!authClient?.getCurrentUser?.()) {
    throw Object.assign(new Error('Sign in with your HabitArc account to sync live standings across devices.'), { code: 'auth/no-current-user' });
  }
  const token = await authClient.getIdToken();
  const res = await fetch('/api/league', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || 'League sync unavailable.');
    err.code = data?.error || `http-${res.status}`;
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function syncLiveLeague(action = 'sync', extra = {}, {
  app = globalThis.window?.HabitArc,
  authClient = globalThis.window?.HabitArcAuth,
} = {}) {
  const selfMember = buildSelfLeagueMember(app);
  const uid = app?.getAuthUser?.()?.uid || '';
  if (!uid) {
    return {
      ok: false,
      mode: 'local-only',
      message: 'Sign in to compete live with friends across devices.',
      globalMembers: [selfMember],
      squadMembers: selfMember.squadCode ? [selfMember] : [],
      squad: selfMember.squadCode ? { code: selfMember.squadCode, name: getLeagueProfileSettings(app).squadName } : null,
    };
  }

  let resolvedAuth = authClient;
  if (!resolvedAuth && globalThis.window?.HabitArcAuthReady) {
    try { resolvedAuth = await globalThis.window.HabitArcAuthReady; } catch {}
  }

  const payload = {
    member: {
      name: selfMember.name,
      tone: selfMember.tone,
      weekly: selfMember.weekly,
      allTime: selfMember.allTime,
      streak: selfMember.streak,
      clearDays: selfMember.clearDays,
      squadCode: extra.squadCode !== undefined ? normaliseSquadCode(extra.squadCode) : selfMember.squadCode,
    },
    ...extra,
  };

  try {
    const apiResult = await callLeagueApi(action, payload, resolvedAuth);
    const cached = writeCachedLeagueData(uid, {
      globalMembers: apiResult.globalMembers,
      squadMembers: apiResult.squadMembers,
      squad: apiResult.squad ?? null,
      syncedAt: new Date().toISOString(),
    });
    return {
      ok: true,
      mode: 'cloud',
      ...cached,
      squad: apiResult.squad ?? cached.squad,
    };
  } catch (apiError) {
    // Fallback to direct Firestore client methods when running without /api/league or Admin creds.
    if (resolvedAuth?.syncLeagueAction) {
      try {
        const directResult = await resolvedAuth.syncLeagueAction(action, payload);
        const cached = writeCachedLeagueData(uid, {
          globalMembers: directResult.globalMembers,
          squadMembers: directResult.squadMembers,
          squad: directResult.squad ?? null,
          syncedAt: new Date().toISOString(),
        });
        return {
          ok: true,
          mode: 'cloud',
          ...cached,
          squad: directResult.squad ?? cached.squad,
        };
      } catch (directError) {
        const prev = readCachedLeagueData(uid);
        const code = String(directError?.code || apiError?.code || '');
        const msg = /permission-denied|insufficient/i.test(code + ' ' + String(directError?.message || ''))
          ? 'Your live score is active here. Deploy updated Firestore rules (or set FIREBASE_SERVICE_ACCOUNT_JSON) to sync friends.'
          : (apiError?.message || directError?.message || 'Offline — showing your live score and cached standings.');
        return {
          ok: false,
          mode: 'cached',
          code,
          message: msg,
          globalMembers: prev.globalMembers.length ? prev.globalMembers : [selfMember],
          squadMembers: prev.squadMembers.length ? prev.squadMembers : (selfMember.squadCode ? [selfMember] : []),
          squad: prev.squad,
        };
      }
    }
    const prev = readCachedLeagueData(uid);
    return {
      ok: false,
      mode: 'cached',
      message: apiError?.message || 'Offline — showing cached standings.',
      globalMembers: prev.globalMembers.length ? prev.globalMembers : [selfMember],
      squadMembers: prev.squadMembers.length ? prev.squadMembers : (selfMember.squadCode ? [selfMember] : []),
      squad: prev.squad,
    };
  }
}
