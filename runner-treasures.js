// Private progression. Standings, preview points and other users are never inputs.
export const CHESTS = Object.freeze([
  { id: 'wood', name: 'Spark chest', days: 1, xp: 30, power: 'First Clear', description: 'Unlocked on your first cleared day.' },
  { id: 'iron', name: 'Pulse chest', days: 7, xp: 70, power: 'Week Strong', description: 'Unlocked after clearing 7 scheduled days.' },
  { id: 'gold', name: 'Nova chest', days: 14, xp: 140, power: 'Fortnight Arc', description: 'Unlocked after clearing 14 scheduled days.' },
  { id: 'ruby', name: 'Apex vault', days: 30, xp: 260, power: '30-Day Crest', description: 'Unlocked after clearing 30 scheduled days.' },
]);
const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function weekday(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(key + 'T12:00:00Z');
  return Number.isFinite(+date) && date.toISOString().startsWith(key + 'T') ? days[date.getUTCDay()] : null;
}

export function clearedDays(habits, records, today) {
  const byId = new Map(habits.map(h => [h.id, h]));
  const adopted = new Map(), done = new Map();
  for (const r of records) {
    const h = byId.get(r.habitId);
    if (!h || !weekday(r.date) || r.date > today || r.date < h.createdAt) continue;
    // Seed maps are migrated with a synthetic midday timestamp. Real actions
    // on a starter routine count, but its pre-filled random history doesn't.
    if (h.starterHabit && r.updatedAt === r.date + 'T12:00:00.000Z' && r.completedAt === r.updatedAt) continue;
    if (!adopted.has(h.id) || r.date < adopted.get(h.id)) adopted.set(h.id, r.date);
    if (r.status !== 'completed') continue;
    if (!done.has(r.date)) done.set(r.date, new Set());
    done.get(r.date).add(h.id);
  }
  return [...done].filter(([date, completed]) => {
    const day = weekday(date);
    const scheduled = habits.filter(h => {
      if (h.createdAt > date || !h.createdAt || (h.starterHabit && !(adopted.get(h.id) <= date))) return false;
      const period = Array.isArray(h.scheduleHistory) && h.scheduleHistory.findLast(s => s.from <= date && Array.isArray(s.days));
      return (period?.days ?? h.repeat ?? days).includes(day);
    });
    return scheduled.length > 0 && scheduled.every(h => completed.has(h.id));
  }).map(([date]) => date).sort();
}

function parseTreasureState(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const rawOpened = Array.isArray(src.opened) ? src.opened : [];
  const rawOpens = src.opens && typeof src.opens === 'object' && !Array.isArray(src.opens) ? src.opens : {};
  const rawResetAt = src.resetAt && typeof src.resetAt === 'object' && !Array.isArray(src.resetAt) ? src.resetAt : {};
  const opens = {};
  const resetAt = {};
  const opened = [];
  let xp = 0;
  for (const c of CHESTS) {
    const legacyCount = rawOpened.includes(c.id) ? 1 : 0;
    const n = Number.isInteger(rawOpens[c.id]) && rawOpens[c.id] > 0 ? rawOpens[c.id] : legacyCount;
    if (n > 0) {
      opens[c.id] = n;
      opened.push(c.id);
      xp += n * c.xp;
    }
    if (Number.isInteger(rawResetAt[c.id]) && rawResetAt[c.id] >= 0) {
      resetAt[c.id] = rawResetAt[c.id];
    } else if (n > 0) {
      resetAt[c.id] = n * c.days;
    }
  }
  const equipped = opened.includes(src.equipped) ? src.equipped : null;
  return { opened, opens, resetAt, xp, equipped };
}

export function inventory(raw) {
  const { opened, xp, equipped } = parseTreasureState(raw);
  return { opened, xp, equipped };
}

