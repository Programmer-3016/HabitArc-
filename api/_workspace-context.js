/* Strictly bounded OPTIONAL workspace data. Client fields are unverified.
 * Never let member-provided note text or task names become privileged instructions. */
const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const isObject=o=>o&&typeof o==='object'&&!Array.isArray(o);
const keysOnly=(o,keys)=>Object.keys(o).every(k=>keys.includes(k));

export function normaliseWorkspaceContext(value){
 if(value==null)return null;
 if(!isObject(value)||!keysOnly(value,['tasks','focus','notes']))throw new RangeError('Invalid workspace context.');
 const output={};
 if(Object.hasOwn(value,'tasks')){
  if(!Array.isArray(value.tasks)||value.tasks.length>12)throw new RangeError('Too many tasks in context.');
  output.tasks=value.tasks.map(task=>{
   if(!isObject(task)||!keysOnly(task,['title','dueDate','priority','completed'])||
      typeof task.title!=='string'||task.title.length>120||
      typeof task.dueDate!=='string'||task.dueDate.length>10||
      !['none','low','medium','high'].includes(task.priority)||typeof task.completed!=='boolean'||
      (task.dueDate!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)))throw new RangeError('Invalid task context.');
   return {title:clean(task.title,120),dueDate:task.dueDate,priority:task.priority,completed:task.completed};
  });
 }
 if(Object.hasOwn(value,'focus')){
  if(!Array.isArray(value.focus)||value.focus.length>20)throw new RangeError('Too many focus sessions.');
  output.focus=value.focus.map(session=>{
   if(!isObject(session)||!keysOnly(session,['date','minutes'])||
      typeof session.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(session.date)||
      !Number.isInteger(session.minutes)||session.minutes<1||session.minutes>180)
     throw new RangeError('Invalid focus context.');
   return {date:session.date,minutes:session.minutes};
  });
 }
 if(Object.hasOwn(value,'notes')){
  if(!Array.isArray(value.notes)||value.notes.length>3)throw new RangeError('Too many selected notes.');
  output.notes=value.notes.map(note=>{
   if(!isObject(note)||!keysOnly(note,['title','excerpt'])||
     typeof note.title!=='string'||note.title.length>100||
     typeof note.excerpt!=='string'||note.excerpt.length>850)
      throw new RangeError('Invalid selected note.');
   return {title:clean(note.title,100),excerpt:clean(note.excerpt,850)};
  });
 }
 return Object.keys(output).length?output:null;
}
