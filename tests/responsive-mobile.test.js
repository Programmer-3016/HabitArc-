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
  assert.match(notes,/\.notes-dialog-actions\s*\{[\s\S]*?position:\s*sticky/);
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

  // Notes Studio alignment: uses shared top navigation (no legacy .notes-topbar / 750px gap) and scoped CSS
  assert.doesNotMatch(notes,/@media\(max-width:750px\)/);
  assert.doesNotMatch(notes,/\.notes-topbar/);
  assert.match(appCss,/@media \(min-width: 768px\) and \(max-width: 1140px\)[\s\S]*?\.ha-brand-wordmark|body > header nav/);

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

test('Project-wide focus states suppress inner/Tailwind double rings and Planner 3-tab row survives SPA navigation',()=>{
  const appJs=read('app.js');
  const appUiJs=read('app-ui.js');
  const appCss=read('app-ui.css');
  const hubCss=read('productivity-hub.css');
  const notesCss=read('notes-studio.css');
  const planCss=read('plan-tasks.css');
  const dayCss=read('day-workspace.css');
  const rescueCss=read('rescue-mode.css');
  const habitsHtml=read('Habits.html');
  const addHabitHtml=read('Add_Habit.html');

  // No blanket !important neon outline on input/select/textarea inside styled wrappers
  assert.doesNotMatch(appJs,/:where\([^)]*input[^)]*\):focus-visible[\s\S]*?#10b981 !important/);

  // Composite search wrappers (Command Center + Notes Studio) move focus glow to the outer container
  assert.match(hubCss,/\.ha-command-search input,[\s\S]*?outline:\s*none !important[\s\S]*?--tw-ring-shadow:\s*0 0 #0000 !important/);
  assert.match(hubCss,/\.ha-command-search:focus-within\s*\{/);
  assert.match(notesCss,/\.notes-search input,[\s\S]*?outline:\s*none !important[\s\S]*?--tw-ring-shadow:\s*0 0 #0000 !important/);
  assert.match(notesCss,/\.notes-search:focus-within\s*\{/);

  // Boxed/underline inputs suppress @tailwindcss/forms double focus rings across pages and dialogs
  for(const [name,css] of [['app-ui.css',appCss],['plan-tasks.css',planCss],['day-workspace.css',dayCss],['rescue-mode.css',rescueCss],['Add_Habit.html',addHabitHtml]]){
    assert.match(css,/--tw-ring-shadow:\s*0 0 #0000 !important/,name+' must clear Tailwind forms ring');
  }
  assert.match(habitsHtml,/refocusedBtn\?\.focus\(\{ preventScroll: true \}\)/);

  // Planner 3-tab switcher stays 3 columns on both cold load and Dashboard -> Habits SPA navigation
  assert.match(planCss,/\.ha-plan-modes\s*\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(appUiJs,/STYLE_ORDER[\s\S]*?'plan-tasks\.css'[\s\S]*?'rescue-mode\.css'[\s\S]*?'day-workspace\.css'/);
  assert.match(appUiJs,/insertBefore\(existing, anchor\)/);
});

test('Notes Studio shares unified shell topbar and Leaderboard preloads styles before DOM swap',()=>{
  const appUiJs=read('app-ui.js');
  const appCss=read('app-ui.css');
  const notesHtml=read('Notes.html');
  const lbHtml=read('Leaderboard.html');

  // Notes shares Tailwind shell, desktop topbar CTA/streak/profile, and unified mobile header
  assert.match(notesHtml,/id="tailwind-config"/);
  assert.match(notesHtml,/href="Add_Habit\.html"/);
  assert.match(notesHtml,/id="header-streak-count-web"/);
  assert.doesNotMatch(notesHtml,/notes-topbar/);

  // Leaderboard awaits stylesheet + module before replacing <main>, and trophy SVG has explicit bounds
  assert.match(appUiJs,/targetPage === 'Leaderboard\.html'[\s\S]*?ensureLeaderboardStyles\(\)[\s\S]*?ensureLeaderboardModule\(\)/);
  assert.match(appCss,/\[hidden\]\s*\{\s*display:\s*none !important;\s*\}/);
  assert.match(lbHtml,/<svg class="lb-icon"\s+width="19"\s+height="19"[^>]*fill="none"/);
});

test('Retains five-tab mobile navigation and refreshes installed app styles',()=>{
  const html=read('Arc_AI.html');
  const nav=html.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)?.[0]||'';
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(x=>x[1]),
    ['Dashboard.html','Habits.html','Notes.html','Insights.html','Arc_AI.html']);
  assert.match(read('sw.js'), /'\/app-ui\.css'/);
  assert.match(read('sw.js'), /habitarc-shell-v33/);
  assert.match(read('tests/ui-layout.mjs'),/Android 320\/360\/390px/);
  assert.match(read('tests/ui-layout.mjs'),/\[320,360,390\]/);
});
