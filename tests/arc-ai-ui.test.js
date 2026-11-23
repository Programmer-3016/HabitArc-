import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildHabitCoachContext, renderCoachMarkdown, renderArcSignalDeck, renderArcChatAnswer, cleanArcDisplayText, consumeArcCoachStream, createArcWordReveal } from '../habit-analytics.js';
import * as chatStore from '../arc-chat-store.js';
import { aiProgressionForClearDays } from '../runner-treasures.js';

const html = readFileSync(new URL('../Arc_AI.html', import.meta.url), 'utf8');
const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/^import\s+(?:\{[\s\S]*?\}|\*\s+as\s+\w+|\w+)\s+from\s+['"].+?['"];?\s*/gm, '');
const now = Date.parse('2026-11-15T12:00:00Z');

class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
}
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function arcAi({ empty = false, signedIn = false, streaming = false, truncated = false, holdStream = false, autoExecute = false, actionName = '10-Min Wind-Down', aiName = 'ARC', clearDays = 0, suggestedAction = null, storage = null, cloudAuth = null } = {}) {
    const elements = new Map();
    const events = new Map();
    const requests = [];
    const announced = [];
    let releaseStream;
    const streamGate = holdStream ? new Promise(resolve => { releaseStream = resolve; }) : null;
    function element() {
        const classes = new Set();
        let htmlMarkup = '';
        let plainText = '';
        return {
            get textContent() { return plainText; },
            set textContent(v) { plainText = String(v ?? ''); },
            get innerHTML() { return htmlMarkup; },
            set innerHTML(v) { htmlMarkup = String(v ?? ''); plainText = htmlMarkup.replace(/<[^>]+>/g, ''); },
            value: '', placeholder: '', disabled: false, type: '', dataset: {},
            attrs: {}, handlers: {}, scrollHeight: 36, clientHeight: 320, scrollTop: 0,
            scrollTo({ top }) { this.scrollTop = top; },
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
            removeAttribute(name) { delete this.attrs[name]; },
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
        return { id: `habit-${index}`, name, icon: 'book', reminder: '08:00', repeat: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], why: 'Daily anchor', completions, createdAt: '2026-10-01' };
    });
    const addedHabits = [];
    const updatedHabits = [];
    const deletedHabits = [];
    const restoredHabits = [];
    const completedHabits = [];
    const uncompletedHabits = [];
    const aiActions = [];
    const taskCreated = [];
    const taskRemoved = [];
    const progression = { ...aiProgressionForClearDays(clearDays), aiName };
    const app = {
        getSettings: () => ({ userName: 'Alex', aiName, aiTone: progression.aiTone || 'default' }),
        updateSettings: patch => { if (patch?.aiTone) progression.aiTone = patch.aiTone; progression.activeTone = progression.level >= 4 ? (patch?.aiTone || 'default') : 'default'; },
        getAiProgression: () => progression,
        recordAiAction: kind => { aiActions.push(kind); return progression; },
        getHabits: () => habits,
        getHabitById: id => habits.find(h => h.id === id) || null,
        getCompletionHistory: () => [],
        getOverallCurrentStreak: () => empty ? 0 : 14,
        getOverallLongestStreak: () => empty ? 0 : 14,
        addHabit: payload => { const h = { id: `new-${addedHabits.length}`, ...payload }; addedHabits.push(h); habits.push(h); return { success: true, habit: h }; },
        updateHabit: (id, updates) => {
            updatedHabits.push({ id, updates });
            const target = habits.find(h => h.id === id);
            if (!target) return false;
            Object.assign(target, updates);
            return true;
        },
        deleteHabit: id => { deletedHabits.push(id); const idx = habits.findIndex(h => h.id === id); if (idx !== -1) habits.splice(idx, 1); },
        restoreHabit: backup => { restoredHabits.push(backup); if (!habits.some(h => h.id === backup.id)) habits.push(backup); return true; },
        completeHabit: id => { completedHabits.push(id); const h = habits.find(h => h.id === id); if (h) { h.completions = h.completions || {}; h.completions['2026-11-15'] = true; } return true; },
        uncompleteHabit: id => { uncompletedHabits.push(id); const h = habits.find(h => h.id === id); if (h?.completions) delete h.completions['2026-11-15']; return true; },
        isCompletedToday: id => Boolean(habits.find(h => h.id === id)?.completions?.['2026-11-15']),
        escapeHTML,
        whenAuthReady: async () => signedIn ? { uid: 'qa-user' } : null,
        getAuthUser: () => signedIn ? { uid: 'qa-user' } : null,
        getAuthToken: async () => 'qa-token',
        flushCloudSync: async () => {},
    };
    const body = element();
    vm.runInNewContext(source, {
        HabitArc: app, buildHabitCoachContext, renderCoachMarkdown, renderArcSignalDeck, renderArcChatAnswer, cleanArcDisplayText, consumeArcCoachStream, createArcWordReveal, ...chatStore,
        Date: Clock, Intl, AbortSignal, AbortController,
        localStorage: storage,
        setTimeout, clearTimeout,
        navigator: { onLine: true },
        console: { warn() {} },
        document: { getElementById: id => elements.get(id) || null, addEventListener: () => {}, hidden: false, body, activeElement: null },
        window: {
            addEventListener: (name, handler) => events.set(name, handler),
            HabitArcUI: { announce: msg => announced.push(msg) },
            HabitArcAuth: cloudAuth,
            HabitArcTaskStore: {
                newTask: fields => ({ id: `task-${taskCreated.length}`, ...fields }),
                taskStore: { start() {}, put: t => { taskCreated.push(t); return t; }, remove: id => { taskRemoved.push(id); } }
            }
        },
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (streamGate) {
                await Promise.race([
                    streamGate,
                    new Promise((_, reject) => {
                        if (options?.signal?.aborted) { reject(options.signal.reason); return; }
                        options?.signal?.addEventListener?.('abort', () => reject(options.signal.reason), { once: true });
                    })
                ]);
            }
            const payload = {
                answer: 'Try reading 10 minutes right after dinner.',
                suggestedAction: suggestedAction || {
                    type: 'create_habit',
                    name: actionName,
                    category: 'Mindfulness',
                    reminder: '21:15',
                    repeat: ['mon', 'wed', 'fri'],
                    why: 'Anchor bedtime consistency'
                },
                autoExecute,
                usage: { remaining: 6 },
                snapshot: { habitCount: 2, totalScheduled: 56, totalLogged: 28, dateWindow: { start: '2026-10-18', end: '2026-11-15' }, timeZone: 'UTC', insufficientData: false, truncated: false }
            };
            if (streaming) {
                const streamText = [
                    'event: start\ndata: {"ready":true}\n\n',
                    'event: delta\ndata: {"text":"Try reading 10 minutes "}\n\n',
                    'event: delta\ndata: {"text":"right after dinner."}\n\n',
                    truncated ? '' : 'event: done\ndata: ' + JSON.stringify(payload) + '\n\n'
                ].join('');
                const bytes = new TextEncoder().encode(streamText);
                let cursor = 0;
                return {
                    ok: true,
                    headers: { get: () => 'text/event-stream; charset=utf-8' },
                    body: new ReadableStream({
                        pull(controller) {
                            if (cursor >= bytes.length) { controller.close(); return; }
                            controller.enqueue(bytes.slice(cursor, cursor + 21));
                            cursor += 21;
                        }
                    })
                };
            }
            return { ok: true, json: async () => payload };
        },
    });
    return { elements, events, requests, announced, addedHabits, updatedHabits, deletedHabits, restoredHabits, completedHabits, uncompletedHabits, aiActions, taskCreated, taskRemoved, habits, body, releaseStream };
}

