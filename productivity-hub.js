/* HabitArc Command Center — local account search + explicit capture */
import { taskStore, newTask, localDay } from './task-store.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const owner=()=>window.HabitArc?.getAuthUser?.()?.uid||localStorage.getItem('habitarc_active_uid')||'local';
const CAPTURE='habitarc_command_capture:';
let dialog,query,results,status,debounce=0,epoch=0;
async function getNotes(uid){
 if(typeof indexedDB==='undefined')return [];
 const db=await new Promise((resolve,reject)=>{
  const r=indexedDB.open('habitarc-notes-studio',1);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('notes'))r.result.createObjectStore('notes',{keyPath:'id'});};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
 try{
  const rows=await new Promise((resolve,reject)=>{
    const req=db.transaction('notes','readonly').objectStore('notes').getAll();
    req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
  });
  return rows.filter(n=>n.owner===uid).map(n=>({
    title:n.title||'Untitled note',subtitle:String(n.body||'').slice(0,150),
    type:'Note',icon:'description',href:'Notes.html?note='+encodeURIComponent(n.id)
  }));
 }finally{db.close();}
}
function getAiChats(uid){
 try{
  const raw=JSON.parse(localStorage.getItem('habitarc_arc_chats:'+uid)||'[]');
  if(!Array.isArray(raw))return [];
  return raw.filter(c=>c&&!c.deleted&&Array.isArray(c.turns)&&c.turns.length>0)
   .sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||(b.updatedAt||0)-(a.updatedAt||0))
   .map(c=>{
    const lastTurn=c.turns[c.turns.length-1]||{};
    const transcript=c.turns.map(t=>(t.question||'')+' '+(t.answer||'')).join(' ').slice(0,1200);
    return {
     title:(c.pinned?'📌 ':'')+(c.title||'ARC AI Chat'),
     subtitle:String(lastTurn.question||'').slice(0,110),
     searchBody:transcript,
     type:'AI Chat',icon:'smart_toy',href:'Arc_AI.html?chat='+encodeURIComponent(c.id)
    };
   });
 }catch{return [];}
}
const row=item=>'<a class="ha-command-result" href="'+esc(item.href)+'">'+
 '<span class="material-symbols-outlined" aria-hidden="true">'+esc(item.icon)+'</span>'+
 '<span><strong>'+esc(item.title)+'</strong><small>'+esc(item.type)+(item.subtitle?' · '+esc(item.subtitle):'')+'</small></span>'+
 '<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>';
