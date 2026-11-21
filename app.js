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
 *   completionHistory: {
 *     "{habitId}_{YYYY-MM-DD}": {
 *       id: string,
 *       habitId: string,
 *       date: string (YYYY-MM-DD),
 *       status: "completed" | "not_completed",
 *       completedAt: string | null,
 *       updatedAt: string (ISO timestamp)
 *     }
 *   },
 *   settings: {
 *     theme: "light" | "dark",
 *     goalDuration: 30 | 60 | 90 | number,
 *     startWeekOn: "monday" | "sunday",
 *     defaultReminderTime: string,
 *     userName: string,
 *     userBio: string,
 *     dailyReminder: boolean,
 *     weeklySummary: boolean
 *   },
 *   onboardingComplete: boolean
 * }
 */

const HabitArc = (() => {
    // ─── Storage Keys ───────────────────────────────
    const STORAGE_KEY = 'habitarc_data';
    const ACTIVE_USER_KEY = 'habitarc_active_uid';
    const LEGACY_MIGRATION_OWNER_KEY = 'habitarc_legacy_owner_uid';
    const USER_STORAGE_PREFIX = `${STORAGE_KEY}:`;
    const PENDING_SYNC_PREFIX = `${STORAGE_KEY}:pending-sync`;
    const PENDING_COMPLETION_HISTORY_PREFIX = `${STORAGE_KEY}:pending-completion-history`;
    const REMINDER_RECEIPT_PREFIX = 'habitarc_reminder_receipt';
    const REMINDER_CHECK_INTERVAL_MS = 30000;
    const DEFAULT_HABIT_ACCENTS = {
        Health: '#0e8f63',
        Mindfulness: '#7c5ce0',
        Learning: '#3988d4',
        Focus: '#d17b2a',
        Wellness: '#16a082',
        Fitness: '#0e8f63',
        Productivity: '#3988d4',
        General: '#65717d'
    };

    // ─── Default Data ───────────────────────────────
    const DEFAULT_DATA = {
        habits: [],
        completionHistory: {},
        settings: {
            theme: 'dark', // "dark" | "light" | "forest" | "midnight"
            companion: 'arcy', // "arcy" | "ninja" | "specops" | "astro"
            goalDuration: 30,
            startWeekOn: 'monday',
            defaultReminderTime: '09:00',
            userName: 'Alex Thorne',
            userBio: 'Building stillness, one day at a time.',
            // These preferences are deliberately opt-in. Browser permission is
            // requested only from a direct Settings-page user action.
            dailyReminder: false,
            weeklySummary: false
        },
        onboardingComplete: false
    };

    // A signed-in user's data is kept in a separate local cache. This prevents
    // profiles on a shared device from seeing one another's habits while the
    // cloud document is loading.
    let activeUserId = _readStorageValue(ACTIVE_USER_KEY);
    let activeStorageKey = activeUserId ? `${USER_STORAGE_PREFIX}${activeUserId}` : STORAGE_KEY;
    let cloudClient = null;
    let cloudUnsubscribe = null;
    let cloudSaveTimer = null;
    let cloudSaveChain = Promise.resolve();
    let cloudSyncReady = false;
    let cloudApplyingRemoteData = false;
    let cloudActivatedUserId = null;
    let cloudHydratingUserId = null;
    let cloudRetryTimer = null;
    let cloudRetryAttempts = 0;
    let localMutationRevision = 0;
    let authReadyPromise = null;
    let reminderSchedulerStarted = false;
    let reminderCheckRunning = false;

    const CLOUD_RETRY_DELAYS = [1000, 3000, 10000];

    function _readStorageValue(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function _writeStorageValue(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.error('HabitArc: Failed to save data', error);
            return false;
        }
    }

    function _removeStorageValue(key) {
        try {
            localStorage.removeItem(key);
        } catch {
            // Storage is optional; the in-memory page remains usable.
        }
    }

    function _pendingSyncKey(userId = activeUserId) {
        return userId ? `${PENDING_SYNC_PREFIX}:${userId}` : `${PENDING_SYNC_PREFIX}:legacy`;
    }

    function _hasPendingLocalSync(userId = activeUserId) {
        return _readStorageValue(_pendingSyncKey(userId)) === '1';
    }

    function _markPendingLocalSync(userId = activeUserId) {
        _writeStorageValue(_pendingSyncKey(userId), '1');
    }

    function _clearPendingLocalSync(userId = activeUserId) {
        _removeStorageValue(_pendingSyncKey(userId));
    }

    function _pendingCompletionHistoryKey(userId = activeUserId) {
        return userId
            ? `${PENDING_COMPLETION_HISTORY_PREFIX}:${userId}`
            : `${PENDING_COMPLETION_HISTORY_PREFIX}:legacy`;
    }

    function _getPendingCompletionHistoryOperations(userId = activeUserId) {
        const raw = _readStorageValue(_pendingCompletionHistoryKey(userId));
        if (!raw) return {};

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

            return Object.fromEntries(
                Object.entries(parsed).filter(([, operation]) =>
                    operation === 'upsert' || operation === 'delete'
                )
            );
        } catch {
            return {};
        }
    }

    function _writePendingCompletionHistoryOperations(operations, userId = activeUserId) {
        const entries = Object.entries(operations || {}).filter(([, operation]) =>
            operation === 'upsert' || operation === 'delete'
        );

        if (entries.length === 0) {
            _removeStorageValue(_pendingCompletionHistoryKey(userId));
            return;
        }

        _writeStorageValue(
            _pendingCompletionHistoryKey(userId),
            JSON.stringify(Object.fromEntries(entries))
        );
    }

    function _queueCompletionHistoryOperation(recordId, operation = 'upsert', userId = activeUserId) {
        if (!recordId || (operation !== 'upsert' && operation !== 'delete')) return;
        const operations = _getPendingCompletionHistoryOperations(userId);
        operations[recordId] = operation;
        _writePendingCompletionHistoryOperations(operations, userId);
    }

    function _hasPendingCompletionHistory(userId = activeUserId) {
        return Object.keys(_getPendingCompletionHistoryOperations(userId)).length > 0;
    }

    // ─── Audio Chime Synthesizer (Option 3) ─────────
    function playCompletionSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') ctx.resume();

            const now = ctx.currentTime;
            
            // Primary tone (D5 ~587.33Hz -> A5 880Hz)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);
            gain1.gain.setValueAtTime(0.14, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.35);

            // Harmonic chime accent (F#5 ~739.99Hz)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(739.99, now + 0.05);
            gain2.gain.setValueAtTime(0.08, now + 0.05);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.05);
            osc2.stop(now + 0.4);
        } catch (e) {
            console.warn('Audio play skipped:', e);
        }
    }

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

    // Habit dates are deliberately stored as local calendar dates. UTC date
    // strings make a habit appear to switch days early for users east/west of
    // Greenwich, especially around a reminder time or midnight.
    function _localDateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function _dateFromKey(dateKey) {
        const [year, month, day] = String(dateKey || '').split('-').map(Number);
        return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
    }

    function _today() {
        return _localDateKey(); // "YYYY-MM-DD"
    }

    function _daysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return _localDateKey(d);
    }

    function _dateRange(startDate, endDate) {
        const dates = [];
        const current = _dateFromKey(startDate);
        const end = _dateFromKey(endDate);
        while (current <= end) {
            dates.push(_localDateKey(current));
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
        return days[_dateFromKey(dateStr).getDay()];
    }

    function _formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }

    // ─── Core Data Access ───────────────────────────
    function _cloneData(data) {
        return JSON.parse(JSON.stringify(data || {}));
    }

    function _isDateKey(value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    }

    function _completionRecordId(habitId, date) {
        return `${habitId}_${date}`;
    }

    function _legacyCompletionTimestamp(date) {
        // Historical local completion maps do not have a time of day. A stable
        // midday timestamp lets us migrate them once without making a reload
        // look like a new user action.
        return `${date}T12:00:00.000Z`;
    }

    function _normaliseCompletionHistory(rawHistory) {
        const entries = Array.isArray(rawHistory)
            ? rawHistory.map((record) => [record?.id, record])
            : rawHistory && typeof rawHistory === 'object'
                ? Object.entries(rawHistory)
                : [];
        const history = {};

        entries.forEach(([fallbackId, rawRecord]) => {
            if (!rawRecord || typeof rawRecord !== 'object') return;

            const habitId = typeof rawRecord.habitId === 'string' ? rawRecord.habitId : '';
            const date = typeof rawRecord.date === 'string' ? rawRecord.date : '';
            if (!habitId || !_isDateKey(date)) return;

            const id = _completionRecordId(habitId, date);
            const status = rawRecord.status === 'completed' ? 'completed' : 'not_completed';
            const completedAt = status === 'completed'
                ? (typeof rawRecord.completedAt === 'string' && rawRecord.completedAt
                    ? rawRecord.completedAt
                    : _legacyCompletionTimestamp(date))
                : null;
            const updatedAt = typeof rawRecord.updatedAt === 'string' && rawRecord.updatedAt
                ? rawRecord.updatedAt
                : completedAt || _legacyCompletionTimestamp(date);
            const record = { id, habitId, date, status, completedAt, updatedAt };
            const existing = history[id];

            // A malformed export can theoretically contain duplicates. Keep
            // the newest explicit state so a later undo always wins.
            if (!existing || String(record.updatedAt) >= String(existing.updatedAt)) {
                history[id] = record;
            }
        });

        return history;
    }

    function _normaliseHabits(rawHabits) {
        if (!Array.isArray(rawHabits)) return [];

        return _cloneData(rawHabits)
            .filter((habit) => habit && typeof habit === 'object')
            .map((habit) => {
                // Older starter routines predate the flag. Match both original
                // prompts, not a common habit name like "Reading".
                if (habit.starterHabit == null && SEED_HABITS.some(seed =>
                    seed.why === habit.why && seed.motivation === habit.motivation)) {
                    habit.starterHabit = true;
                }
                const rawCompletions = habit.completions && typeof habit.completions === 'object'
                    ? habit.completions
                    : {};

                habit.completions = Object.fromEntries(
                    Object.entries(rawCompletions).filter(([date, completed]) =>
                        _isDateKey(date) && Boolean(completed)
                    )
                );
                habit.accentColor = _normaliseHabitAccent(habit.accentColor, habit.category);
                return habit;
            });
    }

    function _normaliseHabitAccent(value, category) {
        if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())) {
            return value.trim().toLowerCase();
        }
        return DEFAULT_HABIT_ACCENTS[category] || DEFAULT_HABIT_ACCENTS.General;
    }

    function _applyCompletionHistoryToHabits(habits, completionHistory) {
        const habitsById = new Map(
            habits.filter((habit) => habit?.id).map((habit) => [habit.id, habit])
        );

        Object.values(completionHistory).forEach((record) => {
            const habit = habitsById.get(record.habitId);
            if (!habit) return;

            if (!habit.completions || typeof habit.completions !== 'object') {
                habit.completions = {};
            }

            if (record.status === 'completed') {
                habit.completions[record.date] = true;
            } else {
                delete habit.completions[record.date];
            }
        });
    }

    function _createCompletionHistoryRecord(habitId, date, completed) {
        const timestamp = new Date().toISOString();
        return {
            id: _completionRecordId(habitId, date),
            habitId,
            date,
            status: completed ? 'completed' : 'not_completed',
            completedAt: completed ? timestamp : null,
            updatedAt: timestamp
        };
    }

    function _normaliseData(rawData) {
        const source = rawData && typeof rawData === 'object' ? rawData : {};
        const sourceSettings = source.settings && typeof source.settings === 'object'
            ? source.settings
            : {};
        const { onboardingComplete: legacyOnboardingComplete, ...settings } = sourceSettings;
        const habits = _normaliseHabits(source.habits);
        const completionHistory = _normaliseCompletionHistory(source.completionHistory);

        // v1 stored completion booleans directly on habits. Preserve every
        // existing completion as a stable history record during migration.
        habits.forEach((habit) => {
            if (!habit?.id || !habit.completions) return;

            Object.entries(habit.completions).forEach(([date, completed]) => {
                if (!completed || !_isDateKey(date)) return;
                const id = _completionRecordId(habit.id, date);
                if (!completionHistory[id]) {
                    completionHistory[id] = {
                        id,
                        habitId: habit.id,
                        date,
                        status: 'completed',
                        completedAt: _legacyCompletionTimestamp(date),
                        updatedAt: _legacyCompletionTimestamp(date)
                    };
                }
            });
        });

        // The history collection is canonical once it exists. The habit map is
        // retained as a backwards-compatible, UI-friendly projection.
        _applyCompletionHistoryToHabits(habits, completionHistory);

        const validCompanions = new Set(['arcy', 'ninja', 'specops', 'astro']);
        const mergedSettings = {
            ...DEFAULT_DATA.settings,
            ..._cloneData(settings)
        };
        if (!validCompanions.has(mergedSettings.companion)) {
            mergedSettings.companion = DEFAULT_DATA.settings.companion;
        }

        return {
            habits,
            completionHistory,
            settings: mergedSettings,
            // Older builds stored this flag inside settings while the root
            // default remained false. Preserve a completed onboarding flow if
            // either representation says it is complete, then keep the
            // canonical value at the root of the data object.
            onboardingComplete: Boolean(source.onboardingComplete || legacyOnboardingComplete)
        };
    }

    function _queueMissingCompletionHistoryRecords(data, remoteHistory, userId = activeUserId) {
        if (!userId) return false;

        const localHistory = _normaliseData(data).completionHistory;
        const knownRemoteHistory = _normaliseCompletionHistory(remoteHistory);
        let queued = false;

        Object.entries(localHistory).forEach(([recordId, record]) => {
            const remoteRecord = knownRemoteHistory[recordId];
            if (!remoteRecord || _stableSerialize(remoteRecord) !== _stableSerialize(record)) {
                _queueCompletionHistoryOperation(recordId, 'upsert', userId);
                queued = true;
            }
        });

        if (queued) _markPendingLocalSync(userId);
        return queued;
    }

    function _createInitialData() {
        return _normaliseData({
            ...DEFAULT_DATA,
            habits: SEED_HABITS.map((habit) => ({
                ..._cloneData(habit),
                starterHabit: true,
                id: _generateId()
            })),
            onboardingComplete: false
        });
    }

    function _loadStorageData(storageKey) {
        const raw = _readStorageValue(storageKey);
        if (!raw) return null;

        try {
            return _normaliseData(JSON.parse(raw));
        } catch (error) {
            console.error('HabitArc: Failed to load data', error);
            return null;
        }
    }

    function _writeStorageData(storageKey, data) {
        return _writeStorageValue(storageKey, JSON.stringify(_normaliseData(data)));
    }

    function _load() {
        return _loadStorageData(activeStorageKey);
    }

    function _emitDataChange(source = 'local', initial = false) {
        window.dispatchEvent(new CustomEvent('habitarc:data-changed', {
            detail: {
                source,
                initial,
                userId: activeUserId
            }
        }));
    }

    function _emitCloudSyncError(error) {
        window.dispatchEvent(new CustomEvent('habitarc:cloud-sync-error', {
            detail: {
                code: error?.code || 'cloud-sync-failed',
                message: error?.message || 'Cloud sync is temporarily unavailable.'
            }
        }));
    }

    function _stableSerialize(value) {
        if (Array.isArray(value)) {
            return `[${value.map(_stableSerialize).join(',')}]`;
        }

        if (value && typeof value === 'object') {
            return `{${Object.keys(value)
                .sort()
                .map((key) => `${JSON.stringify(key)}:${_stableSerialize(value[key])}`)
                .join(',')}}`;
        }

        return JSON.stringify(value);
    }

    function _sameData(left, right) {
        // Firestore does not guarantee JavaScript property insertion order and
        // returns habit documents as a collection. Compare a canonical form so
        // equivalent cloud snapshots never look like fresh data just because
        // field or document order differs.
        const normaliseForComparison = (data) => {
            const normalised = _normaliseData(data);
            return {
                ...normalised,
                habits: [...normalised.habits].sort((first, second) =>
                    String(first.id || '').localeCompare(String(second.id || ''))
                )
            };
        };

        return _stableSerialize(normaliseForComparison(left))
            === _stableSerialize(normaliseForComparison(right));
    }

    function _scheduleCloudSave() {
        if (cloudApplyingRemoteData || !cloudClient || !activeUserId) return;

        if (!cloudSyncReady) {
            const user = cloudClient.getCurrentUser?.();
            if (user?.uid === activeUserId) {
                // A fresh local action is a useful chance to retry a failed
                // initial connection without making the user lose that edit.
                if (cloudRetryAttempts >= CLOUD_RETRY_DELAYS.length) {
                    cloudRetryAttempts = 0;
                }
                _scheduleCloudRetry(user);
            }
            return;
        }

        if (cloudSaveTimer) window.clearTimeout(cloudSaveTimer);
        const scheduledUserId = activeUserId;

        cloudSaveTimer = window.setTimeout(() => {
            cloudSaveTimer = null;
            cloudSaveChain = cloudSaveChain
                .catch(() => undefined)
                .then(async () => {
                    const user = cloudClient?.getCurrentUser?.();
                    if (!user || user.uid !== scheduledUserId || activeUserId !== scheduledUserId) return;

                    await _persistUserData(_getData(), user);
                })
                .catch((error) => {
                    console.warn('HabitArc: Cloud sync save failed. Local changes remain safe on this device.', error);
                    _emitCloudSyncError(error);
                });
        }, 350);
    }

    function _save(data, { source = 'local', initial = false, emit = true } = {}) {
        const normalisedData = _normaliseData(data);
        _writeStorageData(activeStorageKey, normalisedData);

        if (!cloudApplyingRemoteData && source !== 'cloud') {
            localMutationRevision += 1;
            _markPendingLocalSync();
        }

        if (emit) _emitDataChange(source, initial);
        if (!cloudApplyingRemoteData) _scheduleCloudSave();

        return normalisedData;
    }

    function _getData() {
        let data = _load();
        if (!data) {
            data = _createInitialData();
            _save(data, { source: 'initial', initial: true });
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

    function addHabit({ name, icon, category, reminder, repeat, why, motivation, accentColor }) {
        const data = _getData();
        if (data.habits.length >= 20) {
            return { success: false, message: 'Maximum 20 habits allowed' };
        }
        const habit = {
            id: _generateId(),
            name: name || 'Untitled Habit',
            icon: icon || 'check_circle',
            category: category || 'General',
            accentColor: _normaliseHabitAccent(accentColor, category || 'General'),
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

        // Keep cloud history private and tidy when a habit is deleted. The
        // deletion operation is persisted separately so it also works after
        // an offline edit reconnects.
        Object.entries(data.completionHistory || {}).forEach(([recordId, record]) => {
            if (record?.habitId !== id) return;
            delete data.completionHistory[recordId];
            _queueCompletionHistoryOperation(recordId, 'delete');
        });
        _save(data);
    }

    function updateHabit(id, updates) {
        const data = _getData();
        const idx = data.habits.findIndex(h => h.id === id);
        if (idx === -1) return false;
        const nextHabit = { ...data.habits[idx], ...updates };
        // A schedule change takes effect today, not on already tracked days.
        const prior = data.habits[idx];
        if (Array.isArray(updates.repeat) && JSON.stringify(prior.repeat) !== JSON.stringify(updates.repeat)) {
            const today = _today();
            const initial = { from: prior.createdAt, days: prior.repeat ?? ['sun','mon','tue','wed','thu','fri','sat'] };
            nextHabit.scheduleHistory = [...(prior.scheduleHistory || [initial]).filter(s => s.from < today),
                { from: today, days: [...updates.repeat] }];
        }
        nextHabit.accentColor = _normaliseHabitAccent(nextHabit.accentColor, nextHabit.category);
        data.habits[idx] = nextHabit;
        _save(data);
        return true;
    }

    // ─── Completion Tracking ────────────────────────
    function completeHabit(id, date) {
        date = date || _today();
        const data = _getData();
        const habit = data.habits.find(h => h.id === id);
        if (!habit || !_isDateKey(date)) return false;
        if (!habit.completions) habit.completions = {};
        habit.completions[date] = true;
        const record = _createCompletionHistoryRecord(id, date, true);
        data.completionHistory[record.id] = record;
        _queueCompletionHistoryOperation(record.id, 'upsert');
        _save(data);
        playCompletionSound();
        return true;
    }

    function uncompleteHabit(id, date) {
        date = date || _today();
        const data = _getData();
        const habit = data.habits.find(h => h.id === id);
        if (!habit || !_isDateKey(date)) return false;
        if (habit.completions) {
            delete habit.completions[date];
        }
        const record = _createCompletionHistoryRecord(id, date, false);
        data.completionHistory[record.id] = record;
        _queueCompletionHistoryOperation(record.id, 'upsert');
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

    function getCompletionHistory(habitId) {
        const history = Object.values(_getData().completionHistory || {})
            .filter((record) => !habitId || record.habitId === habitId)
            .sort((first, second) => {
                const byDate = String(first.date).localeCompare(String(second.date));
                return byDate || String(first.updatedAt).localeCompare(String(second.updatedAt));
            });

        return _cloneData(history);
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
            const dateStr = _localDateKey(checkDate);
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
            const dateStr = _localDateKey(checkDate);
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
            const d = _dateFromKey(date);
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
                const dayIdx = _dateFromKey(date).getDay();
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

        const dates = _dateRange(_localDateKey(start), _today());

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
                dayOfWeek: _dateFromKey(date).getDay(),
                month: _dateFromKey(date).getMonth(),
                year: _dateFromKey(date).getFullYear()
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
            const monthStart = _localDateKey(d);
            const monthEnd = _localDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
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

    function updateSettings(updates = {}) {
        const data = _getData();
        const { onboardingComplete, ...settingsUpdates } = updates;

        if (!data.settings.leagueCompanion && data.onboardingComplete && settingsUpdates.companion) {
            data.settings.leagueCompanion = data.settings.companion;
        }
        data.settings = { ...data.settings, ...settingsUpdates };
        if (typeof onboardingComplete === 'boolean') {
            data.onboardingComplete = onboardingComplete;
        }

        _save(data);
    }

    // ─── Browser reminders ──────────────────────────
    // HabitArc can surface reminders while the web app is open. Reliable
    // delivery after a browser is fully closed requires a server-triggered
    // push service (FCM), which is intentionally kept outside this local
    // scheduler so no notification is falsely promised to the user.
    function getReminderPreferences() {
        const settings = getSettings();
        const supported = typeof window !== 'undefined' && 'Notification' in window;
        const permission = supported ? Notification.permission : 'unsupported';

        return {
            dailyReminder: Boolean(settings.dailyReminder),
            weeklySummary: Boolean(settings.weeklySummary),
            taskAlerts: Boolean(settings.taskAlerts),
            morningPlan: Boolean(settings.morningPlan),
            supported,
            permission,
            delivery: supported && permission === 'granted' ? 'while-open' : 'permission-required'
        };
    }

    function setReminderPreferences(updates = {}) {
        const current = getReminderPreferences();
        const next = {
            dailyReminder: typeof updates.dailyReminder === 'boolean'
                ? updates.dailyReminder
                : current.dailyReminder,
            weeklySummary: typeof updates.weeklySummary === 'boolean'
                ? updates.weeklySummary
                : current.weeklySummary,
            taskAlerts: typeof updates.taskAlerts === 'boolean'
                ? updates.taskAlerts : current.taskAlerts,
            morningPlan: typeof updates.morningPlan === 'boolean'
                ? updates.morningPlan : current.morningPlan
        };

        updateSettings(next);
        _startReminderScheduler();
        return { ...getReminderPreferences(), ...next };
    }

    async function requestNotificationPermission() {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            return { granted: false, permission: 'unsupported', message: 'This browser does not support notifications.' };
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') _startReminderScheduler();
            return {
                granted: permission === 'granted',
                permission,
                message: permission === 'granted'
                    ? 'Notifications are enabled while HabitArc is open.'
                    : 'Browser notification permission was not granted.'
            };
        } catch (error) {
            return {
                granted: false,
                permission: 'error',
                message: error?.message || 'HabitArc could not request notification permission.'
            };
        }
    }

    function _reminderReceiptKey(kind, identifier, date = _today()) {
        const userScope = activeUserId || 'local';
        return `${REMINDER_RECEIPT_PREFIX}:${userScope}:${kind}:${identifier}:${date}`;
    }

    function _hasReminderReceipt(kind, identifier, date = _today()) {
        return _readStorageValue(_reminderReceiptKey(kind, identifier, date)) === '1';
    }

    async function _deliverReminder(kind, identifier, date, title, options) {
        const scope = activeUserId;
        const receiptKey = _reminderReceiptKey(kind, identifier, date);
        const deliver = async () => {
            if (activeUserId !== scope || _readStorageValue(receiptKey) === '1') return;
            if (await _showReminderNotification(title, options, scope)) {
                _writeStorageValue(receiptKey, '1');
            }
        };
        // Web Locks serializes delivery across tabs. Notification tags also
        // collapse duplicates on browsers without Web Locks support.
        if (navigator.locks?.request) {
            await navigator.locks.request(receiptKey, deliver);
        } else {
            await deliver();
        }
    }

    function _timeToMinutes(value) {
        if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
        const [hours, minutes] = value.split(':').map(Number);
        return (hours * 60) + minutes;
    }

    async function _showReminderNotification(title, options, scope) {
        if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
            return false;
        }

        try {
            const registration = 'serviceWorker' in navigator
                ? await navigator.serviceWorker.getRegistration()
                : null;

            if (activeUserId !== scope) return false;
            if (registration?.showNotification) {
                await registration.showNotification(title, options);
            } else {
                new Notification(title, options);
            }
            return true;
        } catch (error) {
            console.warn('HabitArc: reminder notification could not be displayed.', error);
            return false;
        }
    }

    async function checkReminderSchedule() {
        if (reminderCheckRunning) return;

        const preferences = getReminderPreferences();
        if (!preferences.supported || preferences.permission !== 'granted') return;
        if (!preferences.dailyReminder && !preferences.weeklySummary &&
            !preferences.taskAlerts && !preferences.morningPlan) return;

        reminderCheckRunning = true;
        try {
            const now = new Date();
            const nowMinutes = (now.getHours() * 60) + now.getMinutes();
            const today = _today();

            if (preferences.dailyReminder) {
                const dayName = _getDayName(today);
                const todayHabits = getHabits().filter((habit) =>
                    (!habit.repeat || habit.repeat.includes(dayName))
                    && !Boolean(habit.completions?.[today])
                );

                for (const habit of todayHabits) {
                    const reminderMinutes = _timeToMinutes(habit.reminder);
                    const isDue = reminderMinutes !== null
                        && nowMinutes >= reminderMinutes
                        && nowMinutes <= reminderMinutes + 1;
                    if (!isDue || _hasReminderReceipt('habit', habit.id, today)) continue;

                    await _deliverReminder('habit', habit.id, today, `Time for ${habit.name}`, {
                        body: 'A small step now keeps your HabitArc moving.',
                        icon: '/logo.png',
                        badge: '/logo.png',
                        tag: `habit-${habit.id}-${today}`,
                        renotify: false,
                        data: { url: '/Dashboard.html' }
                    });
                }
            }

            // Local task reminders. Tasks have a due DATE, not a due time:
            // show a daily digest instead of falsely claiming timed deadline alerts.
            // Browser/PWA must be running; background pushes need a server.
            if (preferences.taskAlerts || preferences.morningPlan) {
                let tasks = [];
                try {
                    const module = await import('./task-store.js');
                    module.taskStore.start();
                    if (module.taskStore.getStatus().owner === (activeUserId || 'local')) {
                        tasks = module.taskStore.getTasks().filter(task => !task.completed);
                    }
                } catch (error) {
                    console.warn('HabitArc: task reminder unavailable', error);
                }
                const overdue = tasks.filter(task => task.dueDate && task.dueDate < today).length;
                const dueToday = tasks.filter(task => task.dueDate === today).length;
                const tomorrow = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
                const tomorrowKey = [tomorrow.getFullYear(),String(tomorrow.getMonth()+1).padStart(2,'0'),String(tomorrow.getDate()).padStart(2,'0')].join('-');
                const dueTomorrow = tasks.filter(task => task.dueDate === tomorrowKey).length;
                if (preferences.morningPlan && nowMinutes >= 8*60
                    && !_hasReminderReceipt('planner','morning',today)) {
                    const habitsToday = getTodayHabits();
                    await _deliverReminder('planner','morning',today,'Your HabitArc daily plan', {
                        body: habitsToday.length+' habits scheduled · '+dueToday+' tasks due today.',
                        icon:'/logo.png',badge:'/logo.png',tag:'daily-plan-'+today,
                        renotify:false,data:{url:'/Habits.html'}
                    });
                }
                if (preferences.taskAlerts && nowMinutes >= 9*60 &&
                    (dueToday || overdue || dueTomorrow) && !_hasReminderReceipt('tasks','digest',today)) {
                    await _deliverReminder('tasks','digest',today,'Tasks need your attention', {
                        body:dueToday+' due today · '+overdue+' overdue · '+dueTomorrow+' due tomorrow. Open Plan.',
                        icon:'/logo.png',badge:'/logo.png',tag:'task-digest-'+today,
                        renotify:false,data:{url:'/Habits.html'}
                    });
                }
            }

            // A lightweight weekly check-in: Sunday at 6 PM local time, only
            // while the app is open and only once for the current week.
            const isWeeklyWindow = now.getDay() === 0 && nowMinutes >= 1080 && nowMinutes <= 1081;
            if (preferences.weeklySummary && isWeeklyWindow && !_hasReminderReceipt('weekly', 'summary', today)) {
                const weeklyRate = getOverallCompletionRate(7);
                await _deliverReminder('weekly', 'summary', today, 'Your HabitArc weekly check-in', {
                    body: `You completed ${weeklyRate}% of your scheduled habits this week.`,
                    icon: '/logo.png',
                    badge: '/logo.png',
                    tag: `weekly-summary-${today}`,
                    renotify: false,
                    data: { url: '/Insights.html' }
                });
            }
        } finally {
            reminderCheckRunning = false;
        }
    }

    function _startReminderScheduler() {
        if (reminderSchedulerStarted || typeof window === 'undefined') return;
        reminderSchedulerStarted = true;
        void checkReminderSchedule();
        window.setInterval(() => void checkReminderSchedule(), REMINDER_CHECK_INTERVAL_MS);
    }

    function startReminderScheduler() {
        _startReminderScheduler();
    }

    function isOnboardingComplete() {
        return Boolean(_getData().onboardingComplete);
    }

    // ─── Theme ──────────────────────────────────────
    function getTheme() {
        const s = getSettings();
        if (s.theme && (s.cleanThemeChosen || !['light', 'dark'].includes(s.theme))) {
            return s.theme;
        }
        if (s.theme === 'dark' && s.cleanThemeChosen) {
            return 'dark';
        }
        return 'light';
    }

    function setTheme(theme) {
        updateSettings({ theme, rpgThemeChosen: true, cleanThemeChosen: true });
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
        
        const styleTag = document.getElementById('habitarc-theme-styles');
        if (styleTag) styleTag.remove();

        html.classList.remove('dark', 'light');
        if (['dark', 'midnight', 'purple', 'forest', 'ocean', 'sunset'].includes(theme)) {
            html.classList.add('dark');
        } else {
            html.classList.add('light');
        }
        html.setAttribute('data-theme', theme);
    }

    // ─── Export ─────────────────────────────────────
    function exportCSV() {
        const habits = getHabits();
        const earliest = habits.reduce((min, h) => h.createdAt < min ? h.createdAt : min, _today());
        const dates = _dateRange(earliest, _today());

        const csvCell = (value) => {
            let text = String(value ?? '');
            if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
        };
        let csv = ['Date', ...habits.map(h => csvCell(h.name))].join(',') + '\n';

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
        const currentData = _getData();
        Object.keys(currentData.completionHistory || {}).forEach((recordId) => {
            _queueCompletionHistoryOperation(recordId, 'delete');
        });

        const resetData = _createInitialData();
        Object.keys(resetData.completionHistory || {}).forEach((recordId) => {
            _queueCompletionHistoryOperation(recordId, 'upsert');
        });
        _removeStorageValue(`habitarc_streak_celebrated_${activeUserId || 'local'}`);
        _save(resetData);
    }

    // ─── Restore (merge-only; never replace the local account) ──────
    function restoreArchiveHabits(snapshot, { includeSettings = false } = {}) {
        if (!snapshot || !Array.isArray(snapshot.habits) || typeof snapshot !== 'object') {
            throw new Error('Backup habit records are invalid.');
        }
        const data = _getData();
        const incoming = snapshot.habits.filter(h =>
            h && typeof h.id === 'string' && h.id.length <= 90 &&
            typeof h.name === 'string' && h.name.length <= 160
        );
        if (incoming.length !== snapshot.habits.length) throw new Error('Invalid habit fields in backup.');
        const known = new Set(data.habits.map(h => h.id));
        const toAdd = incoming.filter(h => !known.has(h.id));
        if (data.habits.length + toAdd.length > 20) throw new Error('Restore would exceed the 20-habit limit. Remove duplicates from the source backup first.');
        const records = snapshot.completionHistory && typeof snapshot.completionHistory === 'object'
            && !Array.isArray(snapshot.completionHistory) ? snapshot.completionHistory : {};
        let addedRecords = 0;
        for (const [id, record] of Object.entries(records)) {
            if (id.length > 180 || !record || typeof record !== 'object') continue;
            if (typeof record.habitId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')) continue;
            if (!['completed','not_completed'].includes(record.status)) continue;
            if (data.completionHistory[id]) continue;
            data.completionHistory[id] = {
                id, habitId:record.habitId, date:record.date, status:record.status,
                completedAt:record.completedAt || null, updatedAt:record.updatedAt || new Date().toISOString()
            };
            _queueCompletionHistoryOperation(id,'upsert');
            addedRecords++;
        }
        data.habits.push(...toAdd.map(h => _cloneData(h)));
        if (includeSettings && snapshot.settings && typeof snapshot.settings === 'object') {
            const allowed = ['theme','goalDuration','startWeekOn','defaultReminderTime','userName','userBio','dailyReminder','weeklySummary'];
            for (const key of allowed) if (Object.hasOwn(snapshot.settings,key)) data.settings[key] = snapshot.settings[key];
        }
        _save(data);
        return { habits:toAdd.length, completions:addedRecords };
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

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
            'Wellness':    { bg: 'bg-primary-fixed/20',    text: 'text-primary-container', iconFill: true },
            'General':     { bg: 'bg-surface-container',   text: 'text-on-surface-variant', iconFill: false }
        };
        return styles[category] || styles['General'];
    }

    function getHabitAccentColor(habit) {
        return _normaliseHabitAccent(habit?.accentColor, habit?.category);
    }

    // ─── 365-Day Contribution Heatmap (Option 5) ────
    function get365DayHeatmap() {
        const habits = getHabits();
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 364);

        const dates = _dateRange(_localDateKey(startDate), _localDateKey(endDate));
        
        let maxDailyCompletions = 1;
        const dailyCounts = {};

        dates.forEach(d => {
            let count = 0;
            habits.forEach(h => {
                if (h.completions && h.completions[d]) count++;
            });
            dailyCounts[d] = count;
            if (count > maxDailyCompletions) maxDailyCompletions = count;
        });

        return dates.map(d => {
            const count = dailyCounts[d] || 0;
            let level = 0;
            if (count > 0) {
                const ratio = count / Math.max(1, maxDailyCompletions);
                if (ratio > 0.75) level = 4;
                else if (ratio > 0.5) level = 3;
                else if (ratio > 0.25) level = 2;
                else level = 1;
            }
            return { date: d, count, level };
        });
    }

    // ─── Gamification & Badges Engine (Option 5) ─────
    function getBadges() {
        const habits = getHabits();
        const streak = getOverallCurrentStreak();
        const longestStreak = getOverallLongestStreak();
        const totalCompletions = habits.reduce((acc, h) => {
            return acc + (h.completions ? Object.keys(h.completions).length : 0);
        }, 0);

        const rate = getOverallCompletionRate();

        return [
            {
                id: 'first_arc',
                title: 'First Arc',
                description: 'Completed your very first habit',
                icon: 'auto_awesome',
                category: 'Starter',
                unlocked: totalCompletions >= 1,
                progress: Math.min(100, (totalCompletions / 1) * 100)
            },
            {
                id: 'streak_7',
                title: '7-Day Streak',
                description: 'Maintained a 7-day habit streak',
                icon: 'local_fire_department',
                category: 'Streak',
                unlocked: longestStreak >= 7 || streak >= 7,
                progress: Math.min(100, (Math.max(streak, longestStreak) / 7) * 100)
            },
            {
                id: 'streak_30',
                title: '30-Day Master',
                description: 'Reached an impressive 30-day streak',
                icon: 'bolt',
                category: 'Streak',
                unlocked: longestStreak >= 30 || streak >= 30,
                progress: Math.min(100, (Math.max(streak, longestStreak) / 30) * 100)
            },
            {
                id: 'century_club',
                title: '100 Club',
                description: 'Logged 100 habit completions',
                icon: 'military_tech',
                category: 'Milestone',
                unlocked: totalCompletions >= 100,
                progress: Math.min(100, (totalCompletions / 100) * 100)
            },
            {
                id: 'mindful_soul',
                title: 'Mindful Soul',
                description: 'Created 3 or more habits in your arc',
                icon: 'self_improvement',
                category: 'Growth',
                unlocked: habits.length >= 3,
                progress: Math.min(100, (habits.length / 3) * 100)
            },
            {
                id: 'consistency_king',
                title: 'Consistency Legend',
                description: 'Achieved an overall completion rate > 75%',
                icon: 'workspace_premium',
                category: 'Mastery',
                unlocked: rate >= 75,
                progress: Math.min(100, (rate / 75) * 100)
            }
        ];
    }

    // ─── Firebase Auth & Cloud Sync ─────────────────
    function _clearCloudSubscription() {
        if (cloudUnsubscribe) {
            cloudUnsubscribe();
            cloudUnsubscribe = null;
        }
        if (cloudSaveTimer) {
            window.clearTimeout(cloudSaveTimer);
            cloudSaveTimer = null;
        }
        if (cloudRetryTimer) {
            window.clearTimeout(cloudRetryTimer);
            cloudRetryTimer = null;
        }
        cloudSyncReady = false;
    }

    async function _persistPendingCompletionHistory(user) {
        const operations = _getPendingCompletionHistoryOperations(user.uid);
        if (Object.keys(operations).length === 0) return;

        // Resolve the latest local snapshot immediately before the cloud write
        // so a completion made while an earlier save was in flight is never
        // dropped from the history queue.
        const latestHistory = _normaliseData(_getData()).completionHistory;
        const upserts = [];
        const deletions = [];

        Object.entries(operations).forEach(([recordId, operation]) => {
            if (operation === 'delete' || !latestHistory[recordId]) {
                deletions.push(recordId);
                return;
            }
            upserts.push(latestHistory[recordId]);
        });

        await cloudClient.saveCompletionHistory({ upserts, deletions }, user);

        // Do not clear a newer action for the same habit-day. A completion
        // immediately followed by an undo has the same queue operation type
        // but a different `updatedAt` value.
        const currentOperations = _getPendingCompletionHistoryOperations(user.uid);
        const currentHistory = _normaliseData(_getData()).completionHistory;
        const remainingOperations = { ...currentOperations };

        upserts.forEach((record) => {
            if (
                remainingOperations[record.id] === 'upsert' &&
                _stableSerialize(currentHistory[record.id]) === _stableSerialize(record)
            ) {
                delete remainingOperations[record.id];
            }
        });
        deletions.forEach((recordId) => {
            if (remainingOperations[recordId] === 'delete' && !currentHistory[recordId]) {
                delete remainingOperations[recordId];
            }
        });
        _writePendingCompletionHistoryOperations(remainingOperations, user.uid);
    }

    async function _persistUserData(data, user) {
        const snapshot = _normaliseData(data);
        // Completion history is the authoritative source for an undo. Write
        // it first so a second open browser never briefly replays an older
        // `habit.completions` map while the history update is still in flight.
        await _persistPendingCompletionHistory(user);
        await cloudClient.saveUserData(snapshot, user);

        // Do not clear the durable dirty marker if the user made another edit
        // while this write was in flight. The next debounced save will carry it.
        if (
            activeUserId === user.uid &&
            _sameData(_getData(), snapshot) &&
            !_hasPendingCompletionHistory(user.uid)
        ) {
            _clearPendingLocalSync(user.uid);
        }
        window.dispatchEvent(new CustomEvent('habitarc:sync-status-changed'));
    }

    function _scheduleCloudRetry(user) {
        if (
            !user?.uid ||
            user.uid !== cloudActivatedUserId ||
            cloudRetryTimer ||
            cloudHydratingUserId === user.uid ||
            cloudRetryAttempts >= CLOUD_RETRY_DELAYS.length
        ) return;

        const retryDelay = CLOUD_RETRY_DELAYS[cloudRetryAttempts];
        cloudRetryAttempts += 1;
        cloudRetryTimer = window.setTimeout(() => {
            cloudRetryTimer = null;
            if (user.uid === cloudActivatedUserId) {
                void _hydrateCloudUser(user);
            }
        }, retryDelay);
    }

    function _activateScopedStorage(userId) {
        const nextStorageKey = `${USER_STORAGE_PREFIX}${userId}`;
        const storageChanged = activeStorageKey !== nextStorageKey;
        activeUserId = userId;
        activeStorageKey = nextStorageKey;

        if (_loadStorageData(activeStorageKey)) return storageChanged;

        const legacyData = _loadStorageData(STORAGE_KEY);
        const legacyOwner = _readStorageValue(LEGACY_MIGRATION_OWNER_KEY);
        const canClaimLegacyData = legacyData && (!legacyOwner || legacyOwner === userId);
        const initialData = canClaimLegacyData ? legacyData : _createInitialData();
        const legacyHadPendingChanges = canClaimLegacyData && _hasPendingLocalSync(null);
        const legacyCompletionHistoryOperations = canClaimLegacyData
            ? _getPendingCompletionHistoryOperations(null)
            : {};

        _writeStorageData(activeStorageKey, initialData);
        if (canClaimLegacyData && !legacyOwner) {
            _writeStorageValue(LEGACY_MIGRATION_OWNER_KEY, userId);
        }
        if (legacyHadPendingChanges) {
            _markPendingLocalSync(userId);
            _clearPendingLocalSync(null);
        }
        if (Object.keys(legacyCompletionHistoryOperations).length > 0) {
            const scopedOperations = _getPendingCompletionHistoryOperations(userId);
            _writePendingCompletionHistoryOperations({
                ...legacyCompletionHistoryOperations,
                ...scopedOperations
            }, userId);
            _writePendingCompletionHistoryOperations({}, null);
        }

        return storageChanged;
    }

    function _isProtectedAppPage() {
        const pageName = window.location.pathname.split('/').pop()?.toLowerCase() || '';
        return !['', 'index.html', 'onboarding.html', 'leaderboard.html'].includes(pageName);
    }

    function _handleSignedOutState() {
        _clearCloudSubscription();
        cloudActivatedUserId = null;
        activeUserId = null;
        activeStorageKey = STORAGE_KEY;
        _removeStorageValue(ACTIVE_USER_KEY);
        _emitDataChange('signed-out', true);

        if (_isProtectedAppPage()) {
            window.location.replace('Onboarding.html');
        }
    }

    async function _hydrateCloudUser(user) {
        const userId = user.uid;
        if (cloudHydratingUserId === userId) return;
        cloudHydratingUserId = userId;
        let retryAfterFailure = false;

        try {
            // Resolve the current local snapshot before the network request.
            // If the user changes data while Firestore is loading, that newer
            // local edit wins rather than being replaced by a stale snapshot.
            _getData();
            const mutationRevisionAtStart = localMutationRevision;
            const remoteSnapshot = await cloudClient.loadUserData(user);
            if (cloudActivatedUserId !== userId || activeUserId !== userId) return;

            const localChangedDuringHydration = localMutationRevision !== mutationRevisionAtStart;
            const localDataNeedsUpload = localChangedDuringHydration || _hasPendingLocalSync(userId);

            if (remoteSnapshot.exists && !localDataNeedsUpload) {
                const remoteData = _normaliseData(remoteSnapshot.data);
                if (!_sameData(remoteData, _getData())) {
                    cloudApplyingRemoteData = true;
                    try {
                        _save(remoteData, { source: 'cloud', initial: true });
                        _clearPendingLocalSync(userId);
                        applyTheme();
                    } finally {
                        cloudApplyingRemoteData = false;
                    }
                }

                // Existing users may have pre-history completion maps from
                // the first cloud-sync version. Backfill those once into the
                // new per-day collection without changing their visible data.
                _queueMissingCompletionHistoryRecords(
                    _getData(),
                    remoteSnapshot.data?.completionHistory,
                    userId
                );
            } else {
                // A new account starts by backing up its local onboarding
                // state. A local mutation made during hydration is also sent
                // first so it cannot be overwritten by an older cloud copy.
                _queueMissingCompletionHistoryRecords(
                    _getData(),
                    remoteSnapshot.data?.completionHistory,
                    userId
                );
                await _persistUserData(_getData(), user);
            }

            if (cloudActivatedUserId !== userId || activeUserId !== userId) return;

            cloudSyncReady = true;
            cloudRetryAttempts = 0;
            window.dispatchEvent(new CustomEvent('habitarc:sync-status-changed'));
            cloudUnsubscribe = cloudClient.subscribeToUserData(
                (remoteSnapshot) => {
                    if (cloudActivatedUserId !== userId || activeUserId !== userId || !remoteSnapshot.exists) return;

                    // A local action is waiting to be written. Keep it as the
                    // last writer instead of replacing it with an older
                    // realtime snapshot that arrived first.
                    if (_hasPendingLocalSync(userId)) {
                        _scheduleCloudSave();
                        return;
                    }

                    const remoteData = _normaliseData(remoteSnapshot.data);
                    if (_sameData(remoteData, _getData())) return;

                    cloudApplyingRemoteData = true;
                    try {
                        _save(remoteData, { source: 'cloud', initial: false });
                        applyTheme();
                    } finally {
                        cloudApplyingRemoteData = false;
                    }
                },
                (error) => {
                    if (cloudActivatedUserId !== userId) return;
                    _clearCloudSubscription();
                    console.warn('HabitArc: Cloud sync is unavailable. Local data remains available on this device.', error);
                    _emitCloudSyncError(error);
                    _scheduleCloudRetry(user);
                },
                user
            );

            // If the user completed onboarding while the initial cloud read
            // was in flight, send that newer local state too.
            _scheduleCloudSave();
        } catch (error) {
            if (cloudActivatedUserId !== userId) return;
            cloudSyncReady = false;
            console.warn('HabitArc: Cloud sync could not start. Local data remains available on this device.', error);
            _emitCloudSyncError(error);
            retryAfterFailure = true;
        } finally {
            if (cloudHydratingUserId === userId) {
                cloudHydratingUserId = null;
            }
            if (retryAfterFailure && cloudActivatedUserId === userId) {
                _scheduleCloudRetry(user);
            }
        }
    }

    function _handleSignedInState(user) {
        if (!user?.uid) {
            _handleSignedOutState();
            return;
        }
        if (cloudActivatedUserId === user.uid) {
            if (!cloudSyncReady && !cloudRetryTimer && cloudHydratingUserId !== user.uid) {
                void _hydrateCloudUser(user);
            }
            return;
        }

        _clearCloudSubscription();
        cloudActivatedUserId = user.uid;
        const storageChanged = _activateScopedStorage(user.uid);
        _emitDataChange('user-cache', storageChanged);
        void _hydrateCloudUser(user);
    }

    function _initializeAuthAndCloudSync() {
        authReadyPromise = import('./firebase-auth.js')
            .then(() => window.HabitArcAuthReady)
            .then(async (authClient) => {
                cloudClient = authClient;
                await authClient.waitForInitialAuthState();
                authClient.subscribe((user) => {
                    if (user) {
                        _handleSignedInState(user);
                    } else {
                        _handleSignedOutState();
                    }
                });
                return authClient;
            })
            .catch((error) => {
                // Authentication remains optional for local development and
                // the app deliberately keeps its local cache usable here.
                console.warn('HabitArc: Firebase could not be initialized. Continuing with local data.', error);
                return null;
            });

        window.addEventListener('online', () => {
            const user = cloudClient?.getCurrentUser?.();
            if (!user || user.uid !== cloudActivatedUserId) return;

            if (cloudSyncReady) {
                if (_hasPendingLocalSync(user.uid) || _hasPendingCompletionHistory(user.uid)) {
                    _scheduleCloudSave();
                }
                return;
            }

            cloudRetryAttempts = 0;
            _scheduleCloudRetry(user);
        });
    }

    function getAuthUser() {
        return cloudClient?.getPublicUser?.() || window.HabitArcAuth?.getPublicUser?.() || null;
    }

    async function whenAuthReady() {
        const authClient = await authReadyPromise;
        if (!authClient) return null;

        await authClient.waitForInitialAuthState();
        return authClient.getPublicUser();
    }

    async function signOutUser() {
        const authClient = await authReadyPromise;
        if (!authClient) {
            throw new Error('Authentication is not available right now.');
        }
        // On shared Android devices, stop this account's browser push before
        // switching identities. Cloud record removal is best-effort offline.
        try {
            if (localStorage.getItem('habitarc_push_device_owner')) {
                await Promise.race([
                    import('./push-subscriptions.js').then(mod=>mod.disableBackgroundPush()).catch(()=>{}),
                    new Promise(resolve=>window.setTimeout(resolve,1800))
                ]);
            }
        } catch {}
        await authClient.signOut();
    }

    async function getAuthToken(forceRefresh = false) {
        const authClient = await authReadyPromise;
        if (!authClient?.getIdToken) {
            throw new Error('Secure sign-in is not available right now.');
        }

        return authClient.getIdToken(forceRefresh);
    }

    function getCloudSyncStatus() {
        return {
            signedIn: Boolean(getAuthUser()),
            connected: cloudSyncReady,
            userId: activeUserId,
            pendingCompletionHistory: _hasPendingCompletionHistory(),
            pendingChanges: _hasPendingLocalSync() || _hasPendingCompletionHistory()
        };
    }

    // The Coach reads Firestore, so explicitly flush this device's pending
    // changes first. Never silently answer using stale cloud history.
    async function flushCloudSync() {
        const member = await whenAuthReady();
        const uid = member?.uid;
        if (!uid || member.isAnonymous) throw new Error('Sign in before syncing your Coach context.');
        if (!cloudSyncReady || uid !== activeUserId) {
            throw new Error('Your habits are still connecting to the cloud. Wait a moment and try again.');
        }
        if (cloudSaveTimer) { window.clearTimeout(cloudSaveTimer); cloudSaveTimer = null; }
        const operation = cloudSaveChain.catch(() => undefined).then(async () => {
            for (let attempt = 0; attempt < 3; attempt++) {
                const user = cloudClient?.getCurrentUser?.();
                if (user?.uid !== uid || activeUserId !== uid || !cloudSyncReady) {
                    throw new Error('Your account changed. Sign in and try again.');
                }
                if (!_hasPendingLocalSync(uid) && !_hasPendingCompletionHistory(uid)) return;
                await _persistUserData(_getData(), user);
            }
            if (_hasPendingLocalSync(uid) || _hasPendingCompletionHistory(uid)) {
                throw new Error('Your latest changes are still syncing. Please try again shortly.');
            }
        });
        cloudSaveChain = operation.catch(error => { _emitCloudSyncError(error); });
        await operation;
        if (activeUserId !== uid) throw new Error('Your account changed. Please try again.');
    }

    _initializeAuthAndCloudSync();

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
        getCompletionHistory,

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

        // Insights & Heatmap
        getBestHabit,
        getWeakestHabit,
        getConsistencyScore,
        getBestDay,
        get365DayHeatmap,
        getBadges,

        // Calendar
        getCalendarData,
        getMonthlyActivity,

        // Settings
        getSettings,
        updateSettings,
        isOnboardingComplete,
        getTheme,
        setTheme,
        toggleTheme,
        applyTheme,

        // Authentication & sync
        getAuthUser,
        whenAuthReady,
        signOut: signOutUser,
        getAuthToken,
        getCloudSyncStatus,
        flushCloudSync,

        // Notifications
        getReminderPreferences,
        setReminderPreferences,
        requestNotificationPermission,
        checkReminderSchedule,
        startReminderScheduler,

        // Audio
        playCompletionSound,

        // Export / Reset
        restoreArchiveHabits,
        exportCSV,
        resetAllData,

        // Utilities
        getGreeting,
        getFormattedToday,
        escapeHTML,
        getCategoryStyle,
        getHabitAccentColor,
        today: _today
    };
})();
if (typeof window !== 'undefined') window.HabitArc = HabitArc;

