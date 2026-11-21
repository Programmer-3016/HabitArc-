/* Explicit Android/PWA background Web Push opt-in; Firebase owner-scoped storage.
 * Never auto-requests notification permissions or silently subscribes devices.
 * Vercel server must report Firebase Admin + scheduler configured before offering enable. */
const API='/api/push-config';
const ID_KEY='habitarc_push_device_id';
const OWNER_KEY='habitarc_push_device_owner';
const publicUid=()=>window.HabitArc?.getAuthUser?.()?.uid||'';
const getId=()=>{
 let id=localStorage.getItem(ID_KEY);
 if(!id||!/^[a-z0-9-]{16,60}$/i.test(id)){id=crypto.randomUUID();localStorage.setItem(ID_KEY,id);}
 return id;
};
function vapidToBytes(key){
 const base64=key.replace(/-/g,'+').replace(/_/g,'/');
 const binary=atob(base64+'='.repeat((4-base64.length%4)%4));
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function firebaseStore(){
 await window.HabitArc?.whenAuthReady?.();
 const [{getApp},{getFirestore,doc,setDoc,updateDoc,deleteField,FieldPath}]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js')
 ]);
 return {db:getFirestore(getApp()),doc,setDoc,updateDoc,deleteField,FieldPath};
}
async function getSubscription(){
 if(!('serviceWorker' in navigator)||!('PushManager' in window))return null;
 const registration=await navigator.serviceWorker.ready;
 return registration.pushManager.getSubscription();
}
async function ensureOwner(){
 const uid=publicUid(),previous=localStorage.getItem(OWNER_KEY);
 if(previous&&uid!==previous){
  // A shared browser should never continue receiving the previous account's push.
  try{const current=await getSubscription();await current?.unsubscribe();}catch{}
  localStorage.removeItem(OWNER_KEY);
 }
 return uid;
}
async function updateServerDoc(uid,deviceId,subscription){
 const {db,doc,setDoc}=await firebaseStore();
 if(uid!==publicUid())throw new Error('Account changed during subscription.');
 const settings=window.HabitArc?.getReminderPreferences?.()||{};
 await setDoc(doc(db,'users',uid),{pushDevices:{[deviceId]:{
  enabled:true,subscription:subscription.toJSON(),
  timeZone:'Asia/Kolkata', // Hobby cron runs once daily at approx 08:30–09:30 IST
  morningPlan:true,taskAlerts:true,
  updatedAt:new Date().toISOString()
 }}},{merge:true});
}
async function removeServerDoc(uid,deviceId){
 const {db,doc,updateDoc,deleteField,FieldPath}=await firebaseStore();
 await updateDoc(doc(db,'users',uid),new FieldPath('pushDevices',deviceId),deleteField());
}
export async function enableBackgroundPush(){
 if(!window.isSecureContext||!('Notification' in window)||!('PushManager' in window)||!('serviceWorker' in navigator))
   throw new Error('Web Push is unavailable in this browser/PWA.');
 const config=await fetch(API,{cache:'no-store'}).then(r=>r.json());
 if(!config.available||!config.publicKey)
   throw new Error(config.reason||'Background push backend requires Firebase Admin setup.');
 const uid=await ensureOwner();
 if(!uid||uid==='local')throw new Error('Sign in before enabling background push.');
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw new Error('Notification permission was not granted.');
 const registration=await navigator.serviceWorker.ready;
 let subscription=await registration.pushManager.getSubscription();
 if(!subscription){
  subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidToBytes(config.publicKey)});
 }
 try{
  await updateServerDoc(uid,getId(),subscription);
  localStorage.setItem(OWNER_KEY,uid);
 }catch(error){
  await subscription.unsubscribe().catch(()=>{});
  throw new Error('Could not save push subscription securely. '+(error.message||''));
 }
 return {enabled:true,cadence:config.cadence};
}
export async function disableBackgroundPush(){
 const uid=publicUid(),registered=localStorage.getItem(OWNER_KEY);
 if(uid&&uid===registered){
  try{await removeServerDoc(uid,getId());}
  catch(error){console.warn('Push removal will be retried after the subscription expires.',error);}
 }
 try{const sub=await getSubscription();await sub?.unsubscribe();}catch{}
 localStorage.removeItem(OWNER_KEY);
 return {enabled:false};
}
export async function sanitizePushAccount(){
 try{await ensureOwner();}catch{}
}
export function mountBackgroundPush(root=document){
 const enable=root.getElementById('ha-bg-push-enable'),disable=root.getElementById('ha-bg-push-disable'),
   status=root.getElementById('ha-bg-push-status');
 if(!enable||!disable||!status||enable.dataset.bound)return;
 enable.dataset.bound='true';
 const setStatus=text=>{status.textContent=text;};
 async function refresh(){
  const uid=await ensureOwner(),sub=await getSubscription();
  const ready=Boolean(sub&&uid&&localStorage.getItem(OWNER_KEY)===uid);
  disable.hidden=!ready;
  enable.hidden=ready;
  if(ready){setStatus('Registered on this device. Daily background digest is scheduled around 08:30–09:30 IST; delivery depends on the browser and backend.');return;}
  if(!('PushManager' in window)||!('Notification' in window)){enable.disabled=true;setStatus('Background push is unavailable in this browser.');return;}
  try{
   const config=await fetch(API,{cache:'no-store'}).then(r=>r.json());
   enable.disabled=!config.available;
   setStatus(config.available
    ?'Available: opt in to one daily background digest around 08:30–09:30 IST. Precise deadline alarms are not supported.'
    :'Not active yet: '+(config.reason||'secure backend setup required.'));
  }catch{enable.disabled=true;setStatus('Push availability could not be checked.');}
 }
 enable.addEventListener('click',async()=>{
  enable.disabled=true;setStatus('Requesting notification permission and registering this device…');
  try{await enableBackgroundPush();await refresh();}
  catch(error){setStatus('Not enabled: '+(error.message||'Push subscription failed.'));enable.disabled=false;}
 });
 disable.addEventListener('click',async()=>{
  disable.disabled=true;setStatus('Removing background push subscription…');
  try{await disableBackgroundPush();}catch(error){setStatus('Could not disable push: '+error.message);}
  finally{disable.disabled=false;await refresh();}
 });
 void refresh();
}