test('Arc_AI keeps 4A Zen cards with 4D 28-day momentum check and locked 100dvh shell', () => {
    assert.match(html, /class="[^"]*ha-arc-body[^"]*"/);
    assert.doesNotMatch(html, /<body[^>]*min-h-screen/);
    assert.match(html, /interactive-widget=resizes-content/);
    assert.ok(html.includes('id="arc-scroll-area"'));
    assert.ok(!html.includes('ARC AI · ONLINE'));
    const mobileNav = html.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)[0];
    assert.deepEqual([...mobileNav.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['Dashboard.html', 'Habits.html', 'Notes.html', 'Insights.html', 'Arc_AI.html']);
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
    assert.match(authed.elements.get('ai-coach-answer').innerHTML, /Try reading 10 minutes right after dinner\./);
    assert.match(authed.elements.get('ai-coach-answer').innerHTML, /ha-arc-chat-answer/);
    assert.doesNotMatch(authed.elements.get('ai-coach-answer').innerHTML, /data-arc-mode="read"/);
    assert.match(authed.elements.get('ai-coach-answer').innerHTML, /HABITARC ROUTINE/);
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



async function waitFor(predicate, message = 'Expected UI state not reached', timeoutMs = 3500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 12));
    }
    assert.fail(message);
}

test('ARC AI reveals genuine SSE words progressively before saving the final answer', async () => {
    const authed = arcAi({ signedIn: true, streaming: true });
    authed.elements.get('arc-card-momentum').handlers.click();
    await waitFor(() => authed.requests.length === 1);
    assert.equal(authed.requests[0].options.headers.Accept, 'text/event-stream');
    await waitFor(() => /Try reading/.test(authed.elements.get('ai-coach-answer').innerHTML),
        'ARC AI must reveal first words before done');
    assert.doesNotMatch(authed.elements.get('ai-coach-answer').innerHTML, /after dinner/,
        'First visible words must not jump straight to the full answer');
    await waitFor(() => /6 ARC AI messages/.test(authed.elements.get('ai-coach-status').textContent),
        'Full response was not finalized');
    assert.match(authed.elements.get('ai-coach-answer').innerHTML, /Try reading 10 minutes right after dinner/);
    assert.equal(authed.elements.get('ai-coach-action-box').classList.contains('hidden'), false);
    assert.equal(authed.elements.get('ai-coach-question').value, '');
});