export function chestCycle(raw, id, count = 0) {
  const chest = CHESTS.find(c => c.id === id);
  if (!chest) return { progress: 0, target: 1, daysLeft: 1, ready: false, opens: 0, baseline: 0 };
  const safeCount = Number.isInteger(count) && count > 0 ? count : 0;
  const state = parseTreasureState(raw);
  const baseline = Number.isInteger(state.resetAt[chest.id]) ? state.resetAt[chest.id] : 0;
  const rawProgress = Math.max(0, safeCount - baseline);
  const progress = Math.min(chest.days, rawProgress);
  const ready = rawProgress >= chest.days;
  const daysLeft = Math.max(0, chest.days - progress);
  return {
    progress,
    target: chest.days,
    daysLeft,
    ready,
    opens: state.opens[chest.id] || 0,
    baseline,
  };
}

export const AI_DEFAULT_NAME = 'ARC';

export const AI_TONES = Object.freeze([
  { id: 'default', label: 'Balanced' },
  { id: 'calm', label: 'Zen Monk' },
  { id: 'drill', label: 'Drill Coach' },
  { id: 'hinglish', label: 'Hinglish Dost' },
]);

export const AI_LEVEL_TIERS = Object.freeze([
  { level: 1, minDays: 0, reqLabel: 'START', rank: 'Habit Builder', shortPower: 'Make Habits', summary: 'Create and add habits directly in chat with 1-tap Undo.' },
  { level: 2, minDays: 0, reqLabel: '3 Quests', rank: 'Routine Manager', shortPower: 'Delete, Edit & Tasks', summary: 'Delete or edit habits, mark completions, and add tasks in chat.' },
  { level: 3, minDays: 7, reqLabel: '7D + 3Q', rank: 'Streak Tactician', shortPower: 'Streak Shield & Plan-B', summary: 'Build low-energy Plan-B backups and smart backlog rescues.' },
  { level: 4, minDays: 14, reqLabel: '14D + 3Q', rank: 'Routine Architect', shortPower: 'Batch Tune & Tones', summary: 'Rebalance multi-habit schedules and unlock custom AI coach tones.' },
]);

export function normaliseAiName(value) {
  const clean = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 16)
    : '';
  return clean || AI_DEFAULT_NAME;
}

export function normaliseAiTone(value) {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return AI_TONES.some(t => t.id === id) ? id : 'default';
}

export function normaliseAiStats(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const nonNeg = (n) => (Number.isInteger(n) && n > 0 ? n : (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0));
  const lvl = Number.isInteger(src.highestUnlockedLevel) && src.highestUnlockedLevel >= 1 && src.highestUnlockedLevel <= 4
    ? src.highestUnlockedLevel
    : 1;
  return {
    createdViaAi: nonNeg(src.createdViaAi),
    managedViaAi: nonNeg(src.managedViaAi),
    tasksDone: nonNeg(src.tasksDone),
    focusDone: nonNeg(src.focusDone),
    highestUnlockedLevel: lvl,
  };
}

export function measureAiQuestMetrics({
  habits = [],
  completionHistory = [],
  today = '',
  aiStats = null,
  tasksCompleted = null,
  focusSessions = null,
  clearCount = null,
} = {}) {
  const stats = normaliseAiStats(aiStats);
  const safeHabits = Array.isArray(habits) ? habits : [];
  const rawRecords = Array.isArray(completionHistory) ? [...completionHistory] : [];
  const byId = new Map(safeHabits.filter(h => h?.id).map(h => [h.id, h]));
  const seen = new Set(rawRecords.filter(r => r?.habitId && r?.date).map(r => `${r.habitId}_${r.date}`));

  for (const h of safeHabits) {
    if (!h?.id || !h.completions || typeof h.completions !== 'object') continue;
    for (const [dateKey, done] of Object.entries(h.completions)) {
      if (done && !seen.has(`${h.id}_${dateKey}`)) {
        seen.add(`${h.id}_${dateKey}`);
        rawRecords.push({ habitId: h.id, date: dateKey, status: 'completed' });
      }
    }
  }

  const activeDaySet = new Set();
  const completedKeys = new Set();
  for (const r of rawRecords) {
    const h = byId.get(r?.habitId);
    if (!h || !weekday(r?.date)) continue;
    if (today && r.date > today) continue;
    if (h.createdAt && r.date < h.createdAt) continue;
    if (h.starterHabit && r.updatedAt === r.date + 'T12:00:00.000Z' && r.completedAt === r.updatedAt) continue;
    if (r.status === 'completed') {
      activeDaySet.add(r.date);
      completedKeys.add(`${h.id}_${r.date}`);
    }
  }

  const computedClear = today ? clearedDays(safeHabits, rawRecords, today).length : 0;
  const clearDaysCount = Number.isInteger(clearCount) ? Math.max(0, clearCount) : computedClear;
  const tasksDone = Number.isInteger(tasksCompleted) ? Math.max(0, tasksCompleted) : stats.tasksDone;
  const focusDone = Number.isInteger(focusSessions) ? Math.max(0, focusSessions) : stats.focusDone;

  return {
    clearDays: clearDaysCount,
    activeDays: Math.max(activeDaySet.size, clearDaysCount),
    totalCheckins: Math.max(completedKeys.size, clearDaysCount),
    aiCreated: stats.createdViaAi,
    aiManaged: stats.managedViaAi,
    tasksDone,
    focusDone,
    productivityDone: tasksDone + focusDone,
    highestUnlockedLevel: stats.highestUnlockedLevel,
  };
}

