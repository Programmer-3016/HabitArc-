import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const spritesSource = readFileSync(new URL('../companion-sprites.js', import.meta.url), 'utf8');
const runnerSource = readFileSync(new URL('../streak-runner.js', import.meta.url), 'utf8');
const swSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const onboardingSource = readFileSync(new URL('../Onboarding.html', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../Settings.html', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../Dashboard.html', import.meta.url), 'utf8');
const habitsSource = readFileSync(new URL('../Habits.html', import.meta.url), 'utf8');
const habitDetailSource = readFileSync(new URL('../Habit_Detail.html', import.meta.url), 'utf8');

function createStreakContext() {
    const context = vm.createContext({
        window: {},
        Math,
        Uint8Array,
        Set,
        Map,
        Array,
        Object,
        Number,
        String,
        Boolean,
        Date,
        performance: { now: () => 0 },
    });
    context.window = context;
    new vm.Script(runnerSource).runInContext(context);
    return context.HabitArcStreak;
}

function createAppWithStorage(initial) {
    const storage = new Map([['habitarc_data', JSON.stringify(initial)]]);
    const window = {
        navigator: { userAgent: '' },
        location: { pathname: '/Dashboard.html' },
        addEventListener() {},
        dispatchEvent() {},
        setInterval() {},
        setTimeout() {},
        matchMedia: () => ({ matches: false }),
    };
    const context = vm.createContext({
        window,
        navigator: window.navigator,
        Date,
        console: { warn() {}, error() {}, log() {} },
        setTimeout() {},
        clearTimeout() {},
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        localStorage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: (key) => storage.delete(key),
        },
        document: { addEventListener() {}, getElementById: () => null },
    });
    new vm.Script(appSource, { importModuleDynamically: () => Promise.reject(new Error('Test: offline')) }).runInContext(context);
    return { app: vm.runInContext('HabitArc', context), storage };
}

test('streak-runner module exports companions, timeline scaling, and recurring 50d/100d tiers', () => {
    const streak = createStreakContext();
    assert.deepEqual([...streak.COMPANIONS.map((c) => c.id)], ['arcy', 'ninja', 'specops', 'astro']);
    assert.equal(streak.DEFAULT_COMPANION_ID, 'arcy');
    assert.equal(streak.normalizeCompanionId('specops'), 'specops');
    assert.equal(streak.normalizeCompanionId('unknown-hero'), 'arcy');

    assert.equal(streak.milestoneTier(1), 0);
    assert.equal(streak.milestoneTier(50), 50);
    assert.equal(streak.milestoneTier(100), 100);
    assert.equal(streak.milestoneTier(150), 50);
    assert.equal(streak.milestoneTier(200), 100);

    const t1 = streak.getTimeline(1);
    const t7 = streak.getTimeline(7);
    const t50 = streak.getTimeline(50);
    assert.ok(t1.T_IMPACT < t7.T_IMPACT, 'Day 1 sprint should be shorter than Day 7');
    assert.ok(t7.T_IMPACT < t50.T_IMPACT, 'Day 7 sprint should be shorter than Day 50');
});

test('HabitArc store defaults and validates companion setting cleanly', () => {
    const { app, storage } = createAppWithStorage({
        habits: [],
        completionHistory: {},
        settings: { companion: 'invalid_bot' },
        onboardingComplete: true,
    });
    assert.equal(app.getSettings().companion, 'arcy');

    app.updateSettings({ companion: 'ninja' });
    assert.equal(app.getSettings().companion, 'ninja');

    const persisted = JSON.parse(storage.get('habitarc_data'));
    assert.equal(persisted.settings.companion, 'ninja');
});

test('app shell and onboarding/settings integrate streak-runner and companion sprites safely', () => {
    assert.ok(swSource.includes("'/companion-sprites.js'"), 'sw.js must precache companion-sprites.js');
    assert.ok(swSource.includes("'/streak-runner.js'"), 'sw.js must precache streak-runner.js');
    assert.ok(onboardingSource.includes('id="onboarding-companion-picker"'));
    assert.ok(onboardingSource.includes('const totalSteps = 8;'));
    assert.ok(settingsSource.includes('id="settings-companion-picker"'));

    for (const [name, src] of [
        ['Onboarding.html', onboardingSource],
        ['Settings.html', settingsSource],
        ['Dashboard.html', dashboardSource],
        ['Habits.html', habitsSource],
        ['Habit_Detail.html', habitDetailSource],
    ]) {
        const sprIdx = src.indexOf('<script src="companion-sprites.js"></script>');
        const runIdx = src.indexOf('<script src="streak-runner.js"></script>');
        assert.ok(sprIdx !== -1 && runIdx !== -1 && sprIdx < runIdx, `${name} must load companion-sprites.js before streak-runner.js`);
    }

    const ctx = vm.createContext({ window: {} });
    ctx.window = ctx;
    new vm.Script(spritesSource).runInContext(ctx);
    const bank = ctx.HabitArcSprites;
    assert.ok(bank && typeof bank === 'object');
    for (const id of ['arcy', 'ninja', 'specops', 'astro']) {
        assert.ok(bank[id], `missing sprite bank for ${id}`);
        for (const pose of ['run0', 'run1', 'act', 'cheer']) {
            const frame = bank[id][pose];
            assert.ok(frame && frame.w > 0 && frame.h > 0, `${id}.${pose} must have valid dimensions`);
            assert.ok(typeof frame.src === 'string' && frame.src.startsWith('data:image/png;base64,'), `${id}.${pose} must have PNG data URL`);
        }
    }
    assert.ok(bank.arcy.flip && bank.arcy.flip.src.startsWith('data:image/png;base64,'));
});
