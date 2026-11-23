// Private progression. Standings, preview points and other users are never inputs.
export const CHESTS = Object.freeze([
  { id: 'wood', name: 'Wooden chest', days: 1, xp: 30, power: 'First Clear', description: 'Unlocked on your first cleared day.' },
  { id: 'iron', name: 'Iron chest', days: 7, xp: 70, power: 'Week Strong', description: 'Unlocked after clearing 7 scheduled days.' },
  { id: 'gold', name: 'Gold chest', days: 14, xp: 140, power: 'Fortnight Crown', description: 'Unlocked after clearing 14 scheduled days.' },
  { id: 'ruby', name: 'Dragon chest', days: 30, xp: 260, power: '30-Day Crest', description: 'Unlocked after clearing 30 scheduled days.' },
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

export function inventory(raw) {
  const opened = CHESTS.filter(c => Array.isArray(raw?.opened) && raw.opened.includes(c.id));
  return { opened: opened.map(c => c.id), xp: opened.reduce((sum, c) => sum + c.xp, 0),
    equipped: opened.some(c => c.id === raw?.equipped) ? raw.equipped : null };
}

export const AI_DEFAULT_NAME = 'ARC';

export const AI_LEVEL_TIERS = Object.freeze([
  { level: 1, minDays: 0, rank: 'Habit Builder', shortPower: 'Make Habits', summary: 'Create and add habits directly in chat.' },
  { level: 2, minDays: 1, rank: 'Routine Tuner', shortPower: 'Edit Reminders', summary: 'Update reminders, schedules, and notes directly.' },
  { level: 3, minDays: 7, rank: 'Streak Tactician', shortPower: 'Streak Shield', summary: 'Build low-energy backups and smart backlog rescues.' },
  { level: 4, minDays: 14, rank: 'Routine Architect', shortPower: 'Deep Optimizer', summary: 'Unlock multi-week tuning and deep routine insights.' },
]);

export function normaliseAiName(value) {
  const clean = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 16)
    : '';
  return clean || AI_DEFAULT_NAME;
}

export function aiProgressionForClearDays(clearCount = 0) {
  const safeDays = Number.isInteger(clearCount) && clearCount > 0 ? clearCount : 0;
  let current = AI_LEVEL_TIERS[0];
  for (const tier of AI_LEVEL_TIERS) {
    if (safeDays >= tier.minDays) current = tier;
  }
  const next = AI_LEVEL_TIERS.find(t => t.level === current.level + 1) || null;
  const span = next ? Math.max(1, next.minDays - current.minDays) : 1;
  const progress = next ? Math.min(span, Math.max(0, safeDays - current.minDays)) : span;
  return {
    level: current.level,
    rank: current.rank,
    shortPower: current.shortPower,
    summary: current.summary,
    clearDays: safeDays,
    currentMinDays: current.minDays,
    nextLevel: next?.level || null,
    nextRank: next?.rank || null,
    nextPower: next?.shortPower || null,
    nextMinDays: next?.minDays ?? null,
    remainingDays: next ? Math.max(0, next.minDays - safeDays) : 0,
    progressPct: next ? Math.round((progress / span) * 100) : 100,
    tiers: AI_LEVEL_TIERS.map(t => ({
      ...t,
      unlocked: safeDays >= t.minDays,
      current: t.level === current.level,
    })),
  };
}

export function computeAiProgression({ habits = [], completionHistory = [], today = '', clearCount = null } = {}) {
  const daysCleared = Number.isInteger(clearCount)
    ? Math.max(0, clearCount)
    : (Array.isArray(habits) && Array.isArray(completionHistory) && today
        ? clearedDays(habits, completionHistory, today).length
        : 0);
  return aiProgressionForClearDays(daysCleared);
}

export function changeTreasure(raw, id, action, count) {
  const chest = CHESTS.find(c => c.id === id);
  const { opened, equipped } = inventory(raw);
  if (!chest) return null;
  if (action === 'open' && !opened.includes(id) && Number.isInteger(count) && count >= chest.days) opened.push(id);
  else if (!(action === 'equip' && opened.includes(id) && equipped !== id)) return null;
  return { version: 1, opened, equipped: id };
}
