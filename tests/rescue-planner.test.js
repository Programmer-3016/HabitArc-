import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRescuePlan, prepareRescueEdits } from '../rescue-planner.js';

const read = file => readFileSync(new URL('../'+file, import.meta.url),'utf8');
const DAY = '2026-11-21';
const task = (id, dueDate, priority='none', fields={}) => ({
  id, title:'Task '+id, dueDate, priority, completed:false,
  createdAt:'2026-11-17T08:00:00Z',updatedAt:'2026-11-20T18:00:00Z',
  subtasks:[],...fields
});
const dataset = () => [
  task('high-overdue','2026-11-18','high'),
  task('high-today','2026-11-21','high'),
  task('medium-overdue','2026-11-19','medium'),
  task('low-today','2026-11-21','low'),
  task('scheduled-22','2026-11-22','medium'),
  task('scheduled-22b','2026-11-22','high'),
  task('no-date','','high'),
  task('completed','2026-11-19','high',{completed:true})
];

test('Rescue prioritizes genuine backlog without disturbing future/undated/completed work',()=>{
  const original=dataset();
  const json=JSON.stringify(original);
  const plan=buildRescuePlan(original,{today:DAY,dailyCap:2});
  assert.equal(plan.overdueCount,2);
  assert.equal(plan.undatedCount,1);
  assert.equal(plan.backlogCount,4);
  assert.deepEqual(plan.focus.map(s=>s.taskId),['high-overdue','high-today']);
  assert.equal(plan.changes.find(s=>s.taskId==='high-overdue').proposedDate,DAY);
  assert.equal(plan.changes.find(s=>s.taskId==='medium-overdue').proposedDate,'2026-11-23');
  assert.equal(plan.changes.find(s=>s.taskId==='low-today').proposedDate,'2026-11-23');
  assert.equal(plan.suggestions.some(s=>s.taskId==='scheduled-22'),false);
  assert.equal(plan.suggestions.some(s=>s.taskId==='no-date'),false);
  assert.equal(plan.suggestions.some(s=>s.taskId==='completed'),false);
  assert.equal(JSON.stringify(original),json,'Preview must not modify task records');
});

test('Proposed changes are safe, user-selected and can edit their destination',()=>{
  const data=dataset();
  const plan=buildRescuePlan(data,{today:DAY,dailyCap:2});
  const original=JSON.stringify(data);
  const only=['high-overdue','low-today'];
  const preview=prepareRescueEdits(plan,data,only,{'low-today':'2026-11-26'});
  assert.equal(preview.skipped.length,0);
  assert.equal(preview.changes.length,2);
  assert.deepEqual(preview.changes.map(c=>c.to),['2026-11-21','2026-11-26']);
  assert.equal(JSON.stringify(data),original,'Prepared changes must not be persisted automatically');
  assert.equal(preview.changes[0].task.id,'high-overdue');
  assert.equal(preview.changes[0].task.dueDate,DAY);
});

test('Stale preview, completed task or invalid/past destination is not applied',()=>{
  const data=dataset();
  const plan=buildRescuePlan(data,{today:DAY,dailyCap:2});
  data[0].updatedAt='2026-11-21T09:00:00Z';
  data[2].completed=true;
  const selected=['high-overdue','medium-overdue','low-today'];
  const prepared=prepareRescueEdits(plan,data,selected,{'low-today':'2026-11-17'});
  assert.equal(prepared.changes.length,0);
  assert.equal(prepared.skipped.length,3);
});

test('Recovery respects small daily capacity, horizon and leaves excess tasks untouched',()=>{
  const tasks = [
    task('first','2026-11-18','high'),
    task('second','2026-11-20','medium'),
    ...Array.from({length:9},(_,i)=>task('future-'+i,'2026-11-'+String(22+Math.floor(i/2)).padStart(2,'0'),'low'))
  ];
  const plan=buildRescuePlan(tasks,{today:DAY,dailyCap:1,horizonDays:7});
  assert.equal(plan.focus.length,1);
  const forward=plan.changes.filter(s=>s.proposedDate>DAY);
  assert.equal(forward.length,1);
  assert.ok(forward[0].proposedDate >= '2026-11-26');
});

test('ARC shortcut and Tasks deep link preserve the same five-tab dock',()=>{
  const habits=read('Habits.html');
  const arc=read('Arc_AI.html');
  const app=read('app-ui.js');
  const nav=habits.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)?.[0]||'';
  assert.equal((nav.match(/class="ha-bottom-nav-link"/g)||[]).length,5);
  assert.match(habits,/id="ha-rescue-dialog"/);
  assert.match(habits,/id="ha-rescue-apply"/);
  assert.match(arc,/Habits\.html\?section=tasks&amp;rescue=1/);
  assert.match(arc,/rescuePrompt\.slice\(0, 600\)/);
  assert.match(arc,/No task details have been sent/);
  assert.match(read('rescue-mode.js'),/sessionStorage\.setItem\('habitarc_arc_rescue_prompt'/);
  assert.match(arc,/sessionStorage\.removeItem\('habitarc_arc_rescue_prompt'/);
  assert.doesNotMatch(read('rescue-mode.js'),/encodeURIComponent\(prompt\)/);
  assert.match(app,/ensureRescueStyles/);
  assert.match(read('sw.js'),/'\/rescue-planner\.js'/);
  assert.match(read('sw.js'),/'\/rescue-mode\.js'/);
});

test('Apply flow requires confirmation and rejects changed account/tasks',()=>{
  const ui=read('rescue-mode.js');
  assert.match(ui,/window\.confirm\(/);
  assert.match(ui,/taskStore\.getStatus\(\)\.owner !== planOwner/);
  assert.match(ui,/prepareRescueEdits\(plan, taskStore\.getTasks\(\), checked, overrides\)/);
  assert.match(ui,/taskStore\.put\(operation\.task\)/);
  assert.match(ui,/if \(!ok\) return/);
});
