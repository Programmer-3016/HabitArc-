import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const pages = Object.fromEntries(['Habits', 'Habit_Detail'].map(name => [name, readFileSync(new URL(`../${name}.html`, import.meta.url), 'utf8')]));
class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-15T12:00:00Z'])); }
}

// Rendering contracts use an isolated store. No account, network or browser data is touched.
function page(name, { empty = false, query = '?id=habit-0', confirmDelete = false } = {}) {
    const html = pages[name];
    const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
    const elements = new Map();
    const events = new Map();
    let focused;
    const deleted = [];
    const confirmations = [];
    const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    function element() {
        let markup = '';
        const classes = new Set();
        const item = {
            textContent: '', children: [], attrs: {}, handlers: {}, dataset: {}, disabled: false, hidden: false,
            style: { setProperty(key, value) { this[key] = value; } },
            classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value) },
            setAttribute(key, value) { this.attrs[key] = String(value); },
            appendChild(child) { this.children.push(child); },
            addEventListener(key, callback) { this.handlers[key] = callback; },
            focus() { focused = this; },
            querySelector() { return this.span ||= element(); },
            before(child) { this.beforeElement = child; }, remove() { this.removed = true; },
            get innerHTML() { return markup; },
            set innerHTML(value) {
                markup = value; this.children = []; this.toggle = undefined;
                const button = value.match(/<button[^>]*class="[^"]*habit-toggle[^"]*"[^>]*data-id="([^"]+)"[^>]*>/);
                if (button) { this.toggle = element(); this.toggle.dataset.id = button[1]; }
            },
        };
        return item;
    }
    for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, element());
    const main = element();
    const filters = ['All', 'Health', 'Mindfulness', 'Learning', 'Focus'].map(category => {
        const button = element(); button.dataset.cat = category; return button;
    });
    const habits = empty ? [] : [
        { id: 'habit-0', name: 'Read <20> pages', category: 'Learning', icon: 'menu_book', why: 'Learn <daily>', motivation: 'Keep going', createdAt: '2026-11-01', repeat: ['mon','tue','wed','thu','fri','sat','sun'], completions: { '2026-11-13': true, '2026-11-14': true } },
        { id: 'habit-1', name: 'Morning walk', category: 'Health', icon: 'directions_walk', createdAt: '2026-11-01', completions: {} },
    ];
    const getHabit = id => habits.find(habit => habit.id === id);
    const toggles = () => (elements.get('habits-list')?.children || []).flatMap(card => card.toggle ? [card.toggle] : []);
    const app = {
        getHabits: () => habits, getHabitById: id => getHabit(id) ? structuredClone(getHabit(id)) : null,
        getCloudSyncStatus: () => ({ connected: true }),
        escapeHTML, getCategoryStyle: () => ({ bg: '', text: '', iconFill: false }),
        getHabitAccentColor: () => '#236749',
        today: () => '2026-11-15', isCompletedToday: id => !!getHabit(id)?.completions['2026-11-15'],
        completeHabit: id => { getHabit(id).completions['2026-11-15'] = true; },
        uncompleteHabit: id => { delete getHabit(id).completions['2026-11-15']; },
        getCurrentStreak: id => Object.keys(getHabit(id).completions).length,
        getLongestStreak: () => 5, getCompletionRate: () => 70,
        getLast7Days: id => Array.from({ length: 7 }, (_, index) => ({ date: `2026-11-${String(9 + index).padStart(2, '0')}`, label: 'MTWTFSS'[index], isToday: index === 6, isScheduled: index !== 0, completed: !!getHabit(id).completions[`2026-11-${String(9 + index).padStart(2, '0')}`] })),
        getMonthlyActivity: () => [{ label: 'Sep', rate: 25 }, { label: 'Oct', rate: 50 }, { label: 'Nov', rate: 70 }],
        deleteHabit: id => deleted.push(id),
    };
    const location = { search: query, href: '' };
    vm.runInNewContext(source, {
        HabitArc: app, Date: Clock, URLSearchParams, console,
        confirm: message => { confirmations.push(message); return confirmDelete; },
        window: { location, addEventListener: (key, callback) => events.set(key, callback), removeEventListener: key => events.delete(key), setTimeout: () => 1, clearTimeout() {} },
        document: { getElementById: id => elements.get(id), createElement: element, querySelector: () => main, querySelectorAll: selector => selector === '.cat-filter' ? filters : selector === '.habit-toggle' ? toggles() : [] },
    });
    return { elements, events, habits, filters, toggles, deleted, confirmations, main, location, get focused() { return focused; } };
}

test('focused habit cards retain safe details, accents, streaks and seven dated activity marks', () => {
    const view = page('Habits');
    const card = view.elements.get('habits-list').children[0];
    assert.equal(card.style['--habit-accent'], '#236749');
    assert.match(card.innerHTML, /Read &lt;20&gt; pages/);
    assert.match(card.innerHTML, /Habit_Detail.html\?id=habit-0/);
    assert.match(card.innerHTML, /2 day streak/);
    assert.match(card.innerHTML, /2026-11-09: Not scheduled/);
    assert.equal((card.innerHTML.match(/role="img"/g) || []).length, 7);
    assert.doesNotMatch(card.innerHTML, /line-through/);
    assert.equal(view.elements.get('habits-results-status').textContent, '2 habits');
});

