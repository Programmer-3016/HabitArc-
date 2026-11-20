/* HabitArc optional dashboard widgets and habit media journal.
   Media is private to this browser/device (IndexedDB), not uploaded to Firebase. */
(() => {
'use strict';
const $ = (s, root=document) => root.querySelector(s);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scope = () => window.HabitArc?.getAuthUser?.()?.uid || localStorage.getItem('habitarc_active_uid') || 'local';
const widgetKey = () => 'habitarc:widgets:' + scope();
const defaultWidgets = ['week','streak','notes'];
const allWidgets = {week:['Weekly goal','check_circle'],streak:['Streak tracker','local_fire_department'],notes:['Media journal','collections_bookmark']};
let dbPromise;
function database() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local media storage.'));
  if (!dbPromise) dbPromise = new Promise((resolve,reject) => {
    const req = indexedDB.open('habitarc-media-journal',1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('notes',{keyPath:'id'});
      store.createIndex('ownerHabit',['owner','habitId']);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function getNotes(habitId) {
  const db = await database();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('notes','readonly');
    const req = tx.objectStore('notes').getAll();
    req.onsuccess = () => resolve(req.result.filter(n => n.owner===scope() && (!habitId || n.habitId===habitId)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
    req.onerror = () => reject(req.error);
  });
}
async function storeNote(note) {
  const db = await database();
  return new Promise((resolve,reject) => {
    const req = db.transaction('notes','readwrite').objectStore('notes').put(note);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
async function removeNote(id) {
  const db = await database();
  return new Promise((resolve,reject) => {
    const req = db.transaction('notes','readwrite').objectStore('notes').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function readWidgets() {
  try { const saved = JSON.parse(localStorage.getItem(widgetKey())); return Array.isArray(saved) ? saved.filter(x=>allWidgets[x]) : defaultWidgets; }
  catch { return defaultWidgets; }
}
function widgetMarkup(id,notesCount) {
  const habits = window.HabitArc?.getHabits?.() || [];
  const today = window.HabitArc?.getTodayProgress?.() || {};
  const streak = window.HabitArc?.getOverallCurrentStreak?.() || 0;
  const values = {
    week: [String(today.completed ?? 0) + ' / ' + String(today.total ?? habits.length),'habits completed today'],
    streak: [streak + ' days','current streak'],
    notes: [String(notesCount),'notes saved on this device']
  };
  return '<article class="ha-extra-widget"><div class="ha-extra-widget-label"><span class="material-symbols-outlined" aria-hidden="true">'+allWidgets[id][1]+'</span>'+allWidgets[id][0]+'</div><strong>'+escape(values[id][0])+'</strong><p>'+escape(values[id][1])+'</p></article>';
}
async function renderWidgets() {
  const grid=$('#ha-extra-widgets-grid'); if(!grid) return;
  const selected=readWidgets();
  let count=0; try { count=(await getNotes()).length; } catch {}
  grid.innerHTML=selected.length ? selected.map(id=>widgetMarkup(id,count)).join('') : '<p class="ha-extra-muted">No widgets selected. Choose Customize to add some.</p>';
  const choices=$('#ha-extra-widget-choices');
  if(choices) choices.innerHTML=Object.entries(allWidgets).map(([id,[label]])=>'<label><input type="checkbox" value="'+id+'" '+(selected.includes(id)?'checked':'')+'/> '+escape(label)+'</label>').join('');
}
function initWidgets() {
  const anchor=$('#habits-container'); if(!anchor || $('#ha-extra-widgets')) return;
  const section=document.createElement('section');
  section.id='ha-extra-widgets'; section.className='ha-extra-section';
  section.innerHTML='<div class="ha-extra-heading"><h2>My widgets</h2><button type="button" id="ha-extra-customize" aria-expanded="false"><span class="material-symbols-outlined" aria-hidden="true">tune</span> Customize</button></div><div id="ha-extra-widget-choices" class="ha-extra-choices" hidden></div><div id="ha-extra-widgets-grid" class="ha-extra-grid"></div>';
  anchor.closest('section')?.before(section);
  $('#ha-extra-customize').addEventListener('click',()=>{
    const panel=$('#ha-extra-widget-choices');panel.hidden=!panel.hidden;
    $('#ha-extra-customize').setAttribute('aria-expanded',String(!panel.hidden));
  });
  $('#ha-extra-widget-choices').addEventListener('change',e=>{
    if(!e.target.matches('input[type=checkbox]'))return;
    const selected=[...$('#ha-extra-widget-choices').querySelectorAll('input:checked')].map(x=>x.value);
    try {localStorage.setItem(widgetKey(),JSON.stringify(selected));}catch {}
    void renderWidgets();
  });
  window.addEventListener('habitarc:data-changed',()=>void renderWidgets());
  window.addEventListener('habitarc-auth-state-changed',()=>void renderWidgets());
  void renderWidgets();
}
function formatDate(value) {return new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function showStatus(message) {const el=$('#ha-note-status');if(el)el.textContent=message;}
let activeUrls=[];
async function renderNotes(habitId) {
  const list=$('#ha-notes-list');if(!list)return;
  activeUrls.forEach(url=>URL.revokeObjectURL(url));activeUrls=[];
  let notes;
  try {notes=await getNotes(habitId);}catch(err){list.innerHTML='<p class="ha-extra-muted">'+escape(err.message)+'</p>';return;}
  if(!notes.length){list.innerHTML='<p class="ha-extra-muted">No reflections yet. Add a photo, voice note or text entry.</p>';return;}
  list.replaceChildren();
  for(const note of notes){
    const article=document.createElement('article');article.className='ha-note-item';
    const header=document.createElement('div');header.className='ha-note-head';
    const label=document.createElement('div');
    label.innerHTML='<span class="material-symbols-outlined" aria-hidden="true">'+(note.type==='audio'?'mic':note.type==='image'?'image':'edit_note')+'</span><span>'+escape(note.title||({audio:'Voice reflection',image:'Progress photo',text:'Text reflection'}[note.type]))+'</span>';
    const remove=document.createElement('button');remove.type='button';remove.className='ha-note-remove';remove.textContent='Delete';remove.setAttribute('aria-label','Delete '+(note.title||'note'));
    remove.addEventListener('click',async()=>{if(!confirm('Delete this note from this device?'))return;try{await removeNote(note.id);await renderNotes(habitId);showStatus('Note deleted.');}catch(err){showStatus(err.message);}});
    header.append(label,remove);article.append(header);
    const meta=document.createElement('small');meta.textContent=formatDate(note.createdAt);article.append(meta);
    if(note.type==='text'){const p=document.createElement('p');p.textContent=note.text;article.append(p);}
    if(note.blob instanceof Blob){
      const url=URL.createObjectURL(note.blob);activeUrls.push(url);
      if(note.type==='image'){const img=document.createElement('img');img.src=url;img.alt=note.title||'Habit progress photo';img.className='ha-note-photo';article.append(img);}
      if(note.type==='audio'){const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=url;article.append(audio);}
    }
    list.append(article);
  }
}
function initNotes() {
  const main=$('main.ha-detail');if(!main || $('#ha-notes'))return;
  const habitId=new URLSearchParams(location.search).get('id');
  if(!habitId)return;
  const section=document.createElement('section');section.id='ha-notes';section.className='ha-extra-section ha-note-section';
  section.innerHTML='<div class="ha-extra-heading"><div><h2>Habit journal</h2><p class="ha-extra-muted">Voice, photo and text reflections</p></div></div><div class="ha-note-actions"><button type="button" id="ha-add-text"><span class="material-symbols-outlined">edit_note</span> Text</button><button type="button" id="ha-add-photo"><span class="material-symbols-outlined">add_photo_alternate</span> Photo</button><button type="button" id="ha-add-audio"><span class="material-symbols-outlined">mic</span> Record</button></div><div id="ha-text-editor" class="ha-text-editor" hidden><label for="ha-note-text">Your reflection</label><textarea id="ha-note-text" rows="3" maxlength="2000" placeholder="How did this habit go today?"></textarea><button type="button" id="ha-save-text">Save reflection</button></div><input id="ha-photo-input" type="file" accept="image/*" hidden/><p class="ha-extra-muted">Media stays on this device. It does not sync to Firebase or other devices.</p><p id="ha-note-status" class="ha-note-status" role="status" aria-live="polite"></p><div id="ha-notes-list" class="ha-notes-list"></div>';
  main.append(section);
  $('#ha-add-text').addEventListener('click',()=>{$('#ha-text-editor').hidden=!$('#ha-text-editor').hidden;});
  $('#ha-save-text').addEventListener('click',async()=>{
    const text=$('#ha-note-text').value.trim();if(!text){showStatus('Write a reflection first.');return;}
    try{await storeNote({id:crypto.randomUUID(),owner:scope(),habitId,type:'text',text,createdAt:new Date().toISOString()});$('#ha-note-text').value='';$('#ha-text-editor').hidden=true;showStatus('Reflection saved on this device.');await renderNotes(habitId);}catch(err){showStatus('Could not save note: '+err.message);}
  });
  $('#ha-add-photo').addEventListener('click',()=>$('#ha-photo-input').click());
  $('#ha-photo-input').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!file.type.startsWith('image/')){showStatus('Choose an image file.');return;}
    if(file.size>8*1024*1024){showStatus('Choose an image smaller than 8 MB.');return;}
    try{await storeNote({id:crypto.randomUUID(),owner:scope(),habitId,type:'image',title:file.name.slice(0,100),blob:file,createdAt:new Date().toISOString()});showStatus('Photo saved on this device.');await renderNotes(habitId);}catch(err){showStatus('Could not save photo: '+err.message);}
    e.target.value='';
  });
  let recorder,stream,chunks=[];
  const button=$('#ha-add-audio');
  button.addEventListener('click',async()=>{
    if(recorder?.state==='recording'){recorder.stop();button.innerHTML='<span class="material-symbols-outlined">mic</span> Record';return;}
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){showStatus('Audio recording is not supported in this browser.');return;}
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      chunks=[];recorder=new MediaRecorder(stream);
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=async()=>{
        stream?.getTracks().forEach(t=>t.stop());stream=null;
        const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});
        if(blob.size>10*1024*1024){showStatus('Recording exceeds 10 MB. Please record a shorter note.');return;}
        if(!blob.size){showStatus('No audio was recorded.');return;}
        try{await storeNote({id:crypto.randomUUID(),owner:scope(),habitId,type:'audio',blob,createdAt:new Date().toISOString()});showStatus('Voice reflection saved on this device.');await renderNotes(habitId);}catch(err){showStatus('Could not save recording: '+err.message);}
      };
      recorder.start();button.innerHTML='<span class="material-symbols-outlined">stop_circle</span> Stop';showStatus('Recording… tap Stop to save.');
    }catch(err){stream?.getTracks().forEach(t=>t.stop());showStatus('Microphone unavailable: '+err.message);}
  });
  void renderNotes(habitId);
  window.addEventListener('habitarc-auth-state-changed',()=>void renderNotes(habitId));
}
function init(){initWidgets();initNotes();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
