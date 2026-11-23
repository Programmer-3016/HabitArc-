// Preserve the server contract; Insights uses the same pure calculation.
export { buildHabitCoachContext, normaliseCoachQuestion, normaliseCoachTimeZone } from '../habit-analytics.js';

const ALLOWED_ACTION_CATEGORIES = new Map([
    ['health', 'Health'],
    ['mindfulness', 'Mindfulness'],
    ['learning', 'Learning'],
    ['focus', 'Focus'],
    ['wellness', 'Wellness'],
    ['fitness', 'Fitness'],
    ['productivity', 'Productivity'],
    ['general', 'General']
]);
const ALLOWED_ACTION_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ACTION_BLOCK_RE = /<habitarc_action>([\s\S]*?)<\/habitarc_action>/i;
const ACTION_STRIP_RE = /<habitarc_action>[\s\S]*?(?:<\/habitarc_action>|$)/gi;

/** Bounded, untrusted conversation data, never privileged model messages. */
export function normaliseCoachConversation(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 3) throw new RangeError('Invalid conversation.');
    return value.map(turn => {
        if (!turn || typeof turn !== 'object' || Array.isArray(turn) ||
            Object.keys(turn).some(key => key !== 'question' && key !== 'answer') ||
            typeof turn.question !== 'string' || !turn.question.trim() || turn.question.length > 600 ||
            typeof turn.answer !== 'string' || !turn.answer.trim() || turn.answer.length > 4000) {
            throw new RangeError('Invalid conversation turn.');
        }
        return { question: turn.question.trim(), answer: turn.answer.trim() };
    });
}

function normaliseActionText(value, maxLength) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normaliseActionRepeat(value) {
    if (!Array.isArray(value)) return null;
    const picked = new Set();
    for (const entry of value) {
        if (typeof entry !== 'string') continue;
        const code = entry.trim().toLowerCase().slice(0, 3);
        if (ALLOWED_ACTION_DAYS.includes(code)) picked.add(code);
    }
    const ordered = ALLOWED_ACTION_DAYS.filter(day => picked.has(day));
    return ordered.length ? ordered : null;
}

/**
 * Extracts and validates at most one optional `<habitarc_action>{...}</habitarc_action>`
 * proposal returned by the dedicated HabitArc Coach, stripping tags from prose.
 */
export function extractAndValidateCoachAction(rawText, habits = []) {
    const source = typeof rawText === 'string' ? rawText : '';
    const match = ACTION_BLOCK_RE.exec(source);
    const answer = source.replace(ACTION_STRIP_RE, '').trim();
    if (!match) return { answer, suggestedAction: null };

    const rawJson = match[1].trim();
    if (!rawJson || rawJson.length > 1200) return { answer, suggestedAction: null };

    let parsed;
    try { parsed = JSON.parse(rawJson); } catch {
        return { answer, suggestedAction: null };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { answer, suggestedAction: null };
    }

    if (parsed.type === 'create_habit') {
        const name = normaliseActionText(parsed.name, 60);
        if (name.length < 2) return { answer, suggestedAction: null };
        const category = ALLOWED_ACTION_CATEGORIES.get(normaliseActionText(parsed.category, 24).toLowerCase()) || 'General';
        const reminder = typeof parsed.reminder === 'string' && TIME_24H_RE.test(parsed.reminder.trim())
            ? parsed.reminder.trim()
            : '09:00';
        const repeat = normaliseActionRepeat(parsed.repeat) || [...ALLOWED_ACTION_DAYS];
        const why = normaliseActionText(parsed.why, 140);
        return {
            answer,
            suggestedAction: { type: 'create_habit', name, category, reminder, repeat, why }
        };
    }

    if (parsed.type === 'update_habit') {
        const habitId = typeof parsed.habitId === 'string' ? parsed.habitId.trim() : '';
        if (!habitId || habitId.length > 128) return { answer, suggestedAction: null };
        const target = (Array.isArray(habits) ? habits : []).find(item => item && item.id === habitId);
        if (!target) return { answer, suggestedAction: null };

        const reminder = typeof parsed.reminder === 'string' && TIME_24H_RE.test(parsed.reminder.trim())
            ? parsed.reminder.trim()
            : undefined;
        const repeat = normaliseActionRepeat(parsed.repeat) || undefined;
        const why = normaliseActionText(parsed.why, 140) || undefined;
        if (!reminder && !repeat && !why) return { answer, suggestedAction: null };

        return {
            answer,
            suggestedAction: {
                type: 'update_habit',
                habitId: target.id,
                habitName: normaliseActionText(target.name, 60) || 'Habit',
                ...(reminder ? { reminder } : {}),
                ...(repeat ? { repeat } : {}),
                ...(why ? { why } : {})
            }
        };
    }

    return { answer, suggestedAction: null };
}
