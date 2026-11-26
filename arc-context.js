/* Optional workspace context for ARC. Never saves consent, never auto-includes Notes.
 * Read only from the active account and only after the member explicitly opts in. */
import { taskStore } from './task-store.js';
import { getFocusState } from './focus-store.js';

const MAX_TASKS=12, MAX_FOCUS=20, MAX_NOTES=3;
const uid=()=>window.HabitArc?.getAuthUser?.()?.uid||localStorage.getItem('habitarc_active_uid')||'local';
const shorten=(value,len)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,len);
const TASKS_ICO='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6l1.5 1.5L7.5 5M4 12l1.5 1.5L7.5 11"/></svg>';
const FOCUS_ICO='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/></svg>';
const NOTE_CHIP_ICO='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>';
const FOCUS_CHIP_ICO='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5"/></svg>';
let active=null;

function formatNoteDateShort(raw) {
 if(!raw)return '';
 const d=new Date(raw);
 if(Number.isNaN(d.getTime()))return '';
 try{return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(d);}catch{return '';}
}

async function localNotes(owner) {
 if(!('indexedDB' in window))return [];
 const db=await new Promise((resolve,reject)=>{
  const req=indexedDB.open('habitarc-notes-studio',1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('notes'))req.result.createObjectStore('notes',{keyPath:'id'})};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 try{
  const notes=await new Promise((resolve,reject)=>{
   const req=db.transaction('notes','readonly').objectStore('notes').getAll();
   req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
  });
  return notes.filter(n=>n.owner===owner && typeof n.id==='string').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,80);
 }finally{db.close();}
}