test('ARC AI interrupted SSE preserves received text without saving it', async () => {
    const authed = arcAi({ signedIn: true, streaming: true, truncated: true });
    authed.elements.get('arc-card-momentum').handlers.click();
    await waitFor(() => /connection closed before/.test(authed.elements.get('ai-coach-status').textContent));
    assert.match(authed.elements.get('ai-coach-answer').innerHTML, /Try reading 10 minutes right after dinner/);
    assert.match(authed.elements.get('ai-coach-evidence').textContent, /Partial reply/);
    assert.equal(authed.elements.get('ai-coach-action-box').classList.contains('hidden'), true);
    assert.match(authed.elements.get('ai-coach-question').value, /28-day momentum/);
});


test('ARC AI replaces skeleton bars with a compact accessible typing indicator', async () => {
    const view = arcAi({ signedIn: true, streaming: true, holdStream: true });
    const scroll = view.elements.get('arc-scroll-area');
    scroll.scrollHeight = 1800;
    scroll.clientHeight = 320;
    view.elements.get('arc-card-momentum').handlers.click();
    await waitFor(() => view.requests.length === 1);
    const questionInput = view.elements.get('ai-coach-question');
    const submitBtn = view.elements.get('ai-coach-submit');
    assert.equal(questionInput.value, '', 'Submitted prompt must clear from the type bar immediately');
    assert.equal(Boolean(questionInput.disabled), false, 'Composer must stay unlocked so users can type a follow-up while ARC thinks');
    assert.equal(submitBtn.disabled, false, 'Submit button becomes an enabled Stop button while ARC thinks');
    assert.equal(submitBtn.type, 'button');
    assert.equal(submitBtn.attrs['aria-label'], 'Stop generating');
    assert.equal(submitBtn.classList.contains('is-stop'), true);
    questionInput.value = 'Draft while ARC thinks';
    const answer = view.elements.get('ai-coach-answer').innerHTML;
    assert.match(answer, /class="ha-arc-thinking"/);
    assert.match(answer, /ha-arc-thinking-dots/);
    assert.match(answer, /Thinking through your routines/);
    assert.doesNotMatch(answer, /ha-arc-skeleton|ha-arc-skel-line/);
    assert.equal(view.elements.get('ai-coach-copy-btn').classList.contains('hidden'), true);
    assert.equal(view.elements.get('ai-coach-evidence').textContent, '');
    assert.equal(scroll.scrollTop, 1480, 'Sending a new prompt must land at bottom of chat');
    view.releaseStream();
    await waitFor(() => /6 ARC AI messages/.test(view.elements.get('ai-coach-status').textContent));
    assert.equal(questionInput.value, 'Draft while ARC thinks', 'Completion must not erase a follow-up draft typed while thinking');
    assert.equal(submitBtn.disabled, false);
    assert.equal(submitBtn.type, 'submit');
    assert.equal(submitBtn.attrs['aria-label'], 'Ask ARC AI');
    assert.equal(submitBtn.classList.contains('is-stop'), false);
    assert.equal(view.elements.get('ai-coach-copy-btn').classList.contains('hidden'), false);
});

