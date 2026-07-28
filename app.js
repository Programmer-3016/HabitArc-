/**
 * HabitArc — Core Application Logic
 * Central data management layer using localStorage
 * 
 * Data Model:
 * {
 *   habits: [{
 *     id: string,
 *     name: string,
 *     icon: string (Material Symbols name),
 *     category: string,
 *     reminder: string (time),
 *     repeat: string[] (days),
 *     why: string,
 *     motivation: string,
 *     createdAt: string (ISO date),
 *     completions: { "YYYY-MM-DD": boolean }
 *   }],
 *   settings: {
 *     theme: "light" | "dark",
 *     goalDuration: 30 | 60 | 90 | number,
 *     startWeekOn: "monday" | "sunday",
 *     defaultReminderTime: string,
 *     userName: string,
 *     userBio: string
 *   },
 *   onboardingComplete: boolean
 * }
 */

const HabitArc = (() => {
    // ─── Storage Keys ───────────────────────────────
    const STORAGE_KEY = 'habitarc_data';

    // ─── Default Data ───────────────────────────────
    const DEFAULT_DATA = {
        habits: [],
        settings: {
            theme: 'light',
            goalDuration: 30,
            startWeekOn: 'monday',
            defaultReminderTime: '09:00',
            userName: 'Alex Thorne',
            userBio: 'Building stillness, one day at a time.'
        },
        onboardingComplete: false
    };

    // ─── Seed/Demo Data ─────────────────────────────
    const SEED_HABITS = [
        {
            id: _generateId(),
            name: 'Hydrate',
            icon: 'water_drop',
            category: 'Health',
            reminder: '08:00',
            repeat: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            why: 'Stay healthy and energized throughout the day',
            motivation: 'Water is the foundation of life',
            createdAt: _daysAgo(30),
            completions: _generateSeedCompletions(30, 0.85)
        },
        {
            id: _generateId(),
            name: 'Meditation',
            icon: 'self_improvement',
            category: 'Mindfulness',
            reminder: '07:00',
            repeat: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            why: 'Calm my mind and build mental resilience',
            motivation: 'Peace begins from within',
            createdAt: _daysAgo(25),
            completions: _generateSeedCompletions(25, 0.72)
        },
        {
            id: _generateId(),
            name: 'Reading',
            icon: 'menu_book',
            category: 'Learning',
            reminder: '21:00',
            repeat: ['mon', 'tue', 'wed', 'thu', 'fri'],
            why: 'Read 20 pages every day to grow intellectually',
            motivation: 'Knowledge compounds over time',
            createdAt: _daysAgo(20),
            completions: _generateSeedCompletions(20, 0.60)
        },
        {
            id: _generateId(),
            name: 'Workout',
            icon: 'fitness_center',
            category: 'Health',
            reminder: '06:30',
            repeat: ['mon', 'wed', 'fri', 'sat'],
            why: 'Build strength and discipline',
            motivation: 'The body achieves what the mind believes',
            createdAt: _daysAgo(28),
            completions: _generateSeedCompletions(28, 0.78)
        },
        {
            id: _generateId(),
            name: 'Journal',
            icon: 'edit_note',
            category: 'Mindfulness',
            reminder: '22:00',
            repeat: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            why: 'Reflect on my day and track my thoughts',
            motivation: 'Writing is thinking on paper',
            createdAt: _daysAgo(15),
            completions: _generateSeedCompletions(15, 0.65)
        },
        {
            id: _generateId(),
            name: 'No Social Media',
            icon: 'phone_disabled',
            category: 'Focus',
            reminder: '09:00',
            repeat: ['mon', 'tue', 'wed', 'thu', 'fri'],
            why: 'Reduce screen time and focus on real life',
            motivation: 'Attention is the new currency',
            createdAt: _daysAgo(12),
            completions: _generateSeedCompletions(12, 0.55)
        }
    ];

    // ─── Helper Functions ───────────────────────────
    function _generateId() {
        return 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
    }

    function _today() {
        return new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
    }

    function _daysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d.toISOString().split('T')[0];
    }

    function _dateRange(startDate, endDate) {
        const dates = [];
        const current = new Date(startDate);
        const end = new Date(endDate);
        while (current <= end) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }

    function _generateSeedCompletions(daysBack, probability) {
        const completions = {};
        for (let i = daysBack; i >= 1; i--) {
            const date = _daysAgo(i);
            if (Math.random() < probability) {
                completions[date] = true;
            }
        }
        return completions;
    }

    function _getDayName(dateStr) {
        const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        return days[new Date(dateStr).getDay()];
    }

    function _formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }

    // ─── Core Data Access ───────────────────────────
    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.error('HabitArc: Failed to load data', e);
            return null;
        }
    }

    function _save(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('HabitArc: Failed to save data', e);
        }
    }

    function _getData() {
        let data = _load();
        if (!data) {
            data = JSON.parse(JSON.stringify(DEFAULT_DATA));
            data.habits = SEED_HABITS.map(h => ({...h, id: _generateId()}));
            data.onboardingComplete = true;
            _save(data);
        }
        return data;
    }

    // ─── Habit CRUD ─────────────────────────────────
    function getHabits() {
        return _getData().habits;
    }

    function getHabitById(id) {
        return getHabits().find(h => h.id === id) || null;
    }

    function addHabit({ name, icon, category, reminder, repeat, why, motivation }) {
        const data = _getData();
        if (data.habits.length >= 20) {
            return { success: false, message: 'Maximum 20 habits allowed' };
        }
        const habit = {
            id: _generateId(),
            name: name || 'Untitled Habit',
            icon: icon || 'check_circle',
            category: category || 'General',
            reminder: reminder || data.settings.defaultReminderTime,
            repeat: repeat || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            why: why || '',
            motivation: motivation || '',
            createdAt: _today(),
            completions: {}
        };
        data.habits.push(habit);
        _save(data);
        return { success: true, habit };
    }

    function deleteHabit(id) {
        const data = _getData();
        data.habits = data.habits.filter(h => h.id !== id);
        _save(data);
    }

    function updateHabit(id, updates) {
        const data = _getData();
        const idx = data.habits.findIndex(h => h.id === id);
        if (idx === -1) return false;
        data.habits[idx] = { ...data.habits[idx], ...updates };
        _save(data);
        return true;
    }

    // ─── Completion Tracking ────────────────────────
    function completeHabit(id, date) {
        date = date || _today();
        const data = _getData();
        const habit = data.habits.find(h => h.id === id);
        if (!habit) return false;
        if (!habit.completions) habit.completions = {};
        habit.completions[date] = true;
        _save(data);
        return true;
    }

    function uncompleteHabit(id, date) {
        date = date || _today();
        const data = _getData();
        const habit = data.habits.find(h => h.id === id);
        if (!habit) return false;
        if (habit.completions) {
            delete habit.completions[date];
        }
        _save(data);
        return true;
    }

    function isCompletedToday(id) {
        const habit = getHabitById(id);
        if (!habit) return false;
        return !!(habit.completions && habit.completions[_today()]);
    }

    function isCompletedOn(id, date) {
        const habit = getHabitById(id);
        if (!habit) return false;
        return !!(habit.completions && habit.completions[date]);
    }

    // ─── Streak Calculations ────────────────────────
    function getCurrentStreak(id) {
        const habit = getHabitById(id);
        if (!habit || !habit.completions) return 0;

        let streak = 0;
        const today = new Date();
        const checkDate = new Date(today);

        // If not completed today, start checking from yesterday
        if (!habit.completions[_today()]) {
            checkDate.setDate(checkDate.getDate() - 1);
        }

        while (true) {
            const dateStr = checkDate.toISOString().split('T')[0];
            if (dateStr < habit.createdAt) break;

            // Skip days when habit isn't scheduled
            const dayName = _getDayName(dateStr);
            if (habit.repeat && !habit.repeat.includes(dayName)) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }

            if (habit.completions[dateStr]) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        return streak;
    }

    function getLongestStreak(id) {
        const habit = getHabitById(id);
        if (!habit || !habit.completions) return 0;

        let longest = 0;
        let current = 0;
        const dates = _dateRange(habit.createdAt, _today());

        for (const date of dates) {
            const dayName = _getDayName(date);
            if (habit.repeat && !habit.repeat.includes(dayName)) continue;

            if (habit.completions[date]) {
                current++;
                longest = Math.max(longest, current);
            } else {
                current = 0;
            }
        }
        return longest;
    }

    function getOverallCurrentStreak() {
        const habits = getHabits();
        if (habits.length === 0) return 0;

        let streak = 0;
        const today = new Date();
        const checkDate = new Date(today);

        for (let i = 0; i < 365; i++) {
            const dateStr = checkDate.toISOString().split('T')[0];
            const scheduledHabits = habits.filter(h => {
                if (dateStr < h.createdAt) return false;
                const dayName = _getDayName(dateStr);
                return !h.repeat || h.repeat.includes(dayName);
            });

            if (scheduledHabits.length === 0) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }

            const allCompleted = scheduledHabits.every(h => h.completions && h.completions[dateStr]);
            if (allCompleted) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else if (i === 0) {
                // Today not complete yet, check from yesterday
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            } else {
                break;
            }
        }
        return streak;
    }

    function getOverallLongestStreak() {
        const habits = getHabits();
        if (habits.length === 0) return 0;

        let longest = 0;
        let current = 0;
        const earliest = habits.reduce((min, h) => h.createdAt < min ? h.createdAt : min, _today());
        const dates = _dateRange(earliest, _today());

        for (const date of dates) {
            const scheduledHabits = habits.filter(h => {
                if (date < h.createdAt) return false;
                const dayName = _getDayName(date);
                return !h.repeat || h.repeat.includes(dayName);
            });

            if (scheduledHabits.length === 0) continue;

            const allCompleted = scheduledHabits.every(h => h.completions && h.completions[date]);
            if (allCompleted) {
                current++;
                longest = Math.max(longest, current);
            } else {
                current = 0;
            }
        }
        return longest;
    }

    // ─── Daily Progress ─────────────────────────────
    function getTodayProgress() {
        const habits = getTodayHabits();
        if (habits.length === 0) return { total: 0, completed: 0, percentage: 0 };

        const completed = habits.filter(h => h.completions && h.completions[_today()]).length;
        return {
            total: habits.length,
            completed,
            percentage: Math.round((completed / habits.length) * 100)
        };
    }

    function getTodayHabits() {
        const dayName = _getDayName(_today());
        return getHabits().filter(h => !h.repeat || h.repeat.includes(dayName));
    }

    // ─── Completion Rate ────────────────────────────
    function getCompletionRate(id, days = 30) {
        const habit = getHabitById(id);
        if (!habit) return 0;

        let scheduled = 0;
        let completed = 0;

        for (let i = 0; i < days; i++) {
            const date = _daysAgo(i);
            if (date < habit.createdAt) break;

            const dayName = _getDayName(date);
            if (habit.repeat && !habit.repeat.includes(dayName)) continue;

            scheduled++;
            if (habit.completions && habit.completions[date]) {
                completed++;
            }
        }

        return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
    }

    function getOverallCompletionRate(days = 30) {
        const habits = getHabits();
        if (habits.length === 0) return 0;

        let totalScheduled = 0;
        let totalCompleted = 0;

        for (const habit of habits) {
            for (let i = 0; i < days; i++) {
                const date = _daysAgo(i);
                if (date < habit.createdAt) break;

                const dayName = _getDayName(date);
                if (habit.repeat && !habit.repeat.includes(dayName)) continue;

                totalScheduled++;
                if (habit.completions && habit.completions[date]) {
                    totalCompleted++;
                }
            }
        }

        return totalScheduled === 0 ? 0 : Math.round((totalCompleted / totalScheduled) * 100);
    }

    // ─── Last 7 Days ────────────────────────────────
    function getLast7Days(id) {
        const habit = getHabitById(id);
        if (!habit) return [];

        const days = [];
        const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        for (let i = 6; i >= 0; i--) {
            const date = _daysAgo(i);
            const d = new Date(date);
            days.push({
                date,
                label: dayLabels[d.getDay()],
                completed: !!(habit.completions && habit.completions[date]),
                isToday: i === 0,
                isScheduled: !habit.repeat || habit.repeat.includes(_getDayName(date))
            });
        }
        return days;
    }

    // ─── Insights ───────────────────────────────────
    function getBestHabit() {
        const habits = getHabits();
        if (habits.length === 0) return null;

        let best = null;
        let bestRate = -1;

        for (const h of habits) {
            const rate = getCompletionRate(h.id);
            if (rate > bestRate) {
                bestRate = rate;
                best = h;
            }
        }
        return best ? { habit: best, rate: bestRate } : null;
    }

    function getWeakestHabit() {
        const habits = getHabits();
        if (habits.length === 0) return null;

        let worst = null;
        let worstRate = 101;

        for (const h of habits) {
            const rate = getCompletionRate(h.id);
            if (rate < worstRate) {
                worstRate = rate;
                worst = h;
            }
        }
        return worst ? { habit: worst, rate: worstRate } : null;
    }

    function getConsistencyScore() {
        const rate = getOverallCompletionRate();
        if (rate >= 95) return 'A+';
        if (rate >= 90) return 'A';
        if (rate >= 85) return 'A-';
        if (rate >= 80) return 'B+';
        if (rate >= 75) return 'B';
        if (rate >= 70) return 'B-';
        if (rate >= 65) return 'C+';
        if (rate >= 60) return 'C';
        if (rate >= 55) return 'C-';
        if (rate >= 50) return 'D';
        return 'F';
    }

    function getBestDay() {
        const habits = getHabits();
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayStats = dayNames.map(() => ({ scheduled: 0, completed: 0 }));

        for (const habit of habits) {
            for (let i = 0; i < 30; i++) {
                const date = _daysAgo(i);
                if (date < habit.createdAt) break;
                const dayIdx = new Date(date).getDay();
                const dayName = dayNames[dayIdx];
                if (habit.repeat && !habit.repeat.includes(dayName)) continue;

                dayStats[dayIdx].scheduled++;
                if (habit.completions && habit.completions[date]) {
                    dayStats[dayIdx].completed++;
                }
            }
        }

        let bestIdx = 0;
        let bestRate = 0;
        dayStats.forEach((stat, idx) => {
            const rate = stat.scheduled > 0 ? stat.completed / stat.scheduled : 0;
            if (rate > bestRate) {
                bestRate = rate;
                bestIdx = idx;
            }
        });

        return { day: dayLabels[bestIdx], rate: Math.round(bestRate * 100) };
    }

    // ─── Calendar Data (GitHub Contribution Style) ──
    function getCalendarData(id, months = 6) {
        const habit = getHabitById(id);
        if (!habit) return [];

        const today = new Date();
        const start = new Date(today);
        start.setMonth(start.getMonth() - months);

        const dates = _dateRange(start.toISOString().split('T')[0], _today());

        return dates.map(date => {
            const dayName = _getDayName(date);
            const isScheduled = !habit.repeat || habit.repeat.includes(dayName);
            const isBeforeCreation = date < habit.createdAt;
            const isFuture = date > _today();

            let status = 'none'; // not applicable
            if (!isBeforeCreation && !isFuture && isScheduled) {
                status = habit.completions && habit.completions[date] ? 'completed' : 'missed';
            } else if (!isBeforeCreation && !isFuture && !isScheduled) {
                status = 'rest'; // rest day
            }

            return {
                date,
                status,
                isToday: date === _today(),
                dayOfWeek: new Date(date).getDay(),
                month: new Date(date).getMonth(),
                year: new Date(date).getFullYear()
            };
        });
    }

    function getMonthlyActivity(id) {
        const habit = getHabitById(id);
        if (!habit) return [];

        const months = [];
        const today = new Date();

        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthStart = d.toISOString().split('T')[0];
            const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
            const dates = _dateRange(monthStart, monthEnd > _today() ? _today() : monthEnd);

            let scheduled = 0;
            let completed = 0;
            for (const date of dates) {
                if (date < habit.createdAt) continue;
                const dayName = _getDayName(date);
                if (habit.repeat && !habit.repeat.includes(dayName)) continue;
                scheduled++;
                if (habit.completions && habit.completions[date]) completed++;
            }

            months.push({
                label: d.toLocaleDateString('en-US', { month: 'short' }),
                scheduled,
                completed,
                rate: scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0
            });
        }

        return months;
    }

    // ─── Settings ───────────────────────────────────
    function getSettings() {
        return _getData().settings;
    }

    function updateSettings(updates) {
        const data = _getData();
        data.settings = { ...data.settings, ...updates };
        _save(data);
    }

    // ─── Theme ──────────────────────────────────────
    function getTheme() {
        return getSettings().theme || 'light';
    }

    function setTheme(theme) {
        updateSettings({ theme });
        applyTheme();
    }

    function toggleTheme() {
        const current = getTheme();
        const next = current === 'dark' ? 'light' : 'dark';
        setTheme(next);
        return next;
    }

    function applyTheme() {
        const theme = getTheme();
        const html = document.documentElement;
        html.removeAttribute('style');
        html.classList.remove('dark', 'light');

        if (['dark', 'purple', 'forest', 'ocean', 'sunset'].includes(theme)) {
            html.classList.add('dark');
        } else {
            html.classList.add('light');
        }

        const themeMap = {
            'purple': { bg: '#160d27', text: '#e9d5ff' },
            'dark':   { bg: '#121415', text: '#e1e3e4' },
            'light':  { bg: '#f8f9fa', text: '#191c1d' },
            'forest': { bg: '#071f16', text: '#d1fae5' },
            'ocean':  { bg: '#0c1a2e', text: '#dbeafe' },
            'sunset': { bg: '#2a1015', text: '#ffe4e6' }
        };

        const config = themeMap[theme] || themeMap['light'];
        html.style.backgroundColor = config.bg;
        document.body.style.backgroundColor = config.bg;
        document.body.style.color = config.text;
        html.setAttribute('data-theme', theme);
    }

    // ─── Export ─────────────────────────────────────
    function exportCSV() {
        const habits = getHabits();
        const earliest = habits.reduce((min, h) => h.createdAt < min ? h.createdAt : min, _today());
        const dates = _dateRange(earliest, _today());

        let csv = 'Date,' + habits.map(h => '"' + h.name + '"').join(',') + '\n';

        for (const date of dates) {
            const row = [date];
            for (const habit of habits) {
                if (date < habit.createdAt) {
                    row.push('-');
                } else {
                    const dayName = _getDayName(date);
                    if (habit.repeat && !habit.repeat.includes(dayName)) {
                        row.push('rest');
                    } else {
                        row.push(habit.completions && habit.completions[date] ? '1' : '0');
                    }
                }
            }
            csv += row.join(',') + '\n';
        }

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `habitarc_export_${_today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ─── Reset ──────────────────────────────────────
    function resetAllData() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // ─── Greeting ───────────────────────────────────
    function getGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    }

    function getFormattedToday() {
        return new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
        });
    }

    // ─── Category Colors ────────────────────────────
    function getCategoryStyle(category) {
        const styles = {
            'Health':      { bg: 'bg-primary-fixed/20',    text: 'text-primary-container', iconFill: true },
            'Mindfulness': { bg: 'bg-secondary-container/30', text: 'text-secondary',     iconFill: false },
            'Learning':    { bg: 'bg-tertiary-fixed/20',   text: 'text-tertiary',          iconFill: true },
            'Focus':       { bg: 'bg-surface-container',   text: 'text-on-surface-variant', iconFill: false },
            'Fitness':     { bg: 'bg-primary-fixed/20',    text: 'text-primary-container', iconFill: true },
            'Productivity':{ bg: 'bg-secondary-container/30', text: 'text-secondary',     iconFill: false },
            'General':     { bg: 'bg-surface-container',   text: 'text-on-surface-variant', iconFill: false }
        };
        return styles[category] || styles['General'];
    }

    // ─── Public API ─────────────────────────────────
    return {
        // Habits
        getHabits,
        getHabitById,
        addHabit,
        deleteHabit,
        updateHabit,

        // Completions
        completeHabit,
        uncompleteHabit,
        isCompletedToday,
        isCompletedOn,

        // Streaks
        getCurrentStreak,
        getLongestStreak,
        getOverallCurrentStreak,
        getOverallLongestStreak,

        // Progress
        getTodayProgress,
        getTodayHabits,
        getCompletionRate,
        getOverallCompletionRate,
        getLast7Days,

        // Insights
        getBestHabit,
        getWeakestHabit,
        getConsistencyScore,
        getBestDay,

        // Calendar
        getCalendarData,
        getMonthlyActivity,

        // Settings
        getSettings,
        updateSettings,
        getTheme,
        setTheme,
        toggleTheme,
        applyTheme,

        // Export / Reset
        exportCSV,
        resetAllData,

        // Utilities
        getGreeting,
        getFormattedToday,
        getCategoryStyle,
        today: _today
    };
})();

// Apply theme on load
document.addEventListener('DOMContentLoaded', () => {
    HabitArc.applyTheme();
});
