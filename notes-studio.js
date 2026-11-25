(()=>{'use strict';
let active=null;
function mount(){
const $=s=>document.querySelector(s),grid=$('#notes-grid'),dialog=$('#note-dialog'),form=$('#note-form');
if(!grid||!dialog||!form)return;
if(active?.grid===grid)return;
active?.cleanup();
const lifecycle=new AbortController();
let disposed=false;
let dbPromise,filter='all',editing=null,photo=null,audioBlob=null,recorder=null,stream=null,urls=[],sync=null;
function recordMutation(noteId,type){
 const uid=owner();
 if(!uid||uid==='local')return;
 const key='habitarc_notes_pending:'+uid;
 try {
   const ops=JSON.parse(localStorage.getItem(key)||'{}');
   ops[noteId]={type,updatedAt:new Date().toISOString(),revision:Date.now()+Math.random()};
   localStorage.setItem(key,JSON.stringify(ops));
 }catch(error){
   console.warn('HabitArc: Notes change cannot be queued locally.',error);
 }
 sync?.retry?.();
}
const owner=()=>window.HabitArc?.getAuthUser?.()?.uid||localStorage.getItem('habitarc_active_uid')||'local';
function db(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('habitarc-notes-studio',1);req.onupgradeneeded=()=>req.result.createObjectStore('notes',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return dbPromise}
async function query(mode,note){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('notes',mode==='list'?'readonly':'readwrite'),s=tx.objectStore('notes'),r=mode==='list'?s.getAll():mode==='get'?s.get(note):mode==='delete'?s.delete(note):s.put(note);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function stopMedia(){if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());stream=null}
async function render(){if(disposed||!grid.isConnected)return;urls.forEach(u=>URL.revokeObjectURL(u));urls=[];try{const all=(await query('list')).filter(n=>n.owner===owner());if(disposed||!grid.isConnected)return;$('#notes-count').textContent=all.length;const term=$('#notes-search').value.trim().toLowerCase(),items=all.filter(n=>(filter==='all'||(filter==='image'&&n.photo)||(filter==='audio'&&n.audio)||(filter==='text'&&!n.photo&&!n.audio))&&(n.title+' '+n.body).toLowerCase().includes(term)).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt));if(!items.length){grid.innerHTML='<div class="notes-empty"><span class="material-symbols-outlined">sticky_note_2</span><h3>Nothing here yet</h3><p>Capture your first thought with the New Note button.</p></div>';return}grid.replaceChildren();const palette=['lavender','mint','peach','white'];items.forEach((n,idx)=>{const card=document.createElement('article');card.className=n.pinned?'note-card is-pinned-card':'note-card';const tone=n.pinned?'lavender':n.audio?'mint':n.photo?'peach':(n.color||palette[idx%palette.length]);card.dataset.color=tone;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Edit '+n.title);const badgeLabel=n.pinned?'📌 PINNED':n.audio?'🎙️ VOICE':n.photo?'📷 PHOTO':'NOTE';const shortDate=new Date(n.updatedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}).toUpperCase();card.innerHTML='<div class="note-card-top"><span class="note-card-type">'+badgeLabel+'</span><span class="note-card-date">'+escape(shortDate)+'</span></div><h3>'+escape(n.title)+'</h3>'+(n.body?'<p>'+escape(n.body)+'</p>':'');if(n.photo){const u=URL.createObjectURL(n.photo);urls.push(u);const img=document.createElement('img');img.src=u;img.alt='Attached photo';card.append(img)}if(n.audio){const u=URL.createObjectURL(n.audio);urls.push(u);const audio=document.createElement('audio');audio.src=u;audio.controls=true;audio.addEventListener('click',e=>e.stopPropagation());card.append(audio)}card.addEventListener('click',()=>open(n));card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open(n)}});grid.append(card)})}catch(e){grid.innerHTML='<div class="notes-empty">Could not load notes: '+escape(e.message)+'</div>'}}
function open(note=null){editing=note;photo=note?.photo||null;audioBlob=note?.audio||null;form.reset();$('#note-title').value=note?.title||'';$('#note-body').value=note?.body||'';const pinBox=$('#note-pinned');if(pinBox)pinBox.checked=Boolean(note?.pinned);$('#note-date').value=note?.date||(note?.createdAt?String(note.createdAt).slice(0,10):'')||new URLSearchParams(location.search).get('date')||new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);$('#dialog-title').textContent=note?'Edit note':'Create a note';$('#delete-note').hidden=!note;$('#attachment-status').textContent=[photo?'Photo attached':'',audioBlob?'Voice note attached':''].filter(Boolean).join(' · ');dialog.showModal();$('#note-title').focus()}
$('#new-note').addEventListener('click',()=>open());$('#close-note').addEventListener('click',()=>{stopMedia();dialog.close()});
$('#note-image').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>5*1024*1024){$('#attachment-status').textContent='Please choose an image under 5 MB.';return}photo=f;$('#attachment-status').textContent='Photo attached: '+f.name});
$('#record-audio').addEventListener('click',async()=>{if(recorder?.state==='recording'){recorder.stop();$('#record-label').textContent='Record voice';return}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('#attachment-status').textContent='Recording requires a supported browser and HTTPS.';return}try{stream=await navigator.mediaDevices.getUserMedia({audio:true});const chunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;if(disposed)return;const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});if(blob.size>8*1024*1024){$('#attachment-status').textContent='Voice note too large (8 MB maximum).';return}audioBlob=blob;$('#attachment-status').textContent='Voice note recorded. Save the note to keep it.';$('#record-label').textContent='Record voice'};recorder.start();$('#record-label').textContent='Stop recording';$('#attachment-status').textContent='Recording… tap Stop when finished.'}catch(e){$('#attachment-status').textContent='Microphone unavailable: '+e.message}});
form.addEventListener('submit',async e=>{e.preventDefault();if(recorder?.state==='recording'){recorder.stop();$('#attachment-status').textContent='Wait for the recording to finish, then save.';return}const title=$('#note-title').value.trim();if(!title)return;const now=new Date().toISOString();const note={id:editing?.id||crypto.randomUUID(),owner:owner(),title,body:$('#note-body').value.trim(),date:$('#note-date').value,photo,audio:audioBlob,cloudHasPhoto:Boolean(editing?.cloudHasPhoto)&&photo===editing?.photo,cloudHasAudio:Boolean(editing?.cloudHasAudio)&&audioBlob===editing?.audio,pinned:Boolean($('#note-pinned')?.checked),color:editing?.color||['white','lavender','mint','peach'][Math.floor(Math.random()*4)],createdAt:editing?.createdAt||now,updatedAt:now};try{await query('save',note);recordMutation(note.id,'upsert');dialog.close();await render()}catch(err){$('#attachment-status').textContent='Save failed: '+err.message}});
$('#delete-note').addEventListener('click',async()=>{if(!editing||!confirm('Delete this note?'))return;await query('delete',editing.id);recordMutation(editing.id,'delete');dialog.close();render()});
$('#notes-search').addEventListener('input',render);document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{filter=btn.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('selected',x===btn));render()}));window.addEventListener('habitarc-auth-state-changed',render,{signal:lifecycle.signal});
function cleanup(){
  disposed=true;
  sync?.stop?.();
  lifecycle.abort();
  stopMedia();
  urls.forEach(url=>URL.revokeObjectURL(url));
  urls=[];
  if(dialog.open)dialog.close();
}
active={grid,cleanup};
void import('./notes-cloud.js').then(({createNotesSync})=>{
 if(disposed)return;
 sync=createNotesSync({
   list:()=>query('list'),
   get:id=>query('get',id),
   save:note=>query('save',note),
   remove:id=>query('delete',id),
   owner,
   onUpdate:()=>void render(),
   onStatus:({message,state,pending})=>{
     const target=$('#notes-storage-label');
     if(target){target.textContent=message;target.dataset.syncState=state;target.title=pending?pending+' pending change(s)':message;}
   }
 });
 void sync.start();
}).catch(error=>{console.warn('HabitArc: cloud Notes module unavailable:',error);});
void render();
const captureRequested = new URLSearchParams(location.search).get('capture') === '1';
let capturedTitle = '';
if(captureRequested){
 try {
  const uid=owner(),key='habitarc_command_capture:'+uid;
  const draft=JSON.parse(sessionStorage.getItem(key)||'null');
  sessionStorage.removeItem(key);
  if(draft?.owner===uid&&Date.now()-draft.savedAt<5*60000) capturedTitle=String(draft.title||'').slice(0,100);
 }catch{}
}
if(captureRequested && capturedTitle){
  open();$('#note-title').value=capturedTitle;
}
const linkedId = new URLSearchParams(location.search).get('note');
if(!capturedTitle && linkedId) {
  void query('list').then(notes => {
    if(disposed || !grid.isConnected) return;
    const matching = notes.find(note => note.id === linkedId && note.owner === owner());
    if(matching) open(matching);
  }).catch(() => {});
}else if(!capturedTitle && new URLSearchParams(location.search).has('date'))open();
}
window.HabitArcNotesStudio={
  mount,
  unmount(){active?.cleanup();active=null;}
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
})();