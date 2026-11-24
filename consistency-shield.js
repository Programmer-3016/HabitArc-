/* ARC Consistency Shield — transparent habits risk triage, not an AI prediction. */
import { taskStore, newTask, localDay } from './task-store.js';
const DAYS=['sun','mon','tue','wed','thu','fri','sat'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shift=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return localDay(d);};
export function analyzeConsistency(habits,history=[],today=localDay()){
 const completed=new Set((history||[]).filter(r=>r.status==='completed').map(r=>r.habitId+'|'+r.date));
 const scored=[];
 for(const habit of habits||[]){
   const days=[];
   for(let i=1;i<=14;i++){
     const date=shift(today,-i);
     if(habit.createdAt&&habit.createdAt>date)continue;
     if(habit.repeat&&!habit.repeat.includes(DAYS[new Date(date+'T12:00:00').getDay()]))continue;
     days.push({date,done:Boolean(habit.completions?.[date]||completed.has(habit.id+'|'+date))});
   }
   if(days.length<5)continue;
   const missed=days.filter(d=>!d.done).length;
   const recentMisses=days.slice(0,3).filter(d=>!d.done).length;
   const rate=Math.round((days.length-missed)/days.length*100);
   const atRisk=recentMisses>=2&&rate<75;
   scored.push({id:habit.id,title:habit.name||'Habit',icon:habit.icon||'repeat',days:days.length,missed,recentMisses,rate,atRisk,
     suggestion:'Try just 2 minutes of '+(habit.name||'this habit')+' today.'});
 }
 return scored.filter(item=>item.atRisk)
   .sort((a,b)=>b.recentMisses-a.recentMisses||a.rate-b.rate||b.missed-a.missed)
   .slice(0,2);
}
let mounted=null;
export function mountConsistencyShield(root=document.getElementById('ha-shield')){
 if(!root||!root.isConnected)return;
 if(mounted?.root===root)return;
 mounted?.cleanup?.();
 const controller=new AbortController(),signal=controller.signal;
 taskStore.start();
 function render(){
   if(!root.isConnected)return;
   const habits=window.HabitArc?.getHabits?.()||[];
   const history=window.HabitArc?.getCompletionHistory?.()||[];
   const risks=analyzeConsistency(habits,history);
   const body=root.querySelector('#ha-shield-results');
   if(!body)return;
   if(!risks.length){
     body.innerHTML='<p class="ha-shield-ok"><span class="material-symbols-outlined" aria-hidden="true">verified</span><span><strong>Shield clear</strong> · Steady over last 14d</span></p>';
     return;
   }
   const pending=taskStore.getTasks(),today=localDay();
   body.innerHTML=risks.map(h=>{
     const title='2-minute reset: '+h.title.slice(0,125);
     const exists=pending.some(t=>!t.completed&&t.dueDate===today&&t.habitId===h.id&&t.title===title);
     return '<article class="ha-shield-item"><span class="ha-shield-inline-ico material-symbols-outlined" aria-hidden="true">shield</span>'+
       '<div class="ha-shield-item-content"><strong>Shield: '+esc(h.title)+' missed '+h.recentMisses+'d</strong><span>'+h.rate+'% over 14d · '+esc(h.suggestion)+'</span></div>'+
       '<button type="button" data-shield-id="'+esc(h.id)+'"'+(exists?' disabled':'')+'>'+
       (exists?'Added ✓':'2m Reset')+'</button></article>';
   }).join('');
 }
 root.addEventListener('click',e=>{
   const btn=e.target.closest('[data-shield-id]');
   if(!btn||btn.disabled)return;
   const id=btn.dataset.shieldId;
   const habit=window.HabitArc?.getHabitById?.(id);
   if(!habit)return;
   if(!window.confirm('Add a 2-minute reset task for '+habit.name+' to today’s Plan? Your habit goal and streak stay unchanged.'))return;
   const title='2-minute reset: '+habit.name.slice(0,125),date=localDay();
   const existing=taskStore.getTasks().some(t=>!t.completed&&t.dueDate===date&&t.habitId===id&&t.title===title);
   if(existing){render();return;}
   try{taskStore.put(newTask({title,habitId:id,dueDate:date,priority:'low',description:'Tiny restart, not a replacement for the original habit.'}));render();}
   catch(error){const st=root.querySelector('#ha-shield-status');if(st)st.textContent='Could not add task: '+(error.message||'storage error');}
 },{signal});
 window.addEventListener('habitarc:data-changed',render,{signal});
 const unsub=taskStore.subscribe(render);
 mounted={root,cleanup(){controller.abort();unsub();}};
 render();
}
export function unmountConsistencyShield(){mounted?.cleanup();mounted=null;}
if(typeof window!=='undefined')window.HabitArcConsistencyShield={mount:mountConsistencyShield,unmount:unmountConsistencyShield};
