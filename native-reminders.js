/* Native exact-time reminder bridge for Capacitor (Android / iOS).
 * Schedules OS-level exact repeating alarms via @capacitor/local-notifications
 * at zero server cost (pure reminders — no notification action buttons),
 * while staying a safe no-op in regular desktop/mobile browsers. */

export const CHANNEL_ID = 'habitarc_exact_reminders';

const DAY_TO_CAPACITOR_WEEKDAY = Object.freeze({
    sun: 1,
    mon: 2,
    tue: 3,
    wed: 4,
    thu: 5,
    fri: 6,
    sat: 7,
});
const ALL_DAYS = Object.freeze(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

function getLocalNotificationsPlugin(win = typeof window !== 'undefined' ? window : null) {
    if (!win) return null;
    const cap = win.Capacitor;
    if (!cap) return null;
    const isNative = typeof cap.isNativePlatform === 'function'
        ? Boolean(cap.isNativePlatform())
        : (typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web');
    if (!isNative) return null;
    const plugin = cap.Plugins?.LocalNotifications || null;
    return plugin && typeof plugin.schedule === 'function' ? plugin : null;
}

function getCustomTicketPlugin(win = typeof window !== 'undefined' ? window : null) {
    if (!win?.Capacitor) return null;
    const cap = win.Capacitor;
    const isNative = typeof cap.isNativePlatform === 'function'
        ? Boolean(cap.isNativePlatform())
        : (typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web');
    if (!isNative) return null;
    const plugin = cap.Plugins?.HabitArcTicketNotifications || null;
    return plugin && typeof plugin.syncTickets === 'function' ? plugin : null;
}

export function isNativeRemindersSupported(win = typeof window !== 'undefined' ? window : null) {
    return Boolean(getCustomTicketPlugin(win) || getLocalNotificationsPlugin(win));
}

// Deterministic positive 31-bit integer ID for Android NotificationManager / AlarmManager.
export function computeNativeNotificationId(scope, habitId, slotKey) {
    const input = `${scope || 'local'}|${habitId}|${slotKey}`;
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const positive = (hash >>> 1) & 0x3fffffff;
    return positive === 0 ? 1001 : positive;
}

function parseReminderTime(value) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
    if (!match) return null;
    return { hour: Number(match[1]), minute: Number(match[2]) };
}

function nextOccurrenceForWeekday(weekday, hour, minute, completedToday, now = new Date()) {
    const targetJsDay = weekday - 1;
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    let deltaDays = (targetJsDay - now.getDay() + 7) % 7;
    if (deltaDays === 0 && (completedToday || candidate.getTime() <= now.getTime())) {
        deltaDays = 7;
    }
    candidate.setDate(candidate.getDate() + deltaDays);
    return candidate;
}

function format12HourParts(hour, minute) {
    const period = hour >= 12 ? 'PM' : 'AM';
    const h12 = String(hour % 12 || 12);
    const mm = String(minute).padStart(2, '0');
    return {
        timeText: `${h12}:${mm}`,
        periodText: period,
        full: `${h12}:${mm} ${period}`,
    };
}

export function buildNativeNotificationSpecs({
    habits = [],
    dailyReminder = false,
    todayKey = '',
    scope = 'local',
    aiName = 'ARC',
    now = new Date(),
} = {}) {
    if (!dailyReminder) return [];
    const safeAi = String(aiName || 'ARC').trim().slice(0, 16) || 'ARC';
    const specs = [];

    for (const habit of habits) {
        if (!habit?.id) continue;
        const parsed = parseReminderTime(habit.reminder);
        const rawDays = Array.isArray(habit.repeat) ? habit.repeat : ALL_DAYS;
        const days = rawDays.filter((d) => d in DAY_TO_CAPACITOR_WEEKDAY);
        const completedToday = Boolean(todayKey && habit.completions?.[todayKey]);

        if (parsed && days.length > 0) {
            const parts = format12HourParts(parsed.hour, parsed.minute);
            const cleanHabitName = String(habit.name || 'your habit').slice(0, 80);
            const messageText = `Hey, time for ${cleanHabitName}`;

            for (const day of days) {
                const weekday = DAY_TO_CAPACITOR_WEEKDAY[day];
                const id = computeNativeNotificationId(scope, habit.id, `wk_${weekday}`);
                const nextAt = nextOccurrenceForWeekday(weekday, parsed.hour, parsed.minute, completedToday, now);
                const isDeferredToday = completedToday && (weekday - 1) === now.getDay();
                specs.push({
                    id,
                    title: `${safeAi.toUpperCase()} · ${parts.full}`,
                    body: messageText,
                    summaryText: safeAi.toUpperCase(),
                    channelId: CHANNEL_ID,
                    schedule: isDeferredToday
                        ? { at: nextAt, allowWhileIdle: true }
                        : { on: { weekday, hour: parsed.hour, minute: parsed.minute }, allowWhileIdle: true },
                    ticket: {
                        id,
                        triggerAtMs: nextAt.getTime(),
                        aiName: safeAi.toUpperCase(),
                        timeLabel: parts.full,
                        messageText,
                        repeatWeekly: true,
                    },
                    extra: {
                        habitArcManaged: true,
                        scope,
                        habitId: habit.id,
                        url: '/Dashboard.html',
                    },
                });
            }
        }
    }

    return specs;
}

let channelInitialised = false;
let syncChain = Promise.resolve();

async function ensureNativeChannel(plugin) {
    if (!plugin || channelInitialised) return;
    try {
        if (typeof plugin.createChannel === 'function') {
            await plugin.createChannel({
                id: CHANNEL_ID,
                name: 'Habit Reminders',
                description: 'Scheduled exact-time reminders for your daily HabitArc routines',
                importance: 4,
                visibility: 1,
                vibration: true,
            });
        }
        channelInitialised = true;
    } catch (error) {
        console.warn('HabitArc: native notification channel setup warning:', error);
    }
}

export async function checkNativePermission(win = typeof window !== 'undefined' ? window : null) {
    const plugin = getLocalNotificationsPlugin(win);
    if (!plugin) return { supported: false, permission: 'unsupported' };
    try {
        const res = await plugin.checkPermissions?.();
        const display = res?.display || 'prompt';
        const mapped = display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default';
        return { supported: true, permission: mapped };
    } catch {
        return { supported: true, permission: 'default' };
    }
}

export async function requestNativePermission(win = typeof window !== 'undefined' ? window : null) {
    const plugin = getLocalNotificationsPlugin(win);
    if (!plugin) return { supported: false, granted: false, permission: 'unsupported' };
    try {
        const res = await plugin.requestPermissions?.();
        const display = res?.display || 'denied';
        const granted = display === 'granted';
        if (granted) await ensureNativeChannel(plugin);
        return {
            supported: true,
            granted,
            permission: granted ? 'granted' : display === 'denied' ? 'denied' : 'default',
            message: granted
                ? 'Exact device reminders are enabled (even when HabitArc is closed).'
                : 'Device notification permission was not granted.',
        };
    } catch (error) {
        return {
            supported: true,
            granted: false,
            permission: 'error',
            message: error?.message || 'Could not request device notification permission.',
        };
    }
}

export function syncFromHabitArc(app, win = typeof window !== 'undefined' ? window : null) {
    const ticketPlugin = getCustomTicketPlugin(win);
    const plugin = getLocalNotificationsPlugin(win);
    if ((!ticketPlugin && !plugin) || !app) return Promise.resolve({ synced: false, count: 0 });

    syncChain = syncChain
        .catch(() => undefined)
        .then(async () => {
            if (plugin) {
                const perm = await checkNativePermission(win);
                if (perm.permission !== 'granted') {
                    return { synced: false, count: 0, reason: 'permission-required' };
                }
                await ensureNativeChannel(plugin);
            }

            const prefs = app.getReminderPreferences?.() || {};
            const scope = app.getAuthUser?.()?.uid || 'local';
            const todayKey = app.today?.() || '';
            const rawAi = app.getSettings?.()?.aiName;
            const aiName = app.normaliseAiName?.(rawAi) || String(rawAi || 'ARC').trim() || 'ARC';
            const specs = prefs.dailyReminder
                ? buildNativeNotificationSpecs({
                    habits: app.getHabits?.() || [],
                    dailyReminder: true,
                    todayKey,
                    scope,
                    aiName,
                })
                : [];

            // Prefer custom Option 3 RemoteViews Split Time-Ticket plugin on Android
            // so the Phone Lockscreen card matches the in-app Time-Ticket 1:1.
            if (ticketPlugin) {
                const res = await ticketPlugin.syncTickets({
                    tickets: specs.map((s) => s.ticket),
                });
                return { synced: true, count: Number(res?.count ?? specs.length), mode: 'custom-ticket' };
            }

            const pendingRes = await plugin.getPending?.().catch(() => ({ notifications: [] }));
            const existingIds = (pendingRes?.notifications || [])
                .filter((n) => n && Number.isInteger(Number(n.id)))
                .map((n) => ({ id: Number(n.id) }));
            if (existingIds.length > 0 && typeof plugin.cancel === 'function') {
                await plugin.cancel({ notifications: existingIds });
            }

            if (specs.length > 0) {
                await plugin.schedule({
                    notifications: specs.map(({ ticket, ...rest }) => rest),
                });
            }
            return { synced: true, count: specs.length, mode: 'local-notifications' };
        })
        .catch((error) => {
            console.warn('HabitArc: native reminder sync failed:', error);
            return { synced: false, count: 0, error: error?.message || 'sync-failed' };
        });

    return syncChain;
}

export async function sendNativeTestNotification(win = typeof window !== 'undefined' ? window : null, aiName = 'ARC') {
    const safeAi = String(aiName || 'ARC').trim().toUpperCase().slice(0, 16) || 'ARC';
    const ticketPlugin = getCustomTicketPlugin(win);
    const plugin = getLocalNotificationsPlugin(win);
    if (!ticketPlugin && !plugin) return { sent: false, supported: false };
    if (plugin) {
        const perm = await checkNativePermission(win);
        if (perm.permission !== 'granted') {
            const req = await requestNativePermission(win);
            if (!req.granted) return { sent: false, supported: true, message: req.message };
        }
        await ensureNativeChannel(plugin);
    }
    if (ticketPlugin && typeof ticketPlugin.sendTestTicket === 'function') {
        await ticketPlugin.sendTestTicket({
            aiName: safeAi,
            messageText: `Hey, your ${safeAi} reminders are active`,
        });
        return { sent: true, supported: true, mode: 'custom-ticket', message: `Test reminder sent from ${safeAi}!` };
    }
    const id = computeNativeNotificationId('test', 'habitarc_test', String(Date.now() % 100000));
    await plugin.schedule({
        notifications: [
            {
                id,
                title: `${safeAi} · Test Reminder`,
                body: `Hey, your ${safeAi} reminders are active`,
                channelId: CHANNEL_ID,
                schedule: { at: new Date(Date.now() + 1200), allowWhileIdle: true },
                extra: { habitArcManaged: true, test: true, url: '/Dashboard.html' },
            },
        ],
    });
    return { sent: true, supported: true, message: `Test reminder from ${safeAi} scheduled — arriving in ~1 second.` };
}

const HabitArcNativeReminders = Object.freeze({
    CHANNEL_ID,
    isNativeRemindersSupported,
    computeNativeNotificationId,
    buildNativeNotificationSpecs,
    checkNativePermission,
    requestNativePermission,
    syncFromHabitArc,
    sendNativeTestNotification,
});

if (typeof window !== 'undefined') {
    window.HabitArcNativeReminders = HabitArcNativeReminders;
}

export default HabitArcNativeReminders;