test('ARC AI Stop button cancels before first words, keeps question, and restores composer cleanly', async () => {
    const view = arcAi({ signedIn: true, streaming: true, holdStream: true });
    const questionInput = view.elements.get('ai-coach-question');
    const submitBtn = view.elements.get('ai-coach-submit');
    view.elements.get('arc-card-momentum').handlers.click();
    await waitFor(() => view.requests.length === 1);
    assert.equal(view.requests[0].options.signal.aborted, false);
    assert.equal(submitBtn.classList.contains('is-stop'), true);

    submitBtn.handlers.click({ preventDefault() {} });
    await waitFor(() => submitBtn.type === 'submit');
    assert.equal(view.requests[0].options.signal.aborted, true);
    assert.equal(submitBtn.classList.contains('is-stop'), false);
    assert.equal(submitBtn.attrs['aria-label'], 'Ask ARC AI');
    assert.match(questionInput.value, /28-day momentum/);
    assert.match(view.elements.get('ai-coach-status').textContent, /Stopped\. Your question is kept below\./);
    assert.equal(view.elements.get('arc-zen-home').classList.contains('hidden'), false);
    assert.equal(view.elements.get('arc-thread-view').classList.contains('hidden'), true);
});

test('ARC AI Stop button aborts mid-stream cleanly without saving partial text or action cards', async () => {
    const view = arcAi({ signedIn: true, streaming: true });
    const questionInput = view.elements.get('ai-coach-question');
    const submitBtn = view.elements.get('ai-coach-submit');
    view.elements.get('arc-card-momentum').handlers.click();
    await waitFor(() => /Try reading/.test(view.elements.get('ai-coach-answer').innerHTML));

    submitBtn.handlers.click({ preventDefault() {} });
    await waitFor(() => submitBtn.type === 'submit');
    assert.equal(submitBtn.classList.contains('is-stop'), false);
    assert.match(view.elements.get('ai-coach-answer').innerHTML, /Try reading/);
    assert.match(view.elements.get('ai-coach-evidence').textContent, /Stopped · Partial reply not saved/);
    assert.equal(view.elements.get('ai-coach-action-box').classList.contains('hidden'), true);
    assert.equal(view.elements.get('ai-coach-copy-btn').classList.contains('hidden'), true);
    assert.match(questionInput.value, /28-day momentum/);
});

test('ARC AI follows answer while near bottom, then respects manual scroll-up', async () => {
    const view = arcAi({ signedIn: true, streaming: true, holdStream: true });
    const scroll = view.elements.get('arc-scroll-area');
    scroll.scrollHeight = 1800;
    scroll.clientHeight = 320;
    view.elements.get('arc-card-momentum').handlers.click();
    await waitFor(() => view.requests.length === 1);
    assert.equal(scroll.scrollTop, 1480);
    view.releaseStream();
    await waitFor(() => /Try reading/.test(view.elements.get('ai-coach-answer').innerHTML));
    // A new reply expands the scrollable thread; stream should stay pinned.
    await new Promise(resolve => setTimeout(resolve, 20));
    scroll.scrollHeight = 2100;
    await waitFor(() => scroll.scrollTop === 1780, 'Streaming should auto-follow newly revealed content');
    // The member scrolls up into the previous conversation.
    scroll.scrollTop = 300;
    scroll.handlers.scroll();
    await waitFor(() => /6 ARC AI messages/.test(view.elements.get('ai-coach-status').textContent));
    assert.equal(scroll.scrollTop, 300, 'Auto-follow must not fight a manual scroll-up');
});

