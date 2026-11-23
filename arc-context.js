/* Optional workspace context for ARC. Never saves consent, never auto-includes Notes.
 * Read only from the active account and only after the member explicitly opts in. */
import { taskStore } from './task-store.js';
import { getFocusState } from './focus-store.js';

const MAX_TASKS=12, MAX_FOCUS=20, MAX_NOTES=3;
const uid=()=>window.HabitArc?.getAuthUser?.()?.uid||localStorage.getItem('habitarc_active_uid')||'local';
const shorten=(value,len)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,len);
let active=null;

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
  '<header class="ha-arc-attach-head"><div><small>ARC AI · ADD CONTEXT</small><strong>Attach to your message</strong></div><button type="button" id="arc-data-close" aria-label="Close context picker"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></header>',
  '<p class="ha-arc-attach-hint">Choose what ARC can read. Only sent with your next question.</p>',
  '<label class="ha-arc-attach-option"><span class="material-symbols-outlined" aria-hidden="true">checklist</span><span><strong>Tasks</strong><small>Up to 12 active tasks</small></span><input id="arc-data-tasks" type="checkbox"></label>',
  '<label class="ha-arc-attach-option"><span class="material-symbols-outlined" aria-hidden="true">timer</span><span><strong>Focus sessions</strong><small>Up to 20 completed sessions</small></span><input id="arc-data-focus" type="checkbox"></label>',
  '<div class="ha-arc-attach-notes"><div class="ha-arc-attach-notes-heading"><span class="material-symbols-outlined" aria-hidden="true">description</span><strong>Notes <small>(choose up to 3)</small></strong></div><p id="arc-data-notes-status">Loading note titles…</p><div id="arc-data-notes-list"></div></div>',
  '<footer class="ha-arc-attach-footer"><button id="arc-data-clear" type="button">Clear all</button><button id="arc-data-save" type="button">Done</button></footer>',
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
 function addChip(text, onRemove) {
  if(!chips)return;
  const chip=document.createElement('button');
  chip.type='button';
  chip.className='ha-arc-context-chip';
  chip.textContent=text+' ×';
  chip.setAttribute('aria-label','Remove '+text+' from next ARC AI message');
  chip.addEventListener('click',onRemove,{signal});
  chips.append(chip);
 }
 function refreshLabel(){
  const parts=[];
  if(taskBox.checked)parts.push('Tasks');
  if(focusBox.checked)parts.push('Focus');
  if(selected.size)parts.push(selected.size+' Notes');
  const count=Number(taskBox.checked)+Number(focusBox.checked)+selected.size;
  countBadge.textContent=String(count);
  countBadge.hidden=count===0;
  button.classList.toggle('ha-arc-attach-active',count>0);
  button.setAttribute('aria-label',count?'Change attached ARC context: '+parts.join(', '):'Attach Tasks, Focus sessions or Notes');
  if(chips){
   chips.replaceChildren();
   if(taskBox.checked)addChip('Tasks',()=>{taskBox.checked=false;refreshLabel()});
   if(focusBox.checked)addChip('Focus',()=>{focusBox.checked=false;refreshLabel()});
   for(const id of selected){
    const note=notes.find(n=>n.id===id);
    const title=shorten(note?.title||'Note',22);
    addChip(title,()=>{
     selected.delete(id);
     noteList.querySelectorAll('input[type=checkbox]').forEach(box=>{
      if(box.value===id)box.checked=false;
      box.disabled=!box.checked&&selected.size>=MAX_NOTES;
     });
     refreshLabel();
    });
   }
   chips.classList.toggle('hidden',count===0);
  }
 }
 function reset(){
  taskBox.checked=false;focusBox.checked=false;selected.clear();
  noteList.querySelectorAll('input[type=checkbox]').forEach(input=>{input.checked=false;input.disabled=false});
  q('arc-data-status').textContent='No extra context selected.';
  refreshLabel();
 }
 async function loadNotes(){
  const captured=uid();
  if(captured!==owner){owner=captured;notes=[];loaded=false;reset();}
  if(loaded){renderNotes();return;}
  q('arc-data-notes-status').textContent='Loading note titles…';
  try{
   const result=await localNotes(captured);
   if(owner!==uid()||!panel.isConnected)return;
   notes=result;loaded=true;renderNotes();
  }catch{
   notes=[];loaded=false;q('arc-data-notes-status').textContent='Notes unavailable on this device.';
  }
 }
 function renderNotes(){
  noteList.replaceChildren();
  q('arc-data-notes-status').textContent=notes.length?'Choose up to 3 notes. Text is shared only for this question.':'No device-local Notes found.';
  for(const n of notes.slice(0,30)){
   const label=document.createElement('label');label.className='ha-arc-attach-note';
   const check=document.createElement('input');check.type='checkbox';check.value=n.id;check.checked=selected.has(n.id);
   check.disabled=!check.checked&&selected.size>=MAX_NOTES;
   const title=document.createElement('span');title.textContent=shorten(n.title||'Untitled Note',80);
   label.append(check,title);noteList.append(label);
  }
  refreshLabel();
 }
 function open(){
  if(owner!==uid()){owner=uid();notes=[];loaded=false;reset();}
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
   noteList.querySelectorAll('input').forEach(x=>x.disabled=!x.checked&&selected.size>=MAX_NOTES);
  }
  refreshLabel();
 },{signal});
 document.addEventListener('pointerdown',event=>{
  if(isOpen()&&!panel.contains(event.target)&&!button.contains(event.target))close();
 },{signal});
 document.addEventListener('keydown',event=>{
  if(isOpen()&&event.key==='Escape'){close({focus:true});event.preventDefault();}
 },{signal});
 q('arc-data-close').addEventListener('click',()=>close({focus:true}),{signal});
 q('arc-data-save').addEventListener('click',()=>close({focus:true}),{signal});
 q('arc-data-clear').addEventListener('click',reset,{signal});
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
