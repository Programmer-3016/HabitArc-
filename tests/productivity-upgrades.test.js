import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {monthInfo,addMonths,buildMonthCells} from '../month-calendar.js';
import {analyzeConsistency} from '../consistency-shield.js';
import {validateArchive} from '../data-restore.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const DAY='2026-11-21';
const archive=()=>({
 type:'habitarc-personal-archive',version:1,owner:'u1',exportedAt:'2026-11-21T07:00:00Z',
 habits:{habits:[{id:'h1',name:'Read',repeat:['sun','mon','tue','wed','thu','fri','sat']}],completionHistory:{}},
 tasks:[{id:'t1',title:'Plan course',dueDate:DAY}],
 notes:[{id:'n1',title:'Lecture',body:'Notes',owner:'u1',photo:null,audio:null}],
 focus:{active:null,sessions:[{id:'f1',date:DAY,minutes:25}]}
});

test('Owner-locked backup must match archive schema and reject duplicate records',()=>{
 const good=archive();
 assert.equal(validateArchive(good,'u1'),good);
 assert.throws(()=>validateArchive(good,'u2'),/different account/);
 assert.throws(()=>validateArchive({...good,type:'unknown'},'u1'),/not a supported/i);
 good.tasks.push({...good.tasks[0]});
 assert.throws(()=>validateArchive(good,'u1'),/repeated record IDs/);
});

test('Backup validates media type and size before writing',()=>{
 const good=archive();
 good.notes[0].photo={mimeType:'application/x-sh',base64:'AA=='};
 assert.throws(()=>validateArchive(good,'u1'),/unsupported or oversized photo/);
 good.notes[0].photo={mimeType:'image/png',base64:'AA=='};
 assert.doesNotThrow(()=>validateArchive(good,'u1'));
});

test('Month calendar builds Monday-first cells with real due-day counts',()=>{
 const info=monthInfo('2026-11');
 assert.equal(info.count,30);
 assert.equal(info.leading,6);
 assert.equal(addMonths('2026-11',1),'2026-12');
 const habits=[{id:'h1',name:'Read',createdAt:'2026-11-01',repeat:['sun','mon','tue','wed','thu','fri','sat']}];
 const cells=buildMonthCells('2026-11',
   [{id:'t1',dueDate:DAY,completed:true},{id:'t2',dueDate:DAY,completed:false}],
   habits,[{habitId:'h1',date:DAY,status:'completed'}]);
 assert.equal(cells.length,36);
 const target=cells.find(c=>c?.date===DAY);
 assert.equal(target.taskCount,2);
 assert.equal(target.tasksDone,1);
 assert.equal(target.habitCount,1);
 assert.equal(target.habitsDone,1);
});

test('Consistency Shield only warns on genuine missed scheduled days',()=>{
 const habit={id:'h1',name:'Reading',createdAt:'2026-10-01',repeat:['sun','mon','tue','wed','thu','fri','sat']};
 const risk=analyzeConsistency([habit],[],DAY);
 assert.equal(risk.length,1);
 assert.equal(risk[0].recentMisses,3);
 assert.equal(risk[0].rate,0);
 const completed=Array.from({length:14},(_,i)=>{
   const date=new Date('2026-11-21T12:00:00');date.setDate(date.getDate()-(i+1));
   const stamp=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
   return {habitId:'h1',date:stamp,status:'completed'};
 });
 assert.equal(analyzeConsistency([habit],completed,DAY).length,0);
});

test('New features stay within existing 5-tab PWA; private drafts never use URL text',()=>{
 const html=source('Habits.html'),arc=source('Arc_AI.html'),settings=source('Settings.html');
 const nav=html.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)?.[0]||'';
 assert.equal((nav.match(/class="ha-bottom-nav-link"/g)||[]).length,5);
 assert.match(html,/id="ha-month-calendar"/);
 assert.match(source('Insights.html'),/id="ha-shield"/);
 assert.match(settings,/id="restore-backup-file"/);
 assert.match(settings,/id="restore-backup-apply"/);
 assert.match(settings,/id="toggle-task-alerts"/);
 assert.match(settings,/id="toggle-morning-plan"/);
 assert.match(settings,/id="ha-device-check"/);
 assert.match(source('productivity-hub.js'),/sessionStorage\.setItem\(CAPTURE\+uid/);
 assert.match(source('notes-studio.js'),/habitarc_command_capture:/);
 assert.match(source('Add_Habit.html'),/habitarc_command_capture:/);
 assert.match(source('app-ui.js'),/HabitArcCommandHub\?\.mount/);
 for(const file of ['data-restore.js','productivity-hub.js','month-calendar.js','consistency-shield.js','device-readiness.js','privacy.html'])
   assert.ok(source('sw.js').includes("'/" +file+"'"),file+' must be cached for offline PWA');
});

test('Task digest explicitly uses running-only notifications, not background push promises',()=>{
 const app=source('app.js'),settings=source('Settings.html');
 assert.match(app,/taskAlerts: Boolean\(settings\.taskAlerts\)/);
 assert.match(app,/morningPlan: Boolean\(settings\.morningPlan\)/);
 assert.match(app,/task-digest-/);
 assert.match(app,/daily-plan-/);
 assert.match(settings,/while HabitArc is open/);
 assert.match(source('ANDROID_BETA_READINESS.md'),/NOT a Play Store-ready Android package/);
});
