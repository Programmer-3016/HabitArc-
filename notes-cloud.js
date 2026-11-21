/**
 * Notes sync bridge. IndexedDB is always the source for on-device edits and media.
 * A durable per-account operation journal prevents offline saves from being lost.
 * Firestore receives private text/metadata; Storage holds attachments separately.
 */
const PREFIX='habitarc_notes_pending:';
const MIGRATION='habitarc_notes_migration_v1:';
const parse=(value,fallback)=>{try{return JSON.parse(value)||fallback;}catch{return fallback;}};
const readKey=(key)=>{try{return localStorage.getItem(key);}catch{return null;}};
const writeKey=(key,value)=>{localStorage.setItem(key,value);};
const online=()=>typeof navigator==='undefined'||navigator.onLine!==false;
const validScope=(uid)=>typeof uid==='string'&&uid.length>0&&uid!=='local';

export function createNotesSync({ list, get, save, remove, owner, onUpdate, onStatus }) {
  let alive=true,cloud=null,scope='local',pending={},unsubscribeAuth=null,unsubscribeCloud=null,flushing=false;
  let remoteSerial=0,started=false,mediaWarning=false,cloudError='';
  const current=()=>owner();
  function tell(state,detail='') {
    if(!alive)return;
    const queued=Object.keys(pending).length;
    const labels={
      local:'Private to this device · Sign in to sync',
      connecting:'Connecting Notes backup…',
      offline:'Offline · Changes saved here',
      pending:queued+' note change'+(queued===1?'':'s')+' waiting to sync',
      synced:'Notes backed up to your account',
      media:'Text backed up · Media storage unavailable',
      error:detail||'Notes saved here · Cloud backup unavailable'
    };
    onStatus({state,message:labels[state]||labels.error,pending:queued});
  }
  function readPending(uid){
    const value=parse(readKey(PREFIX+uid),{});
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }
  function persist(){
    writeKey(PREFIX+scope,JSON.stringify(pending));
  }
  function journal(noteId,type){
    const uid=current();
    if(!validScope(uid)) { tell('local');return; }
    // A changed account must not leak one user's mutations into another journal.
    const operations=uid===scope?pending:readPending(uid);
    operations[noteId]={type,updatedAt:new Date().toISOString(),revision:Date.now()+Math.random()};
    writeKey(PREFIX+uid,JSON.stringify(operations));
    if(uid===scope) {
      pending=operations;
      tell(online()?'pending':'offline');
      void flush();
    }
  }
  async function migrate(uid){
    const key=MIGRATION+uid;
    if(readKey(key)==='1')return;
    const local=(await list()).filter(item=>item.owner===uid);
    if(!alive||uid!==scope)return;
    for(const note of local) {
      if(!pending[note.id]) pending[note.id]={type:'upsert',migration:true,updatedAt:note.updatedAt||new Date().toISOString(),revision:Date.now()+Math.random()};
    }
    persist();
    writeKey(key,'1');
  }
  async function syncRemote(records,metadata,uid,seq){
    if(!alive||uid!==scope)return;
    let changes=0,mediaFailed=false;
    const notes=await list();
    if(!alive||uid!==scope||seq!==remoteSerial)return;
    const originals=new Map(notes.filter(n=>n.owner===uid).map(n=>[n.id,n]));
    for(const remote of records){
      if(!alive||uid!==scope||seq!==remoteSerial)return;
      const local=originals.get(remote.id);
      if(pending[remote.id]?.migration && String(remote.updatedAt||'')>String(local?.updatedAt||'')){
        delete pending[remote.id];persist();
      }
      if(pending[remote.id])continue;
      if(!remote.deleted&&local&&String(local.updatedAt)>String(remote.updatedAt||'')){
        journal(remote.id,'upsert');
        continue;
      }
      if(remote.deleted){
        if(local){await remove(remote.id);changes++;}
        continue;
      }
      const sameVersion=local&&local.updatedAt===remote.updatedAt;
      if(sameVersion
        && (!remote.hasPhoto||local.photo)
        && (!remote.hasAudio||local.audio))continue;
      let photo=sameVersion?local?.photo||null:null;
      let audio=sameVersion?local?.audio||null:null;
      if(remote.hasPhoto&&!photo){
        try{photo=await cloud.getNoteMedia(remote.id,'photo');}
        catch{mediaFailed=true;photo=local?.photo||null;}
      }
      if(remote.hasAudio&&!audio){
        try{audio=await cloud.getNoteMedia(remote.id,'audio');}
        catch{mediaFailed=true;audio=local?.audio||null;}
      }
      if(!alive||uid!==scope||seq!==remoteSerial)return;
      await save({
        id:remote.id,owner:uid,title:remote.title,body:remote.body,
        date:remote.date,pinned:remote.pinned,color:remote.color,
        createdAt:remote.createdAt,updatedAt:remote.updatedAt,
        photo,audio,cloudHasPhoto:remote.hasPhoto,cloudHasAudio:remote.hasAudio
      });
      changes++;
    }
    if(!alive||uid!==scope)return;
    if(changes)onUpdate();
    mediaWarning=mediaFailed;
    if(Object.keys(pending).length)tell(online()?'pending':'offline');
    else tell(mediaWarning?'media':'synced');
    if(online())void flush();
  }
  async function flush(){
    if(flushing||!cloud||!validScope(scope)||!online()||!alive)return;
    if(cloud.getCurrentUser?.()?.uid!==scope)return;
    const uid=scope;
    flushing=true;
    let failed=false,hasMediaError=false;
    try{
      for(const [id,op] of Object.entries(pending)){
        if(!alive||scope!==uid||cloud.getCurrentUser?.()?.uid!==uid||!online())break;
        try{
          if(op.type==='delete')await cloud.deleteNoteCloud(id,op.updatedAt);
          else{
            const note=await get(id);
            if(!note||note.owner!==uid) {
              // Avoid resurrecting a record deleted while a save was in flight.
              await cloud.deleteNoteCloud(id,op.updatedAt);
            } else {
              await cloud.saveNoteCloud(note);
            }
          }
          if(scope===uid&&pending[id]?.revision===op.revision){
            delete pending[id];
            persist();
          }
        }catch(error){
          failed=true;
          hasMediaError=error?.code?.startsWith('storage/')||/Storage|bucket|media|CORS|blaze/i.test(error?.message||'');
          cloudError=hasMediaError
            ? 'Text notes saved when possible · Media backup needs Storage setup'
            : error?.code==='permission-denied'
              ? 'Notes cloud rules need deployment'
              : 'Cloud sync unavailable · Notes safe on this device';
          break; // Do not hammer an unavailable backend.
        }
      }
    }finally{
      flushing=false;
      if(!alive||scope!==uid)return;
      if(!online())tell('offline');
      else if(failed)tell(hasMediaError?'media':'error',cloudError);
      else tell(Object.keys(pending).length?'pending':mediaWarning?'media':'synced');
      // A user edit can arrive while a previous upload is in flight.
      if(!failed&&Object.keys(pending).length&&online())queueMicrotask(()=>void flush());
    }
  }
  async function activate(uid){
    if(!alive)return;
    const target=validScope(uid)?uid:'local';
    unsubscribeCloud?.();unsubscribeCloud=null;
    scope=target;remoteSerial++;
    pending=validScope(scope)?readPending(scope):{};
    if(!validScope(scope)){tell('local');onUpdate();return;}
    if(!cloud?.getCurrentUser?.()||cloud.getCurrentUser().uid!==scope)return;
    tell(online()?'connecting':'offline');
    await migrate(scope);
    if(!alive||scope!==target)return;
    unsubscribeCloud=cloud.subscribeNotes((data,metadata)=>{
      const serial=++remoteSerial;
      void syncRemote(data,metadata,target,serial).catch(error=>{
        if(alive&&scope===target)tell('error','Cloud download unavailable; local notes preserved.');
        console.warn('HabitArc Notes cloud merge:',error);
      });
    },error=>{
      if(!alive||scope!==target)return;
      cloudError=error?.code==='permission-denied'
        ? 'Deploy Notes Firestore rules to enable backup'
        : 'Notes sync temporarily offline · Local copy safe';
      tell('error',cloudError);
    });
    // First reconcile remote versions before uploading migrated local notes.
  }
  async function start(){
    if(started)return;
    started=true;
    scope=current();
    pending=validScope(scope)?readPending(scope):{};
    tell(validScope(scope)?'connecting':'local');
    window.addEventListener('online',()=>{if(alive)void flush();},{signal:listener.signal});
    window.addEventListener('offline',()=>{if(alive)tell('offline');},{signal:listener.signal});
    try{
      await window.HabitArc?.whenAuthReady?.();
      const client=await window.HabitArcAuthReady;
      if(!alive||!client) {tell('local');return;}
      cloud=client;
      // subscribe() delivers initial user state; do not double-subscribe.
      unsubscribeAuth=client.subscribe(user=>{void activate(user?.uid||'local');});
    }catch{
      tell('error','Cloud sign-in unavailable · Local notes safe');
    }
  }
  const listener=new AbortController();
  return {
    start,
    upsert(note){if(note?.id)journal(note.id,'upsert');},
    delete(noteId){if(noteId)journal(noteId,'delete');},
    retry(){
      if(validScope(scope))pending=readPending(scope);
      void flush();
    },
    status(){return {scope,pending:Object.keys(pending).length};},
    stop(){alive=false;listener.abort();unsubscribeAuth?.();unsubscribeCloud?.();remoteSerial++;}
  };
}
