// Preserve the server contract; Insights uses the same pure calculation.
export { buildHabitCoachContext, normaliseCoachQuestion, normaliseCoachTimeZone } from '../habit-analytics.js';

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