export function mountArcContext({
 button = document.getElementById('arc-context-open'),
 host = document.getElementById('arc-context-panel-host'),
 chips = document.getElementById('arc-context-chips')
} = {}) {
 if(!button||!host)return {collect:async()=>null,clearAfterSend(){},dispose(){}};
 if(active?.button===button)return active.api;
 active?.api?.dispose?.();
 const controller=new AbortController(),signal=controller.signal;
 const panel=document.createElement('section');
 panel.className='ha-arc-attach-panel';
 panel.id='arc-context-inline-panel';
 panel.setAttribute('role','dialog');
 panel.setAttribute('aria-modal','false');
 panel.setAttribute('aria-label','Attach optional workspace context to the next ARC AI message');
 panel.hidden=true;
 panel.innerHTML=[
  '<div class="ha-arc-attach-grab" aria-hidden="true"></div>',
  '<label class="ha-arc-attach-option"><span class="ha-arc-oico is-mint" aria-hidden="true">'+TASKS_ICO+'</span><span class="ha-arc-opt-copy"><strong>Active Tasks</strong><small id="arc-data-tasks-sub">Up to 12 active tasks</small></span><input id="arc-data-tasks" class="ha-arc-sr-check" type="checkbox"><span class="ha-arc-pill-switch" aria-hidden="true"><i></i></span></label>',
  '<label class="ha-arc-attach-option"><span class="ha-arc-oico is-amber" aria-hidden="true">'+FOCUS_ICO+'</span><span class="ha-arc-opt-copy"><strong>Focus History</strong><small id="arc-data-focus-sub">Completed timers</small></span><input id="arc-data-focus" class="ha-arc-sr-check" type="checkbox"><span class="ha-arc-pill-switch" aria-hidden="true"><i></i></span></label>',
  '<div class="ha-arc-attach-notes"><div class="ha-arc-attach-notes-heading"><span id="arc-data-notes-kicker" class="ha-arc-notes-kicker">ATTACH NOTES (0/3)</span><button id="arc-data-clear" class="ha-arc-clear-inline" type="button" hidden>Clear</button></div><p id="arc-data-notes-status" class="ha-arc-notes-status">Loading note titles…</p><div id="arc-data-notes-list" class="ha-arc-notes-grid"></div></div>',
  '<p id="arc-data-status" class="sr-only" role="status" aria-live="polite"></p>'
 ].join('');
 host.append(panel);
 const q=id=>panel.querySelector('#'+id);
 const selected=new Set();
 let notes=[],owner=uid(),loaded=false;
 const taskBox=q('arc-data-tasks'),focusBox=q('arc-data-focus'),noteList=q('arc-data-notes-list');
 const countBadge=document.createElement('span');
 countBadge.className='ha-arc-attach-count';
 countBadge.setAttribute('aria-hidden','true');
 countBadge.hidden=true;
 button.append(countBadge);
 function isOpen(){return !panel.hidden}
 function close({focus=false}={}){
  panel.hidden=true;
  button.setAttribute('aria-expanded','false');
  if(focus)button.focus();
 }
 function addChip(text, onRemove, kind='note') {
  if(!chips)return;
  const chip=document.createElement('button');
  chip.type='button';
  chip.className='ha-arc-context-chip';
  const badge=document.createElement('b');
  badge.className='ha-chip-badge '+(kind==='tasks'?'is-mint':(kind==='focus'?'is-amber':'is-lav'));
  badge.setAttribute('aria-hidden','true');
  if(kind==='tasks')badge.textContent='✓';
  else if(kind==='focus')badge.innerHTML=FOCUS_CHIP_ICO;
  else badge.innerHTML=NOTE_CHIP_ICO;
  const lbl=document.createElement('span');
  lbl.className='ha-chip-txt';
  lbl.textContent=text;
  const closeMark=document.createElement('i');
  closeMark.className='ha-chip-x';
  closeMark.setAttribute('aria-hidden','true');
  closeMark.textContent='×';
  chip.append(badge,lbl,closeMark);
  chip.setAttribute('aria-label','Remove '+text+' from next ARC AI message');
  chip.addEventListener('click',onRemove,{signal});
  chips.append(chip);
 }
 function syncDynamicCounts(){
  try{
   taskStore.start();
   const activeCnt=(taskStore.getTasks?.()||[]).filter(t=>!t.completed).length;
   const tSub=q('arc-data-tasks-sub');
   if(tSub)tSub.textContent=activeCnt>0?activeCnt+' active task'+(activeCnt===1?'':'s'):'Up to 12 active tasks';
  }catch{}
  try{
   const fCnt=(getFocusState()?.sessions||[]).length;
   const fSub=q('arc-data-focus-sub');
   if(fSub)fSub.textContent=fCnt>0?Math.min(fCnt,MAX_FOCUS)+' completed session'+(fCnt===1?'':'s'):'Completed timers';
  }catch{}
 }
 function refreshLabel(){
  const parts=[];
  if(taskBox.checked)parts.push('Tasks');
  if(focusBox.checked)parts.push('Focus');
  if(selected.size)parts.push(selected.size+' Notes');
  const count=Number(taskBox.checked)+Number(focusBox.checked)+selected.size;
  taskBox.closest('.ha-arc-attach-option')?.classList.toggle('is-on',taskBox.checked);
  focusBox.closest('.ha-arc-attach-option')?.classList.toggle('is-on',focusBox.checked);
  const nk=q('arc-data-notes-kicker');
  if(nk)nk.textContent='ATTACH NOTES ('+selected.size+'/'+MAX_NOTES+')';
  const clrBtn=q('arc-data-clear');
  if(clrBtn)clrBtn.hidden=count===0;
  countBadge.textContent=String(count);
  countBadge.hidden=count===0;
  button.classList.toggle('ha-arc-attach-active',count>0);
  button.setAttribute('aria-label',count?'Change attached ARC context: '+parts.join(', '):'Attach Tasks, Focus sessions or Notes');
  if(chips){
   chips.replaceChildren();
   if(taskBox.checked)addChip('Tasks',()=>{taskBox.checked=false;refreshLabel()},'tasks');
   if(focusBox.checked)addChip('Focus',()=>{focusBox.checked=false;refreshLabel()},'focus');
   for(const id of selected){
    const note=notes.find(n=>n.id===id);
    const title=shorten(note?.title||'Note',18);
    addChip(title,()=>{
     selected.delete(id);
     noteList.querySelectorAll('input[type=checkbox]').forEach(box=>{
      if(box.value===id)box.checked=false;
      box.disabled=!box.checked&&selected.size>=MAX_NOTES;
      box.closest('.ha-arc-attach-note')?.classList.toggle('is-on',box.checked);
     });
     refreshLabel();
    },'note');
   }
   chips.classList.toggle('hidden',count===0);
  }
 }
 function reset(){
  taskBox.checked=false;focusBox.checked=false;selected.clear();
  noteList.querySelectorAll('input[type=checkbox]').forEach(input=>{
   input.checked=false;input.disabled=false;
   input.closest('.ha-arc-attach-note')?.classList.remove('is-on');
  });
  q('arc-data-status').textContent='No extra context selected.';
  refreshLabel();
 }
 async function loadNotes(){
  const captured=uid();
  if(captured!==owner){owner=captured;notes=[];loaded=false;reset();}
  if(loaded){renderNotes();return;}
  const stEl=q('arc-data-notes-status');
  if(stEl){stEl.hidden=false;stEl.textContent='Loading note titles…';}
  try{
   const result=await localNotes(captured);
   if(owner!==uid()||!panel.isConnected)return;
   notes=result;loaded=true;renderNotes();
  }catch{
   notes=[];loaded=false;
   if(stEl){stEl.hidden=false;stEl.textContent='Notes unavailable on this device.';}
  }
 }
 function renderNotes(){
  noteList.replaceChildren();
  const stEl=q('arc-data-notes-status');
  if(stEl){
   stEl.textContent=notes.length?'Choose up to 3 notes.':'No device-local Notes found.';
   stEl.hidden=notes.length>0;
  }
  for(const n of notes.slice(0,30)){
   const isSel=selected.has(n.id);
   const label=document.createElement('label');
   label.className='ha-arc-attach-note'+(isSel?' is-on':'');
   const check=document.createElement('input');
   check.type='checkbox';check.className='ha-arc-sr-check';check.value=n.id;check.checked=isSel;
   check.disabled=!check.checked&&selected.size>=MAX_NOTES;
   const title=document.createElement('strong');
   title.textContent=shorten(n.title||'Untitled Note',48);
   const sub=document.createElement('small');
   const dt=formatNoteDateShort(n.updatedAt);
   sub.textContent=(n.pinned?'Pinned':'Note')+(dt?' · '+dt:'');
   label.append(check,title,sub);
   noteList.append(label);
  }
  refreshLabel();
 }
 function open(){
  if(owner!==uid()){owner=uid();notes=[];loaded=false;reset();}
  syncDynamicCounts();
  panel.hidden=false;
  button.setAttribute('aria-expanded','true');
  void loadNotes();
 }
 button.addEventListener('click',()=>isOpen()?close():open(),{signal});
 panel.addEventListener('change',event=>{
  const input=event.target;
  if(input?.closest?.('#arc-data-notes-list')){
   if(input.checked&&selected.size>=MAX_NOTES){input.checked=false;return;}
   if(input.checked)selected.add(input.value);else selected.delete(input.value);
   noteList.querySelectorAll('input').forEach(x=>{
    x.disabled=!x.checked&&selected.size>=MAX_NOTES;
    x.closest('.ha-arc-attach-note')?.classList.toggle('is-on',x.checked);
   });
  }
  refreshLabel();
 },{signal});
 document.addEventListener('pointerdown',event=>{
  if(!panel.isConnected){api.dispose();return;}
  if(isOpen()&&!panel.contains(event.target)&&!button.contains(event.target))close();
 },{signal});
 document.addEventListener('keydown',event=>{
  if(!panel.isConnected){api.dispose();return;}
  if(isOpen()&&event.key==='Escape'){close({focus:true});event.preventDefault();}
 },{signal});
 q('arc-data-clear')?.addEventListener('click',reset,{signal});
 async function collect(){
  const current=uid();
  if(current!==owner){owner=current;loaded=false;notes=[];reset();return null;}
  const extra={};
  if(taskBox.checked){
   taskStore.start();
   if(taskStore.getStatus().owner!==current)throw new Error('Tasks are still switching accounts. Try again.');
   extra.tasks=taskStore.getTasks().filter(t=>!t.completed).slice(0,MAX_TASKS).map(t=>({
    title:shorten(t.title,120),dueDate:shorten(t.dueDate,10),
    priority:['none','low','medium','high'].includes(t.priority)?t.priority:'none',completed:Boolean(t.completed)
   }));
  }
  if(focusBox.checked){
   const focus=getFocusState();
   if(focus.owner!==current)throw new Error('Focus data is still switching accounts. Try again.');
   extra.focus=(focus.sessions||[]).slice(-MAX_FOCUS).map(s=>({
    date:shorten(s.date,10),minutes:Math.max(1,Math.min(180,Math.round(Number(s.minutes)||1)))
   }));
  }
  if(selected.size){
   const fresh=await localNotes(current);
   if(uid()!==current)throw new Error('Account changed while loading selected Notes.');
   extra.notes=fresh.filter(n=>selected.has(n.id)).slice(0,MAX_NOTES).map(n=>({
    title:shorten(n.title,100),excerpt:shorten(n.body,850)
   }));
  }
  return Object.keys(extra).length?extra:null;
 }
 refreshLabel();
 const api={
  collect,
  clearAfterSend(){reset();close();},
  dispose(){
   controller.abort();
   panel.remove();
   countBadge.remove();
   chips?.replaceChildren();
   chips?.classList?.add('hidden');
   if(active?.button===button)active=null;
  }
 };
 active={button,api};
 return api;
}
