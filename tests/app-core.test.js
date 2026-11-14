import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';

process.env.TZ = 'Asia/Kolkata';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function application({ permission = 'granted', failNotification = false } = {}) {
    const storage = new Map([['habitarc_data', JSON.stringify({ habits: [], completionHistory: {}, settings: {}, onboardingComplete: true })]]);
    const notifications = [];
    const time = Date.parse('2026-11-12T18:45:00Z'); // Friday 00:15 in India
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [time])); }
        static now() { return time; }
    }
    class Notification {
        static permission = permission;
        constructor(title, options) {
            if (failNotification) { failNotification = false; throw new Error('Transient notification failure'); }
            notifications.push({ title, options });
        }
    }
    const window = {
        Notification, navigator: { userAgent: '' }, location: { pathname: '/Dashboard.html' },
        addEventListener() {}, dispatchEvent() {}, setInterval() {}, setTimeout() {},
        matchMedia: () => ({ matches: false })
    };
    const context = vm.createContext({
        window, navigator: window.navigator, Notification, Date: Clock,
        console: { warn() {}, error() {}, log() {} }, setTimeout() {}, clearTimeout() {},
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key)
        },
        document: { addEventListener() {}, getElementById: () => null }
    });
    new vm.Script(source, { importModuleDynamically: () => Promise.reject(new Error('Test: offline')) }).runInContext(context);
    return { app: vm.runInContext('HabitArc', context), storage, notifications };
}

test('local midnight completion, edit and undo retain canonical daily history', () => {
    const { app } = application();
    assert.equal(app.today(), '2026-11-13');
    const { habit } = app.addHabit({ name: 'Reading', repeat: ['fri'], reminder: '00:15' });
    assert.equal(habit.createdAt, '2026-11-13');
    assert.equal(app.getTodayHabits().length, 1);
    app.completeHabit(habit.id);
    assert.equal(app.getCompletionHistory(habit.id)[0].date, '2026-11-13');
    assert.equal(app.getTodayProgress().percentage, 100);
    app.updateHabit(habit.id, { name: 'Read 20 pages', accentColor: '#AA33CC' });
    assert.equal(app.getHabitById(habit.id).accentColor, '#aa33cc');
    assert.equal(app.isCompletedToday(habit.id), true);
    app.uncompleteHabit(habit.id);
    assert.equal(app.getCompletionHistory(habit.id).length, 1);
    assert.equal(app.getCompletionHistory(habit.id)[0].status, 'not_completed');
    assert.equal(app.getTodayProgress().percentage, 0);
});

test('empty schedules remain unscheduled and accent/HTML input is safe', () => {
    const { app } = application();
    const { habit } = app.addHabit({ name: '<script>', category: 'Health', repeat: [], accentColor: 'red;display:none' });
    assert.equal(app.getTodayHabits().length, 0);
    assert.equal(app.getCurrentStreak(habit.id), 0);
    assert.equal(app.getHabitAccentColor(habit), '#0e8f63');
    assert.equal(app.escapeHTML('<a "x">&'), '&lt;a &quot;x&quot;&gt;&amp;');
});

test('reminders are opt-in, due-only, skip completions and deduplicate', async () => {
    const { app, notifications } = application();
    const { habit } = app.addHabit({ name: 'Due', reminder: '00:15' });
    app.addHabit({ name: 'Later', reminder: '00:30' });
    const done = app.addHabit({ name: 'Done', reminder: '00:15' }).habit;
    app.completeHabit(done.id);
    await app.checkReminderSchedule();
    assert.equal(notifications.length, 0);
    app.setReminderPreferences({ dailyReminder: true });
    await new Promise(resolve => setImmediate(resolve));
    await app.checkReminderSchedule();
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].title, 'Time for Due');
    assert.ok(notifications[0].options.tag.includes(habit.id));
});

test('notification failures can retry; denied permission never delivers', async () => {
    const { app, notifications } = application({ failNotification: true });
    app.addHabit({ name: 'Retry', reminder: '00:15' });
    app.setReminderPreferences({ dailyReminder: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(notifications.length, 0);
    await app.checkReminderSchedule();
    assert.equal(notifications.length, 1);
    const denied = application({ permission: 'denied' });
    denied.app.addHabit({ name: 'No permission', reminder: '00:15' });
    denied.app.setReminderPreferences({ dailyReminder: true });
    await denied.app.checkReminderSchedule();
    assert.equal(denied.notifications.length, 0);
});

test('every inline application script parses', () => {
    const root = new URL('..', import.meta.url);
    for (const file of readdirSync(root).filter(name => name.endsWith('.html'))) {
        const html = readFileSync(new URL(file, root), 'utf8');
        for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
            if (!/\bsrc\s*=|type=["'](?:module|application\/)/i.test(match[1])) {
                assert.doesNotThrow(() => new vm.Script(match[2], { filename: file }));
            }
        }
    }
});
