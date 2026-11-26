import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {
    CHANNEL_ID,
    computeNativeNotificationId,
    buildNativeNotificationSpecs,
    syncFromHabitArc,
    sendNativeTestNotification,
} from '../native-reminders.js';

process.env.TZ = 'Asia/Kolkata';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function createHarness({ initialIso = '2026-11-13T02:30:00Z', permission = 'granted' } = {}) {
    let nowMs = Date.parse(initialIso);
    const storage = new Map([
        ['habitarc_data', JSON.stringify({ habits: [], completionHistory: {}, settings: {}, onboardingComplete: true })],
    ]);
    const swNotifications = [];
    let currentPermission = permission;

    class Clock extends Date {
        constructor(...args) {
            super(...(args.length ? args : [nowMs]));
        }
        static now() {
            return nowMs;
        }
    }

    class MockNotification {
        static get permission() {
            return currentPermission;
        }
        static async requestPermission() {
            return currentPermission;
        }
        constructor(title, options) {
            swNotifications.push({ title, options });
        }
    }

    const navigatorObj = {
        userAgent: '',
        serviceWorker: {
            async getRegistration() {
                return {
                    async showNotification(title, options) {
                        swNotifications.push({ title, options });
                    },
                };
            },
        },
    };

    const windowObj = {
        Notification: MockNotification,
        navigator: navigatorObj,
        location: { pathname: '/Dashboard.html', search: '', hash: '' },
        addEventListener() {},
        dispatchEvent() {},
        setInterval() {},
        setTimeout() {},
        clearTimeout() {},
        matchMedia: () => ({ matches: false }),
    };

    const context = vm.createContext({
        window: windowObj,
        navigator: navigatorObj,
        Notification: MockNotification,
        Date: Clock,
        console: { warn() {}, error() {}, log() {} },
        setTimeout() {},
        clearTimeout() {},
        CustomEvent: class {
            constructor(type, init) {
                this.type = type;
                this.detail = init?.detail;
            }
        },
        localStorage: {
            getItem: (k) => storage.get(k) ?? null,
            setItem: (k, v) => storage.set(k, String(v)),
            removeItem: (k) => storage.delete(k),
        },
        document: {
            hidden: false,
            addEventListener() {},
            getElementById: () => null,
        },
    });

    new vm.Script(appSource, {
        importModuleDynamically: () => Promise.reject(new Error('Offline test harness')),
    }).runInContext(context);

    return {
        app: vm.runInContext('HabitArc', context),
        swNotifications,
        advanceMinutes(mins) {
            nowMs += mins * 60 * 1000;
        },
    };
}

test('addHabit preserves explicit empty reminder while defaulting omitted reminder to settings', () => {
    const { app } = createHarness();
    app.updateSettings({ defaultReminderTime: '07:30' });

    const withDefault = app.addHabit({ name: 'Morning Stretch' }).habit;
    assert.equal(withDefault.reminder, '07:30');

    const cleared = app.addHabit({ name: 'Anytime Water', reminder: '' }).habit;
    assert.equal(cleared.reminder, '');
});

test('3-hour wake catch-up delivers pure buttonless custom AI Buddy reminder once and skips stale >3h alarms', async () => {
    const { app, swNotifications, advanceMinutes } = createHarness({ initialIso: '2026-11-13T04:45:00Z' });
    app.updateSettings({ aiName: 'Kai' });
    app.addHabit({ name: 'Read 20 pages', reminder: '08:30', why: '10 pages daily' });
    app.addHabit({ name: '06:00 Dawn Run', reminder: '06:00' });
    app.addHabit({ name: '21:00 Night Journal', reminder: '21:00' });

    app.setReminderPreferences({ dailyReminder: true });
    await new Promise((r) => setImmediate(r));
    await app.checkReminderSchedule();

    assert.equal(swNotifications.length, 1);
    assert.equal(swNotifications[0].title, 'Time for Read 20 pages');
    assert.equal(swNotifications[0].options.body, 'Kai · 8:30 AM — Hey, time for Read 20 pages');
    assert.equal(swNotifications[0].options.actions, undefined, 'notifications stay clean reminders without action buttons');

    advanceMinutes(10);
    await app.checkReminderSchedule();
    assert.equal(swNotifications.length, 1);

    const testRes = await app.sendTestReminder();
    assert.equal(testRes.sent, true);
    assert.match(swNotifications.at(-1).title, /^Kai · /);
    assert.equal(swNotifications.at(-1).options.body, 'Hey, your Kai reminders are active');
    assert.equal(swNotifications.at(-1).options.actions, undefined);
});

