import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthInfo, buildMonthCells } from '../month-calendar.js';
import {
  computeLiveLeagueScore,
  generateSquadCode,
  isValidSquadCode,
  normaliseLeagueHandle,
  normaliseSquadCode,
} from '../league-store.js';
import { rankLeagueEntries } from '../leaderboard.js';
import { executeAdminLeagueAction } from '../api/league.js';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Start Week On setting switches month calendar between Monday-first and Sunday-first', () => {
  // Nov 1, 2026 is a Sunday (getDay() === 0)
  const mondayFirst = monthInfo('2026-11', 'monday');
  const sundayFirst = monthInfo('2026-11', 'sunday');
  assert.equal(mondayFirst.leading, 6);
  assert.equal(sundayFirst.leading, 0);

  const sundayCells = buildMonthCells('2026-11', [], [], [], 'sunday');
  assert.equal(sundayCells.length, 30);
  assert.equal(sundayCells[0]?.date, '2026-11-01');
});

test('Settings, Profile, and Add Habit wire interactive controls without dead placeholders', () => {
  const settings = read('Settings.html');
  assert.match(settings, /id="settings-start-week-btn"/);
  assert.match(settings, /id="settings-default-reminder-btn"/);
  assert.match(settings, /id="settings-privacy-link"\s+href="privacy\.html"/);
  assert.doesNotMatch(settings, /Automatic restore is not available yet/);

  const profile = read('Profile.html');
  assert.match(profile, /id="profile-edit-btn"/);
  assert.match(profile, /id="profile-edit-panel"/);
  assert.match(profile, /id="profile-goal-pill"/);
  assert.doesNotMatch(profile, />Alex Thorne</);

  const addHabit = read('Add_Habit.html');
  assert.match(addHabit, /id="more-icons-btn"/);
  assert.match(addHabit, /id="habit-icon-drawer"/);
  assert.match(addHabit, /id="habit-icon-search"/);
  assert.match(addHabit, /defaultReminderTime/);
});

test('Live League score engine calculates weekly, all-time, clear-day, and chest XP accurately', () => {
  const habits = [
    {
      id: 'h1',
      name: 'Hydrate',
      createdAt: '2026-11-01',
      repeat: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      completions: { '2026-11-10': true, '2026-11-23': true, '2026-11-24': true },
    },
  ];
  const score = computeLiveLeagueScore({
    habits,
    completionHistory: [],
    today: '2026-11-24',
    treasureRoom: { opened: ['wood', 'iron'] }, // 30 + 70 = 100 XP
    streak: 4, // 4 * 5 = 20 weekly bonus
  });
  // Weekly: 2 checks (50) + 2 clear days (80) + streak bonus (20) = 150
  assert.equal(score.weekly, 150);
  // All-time: 3 checks (75) + 3 clear days (150) + chest XP (100) = 325
  assert.equal(score.allTime, 325);
  assert.equal(score.clearDays, 3);
});

test('League handles, squad invite codes, and live ranking sort deterministically', () => {
  assert.equal(normaliseLeagueHandle('  sarthak@example.com  '), 'sarthak');
  const code = generateSquadCode(() => 0.25);
  assert.equal(code.length, 6);
  assert.equal(isValidSquadCode(code), true);
  assert.equal(normaliseSquadCode('ab-c 1234'), 'ABC123');

  const ranked = rankLeagueEntries([
    { uid: 'u1', name: 'Aarav', tone: 2, weekly: 220, allTime: 900, streak: 3 },
    { uid: 'u2', name: 'Sarthak', tone: 4, weekly: 380, allTime: 1850, streak: 9 },
    { uid: 'u3', name: 'Riya', tone: 1, weekly: 380, allTime: 1400, streak: 5 },
  ], 'weekly', 'u2');

  assert.equal(ranked[0].uid, 'u2');
  assert.equal(ranked[0].self, true);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].tier, 'Gold Arc');
  assert.equal(ranked[1].uid, 'u3');
  assert.equal(ranked[2].uid, 'u1');
});

test('Serverless League action handler supports create-squad, join-squad, sync, and leave-league', async () => {
  const collections = { leagueMembers: new Map(), leagueRooms: new Map() };
  const FieldValue = {
    serverTimestamp: () => 'SERVER_TS',
    arrayUnion: (...vals) => ({ __op: 'union', vals }),
    arrayRemove: (...vals) => ({ __op: 'remove', vals }),
  };

  function makeCollection(name) {
    const store = collections[name];
    return {
      doc(id) {
        return {
          id,
          async get() {
            return { exists: store.has(id), id, data: () => store.get(id) };
          },
          async set(payload, opts = {}) {
            const prev = opts.merge && store.has(id) ? { ...store.get(id) } : {};
            const next = { ...prev };
            for (const [k, v] of Object.entries(payload)) {
              if (v && v.__op === 'union') {
                next[k] = Array.from(new Set([...(Array.isArray(prev[k]) ? prev[k] : []), ...v.vals]));
              } else if (v && v.__op === 'remove') {
                next[k] = (Array.isArray(prev[k]) ? prev[k] : []).filter((x) => !v.vals.includes(x));
              } else {
                next[k] = v;
              }
            }
            store.set(id, next);
          },
          async delete() {
            store.delete(id);
          },
        };
      },
      orderBy(field) {
        return {
          limit(n) {
            return {
              async get() {
                const docs = Array.from(store.entries())
                  .sort((a, b) => (b[1][field] || 0) - (a[1][field] || 0))
                  .slice(0, n)
                  .map(([id, val]) => ({ id, data: () => val }));
                return { docs };
              },
            };
          },
        };
      },
    };
  }

  const db = { collection: makeCollection };

  // User 1 creates a squad
  const created = await executeAdminLeagueAction({
    db,
    FieldValue,
    uid: 'user-1',
    action: 'create-squad',
    body: { squadName: 'Night Coders', member: { name: 'Sarthak', tone: 3, weekly: 420, allTime: 2100, streak: 8, clearDays: 6 } },
  });
  assert.ok(isValidSquadCode(created.squad?.code));
  const code = created.squad.code;
  assert.equal(created.squad.name, 'Night Coders');
  assert.equal(created.squadMembers.length, 1);

  // User 2 joins with the 6-character invite code
  const joined = await executeAdminLeagueAction({
    db,
    FieldValue,
    uid: 'user-2',
    action: 'join-squad',
    body: { code, member: { name: 'Riya', tone: 5, weekly: 390, allTime: 1950, streak: 6, clearDays: 5 } },
  });
  assert.equal(joined.squad?.code, code);
  assert.equal(joined.squadMembers.length, 2);
  assert.equal(joined.globalMembers.length, 2);

  // User 2 leaves the league completely
  await executeAdminLeagueAction({
    db,
    FieldValue,
    uid: 'user-2',
    action: 'leave-league',
    body: {},
  });
  assert.equal(collections.leagueMembers.has('user-2'), false);
  assert.deepEqual(collections.leagueRooms.get(code).memberUids, ['user-1']);

  // Verify PWA shell caches league-store.js and Firestore rules validate league collections
  assert.match(read('sw.js'), /'\/league-store\.js'/);
  assert.match(read('firestore.rules'), /match \/leagueMembers\/\{userId\}/);
  assert.match(read('firestore.rules'), /match \/leagueRooms\/\{roomCode\}/);
  assert.match(read('Leaderboard.html'), /id="league-hub"/);
});
