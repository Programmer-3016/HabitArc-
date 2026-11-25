import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const fourTabs = ['Dashboard.html', 'Habits.html', 'Notes.html', 'Insights.html'];

test('Notes mobile and desktop headers match the unified HabitArc app shell', () => {
  const html = source('Notes.html');
  const css = source('notes-studio.css');
  assert.match(html, /class="notes-mobile-header\b/);
  assert.match(html, /id="tailwind-config"/);
  assert.match(html, /href="Add_Habit\.html"/);
  assert.match(html, /id="header-streak-count-web"/);
  assert.doesNotMatch(html, /notes-topbar/);
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.match(css, /header\.notes-mobile-header > div\s*\{[\s\S]*?display:\s*flex !important/);
  assert.match(css, /header\.notes-mobile-header\s*\{\s*display:\s*none !important/);
  assert.doesNotMatch(css, /(?:^|\n)\s*body\s*\{/);
});

test('every app page has the same four tabs (Today, Plan, Notes, Insights), no raised Add action', () => {
  const pages = ['Dashboard.html', 'Habits.html', 'Notes.html', 'Insights.html', 'Arc_AI.html',
    'Leaderboard.html', 'Profile.html', 'Settings.html', 'Add_Habit.html', 'Habit_Detail.html'];
  for (const page of pages) {
    const html = source(page);
    const nav = html.match(/<nav class="ha-bottom-nav[^"]*"[^>]*>[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `Missing shared bottom nav in ${page}`);
    const hrefs = [...nav.matchAll(/<a [^>]*href="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(hrefs, fourTabs, `Wrong tab order in ${page}`);
    assert.doesNotMatch(nav, /href="Add_Habit\.html"/);
  }
});

test('four-column mobile dock has no raised notch', () => {
  const css = source('app-ui.css');
  assert.doesNotMatch(css, /clip-path:\s*inset\(0 0 39px 0\)/);
  assert.doesNotMatch(css, /margin:\s*-22px auto 0/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\) !important/);
  assert.match(css, /body > nav\.ha-bottom-nav > a\.ha-bottom-nav-link/);
});

test('Add habit is still accessible from Habits page', () => {
  assert.match(source('Habits.html'), /class="ha-habits-create-btn"[^>]*|class="ha-habits-create-btn"/);
  assert.match(source('Habits.html'), /href="Add_Habit.html" class="ha-habits-create-btn"/);
});

test('Notes assets are part of the installable app shell', () => {
  const sw = source('sw.js');
  assert.match(sw, /'\/Notes\.html'/);
  assert.match(sw, /'\/notes-studio\.css'/);
  assert.match(sw, /'\/notes-studio\.js'/);
});