test('ARC AI typing and scrolling code is wired to the bounded conversation scrollport', () => {
    assert.match(html, /function scrollChatToLatest\(force = false\)/);
    assert.match(html, /scrollArea\.scrollTop = bottom/);
    assert.match(html, /scrollChatToLatest\(true\)/);
    assert.match(html, /scrollArea\?\.addEventListener\?\.\('scroll'/);
    assert.match(html, /showArcThinking\('Finishing your reply…'\)/);
    assert.doesNotMatch(html, /ha-arc-skeleton|ha-arc-skel-line/);
});

test('ARC AI keeps valid color channel tokens, inline SVGs, and square thread accent bar', () => {
    const css = readFileSync(new URL('../app-ui.css', import.meta.url), 'utf8');
    const arcCtx = readFileSync(new URL('../arc-context.js', import.meta.url), 'utf8');
    const hub = readFileSync(new URL('../productivity-hub.js', import.meta.url), 'utf8');
    assert.doesNotMatch(css, /(?:color|background|fill|border[a-z-]*)\s*:\s*var\(--ha-primary-fixed-dim/);
    assert.doesNotMatch(html, /material-symbols-outlined/);
    assert.doesNotMatch(arcCtx, /material-symbols-outlined/);
    assert.doesNotMatch(hub, /button\.innerHTML=.*material-symbols-outlined/);
    assert.doesNotMatch(css, /\.ha-arc-answer-card[^{]*\{[^}]*border-radius:\s*14px\s*!important/);
});

test('Level 1 autoExecute creates habit directly with 1-tap UNDO and skips duplicates', async () => {
    const view = arcAi({ signedIn: true, autoExecute: true, actionName: 'Evening Stretch' });
    view.elements.get('ai-coach-question').value = 'Create Evening Stretch habit';
    view.elements.get('ai-coach-form').handlers.submit({ preventDefault() {} });
    await waitFor(() => view.addedHabits.length === 1);

    assert.equal(view.addedHabits[0].name, 'Evening Stretch');
    assert.equal(view.elements.get('ai-coach-action-box').classList.contains('hidden'), false);
    assert.equal(view.elements.get('ai-coach-action-kicker').textContent, 'ADDED BY HABITARC AI');
    assert.equal(view.elements.get('ai-coach-action-title').textContent, 'Added "Evening Stretch"');
    const actionBtn = view.elements.get('ai-coach-apply-btn');
    assert.equal(actionBtn.textContent, 'UNDO');
    assert.equal(actionBtn.disabled, false);
    assert.match(view.elements.get('ai-coach-status').textContent, /Added "Evening Stretch" to HabitArc/);

    // Clicking UNDO deletes the auto-created habit and returns the card to ADD HABIT
    actionBtn.handlers.click();
    assert.deepEqual(view.deletedHabits, ['new-0']);
    assert.equal(view.elements.get('ai-coach-action-kicker').textContent, 'PROPOSED NEW HABIT');
    assert.equal(actionBtn.textContent, 'ADD HABIT');

    // Duplicate habit guard prevents auto-creating an existing habit name
    const dup = arcAi({ signedIn: true, autoExecute: true, actionName: '  walk  ' });
    dup.elements.get('ai-coach-question').value = 'Add Walk habit';
    dup.elements.get('ai-coach-form').handlers.submit({ preventDefault() {} });
    await waitFor(() => /already in your habits/.test(dup.elements.get('ai-coach-status').textContent));
    assert.equal(dup.addedHabits.length, 0);
    assert.equal(dup.elements.get('ai-coach-apply-btn').textContent, 'ADD HABIT');
});

test('Arc_AI removes top clutter cards and keeps Quest Hub modal, History drawer, Level 2-4 powers & UNDO flows', async () => {
    assert.equal(html.includes('id="arc-level-card"'), false);
    assert.equal(html.includes('id="arc-thread-journey"'), false);

    const l1 = arcAi();
    assert.equal(l1.elements.get('arc-ai-buddy-name').textContent, 'ARC');
    assert.equal(l1.elements.get('arc-ai-lvl-badge').textContent, 'LVL 1');
    assert.equal(l1.elements.get('arc-ai-rank').textContent, 'HABIT BUILDER');
    assert.equal(l1.elements.get('arc-ai-next-txt').textContent, '0/3 QUESTS');
    assert.equal(l1.elements.get('arc-quest-hdr-title').textContent, 'QUESTS TO LVL 2');
    assert.equal(l1.elements.get('arc-quest-cnt').textContent, '0/3');
    assert.equal(l1.elements.get('arc-q-prog-0').textContent, '0/1');
    assert.equal(l1.elements.get('arc-q-prog-1').textContent, '0/3');
    assert.equal(l1.elements.get('arc-tier-1').classList.contains('is-unlocked'), true);
    assert.equal(l1.elements.get('arc-tier-state-1').textContent, 'ACTIVE');
    assert.equal(l1.elements.get('arc-tier-state-2').textContent, 'LOCKED');
    assert.equal(l1.elements.get('arc-tone-lock').textContent, 'LOCKED · LVL 4');
    assert.equal(l1.elements.get('arc-tone-row').classList.contains('is-locked'), true);
    assert.equal(l1.elements.get('arc-tone-hinglish').disabled, true);
    assert.equal(l1.elements.get('arc-thread-lvl-badge').textContent, 'LVL 1');
    assert.equal(l1.elements.get('ai-coach-resp-lvl').textContent, 'LVL 1');
    assert.match(l1.elements.get('arc-ai-power-copy').textContent, /Right now at Level 1 you can use ARC to create habits for you/);

    l1.elements.get('arc-open-hub-btn').handlers.click();
    assert.equal(l1.elements.get('arc-hub-dialog').classList.contains('is-open'), true);
    l1.elements.get('arc-lvl1-try-btn').handlers.click();
    assert.equal(l1.elements.get('ai-coach-question').value, 'Create a 10-min stretching habit at 08:00');
    assert.equal(l1.elements.get('arc-hub-dialog').classList.contains('is-open'), false);

    l1.elements.get('arc-zen-history-btn').handlers.click();
    assert.equal(l1.elements.get('arc-history-dialog').classList.contains('is-open'), true);
    l1.elements.get('arc-hist-close-btn').handlers.click();
    assert.equal(l1.elements.get('arc-history-dialog').classList.contains('is-open'), false);

    // Auto-update at LVL 2 + 1-tap UNDO
    const l2 = arcAi({
        signedIn: true,
        aiName: 'NOVA',
        clearDays: 1,
        autoExecute: true,
        suggestedAction: {
            type: 'update_habit',
            habitId: 'habit-1',
            habitName: 'Walk',
            reminder: '06:45',
            why: 'Cooler morning air'
        }
    });
    assert.equal(l2.elements.get('arc-ai-buddy-name').textContent, 'NOVA');
    assert.equal(l2.elements.get('arc-ai-lvl-badge').textContent, 'LVL 2');
    assert.equal(l2.elements.get('arc-ai-rank').textContent, 'ROUTINE MANAGER');
    assert.equal(l2.elements.get('arc-quest-hdr-title').textContent, 'QUESTS TO LVL 3');
    assert.equal(l2.elements.get('arc-thread-name').textContent, 'NOVA THREAD');
    assert.equal(l2.elements.get('arc-thread-lvl-badge').textContent, 'LVL 2');
    assert.equal(l2.elements.get('ai-coach-resp-lvl').textContent, 'LVL 2');
    assert.equal(l2.elements.get('arc-tier-2').classList.contains('is-unlocked'), true);
    assert.equal(l2.elements.get('arc-tier-state-1').textContent, 'ON ✓');
    assert.equal(l2.elements.get('arc-tier-state-2').textContent, 'ACTIVE');
    assert.equal(l2.elements.get('arc-tier-state-3').textContent, 'LOCKED');
    assert.equal(l2.elements.get('arc-hub-try-2').classList.contains('hidden'), false);

    l2.elements.get('arc-open-hub-btn').handlers.click();
    l2.elements.get('arc-hub-try-2').handlers.click();
    assert.equal(l2.elements.get('ai-coach-question').value, 'Change my first habit reminder to 08:30');
    assert.equal(l2.elements.get('arc-hub-dialog').classList.contains('is-open'), false);

    l2.elements.get('ai-coach-question').value = 'Change Walk reminder to 06:45';
    l2.elements.get('ai-coach-form').handlers.submit({ preventDefault() {} });
    await waitFor(() => l2.updatedHabits.length === 1);

    assert.equal(l2.habits[1].reminder, '06:45');
    assert.equal(l2.elements.get('ai-coach-action-kicker').textContent, 'UPDATED BY NOVA');
    assert.equal(l2.elements.get('ai-coach-action-title').textContent, 'Updated "Walk"');
    assert.match(l2.elements.get('ai-coach-status').textContent, /Updated "Walk" in HabitArc\. 6 NOVA messages remaining/);
    const actionBtn = l2.elements.get('ai-coach-apply-btn');
    assert.equal(actionBtn.textContent, 'UNDO');

    actionBtn.handlers.click();
    assert.equal(l2.updatedHabits.length, 2);
    assert.equal(l2.habits[1].reminder, '08:00');
    assert.equal(l2.habits[1].why, 'Daily anchor');
    assert.equal(l2.elements.get('ai-coach-action-kicker').textContent, 'PROPOSED HABIT UPDATE');
    assert.equal(actionBtn.textContent, 'APPLY UPDATE');

    // LVL 2 auto-delete + 1-tap UNDO restores deleted habit
    const delView = arcAi({
        signedIn: true,
        aiName: 'NOVA',
        clearDays: 1,
        autoExecute: true,
        suggestedAction: { type: 'delete_habit', habitId: 'habit-1', habitName: 'Walk' }
    });
    delView.elements.get('ai-coach-question').value = 'Delete Walk habit';
    delView.elements.get('ai-coach-form').handlers.submit({ preventDefault() {} });
    await waitFor(() => delView.deletedHabits.length === 1);
    assert.deepEqual(delView.deletedHabits, ['habit-1']);
    assert.equal(delView.elements.get('ai-coach-action-kicker').textContent, 'DELETED BY NOVA');
    assert.equal(delView.elements.get('ai-coach-apply-btn').textContent, 'UNDO');
    delView.elements.get('ai-coach-apply-btn').handlers.click();
    assert.equal(delView.restoredHabits.length, 1);
    assert.equal(delView.restoredHabits[0].name, 'Walk');
    assert.equal(delView.elements.get('ai-coach-apply-btn').textContent, 'DELETE HABIT');

    // LVL 2 auto-complete + UNDO uncompletes
    const compView = arcAi({
        signedIn: true,
        aiName: 'NOVA',
        clearDays: 1,
        autoExecute: true,
        suggestedAction: { type: 'complete_habit', habitId: 'habit-1', habitName: 'Walk' }
    });
    compView.elements.get('ai-coach-question').value = 'Mark Walk done';
    compView.elements.get('ai-coach-form').handlers.submit({ preventDefault() {} });
    await waitFor(() => compView.completedHabits.length === 1);
    assert.equal(compView.elements.get('ai-coach-apply-btn').textContent, 'UNDO');
    compView.elements.get('ai-coach-apply-btn').handlers.click();
    assert.deepEqual(compView.uncompletedHabits, ['habit-1']);

    // LVL 2 auto-create task + UNDO removes task
    const taskView = arcAi({
        signedIn: true,
        aiName: 'NOVA',
        clearDays: 1,
        autoExecute: true,
        suggestedAction: { type: 'create_task', title: 'Buy running shoes', priority: 'high' }
    });
    taskView.elements.get('ai-coach-question').value = 'Add a task to buy running shoes';
    taskView.elements.get('ai-coach-form').handlers.submit({ preventDefault() {} });
    await waitFor(() => taskView.taskCreated.length === 1);
    assert.equal(taskView.taskCreated[0].title, 'Buy running shoes');
    assert.equal(taskView.elements.get('ai-coach-apply-btn').textContent, 'UNDO');
    taskView.elements.get('ai-coach-apply-btn').handlers.click();
    await waitFor(() => taskView.taskRemoved.length === 1);

    // LVL 4 unlocks AI Tone chips and displays celebration banner on level-up event
    const l4 = arcAi({ aiName: 'NOVA', clearDays: 14 });
    assert.equal(l4.elements.get('arc-ai-lvl-badge').textContent, 'LVL 4');
    assert.equal(l4.elements.get('arc-tone-row').classList.contains('is-locked'), false);
    assert.equal(l4.elements.get('arc-tone-lock').textContent, 'ACTIVE');
    assert.equal(l4.elements.get('arc-tone-drill').disabled, false);
    l4.elements.get('arc-tone-drill').handlers.click();
    assert.equal(l4.elements.get('arc-tone-drill').classList.contains('is-active'), true);
    l4.events.get('habitarc:ai-level-up')({ detail: { fromLevel: 3, toLevel: 4, prog: { aiName: 'NOVA', shortPower: 'Batch Tune & Tones', rank: 'Routine Architect' } } });
    assert.equal(l4.elements.get('arc-lvlup-banner').classList.contains('hidden'), false);
    assert.match(l4.elements.get('arc-lvlup-text').textContent, /LEVEL UP! NOVA LVL 3 → LVL 4/);
});

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, val) => map.set(key, String(val)),
        removeItem: key => map.delete(key),
        dump: () => Object.fromEntries(map.entries())
    };
}

