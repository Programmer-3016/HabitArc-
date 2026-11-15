import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../Insights.html', import.meta.url), 'utf8');
const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const now = Date.parse('2026-11-15T12:00:00Z');
class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
}
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function insights({ empty = false, signedIn = false } = {}) {
    const elements = new Map();
    const events = new Map();
    const requests = [];
    function element() {
        const classes = new Set();
        return {
            textContent: '', innerHTML: '', value: '', disabled: false, attrs: {}, handlers: {},
            nextElementSibling: { textContent: '' }, style: { setProperty() {} },
            classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle: (value, on) => on ? classes.add(value) : classes.delete(value) },
            setAttribute(name, value) { this.attrs[name] = String(value); },
            addEventListener(name, handler) { this.handlers[name] = handler; },
            focus() {},
        };
    }
    for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, element());
    const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const habits = empty ? [] : ['Read <20> pages', 'Walk'].map((name, index) => {
        const completions = {};
        for (let i = 1; i <= 21; i++) {
            const date = new Clock(); date.setDate(date.getDate() - i);
            if (i <= 5 || (i >= 8 && i <= 10)) completions[dateKey(date)] = true;
        }
        return { id: `habit-${index}`, name, icon: 'book', completions, createdAt: '2026-10-01' };
    });
    const heatmap = Array.from({ length: 365 }, (_, index) => {
        const day = new Clock(); day.setDate(day.getDate() - 364 + index);
        return { date: dateKey(day), count: !empty && index > 350 ? 2 : 0, level: !empty && index > 350 ? 4 : 0 };
    });
    const app = {
        getSettings: () => ({ userName: 'Sarthak Chauhan' }),
        getOverallCompletionRate: () => empty ? 0 : 85,
        getConsistencyScore: () => empty ? 'F' : 'A-',
        getOverallLongestStreak: () => empty ? 0 : 12,
        getHabits: () => habits, escapeHTML,
        getBestHabit: () => habits[0] ? { habit: habits[0], rate: 90 } : null,
        getWeakestHabit: () => habits[1] ? { habit: habits[1], rate: 70 } : null,
        getCurrentStreak: () => 5,
        getTodayHabits: () => habits, isCompletedToday: id => id === 'habit-0',
        getBestDay: () => ({ day: 'Monday', rate: empty ? 0 : 90 }),
        get365DayHeatmap: () => heatmap,
        getBadges: () => [{ title: 'First <Arc>', description: 'Completed your first habit', icon: 'auto_awesome', unlocked: !empty }, { title: '7-Day Streak', description: 'Seven days', icon: 'local_fire_department', unlocked: false }],
        whenAuthReady: async () => signedIn ? { uid: 'qa-user' } : null,
        getAuthToken: async () => 'qa-token',
    };
    vm.runInNewContext(source, {
        HabitArc: app, Date: Clock, Intl, AbortSignal,
        console: { warn() {} },
        document: { getElementById: id => elements.get(id) || null },
        window: { addEventListener: (name, handler) => events.set(name, handler) },
        fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ answer: 'Focus on your routine.', usage: { remaining: 4 } }) }; },
    });
    return { elements, events, requests };
}

test('Insights overview retains its real metric and percentage-point rendering contract', () => {
    const page = insights();
    assert.equal(page.elements.get('metric-progress').textContent, '85%');
    assert.equal(page.elements.get('metric-consistency').textContent, 'A-');
    assert.equal(page.elements.get('metric-streak').textContent, '12d');
    assert.equal(page.elements.get('metric-trend').textContent, '+28 pp');
    assert.match(page.elements.get('todays-story-list').innerHTML, /Read &lt;20&gt; pages/);
    page.events.get('habitarc:data-changed')({ detail: { source: 'cloud' } });
    assert.equal(page.elements.get('metric-progress').textContent, '85%');
});

test('Insights calendar preserves all 365 dates and exposes month and date labels', () => {
    const page = insights();
    const calendar = page.elements.get('heatmap-grid-365').innerHTML;
    assert.equal((calendar.match(/role="img"/g) || []).length, 365);
    assert.match(calendar, /2025-11-16: 0 completions/);
    assert.match(calendar, /2026-11-15: 2 completions/);
    assert.match(page.elements.get('heatmap-month-labels').innerHTML, />Jan</);
    assert.match(page.elements.get('heatmap-date-range').textContent, /Nov 16, 2025.*Nov 15, 2026/);
    const badges = page.elements.get('badges-grid').innerHTML;
    assert.match(badges, /First &lt;Arc&gt;/);
    assert.match(badges, /aria-label="Unlocked"/);
    assert.match(badges, /aria-label="Locked"/);
    assert.doesNotMatch(badges, /truncate/);
});

test('Insights empty history retains honest insufficient-data and empty spotlight states', () => {
    const page = insights({ empty: true });
    assert.equal(page.elements.get('metric-trend').textContent, 'Not enough data');
    assert.equal(page.elements.get('metric-trend').classList.contains('ha-insights-metric-empty'), true);
    assert.equal(page.elements.get('strongest-name').textContent, 'No habits yet');
    assert.match(page.elements.get('coach-note-text').textContent, /Complete habits for a few days/);
});

test('restyled Coach still blocks guest requests before calling an API', async () => {
    const page = insights();
    page.elements.get('ai-coach-question').value = 'Where can I improve?';
    page.elements.get('ai-coach-form').handlers.submit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.requests.length, 0);
    assert.match(page.elements.get('ai-coach-status').textContent, /sign in/);
    assert.equal(page.elements.get('ai-coach-submit').disabled, false);
});

test('restyled Coach preserves authenticated question submission and text-only answers', async () => {
    const page = insights({ signedIn: true });
    page.elements.get('ai-coach-question').value = 'Where can I improve?';
    page.elements.get('ai-coach-form').handlers.submit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.requests[0].url, '/api/coach');
    assert.equal(page.requests[0].options.headers.Authorization, 'Bearer qa-token');
    assert.equal(JSON.parse(page.requests[0].options.body).question, 'Where can I improve?');
    assert.equal(page.elements.get('ai-coach-answer').textContent, 'Focus on your routine.');
    assert.match(page.elements.get('ai-coach-status').textContent, /4 secure Coach messages/);
});
