/* Local-first personal archive. Export is client-only; never uploads private data. */
const SIZE_LIMIT=90*1024*1024;
const DATA_LABEL='habitarc-personal-archive';
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const parse=(raw,fallback)=>{try{return JSON.parse(raw)||fallback;}catch{return fallback;}};
const scope=()=>{try{return window.HabitArc?.getAuthUser?.()?.uid||localStorage.getItem('habitarc_active_uid')||'local';}catch{return 'local';}};
async function readNotes(uid){
 if(!('indexedDB' in window))return [];
 return new Promise((resolve,reject)=>{
   const request=indexedDB.open('habitarc-notes-studio',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('notes'))request.result.createObjectStore('notes',{keyPath:'id'});};
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
     const db=request.result;
     const query=db.transaction('notes','readonly').objectStore('notes').getAll();
     query.onsuccess=()=>{db.close();resolve(query.result.filter(note=>note.owner===uid));};
     query.onerror=()=>{db.close();reject(query.error);};
   };
 });
}
async function encodeBlob(blob){
 if(!blob)return null;
 const buffer=new Uint8Array(await blob.arrayBuffer());
 // Chunking avoids call-stack overflow on large photo/voice files.
 let encoded='';
 for(let i=0;i<buffer.length;i+=32768){
   encoded+=String.fromCharCode(...buffer.subarray(i,i+32768));
 }
 return {mimeType:blob.type||'application/octet-stream',base64:btoa(encoded)};
}
export async function buildPersonalArchive(){
 const uid=scope();
 const habitsKey=uid==='local'?'habitarc_data':'habitarc_data:'+uid;
 const savedHabits=parse(localStorage.getItem(habitsKey),{});
 const tasks=parse(localStorage.getItem('habitarc_tasks_data:'+uid),[]);
 const focus=parse(localStorage.getItem('habitarc_focus_v1:'+uid),{active:null,sessions:[]});
 const notes=await readNotes(uid);
 let size=0;
 const mapped=[];
 for(const note of notes){
   size+=(note.photo?.size||0)+(note.audio?.size||0);
   if(size>SIZE_LIMIT)throw new Error('Attachments exceed 90 MB. Back up smaller collections from Notes before continuing.');
   const {photo,audio,...meta}=note;
   mapped.push({...meta,photo:await encodeBlob(photo),audio:await encodeBlob(audio)});
 }
 return {
   type:DATA_LABEL,version:1,exportedAt:new Date().toISOString(),
   // Owner is informational; never contains credentials or Firebase tokens.
   owner:uid,habits:savedHabits,tasks,focus,notes:mapped
 };
}
export async function downloadPersonalArchive(){
 const archive=await buildPersonalArchive();
 const blob=new Blob([JSON.stringify(archive)],{type:'application/json'});
 const link=document.createElement('a');
 const url=URL.createObjectURL(blob);
 link.href=url;link.download='HabitArc-backup-'+today()+'.json';
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
 return {notes:archive.notes.length,tasks:archive.tasks.length,size:blob.size};
}
export function mountBackup(root=document){
 const button=root.getElementById('download-backup-btn');
 const status=root.getElementById('backup-download-status');
 if(!button||!status||button.dataset.bound)return;
 button.dataset.bound='true';
 button.addEventListener('click',async()=>{
   button.disabled=true;
   status.textContent='Preparing encrypted-free personal archive locally…';
   try{
     const result=await downloadPersonalArchive();
     status.textContent='Backup downloaded: '+result.notes+' notes, '+result.tasks+' tasks. Keep this unencrypted file private.';
   }catch(error){
     status.textContent='Backup failed: '+(error?.message||'Could not read device data.');
   }finally{button.disabled=false;}
 });
}
