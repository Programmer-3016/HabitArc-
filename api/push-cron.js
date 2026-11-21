/* Vercel authenticated daily India-time background digest.
 * On Hobby, Vercel invokes daily cron at any time in the scheduled UTC hour.
 * No secrets or individual task titles ever appear in logs/responses.
 */
import { timingSafeEqual } from 'node:crypto';
import { describeDueTasks,isoInZone,normalisePushDevice } from './_push-common.js';
import { getPushConfiguration } from './push-config.js';

function authorized(value,secret){
 if(!secret||!value)return false;
 const received=Buffer.from(String(value),'utf8');
 const expected=Buffer.from('Bearer '+secret,'utf8');
 return received.length===expected.length&&timingSafeEqual(received,expected);
}
export async function openPushFirestore(env=process.env){
 const raw=String(env.FIREBASE_SERVICE_ACCOUNT_JSON||env.FIREBASE_SERVICE_ACCOUNT_BASE64||'').trim();
 if(!raw)throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');
 const json=JSON.parse(raw.startsWith('{')?raw:Buffer.from(raw,'base64').toString('utf8'));
 if(!json.project_id||!json.client_email||!json.private_key)throw new Error('Invalid Firebase Admin configuration');
 const [{getApps,initializeApp,cert},{getFirestore,FieldPath,FieldValue}]=await Promise.all([
  import('firebase-admin/app'),import('firebase-admin/firestore')
 ]);
 const app=getApps().find(a=>a.name==='habitarc-push')||initializeApp({credential:cert(json)},'habitarc-push');
 return {db:getFirestore(app),FieldPath,FieldValue};
}
export async function dispatchDailyPush({db,FieldPath,FieldValue,webpush,at=new Date(),maxUsers=160}){
 const date=isoInZone(at,'Asia/Kolkata'),users=await db.collection('users').limit(maxUsers).get();
 let sent=0,skipped=0,expired=0,failed=0;
 for(const user of users.docs){
  const devices=user.data()?.pushDevices||{};
  if(!devices||typeof devices!=='object'||Array.isArray(devices))continue;
  const candidates=Object.entries(devices).filter(([id,raw])=>
   /^[a-z0-9-]{16,60}$/i.test(id)&&normalisePushDevice(raw)?.enabled===true).slice(0,4);
  if(!candidates.length)continue;
  let tasks=[];
  try{
   const snap=await user.ref.collection('tasks').select('completed','dueDate').limit(400).get();
   tasks=snap.docs.map(row=>row.data());
  }catch{ /* Do not block a generic reminder if Tasks sync is unavailable. */ }
  const summary=describeDueTasks(tasks,date);
  for(const [deviceId,raw] of candidates){
   const device=normalisePushDevice(raw);
   if(!device || (!device.taskAlerts&&!device.morningPlan) || device.lastSentDay===date){skipped++;continue;}
   let leased=false;
   // Firestore transaction avoids duplicate messages on accidental concurrent cron invocations.
   try{
    await db.runTransaction(async txn=>{
     const fresh=await txn.get(user.ref),record=fresh.data()?.pushDevices?.[deviceId];
     const state=normalisePushDevice(record);
     if(!state||!state.enabled||state.lastSentDay===date||state.leaseDay===date)return;
     txn.update(user.ref,new FieldPath('pushDevices',deviceId,'leaseDay'),date);
     leased=true;
    });
    if(!leased){skipped++;continue;}
    const body=(summary.due||summary.overdue)&&device.taskAlerts
     ?'Synced tasks: '+summary.due+' due today · '+summary.overdue+' overdue. Tap to review.'
     :'Open HabitArc to review your habits and tasks for today.';
    await webpush.sendNotification(device.subscription,JSON.stringify({
     title:'HabitArc daily check-in',body,url:'/Habits.html',tag:'habitarc-daily-'+date
    }),{TTL:3600,urgency:'normal'});
    await user.ref.update(new FieldPath('pushDevices',deviceId,'lastSentDay'),date);
    sent++;
   }catch(error){
    failed++;
    const gone=error?.statusCode===404||error?.statusCode===410;
    if(gone){
     try{await user.ref.update(new FieldPath('pushDevices',deviceId),FieldValue.delete());}
     catch{ /* Client can also disable and remove its device. */ }
     expired++;
    }else{
     // A transient failure can be retried manually after clearing the lease.
     try{await user.ref.update(new FieldPath('pushDevices',deviceId,'leaseDay'),'');}catch{}
    }
   }
  }
 }
 return {date,sent,skipped,expired,failed,scannedUsers:users.docs.length};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method-not-allowed'});}
 if(!process.env.CRON_SECRET)return res.status(503).json({error:'push-cron-not-configured'});
 if(!authorized(req.headers.authorization,process.env.CRON_SECRET))return res.status(401).json({error:'unauthorized'});
 if(!getPushConfiguration().available)return res.status(503).json({error:'push-backend-not-ready'});
 try{
  const {db,FieldPath,FieldValue}=await openPushFirestore();
  const module=await import('web-push');const webpush=module.default||module;
  webpush.setVapidDetails('https://habit-arc.vercel.app',
    process.env.HABITARC_VAPID_PUBLIC_KEY,process.env.HABITARC_VAPID_PRIVATE_KEY);
  const summary=await dispatchDailyPush({db,FieldPath,FieldValue,webpush});
  return res.status(200).json(summary);
 }catch(error){
  console.error('HabitArc push dispatch failed',error?.name||'Error');
  return res.status(503).json({error:'push-dispatch-unavailable'});
 }
}
