/**
 * HabitArc ChatGPT-style multi-thread AI chat store and two-way merge helpers.
 * Keeps persistence self-contained, bounded, and safe for both device localStorage
 * and per-account Firestore sync.
 */

export const CHAT_LIST_PREFIX = 'habitarc_arc_chats:';
export const ACTIVE_CHAT_PREFIX = 'habitarc_arc_active_chat:';
export const LEGACY_THREAD_PREFIX = 'habitarc_arc_thread:';
export const MAX_LOCAL_CHATS = 30;
export const MAX_LOCAL_TURNS = 20;
export const MAX_CLOUD_CHATS = 15;
export const MAX_CLOUD_TURNS = 12;
const MAX_TOMBSTONES = 30;
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readKey(storage, key) {
    try { return storage ? storage.getItem(key) : null; } catch { return null; }
}

function writeKey(storage, key, value) {
    if (!storage) return false;
    try {
        storage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function removeKey(storage, key) {
    if (!storage) return;
    try { storage.removeItem(key); } catch { /* Ignore private storage failure */ }
}

export function generateArcChatId(nowMs = Date.now()) {
    const timePart = Number(nowMs || Date.now()).toString(36);
    const randPart = Math.random().toString(36).slice(2, 8);
    return `chat_${timePart}_${randPart}`;
}

export function sanitizeArcChatId(id) {
    const text = String(id || '').trim();
    if (!text || !/^[a-zA-Z0-9_-]{3,48}$/.test(text)) return '';
    return text;
}

export function deriveArcChatTitle(question, fallbackTitle = 'New Chat') {
    const clean = String(question || '').replace(/\s+/g, ' ').trim();
    if (!clean) return String(fallbackTitle || 'New Chat').slice(0, 60);
    return clean.length > 58 ? clean.slice(0, 57).trimEnd() + '…' : clean;
}

function sanitizeSnapshot(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const nums = [raw.habitCount, raw.totalScheduled, raw.totalLogged];
    if (!nums.every(Number.isSafeInteger)) return null;
    return {
        habitCount: raw.habitCount,
        totalScheduled: raw.totalScheduled,
        totalLogged: raw.totalLogged,
    };
}

function sanitizePlainAction(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') return null;
    try {
        const serialized = JSON.stringify(raw);
        if (!serialized || serialized.length > 2400) return null;
        return JSON.parse(serialized);
    } catch {
        return null;
    }
}

export function sanitizeArcTurn(raw, { maxAnswerChars = 4000 } = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const question = typeof raw.question === 'string' ? raw.question.trim().slice(0, 600) : '';
    const answer = typeof raw.answer === 'string' ? raw.answer.trim().slice(0, maxAnswerChars) : '';
    if (!question || !answer) return null;
    const timestamp = Number.isFinite(raw.timestamp) && raw.timestamp > 0 ? Math.trunc(raw.timestamp) : Date.now();
    return { question, answer, timestamp };
}

export function sanitizeArcChatThread(raw, { forCloud = false } = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const id = sanitizeArcChatId(raw.id);
    if (!id) return null;
    const updatedAt = Number.isFinite(raw.updatedAt) && raw.updatedAt > 0 ? Math.trunc(raw.updatedAt) : Date.now();
    const createdAt = Number.isFinite(raw.createdAt) && raw.createdAt > 0
        ? Math.min(Math.trunc(raw.createdAt), updatedAt)
        : updatedAt;

    if (raw.deleted === true) {
        return { id, deleted: true, createdAt, updatedAt, turns: [] };
    }

    const maxTurns = forCloud ? MAX_CLOUD_TURNS : MAX_LOCAL_TURNS;
    const maxAnswerChars = forCloud ? 3000 : 4000;
    const rawTurns = Array.isArray(raw.turns) ? raw.turns : [];
    const turns = rawTurns
        .map(t => sanitizeArcTurn(t, { maxAnswerChars }))
        .filter(Boolean)
        .slice(-maxTurns);
    if (!turns.length) return null;

    const clean = {
        id,
        title: deriveArcChatTitle(raw.title || turns[0].question),
        createdAt,
        updatedAt,
        deleted: false,
        turns,
        lastEvidence: typeof raw.lastEvidence === 'string' ? raw.lastEvidence.slice(0, 300) : '',
        lastVerifiedSnapshot: sanitizeSnapshot(raw.lastVerifiedSnapshot),
        lastCasualGreeting: Boolean(raw.lastCasualGreeting),
        lastAction: sanitizePlainAction(raw.lastAction),
        lastActionApplied: Boolean(raw.lastActionApplied),
        lastActionAutoCreated: Boolean(raw.lastActionAutoCreated),
    };
    if (!forCloud) {
        clean.lastCreatedHabitId = typeof raw.lastCreatedHabitId === 'string' ? raw.lastCreatedHabitId.slice(0, 64) : '';
        clean.lastPrevHabitPatch = sanitizePlainAction(raw.lastPrevHabitPatch);
        clean.lastActionUndo = sanitizePlainAction(raw.lastActionUndo);
    }
    return clean;
}

export function mergeArcChats(localList = [], remoteList = [], { forCloud = false, nowMs = Date.now() } = {}) {
    const byId = new Map();
    const ingest = (items) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
            const clean = sanitizeArcChatThread(item, { forCloud });
            if (!clean) continue;
            const prev = byId.get(clean.id);
            if (!prev || clean.updatedAt > prev.updatedAt) {
                byId.set(clean.id, clean);
            } else if (clean.updatedAt === prev.updatedAt) {
                if (clean.deleted && !prev.deleted) {
                    byId.set(clean.id, clean);
                } else if (!clean.deleted && !prev.deleted && clean.turns.length > prev.turns.length) {
                    byId.set(clean.id, clean);
                }
            }
        }
    };
    ingest(localList);
    ingest(remoteList);

    const live = [];
    const tombstones = [];
    for (const thread of byId.values()) {
        if (thread.deleted) {
            if (nowMs - thread.updatedAt <= TOMBSTONE_TTL_MS) tombstones.push(thread);
        } else {
            live.push(thread);
        }
    }

    live.sort((a, b) => b.updatedAt - a.updatedAt);
    tombstones.sort((a, b) => b.updatedAt - a.updatedAt);

    const maxLive = forCloud ? MAX_CLOUD_CHATS : MAX_LOCAL_CHATS;
    return [
        ...live.slice(0, maxLive),
        ...tombstones.slice(0, MAX_TOMBSTONES),
    ];
}

