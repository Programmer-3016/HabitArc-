import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { daySummary, weeklySummary } from '../day-workspace.js';
import { startFocus, pauseFocus, resumeFocus, cancelFocus, getFocusState, minutesOn } from '../focus-store.js';
import { localDay } from '../task-store.js';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const memory=new Map();
globalThis.localStorage={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,value)=>memory.set(key,String(value))
};
globalThis.window={
  HabitArc:{
    getAuthUser:()=>null,
    getHabits:()=>[{id:'h1',name:'Study daily',category:'Learning',icon:'menu_book',createdAt:'2026-11-01',repeat:['sun','mon','tue','wed','thu','fri','sat']}],
    getCompletionHistory:()=>[{habitId:'h1',date:'2026-11-21',status:'completed'}],
    isCompletedOn:(id,date)=>id==='h1'&&date==='2026-11-21'
  },
  dispatchEvent() {}
};

test('Daily workspace combines existing habit completions, tasks, date-tagged notes',()=>{
  const tasks=[
    {id:'t1',title:'Study',dueDate:'2026-11-21',completed:true},
    {id:'t2',title:'Run',dueDate:'2026-11-22',completed:false}
  ];
  const notes=[{id:'n1',title:'Thoughts',date:'2026-11-21'}];
  const day=daySummary('2026-11-21',notes,tasks);
  assert.equal(day.habits.length,1);
  assert.equal(day.habitsDone,1);
  assert.equal(day.tasks.length,1);
  assert.equal(day.tasksDone,1);
  assert.equal(day.notes.length,1);
});

test('Weekly review counts scheduled days without modifying habit/task records',()=>{
  const tasks=[
    {id:'a',dueDate:'2026-11-20',completed:true},
    {id:'b',dueDate:'2026-11-21',completed:false}
  ];
  const report=weeklySummary('2026-11-21',[{date:'2026-11-20'}],tasks);
  assert.equal(report.tasksTotal,2);
  assert.equal(report.tasksDone,1);
  assert.equal(report.habitsTotal,7);
  assert.equal(report.habitsDone,1);
  assert.equal(report.notes,1);
});

test('Focus timer supports pause, resume and cancellation without double-counting',()=>{
  startFocus(15,'task-1');
  assert.ok(getFocusState().active);
  assert.equal(getFocusState().active.minutes,15);
  pauseFocus();
  assert.equal(getFocusState().active.status,'paused');
  resumeFocus();
  assert.equal(getFocusState().active.status,'running');
  cancelFocus();
  assert.equal(getFocusState().active,null);
  assert.equal(minutesOn(localDay()),0);
});

test('Elapsed focus session is recorded once on returning to the app',()=>{
  const key='habitarc_focus_v1:local';
  const started=Date.now()-16*60000;
  memory.set(key,JSON.stringify({active:{
    id:'focus-test',status:'running',minutes:15,startedAt:started,endAt:started+15*60000,taskId:'task-1'
  },sessions:[]}));
  assert.equal(getFocusState().active,null);
  const count=minutesOn(localDay(new Date(started)));
  assert.equal(count,15);
  assert.equal(getFocusState().sessions.length,1);
});

test('Four-tab shell is clean and Calendar workspace lives inside Plan',()=>{
  const html=read('Habits.html');
  const nav=html.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)?.[0]||'';
  assert.equal((nav.match(/class="ha-bottom-nav-link"/g)||[]).length,4);
  assert.match(html,/id="ha-plan-day"/);
  assert.match(html,/data-plan-mode="day"/);
  assert.match(html,/id="ha-focus-clock"/);
  assert.match(read('Notes.html'),/id="note-date"/);
  assert.match(read('Dashboard.html'),/id="ha-day-dashboard-peek"/);
  assert.match(read('sw.js'),/'\/day-workspace\.js'/);
});