// Apply theme & update header streak/profile controls cleanly on load
function _syncHeaderChrome() {
    if (typeof document.querySelectorAll !== 'function') return;
    try {
        const streak = HabitArc.getOverallCurrentStreak() || 0;
        const mobileEl = document.getElementById('header-streak-count');
        const webEl = document.getElementById('header-streak-count-web');
        if (mobileEl) mobileEl.textContent = `${streak}d`;
        if (webEl) webEl.textContent = `${streak} Day Streak`;
    } catch (e) {
        console.warn('Header streak calculation deferred:', e);
    }

    const user = HabitArc.getAuthUser?.();
    const settings = HabitArc.getSettings?.() || {};
    const displayName = (user?.displayName || settings.userName || '').trim();
    const initial = displayName ? displayName[0].toUpperCase() : '';
    const photoUrl = typeof user?.photoURL === 'string' && /^https?:\/\//i.test(user.photoURL) ? user.photoURL : '';

    document.querySelectorAll('body > header a.ha-hdr-profile[href="Profile.html"]').forEach(link => {
        link.setAttribute('aria-label', displayName ? `${displayName}'s profile` : 'Profile');
        link.innerHTML = '';
        if (photoUrl) {
            const img = document.createElement('img');
            img.className = 'ha-hdr-profile-img';
            img.src = photoUrl;
            img.alt = '';
            img.referrerPolicy = 'no-referrer';
            img.addEventListener('error', () => {
                link.textContent = initial || '';
                if (!initial) {
                    const fallback = document.createElement('span');
                    fallback.className = 'material-symbols-outlined text-[18px]';
                    fallback.setAttribute('aria-hidden', 'true');
                    fallback.textContent = 'person';
                    link.appendChild(fallback);
                }
            }, { once: true });
            link.appendChild(img);
        } else if (initial) {
            link.textContent = initial;
        } else {
            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined text-[18px]';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = 'person';
            link.appendChild(icon);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    HabitArc.applyTheme();
    // The scheduler itself checks opt-in and permission. Starting it here also
    // handles preferences arriving later through cloud hydration, without prompts.
    HabitArc.startReminderScheduler();
    _syncHeaderChrome();
});
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('habitarc:data-changed', _syncHeaderChrome);
    window.addEventListener('habitarc-auth-state-changed', _syncHeaderChrome);
}

// Pages receive `habitarc:data-changed` when authentication or cloud hydration
// changes their cache. Individual pages can re-render the affected UI without
// reloading the document. Reloading here caused a loop whenever Firestore
// returned semantically identical data with a different field/document order.

// ─── Cross-page accessibility and PWA helpers ────────────────────────────
// These helpers deliberately live outside the data layer: every static page
// loads app.js, so focus visibility, reduced-motion support, and installation
// state stay consistent without duplicating per-page snippets.
(function initialiseHabitArcShell() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const reducedMotionStyleId = 'habitarc-accessibility-styles';
    const liveRegionId = 'habitarc-live-region';
    let deferredInstallPrompt = null;
    let pwaInstalled = window.matchMedia?.('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    function emitPWAStateChange() {
        window.dispatchEvent(new CustomEvent('habitarc:pwa-state-changed', {
            detail: getPWAInstallState()
        }));
    }

    function getPWAInstallState() {
        const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
        return {
            available: Boolean(deferredInstallPrompt),
            installed: Boolean(pwaInstalled),
            isIOS,
            instructions: isIOS && !pwaInstalled
                ? 'In Safari, use Share, then choose Add to Home Screen.'
                : ''
        };
    }

    async function promptPWAInstall() {
        if (!deferredInstallPrompt) {
            return { outcome: 'unavailable', ...getPWAInstallState() };
        }

        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        emitPWAStateChange();
        return { outcome: choice?.outcome || 'dismissed', ...getPWAInstallState() };
    }

    function announce(message, priority = 'polite') {
        const region = document.getElementById(liveRegionId);
        if (!region || !message) return;
        region.setAttribute('aria-live', priority === 'assertive' ? 'assertive' : 'polite');
        region.textContent = '';
        window.setTimeout(() => { region.textContent = String(message); }, 40);
    }

    function installAccessibilityUtilities() {
        if (!document.getElementById(reducedMotionStyleId)) {
            const style = document.createElement('style');
            style.id = reducedMotionStyleId;
            style.textContent = `
                :where(a:not([href="Add_Habit.html"]), button, input, select, textarea, summary, [role="button"]):focus-visible {
                    outline: 3px solid #10b981 !important;
                    outline-offset: 3px !important;
                }
                header a[href="Add_Habit.html"]:focus-visible,
                nav.fixed > a[href="Add_Habit.html"]:focus-visible > div {
                    outline: 3px solid #10b981 !important;
                    outline-offset: 3px !important;
                }
                .toggle-checkbox:focus-visible + .toggle-label {
                    outline: 3px solid #10b981;
                    outline-offset: 3px;
                }
                @media (prefers-reduced-motion: reduce) {
                    *, *::before, *::after {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        scroll-behavior: auto !important;
                        transition-duration: 0.01ms !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        if (!document.getElementById(liveRegionId)) {
            const region = document.createElement('div');
            region.id = liveRegionId;
            region.setAttribute('role', 'status');
            region.setAttribute('aria-live', 'polite');
            region.setAttribute('aria-atomic', 'true');
            region.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
            document.body.appendChild(region);
        }
    }

    window.HabitArcUI = Object.freeze({
        announce,
        getPWAInstallState,
        promptPWAInstall
    });

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        emitPWAStateChange();
    });

    window.addEventListener('appinstalled', () => {
        pwaInstalled = true;
        deferredInstallPrompt = null;
        announce('HabitArc is installed on this device.');
        emitPWAStateChange();
    });

    document.addEventListener('DOMContentLoaded', () => {
        installAccessibilityUtilities();
    });
})();
