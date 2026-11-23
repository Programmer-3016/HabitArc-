import test from 'node:test';
import assert from 'node:assert/strict';
import { clearedDays, changeTreasure, inventory, AI_DEFAULT_NAME, AI_LEVEL_TIERS, normaliseAiName, computeAiProgression } from '../runner-treasures.js';

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
});

test('AI progression unlocks LVL 1/2/3/4 at 0/1/7/14 clear days and sanitizes custom AI names', () => {
  assert.equal(AI_DEFAULT_NAME, 'ARC');
  assert.equal(AI_LEVEL_TIERS.length, 4);
  assert.equal(normaliseAiName(''), 'ARC');
  assert.equal(normaliseAiName('  Nova   Bot  '), 'Nova Bot');
  assert.equal(normaliseAiName('  Nova   <Coach>  '), 'Nova Coach');
  assert.equal(normaliseAiName('SuperLongCustomAssistantName'), 'SuperLongCustomA');

  const l1 = computeAiProgression({ clearCount: 0 });
  assert.equal(l1.level, 1);
  assert.equal(l1.shortPower, 'Make Habits');
  assert.equal(l1.nextLevel, 2);
  assert.equal(l1.remainingDays, 1);
  assert.equal(l1.tiers.filter(t => t.unlocked).length, 1);

  const l2 = computeAiProgression({ clearCount: 1 });
  assert.equal(l2.level, 2);
  assert.equal(l2.nextLevel, 3);
  assert.equal(l2.remainingDays, 6);
  assert.equal(l2.tiers.filter(t => t.unlocked).length, 2);

  const l3 = computeAiProgression({ clearCount: 7 });
  assert.equal(l3.level, 3);
  assert.equal(l3.nextLevel, 4);
  assert.equal(l3.remainingDays, 7);

  const l4 = computeAiProgression({ clearCount: 14 });
  assert.equal(l4.level, 4);
  assert.equal(l4.nextLevel, null);
  assert.equal(l4.remainingDays, 0);
  assert.equal(l4.progressPct, 100);
  assert.equal(l4.tiers.every(t => t.unlocked), true);

  const fromHabits = computeAiProgression({
    habits: [habit('walk', ['mon', 'wed', 'fri'])],
    completionHistory: [done('walk', '2026-11-16'), done('walk', '2026-11-18')],
    today
  });
  assert.equal(fromHabits.clearDays, 2);
  assert.equal(fromHabits.level, 2);
});