export function buildQuestsForNextLevel(targetLevel, metrics, aiName = AI_DEFAULT_NAME) {
  const safeName = normaliseAiName(aiName);
  if (targetLevel === 2) {
    const q1 = Math.min(1, metrics.aiCreated);
    const q2 = Math.min(3, metrics.totalCheckins);
    const q3 = (metrics.clearDays >= 1 || metrics.productivityDone >= 1) ? 1 : 0;
    return [
      { id: 'q2_ai_create', label: `Create 1 habit with ${safeName}`, current: q1, target: 1, done: q1 >= 1, hint: 'Ask AI: "Create a 10m walk habit"' },
      { id: 'q2_checkins', label: 'Complete 3 habit check-ins', current: q2, target: 3, done: q2 >= 3, hint: 'Tick habits on Dashboard' },
      { id: 'q2_clear_or_prod', label: 'Clear 1 day or finish 1 task/focus', current: q3, target: 1, done: q3 >= 1, hint: 'Finish all today habits or 1 task' },
    ];
  }
  if (targetLevel === 3) {
    const q1 = Math.min(7, metrics.activeDays);
    const q2 = Math.min(3, metrics.clearDays);
    const q3 = (metrics.aiManaged >= 1 || metrics.productivityDone >= 3) ? 1 : 0;
    return [
      { id: 'q3_active_days', label: 'Reach 7 active logged days', current: q1, target: 7, done: q1 >= 7, hint: 'Log at least 1 habit on 7 distinct days' },
      { id: 'q3_clear_days', label: 'Clear 3 full scheduled days', current: q2, target: 3, done: q2 >= 3, hint: 'Complete all scheduled habits for a day' },
      { id: 'q3_manage_or_prod', label: 'Use LVL 2 AI action or 3 tasks/focus', current: q3, target: 1, done: q3 >= 1, hint: 'Edit/delete/tick via AI or log 3 tasks' },
    ];
  }
  if (targetLevel === 4) {
    const q1 = Math.min(14, metrics.activeDays);
    const q2 = Math.min(7, metrics.clearDays);
    const q3Done = metrics.totalCheckins >= 15 && (metrics.productivityDone >= 5 || (metrics.aiCreated + metrics.aiManaged) >= 3);
    const q3Cur = q3Done ? 1 : 0;
    return [
      { id: 'q4_active_days', label: 'Reach 14 active logged days', current: q1, target: 14, done: q1 >= 14, hint: 'Show up on 14 distinct days' },
      { id: 'q4_clear_days', label: 'Clear 7 full scheduled days', current: q2, target: 7, done: q2 >= 7, hint: '7 complete days' },
      { id: 'q4_mastery', label: '15 check-ins + 5 tasks/focus or 3 AI ops', current: q3Cur, target: 1, done: q3Done, hint: 'Build deep consistency across app' },
    ];
  }
  return [];
}

