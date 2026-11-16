import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../Dashboard.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];

// Small DOM harness for the page's rendering contract; layout is checked in a browser.
function dashboard({ count = 4, completed = 3 } = {}) {
    const elements = new Map();
    const events = new Map();
    let focused;
    const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    function element() {
        let markup = '';
        return {
            textContent: '', children: [], attrs: {}, handlers: {}, dataset: {},
            style: { setProperty() {} }, classList: { add() {}, remove() {} },
            setAttribute(name, value) { this.attrs[name] = String(value); },
            removeAttribute(name) { delete this.attrs[name]; },
            appendChild(child) { this.children.push(child); },
            addEventListener(name, callback) { this.handlers[name] = callback; },
            focus() { focused = this; },
            get innerHTML() { return markup; },
            set innerHTML(value) {
                markup = value;
                this.children = [];
                this.toggle = undefined;
                const button = value.match(/<button[^>]*class="habit-toggle"[^>]*data-id="([^"]+)"[^>]*>/);
                if (button) {
                    this.toggle = element();
                    this.toggle.dataset.id = button[1];
                }
            },
        };
    }
    for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, element());
    const habits = Array.from({ length: count }, (_, index) => ({ id: `habit-${index}`, name: index === 0 ? 'Read <20> pages' : `Habit ${index}`, category: 'Learning', icon: 'book', completed: index < completed }));
    const toggles = () => elements.get('habits-container').children.flatMap(card => card.toggle ? [card.toggle] : []);
    const app = {
        getAuthUser: () => null,
        getSettings: () => ({ userName: 'Sarthak Chauhan' }),
        getGreeting: () => 'Good morning', getFormattedToday: () => 'Sunday, November 15',
        getOverallCurrentStreak: () => 12, getOverallLongestStreak: () => 28,
        getTodayProgress: () => ({ total: habits.length, completed: habits.filter(h => h.completed).length, percentage: habits.length ? Math.round(habits.filter(h => h.completed).length / habits.length * 100) : 0 }),
        getTodayHabits: () => habits,
        isCompletedToday: id => habits.find(h => h.id === id).completed,
        completeHabit: id => { habits.find(h => h.id === id).completed = true; },
        uncompleteHabit: id => { habits.find(h => h.id === id).completed = false; },
        getCurrentStreak: () => 5, getCategoryStyle: () => ({ iconFill: false }),
        getHabitAccentColor: () => '#3988d4',
        getLast7Days: () => Array.from({ length: 7 }, (_, index) => ({ date: `2026-11-${9 + index}`, label: 'MTWTFSS'[index], isToday: index === 6, completed: index !== 2, isScheduled: true })),
        escapeHTML, whenAuthReady: () => Promise.resolve(null),
    };
    vm.runInNewContext(script, {
        HabitArc: app, setTimeout() {},
        window: { addEventListener: (name, handler) => events.set(name, handler) },
        document: { getElementById: id => elements.get(id), createElement: element, querySelectorAll: selector => selector === '.habit-toggle' ? toggles() : [] },
    });
    return { elements, habits, events, toggles, get focused() { return focused; } };
}

test('focused dashboard reads real progress, streaks and escaped habit content', () => {
    const page = dashboard();
    assert.equal(page.elements.get('progress-completed').textContent, 3);
    assert.equal(page.elements.get('progress-total').textContent, 4);
    assert.equal(page.elements.get('progress-ring').attrs['aria-valuenow'], '75');
    assert.equal(page.elements.get('current-streak').textContent, 12);
    assert.equal(page.elements.get('habits-remaining').textContent, '1 remaining');
    const card = page.elements.get('habits-container').children[0].innerHTML;
    assert.match(card, /Read &lt;20&gt; pages/);
    assert.match(card, /Habit_Detail.html\?id=habit-0/);
    assert.equal((card.match(/role="img"/g) || []).length, 7);
    assert.doesNotMatch(card, /line-through/);
});

test('focused dashboard completion and undo update counts and retain keyboard focus', () => {
    const page = dashboard();
    const complete = page.toggles()[3];
    complete.handlers.click.call(complete, { stopPropagation() {} });
    assert.equal(page.elements.get('progress-ring').attrs['aria-valuenow'], '100');
    assert.equal(page.elements.get('habits-remaining').textContent, 'All done today');
    assert.equal(page.focused, page.toggles()[3]);
    const undo = page.toggles()[3];
    undo.handlers.click.call(undo, { stopPropagation() {} });
    assert.equal(page.elements.get('progress-pct').textContent, '75%');
    assert.equal(page.focused, page.toggles()[3]);
});

test('focused dashboard handles empty schedules without inventing progress', () => {
    const page = dashboard({ count: 0 });
    assert.equal(page.elements.get('progress-pct').textContent, '0%');
    assert.equal(page.elements.get('progress-ring').attrs['aria-valuetext'], '0 of 0 habits completed');
    assert.equal(page.elements.get('habits-remaining').textContent, 'Nothing scheduled');
    assert.match(page.elements.get('habits-container').innerHTML, /No habits scheduled for today/);
});

test('focused dashboard still responds to cloud data and authentication updates', () => {
    const page = dashboard();
    page.habits[3].completed = true;
    page.events.get('habitarc:data-changed')({ detail: { source: 'cloud' } });
    assert.equal(page.elements.get('progress-pct').textContent, '100%');
    page.events.get('habitarc-auth-state-changed')({ detail: { user: { displayName: 'New Name' } } });
    assert.equal(page.elements.get('greeting-name').textContent, 'New.');
});

test('focused dashboard retains the five mobile navigation destinations and top-bar profile shortcut', () => {
    const nav = html.match(/<nav class="md:hidden[\s\S]*?<\/nav>/)[0];
    assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['Dashboard.html', 'Habits.html', 'Add_Habit.html', 'Insights.html', 'Arc_AI.html']);
    const mobileHeader = html.match(/<header class="[^"]*md:hidden[\s\S]*?<\/header>/)[0];
    assert.ok(mobileHeader.includes('href="Profile.html"'));
    assert.ok(mobileHeader.includes('href="Settings.html"'));
    assert.ok(html.indexOf('class="ha-dashboard-view-all"') > html.indexOf('id="habits-container"'));
});
