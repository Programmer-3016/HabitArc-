/* Account-scoped, device-local focus timer. No cloud or notification claims.
 * Completion uses wall-clock time so returning after page/tab switches is safe. */
import { localDay } from './task-store.js';

const PREFIX = 'habitarc_focus_v1:';
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n)||min));
const now = () => Date.now();
const owner = () => {
  try {
    return window.HabitArc?.getAuthUser?.()?.uid
      || window.HabitArcAuth?.getCurrentUser?.()?.uid
      || localStorage.getItem('habitarc_active_uid') || 'local';
  } catch { return 'local'; }
};
const currentKey = () => PREFIX + owner();
function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(currentKey())||'{}');
    return {
      active: parsed.active && typeof parsed.active === 'object' ? parsed.active : null,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions.slice(-500).filter(s=>s?.id && s?.date && Number(s?.minutes)>0) : []
    };
  } catch { return {active:null,sessions:[]}; }
}
function write(data) {
  localStorage.setItem(currentKey(), JSON.stringify(data));
  window.dispatchEvent?.(new CustomEvent('habitarc:focus-changed'));
}
function finalize(data, at = now()) {
  const a = data.active;
  if (a?.status === 'running' && Number.isFinite(a.endAt) && at >= a.endAt) {
    if (!data.sessions.some(s => s.id===a.id)) {
      data.sessions.push({
        id:a.id,
        date:localDay(new Date(a.startedAt)),
        minutes:clamp(a.minutes,1,180),
        taskId:a.taskId||'',
        completedAt:new Date(a.endAt).toISOString()
      });
      // Journal completion before clearing timer, including while offline.
      queueFocus(data.sessions[data.sessions.length-1]);
    }
    data.active=null;
    write(data);
    return true;
  }
  return false;
}
export function getFocusState() {
  const data=read();
  finalize(data);
  const a=data.active;
  return {
    active:a ? {...a, remainingSeconds:a.status==='running'
      ? Math.max(0,Math.ceil((a.endAt-now())/1000))
      : clamp(a.remainingSeconds,1,180*60)} : null,
    sessions:data.sessions.map(s=>({...s})),
    owner:owner()
  };
}
export function startFocus(minutes=25, taskId='') {
  const existing=getFocusState();
  if (existing.active) return existing;
  const count=clamp(Math.round(minutes),1,180);
  const started=now();
  const data=read();
  data.active={
    id:crypto.randomUUID?.()||'focus-'+started,
    minutes:count,
    taskId:String(taskId||'').slice(0,90),
    startedAt:started,
    status:'running',
    endAt:started+count*60000
  };
  write(data);
  return getFocusState();
}
export function pauseFocus() {
  const data=read();
  finalize(data);
  if (data.active?.status === 'running') {
    data.active.remainingSeconds=Math.max(1,Math.ceil((data.active.endAt-now())/1000));
    data.active.status='paused';
    delete data.active.endAt;
    write(data);
  }
  return getFocusState();
}
export function resumeFocus() {
  const data=read();
  if (data.active?.status==='paused') {
    data.active.endAt=now()+clamp(data.active.remainingSeconds,1,180*60)*1000;
    data.active.status='running';
    delete data.active.remainingSeconds;
    write(data);
  }
  return getFocusState();
}
export function cancelFocus() {
  const data=read();
  if (data.active) { data.active=null; write(data); }
  return getFocusState();
}
export function minutesOn(date) {
  return getFocusState().sessions.reduce((sum,s)=>sum+(s.date===date?Number(s.minutes)||0:0),0);
}
export function focusMinutesBetween(start,end) {
  return getFocusState().sessions.reduce((sum,s)=>sum+(s.date>=start && s.date<=end?Number(s.minutes)||0:0),0);
}