export function aiProgressionForClearDays(clearCount = 0) {
  const safeDays = Number.isInteger(clearCount) && clearCount > 0 ? clearCount : 0;
  let synthStats = { highestUnlockedLevel: 1 };
  if (safeDays >= 14) synthStats = { highestUnlockedLevel: 4, createdViaAi: 2, managedViaAi: 2 };
  else if (safeDays >= 7) synthStats = { highestUnlockedLevel: 3, createdViaAi: 1, managedViaAi: 1 };
  else if (safeDays >= 1) synthStats = { highestUnlockedLevel: 2, createdViaAi: 1 };
  return computeAiProgression({ clearCount: safeDays, aiStats: synthStats });
}

export function computeAiProgression({
  habits = [],
  completionHistory = [],
  today = '',
  clearCount = null,
  aiStats = null,
  tasksCompleted = null,
  focusSessions = null,
  aiName = AI_DEFAULT_NAME,
  aiTone = 'default',
} = {}) {
  const safeName = normaliseAiName(aiName);
  const metrics = measureAiQuestMetrics({
    habits,
    completionHistory,
    today,
    aiStats,
    tasksCompleted,
    focusSessions,
    clearCount,
  });

  const q2 = buildQuestsForNextLevel(2, metrics, safeName);
  const q3 = buildQuestsForNextLevel(3, metrics, safeName);
  const q4 = buildQuestsForNextLevel(4, metrics, safeName);

  let earnedLevel = metrics.highestUnlockedLevel;
  if (q2.every(q => q.done) && earnedLevel < 2) earnedLevel = 2;
  if (earnedLevel >= 2 && q3.every(q => q.done) && earnedLevel < 3) earnedLevel = 3;
  if (earnedLevel >= 3 && q4.every(q => q.done) && earnedLevel < 4) earnedLevel = 4;

  const current = AI_LEVEL_TIERS.find(t => t.level === earnedLevel) || AI_LEVEL_TIERS[0];
  const next = AI_LEVEL_TIERS.find(t => t.level === current.level + 1) || null;
  const activeQuests = next ? buildQuestsForNextLevel(next.level, metrics, safeName) : [];
  const questsDoneCount = activeQuests.filter(q => q.done).length;
  const questsTotalCount = activeQuests.length;
  const progressPct = next && questsTotalCount > 0
    ? Math.round((questsDoneCount / questsTotalCount) * 100)
    : 100;

  return {
    aiName: safeName,
    aiTone: normaliseAiTone(aiTone),
    activeTone: current.level >= 4 ? normaliseAiTone(aiTone) : 'default',
    level: current.level,
    rank: current.rank,
    shortPower: current.shortPower,
    summary: current.summary,
    clearDays: metrics.clearDays,
    activeDays: metrics.activeDays,
    totalCheckins: metrics.totalCheckins,
    aiCreated: metrics.aiCreated,
    aiManaged: metrics.aiManaged,
    productivityDone: metrics.productivityDone,
    nextLevel: next?.level || null,
    nextRank: next?.rank || null,
    nextPower: next?.shortPower || null,
    nextReqLabel: next?.reqLabel || null,
    quests: activeQuests,
    questsDoneCount,
    questsTotalCount,
    progressPct,
    tiers: AI_LEVEL_TIERS.map(t => ({
      ...t,
      unlocked: t.level <= current.level,
      current: t.level === current.level,
    })),
  };
}

export function changeTreasure(raw, id, action, count) {
  const chest = CHESTS.find(c => c.id === id);
  if (!chest) return null;
  const state = parseTreasureState(raw);
  if (action === 'open') {
    if (!Number.isInteger(count) || count < 0) return null;
    const cycle = chestCycle(raw, id, count);
    if (!cycle.ready) return null;
    const nextOpens = { ...state.opens, [id]: (state.opens[id] || 0) + 1 };
    const nextOpened = state.opened.includes(id) ? [...state.opened] : [...state.opened, id];
    const nextResetAt = { ...state.resetAt, [id]: count };
    return { version: 2, opened: nextOpened, opens: nextOpens, resetAt: nextResetAt, equipped: id };
  }
  if (action === 'equip' && state.opened.includes(id) && state.equipped !== id) {
    return {
      version: 2,
      opened: [...state.opened],
      opens: { ...state.opens },
      resetAt: { ...state.resetAt },
      equipped: id,
    };
  }
  return null;
}
