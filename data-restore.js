/**
 * Safe personal backup restore. Merge-only, owner-locked, offline-first.
 * Validate the complete file + media before any writes; never overwrite data.
 */
import { taskStore, normalizeTask } from './task-store.js';
const MAX_BYTES=130*1024*1024, MAX_NOTES=2500, MAX_TASKS=2000, MAX_SESSIONS=500;
const currentOwner=()=>window.HabitArc?.getAuthUser?.()?.uid||localStorage.getItem('habitarc_active_uid')||'local';
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=90&&!id.includes('/');
const getJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
const countUnique=(items)=>new Set(items.map(item=>item.id)).size;
const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date);
export function validateArchive(archive,uid) {
 if(!archive||archive.type!=='habitarc-personal-archive'||archive.version!==1)
   throw new Error('Not a supported HabitArc backup (version 1 required).');
 if(!uid||archive.owner!==uid)
   throw new Error('Backup belongs to a different account. Sign into the matching account before restoring.');
 if(!archive.habits||typeof archive.habits!=='object'||!Array.isArray(archive.habits.habits)||
    !Array.isArray(archive.tasks)||!Array.isArray(archive.notes)||
    !archive.focus||!Array.isArray(archive.focus.sessions))
   throw new Error('Backup is missing habit, task, note or focus records.');
 if(archive.habits.habits.length>20||archive.tasks.length>MAX_TASKS||
    archive.notes.length>MAX_NOTES||archive.focus.sessions.length>MAX_SESSIONS)
   throw new Error('Backup exceeds safe import limits.');
 if(countUnique(archive.habits.habits)!==archive.habits.habits.length||
    countUnique(archive.tasks)!==archive.tasks.length||
    countUnique(archive.notes)!==archive.notes.length)
   throw new Error('Backup has repeated record IDs.');
 for(const h of archive.habits.habits) {
   if(!validId(h?.id)||typeof h.name!=='string'||!h.name.trim()||h.name.length>160)
     throw new Error('Invalid habit in archive.');
 }
 for(const t of archive.tasks) {
   if(!validId(t?.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>160)
     throw new Error('Invalid task in archive.');
 }
 for(const n of archive.notes){
   if(!validId(n?.id)||typeof n.title!=='string'||n.title.length>100||
      typeof n.body!=='string'||n.body.length>10000)throw new Error('Invalid note in archive.');
   for(const kind of ['photo','audio']){
     const file=n[kind];
     if(file===null||file===undefined)continue;
     if(typeof file.base64!=='string'||typeof file.mimeType!=='string'||
       !new RegExp('^'+(kind==='photo'?'image':'audio')+'/').test(file.mimeType)||
       file.base64.length>(kind==='photo'?8:12)*1024*1024||
       !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))
       throw new Error('A note contains unsupported or oversized '+kind+' data.');
   }
 }
 for(const session of archive.focus.sessions){
   if(!validId(session?.id)||!validDate(session.date)||
       !(Number(session.minutes)>=1&&Number(session.minutes)<=180))
       throw new Error('Invalid focus session in archive.');
 }
 return archive;
}
function decodeBlob(file,maxBytes) {
 if(!file)return null;
 const bytes=atob(file.base64),buffer=new Uint8Array(bytes.length);
 if(bytes.length>maxBytes)throw new Error('Backup attachment exceeds size limit.');
 for(let i=0;i<bytes.length;i++)buffer[i]=bytes.charCodeAt(i);
 return new Blob([buffer],{type:file.mimeType});
}
function notesDb(){
 return new Promise((resolve,reject)=>{
   const open=indexedDB.open('habitarc-notes-studio',1);
   open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('notes'))open.result.createObjectStore('notes',{keyPath:'id'});};
   open.onerror=()=>reject(open.error||new Error('Could not open Notes storage'));
   open.onsuccess=()=>resolve(open.result);
 });
}
async function existingNoteIds(uid){
 const db=await notesDb();
 try{
   const all=await new Promise((resolve,reject)=>{
     const request=db.transaction('notes','readonly').objectStore('notes').getAll();
     request.onsuccess=()=>resolve(request.result||[]);
     request.onerror=()=>reject(request.error);
   });
   return new Set(all.filter(n=>n.owner===uid).map(n=>n.id));
 }finally{db.close();}
}
async function appendNotes(entries,uid) {
 if(!entries.length)return;
 const db=await notesDb();
 try{
   await new Promise((resolve,reject)=>{
     const tx=db.transaction('notes','readwrite'),store=tx.objectStore('notes');
     for(const note of entries) {
       store.add({...note,owner:uid});
     }
     tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
     tx.onabort=()=>reject(tx.error);
   });
 }finally{db.close();}
}
async function prepare(archive,uid) {
 validateArchive(archive,uid);
 taskStore.start();
 if(taskStore.getStatus().owner!==uid)throw new Error('Task store is still changing accounts; try again.');
 const existingNotes=await existingNoteIds(uid);
 const existingTasks=new Set(taskStore.getTasks().map(t=>t.id));
 const existingSessions=new Set(getJson('habitarc_focus_v1:'+uid,{sessions:[]}).sessions?.map(s=>s.id)||[]);
 const notes=[];
 for(const n of archive.notes){
   if(existingNotes.has(n.id))continue;
   const {photo,audio,...meta}=n;
   notes.push({
     id:n.id,title:n.title,body:n.body,date:typeof n.date==='string'?n.date:'',
     pinned:Boolean(n.pinned),color:['lavender','mint','peach','white'].includes(n.color)?n.color:'lavender',
     createdAt:n.createdAt||new Date().toISOString(),updatedAt:n.updatedAt||new Date().toISOString(),
     cloudHasPhoto:Boolean(n.cloudHasPhoto),cloudHasAudio:Boolean(n.cloudHasAudio),
     photo:decodeBlob(photo,5*1024*1024),audio:decodeBlob(audio,8*1024*1024)
   });
 }
 const tasks=archive.tasks.filter(t=>!existingTasks.has(t.id)).map(normalizeTask);
 const sessions=archive.focus.sessions.filter(s=>!existingSessions.has(s.id)).map(s=>({
   id:s.id,date:s.date,minutes:Number(s.minutes),taskId:String(s.taskId||'').slice(0,90),
   completedAt:String(s.completedAt||'')
 }));
 const existingHabitIds=new Set((window.HabitArc.getHabits?.()||[]).map(h=>h.id));
 const habits=archive.habits.habits.filter(h=>!existingHabitIds.has(h.id));
 if(existingHabitIds.size+habits.length>20)throw new Error('Restore exceeds the 20-habit limit. No changes were made.');
 return {archive,uid,notes,tasks,sessions,habits,existingNotes};
}
export async function previewArchiveFile(file){
 if(!file||file.size>MAX_BYTES)throw new Error('Choose a HabitArc JSON backup under 130 MB.');
 const uid=currentOwner();
 const archive=JSON.parse(await file.text());
 const staged=await prepare(archive,uid);
 return {staged,summary:{
   habits:staged.habits.length,tasks:staged.tasks.length,
   notes:staged.notes.length,focus:staged.sessions.length,
   existingHabits:window.HabitArc?.getHabits?.()?.length||0,
   owner:uid
 }};
}
export async function restoreArchive(staged){
 if(!staged||staged.uid!==currentOwner()||staged.uid!==taskStore.getStatus().owner)
   throw new Error('Account changed since preview. Nothing imported; preview again.');
 const next=await prepare(staged.archive,staged.uid);
 const uid=staged.uid;
 // Add new notes first in one IndexedDB transaction (all or nothing for notes).
 await appendNotes(next.notes,uid);
 // Queue only actual inserted Notes. Cloud sync will replay on the Notes page.
 if(uid!=='local'&&next.notes.length){
   const key='habitarc_notes_pending:'+uid,queue=getJson(key,{});
   for(const note of next.notes){
     queue[note.id]={type:'upsert',updatedAt:note.updatedAt,revision:Date.now()+Math.random()};
   }
   localStorage.setItem(key,JSON.stringify(queue));
 }
 const focusKey='habitarc_focus_v1:'+uid;
 const focus=getJson(focusKey,{active:null,sessions:[]});
 const allSessions=[...(Array.isArray(focus.sessions)?focus.sessions:[]),...next.sessions].slice(-MAX_SESSIONS);
 localStorage.setItem(focusKey,JSON.stringify({active:focus.active||null,sessions:allSessions}));
 if(uid!=='local'&&next.sessions.length){
   const key='habitarc_focus_pending_v1:'+uid,queue=getJson(key,{});
   for(const session of next.sessions)queue[session.id]=session;
   localStorage.setItem(key,JSON.stringify(queue));
 }
 for(const task of next.tasks)taskStore.put(task);
 const habits=window.HabitArc.restoreArchiveHabits(staged.archive.habits);
 window.dispatchEvent(new CustomEvent('habitarc:focus-changed'));
 window.dispatchEvent(new CustomEvent('habitarc:data-changed',{detail:{source:'restore'}}));
 return {habits:habits.habits,tasks:next.tasks.length,notes:next.notes.length,focus:next.sessions.length,completions:habits.completions};
}
export function mountRestore(root=document){
 const input=root.getElementById('restore-backup-file'),preview=root.getElementById('restore-backup-preview'),
   apply=root.getElementById('restore-backup-apply'),status=root.getElementById('restore-backup-status');
 if(!input||!preview||!apply||!status||input.dataset.bound)return;
 input.dataset.bound='true';
 let selected=null,busy=false;
 input.addEventListener('change',async()=>{
   selected=null;apply.disabled=true;preview.hidden=true;
   const file=input.files?.[0];if(!file)return;
   status.textContent='Validating backup and checking for existing records…';
   try{
     const result=await previewArchiveFile(file);
     selected=result.staged;
     const a=result.summary;
     preview.textContent='Merge preview: '+a.habits+' habits, '+a.tasks+' tasks, '+a.notes+' notes, '+a.focus+' focus sessions. Existing data will not be replaced.';
     preview.hidden=false;
     apply.disabled=false;
     status.textContent='Backup verified for this account. Review the preview before importing.';
   }catch(e){status.textContent='Cannot restore: '+(e.message||'Invalid backup.');}
 });
 apply.addEventListener('click',async()=>{
   if(!selected||busy)return;
   const yes=window.confirm('Merge this backup into your current HabitArc account? Existing entries remain unchanged. Restore can add records and queue cloud sync.');
   if(!yes)return;
   busy=true;apply.disabled=true;input.disabled=true;
   status.textContent='Merging verified records…';
   try{
     const result=await restoreArchive(selected);
     status.textContent='Restore complete: '+result.habits+' habits, '+result.tasks+' tasks, '+result.notes+' notes, '+result.focus+' focus sessions. Existing data was preserved.';
     selected=null;preview.hidden=true;input.value='';
   }catch(error){
     status.textContent='Restore stopped: '+(error.message||'Storage unavailable')+'. Existing data was not intentionally replaced; retry the same backup to add any remaining records.';
     selected=null;
   }finally{busy=false;input.disabled=false;apply.disabled=true;}
 });
}
