/* Common safe, bounded daily background digest helpers.
 * Device push endpoints are untrusted: only known browser push providers are sent to. */
export function validPushSubscription(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 if(typeof value.endpoint!=='string'||value.endpoint.length>2000)return false;
 let url;try{url=new URL(value.endpoint);}catch{return false;}
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash)return false;
 const hostname=url.hostname.toLowerCase();
 if(!['fcm.googleapis.com','fcm-xm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(hostname)
     && !hostname.endsWith('.push.apple.com'))return false;
 if(!value.keys||typeof value.keys!=='object')return false;
 return ['p256dh','auth'].every(key=>typeof value.keys[key]==='string'&&
   /^[A-Za-z0-9_-]{8,256}$/.test(value.keys[key]));
}
export function isoInZone(now=new Date(),timeZone='Asia/Kolkata'){
 let parts;
 try{
  parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 }catch{
  parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 }
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return [values.year,values.month,values.day].join('-');
}
export function describeDueTasks(tasks,today){
 let due=0,overdue=0;
 for(const task of tasks||[]){
  if(task?.completed || !/^\d{4}-\d{2}-\d{2}$/.test(task?.dueDate||''))continue;
  if(task.dueDate===today)due++;
  if(task.dueDate<today)overdue++;
 }
 return {due,overdue};
}
export function normalisePushDevice(raw){
 if(!raw||typeof raw!=='object'||!validPushSubscription(raw.subscription))return null;
 const timeZone=typeof raw.timeZone==='string'&&raw.timeZone.length<=70?raw.timeZone:'Asia/Kolkata';
 const age=Date.now()-Date.parse(raw.updatedAt||'');
 if(!Number.isFinite(age)||age>60*86400000||age<-(86400000))return null;
 return {
  subscription:raw.subscription,
  timeZone,
  enabled:raw.enabled===true,
  taskAlerts:raw.taskAlerts===true,
  morningPlan:raw.morningPlan===true,
  lastSentDay:typeof raw.lastSentDay==='string'?raw.lastSentDay:'',
  leaseDay:typeof raw.leaseDay==='string'?raw.leaseDay:''
 };
}
