import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';

process.env.TZ = 'Asia/Kolkata';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function application({ permission = 'granted', failNotification = false, withAudio = false } = {}) {
    const storage = new Map([['habitarc_data', JSON.stringify({ habits: [], completionHistory: {}, settings: {}, onboardingComplete: true })]]);
    const notifications = [];
    let audioCreated = 0;
    let audioScheduled = 0;
    const winListeners = new Map();
    const docListeners = new Map();
    const dispatched = [];
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
    class MockAudioContext {
        constructor() { audioCreated += 1; this.state = 'running'; this.currentTime = 1; this.destination = {}; }
        resume() { this.state = 'running'; return Promise.resolve(); }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
        createOscillator() {
            audioScheduled += 1;
            return { type: 'sine', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} };
        }
    }
    const window = {
        Notification, navigator: { userAgent: '' }, location: { pathname: '/Dashboard.html' },
        ...(withAudio ? { AudioContext: MockAudioContext } : {}),
        addEventListener(type, fn) { if (!winListeners.has(type)) winListeners.set(type, []); winListeners.get(type).push(fn); },
        dispatchEvent(ev) { dispatched.push(ev); for (const fn of winListeners.get(ev.type) || []) fn(ev); },
        setInterval() {}, setTimeout() {},
        matchMedia: () => ({ matches: false })
    };
    const document = {
        hidden: false,
        addEventListener(type, fn) { if (!docListeners.has(type)) docListeners.set(type, []); docListeners.get(type).push(fn); },
        getElementById: () => null
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
        document
    });
    new vm.Script(source, { importModuleDynamically: () => Promise.reject(new Error('Test: offline')) }).runInContext(context);
    return {
        app: vm.runInContext('HabitArc', context),
        storage,
        notifications,
        getAudioStats: () => ({ audioCreated, audioScheduled }),
        triggerStorage: (key) => { for (const fn of winListeners.get('storage') || []) fn({ key }); },
        triggerVisible: () => { for (const fn of docListeners.get('visibilitychange') || []) fn({}); },
        dispatched,
    };
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

test('habit chime reuses one shared AudioContext across 60 completions and emits cross-tab updates', () => {
    const { app, storage, getAudioStats, triggerStorage, triggerVisible, dispatched } = application({ withAudio: true });
    const { habit } = app.addHabit({ name: 'Drink water' });
    for (let i = 0; i < 60; i++) {
        app.completeHabit(habit.id);
        app.uncompleteHabit(habit.id);
    }
    const { audioCreated, audioScheduled } = getAudioStats();
    assert.equal(audioCreated, 1, 'reuses a single AudioContext across repeated ticks');
    assert.equal(audioScheduled, 120, 'schedules both chime tones on every completion');

    dispatched.length = 0;
    const saved = JSON.parse(storage.get('habitarc_data'));
    saved.habits[0].completions['2026-11-13'] = true;
    storage.set('habitarc_data', JSON.stringify(saved));
    triggerStorage('habitarc_data');
    assert.equal(dispatched.some(e => e.type === 'habitarc:data-changed' && e.detail?.source === 'storage'), true);

    dispatched.length = 0;
    saved.habits[0].completions['2026-11-14'] = true;
    storage.set('habitarc_data', JSON.stringify(saved));
    triggerVisible();
    assert.equal(dispatched.some(e => e.type === 'habitarc:data-changed' && e.detail?.source === 'visibility'), true);
});

test('custom aiName sanitizes safely, quests unlock Level 2 cleanly, and restoreHabit preserves history', () => {
    const { app } = application();
    assert.equal(app.getSettings().aiName, 'ARC');
    assert.equal(app.getAiProgression().level, 1);
    assert.equal(app.getAiProgression().questsDoneCount, 0);
    assert.equal(app.getAiProgression().questsTotalCount, 3);

    app.updateSettings({ aiName: '  Nova   <Coach>  ' });
    assert.equal(app.getSettings().aiName, 'Nova Coach');
    assert.equal(app.getAiProgression().aiName, 'Nova Coach');

    app.updateSettings({ aiName: '   ' });
    assert.equal(app.getSettings().aiName, 'ARC');

    app.updateSettings({ aiName: 'Nova' });
    const { habit: h1 } = app.addHabit({ name: 'Stretch' });
    const { habit: h2 } = app.addHabit({ name: 'Read' });
    const { habit: h3 } = app.addHabit({ name: 'Hydrate' });
    app.recordAiAction('create');
    app.completeHabit(h1.id);
    // 1 check-in + 1 AI create is 1/3 quests done (need 3 check-ins + 1 clear day/task)
    assert.equal(app.getAiProgression().level, 1);
    assert.equal(app.getAiProgression().questsDoneCount, 1);

    app.completeHabit(h2.id);
    app.completeHabit(h3.id);
    const l2 = app.getAiProgression();
    assert.equal(l2.aiName, 'Nova');
    assert.equal(l2.clearDays, 1);
    assert.equal(l2.totalCheckins, 3);
    assert.equal(l2.level, 2);
    assert.equal(l2.rank, 'Routine Manager');
    assert.equal(l2.shortPower, 'Delete, Edit & Tasks');

    const backup = JSON.parse(JSON.stringify(app.getHabitById(h3.id)));
    app.deleteHabit(h3.id);
    assert.equal(app.getHabitById(h3.id), null);
    assert.equal(app.restoreHabit(backup), true);
    assert.equal(app.getHabitById(h3.id)?.name, 'Hydrate');
    assert.equal(app.isCompletedToday(h3.id), true);
});