test('arc-chat-store persists multi-chat history, migrates legacy thread & two-way merges cloud updates', () => {
    const store = memoryStorage({
        'habitarc_arc_thread:user-1': JSON.stringify({
            turns: [{ question: 'Old single thread question', answer: 'Old answer' }],
            updatedAt: now - 3 * 24 * 60 * 60 * 1000
        })
    });
    const initial = chatStore.loadLocalArcChats('user-1', store);
    assert.equal(initial.chats.length, 1);
    assert.equal(initial.chats[0].title, 'Old single thread question');
    assert.equal(store.getItem('habitarc_arc_thread:user-1'), null);

    let list = chatStore.upsertArcChat(initial.chats, {
        id: 'chat_today_1',
        turns: [{ question: 'Design morning stretch routine', answer: 'Start with 5m neck rolls.' }],
        updatedAt: now - 60000
    }, now);
    list = chatStore.deleteArcChat(list, initial.migratedLegacyId, now);
    const merged = chatStore.mergeArcChats(list, [
        { id: initial.migratedLegacyId, turns: [{ question: 'Old single thread question', answer: 'Old answer' }], updatedAt: now - 3 * 24 * 60 * 60 * 1000 },
        { id: 'chat_yesterday_1', turns: [{ question: 'Fix evening consistency', answer: 'Set 21:00 cue.' }], updatedAt: now - 24 * 60 * 60 * 1000 - 1000 }
    ], { nowMs: now });

    const groups = chatStore.groupArcChatsByRecency(merged, now);
    assert.deepEqual(groups.map(g => g.label), ['Today', 'Yesterday']);
    assert.equal(groups[0].items[0].id, 'chat_today_1');
    assert.equal(groups[1].items[0].id, 'chat_yesterday_1');
});

