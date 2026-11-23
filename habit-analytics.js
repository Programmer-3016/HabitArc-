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
        totalScheduled: total.scheduled,
        totalLogged: total.completed,
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
    const style = value => esc(value)
        .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
    // Safe external links only: never create javascript:/data: hrefs or raw tags.
    const linkPattern = /(\[[^\]\n]{1,160}\]\(https?:\/\/[^\s()\n]{1,1800}\))/gi;
    return String(text || '').split(/(\x60[^\x60\n]+\x60)/g).map((segment, index) => {
        if (index % 2 === 1 && segment.startsWith('\x60') && segment.endsWith('\x60')) {
            return '<code class="ha-md-code">' + esc(segment.slice(1,-1)) + '</code>';
        }
        return segment.split(linkPattern).map(chunk => {
            const match = /^\[([^\]\n]{1,160})\]\((https?:\/\/[^\s()\n]{1,1800})\)$/i.exec(chunk);
            if (!match) return style(chunk);
            return '<a class="ha-md-link" href="' + esc(match[2]) +
              '" target="_blank" rel="noopener noreferrer">' + style(match[1]) + '</a>';
        }).join('');
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


// ─── ARC Signal Deck ───────────────────────────────────────────────────
// Presentation only. All words and numbers come from the returned answer.
// The complete original remains available in READ mode, verbatim.
export function splitArcAnswer(sourceText) {
    const source = String(sourceText || '').replace(/\r\n?/g, '\n').trim().slice(0, 12000);
    if (!source) return {lead:'',sections:[],source:''};
    const lines = source.split('\n');
    let index=0,lead='';
    // Extract ONLY the opening paragraph, not lists, code or headings.
    const startsBlock=line=>/^\s*(?:#{1,4}\s|[-*•]\s|\d+[.)]\s|>|(?:\x60){3}|[-*_]{3,}$)/.test(line);
    const startsTable=lines.length>1 && lines[0].includes('|') && isTableSeparator(lines[1]);
    if(lines.length && !startsBlock(lines[0]) && !startsTable) {
        const first=[];
        while(index<lines.length && lines[index].trim() && !startsBlock(lines[index])){
            first.push(lines[index].trim());
            index++;
        }
        if(first.length)lead=first.join('\n');
    }
    const remaining=lines.slice(index);
    let fenced=false,current={title:'',lines:[]};
    const groups=[];
    const emit=()=>{
        const body=current.lines.join('\n').trim();
        if(body || current.title)groups.push({title:current.title,body});
    };
    for(const line of remaining) {
        if(/^\s*(?:\x60){3}/.test(line)){fenced=!fenced;current.lines.push(line);continue;}
        const heading=!fenced && /^\s*#{1,4}\s+(.+)$/.exec(line);
        if(heading) {
            emit();
            current={title:heading[1].trim().slice(0,160),lines:[]};
        } else current.lines.push(line);
    }
    emit();
    const sections=groups.map((g,i)=>({
        title:g.title || (i===0 && !lead ? 'The answer' : 'More detail'),
        body:g.body
    })).filter(g=>g.body||g.title);
    return {source,lead,sections};
}
function arcDeckCodeBlocks(markup) {
    return markup.replace(/<pre class="ha-md-pre"><code>([\s\S]*?)<\/code><\/pre>/g,
        (_,code)=>'<div class="ha-arc-code-frame"><div class="ha-arc-code-head"><span>CODE / REFERENCE</span>'+
        '<button type="button" data-arc-copy-code aria-label="Copy code block">COPY CODE</button></div>'+
        '<pre class="ha-md-pre"><code>'+code+'</code></pre></div>');
}

/* Presentation sanitizer. Internal record IDs are not user-friendly; preserve
   fenced code and keep original history unchanged in the local conversation. */
export function cleanArcDisplayText(text) {
    const source=String(text??'').replace(/\r\n?/g,'\n').slice(0,12000);
    return source.split(/((?:^|\n)\x60{3}[^\n]*\n[\s\S]*?(?:^|\n)\x60{3})/gm).map(part=>{
        if(/^\s*\x60{3}/.test(part))return part;
        return part
          .replace(/\s*\(\s*(?:(?:including|such\s+as|e\.g\.|i\.e\.|for|with|named|like)\s+)?(?:habit\s+)?(?:record\s+)?ids?\b[^)]*\bh_[a-z0-9_-]{4,}[^)]*\)/gi,'')
          .replace(/\bincluding\s+(?:habit\s+)?ids?\s+\x60?h_[a-z0-9_-]{6,}\x60?(?:\s*,\s*(?:and\s+)?\x60?h_[a-z0-9_-]{6,}\x60?|\s+and\s+\x60?h_[a-z0-9_-]{6,}\x60?)*/gi,'multiple matching habit entries')
          .replace(/\s+(?:such\s+as|e\.g\.|for|with|like)\s+(?:habit\s+)?(?:record\s+)?ids?\s+\x60?h_[a-z0-9_-]{6,}\x60?(?:\s*,\s*(?:and\s+)?\x60?h_[a-z0-9_-]{6,}\x60?|\s+and\s+\x60?h_[a-z0-9_-]{6,}\x60?)*/gi,'')
          .replace(/\(\s*\x60?h_[a-z0-9_-]{6,}\x60?\s*,\s*/gi,'(')
          .replace(/\s*\(\s*\x60?h_[a-z0-9_-]{6,}\x60?\s*\)/gi,'')
          .replace(/\x60?h_[a-z0-9_-]{6,}\x60?/gi,'')
          .replace(/\s*\(\s*(?:(?:such\s+as|e\.g\.|i\.e\.|including|with|for|like)\s+)?(?:habit\s+)?(?:record\s+)?ids?\b[\s,;:\-and]*\)/gi,'')
          .replace(/\(\s*[,;\s]+/g,'(').replace(/,\s*(?:,\s*)+/g,', ').replace(/\s+\)/g,')');
    }).join('');
}
function arcDeckResponsiveTables(markup,esc) {
    return markup.replace(
      /<div class="ha-md-table-wrap"><table class="ha-md-table"><thead><tr>([\s\S]*?)<\/tr><\/thead>(<tbody>([\s\S]*?)<\/tbody>)?<\/table><\/div>/g,
      (all,head,body,rows)=>{
        if(!rows)return all;
        const labels=[...head.matchAll(/<th>([\s\S]*?)<\/th>/g)]
            .map(x=>x[1].replace(/<[^>]*>/g,'').slice(0,80));
        const newRows=rows.replace(/<tr>([\s\S]*?)<\/tr>/g,(_,inner)=>{
            let i=0;
            return '<tr>'+inner.replace(/<td>([\s\S]*?)<\/td>/g,(_,value)=>
              '<td data-label="'+esc(labels[i++]||'Detail')+'">'+value+'</td>')+'</tr>';
        });
        return '<div class="ha-md-table-wrap ha-arc-responsive-table"><table class="ha-md-table">'+
          '<thead><tr>'+head+'</tr></thead><tbody>'+newRows+'</tbody></table></div>';
      });
}
function arcDeckVerifiedMetrics(snapshot,esc) {
    if(!snapshot||typeof snapshot!=='object')return '';
    const metrics=[
      {value:snapshot.habitCount,label:'ACTIVE HABITS'},
      {value:snapshot.totalScheduled,label:'SCHEDULED / 28D'},
      {value:snapshot.totalLogged,label:'LOGGED / 28D'}
    ];
    if(metrics.some(m=>!Number.isSafeInteger(m.value)||m.value<0||m.value>100000))return '';
    if(snapshot.totalLogged>snapshot.totalScheduled)return '';
    return '<section class="ha-arc-verified-metrics" aria-label="Verified 28-day habit statistics">'+
      '<div class="ha-arc-verified-top"><span>YOUR DATA / LAST 28 FINISHED DAYS</span><span>SYNCED RECORDS</span></div>'+
      '<div class="ha-arc-metric-grid">'+metrics.map((m,i)=>
        '<div class="ha-arc-metric-card"><span class="ha-arc-metric-name">'+esc(m.label)+'</span>'+
        '<strong class="ha-arc-metric-value">'+esc(m.value.toLocaleString('en-IN'))+'</strong>'+
        '<span class="ha-arc-metric-index">0'+(i+1)+'</span></div>').join('')+'</div>'+
      '<p class="ha-arc-verified-caveat">Scheduled totals are estimated from current repeat settings. '+
      (snapshot.totalLogged===0?'No completions were logged; this does not prove the activities were not performed.':'Logged completions reflect saved entries, not everything done offline.')+'</p>'+
      '</section>';
}

export function renderArcSignalDeck(markdown, escapeHTML = defaultEscapeHtml, verifiedSnapshot = null) {
    const esc=typeof escapeHTML==='function'?escapeHTML:defaultEscapeHtml;
    const {source,lead,sections}=splitArcAnswer(cleanArcDisplayText(markdown));
    if(!source)return '';
    const renderBlocks=text=>arcDeckResponsiveTables(arcDeckCodeBlocks(renderCoachMarkdown(text,esc)),esc);
    const original=renderBlocks(source);
    const summary=lead
      ? '<div class="ha-arc-signal-copy ha-md-prose">'+renderBlocks(lead)+'</div>'
      : '<p class="ha-arc-signal-empty">Explore ARC’s response in the readouts below.</p>';
    const sectionHtml=sections.map((item,index)=>{
        const content=item.body?renderBlocks(item.body):'';
        const title=esc(item.title.replace(/[*\x60_~]/g,''));
        const number=String(index+1).padStart(2,'0');
        return '<section class="ha-arc-deck-panel" data-arc-panel="'+index+'">'+
          '<div class="ha-arc-deck-panel-index" aria-hidden="true"><span>'+number+'</span><i></i></div>'+
          '<div class="ha-arc-deck-panel-main"><div class="ha-arc-deck-panel-meta">READOUT '+number+' / '+String(sections.length).padStart(2,'0')+'</div>'+
          '<h3 class="ha-arc-deck-panel-title">'+title+'</h3>'+
          '<div class="ha-arc-deck-panel-content ha-md-prose">'+content+'</div></div></section>';
    }).join('');
    const pills=sections.length>1
      ? '<nav class="ha-arc-deck-map" aria-label="Explore answer sections"><span class="ha-arc-deck-map-label">EXPLORE /</span>'+
        sections.map((g,i)=>'<button type="button" data-arc-jump="'+i+'" title="'+esc(g.title)+'">'+
          '<span>'+String(i+1).padStart(2,'0')+'</span>'+esc(g.title.replace(/[*\x60_~]/g,'').slice(0,32))+'</button>').join('')+'</nav>'
      : '';
    return '<div class="ha-arc-signal-deck" data-arc-layout="signal">'+
      '<div class="ha-arc-deck-controls"><span class="ha-arc-deck-brand"><i aria-hidden="true"></i> ARC / SIGNAL DECK</span>'+
      '<div class="ha-arc-deck-modes" role="group" aria-label="Response display">'+
      '<button type="button" data-arc-mode="signal" aria-pressed="true">SIGNAL</button>'+
      '<button type="button" data-arc-mode="read" aria-pressed="false">READ</button></div></div>'+
      '<div class="ha-arc-deck-signal-view">'+
      '<div class="ha-arc-signal-hero"><div class="ha-arc-signal-top"><span>01 / THE SIGNAL</span>'+
      '<span class="ha-arc-signal-glyph" aria-hidden="true">✳ ··· ◼</span></div>'+summary+
      '<div class="ha-arc-signal-foot"><span>THE QUICK READ</span><span>ARC // HABIT INTELLIGENCE</span></div></div>'+
      arcDeckVerifiedMetrics(verifiedSnapshot,esc)+pills+(sections.length?'<div class="ha-arc-deck-sections">'+sectionHtml+'</div>':'')+
      '</div>'+
      '<div class="ha-arc-deck-read-view" hidden><div class="ha-arc-deck-read-label">FULL RESPONSE / CLEAR READING</div>'+
      '<div class="ha-arc-deck-original ha-md-prose">'+original+'</div></div>'+
      '<div class="ha-arc-deck-bottom"><span>FORMAT / SIGNAL DECK</span><span>Full answer in READ · record IDs hidden</span></div></div>';
}


/**
 * ARC AI conversational response. One continuous, accessible Markdown answer;
 * no duplicated preview/readout, no forced sections, and no unverified AI
 * numbers introduced by the presentation layer.
 */
export function renderArcChatAnswer(markdown, escapeHTML = defaultEscapeHtml, verifiedSnapshot = null) {
    const esc = typeof escapeHTML === 'function' ? escapeHTML : defaultEscapeHtml;
    // Keep dates and routine reminder times easy to read in normal prose,
    // without boxed inline-code chips that fragment lines on narrow phones.
    // Preserve fenced code blocks exactly as supplied.
    const source = cleanArcDisplayText(markdown).split(/((?:^|\n)```[^\n]*\n[\s\S]*?(?:^|\n)```)/gm)
        .map((piece, index) => index % 2 === 1 ? piece
            : piece.replace(/`(\d{4}-\d{2}-\d{2}|(?:[01]?\d|2[0-3]):[0-5]\d)`/g, '$1'))
        .join('');
    if (!source.trim()) return '';
    const content = arcDeckResponsiveTables(
        arcDeckCodeBlocks(renderCoachMarkdown(source, esc)), esc
    );
    const snapshot = verifiedSnapshot;
    const verified = snapshot && ['habitCount', 'totalScheduled', 'totalLogged']
        .every(key => Number.isSafeInteger(snapshot[key]) && snapshot[key] >= 0 && snapshot[key] <= 100000)
        && snapshot.totalLogged <= snapshot.totalScheduled;
    const sourceNote = verified
        ? '<div class="ha-arc-chat-source" role="note"><span>SYNCED ACCOUNT SNAPSHOT</span><span>' +
          esc(String(snapshot.habitCount)) + ' habits · ' +
          esc(String(snapshot.totalLogged)) + '/' + esc(String(snapshot.totalScheduled)) +
          ' logged checks</span></div>'
        : '';
    return '<div class="ha-arc-chat-answer ha-md-prose">' + content + sourceNote + '</div>';
}


/**
 * Client-side SSE reader for POST /api/coach. Handles arbitrary network chunk
 * boundaries, UTF-8 splits, CRLF, and multiple event frames per chunk.
 * Requiring a terminal "done" prevents saving truncated responses as complete.
 */
export async function consumeArcCoachStream(response, onEvent) {
    if (!response?.body?.getReader) throw new Error('Streaming is not supported in this browser.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;
    let totalChars = 0;
    async function handleFrame(frame) {
        const lines = frame.split('\n');
        const name = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
        const data = lines.filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart()).join('\n');
        if (!data) return;
        let value;
        try { value = JSON.parse(data); }
        catch { throw new Error('ARC AI returned an invalid streaming event.'); }
        if (name === 'error') throw new Error(value?.message || 'ARC AI streaming failed.');
        if (name === 'done') completed = true;
        await onEvent(name, value);
    }
    try {
        while (!completed) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            totalChars += text.length;
            if (totalChars > 100000) throw new Error('ARC AI streamed response exceeded the limit.');
            buffer += text;
            buffer = buffer.replace(/\r\n/g, '\n');
            let end;
            while ((end = buffer.indexOf('\n\n')) !== -1) {
                const event = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                await handleFrame(event);
                if (completed) break;
            }
            if (buffer.length > 16000) throw new Error('ARC AI returned an oversized streaming event.');
        }
        if (!completed) {
            buffer += decoder.decode();
            buffer = buffer.replace(/\r\n/g, '\n').trim();
            if (buffer) await handleFrame(buffer);
        }
        if (!completed) throw new Error('ARC AI connection closed before the reply finished. Please retry.');
    } finally {
        if (!completed) await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}


/**
 * Present actual streamed Gemini deltas in readable word-sized increments.
 * The queue only accepts text already received from the live SSE transport;
 * it never fabricates content or pretends a non-streaming fallback was streamed.
 * A terminal "done" waits for the pending words before the final saved render.
 */
export function createArcWordReveal(onUpdate, {
    intervalMs = 42,
    schedule = (callback, delay) => setTimeout(callback, delay),
    clear = timer => clearTimeout(timer)
} = {}) {
    if (typeof onUpdate !== 'function') throw new TypeError('onUpdate must be a function.');
    let fragment = '';
    let visible = '';
    let queue = [];
    let timer = null;
    let closed = false;
    let finishing = false;
    const waiters = [];
    const notifyDrain = () => {
        if (!finishing || queue.length || timer !== null) return;
        for (const resolve of waiters.splice(0)) resolve(visible);
    };
    const pump = () => {
        if (closed || timer !== null) return;
        if (!queue.length) { notifyDrain(); return; }
        // Catch up if the provider/transport sends many words in one frame.
        const delay = queue.length > 65 ? 14
            : queue.length > 25 ? 22
                : queue.length > 8 ? 31 : intervalMs;
        timer = schedule(() => {
            timer = null;
            if (closed) return;
            visible += queue.shift();
            onUpdate(visible);
            pump();
        }, delay);
    };
    return {
        push(chunk) {
            if (closed || typeof chunk !== 'string' || !chunk) return;
            fragment += chunk;
            // Do not render a partial word unless the stream has ended.
            let match;
            while ((match = /^(\s*\S+\s+)/u.exec(fragment)) !== null) {
                queue.push(match[1]);
                fragment = fragment.slice(match[1].length);
            }
            pump();
        },
        finish() {
            if (closed) return Promise.resolve(visible);
            if (fragment) { queue.push(fragment); fragment = ''; }
            finishing = true;
            return new Promise(resolve => { waiters.push(resolve); pump(); });
        },
        reset() {
            if (timer !== null) clear(timer);
            timer = null;
            fragment = '';
            queue = [];
            visible = '';
            finishing = false;
            for (const resolve of waiters.splice(0)) resolve('');
        },
        cancel() { closed = true; this.reset(); },
        get text() { return visible; }
    };
}
