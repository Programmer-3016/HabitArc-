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
