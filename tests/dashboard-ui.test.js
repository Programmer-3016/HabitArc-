import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../Dashboard.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];

// Small DOM harness for the page's rendering contract; layout is checked in a browser.
function dashboard({ count = 4, completed = 3, aiName = undefined, progression = null } = {}) {
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
        getSettings: () => ({ userName: 'Sarthak Chauhan', ...(aiName ? { aiName } : {}) }),
        ...(progression ? { getAiProgression: () => progression } : {}),
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

test('focused dashboard retains the four mobile navigation destinations and top-bar profile shortcut', () => {
    const nav = html.match(/<nav\b[^>]*aria-label="Mobile navigation"[^>]*>[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, 'mobile navigation landmark missing');
    assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ['Dashboard.html', 'Habits.html', 'Notes.html', 'Insights.html']);
    const mobileHeader = html.match(/<header class="[^"]*md:hidden[\s\S]*?<\/header>/)[0];
    assert.ok(mobileHeader.includes('href="Profile.html"'));
    assert.ok(!mobileHeader.includes('href="Settings.html"'));
    assert.ok(mobileHeader.includes('>HabitArc<'));
    assert.ok(html.indexOf('class="ha-dashboard-view-all"') > html.indexOf('id="habits-container"'));
    assert.doesNotMatch(html, /DAY AT A GLANCE|fadeUp|animation-delay/, 'duplicate Day At A Glance card and fade lag removed');
    const heroMatch = html.match(/<section class="ha-progress-card[\s\S]*?<\/section>/);
    assert.ok(heroMatch && heroMatch[0].includes('id="ha-day-dashboard-peek"'), 'Day summary strip lives inside unified hero card');
});

test('focused dashboard renders custom AI name pill, level badge, and pixel banner safely', () => {
    const minimal = dashboard();
    assert.equal(minimal.elements.get('dash-ai-pill-label').textContent, 'ARC · LVL 1');
    assert.equal(minimal.elements.get('dash-ai-name').textContent, 'ARC');
    assert.equal(minimal.elements.get('dash-ai-level-badge').textContent, 'LVL 1');
    assert.match(minimal.elements.get('dash-ai-power-copy').textContent, /Right now ARC can make habits for you/);
    assert.match(minimal.elements.get('dash-ai-quest-line').textContent, /Quests to LVL 2: 0\/3 done/);

    const custom = dashboard({
        aiName: 'NOVA',
        progression: {
            aiName: 'NOVA',
            level: 2,
            rank: 'Routine Manager',
            remainingDays: 6,
            nextLevel: 3,
            nextPower: 'Streak Shield & Plan-B',
            questsDoneCount: 1,
            questsTotalCount: 3,
            summary: 'Delete or edit habits, mark completions, and add tasks in chat.'
        }
    });
    assert.equal(custom.elements.get('dash-ai-pill-label').textContent, 'NOVA · LVL 2');
    assert.equal(custom.elements.get('dash-ai-pill').attrs['aria-label'], 'NOVA Level 2 · Open AI');
    assert.equal(custom.elements.get('dash-ai-name').textContent, 'NOVA');
    assert.equal(custom.elements.get('dash-ai-rank').textContent, 'ROUTINE MANAGER');
    assert.equal(custom.elements.get('dash-ai-level-badge').textContent, 'LVL 2');
    assert.match(custom.elements.get('dash-ai-power-copy').textContent, /Delete or edit habits.*6d to LVL 3/);
    assert.match(custom.elements.get('dash-ai-quest-line').textContent, /Quests to LVL 3: 1\/3 done/);
});
