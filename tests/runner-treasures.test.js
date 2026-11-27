import test from 'node:test';
import assert from 'node:assert/strict';
import { clearedDays, changeTreasure, chestCycle, inventory, AI_DEFAULT_NAME, AI_TONES, AI_LEVEL_TIERS, normaliseAiName, normaliseAiTone, computeAiProgression } from '../runner-treasures.js';

const habit = (id, repeat, extra = {}) => ({id, createdAt:'2026-11-01', repeat, ...extra});
const done = (habitId, date, extra = {}) => ({habitId, date, status:'completed', updatedAt:date+'T10:32:11Z', ...extra});
const today = '2026-11-21';

test('one clear per scheduled day, partial days and rest days never count', () => {
  const habits = [habit('walk',['mon','wed','fri']), habit('study',['wed'])];
  const records = ['16','17','18','20','23'].map(n => done('walk','2026-11-'+n));
  assert.deepEqual(clearedDays(habits,records,today), ['2026-11-16','2026-11-20']);
  records.push(done('study','2026-11-18'),done('study','2026-11-18'));
  assert.equal(clearedDays(habits,records,today).length,3);
  records.splice(-2,2,done('study','2026-11-18',{status:'not_completed'}));
  assert.equal(clearedDays(habits,records,today).length,2);
});

test('sample history cannot earn XP; an actually adopted starter can', () => {
  const h = habit('seed',['mon','wed','fri'],{starterHabit:true});
  const stamp = '2026-11-16T12:00:00.000Z';
  const history = [done('seed','2026-11-16',{completedAt:stamp,updatedAt:stamp}), done('seed','2026-11-18')];
  assert.deepEqual(clearedDays([h],history,today),['2026-11-18']);
  assert.deepEqual(clearedDays([h,habit('own',['mon'])],[...history,done('own','2026-11-16')],today),['2026-11-16','2026-11-18']);
});

test('schedule edits preserve earlier weekdays; unknown habits, future and invalid dates do not count', () => {
  const h = habit('a',['fri'],{createdAt:'2026-11-15',scheduleHistory:[
    {from:'2026-11-15',days:['mon']},{from:'2026-11-19',days:['fri']}]});
  const dates = ['2026-11-09','2026-11-16','2026-11-20','2026-11-27','2026-02-31'];
  assert.deepEqual(clearedDays([h],[...dates.map(d=>done('a',d)),done('missing',today)],today),dates.slice(1,3));
  assert.deepEqual(clearedDays([habit('a',[])],[done('a',today)],today),[]);
});

test('tiers require 1/7/14/30 clears; opening auto-equips, remounting and re-equipping never duplicate XP', () => {
  let bag;
  for(const [id,n,xp] of [['wood',1,30],['iron',7,100],['gold',14,240],['ruby',30,500]]) {
    assert.equal(changeTreasure(bag,id,'open',n-1),null);
    bag = changeTreasure(bag,id,'open',n);
    bag = JSON.parse(JSON.stringify(bag));
    assert.equal(inventory(bag).xp,xp); assert.equal(inventory(bag).equipped,id);
    assert.equal(changeTreasure(bag,id,'open',n),null);
  }
  bag = changeTreasure(bag,'wood','equip',0);
  assert.equal(inventory(bag).xp,500); assert.equal(inventory(bag).equipped,'wood');
  assert.equal(changeTreasure({},'gold','equip',99),null);
  assert.deepEqual(inventory({opened:['wood','wood','bogus'],equipped:'gold'}),{opened:['wood'],equipped:null,xp:30});

  // Opening a chest resets its cycle back to closed/locked (0/Xd) and accumulates XP on the next run
  assert.equal(chestCycle(bag, 'ruby', 30).ready, false);
  assert.equal(chestCycle(bag, 'ruby', 30).progress, 0);
  assert.equal(chestCycle(bag, 'ruby', 30).daysLeft, 30);
  // Anti-farming guard: dipping below resetAt and returning to 30 cannot re-open
  assert.equal(chestCycle(bag, 'ruby', 29).ready, false);
  assert.equal(changeTreasure(bag, 'ruby', 'open', 30), null);
  // Spark (1d) opened at count=1 resets at 1; at count=2 it is ready again and awards +30 XP!
  const bag2 = changeTreasure({ version: 2, opened: ['wood'], opens: { wood: 1 }, resetAt: { wood: 1 }, equipped: 'wood' }, 'wood', 'open', 2);
  assert.equal(inventory(bag2).xp, 60);
  assert.equal(chestCycle(bag2, 'wood', 2).ready, false);
  assert.equal(chestCycle(bag2, 'wood', 2).progress, 0);
  assert.equal(chestCycle(bag2, 'wood', 2).daysLeft, 1);
});

