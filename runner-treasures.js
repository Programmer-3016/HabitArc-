// Private progression. Standings, preview points and other users are never inputs.
export const CHESTS = Object.freeze([
  { id: 'wood', name: 'Wooden chest', days: 1, xp: 30, power: 'Ember Trail', description: 'A trail of amber pixels follows your runner.' },
  { id: 'iron', name: 'Iron chest', days: 7, xp: 70, power: 'Orbit Shield', description: 'A ring of ice-blue pixels surrounds your runner.' },
  { id: 'gold', name: 'Gold chest', days: 14, xp: 140, power: 'Star Crown', description: 'Gold stars hover above your runner.' },
  { id: 'ruby', name: 'Dragon chest', days: 30, xp: 260, power: 'Phoenix Wings', description: 'Blazing crimson-gold wings flare behind your runner.' },
]);
const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const heroes = ['arcy', 'ninja', 'specops', 'astro'];

export function leagueRunner(settings = {}) {
  return [settings.leagueCompanion, settings.treasureRoom?.runnerId, settings.companion].find(id => heroes.includes(id)) || 'arcy';
}

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

export function changeTreasure(raw, id, action, count, runnerId) {
  const chest = CHESTS.find(c => c.id === id);
  const { opened, equipped } = inventory(raw);
  if (!chest || !heroes.includes(runnerId)) return null;
  if (action === 'open' && !opened.includes(id) && Number.isInteger(count) && count >= chest.days) opened.push(id);
  else if (!(action === 'equip' && opened.includes(id) && equipped !== id)) return null;
  return { version: 1, runnerId, opened, equipped: id };
}
