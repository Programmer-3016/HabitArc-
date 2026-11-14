import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHabitCoachContext, normaliseCoachQuestion, normaliseCoachTimeZone } from '../api/_coach-context.js';

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
