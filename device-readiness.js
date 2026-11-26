/* Android/PWA beta readiness: observable device status, never claims native release. */
async function checkSupport(){
 const secure=window.isSecureContext===true;
 const sw='serviceWorker' in navigator;
 const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||
                  navigator.standalone===true;
 const notifications='Notification' in window?Notification.permission:'unsupported';
 let cached=false;
 if('caches' in window) {
   try{cached=(await caches.keys()).some(k=>/^habitarc-shell-v\d+$/.test(k));}catch{}
 }
 let storage='unknown',usage='';
 if(navigator.storage?.persisted){
   try{storage=(await navigator.storage.persisted())?'persistent':'best effort';}catch{}
 }
 if(navigator.storage?.estimate){
   try{
     const v=await navigator.storage.estimate();
     usage=v.usage?Math.round(v.usage/1024/1024)+' MB cached':'';
   }catch{}
 }
 const cloud=window.HabitArc?.getCloudSyncStatus?.();
 const reminderPrefs=window.HabitArc?.getReminderPreferences?.();
 const timedHabits=(window.HabitArc?.getHabits?.()||[]).filter(h=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(h?.reminder||''))).length;
 const reminderMode=reminderPrefs?.nativeSupported
   ? 'Native exact alarms ('+timedHabits+' timed)'
   : (reminderPrefs?.dailyReminder && notifications==='granted'
     ? 'Active while open ('+timedHabits+' timed)'
     : (timedHabits+' timed · enable Daily Reminder'));
 return [
   {label:'Secure HTTPS context',ok:secure,value:secure?'Available':'Not secure'},
   {label:'Offline service worker',ok:sw&&cached,value:sw?(cached?'Cached shell found':'Shell not cached yet'):'Unavailable'},
   {label:'Installed PWA',ok:Boolean(standalone),value:standalone?'Running standalone':'Opened in browser'},
   {label:'Notification permission',ok:notifications==='granted'||reminderPrefs?.permission==='granted',value:reminderPrefs?.permission||notifications},
   {label:'Habit reminder engine',ok:Boolean(reminderPrefs?.dailyReminder&&(notifications==='granted'||reminderPrefs?.permission==='granted')),value:reminderMode},
   {label:'Local storage protection',ok:storage==='persistent',value:storage+(usage?' · '+usage:'')},
   {label:'Habit cloud connection',ok:Boolean(cloud?.connected),value:cloud?.connected?'Connection reported':'Not verified / offline'}
 ];
}
export function mountDeviceReadiness(root=document){
 const trigger=root.getElementById('ha-device-check'),body=root.getElementById('ha-device-results');
 if(!trigger||!body||trigger.dataset.bound)return;
 trigger.dataset.bound='true';
 trigger.addEventListener('click',async()=>{
   trigger.disabled=true;body.textContent='Checking device features…';
   try{
     const values=await checkSupport();
     body.replaceChildren(...values.map(item=>{
       const row=document.createElement('div');
       row.className='ha-device-row';
       const label=document.createElement('span');label.textContent=item.label;
       const result=document.createElement('strong');result.textContent=item.value;
       result.dataset.ready=String(item.ok);
       row.append(label,result);
       return row;
     }));
   }catch(error){body.textContent='Could not finish device checks. Please retry.';}
   finally{trigger.disabled=false;}
 });
}
