import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildHabitCoachContext, renderCoachMarkdown } from '../habit-analytics.js';

const html = readFileSync(new URL('../Arc_AI.html', import.meta.url), 'utf8');
const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/^import\s+\{[^}]+\}\s+from\s+['"].+?['"];?\s*/m, '');
const now = Date.parse('2026-11-15T12:00:00Z');

class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
}
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function arcAi({ empty = false, signedIn = false } = {}) {
    const elements = new Map();
    const events = new Map();
    const requests = [];
    const announced = [];
    function element() {
        const classes = new Set();
        let htmlMarkup = '';
        let plainText = '';
        return {
            get textContent() { return plainText; },
            set textContent(v) { plainText = String(v ?? ''); },
            get innerHTML() { return htmlMarkup; },
            set innerHTML(v) { htmlMarkup = String(v ?? ''); plainText = htmlMarkup.replace(/<[^>]+>/g, ''); },
            value: '', placeholder: '', disabled: false,
            attrs: {}, handlers: {}, scrollHeight: 36,
            style: { height: '', setProperty() {} },
            classList: {
                add: value => classes.add(value),
                remove: value => classes.delete(value),
                contains: value => classes.has(value),
                toggle: (value, on) => on === undefined
                    ? (classes.has(value) ? classes.delete(value) : classes.add(value))
                    : (on ? classes.add(value) : classes.delete(value)),
            },
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
            if (index === 1 ? i <= 18 : (i <= 5 || (i >= 8 && i <= 10))) completions[dateKey(date)] = true;
        }
        return { id: `habit-${index}`, name, icon: 'book', completions, createdAt: '2026-10-01' };
    });
    const addedHabits = [];
    const updatedHabits = [];
    const app = {
        getSettings: () => ({ userName: 'Alex' }),
        getHabits: () => habits,
        getCompletionHistory: () => [],
        getOverallCurrentStreak: () => empty ? 0 : 14,
        getOverallLongestStreak: () => empty ? 0 : 14,
        addHabit: payload => { const h = { id: `new-${addedHabits.length}`, ...payload }; addedHabits.push(h); habits.push(h); return { success: true, habit: h }; },
        updateHabit: (id, updates) => { updatedHabits.push({ id, updates }); return true; },
        escapeHTML,
        whenAuthReady: async () => signedIn ? { uid: 'qa-user' } : null,
        getAuthUser: () => signedIn ? { uid: 'qa-user' } : null,
        getAuthToken: async () => 'qa-token',
        flushCloudSync: async () => {},
    };
    const body = element();
    vm.runInNewContext(source, {
        HabitArc: app, buildHabitCoachContext, renderCoachMarkdown, Date: Clock, Intl, AbortSignal, AbortController,
        setTimeout, clearTimeout,
        navigator: { onLine: true },
        console: { warn() {} },
        document: { getElementById: id => elements.get(id) || null, addEventListener: () => {}, hidden: false, body, activeElement: null },
        window: { addEventListener: (name, handler) => events.set(name, handler), HabitArcUI: { announce: msg => announced.push(msg) } },
        fetch: async (url, options) => {
            requests.push({ url, options });
            return {
                ok: true,
                json: async () => ({
                    answer: 'Try reading 10 minutes right after dinner.',
                    suggestedAction: {
                        type: 'create_habit',
                        name: '10-Min Wind-Down',
                        category: 'Mindfulness',
                        reminder: '21:15',
                        repeat: ['mon', 'wed', 'fri'],
                        why: 'Anchor bedtime consistency'
                    },
                    usage: { remaining: 6 },
                    snapshot: { habitCount: 2, dateWindow: { start: '2026-10-18', end: '2026-11-15' }, timeZone: 'UTC', insufficientData: false, truncated: false },
                }),
            };
        },
    });
    return { elements, events, requests, announced, addedHabits, updatedHabits, body };
}