async function search(){
 if(!dialog?.open)return;
 const q=query.value.trim().toLocaleLowerCase().slice(0,150),id=++epoch,uid=owner();
 if(!q){results.innerHTML='<p class="ha-command-empty">Find habits, tasks, notes and ARC AI chats. Or capture an idea below.</p>';status.textContent='Ctrl / ⌘ + K · Your work in one place';return;}
 status.textContent='Searching this device…';
 let notes=[];
 try{notes=await getNotes(uid)}catch{ /* Notes might be unavailable. */ }
 if(id!==epoch||uid!==owner()||!dialog.open)return;
 taskStore.start();
 const habits=(window.HabitArc?.getHabits?.()||[]).map(h=>({title:h.name||'Habit',subtitle:h.category||'',
   icon:h.icon||'repeat',type:'Habit',href:'Habit_Detail.html?id='+encodeURIComponent(h.id)}));
 const tasks=(taskStore.getStatus().owner===uid ? taskStore.getTasks() : []).map(t=>({title:t.title,subtitle:t.dueDate||'No due date',
   icon:t.completed?'check_circle':'checklist',type:'Task',href:'Habits.html?section=tasks'}));
 const aiChats=getAiChats(uid);
 const matches=[...habits,...tasks,...notes,...aiChats].filter(x=>x.title.toLocaleLowerCase().includes(q)||x.subtitle.toLocaleLowerCase().includes(q)||(x.searchBody||'').toLocaleLowerCase().includes(q)).slice(0,20);
 results.innerHTML=matches.length?matches.map(row).join(''):'<p class="ha-command-empty">No results. Capture it below.</p>';
 status.textContent=matches.length+' result'+(matches.length===1?'':'s')+' · Account-private';
}
function open(){
 if(!dialog)return;
 dialog.showModal();
 query.value='';
 dialog.querySelector('#ha-command-capture').value='';
 dialog.querySelector('#ha-command-due').value=localDay();
 void search();query.focus();
}
function capture(kind){
 const input=dialog.querySelector('#ha-command-capture'),title=input.value.trim().slice(0,160);
 if(!title){status.textContent='Type something to capture.';input.focus();return;}
 const uid=owner();
 if(kind==='task'){
  try{
   taskStore.start();
   if(taskStore.getStatus().owner!==uid)throw new Error('Account still loading');
   taskStore.put(newTask({title,dueDate:dialog.querySelector('#ha-command-due').value||localDay()}));
   input.value='';status.textContent='Task saved to Plan.';void search();
  }catch(error){status.textContent='Task not saved: '+error.message;}
  return;
 }
 if(kind==='ai'&&typeof window.innerWidth==='number'&&window.innerWidth<768&&window.HabitArcSheet?.open&&!location.pathname.endsWith('Arc_AI.html')){
  dialog.close();
  window.HabitArcSheet.open(title);
  return;
 }
 try{sessionStorage.setItem(CAPTURE+uid,JSON.stringify({title,owner:uid,savedAt:Date.now()}));}
 catch{status.textContent='Private draft storage unavailable. Open the editor manually.';return;}
 dialog.close();
 location.href=kind==='note'?'Notes.html?capture=1':(kind==='ai'?'Arc_AI.html?capture=1':'Add_Habit.html?capture=1');
}
function initialize(){
 dialog=document.createElement('dialog');
 dialog.id='ha-command-dialog';dialog.className='ha-command-dialog';
 dialog.setAttribute('aria-label','Universal Search and Quick Capture');
 dialog.innerHTML=[
 '<div class="ha-command-inner"><header><div><span class="ha-command-eyebrow">HABITARC · COMMAND CENTER</span><h2>Find it. Capture it.</h2></div>',
 '<button type="button" id="ha-command-close" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg></button></header>',
 '<label class="ha-command-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="ha-command-query" type="search" placeholder="Search habits, tasks, notes, AI chats…" autocomplete="off" aria-label="Search everything"></label>',
 '<p class="ha-command-status" id="ha-command-status" role="status" aria-live="polite"></p>',
 '<div id="ha-command-results" class="ha-command-results"></div>',
 '<section class="ha-command-capture"><h3><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg> Quick Capture</h3>',
 '<input id="ha-command-capture" type="text" maxlength="160" placeholder="What’s on your mind?" aria-label="New item title">',
 '<label class="ha-command-date-label">Task due date <input id="ha-command-due" type="date"></label>',
 '<div class="ha-command-actions"><button data-ha-capture="task" type="button">+ Task</button><button data-ha-capture="note" type="button">+ Note</button><button data-ha-capture="habit" type="button">+ Habit</button><button data-ha-capture="ai" type="button">+ Ask AI</button></div>',
 '<small>Task saves immediately. Note, Habit, and Ask AI open ready to review before sending or saving.</small></section></div>'
 ].join('');
 document.body.append(dialog);
 query=dialog.querySelector('#ha-command-query');
 results=dialog.querySelector('#ha-command-results');
 status=dialog.querySelector('#ha-command-status');
 dialog.querySelector('#ha-command-close').addEventListener('click',()=>dialog.close());
 query.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>void search(),120);});
 dialog.querySelectorAll('[data-ha-capture]').forEach(b=>b.addEventListener('click',()=>capture(b.dataset.haCapture)));
 results.addEventListener('click',e=>{
  const a=e.target.closest('a');
  if(!a)return;
  const href=a.getAttribute('href')||'';
  if(href.startsWith('Arc_AI.html?chat=')&&typeof window.innerWidth==='number'&&window.innerWidth<768&&window.HabitArcSheet?.openChat&&!location.pathname.endsWith('Arc_AI.html')){
   e.preventDefault();
   const chatId=decodeURIComponent(href.split('chat=')[1]||'');
   dialog.close();
   window.HabitArcSheet.openChat(chatId);
   return;
  }
  dialog.close();
 });
 document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();dialog.open?dialog.close():open();}
 });
 window.HabitArcCommandHub={open,mount:mountCommandHub};
}
export function mountCommandHub(){
 if(!dialog)initialize();
 taskStore.start();
 document.querySelectorAll('body > header').forEach(header=>{
  if(header.querySelector('.ha-command-trigger'))return;
  const mobile=header.classList.contains('notes-mobile-header')||header.classList.contains('md:hidden');
  const desktop=header.classList.contains('notes-topbar')||header.classList.contains('md:block');
  if(!mobile&&!desktop)return;
  const button=document.createElement('button');
  button.type='button';button.className='ha-command-trigger';
  button.setAttribute('aria-label','Search and Quick Capture');button.title='Search (Ctrl+K)';
  button.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  button.addEventListener('click',open);
  const nextAction=header.querySelector('.ha-mobile-top-action') || header.querySelector('a.ha-hdr-profile');
  if(nextAction)nextAction.before(button);
  else header.append(button);
 });
}
