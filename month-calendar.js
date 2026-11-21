/* Pure monthly schedule metadata for HabitArc's Day Workspace. */
import { localDay, safeDate } from './task-store.js';
const DAYS=['sun','mon','tue','wed','thu','fri','sat'];
export function monthInfo(dateKey){
 const match=/^(\d{4})-(\d{2})$/.exec(String(dateKey||''));
 if(!match)throw new RangeError('Invalid calendar month');
 const year=Number(match[1]),month=Number(match[2]);
 if(year<2000||year>2100||month<1||month>12)throw new RangeError('Invalid calendar month');
 const count=new Date(year,month,0).getDate();
 const leading=(new Date(year,month-1,1).getDay()+6)%7; // Monday first
 return {year,month,count,leading};
}
export function addMonths(monthKey,delta){
 const {year,month}=monthInfo(monthKey);
 const d=new Date(year,month-1+delta,1,12);
 return localDay(d).slice(0,7);
}
export function buildMonthCells(monthKey,tasks=[],habits=[],completed=[]){
 const {year,month,count,leading}=monthInfo(monthKey);
 const done=new Set((Array.isArray(completed)?completed:[]).filter(r=>r?.status==='completed').map(r=>r.habitId+'|'+r.date));
 const days=[];
 for(let i=0;i<leading;i++)days.push(null);
 for(let day=1;day<=count;day++){
   const date=localDay(new Date(year,month-1,day,12));
   const dayCode=DAYS[new Date(year,month-1,day,12).getDay()];
   const due=(tasks||[]).filter(t=>safeDate(t.dueDate)===date);
   const scheduled=(habits||[]).filter(h=>
     (!h.createdAt||h.createdAt<=date)&&(!h.repeat||h.repeat.includes(dayCode)));
   const complete=scheduled.filter(h=>h.completions?.[date]||done.has(h.id+'|'+date)).length;
   days.push({date,day,taskCount:due.length,tasksDone:due.filter(t=>t.completed).length,
     habitCount:scheduled.length,habitsDone:complete});
 }
 return days;
}
