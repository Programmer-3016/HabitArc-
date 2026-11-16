import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildHabitCoachContext,
    extractAndValidateCoachAction,
    normaliseCoachConversation,
    normaliseCoachQuestion,
    normaliseCoachTimeZone
} from '../api/_coach-context.js';
import { renderCoachMarkdown } from '../habit-analytics.js';

test('an explicit not_completed history record overrides an old completion map', () => {
    const result = buildHabitCoachContext({
        now: new Date('2026-11-09T12:00:00.000Z'),
        habits: [{
            id: 'reading',
            name: 'Read',
            category: 'Learning',
            reminder: '20:00',
            repeat: ['mon'],
            createdAt: '2026-10-01',
            completions: { '2026-11-02': true }
        }],
        completionHistory: [{
            habitId: 'reading',
            date: '2026-11-02',
            status: 'not_completed',
            updatedAt: '2026-11-09T12:00:00.000Z'
        }]
    });

    assert.equal(result.metrics.habitCount, 1);
    const snapshot = JSON.parse(result.contextText);
    assert.equal(snapshot.habits[0].completed, 0);
    assert.equal(snapshot.habits[0].scheduled, 4);
    assert.equal(snapshot.habits[0].reminder, '20:00');
});

test('coach context remains bounded to twenty habits and the latest 28 days', () => {
    const habits = Array.from({ length: 25 }, (_, index) => ({
        id: `habit-${index}`,
        name: `Habit ${index}`,
        repeat: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
        createdAt: '2026-01-01'
    }));
    const result = buildHabitCoachContext({
        now: new Date('2026-11-09T12:00:00.000Z'),
        habits
    });

    assert.equal(result.metrics.habitCount, 20);
    assert.deepEqual(JSON.parse(result.contextText).total, { scheduled: 560, completed: 0, rate: 0 });
    assert.doesNotMatch(result.contextText, /Habit 24/);
});

test('local day boundary excludes unfinished today from historical metrics', () => {
    const result = buildHabitCoachContext({
        now: new Date('2026-11-12T19:00:00Z'), timeZone: 'Asia/Kolkata',
        habits: [{ id: 'h', name: 'Read', createdAt: '2026-11-13', repeat: ['fri'] }]
    });
    const snapshot = JSON.parse(result.contextText);
    assert.equal(snapshot.snapshotDate, '2026-11-13');
    assert.equal(snapshot.dateWindow.end, '2026-11-12');
    assert.equal(snapshot.today.scheduled, 1);
    assert.equal(snapshot.total.rate, null);
    assert.equal(snapshot.insufficientData, true);
});

test('invalid time zones reject and empty history does not invent a strongest day', () => {
    assert.throws(() => normaliseCoachTimeZone('Not/AZone'), RangeError);
    const result = buildHabitCoachContext({ habits: [], now: new Date('2026-11-13T12:00:00Z') });
    assert.equal(result.metrics.strongestDay, null);
    assert.equal(result.metrics.fourWeekRate, null);
});

test('coach question normalization removes excess whitespace and applies its limit', () => {
    assert.equal(normaliseCoachQuestion('  What\n\nshould I focus on?  '), 'What should I focus on?');
    assert.equal(normaliseCoachQuestion('x'.repeat(800)).length, 600);
});

test('coach context carries bounded goals, planning reasons and explicit day states', () => {
    const result = buildHabitCoachContext({
        now: new Date('2026-11-09T12:00:00.000Z'),
        settings: { goalDuration: 60, userBio: 'North Star: Read more consistently' },
        habits: [{ id: 'reading', name: 'Read', why: 'Grow knowledge', motivation: 'One chapter at a time', createdAt: '2026-10-01', repeat: ['mon'] }],
        completionHistory: [{ habitId: 'reading', date: '2026-11-02', status: 'completed', updatedAt: '2026-11-03T10:00:00.000Z' }]
    });
    const snapshot = result.snapshot;
    assert.equal(snapshot.planning.goalDurationDays, 60);
    assert.equal(snapshot.planning.statedGoal, 'North Star: Read more consistently');
    assert.equal(snapshot.habits[0].why, 'Grow knowledge');
    assert.equal(snapshot.habits[0].recentDays.at(-1).status, 'pending');
    assert.equal(snapshot.habits[0].recentDays.some(day => day.date === '2026-11-02' && day.status === 'completed'), true);
});

