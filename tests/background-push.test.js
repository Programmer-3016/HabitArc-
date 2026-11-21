import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validPushSubscription,describeDueTasks,normalisePushDevice,isoInZone} from '../api/_push-common.js';
import {getPushConfiguration} from '../api/push-config.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const subscription={
 endpoint:'https://fcm.googleapis.com/fcm/send/abc',
 keys:{p256dh:'abcdefghijk_0123456789abcdefghijk',auth:'abcdefghijk_012345'}
};
test('Push endpoints reject non-HTTPS, attacker hosts and malformed auth keys',()=>{
 assert.equal(validPushSubscription(subscription),true);
 for(const endpoint of [
  'http://fcm.googleapis.com/fcm/send','https://fcm.googleapis.com.evil.test/a',
  'https://127.0.0.1/a','file:///etc/passwd','https://example.com/x',
  'https://fcm.googleapis.com:444/a'
 ])assert.equal(validPushSubscription({...subscription,endpoint}),false,endpoint);
 assert.equal(validPushSubscription({...subscription,keys:{p256dh:'a',auth:'abc'}}),false);
});
test('Push readiness fails closed without Admin/VAPID/cron secrets',()=>{
 assert.equal(getPushConfiguration({}).available,false);
 assert.equal(getPushConfiguration({HABITARC_VAPID_PUBLIC_KEY:'a'.repeat(87),HABITARC_VAPID_PRIVATE_KEY:'x',CRON_SECRET:'x'}).available,false);
 const ready=getPushConfiguration({HABITARC_VAPID_PUBLIC_KEY:'a'.repeat(87),HABITARC_VAPID_PRIVATE_KEY:'x',
  FIREBASE_SERVICE_ACCOUNT_JSON:'configured',CRON_SECRET:'x'});
 assert.equal(ready.available,true);
 assert.equal(Object.hasOwn(ready,'privateKey'),false);
});
test('Daily digest counts due and overdue tasks without disclosing titles',()=>{
 assert.deepEqual(describeDueTasks([
  {dueDate:'2026-11-21',completed:false,title:'private'},
  {dueDate:'2026-11-20',completed:false,title:'secret'},
  {dueDate:'2026-11-21',completed:true},
  {dueDate:'2026-11-22',completed:false}
 ],'2026-11-21'),{due:1,overdue:1});
 const state=normalisePushDevice({enabled:true,subscription,
  updatedAt:new Date().toISOString(),morningPlan:true,taskAlerts:true});
 assert.equal(state?.enabled,true);
 assert.equal(state?.morningPlan,true);
 assert.equal(isoInZone(new Date('2026-11-21T03:00:00Z'),'Asia/Kolkata').length,10);
});
test('Web Push controls are opt-in, and service worker supports closed-app reception',()=>{
 const ui=read('Settings.html');
 assert.match(ui,/id="ha-bg-push-enable"/);
 assert.match(ui,/id="ha-bg-push-disable"/);
 assert.match(ui,/08:30–09:30 IST/);
 const client=read('push-subscriptions.js');
 assert.match(client,/enable\.addEventListener\('click'/);
 assert.match(client,/Notification\.requestPermission\(\)/);
 assert.match(client,/new FieldPath\('pushDevices',deviceId\)/);
 const worker=read('sw.js');
 assert.match(worker,/self\.addEventListener\('push'/);
 assert.match(worker,/habitarc-shell-v24/);
 assert.match(worker,/push-subscriptions\.js/);
 const config=JSON.parse(read('vercel.json'));
 assert.deepEqual(config.crons,[{path:'/api/push-cron',schedule:'0 3 * * *'}]);
 assert.match(read('api/push-cron.js'),/timingSafeEqual/);
 assert.match(read('api/push-cron.js'),/getPushConfiguration\(\)\.available/);
});
