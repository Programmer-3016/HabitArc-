import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('ARC Zen mobile home uses document scrolling and keeps conversation scroll independent',()=>{
  const css=read('app-ui.css');
  const arc=read('Arc_AI.html');
  assert.match(css,/body\.ha-arc-body:has\(#arc-zen-home:not\(\.hidden\)\)\s*\{[\s\S]*?height:auto;[\s\S]*?overflow-y:auto;/);
  assert.match(css,/body\.ha-arc-body:has\(#arc-zen-home:not\(\.hidden\)\) \.ha-arc-scroll\s*\{[\s\S]*?overflow:visible;/);
  assert.match(css,/body\.ha-arc-body:not\(:has\(#arc-zen-home:not\(\.hidden\)\)\)\s*\{[\s\S]*?padding-bottom:0;/);
  assert.match(css,/\.ha-arc-scroll\s*\{[\s\S]*?overflow-y: auto;/);
  assert.match(arc,/const wasZenHome = zenHome/);
  assert.match(arc,/typeof window\.scrollTo === 'function'/);
});

test('Small phones keep Plan, Rescue, Task and Notes date/action controls in view',()=>{
  const day=read('day-workspace.css');
  const rescue=read('rescue-mode.css');
  const tasks=read('plan-tasks.css');
  const notes=read('notes-studio.css');
  assert.match(day,/@media \(max-width:380px\)/);
  assert.match(day,/\.ha-day-datebar\s*\{[\s\S]*?grid-template-columns:40px minmax\(0,1fr\) 40px/);
  assert.match(day,/\.ha-day-peek-header\s*\{align-items:flex-start;flex-wrap:wrap\}/);
  assert.match(rescue,/\.ha-rescue-move-date\s*\{[\s\S]*?width:calc\(100% - 27px\)/);
  assert.match(rescue,/\.ha-rescue-actions\s*\{[\s\S]*?position:sticky/);
  assert.match(tasks,/\.ha-task-dialog-actions\s*\{[\s\S]*?position:sticky/);
  assert.match(notes,/\.notes-dialog-actions\s*\{[\s\S]*?position:sticky/);
  for(const [name,css] of [['app-ui.css',read('app-ui.css')],['day-workspace.css',day],['rescue-mode.css',rescue],['plan-tasks.css',tasks],['notes-studio.css',notes]]){
    assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,name+' CSS blocks');
  }
});

test('Retains five-tab mobile navigation and refreshes installed app styles',()=>{
  const html=read('Arc_AI.html');
  const nav=html.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)?.[0]||'';
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(x=>x[1]),
    ['Dashboard.html','Habits.html','Notes.html','Insights.html','Arc_AI.html']);
  assert.match(read('sw.js'),/habitarc-shell-v21/);
  assert.match(read('tests/ui-layout.mjs'),/Android 320\/360\/390px/);
  assert.match(read('tests/ui-layout.mjs'),/\[320,360,390\]/);
});