test('category filtering, empty category and cloud refresh retain the selected filter', () => {
    const view = page('Habits');
    const health = view.filters.find(filter => filter.dataset.cat === 'Health');
    health.handlers.click.call(health);
    assert.equal(view.elements.get('habits-list').children.length, 1);
    assert.match(view.elements.get('habits-list').children[0].innerHTML, /Morning walk/);
    assert.equal(health.attrs['aria-pressed'], 'true');
    view.events.get('habitarc:data-changed')({ detail: { source: 'cloud' } });
    assert.equal(view.elements.get('habits-list').children.length, 1);
    const focus = view.filters.find(filter => filter.dataset.cat === 'Focus');
    focus.handlers.click.call(focus);
    assert.match(view.elements.get('habits-list').innerHTML, /No focus habits yet/);
    assert.match(view.elements.get('habits-list').innerHTML, /href="Add_Habit.html"/);
});

test('habit completion and undo preserve focus after a card rerenders', () => {
    const view = page('Habits');
    let button = view.toggles()[0];
    button.handlers.click.call(button, { stopPropagation() {} });
    assert.equal(view.habits[0].completions['2026-11-15'], true);
    assert.equal(view.focused, view.toggles()[0]);
    assert.match(view.elements.get('habits-list').children[0].innerHTML, /aria-pressed="true"/);
    button = view.toggles()[0];
    button.handlers.click.call(button, { stopPropagation() {} });
    assert.equal(view.habits[0].completions['2026-11-15'], undefined);
    assert.equal(view.focused, view.toggles()[0]);
});

test('empty habit library shows a useful existing create-habit destination', () => {
    const view = page('Habits', { empty: true });
    assert.match(view.elements.get('habits-list').innerHTML, /Create your first habit/);
    assert.match(view.elements.get('habits-list').innerHTML, /href="Add_Habit.html"/);
    assert.equal(view.elements.get('habits-results-status').textContent, '0 habits');
});

test('focused detail retains real statistics, dated calendar, accent legend and edit route', () => {
    const view = page('Habit_Detail');
    assert.equal(view.elements.get('habit-name').textContent, 'Read <20> pages');
    assert.equal(view.elements.get('stat-current-streak').textContent, 2);
    assert.equal(view.elements.get('stat-longest-streak').textContent, 5);
    assert.equal(view.elements.get('stat-completion').textContent, 70);
    assert.equal(view.elements.get('stat-total-done').textContent, 2);
    assert.equal(view.elements.get('edit-habit-btn').href, 'Add_Habit.html?edit=habit-0');
    assert.equal(view.elements.get('calendar-done-key').style.backgroundColor, '#236749');
    const dates = view.elements.get('monthly-calendar-grid').children.filter(cell => cell.attrs.role === 'img');
    assert.equal(dates.length, 30);
    assert.ok(dates.some(cell => cell.attrs['aria-current'] === 'date' && cell.title.includes('Not marked yet')));
    assert.match(view.elements.get('monthly-bars').children[0].innerHTML, /role="progressbar".*aria-label="Sep completion".*aria-valuenow="25"/);
});

test('detail completion, undo, month navigation and cloud updates remain reactive', () => {
    const view = page('Habit_Detail');
    const button = view.elements.get('complete-today-btn');
    button.handlers.click();
    assert.equal(button.attrs['aria-pressed'], 'true');
    assert.equal(view.elements.get('stat-total-done').textContent, 3);
    button.handlers.click();
    assert.equal(view.elements.get('stat-total-done').textContent, 2);
    view.elements.get('prev-month-btn').handlers.click();
    assert.equal(view.elements.get('current-month-title').textContent, 'Oct 2026');
    view.elements.get('next-month-btn').handlers.click();
    assert.equal(view.elements.get('current-month-title').textContent, 'Nov 2026');
    view.habits[0].name = 'Updated name';
    view.events.get('habitarc:data-changed')({ detail: { source: 'cloud' } });
    assert.equal(view.elements.get('habit-name').textContent, 'Updated name');
});

test('detail retains its guarded delete and invalid-habit recovery behavior', async () => {
    const view = page('Habit_Detail');
    view.elements.get('delete-btn').handlers.click();
    assert.equal(view.confirmations.length, 1);
    assert.equal(view.deleted.length, 0);
    const confirmed = page('Habit_Detail', { confirmDelete: true });
    confirmed.elements.get('delete-btn').handlers.click();
    assert.deepEqual(confirmed.deleted, ['habit-0']);
    assert.equal(confirmed.location.href, 'Habits.html');
    assert.equal(page('Habit_Detail', { query: '' }).location.href, 'Habits.html');
    const missing = page('Habit_Detail', { empty: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(missing.main.beforeElement.attrs.role, 'alert');
    assert.match(missing.main.beforeElement.textContent, /could not be loaded/);
});

test('both pages retain the four mobile navigation destinations', () => {
    for (const html of Object.values(pages)) {
        const nav = html.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)[0];
        assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['Dashboard.html', 'Habits.html', 'Notes.html', 'Insights.html']);
    }
});