test('Capacitor LocalNotifications bridge schedules pure exact weekday alarms and defers completed today', async () => {
    const idA = computeNativeNotificationId('u1', 'h1', 'wk_2');
    const idB = computeNativeNotificationId('u1', 'h1', 'wk_3');
    assert.ok(Number.isInteger(idA) && idA > 0 && idA <= 0x7fffffff);
    assert.notEqual(idA, idB);

    const now = new Date('2026-11-13T01:30:00Z');
    const specs = buildNativeNotificationSpecs({
        habits: [
            { id: 'h_open', name: 'Workout', reminder: '08:00', repeat: ['mon', 'fri'], completions: {} },
            { id: 'h_done_today', name: 'Hydrate', reminder: '08:00', repeat: ['fri'], completions: { '2026-11-13': true } },
        ],
        dailyReminder: true,
        todayKey: '2026-11-13',
        scope: 'u_play',
        aiName: 'Kai',
        now,
    });

    assert.equal(specs.length, 3);
    const friOpen = specs.find((s) => s.extra.habitId === 'h_open' && s.schedule.on?.weekday === 6);
    assert.ok(friOpen);
    assert.equal(friOpen.channelId, CHANNEL_ID);
    assert.equal(friOpen.title, 'KAI · 8:00 AM');
    assert.equal(friOpen.body, 'Hey, time for Workout');
    assert.equal(friOpen.summaryText, 'KAI');
    assert.equal(friOpen.actionTypeId, undefined, 'no Mark Done / Snooze action buttons');
    assert.equal(friOpen.schedule.allowWhileIdle, true);

    const friDone = specs.find((s) => s.extra.habitId === 'h_done_today');
    assert.ok(friDone.schedule.at instanceof Date);

    const cancelled = [];
    const scheduled = [];
    const mockWin = {
        Capacitor: {
            isNativePlatform: () => true,
            Plugins: {
                LocalNotifications: {
                    async checkPermissions() { return { display: 'granted' }; },
                    async requestPermissions() { return { display: 'granted' }; },
                    async createChannel() {},
                    async getPending() { return { notifications: [{ id: 4242 }] }; },
                    async cancel(payload) { cancelled.push(...payload.notifications); },
                    async schedule(payload) { scheduled.push(...payload.notifications); },
                },
            },
        },
    };
    const mockApp = {
        getReminderPreferences: () => ({ dailyReminder: true }),
        getAuthUser: () => ({ uid: 'u_play' }),
        today: () => '2026-11-13',
        getSettings: () => ({ aiName: 'Kai' }),
        normaliseAiName: (v) => String(v || 'ARC').trim(),
        getHabits: () => [{ id: 'h_native', name: 'Read 20 pages', reminder: '21:30', repeat: ['fri'], completions: {} }],
    };

    const syncRes = await syncFromHabitArc(mockApp, mockWin);
    assert.equal(syncRes.synced, true);
    assert.equal(syncRes.count, 1);
    assert.deepEqual(cancelled, [{ id: 4242 }]);

    const nativeTest = await sendNativeTestNotification(mockWin, 'Kai');
    assert.equal(nativeTest.sent, true);
    assert.equal(scheduled.at(-1).title, 'KAI · Test Reminder');

    // Custom Android RemoteViews Demo 3 AI Buddy Pill plugin (HabitArcTicketNotifications)
    let syncedTickets = null;
    let testTicketSent = false;
    const mockTicketWin = {
        Capacitor: {
            isNativePlatform: () => true,
            Plugins: {
                HabitArcTicketNotifications: {
                    async syncTickets(payload) {
                        syncedTickets = payload.tickets;
                        return { count: payload.tickets.length };
                    },
                    async sendTestTicket() {
                        testTicketSent = true;
                        return { sent: true };
                    },
                },
            },
        },
    };
    const ticketRes = await syncFromHabitArc(mockApp, mockTicketWin);
    assert.equal(ticketRes.synced, true);
    assert.equal(ticketRes.mode, 'custom-ticket');
    assert.equal(syncedTickets.length, 1);
    assert.equal(syncedTickets[0].aiName, 'KAI');
    assert.equal(syncedTickets[0].timeLabel, '9:30 PM');
    assert.equal(syncedTickets[0].messageText, 'Hey, time for Read 20 pages');

    const ticketTest = await sendNativeTestNotification(mockTicketWin, 'Kai');
    assert.equal(ticketTest.sent, true);
    assert.equal(ticketTest.mode, 'custom-ticket');
    assert.equal(testTicketSent, true);

    const xmlLayout = read('capacitor-ticket-plugin/res/layout/notification_time_ticket.xml');
    assert.match(xmlLayout, /buddy_ai_name/);
    assert.match(xmlLayout, /buddy_message/);
    assert.match(xmlLayout, /bg_ai_pill/);
});

