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
  for(const [name,css] of [['app-ui.css',read('app-ui.css')],['day-workspace.css',day],['rescue-mode.css',rescue],['plan-tasks.css',tasks],['notes-studio.css',notes],['leaderboard.css',read('leaderboard.css')],['consistency-shield.css',read('consistency-shield.css')]]){
    assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,name+' CSS blocks');
  }
});

test('Desktop, tablet, and narrow phone UI responsiveness guards stay intact across shell and modules',()=>{
  const appCss=read('app-ui.css');
  const notes=read('notes-studio.css');
  const rescue=read('rescue-mode.css');
  const shield=read('consistency-shield.css');
  const day=read('day-workspace.css');
  const tasks=read('plan-tasks.css');
  const lb=read('leaderboard.css');
  const runner=read('streak-runner.js');
  const onboarding=read('Onboarding.html');

  // Shared desktop tablet topbar (768-1140px) & Habit Detail title truncation
  assert.match(appCss,/@media \(min-width: 768px\) and \(max-width: 1140px\)[\s\S]*?body > header nav[\s\S]*?overflow-x:\s*auto/);
  assert.match(appCss,/body > header #habit-name-title\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(appCss,/body > header\.md\\:hidden a\.ha-hdr-profile\s*\{[^}]*width:\s*31px !important/);
  assert.match(appCss,/\.ha-insights-spotlight-row > div:nth-child\(2\)\s*\{\s*min-width:\s*0;\s*\}/);

  // Notes Studio alignment: no 751-767px breakpoint gap and tablet nav remains scrollable
  assert.doesNotMatch(notes,/@media\(max-width:750px\)/);
  assert.match(notes,/@media\(min-width:768px\) and \(max-width:1080px\)[\s\S]*?\.notes-desktop-nav\{[^}]*overflow-x:auto/);

  // Rescue dialog uses viewport width (not dvh) for max-width on mobile
  assert.doesNotMatch(rescue,/max-width:calc\(100dvh/);
  assert.match(rescue,/\.ha-rescue-dialog\s*\{[\s\S]*?max-width:calc\(100vw/);

  // Shield, Workspace & Planner grids prevent flex/grid blowout
  assert.match(shield,/min-width:min\(170px,100%\)/);
  assert.match(day,/\.ha-day-bottom\{[^}]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(tasks,/\.ha-task-field-pair\s*\{[^}]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(lb,/\.lb-standings table\s*\{[\s\S]*?table-layout:\s*fixed/);

  // Streak runner stage scrolls on short desktop/phone heights; Onboarding allows zoom
  assert.match(runner,/\.ha-sr-stage\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(runner,/@media \(max-height:\s*740px\)/);
  assert.doesNotMatch(onboarding,/user-scalable=no|maximum-scale=1\.0/);
});

test('Retains five-tab mobile navigation and refreshes installed app styles',()=>{
  const html=read('Arc_AI.html');
  const nav=html.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)?.[0]||'';
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(x=>x[1]),
    ['Dashboard.html','Habits.html','Notes.html','Insights.html','Arc_AI.html']);
  assert.match(read('sw.js'), /'\/app-ui\.css'/);
  assert.match(read('sw.js'), /habitarc-shell-v31/);
  assert.match(read('tests/ui-layout.mjs'),/Android 320\/360\/390px/);
  assert.match(read('tests/ui-layout.mjs'),/\[320,360,390\]/);
});
