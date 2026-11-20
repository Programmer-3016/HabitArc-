import test from 'node:test';
import assert from 'node:assert/strict';
import {standings} from '../leaderboard.js';
test('periods use the same demo roster but independently rank points',()=>{
  const weekly=standings('weekly'),all=standings('allTime');
  assert.deepEqual(weekly.map(r=>r.name).sort(),all.map(r=>r.name).sort());
  for(const rows of [weekly,all]){
    assert.ok(rows.every((r,i)=>r.rank===i+1&&(!i||r.points<=rows[i-1].points)));
    assert.equal(rows.filter(r=>r.self).length,1);
  }
  assert.equal(weekly.find(r=>r.self).rank,4);
  assert.equal(all.find(r=>r.self).rank,5);
  assert.notEqual(weekly[1].name,all[1].name);
  assert.deepEqual(standings('weekly'),weekly);
});
