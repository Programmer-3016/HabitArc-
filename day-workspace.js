/* Day workspace composes existing account-scoped Habits, Tasks and browser Notes. */
import { taskStore, localDay, updateTask } from './task-store.js';
import { getFocusState, startFocus, pauseFocus, resumeFocus, cancelFocus, minutesOn, startFocusCloudSync, getFocusSyncStatus } from './focus-store.js';
import { buildMonthCells, addMonths } from './month-calendar.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=(selector,root=document)=>root.querySelector(selector);
const codes=['sun','mon','tue','wed','thu','fri','sat'];
const validDay=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&localDay(new Date(date+'T12:00:00'))===date;
const shifted=(date,days)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+days);return localDay(d);};
const dayCode=date=>codes[new Date(date+'T12:00:00').getDay()];
const dayLabel=date=>new Date(date+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',weekday:'short'});
const selectedKey='habitarc:workspace-date';
const getSavedDate=()=>{try {const d=sessionStorage.getItem(selectedKey);return validDay(d)?d:localDay();}catch{return localDay();}};
const saveDate=date=>{try{sessionStorage.setItem(selectedKey,date);}catch{}};
const getOwner=()=>taskStore.getStatus().owner;
let active=null,activeDashboard=null;
let notesCache={owner:'',timestamp:0,notes:[]};

function scheduledHabits(date,history=null) {
 const app=window.HabitArc;
 const recordSet=history||new Set((app?.getCompletionHistory?.()||[]).filter(r=>r.status==='completed').map(r=>r.habitId+'|'+r.date));
 return (app?.getHabits?.()||[])
   .filter(h=>(!h.createdAt||h.createdAt<=date)&&(!h.repeat||h.repeat.includes(dayCode(date))))
   .map(h=>({
     id:h.id,title:h.name||'Habit',category:h.category||'',icon:h.icon||'check_circle',
     reminder:h.reminder||h.reminderTime||'',
     done:Boolean(app.isCompletedOn?.(h.id,date)||recordSet.has(h.id+'|'+date))
   }));
}
function noteDate(note) {
 if(validDay(note.date))return note.date;
 return localDay(new Date(note.createdAt||Date.now()));
}
async function readNotes(force=false) {
 const current=getOwner();
 if(!force&&notesCache.owner===current&&Date.now()-notesCache.timestamp<15000)return notesCache.notes;
 if(typeof indexedDB==='undefined')return [];
 try{
  const db=await new Promise((resolve,reject)=>{
   const request=indexedDB.open('habitarc-notes-studio',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('notes'))request.result.createObjectStore('notes',{keyPath:'id'});};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
  const all=await new Promise((resolve,reject)=>{
    const req=db.transaction('notes','readonly').objectStore('notes').getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
  db.close();
  const notes=all.filter(n=>n.owner===current).map(n=>({
    id:String(n.id),title:String(n.title||'Untitled note'),date:noteDate(n),
    type:n.audio?'audio':n.photo?'photo':'text'
  }));
  notesCache={owner:current,timestamp:Date.now(),notes};
  return notes;
 }catch{return [];}
}
export function daySummary(date,notes=[],tasks=taskStore.getTasks()) {
 const habits=scheduledHabits(date);
 const scheduled=tasks.filter(t=>t.dueDate===date);
 return {date,habits,tasks:scheduled,notes:notes.filter(n=>n.date===date),
  habitsDone:habits.filter(h=>h.done).length,tasksDone:scheduled.filter(t=>t.completed).length,
  focus:minutesOn(date)};
}
export function weeklySummary(end,notes=[],tasks=taskStore.getTasks()) {
 const begin=shifted(end,-6);
 const history=new Set((window.HabitArc?.getCompletionHistory?.()||[]).filter(r=>r.status==='completed').map(r=>r.habitId+'|'+r.date));
 let habitsTotal=0,habitsDone=0,tasksTotal=0,tasksDone=0,focus=0;
 for(let n=0;n<7;n++){
   const date=shifted(begin,n);
   const habits=scheduledHabits(date,history);
   habitsTotal+=habits.length;habitsDone+=habits.filter(h=>h.done).length;
   const due=tasks.filter(t=>t.dueDate===date);
   tasksTotal+=due.length;tasksDone+=due.filter(t=>t.completed).length;
   focus+=minutesOn(date);
 }
 return {begin,end,habitsTotal,habitsDone,tasksTotal,tasksDone,focus,notes:notes.filter(n=>n.date>=begin&&n.date<=end).length};
}
const count=(done,total)=>String(done)+' / '+String(total);
function section(title,icon,body,empty,action) {
 return '<section class="ha-day-section"><header><h3><span class="material-symbols-outlined" aria-hidden="true">'+icon+'</span>'+title+'</h3>'+action+'</header><div class="ha-day-section-body">'+(body||'<p class="ha-day-empty">'+empty+'</p>')+'</div></section>';
}
function habitRow(h,date) {
 const actionable=date===localDay();
 return '<div class="ha-day-item'+(h.done?' is-done-pill':'')+'"><span class="material-symbols-outlined ha-day-item-icon" aria-hidden="true">'+esc(h.icon)+'</span><div class="ha-day-item-copy"><strong'+(h.done?' class="ha-day-done"':'')+'>'+esc(h.title)+'</strong><small>'+esc(h.category||'Daily habit')+'</small></div><span class="ha-day-pill-tag is-habit">'+(h.done?'DONE ✓':'HABIT')+'</span>'+
  (actionable?'<button type="button" data-day-action="habit" data-id="'+esc(h.id)+'" aria-label="'+(h.done?'Uncomplete ':'Complete ')+esc(h.title)+'" aria-pressed="'+h.done+'"><span class="material-symbols-outlined">'+(h.done?'check_circle':'radio_button_unchecked')+'</span></button>'
  :'<span class="material-symbols-outlined" aria-label="'+(h.done?'Completed':'Incomplete')+'">'+(h.done?'check_circle':'radio_button_unchecked')+'</span>')+'</div>';
}
function taskRow(t) {
 return '<div class="ha-day-item'+(t.completed?' is-done-pill':'')+'"><button type="button" data-day-action="task" data-id="'+esc(t.id)+'" aria-label="'+(t.completed?'Reopen ':'Complete ')+esc(t.title)+'" aria-pressed="'+t.completed+'"><span class="material-symbols-outlined">'+(t.completed?'check_circle':'radio_button_unchecked')+'</span></button><div class="ha-day-item-copy"><strong'+(t.completed?' class="ha-day-done"':'')+'>'+esc(t.title)+'</strong><small>'+esc(t.priority==='none'?'Task':t.priority+' priority')+(t.subtasks.length?' · '+t.subtasks.filter(s=>s.completed).length+'/'+t.subtasks.length+' steps':'')+'</small></div><span class="ha-day-pill-tag is-task">'+(t.completed?'DONE ✓':'TASK')+'</span><a href="Habits.html?section=tasks" aria-label="Open Tasks"><span class="material-symbols-outlined">chevron_right</span></a></div>';
}
function noteRow(n) {
 return '<a class="ha-day-item" href="Notes.html?note='+encodeURIComponent(n.id)+'"><span class="material-symbols-outlined ha-day-item-icon" aria-hidden="true">'+(n.type==='audio'?'mic':n.type==='photo'?'image':'description')+'</span><div class="ha-day-item-copy"><strong>'+esc(n.title)+'</strong><small>'+esc(n.type)+' note</small></div><span class="material-symbols-outlined">chevron_right</span></a>';
}
const checkSvg='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';
function unifiedChecklistCard(day,chosen) {
 const isToday=chosen===localDay();
 const dObj=new Date(chosen+'T12:00:00');
 const shortMD=dObj.toLocaleDateString('en-US',{month:'short',day:'numeric'}).toUpperCase();
 const headLeft=(isToday?'TODAY · ':'')+shortMD;
 const prioRank={high:0,medium:1,low:2,none:3};
 const items=[
   ...day.tasks.map(t=>({kind:'task',done:Boolean(t.completed),rank:prioRank[t.priority]??3,t})),
   ...day.habits.map(h=>({kind:'habit',done:Boolean(h.done),rank:2,h}))
 ].sort((a,b)=>Number(a.done)-Number(b.done)||(a.rank-b.rank));
 const leftCount=items.filter(x=>!x.done).length;
 const headRight=items.length?(leftCount?leftCount+' LEFT':'ALL DONE ✓'):'0 SCHEDULED';
 if(!items.length){
   return '<div class="ha-day-v1-card-head"><span>'+esc(headLeft)+'</span><span>0 LEFT</span></div>'+
     '<div class="ha-day-v1-empty"><p>Nothing scheduled for this day yet.</p><div class="ha-day-v1-empty-links"><a href="Add_Habit.html">+ Add habit</a><a href="Habits.html?section=tasks&new=1&date='+encodeURIComponent(chosen)+'">+ Add task</a></div></div>';
 }
 const rows=items.map(entry=>{
   if(entry.kind==='task'){
     const t=entry.t,done=Boolean(t.completed);
     const isHigh=!done&&t.priority==='high';
     const sub=done?'Completed · Task'
       :(t.priority==='high'?'HIGH · ':(t.priority!=='none'?t.priority.toUpperCase()+' · ':''))+(isToday?'Task due today':'Scheduled task')+(t.subtasks.length?' · '+t.subtasks.filter(s=>s.completed).length+'/'+t.subtasks.length+' steps':'');
     return '<div class="ha-day-v1-row'+(done?' is-done':'')+'">'+
       '<button type="button" class="ha-day-v1-box'+(done?' is-checked':'')+'" data-day-action="task" data-id="'+esc(t.id)+'" aria-label="'+(done?'Reopen ':'Complete ')+esc(t.title)+'" aria-pressed="'+done+'">'+(done?checkSvg:'')+'</button>'+
       '<div class="ha-day-v1-copy"><strong'+(done?' class="ha-day-done"':'')+'>'+esc(t.title)+'</strong><small'+(isHigh?' class="is-urgent"':'')+'>'+esc(sub)+'</small></div>'+
     '</div>';
   }
   const h=entry.h,done=Boolean(h.done);
   const sub=done?'Completed · Daily Habit':(h.reminder?esc(h.reminder)+' · ':'')+esc(h.category||'Daily')+' Habit';
   const box=isToday
     ?'<button type="button" class="ha-day-v1-box'+(done?' is-checked':'')+'" data-day-action="habit" data-id="'+esc(h.id)+'" aria-label="'+(done?'Uncomplete ':'Complete ')+esc(h.title)+'" aria-pressed="'+done+'">'+(done?checkSvg:'')+'</button>'
     :'<span class="ha-day-v1-box'+(done?' is-checked':'')+'" aria-label="'+(done?'Completed':'Incomplete')+'">'+(done?checkSvg:'')+'</span>';
   return '<div class="ha-day-v1-row'+(done?' is-done':'')+'">'+box+
     '<a class="ha-day-v1-copy" href="Habit_Detail.html?id='+encodeURIComponent(String(h.id||''))+'"><strong'+(done?' class="ha-day-done"':'')+'>'+esc(h.title)+'</strong><small>'+sub+'</small></a>'+
   '</div>';
 }).join('');
 return '<div class="ha-day-v1-card-head"><span>'+esc(headLeft)+'</span><span>'+esc(headRight)+'</span></div><div class="ha-day-v1-rows">'+rows+'</div>';
}
function renderFocus(root,fallbackTitle='') {
 const state=getFocusState(),a=state.active;
 const select=$('#ha-focus-length',root),task=$('#ha-focus-task',root);
 const seconds=a?.remainingSeconds??Number(select.value)*60;
 const clockStr=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 $('#ha-focus-clock',root).textContent=clockStr;
 const fk=$('#ha-day-v1-focus-kicker',root),ft=$('#ha-day-v1-focus-title',root),fb=$('#ha-day-v1-focus-btn',root);
 if(fk&&ft&&fb){
   if(a){
     fk.textContent=(a.status==='running'?'FOCUS RUNNING · ':'FOCUS PAUSED · ')+clockStr;
     fb.textContent=a.status==='running'?'Pause ❚❚':'Resume ▶';
   }else{
     fk.textContent='FOCUS TIMER · '+(select?.value||'25')+'M';
     fb.textContent='Start ▶';
   }
   if(fallbackTitle)ft.textContent=fallbackTitle;
 }
 for(const action of ['start-focus','pause-focus','resume-focus','reset-focus']) {
   const el=root.querySelector('[data-day-action="'+action+'"]');
   el.hidden=action==='start-focus'?Boolean(a):action==='pause-focus'?(!a||a.status!=='running'):action==='resume-focus'?(!a||a.status!=='paused'):!a;
 }
 select.disabled=Boolean(a);task.disabled=Boolean(a);
 const sync=getFocusSyncStatus();
 $('#ha-focus-message',root).textContent=(a?(a.status==='running'?'Focus running · stays active across tabs.':'Paused · resume when ready.'):'Only finished sessions count towards your review.')
  +' · '+sync.message;
}
export function mountDay(root=document.getElementById('ha-plan-day')) {
 if(!root||!root.isConnected)return;
 if(active?.root===root){active.render();return;}
 unmountDay();
 const controller=new AbortController(),signal=controller.signal;
 let live=true,chosen=getSavedDate(),notes=[],token=0,lastTaskOpts='';
 let calendarMonth=chosen.slice(0,7);
 const dateInput=$('#ha-day-date',root);
 const focusTask=$('#ha-focus-task',root);
 const focusLength=$('#ha-focus-length',root);
 let preferredTask = new URLSearchParams(location.search).get('focusTask') || '';
 function render(){
  if(!live||!root.isConnected)return;
  dateInput.value=chosen;
  const calendar=$('#ha-month-calendar',root);
  if(calendar&&!calendar.hidden) {
    const monthDate=new Date(calendarMonth+'-01T12:00:00');
    $('#ha-month-title',root).textContent=monthDate.toLocaleDateString(undefined,{month:'long',year:'numeric'});
    const startWeekOn=window.HabitArc?.getSettings?.()?.startWeekOn==='sunday'?'sunday':'monday';
    const weekdaysEl=$('.ha-month-weekdays',calendar);
    if(weekdaysEl){
      const labels=startWeekOn==='sunday'?['Sun','Mon','Tue','Wed','Thu','Fri','Sat']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      weekdaysEl.innerHTML=labels.map(d=>'<span>'+d+'</span>').join('');
    }
    const history=window.HabitArc?.getCompletionHistory?.()||[];
    const cells=buildMonthCells(calendarMonth,taskStore.getTasks(),window.HabitArc?.getHabits?.()||[],history,startWeekOn);
    $('#ha-month-days',root).innerHTML=cells.map(cell=>!cell?'<span class="ha-month-spacer"></span>':
      '<button type="button" data-day-action="calendar-day" data-date="'+cell.date+'"'+
      ' aria-label="'+cell.date+', '+cell.taskCount+' tasks, '+cell.habitCount+' habits"'+
      ' aria-pressed="'+(cell.date===chosen)+'" class="ha-month-cell'+(cell.date===localDay()?' is-today':'')+
      (cell.date===chosen?' is-selected':'')+'">'+
      '<span class="ha-month-number">'+cell.day+'</span><span class="ha-month-indicators">'+
      (cell.taskCount?'<i class="ha-month-taskdot"></i>':'')+
      (cell.habitCount?'<i class="ha-month-habitdot"></i>':'')+'</span></button>'
    ).join('');
  }

  const all=taskStore.getTasks(),day=daySummary(chosen,notes,all),week=weeklySummary(chosen,notes,all);
  const unifiedEl=$('#ha-day-unified-card',root);
  if(unifiedEl)unifiedEl.innerHTML=unifiedChecklistCard(day,chosen);
  $('#ha-day-metrics',root).innerHTML=
   '<div><span class="material-symbols-outlined">repeat</span><strong>'+count(day.habitsDone,day.habits.length)+'</strong><small>Habits</small></div>'+
   '<div><span class="material-symbols-outlined">checklist</span><strong>'+count(day.tasksDone,day.tasks.length)+'</strong><small>Tasks</small></div>'+
   '<div><span class="material-symbols-outlined">timer</span><strong>'+day.focus+'m</strong><small>Focus</small></div>';
  $('#ha-day-content',root).innerHTML=
    section('Notes','sticky_note_2',day.notes.map(noteRow).join(''),'No notes saved for this day.','<a href="Notes.html?date='+encodeURIComponent(chosen)+'">+ New note</a>');
  $('#ha-week-stats',root).innerHTML=[
    [count(week.habitsDone,week.habitsTotal),'Habit completions'],
    [count(week.tasksDone,week.tasksTotal),'Tasks completed'],
    [week.focus+'m','Focus time'],
    [String(week.notes),'Notes captured']
  ].map(row=>'<div><strong>'+esc(row[0])+'</strong><span>'+esc(row[1])+'</span></div>').join('');
  const options=all.filter(t=>!t.completed).map(t=>[t.id,t.title]);
  const signature=JSON.stringify(options);
  if(signature!==lastTaskOpts){
    const current=focusTask.value;
    focusTask.replaceChildren(new Option('General focus',''));
    options.forEach(pair=>focusTask.add(new Option(pair[1].slice(0,70),pair[0])));
    focusTask.value=options.some(pair=>pair[0]===preferredTask)?preferredTask
      : options.some(pair=>pair[0]===current)?current:'';
    if (focusTask.value === preferredTask) preferredTask='';
    lastTaskOpts=signature;
  }
  const activeTaskTitle=focusTask.value?(all.find(t=>t.id===focusTask.value)?.title||''):'';
  const nextFocusTitle=activeTaskTitle||day.tasks.find(t=>!t.completed)?.title||day.habits.find(h=>!h.done)?.title||'Deep Work Sprint';
  renderFocus(root,nextFocusTitle);
 }
 function setDay(next){
  if(!validDay(next))return;
  chosen=next;calendarMonth=next.slice(0,7);saveDate(chosen);render();
 }
 async function loadNotes(){
  const call=++token;
  const result=await readNotes(true);
  if(!live||call!==token)return;
  notes=result;render();
 }
 root.addEventListener('click',event=>{
  const element=event.target.closest('[data-day-action]');
  if(!element)return;
  const action=element.dataset.dayAction;
  if(action==='prev')setDay(shifted(chosen,-1));
  if(action==='next')setDay(shifted(chosen,1));
  if(action==='today')setDay(localDay());
  if(action==='calendar-toggle'){
    const panel=$('#ha-month-calendar',root);
    panel.hidden=!panel.hidden;
    $('#ha-calendar-toggle',root).setAttribute('aria-expanded',String(!panel.hidden));
    render();
  }
  if(action==='month-prev'){calendarMonth=addMonths(calendarMonth,-1);render();}
  if(action==='month-next'){calendarMonth=addMonths(calendarMonth,1);render();}
  if(action==='calendar-day')setDay(element.dataset.date);
  if(action==='quick-focus'){
    const st=getFocusState().active;
    if(!st)startFocus(Number(focusLength.value||25),focusTask.value);
    else if(st.status==='running')pauseFocus();
    else resumeFocus();
    render();
  }
  if(action==='start-focus'){startFocus(Number(focusLength.value),focusTask.value);render();}
  if(action==='pause-focus'){pauseFocus();renderFocus(root);}
  if(action==='resume-focus'){resumeFocus();renderFocus(root);}
  if(action==='reset-focus'){cancelFocus();render();}
  if(action==='habit'&&chosen===localDay()){
    const id=element.dataset.id;
    if(window.HabitArc?.isCompletedToday?.(id))window.HabitArc.uncompleteHabit(id);
    else window.HabitArc?.completeHabit?.(id);
    render();
  }
  if(action==='task'){
    const task=taskStore.getTask(element.dataset.id);
    if(task)taskStore.put(updateTask(task,{completed:!task.completed}));
  }
 },{signal});
 dateInput.addEventListener('change',()=>setDay(dateInput.value),{signal});
 window.addEventListener('habitarc:data-changed',render,{signal});
 window.addEventListener('habitarc:focus-changed',render,{signal});
 window.addEventListener('habitarc:focus-sync-status',()=>renderFocus(root),{signal});
 window.addEventListener('habitarc:open-day',event=>setDay(event.detail?.date),{signal});
 window.addEventListener('habitarc-auth-state-changed',loadNotes,{signal});
 const unsubscribe=taskStore.subscribe(render);
 taskStore.start();
 startFocusCloudSync();
 const clock=setInterval(()=>{
   if(!live||!root.isConnected)return;
   // Only update the timer clock each second, not the entire day UI.
   // When a session completes, focus-store emits an update event.
   renderFocus(root);
 },1000);
 active={root,render,cleanup(){live=false;controller.abort();unsubscribe();clearInterval(clock);}};
 void loadNotes();
 render();
}
export function unmountDay(){active?.cleanup();active=null;}
export function showDate(date){
 if(!validDay(date))return;
 saveDate(date);
 window.dispatchEvent(new CustomEvent('habitarc:open-day',{detail:{date}}));
}
export function mountDashboard(root=document.getElementById('ha-day-dashboard-peek')){
 if(!root||!root.isConnected)return;
 if(activeDashboard?.root===root)return;
 activeDashboard?.cleanup();
 const controller=new AbortController(),signal=controller.signal;
 let mounted=true;
 const render=()=>{
   if(!mounted||!root.isConnected)return;
   const day=daySummary(localDay());
   const el=$('#ha-day-dashboard-stats',root);
   if(!el)return;
   const isHeroStrip=root.classList.contains('ha-day-hero-strip');
   el.innerHTML=(isHeroStrip?'':'<span><strong>'+count(day.habitsDone,day.habits.length)+'</strong> habits</span>')+
    '<span><strong>'+count(day.tasksDone,day.tasks.length)+'</strong> tasks</span><span><strong>'+day.focus+'m</strong> focus</span>';
 };
 const unsubscribe=taskStore.subscribe(render);
 taskStore.start();
 startFocusCloudSync();
 window.addEventListener('habitarc:data-changed',render,{signal});
 window.addEventListener('habitarc:focus-changed',render,{signal});
 render();
 activeDashboard={root,cleanup(){mounted=false;controller.abort();unsubscribe();}};
}
if(typeof window!=='undefined')window.HabitArcWorkspace={mountDay,unmountDay,showDate,mountDashboard};