test('Coach follow-up history is bounded data, not an arbitrary prompt envelope', () => {
    assert.deepEqual(normaliseCoachConversation([{ question: 'What next?', answer: 'Try a smaller cue.' }]), [
        { question: 'What next?', answer: 'Try a smaller cue.' }
    ]);
    assert.throws(() => normaliseCoachConversation(Array.from({ length: 4 }, () => ({ question: 'q', answer: 'a' }))), RangeError);
    assert.throws(() => normaliseCoachConversation([{ question: 'q', answer: 'a', role: 'system' }]), RangeError);
});

test('Coach action extraction validates habit proposals and blocks hallucinated or malformed tags', () => {
    const create = extractAndValidateCoachAction(
        'Try an evening reset walk.\n<habitarc_action>{"type":"create_habit","name":"Evening Walk","category":"health","reminder":"19:30","repeat":["mon","wed","fri","BAD"],"why":"Unwind after classes"}</habitarc_action>',
        []
    );
    assert.equal(create.answer, 'Try an evening reset walk.');
    assert.deepEqual(create.suggestedAction, {
        type: 'create_habit',
        name: 'Evening Walk',
        category: 'Health',
        reminder: '19:30',
        repeat: ['mon', 'wed', 'fri'],
        why: 'Unwind after classes'
    });

    const validUpdate = extractAndValidateCoachAction(
        'Shift Reading earlier.\n<habitarc_action>{"type":"update_habit","habitId":"h-1","reminder":"20:15"}</habitarc_action>',
        [{ id: 'h-1', name: 'Read <20> pages' }]
    );
    assert.deepEqual(validUpdate.suggestedAction, {
        type: 'update_habit',
        habitId: 'h-1',
        habitName: 'Read <20> pages',
        reminder: '20:15'
    });

    const hallucinatedId = extractAndValidateCoachAction(
        'Update.\n<habitarc_action>{"type":"update_habit","habitId":"other-user-habit","reminder":"20:15"}</habitarc_action>',
        [{ id: 'h-1', name: 'Read' }]
    );
    assert.equal(hallucinatedId.answer, 'Update.');
    assert.equal(hallucinatedId.suggestedAction, null);

    const brokenJson = extractAndValidateCoachAction(
        'Keep tracking.\n<habitarc_action>{bad json',
        []
    );
    assert.equal(brokenJson.answer, 'Keep tracking.');
    assert.equal(brokenJson.suggestedAction, null);
});

test('renderCoachMarkdown formats headings, lists, tables, code and escapes unsafe HTML', () => {
    const md = [
        '### Key pattern',
        '',
        'Your **Morning Walk** slipped on `Fri` <script>alert(1)</script>.',
        '',
        '1. **Move cue** — Pair after breakfast at `08:30`.',
        '2. **Backup** — Keep a 5-min walk fallback.',
        '',
        '| Habit | 28d |',
        '| --- | --- |',
        '| Walk | 64% |'
    ].join('\n');
    const html = renderCoachMarkdown(md);
    assert.match(html, /<h4 class="ha-md-h">Key pattern<\/h4>/);
    assert.match(html, /<strong>Morning Walk<\/strong>/);
    assert.match(html, /<code class="ha-md-code">Fri<\/code>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /<ol class="ha-md-ol"><li><strong>Move cue<\/strong>/);
    assert.match(html, /<table class="ha-md-table"><thead><tr><th>Habit<\/th><th>28d<\/th><\/tr><\/thead><tbody><tr><td>Walk<\/td><td>64%<\/td><\/tr><\/tbody><\/table>/);
});
