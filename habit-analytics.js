const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MAX_HABITS = 20;
const MAX_HISTORY_RECORDS = 2500;

function clampText(value, maxLength = 120) {
    return typeof value === 'string'
        ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
        : '';
}

function isDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T12:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normaliseCoachTimeZone(value) {
    if (value === undefined || value === null || value === '') return 'UTC';
    if (typeof value !== 'string' || value.length > 80) throw new RangeError('Invalid time zone.');
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
}

function dateKeyInTimeZone(now, timeZone) {
    const parts = new Intl.DateTimeFormat('en', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return [values.year, values.month, values.day].join('-');
}

function addDays(date, amount) {
    const next = new Date(date + 'T12:00:00.000Z');
    next.setUTCDate(next.getUTCDate() + amount);
    return next.toISOString().slice(0, 10);
}

function dayKeyForDate(date) {
    return DAY_KEYS[new Date(date + 'T12:00:00.000Z').getUTCDay()];
}

function toSafeHabit(rawHabit) {
    if (!rawHabit || typeof rawHabit !== 'object' || typeof rawHabit.id !== 'string') return null;
    if (!rawHabit.id || rawHabit.id.length > 128) return null;
    return {
        id: rawHabit.id,
        name: clampText(rawHabit.name, 80) || 'Untitled habit',
        category: clampText(rawHabit.category, 40) || 'General',
        why: clampText(rawHabit.why, 300),
        motivation: clampText(rawHabit.motivation, 300),
        reminder: typeof rawHabit.reminder === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(rawHabit.reminder)
            ? rawHabit.reminder : null,
        repeat: Array.isArray(rawHabit.repeat)
            ? [...new Set(rawHabit.repeat.slice(0, 7).filter((day) => DAY_KEYS.includes(day)))]
            : DAY_KEYS,
        createdAt: isDateKey(rawHabit.createdAt) ? rawHabit.createdAt : null,
        legacyCompletions: rawHabit.completions && typeof rawHabit.completions === 'object'
            ? rawHabit.completions : {}
    };
}

function isScheduled(habit, date) {
    // An unknown start date cannot establish that a habit was missed in the past.
    return Boolean(habit.createdAt && date >= habit.createdAt && habit.repeat.includes(dayKeyForDate(date)));
}

function completionTimestamp(record) {
    const value = record.updatedAt || record.completedAt;
    if (typeof value !== 'string' || value.length > 40) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseCompletionHistory(history, habits, dates) {
    const explicit = new Map();
    const knownHabitIds = new Set(habits.map((habit) => habit.id));
    const knownDates = new Set(dates);
    for (const record of (Array.isArray(history) ? history : []).slice(0, MAX_HISTORY_RECORDS)) {
        if (!record || typeof record !== 'object') continue;
        if (!knownHabitIds.has(record.habitId) || !knownDates.has(record.date)) continue;
        if (record.status !== 'completed' && record.status !== 'not_completed') continue;
        const id = record.habitId + '_' + record.date;
        const previous = explicit.get(id);
        const updatedAt = completionTimestamp(record);
        if (!previous || updatedAt >= previous.updatedAt) {
            explicit.set(id, { status: record.status, updatedAt });
        }
    }

    const completed = new Set();
    // Lookup only the bounded date window; do not enumerate an unbounded legacy map.
    for (const habit of habits) {
        for (const date of dates) {
            if (habit.legacyCompletions[date] === true) completed.add(habit.id + '_' + date);
        }
    }
    for (const [id, record] of explicit) {
        if (record.status === 'completed') completed.add(id);
        else completed.delete(id);
    }
    return completed;
}

function percentage(completed, scheduled) {
    return scheduled === 0 ? null : Math.round((completed / scheduled) * 100);
}

function totalForDays(days) {
    const total = days.reduce((result, day) => ({
        scheduled: result.scheduled + day.scheduled,
        completed: result.completed + day.completed
    }), { scheduled: 0, completed: 0 });
    return { ...total, rate: percentage(total.completed, total.scheduled) };
}

/**
 * Shared deterministic analytics for Insights and the server-side Coach.
 * The server supplies its own verified-UID records, never client metrics.
 * Text fields stay bounded JSON data, never instructions. No email is included.
 * Current schedules are estimates of past schedules;
 * records do not establish real-world causality, duration, or optimum timing.
 */
export function buildHabitCoachContext({ habits = [], completionHistory = [], settings = {}, now = new Date(), timeZone, truncated = false } = {}) {
    const zone = normaliseCoachTimeZone(timeZone);
    const today = dateKeyInTimeZone(now, zone);
    const last28Days = Array.from({ length: 28 }, (_, index) => addDays(today, index - 28));
    const seen = new Set();
    const safeHabits = [];
    for (const raw of (Array.isArray(habits) ? habits : []).slice(0, 100)) {
        const habit = toSafeHabit(raw);
        if (!habit || seen.has(habit.id)) continue;
        seen.add(habit.id);
        safeHabits.push(habit);
        if (safeHabits.length === MAX_HABITS) break;
    }
    const completionIndex = normaliseCompletionHistory(completionHistory, safeHabits, [...last28Days, today]);
    const dayStats = last28Days.map((date) => {
        const scheduled = safeHabits.filter((habit) => isScheduled(habit, date));
        return {
            date,
            scheduled: scheduled.length,
            completed: scheduled.filter((habit) => completionIndex.has(habit.id + '_' + date)).length
        };
    });
    const habitStats = safeHabits.map((habit) => {
        const scheduled = last28Days.filter((date) => isScheduled(habit, date));
        const completed = scheduled.filter((date) => completionIndex.has(habit.id + '_' + date)).length;
        return {
            id: habit.id, name: habit.name, category: habit.category, reminder: habit.reminder,
            why: habit.why, motivation: habit.motivation,
            repeat: habit.repeat, createdAt: habit.createdAt,
            scheduled: scheduled.length, completed, rate: percentage(completed, scheduled.length),
            latestWeek: totalForDays(dayStats.slice(-7).map(({ date }) => ({
                scheduled: Number(isScheduled(habit, date)),
                completed: Number(isScheduled(habit, date) && completionIndex.has(habit.id + '_' + date))
            }))),
            recentDays: [...last28Days, today].map(date => ({
                date,
                status: !isScheduled(habit, date) ? 'not_scheduled'
                    : completionIndex.has(habit.id + '_' + date) ? 'completed'
                    : date === today ? 'pending' : 'not_logged'
            }))
        };
    });
    const total = totalForDays(dayStats);
    const latestWeek = totalForDays(dayStats.slice(-7));
    const priorWeek = totalForDays(dayStats.slice(-14, -7));
    const observedDays = dayStats.filter((day) => day.scheduled > 0).length;
    const insufficientData = observedDays < 7 || total.scheduled < 7;
    const weekdayStats = DAY_KEYS.map((day) => ({
        day,
        observedDays: dayStats.filter((stat) => dayKeyForDate(stat.date) === day && stat.scheduled > 0).length,
        ...totalForDays(dayStats.filter((stat) => dayKeyForDate(stat.date) === day))
    }));
    const rankedDays = weekdayStats.filter((day) => day.observedDays >= 2 && day.completed > 0)
        .sort((a, b) => b.rate - a.rate);
    // Do not label an arbitrary member of a tie as the strongest day/habit.
    const strongestDay = !insufficientData && rankedDays.length && (rankedDays.length === 1 || rankedDays[0].rate > rankedDays[1].rate)
        ? { day: rankedDays[0].day, rate: rankedDays[0].rate } : null;
    const rankedHabits = habitStats.filter((habit) => habit.scheduled >= 3).sort((a, b) => b.rate - a.rate);
    const bestHabit = !insufficientData && rankedHabits[0]?.completed > 0 && (rankedHabits.length === 1 || rankedHabits[0].rate > rankedHabits[1].rate)
        ? { id: rankedHabits[0].id, name: rankedHabits[0].name, rate: rankedHabits[0].rate } : null;
    const weakestHabits = insufficientData ? [] : [...rankedHabits].reverse().filter((habit) => habit.rate < 100)
        .slice(0, 3).map((habit) => ({ id: habit.id, name: habit.name, rate: habit.rate, reminder: habit.reminder }));
    const lowest = rankedHabits.at(-1);
    const weakestHabit = !insufficientData && lowest?.rate < 100 &&
        (rankedHabits.length === 1 || lowest.rate < rankedHabits.at(-2).rate)
        ? { id: lowest.id, name: lowest.name, rate: lowest.rate } : null;
    const metrics = {
        habitCount: safeHabits.length,
        fourWeekRate: total.rate,
        latestWeekRate: latestWeek.rate,
        priorWeekRate: priorWeek.rate,
        strongestDay, bestHabit, weakestHabit, weakestHabits, observedDays, insufficientData,
        dateWindow: { start: last28Days[0], end: last28Days.at(-1), excludesToday: true },
        timeZone: zone,
        truncated: Boolean(truncated || (Array.isArray(habits) && habits.length > MAX_HABITS) || (Array.isArray(completionHistory) && completionHistory.length >= MAX_HISTORY_RECORDS))
    };
    const todayScheduled = safeHabits.filter((habit) => isScheduled(habit, today));
    const snapshot = {
        snapshotDate: today,
        ...metrics,
        planning: {
            goalDurationDays: Number.isInteger(settings?.goalDuration) && settings.goalDuration >= 1 && settings.goalDuration <= 365
                ? settings.goalDuration : null,
            statedGoal: clampText(settings?.userBio, 300) || null
        },
        limitations: [
            'Historical rates cover 28 finished calendar days; today is in progress, not a missed day.',
            'Rates use the CURRENT repeat schedule and recorded creation date; schedule changes are not versioned.',
            'Unmarked dates mean no completion was logged, not proof the real-world habit was missed.',
            'Duration, energy, obstacles and actual completion time are not reliably tracked. Do not invent them or infer causation.',
            'Habits without valid creation dates are excluded from historical denominators.',
            ...(timeZone ? [] : ['No device time zone was supplied; dates use UTC and may differ from the member local day.']),
            ...(metrics.truncated ? ['Input was bounded; the snapshot may omit records. Do not present it as the complete account history.'] : [])
        ],
        total, latestWeek, priorWeek, earlierWeek: totalForDays(dayStats.slice(-21, -14)),
        daily: dayStats, weekdays: weekdayStats,
        today: {
            date: today, inProgress: true, scheduled: todayScheduled.length,
            completed: todayScheduled.filter((habit) => completionIndex.has(habit.id + '_' + today)).length
        },
        habits: habitStats
    };
    return { contextText: JSON.stringify(snapshot), metrics, snapshot };
}

export function normaliseCoachQuestion(value) {
    return typeof value === 'string' ? clampText(value, 600) : '';
}

function defaultEscapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function formatInlineMarkdown(text, esc) {
    const segments = String(text || '').split(/(`[^`\n]+`)/g);
    return segments.map((seg, index) => {
        if (index % 2 === 1 && seg.startsWith('`') && seg.endsWith('`') && seg.length >= 2) {
            return `<code class="ha-md-code">${esc(seg.slice(1, -1))}</code>`;
        }
        let html = esc(seg);
        html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
        html = html.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
        return html;
    }).join('');
}

function splitTableCells(rowLine) {
    return rowLine.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
    const trimmed = line.trim();
    if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
    return splitTableCells(trimmed).every((cell) => /^:?-{2,}:?$/.test(cell));
}

/**
 * Pure, XSS-safe Markdown renderer for structured HabitArc Coach responses.
 * Always escapes raw text via escapeHTML before wrapping semantic HTML tags.
 */
export function renderCoachMarkdown(markdown, escapeHTML = defaultEscapeHtml) {
    const esc = typeof escapeHTML === 'function' ? escapeHTML : defaultEscapeHtml;
    const source = String(markdown || '').replace(/\r\n?/g, '\n').trim();
    if (!source) return '';

    const lines = source.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
            i++;
            continue;
        }

        if (trimmed.startsWith('```')) {
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(esc(lines[i]));
                i++;
            }
            if (i < lines.length) i++;
            blocks.push(`<pre class="ha-md-pre"><code>${codeLines.join('\n')}</code></pre>`);
            continue;
        }

        if (/^[-*_]{3,}$/.test(trimmed)) {
            blocks.push('<hr class="ha-md-hr"/>');
            i++;
            continue;
        }

        const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
        if (headingMatch) {
            const level = headingMatch[1].length <= 2 ? 'h3' : 'h4';
            blocks.push(`<${level} class="ha-md-h">${formatInlineMarkdown(headingMatch[2].trim(), esc)}</${level}>`);
            i++;
            continue;
        }

        if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
            const headers = splitTableCells(trimmed);
            i += 2;
            const bodyRows = [];
            while (i < lines.length && lines[i].trim().includes('|') && !/^\s*$/.test(lines[i])) {
                bodyRows.push(splitTableCells(lines[i]));
                i++;
            }
            const thead = `<thead><tr>${headers.map((h) => `<th>${formatInlineMarkdown(h, esc)}</th>`).join('')}</tr></thead>`;
            const tbody = bodyRows.length
                ? `<tbody>${bodyRows.map((row) => `<tr>${headers.map((_, col) => `<td>${formatInlineMarkdown(row[col] ?? '', esc)}</td>`).join('')}</tr>`).join('')}</tbody>`
                : '';
            blocks.push(`<div class="ha-md-table-wrap"><table class="ha-md-table">${thead}${tbody}</table></div>`);
            continue;
        }

        if (/^>\s?/.test(trimmed)) {
            const quoteLines = [];
            while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
                quoteLines.push(formatInlineMarkdown(lines[i].trim().replace(/^>\s?/, ''), esc));
                i++;
            }
            blocks.push(`<blockquote class="ha-md-quote">${quoteLines.join('<br/>')}</blockquote>`);
            continue;
        }

        if (/^[-*\u2022]\s+/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^[-*\u2022]\s+/.test(lines[i].trim())) {
                items.push(`<li>${formatInlineMarkdown(lines[i].trim().replace(/^[-*\u2022]\s+/, ''), esc)}</li>`);
                i++;
            }
            blocks.push(`<ul class="ha-md-ul">${items.join('')}</ul>`);
            continue;
        }

        if (/^\d+[.)]\s+/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
                items.push(`<li>${formatInlineMarkdown(lines[i].trim().replace(/^\d+[.)]\s+/, ''), esc)}</li>`);
                i++;
            }
            blocks.push(`<ol class="ha-md-ol">${items.join('')}</ol>`);
            continue;
        }

        const paraLines = [];
        while (i < lines.length) {
            const cur = lines[i].trim();
            if (
                !cur
                || cur.startsWith('```')
                || /^#{1,4}\s+/.test(cur)
                || /^>\s?/.test(cur)
                || /^[-*\u2022]\s+/.test(cur)
                || /^\d+[.)]\s+/.test(cur)
                || /^[-*_]{3,}$/.test(cur)
                || (cur.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
            ) {
                break;
            }
            paraLines.push(formatInlineMarkdown(cur, esc));
            i++;
        }
        if (paraLines.length) {
            blocks.push(`<p class="ha-md-p">${paraLines.join('<br/>')}</p>`);
        }
    }

    return blocks.join('');
}