// Completed-session cloud sync. The active timer stays device-local;
// only finished sessions are uploaded and merged across signed-in devices.
const FOCUS_PENDING='habitarc_focus_pending_v1:';
const FOCUS_MIGRATED='habitarc_focus_migrated_v1:';
let focusCloudStarted=false,focusClient=null,focusUnsubscribe=null,focusAuthUnsubscribe=null;
let focusCloudOwner='local',focusPending={},focusFlushing=false;
let focusCloudStatus={state:'local',pending:0,message:'Focus history saved on this device'};
const validUid=uid=>uid&&uid!=='local';
const parseJSON=(raw,fallback)=>{try{return JSON.parse(raw)||fallback;}catch{return fallback;}};
function updateCloudStatus(state,message=''){
  focusCloudStatus={state,pending:Object.keys(focusPending).length,
    message:message||(state==='synced'?'Focus history synced':
      state==='offline'?'Offline · Focus sessions queued':
      state==='syncing'?'Focus sessions backing up…':
      state==='error'?'Focus saved locally · Cloud sync unavailable':
      'Focus history saved on this device')};
  window.dispatchEvent?.(new CustomEvent('habitarc:focus-sync-status',{detail:focusCloudStatus}));
}
export function getFocusSyncStatus(){return {...focusCloudStatus};}
function queueFocus(record,uid=owner()){
  if(!validUid(uid)||!record?.id)return;
  const key=FOCUS_PENDING+uid;
  const operations=parseJSON(localStorage.getItem(key),{});
  operations[record.id]=record;
  localStorage.setItem(key,JSON.stringify(operations));
  if(focusCloudOwner===uid){focusPending=operations;updateCloudStatus('syncing');void flushFocus();}
}
function persistFocusPending(){localStorage.setItem(FOCUS_PENDING+focusCloudOwner,JSON.stringify(focusPending));}
async function flushFocus(){
  if(focusFlushing||!focusClient||!validUid(focusCloudOwner)||navigator.onLine===false)return;
  if(focusClient.getCurrentUser?.()?.uid!==focusCloudOwner)return;
  const uid=focusCloudOwner;
  focusFlushing=true;
  try{
    for(const [sessionId,record] of Object.entries(focusPending)){
      if(uid!==focusCloudOwner||focusClient.getCurrentUser?.()?.uid!==uid||navigator.onLine===false)break;
      await focusClient.saveFocusSession(record);
      if(uid===focusCloudOwner&&focusPending[sessionId]===record){
        delete focusPending[sessionId];persistFocusPending();
      }
    }
    if(uid===focusCloudOwner)updateCloudStatus(Object.keys(focusPending).length?'syncing':'synced');
  }catch(error){
    if(uid===focusCloudOwner)updateCloudStatus('error',error?.code==='permission-denied'
      ? 'Focus Firestore rules need deployment' : 'Focus saved locally · Cloud sync unavailable');
  }finally{focusFlushing=false;}
}
async function activateFocus(uid){
  const target=validUid(uid)?uid:'local';
  focusUnsubscribe?.();focusUnsubscribe=null;
  focusCloudOwner=target;
  if(!validUid(target)){focusPending={};updateCloudStatus('local');return;}
  focusPending=parseJSON(localStorage.getItem(FOCUS_PENDING+target),{});
  if(localStorage.getItem(FOCUS_MIGRATED+target)!=='1'){
    const saved=read();
    for(const record of saved.sessions){
      if(!focusPending[record.id])focusPending[record.id]=record;
    }
    persistFocusPending();
    localStorage.setItem(FOCUS_MIGRATED+target,'1');
  }
  updateCloudStatus(navigator.onLine===false?'offline':'syncing');
  if(!focusClient?.getCurrentUser?.()||focusClient.getCurrentUser().uid!==target)return;
  focusUnsubscribe=focusClient.subscribeFocusSessions((remote,metadata)=>{
    if(focusCloudOwner!==target)return;
    const data=read(),seen=new Set(data.sessions.map(r=>r.id));
    let modified=false;
    for(const item of remote){
      if(item?.id&&!seen.has(item.id)&&!focusPending[item.id]){
        data.sessions.push(item);seen.add(item.id);modified=true;
      }
    }
    if(modified)write({...data,sessions:data.sessions.slice(-500)});
    updateCloudStatus(Object.keys(focusPending).length?'syncing':'synced');
    if(navigator.onLine!==false)void flushFocus();
  },error=>{if(focusCloudOwner===target)updateCloudStatus('error',error?.code==='permission-denied'
    ? 'Deploy Focus Firestore rules for backup' : 'Focus saved locally · Cloud unavailable');});
  void flushFocus();
}
export function startFocusCloudSync(){
  if(focusCloudStarted)return;
  focusCloudStarted=true;
  window.addEventListener('online',()=>{void flushFocus();});
  window.addEventListener('offline',()=>updateCloudStatus('offline'));
  void Promise.resolve(window.HabitArc?.whenAuthReady?.()).then(()=>window.HabitArcAuthReady).then(client=>{
    if(!client){updateCloudStatus('local');return;}
    focusClient=client;
    focusAuthUnsubscribe=client.subscribe(user=>{void activateFocus(user?.uid||'local');});
    void activateFocus(client.getCurrentUser?.()?.uid||'local');
  }).catch(()=>updateCloudStatus('local','Focus saved locally · Sign-in unavailable'));
}