test('Arc_AI keeps 4A Zen cards with 4D 28-day momentum check and locked 100dvh shell', () => {
    assert.match(html, /class="[^"]*ha-arc-body[^"]*"/);
    assert.doesNotMatch(html, /<body[^>]*min-h-screen/);
    assert.match(html, /interactive-widget=resizes-content/);
    assert.ok(html.includes('id="arc-scroll-area"'));
    assert.ok(!html.includes('ARC AI · ONLINE'));
    const mobileNav = html.match(/<nav class="md:hidden[\s\S]*?<\/nav>/)[0];
    assert.deepEqual([...mobileNav.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['Dashboard.html', 'Habits.html', 'Add_Habit.html', 'Insights.html', 'Arc_AI.html']);
    const mobileHeader = html.match(/<header class="[^"]*md:hidden[\s\S]*?<\/header>/)[0];
    assert.ok(mobileHeader.includes('href="Profile.html"'));
    assert.ok(!mobileHeader.includes('href="Settings.html"'));
    assert.ok(mobileHeader.includes('>HabitArc<'));
    const deskHeader = html.match(/<header class="hidden md:block[\s\S]*?<\/header>/)[0];
    assert.ok(!deskHeader.includes('href="Settings.html"'));
    const deskNav = deskHeader.match(/<nav[\s\S]*?<\/nav>/)[0];
    assert.deepEqual([...deskNav.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['Dashboard.html', 'Habits.html', 'Insights.html', 'Arc_AI.html']);

    const ids = ['arc-card-priority', 'arc-card-streak', 'arc-card-trend', 'arc-card-momentum'];
    for (let i = 0; i < ids.length - 1; i++) {
        assert.ok(html.indexOf(`id="${ids[i]}"`) < html.indexOf(`id="${ids[i + 1]}"`), `${ids[i]} precedes ${ids[i + 1]}`);
    }
    assert.doesNotMatch(html, /Suggested stack/i);
    assert.match(html, /28-day momentum check/);

    const view = arcAi();
    view.elements.get('ai-coach-question').handlers.focus();
    assert.equal(view.body.classList.contains('is-arc-typing'), true);
});

test('Arc_AI populates dynamic 4A cards + 4D momentum metrics and handles empty state cleanly', () => {
    const active = arcAi();
    assert.equal(active.elements.get('header-streak-count').textContent, '14d');
    assert.equal(active.elements.get('arc-streak-badge').textContent, '14D');
    assert.equal(active.elements.get('arc-streak-title').textContent, 'Protect my 14d streak');
    assert.match(active.elements.get('arc-priority-title').textContent, /Read <20> pages/);
    assert.equal(active.elements.get('arc-priority-stat').textContent, '29% RATE');
    assert.doesNotMatch(active.elements.get('arc-priority-sub').textContent, /undefined/);
    assert.match(active.elements.get('arc-priority-sub').textContent, /8\/28 logged/);
    assert.match(active.elements.get('arc-momentum-sub').textContent, /28d rate/);

    const empty = arcAi({ empty: true });
    assert.equal(empty.elements.get('arc-priority-stat').textContent, '0 HABITS');
    assert.equal(empty.elements.get('arc-priority-title').textContent, 'Design my first habit routine');
    assert.equal(empty.elements.get('arc-streak-badge').textContent, '0D');
    assert.equal(empty.elements.get('arc-momentum-sub').textContent, 'Map out a sustainable 28-day baseline');
});

test('Arc_AI guest guard blocks network calls and authenticated starter card submission transitions to thread view', async () => {
    const guest = arcAi();
    guest.elements.get('arc-card-momentum').handlers.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(guest.requests.length, 0);
    assert.match(guest.elements.get('ai-coach-status').textContent, /sign in/);
    assert.match(guest.elements.get('ai-coach-question').value, /28-day momentum/);

    const authed = arcAi({ signedIn: true });
    authed.elements.get('arc-card-momentum').handlers.click();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(authed.requests[0].url, '/api/coach');
    assert.equal(authed.requests[0].options.headers.Authorization, 'Bearer qa-token');
    assert.equal(authed.elements.get('arc-zen-home').classList.contains('hidden'), true);
    assert.equal(authed.elements.get('arc-thread-view').classList.contains('hidden'), false);
    assert.equal(authed.elements.get('ai-coach-answer').textContent, 'Try reading 10 minutes right after dinner.');
    assert.match(authed.elements.get('ai-coach-status').textContent, /6 ARC AI messages/);
    assert.equal(authed.elements.get('ai-coach-action-box').classList.contains('hidden'), false);
    assert.equal(authed.elements.get('ai-coach-action-title').textContent, 'Add "10-Min Wind-Down"');
    authed.elements.get('ai-coach-apply-btn').handlers.click();
    assert.equal(authed.addedHabits.length, 1);
    assert.equal(authed.addedHabits[0].name, '10-Min Wind-Down');
    assert.equal(authed.elements.get('ai-coach-apply-btn').disabled, true);
    assert.equal(authed.elements.get('ai-coach-apply-btn').textContent, 'APPLIED ✓');

    authed.elements.get('ai-coach-clear').handlers.click();
    assert.equal(authed.elements.get('arc-zen-home').classList.contains('hidden'), false);
    assert.equal(authed.elements.get('arc-thread-view').classList.contains('hidden'), true);
    assert.equal(authed.elements.get('ai-coach-action-box').classList.contains('hidden'), true);
    assert.equal(authed.elements.get('ai-coach-question').value, '');
});
