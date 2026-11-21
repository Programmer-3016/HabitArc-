import test from 'node:test';
import assert from 'node:assert/strict';
import { clearedDays, changeTreasure, inventory, leagueRunner } from '../runner-treasures.js';

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

test('tiers require 1/7/14 clears; opening auto-equips, remounting and re-equipping never duplicate XP', () => {
  let bag;
  for(const [id,n,xp] of [['wood',1,30],['iron',7,100],['gold',14,240]]) {
    assert.equal(changeTreasure(bag,id,'open',n-1,'astro'),null);
    bag = changeTreasure(bag,id,'open',n,'astro');
    bag = JSON.parse(JSON.stringify(bag));
    assert.equal(inventory(bag).xp,xp); assert.equal(inventory(bag).equipped,id);
    assert.equal(changeTreasure(bag,id,'open',n,'astro'),null);
  }
  bag = changeTreasure(bag,'wood','equip',0,'astro');
  assert.equal(inventory(bag).xp,240); assert.equal(inventory(bag).equipped,'wood');
  assert.equal(changeTreasure({},'gold','equip',99,'astro'),null);
  assert.deepEqual(inventory({opened:['wood','wood','bogus'],equipped:'gold'}),{opened:['wood'],equipped:null,xp:30});
});

test('onboarding companion is stable; existing accounts recover their runner from saved preferences', () => {
  assert.equal(leagueRunner({leagueCompanion:'ninja',companion:'astro'}),'ninja');
  assert.equal(leagueRunner({treasureRoom:{runnerId:'astro'},companion:'specops'}),'astro');
  assert.equal(leagueRunner({companion:'specops'}),'specops');
  assert.equal(leagueRunner({companion:'unknown'}),'arcy');
});