test('AI quest progression unlocks LVL 1/2/3/4 cleanly with 7d/14d requirements, tones, and custom names', () => {
  assert.equal(AI_DEFAULT_NAME, 'ARC');
  assert.equal(AI_LEVEL_TIERS.length, 4);
  assert.equal(AI_TONES.length, 4);
  assert.equal(normaliseAiName(''), 'ARC');
  assert.equal(normaliseAiName('  Nova   Bot  '), 'Nova Bot');
  assert.equal(normaliseAiName('  Nova   <Coach>  '), 'Nova Coach');
  assert.equal(normaliseAiName('SuperLongCustomAssistantName'), 'SuperLongCustomA');
  assert.equal(normaliseAiTone('DRILL'), 'drill');
  assert.equal(normaliseAiTone('invalid-tone'), 'default');

  // Fresh start: LVL 1, 0/3 quests done
  const l1 = computeAiProgression({ aiName: 'Nova' });
  assert.equal(l1.level, 1);
  assert.equal(l1.shortPower, 'Make Habits');
  assert.equal(l1.questsDoneCount, 0);
  assert.equal(l1.questsTotalCount, 3);
  assert.equal(l1.progressPct, 0);
  assert.equal(l1.activeTone, 'default');
  assert.match(l1.quests[0].label, /Create 1 habit with Nova/);

  // Clearing 1 day without creating an AI habit keeps LVL 1 (quests partial)
  const partial = computeAiProgression({
    habits: [habit('walk', ['mon'])],
    completionHistory: [done('walk', '2026-11-16')],
    today
  });
  assert.equal(partial.level, 1);
  assert.equal(partial.questsDoneCount, 1);
  assert.equal(partial.progressPct, 33);

  // Completing all 3 LVL 1 quests (1 AI habit + 3 check-ins + 1 clear day/task) unlocks LVL 2
  const l2 = computeAiProgression({
    habits: [habit('walk', ['mon', 'wed', 'fri'])],
    completionHistory: [done('walk', '2026-11-16'), done('walk', '2026-11-18'), done('walk', '2026-11-20')],
    today,
    aiStats: { createdViaAi: 1 }
  });
  assert.equal(l2.level, 2);
  assert.equal(l2.rank, 'Routine Manager');
  assert.equal(l2.shortPower, 'Delete, Edit & Tasks');
  assert.equal(l2.nextLevel, 3);
  assert.equal(l2.tiers.filter(t => t.unlocked).length, 2);

  // LVL 3 requires 7 active days + 3 cleared days + LVL 2 AI use or 3 tasks/focus
  const weekDays = ['2026-11-09','2026-11-11','2026-11-13','2026-11-16','2026-11-18','2026-11-20','2026-11-21'];
  const l3 = computeAiProgression({
    habits: [habit('walk', ['mon', 'wed', 'fri'])],
    completionHistory: weekDays.map(d => done('walk', d)),
    today,
    aiStats: { createdViaAi: 1, managedViaAi: 1 }
  });
  assert.equal(l3.activeDays, 7);
  assert.equal(l3.clearDays >= 3, true);
  assert.equal(l3.level, 3);
  assert.equal(l3.rank, 'Streak Tactician');
  assert.equal(l3.activeTone, 'default');

  // LVL 4 requires 14 active days + 7 cleared days + 15 check-ins + mastery actions, and unlocks tones
  const scheduledMWF = ['02','04','06','09','11','13','16','18','20'].map(n => `2026-11-${n}`);
  const extraActiveDays = ['03','05','07','14','21'].map(n => `2026-11-${n}`);
  const l4 = computeAiProgression({
    habits: [habit('walk', ['mon', 'wed', 'fri']), habit('read', ['mon', 'wed', 'fri'])],
    completionHistory: [
      ...scheduledMWF.map(d => done('walk', d)),
      ...scheduledMWF.map(d => done('read', d)),
      ...extraActiveDays.map(d => done('walk', d)),
    ],
    today: '2026-11-23',
    aiStats: { createdViaAi: 2, managedViaAi: 2 },
    aiTone: 'drill'
  });
  assert.equal(l4.activeDays, 14);
  assert.equal(l4.level, 4);
  assert.equal(l4.rank, 'Routine Architect');
  assert.equal(l4.nextLevel, null);
  assert.equal(l4.progressPct, 100);
  assert.equal(l4.activeTone, 'drill');
  assert.equal(l4.tiers.every(t => t.unlocked), true);
});
