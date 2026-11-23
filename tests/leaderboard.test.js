import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountLeaderboard, standings, tierForPoints } from '../leaderboard.js';

test('periods use the same demo roster but independently rank points', () => {
  const weekly = standings('weekly'), all = standings('allTime');
  assert.deepEqual(weekly.map(r => r.name).sort(), all.map(r => r.name).sort());
  for (const rows of [weekly, all]) {
    assert.ok(rows.every((r, i) => r.rank === i + 1 && (!i || r.points <= rows[i - 1].points)));
    assert.equal(rows.filter(r => r.self).length, 1);
    assert.ok(rows.every(r => Number.isFinite(r.streak) && r.streak > 0 && Number.isInteger(r.tone)));
  }
  assert.equal(weekly.find(r => r.self).rank, 4);
  assert.equal(all.find(r => r.self).rank, 5);
  assert.notEqual(weekly[1].name, all[1].name);
  assert.deepEqual(standings('weekly'), weekly);
});

test('tierForPoints classifies weekly and all-time thresholds consistently', () => {
  assert.equal(tierForPoints(410, 'weekly'), 'Apex Arc');
  assert.equal(tierForPoints(360, 'weekly'), 'Gold Arc');
  assert.equal(tierForPoints(350, 'weekly'), 'Silver Arc');
  assert.equal(tierForPoints(262, 'weekly'), 'Bronze Arc');
  assert.equal(tierForPoints(3320, 'allTime'), 'Apex Arc');
  assert.equal(tierForPoints(2480, 'allTime'), 'Gold Arc');
  assert.equal(tierForPoints(1580, 'allTime'), 'Silver Arc');
  assert.equal(tierForPoints(910, 'allTime'), 'Bronze Arc');
});

test('Leaderboard.html exposes classic Standings UI and treasures controls without leaking unscoped styles', () => {
  const html = readFileSync(new URL('../Leaderboard.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../leaderboard.css', import.meta.url), 'utf8');
  for (const id of ['podium', 'self-rank', 'self-gap', 'find-me', 'entries', 'announcement', 'show-league', 'show-treasures']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id} in Leaderboard.html`);
  }
  assert.doesNotMatch(html, /runner-spotlight|boost-btn|self-avatar/);
  assert.ok(!css.includes('\nbody {') && !css.includes('\ntable {'), 'leaderboard.css must stay scoped to leaderboard selectors');
});

function createNode(tag = 'div', id = '') {
  const attrs = new Map();
  const node = {
    tagName: tag.toUpperCase(),
    id,
    className: '',
    textContent: '',
    alt: '',
    src: '',
    type: '',
    hidden: false,
    tabIndex: 0,
    isConnected: true,
    dataset: {},
    style: {},
    children: [],
    listeners: new Map(),
    focused: false,
    scrolled: false,
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.get(k) ?? null; },
    append(...kids) { this.children.push(...kids); },
    replaceChildren(...kids) { this.children = [...kids]; },
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    },
    click() {
      for (const fn of this.listeners.get('click') || []) fn();
    },
    focus() { this.focused = true; },
    scrollIntoView() { this.scrolled = true; },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const out = [];
      const visit = cur => {
        for (const c of cur.children || []) {
          if (!c || typeof c !== 'object') continue;
          if (sel.startsWith('#') && c.id === sel.slice(1)) out.push(c);
          else if (sel.startsWith('.') && String(c.className).split(/\s+/).includes(sel.slice(1))) out.push(c);
          else if (sel === '[data-period]' && c.dataset?.period !== undefined) out.push(c);
          visit(c);
        }
      };
      visit(this);
      return out;
    },
  };
  return node;
}

function collectText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  return [node.textContent, ...(node.children || []).map(collectText)].filter(Boolean).join(' ');
}

test('mountLeaderboard drives period switch and classic position/standings controls', async () => {
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevMatch = globalThis.matchMedia;
  const ids = ['podium', 'self-rank', 'self-gap', 'find-me', 'roster', 'entries', 'announcement'];
  const root = createNode('main', 'board');
  const byId = new Map();
  for (const id of ids) {
    const el = createNode('div', id);
    byId.set(id, el);
    root.append(el);
  }
  const weeklyBtn = createNode('button');
  weeklyBtn.dataset.period = 'weekly';
  const allTimeBtn = createNode('button');
  allTimeBtn.dataset.period = 'allTime';
  root.append(weeklyBtn, allTimeBtn);

  globalThis.window = {};
  globalThis.document = { createElement: tag => createNode(tag) };
  globalThis.matchMedia = () => ({ matches: true });

  try {
    await mountLeaderboard(root);
    assert.equal(byId.get('podium').children.length, 3);
    assert.equal(byId.get('entries').children.length, 8);
    assert.equal(byId.get('self-rank').textContent, '#4');
    assert.match(byId.get('self-gap').textContent, /350 pts · 22 pts behind #3/);
    assert.equal(byId.get('roster').textContent, '8 demo members');
    assert.ok(collectText(byId.get('podium')).includes('MI'), 'podium renders monogram initials instead of character sprites');

    allTimeBtn.click();
    assert.equal(byId.get('self-rank').textContent, '#5');
    assert.match(byId.get('self-gap').textContent, /1,580 pts · 70 pts behind #4/);
    assert.match(byId.get('announcement').textContent, /All-time standings\. Your demo rank is 5 of 8\./);

    byId.get('find-me').click();
    const mineRow = root.querySelector('.lb-mine');
    assert.equal(mineRow.focused, true);
    assert.equal(mineRow.scrolled, true);
  } finally {
    globalThis.window = prevWin;
    globalThis.document = prevDoc;
    globalThis.matchMedia = prevMatch;
  }
});
