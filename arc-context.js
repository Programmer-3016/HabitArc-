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

export function mountArcContext({button=document.getElementById('arc-context-open')}={}){
 if(!button)return {collect:async()=>null,dispose:()=>{}};
 if(active?.button===button)return active.api;
 active?.api?.dispose?.();
 const controller=new AbortController(),signal=controller.signal;
 const dialog=document.createElement('dialog');
 dialog.className='ha-arc-data-dialog';dialog.id='ha-arc-data-dialog';
 dialog.setAttribute('aria-label','Choose private workspace data for ARC AI');
 dialog.innerHTML=[
 '<div class="ha-arc-data-shell"><header><div><small>ARC AI · OPTIONAL CONTEXT</small><h2>Choose what ARC can read</h2></div><button type="button" id="arc-data-close" aria-label="Close"><span class="material-symbols-outlined">close</span></button></header>',
 '<p class="ha-arc-data-explain">Habits already come from your signed-in profile. These extras are sent only with the next question when selected. Nothing shares automatically and attachments stay private.</p>',
 '<label class="ha-arc-data-option"><input id="arc-data-tasks" type="checkbox"><span><strong>Tasks</strong><small>Up to 12 active tasks: title, due date and priority</small></span></label>',
 '<label class="ha-arc-data-option"><input id="arc-data-focus" type="checkbox"><span><strong>Focus sessions</strong><small>Up to 20 completed sessions: date and minutes</small></span></label>',
 '<div class="ha-arc-data-notes"><strong>Selected Notes <small>(max 3, text only)</small></strong><p id="arc-data-notes-status">Loading note titles…</p><div id="arc-data-notes-list"></div></div>',
 '<footer><button id="arc-data-clear" type="button">Clear selection</button><button id="arc-data-save" type="button">Use this context</button></footer>',
 '<p id="arc-data-status" role="status" aria-live="polite"></p></div>'
 ].join('');
 document.body.append(dialog);
 const q=id=>dialog.querySelector('#'+id);
 const selected=new Set();
 let notes=[],owner=uid(),loaded=false;
 const taskBox=q('arc-data-tasks'),focusBox=q('arc-data-focus'),noteList=q('arc-data-notes-list');
 function refreshLabel(){
  const parts=[];
  if(taskBox.checked)parts.push('Tasks');
  if(focusBox.checked)parts.push('Focus');
  if(selected.size)parts.push(selected.size+' Notes');
  const count=parts.length;
  button.textContent=count?'Context: '+parts.join(' + '):'Customize context';
  button.setAttribute('aria-label',count?'Customize ARC context: '+parts.join(', '):'Choose additional ARC AI context');
  button.classList.toggle('ha-arc-context-active',count>0);
 }
 function reset(){
  taskBox.checked=false;focusBox.checked=false;selected.clear();
  noteList.querySelectorAll('input[type=checkbox]').forEach(input=>{input.checked=false;input.disabled=false});
  q('arc-data-status').textContent='No extra context selected.';
  refreshLabel();
 }
 async function loadNotes(){
  const captured=uid();
  if(captured!==owner){owner=captured;notes=[];reset();}
  if(loaded&&notes.length){renderNotes();return;}
  loaded=false;q('arc-data-notes-status').textContent='Loading note titles…';
  try{
   const result=await localNotes(owner);
   if(owner!==uid()||!dialog.isConnected)return;
   notes=result;loaded=true;renderNotes();
  }catch{
   notes=[];loaded=false;q('arc-data-notes-status').textContent='Notes unavailable on this device.';
  }
 }
 function renderNotes(){
  noteList.replaceChildren();
  q('arc-data-notes-status').textContent=notes.length?'Choose up to 3 notes. Text will be sent to ARC only with your question.':'No device-local Notes found.';
  for(const n of notes.slice(0,30)){
   const label=document.createElement('label');label.className='ha-arc-data-note';
   const check=document.createElement('input');check.type='checkbox';check.value=n.id;check.checked=selected.has(n.id);
   check.disabled=!check.checked&&selected.size>=MAX_NOTES;
   const title=document.createElement('span');title.textContent=shorten(n.title||'Untitled Note',80);
   label.append(check,title);noteList.append(label);
  }
 }
 dialog.addEventListener('change',event=>{
  const input=event.target;
  if(input.closest('#arc-data-notes-list')){
   if(input.checked&&selected.size>=MAX_NOTES){input.checked=false;return;}
   if(input.checked)selected.add(input.value);else selected.delete(input.value);
   noteList.querySelectorAll('input').forEach(x=>x.disabled=!x.checked&&selected.size>=MAX_NOTES);
  }
  refreshLabel();
 },{signal});
 button.addEventListener('click',()=>{
  if(owner!==uid()){owner=uid();loaded=false;reset();}
  dialog.showModal();void loadNotes();
 },{signal});
 q('arc-data-close').addEventListener('click',()=>dialog.close(),{signal});
 q('arc-data-save').addEventListener('click',()=>{dialog.close();refreshLabel()},{signal});
 q('arc-data-clear').addEventListener('click',reset,{signal});
 async function collect(){
  const current=uid();
  if(current!==owner){owner=current;loaded=false;reset();return null;}
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
  if(!Object.keys(extra).length)return null;
  return extra;
 }
 refreshLabel();
 const api={collect,dispose(){controller.abort();dialog.remove();if(active?.button===button)active=null;}};
 active={button,api};
 return api;
}