test('Arc_AI keeps ChatGPT-style history across +NEW, reloads & cloud sync without deleting saved threads', async () => {
    const storage = memoryStorage({ 'habitarc_active_uid': 'qa-user' });
    let cloudRemote = [];
    const cloudAuth = {
        loadArcChats: async () => cloudRemote,
        saveArcChats: async (chats) => { cloudRemote = chats; return chats; }
    };

    const s1 = arcAi({ signedIn: true, storage, cloudAuth });
    s1.elements.get('ai-coach-question').value = 'First saved chat about sleep';
    s1.elements.get('ai-coach-form').handlers.submit({ preventDefault() {} });
    await waitFor(() => s1.requests.length === 1 && !s1.elements.get('arc-thread-view').classList.contains('hidden'));
    assert.equal(s1.elements.get('arc-zen-hist-count').textContent, '1');

    // Pressing + NEW starts a fresh chat while preserving Chat 1 in history!
    s1.elements.get('ai-coach-clear').handlers.click();
    assert.equal(s1.elements.get('arc-zen-home').classList.contains('hidden'), false);
    assert.equal(s1.elements.get('arc-zen-hist-count').textContent, '1');

    s1.elements.get('ai-coach-question').value = 'Second active chat about hydration';
    s1.elements.get('ai-coach-form').handlers.submit({ preventDefault() {} });
    await waitFor(() => s1.requests.length === 2 && s1.elements.get('ai-coach-asked').textContent === 'Second active chat about hydration');
    assert.equal(s1.elements.get('arc-zen-hist-count').textContent, '2');

    // Simulate another device adding a remote chat in Firestore before reloading.
    cloudRemote = [
        ...cloudRemote,
        {
            id: 'chat_cloud_1',
            title: 'Synced tablet streak plan',
            createdAt: now - 86400000 - 5000,
            updatedAt: now - 86400000 - 5000,
            deleted: false,
            turns: [{ question: 'Synced tablet streak plan', answer: 'Focus on 1 daily anchor.', timestamp: now - 86400000 - 5000 }]
        }
    ];

    // Simulate full page reload with the same browser storage + cloud account.
    const s2 = arcAi({ signedIn: true, storage, cloudAuth });
    await waitFor(() => s2.elements.get('arc-zen-hist-count').textContent === '3');
    assert.equal(s2.elements.get('arc-thread-view').classList.contains('hidden'), false);
    assert.equal(s2.elements.get('ai-coach-asked').textContent, 'Second active chat about hydration');
    const histMarkup = s2.elements.get('arc-hist-list').innerHTML;
    assert.match(histMarkup, /First saved chat about sleep/);
    assert.match(histMarkup, /Second active chat about hydration/);
    assert.match(histMarkup, /Synced tablet streak plan/);
});