test('Add_Habit.html and Settings.html expose reminder controls and Capacitor config is valid', () => {
    const addHabit = read('Add_Habit.html');
    assert.match(addHabit, /id="reminder-clear-btn"/);
    assert.match(addHabit, /id="reminder-status-hint"/);
    assert.match(addHabit, /requestNotificationPermission/);

    const settings = read('Settings.html');
    assert.match(settings, /id="test-notification-btn"/);
    assert.match(settings, /sendTestReminder/);

    const capConfig = JSON.parse(read('capacitor.config.json'));
    assert.equal(capConfig.appName, 'HabitArc');
    assert.ok(capConfig.plugins?.LocalNotifications);
});

test('Onboarding Pack 2 pixel buddies, wakeUpTime derivation, and post-onboarding Dashboard prompt hooks work', () => {
    const { app } = createHarness();
    assert.equal(app.AI_AVATARS.length, 6);
    assert.deepEqual(
        Array.from(app.AI_AVATARS, (a) => a.id),
        ['beam', 'winky', 'shades', 'nova', 'locked', 'zen'],
        'CROWN is replaced by NOVA in Pack 2'
    );
    assert.equal(app.normaliseAiAvatar('SHADES'), 'shades');
    assert.equal(app.normaliseAiAvatar('crown'), 'beam');
    assert.equal(app.getAiAvatarSrc('winky'), 'icons/ai-buddies/winky.png');
    assert.equal(app.normaliseWakeUpTime('06:30'), '06:30');
    assert.equal(app.normaliseWakeUpTime('invalid'), '07:00');
    assert.equal(app.deriveReminderFromWakeTime('06:30'), '07:00');
    assert.equal(app.deriveReminderFromWakeTime('07:00'), '07:30');

    app.updateSettings({ aiName: 'KAI', aiAvatar: 'nova', wakeUpTime: '06:45' });
    const saved = app.getSettings();
    assert.equal(saved.aiName, 'KAI');
    assert.equal(saved.aiAvatar, 'nova');
    assert.equal(saved.wakeUpTime, '06:45');
    assert.equal(app.getAiProgression().aiAvatarSrc, 'icons/ai-buddies/nova.png');

    const onboardingHtml = read('Onboarding.html');
    assert.doesNotMatch(onboardingHtml, /Gentle reminders\?/);
    assert.doesNotMatch(onboardingHtml, /Starts at Level 1 building habits for you/);
    assert.match(onboardingHtml, /id="ai-avatar-grid"/);
    assert.match(onboardingHtml, /id="wake-time-options"/);

    const dashboardHtml = read('Dashboard.html');
    assert.match(dashboardHtml, /id="ha-post-ob-notif-backdrop"/);
    assert.match(dashboardHtml, /id="ha-notif-allow-btn"/);

    // Verify unified 60fps articulated live buddy rig renders identical markup
    // across Onboarding, Dashboard, ARC AI, and Settings (with zero choppy APNGs)
    for (const id of ['beam', 'winky', 'shades', 'nova', 'locked', 'zen']) {
        const raw = readFileSync(new URL(`../icons/ai-buddies/${id}.png`, import.meta.url));
        const actlIdx = raw.indexOf(Buffer.from('acTL', 'ascii'));
        assert.equal(actlIdx, -1, `${id}.png base fallback stays clean static PNG while 60fps layers handle smooth motion`);
        const rigHtml = app.renderLiveBuddyHtml(id, 48);
        assert.match(rigHtml, new RegExp(`data-buddy="${id}"`), `renderLiveBuddyHtml renders ${id} rig`);
        assert.match(rigHtml, /ha-live-buddy-rig/, `${id} uses 60fps articulated rig`);
    }

    const aiBuddyCss = read('ai-buddy.css');
    const appUiCss = read('app-ui.css');
    for (const animName of [
        'haLiveBeamEyes',
        'haLiveWinkyStar',
        'haLiveShadesSheen',
        'haLiveNovaEyes',
        'haLiveLockedScan',
        'haLiveZenSprout',
    ]) {
        assert.match(aiBuddyCss, new RegExp(animName), `ai-buddy.css defines 60fps ${animName}`);
        assert.match(appUiCss, new RegExp(animName), `app-ui.css shares identical 60fps ${animName}`);
    }
});