export function sanitizeArcChatsForCloud(chats = [], nowMs = Date.now()) {
    return mergeArcChats([], chats, { forCloud: true, nowMs });
}

export function getLiveArcChats(chats = []) {
    return (Array.isArray(chats) ? chats : [])
        .filter(c => c && !c.deleted && Array.isArray(c.turns) && c.turns.length > 0)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function upsertArcChat(chats = [], thread, nowMs = Date.now()) {
    const clean = sanitizeArcChatThread({ ...thread, deleted: false, updatedAt: thread?.updatedAt || nowMs });
    if (!clean) return mergeArcChats(chats, [], { nowMs });
    return mergeArcChats(chats, [clean], { nowMs });
}

export function deleteArcChat(chats = [], chatId, nowMs = Date.now()) {
    const id = sanitizeArcChatId(chatId);
    if (!id) return mergeArcChats(chats, [], { nowMs });
    const existing = (Array.isArray(chats) ? chats : []).find(c => c && c.id === id);
    const createdAt = existing?.createdAt || nowMs;
    const tombstone = { id, deleted: true, createdAt, updatedAt: nowMs, turns: [] };
    return mergeArcChats(chats, [tombstone], { nowMs });
}

export function loadActiveArcChatId(uid, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    if (!uid || !storage) return '';
    return sanitizeArcChatId(readKey(storage, `${ACTIVE_CHAT_PREFIX}${uid}`));
}

export function saveActiveArcChatId(uid, chatId, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    if (!uid || !storage) return;
    const cleanId = sanitizeArcChatId(chatId);
    if (!cleanId) {
        removeKey(storage, `${ACTIVE_CHAT_PREFIX}${uid}`);
    } else {
        writeKey(storage, `${ACTIVE_CHAT_PREFIX}${uid}`, cleanId);
    }
}

export function loadLocalArcChats(uid, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    if (!uid || !storage) return { chats: [], migratedLegacyId: '' };
    let chats = [];
    try {
        const rawList = readKey(storage, `${CHAT_LIST_PREFIX}${uid}`);
        if (rawList) {
            const parsed = JSON.parse(rawList);
            chats = mergeArcChats([], Array.isArray(parsed) ? parsed : []);
        }
    } catch { /* Ignore corrupt storage */ }

    let migratedLegacyId = '';
    try {
        const legacyRaw = readKey(storage, `${LEGACY_THREAD_PREFIX}${uid}`);
        if (legacyRaw) {
            const legacyParsed = JSON.parse(legacyRaw);
            const validTurns = Array.isArray(legacyParsed?.turns)
                ? legacyParsed.turns.map(t => sanitizeArcTurn(t)).filter(Boolean)
                : [];
            if (validTurns.length) {
                const legacyId = sanitizeArcChatId(`legacy_${uid.slice(0, 14)}`) || generateArcChatId();
                const alreadyExists = chats.some(c => c.id === legacyId);
                if (!alreadyExists) {
                    const updatedAt = Number.isFinite(legacyParsed.updatedAt) ? legacyParsed.updatedAt : Date.now();
                    const migrated = sanitizeArcChatThread({
                        id: legacyId,
                        title: deriveArcChatTitle(validTurns[0].question),
                        createdAt: updatedAt,
                        updatedAt,
                        turns: validTurns,
                        lastEvidence: legacyParsed.lastEvidence,
                        lastVerifiedSnapshot: legacyParsed.lastVerifiedSnapshot,
                        lastCasualGreeting: legacyParsed.lastCasualGreeting,
                        lastAction: legacyParsed.lastAction,
                        lastActionApplied: legacyParsed.lastActionApplied,
                        lastActionAutoCreated: legacyParsed.lastActionAutoCreated,
                        lastCreatedHabitId: legacyParsed.lastCreatedHabitId,
                        lastPrevHabitPatch: legacyParsed.lastPrevHabitPatch,
                        lastActionUndo: legacyParsed.lastActionUndo,
                    });
                    if (migrated) {
                        chats = mergeArcChats(chats, [migrated]);
                        saveLocalArcChats(uid, chats, storage);
                        migratedLegacyId = legacyId;
                    }
                }
            }
            removeKey(storage, `${LEGACY_THREAD_PREFIX}${uid}`);
        }
    } catch { /* Ignore legacy migration issues */ }

    return { chats, migratedLegacyId };
}

export function saveLocalArcChats(uid, chats = [], storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    if (!uid || !storage) return [];
    const merged = mergeArcChats([], chats);
    const key = `${CHAT_LIST_PREFIX}${uid}`;
    if (writeKey(storage, key, JSON.stringify(merged))) {
        return merged;
    }
    // Quota-safe fallback: keep most recent 10 threads + tombstones.
    const compact = [
        ...getLiveArcChats(merged).slice(0, 10),
        ...merged.filter(c => c.deleted).slice(0, 10),
    ];
    writeKey(storage, key, JSON.stringify(compact));
    return compact;
}

export function groupArcChatsByRecency(chats = [], nowMs = Date.now()) {
    const live = getLiveArcChats(chats);
    const dayStart = (ts) => {
        const d = new Date(ts);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    const todayStart = dayStart(nowMs);
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

    const buckets = [
        { label: 'Today', items: [] },
        { label: 'Yesterday', items: [] },
        { label: 'Previous 7 Days', items: [] },
        { label: 'Earlier', items: [] },
    ];
    for (const chat of live) {
        const ts = Number(chat.updatedAt) || 0;
        if (ts >= todayStart) buckets[0].items.push(chat);
        else if (ts >= yesterdayStart) buckets[1].items.push(chat);
        else if (ts >= weekStart) buckets[2].items.push(chat);
        else buckets[3].items.push(chat);
    }
    return buckets.filter(b => b.items.length > 0);
}
