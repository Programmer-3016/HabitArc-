// Unified HabitArc AI Studio ([ Ask ARC / KAI ] Pill + Theme-Adaptive Constellation + Prompt-First Home +
// Full Saved Chats Drawer, Cloud Sync, Quests/Powers/Tones Drawer, Context Picker, Streaming & Undo Actions).
import {
  buildHabitCoachContext,
  cleanArcDisplayText,
  consumeArcCoachStream,
  createArcWordReveal,
  renderArcChatAnswer,
} from './habit-analytics.js';
import {
  MAX_LOCAL_TURNS,
  generateArcChatId,
  deriveArcChatTitle,
  getLiveArcChats,
  upsertArcChat,
  togglePinArcChat,
  renameArcChat,
  deleteArcChat,
  mergeArcChats,
  sanitizeArcChatsForCloud,
  loadLocalArcChats,
  saveLocalArcChats,
  loadActiveArcChatId,
  loadActiveArcChatMeta,
  saveActiveArcChatId,
  groupArcChatsByRecency,
} from './arc-chat-store.js';
import { mountArcContext } from './arc-context.js';
import { taskStore, newTask, localDay } from './task-store.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const HIDDEN_FAB_PAGES = new Set(['Arc_AI.html', 'Add_Habit.html', 'Onboarding.html', 'offline.html', 'privacy.html']);
const SUPPORTED_ACTION_TYPES = new Set([
  'create_habit',
  'update_habit',
  'delete_habit',
  'complete_habit',
  'create_task',
  'batch_update_habits',
]);

const BUDDY_FAB_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="7" y="1" width="2" height="2" fill="#47e393"/><rect x="4" y="4" width="8" height="1" fill="#ffffff"/><rect x="3" y="5" width="1" height="8" fill="#ffffff"/><rect x="12" y="5" width="1" height="8" fill="#ffffff"/><rect x="4" y="5" width="8" height="8" fill="#c5b6ff"/><rect x="5" y="7" width="2" height="2" fill="#121215"/><rect x="9" y="7" width="2" height="2" fill="#121215"/></svg>';
const BUDDY_STAGE_SVG = '<svg width="28" height="28" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect class="ha-arc-buddy-antenna" x="7" y="1" width="2" height="2"/><rect class="ha-arc-buddy-body" x="4" y="4" width="8" height="9"/><rect class="ha-arc-buddy-body" x="3" y="5" width="10" height="7"/><g class="ha-arc-buddy-eyes"><rect class="ha-arc-buddy-eye" x="5" y="7" width="2" height="2"/><rect class="ha-arc-buddy-eye" x="9" y="7" width="2" height="2"/></g></svg>';
const SEND_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const STOP_SVG = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2"/></svg>';
const BACK_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
const CHATS_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/><path d="M13 9h5M13 13h4"/></svg>';
const NEW_CHAT_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
const SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
const PLUS_SM_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const MORE_DOTS_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>';
const PIN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/></svg>';
const PEN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const TRASH_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';

let fab = null;
let dialog = null;
let panelEl = null;
let canvasEl = null;
let emptyHeroEl = null;
let headingEl = null;
let bodyEl = null;
let chipsEl = null;
let statusEl = null;
let lvlUpBannerEl = null;
let lvlUpTextEl = null;
let inputEl = null;
let sendBtn = null;
let plusBtn = null;
let plusLabelEl = null;
let contextHostEl = null;
let contextChipsEl = null;
let toneChipEl = null;
let newChatBtn = null;
let histBtnEl = null;
let histCountBadgeEl = null;

// In-sheet sub-drawers (Saved Chats & Quests/Tones — never leaves #ha-arc-sheet!)
let subBackdropEl = null;
let histDrawerEl = null;
let histSearchEl = null;
let histListEl = null;
let histEmptyEl = null;
let histSyncEl = null;
let hubDrawerEl = null;
let hubBodyEl = null;

let sheetContextApi = null;
let activeController = null;
let chatThreads = [];
let hydratedChatUid = '';
let cloudSyncCompletedUid = '';
let cloudSyncPromise = null;
let cloudSavePromise = null;
let cloudSaveQueued = false;
let cloudChatUnsubscribe = null;
let subscribedCloudUid = '';
let renamingChatId = '';
let openHistMenuChatId = '';

// Active conversation state (100% compatible with Arc_AI / arc-chat-store)
let sheetTurns = [];
let sheetChatId = '';
let lastEvidence = '';
let lastVerifiedSnapshot = null;
let lastCasualGreeting = false;
let activeAction = null;
let activeActionApplied = false;
let activeActionAutoCreated = false;
let activeCreatedHabitId = '';
let activePrevHabitPatch = null;
let activeActionUndo = null;
let activeActionDismissed = false;
let lastFailedQuestion = '';

let vvCleanup = null;
let baselineMobileHeight = 0;
let constellationRaf = 0;
let constellationPts = [];
let followLatestScroll = true;

function currentPage() {
  return (typeof location === 'object' ? location.pathname.split('/').pop() : '') || 'Dashboard.html';
}

function clipWords(text, max = 30) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const spaceIdx = cut.lastIndexOf(' ');
  return (spaceIdx > 10 ? cut.slice(0, spaceIdx) : cut).trimEnd() + '…';
}

function normaliseHabitKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getChatStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function getActiveUid() {
  try {
    return window.HabitArc?.getAuthUser?.()?.uid
      || (typeof localStorage !== 'undefined' ? localStorage.getItem('habitarc_active_uid') : '')
      || 'local';
  } catch {
    return 'local';
  }
}

function getAiMeta() {
  const app = window.HabitArc;
  const settings = app?.getSettings?.() || {};
  const fallbackName = app?.normaliseAiName?.(settings?.aiName)
    || String(settings?.aiName || '').trim().slice(0, 16)
    || 'ARC';
  const prog = app?.getAiProgression?.() || {
    aiName: fallbackName,
    aiTone: settings?.aiTone || 'default',
    activeTone: settings?.aiTone || 'default',
    level: 1,
    rank: 'Habit Builder',
    shortPower: 'Make Habits',
    summary: 'Create and add habits directly in chat with 1-tap Undo.',
    nextLevel: 2,
    questsDoneCount: 0,
    questsTotalCount: 3,
    quests: [
      { id: 'q2_ai_create', label: `Create 1 habit with ${fallbackName}`, current: 0, target: 1, done: false },
      { id: 'q2_checkins', label: 'Complete 3 habit check-ins', current: 0, target: 3, done: false },
      { id: 'q2_clear_or_prod', label: 'Clear 1 day or finish 1 task/focus', current: 0, target: 1, done: false },
    ],
    progressPct: 0,
    tiers: [
      { level: 1, reqLabel: 'START', unlocked: true, current: true },
      { level: 2, reqLabel: '3Q', unlocked: false, current: false },
      { level: 3, reqLabel: '7D+3Q', unlocked: false, current: false },
      { level: 4, reqLabel: '14D+3Q', unlocked: false, current: false },
    ],
  };
  const aiName = prog.aiName || fallbackName;
  const chatLabel = aiName === 'ARC' ? 'ARC AI' : aiName;
  return { ...prog, aiName, chatLabel };
}

function getAiName() {
  return getAiMeta().aiName;
}

/* ─── Unified Local + Cloud Saved Chats Store ─────────────────────────────── */
function ensureSheetChatsLoaded(uid = getActiveUid()) {
  if (!uid) return;
  if (hydratedChatUid === uid) return;
  if (cloudChatUnsubscribe) {
    try { cloudChatUnsubscribe(); } catch {}
    cloudChatUnsubscribe = null;
  }
  hydratedChatUid = uid;
  const storage = getChatStorage();
  const { chats, migratedLegacyId } = loadLocalArcChats(uid, storage);
  chatThreads = chats;
  if (migratedLegacyId && !loadActiveArcChatId(uid, storage)) {
    saveActiveArcChatId(uid, migratedLegacyId, storage);
  }
}

function normaliseRemoteChatPayload(raw) {
  if (Array.isArray(raw)) return { chats: raw, activeChatId: '', activeChatUpdatedAt: 0 };
  if (raw && typeof raw === 'object') {
    return {
      chats: Array.isArray(raw.chats) ? raw.chats : [],
      activeChatId: typeof raw.activeChatId === 'string' ? raw.activeChatId : '',
      activeChatUpdatedAt: Number.isFinite(raw.activeChatUpdatedAt) ? raw.activeChatUpdatedAt : 0,
    };
  }
  return { chats: [], activeChatId: '', activeChatUpdatedAt: 0 };
}

async function flushSheetCloudChats(uid = getActiveUid()) {
  const user = window.HabitArc?.getAuthUser?.();
  const cloud = typeof window !== 'undefined' ? window.HabitArcAuth : null;
  if (!uid || !user || user.isAnonymous || user.uid !== uid || !cloud?.saveArcChats) return;
  if (cloudSavePromise) {
    cloudSaveQueued = true;
    return cloudSavePromise;
  }
  cloudSavePromise = (async () => {
    try {
      if (cloudSyncPromise) {
        try { await cloudSyncPromise; } catch {}
      }
      const storage = getChatStorage();
      if (cloudSyncCompletedUid !== uid && typeof cloud.loadArcChats === 'function') {
        try {
          const rawRemote = await cloud.loadArcChats(user);
          if ((window.HabitArc?.getAuthUser?.()?.uid || hydratedChatUid) !== uid) return;
          const remote = normaliseRemoteChatPayload(rawRemote);
          chatThreads = saveLocalArcChats(uid, mergeArcChats(chatThreads, remote.chats), storage);
          cloudSyncCompletedUid = uid;
        } catch { /* Offline local save still proceeds */ }
      }
      const activeMeta = loadActiveArcChatMeta(uid, storage);
      await cloud.saveArcChats({
        chats: sanitizeArcChatsForCloud(chatThreads),
        activeChatId: sheetChatId || activeMeta.id || '',
        activeChatUpdatedAt: activeMeta.updatedAt || Date.now(),
      }, user);
      if (histSyncEl) histSyncEl.textContent = 'Synced to your HabitArc account ✓';
    } catch {
      if (histSyncEl) histSyncEl.textContent = 'Saved on this device · Cloud retry pending';
    } finally {
      cloudSavePromise = null;
      if (cloudSaveQueued) {
        cloudSaveQueued = false;
        void flushSheetCloudChats(uid);
      }
    }
  })();
  return cloudSavePromise;
}

async function syncCloudChatsInBackground() {
  const user = window.HabitArc?.getAuthUser?.();
  const cloud = typeof window !== 'undefined' ? window.HabitArcAuth : null;
  if (!user?.uid || user.isAnonymous || !cloud?.loadArcChats) return;
  const uid = user.uid;
  ensureSheetChatsLoaded(uid);
  const run = async () => {
    try {
      const rawRemote = await cloud.loadArcChats(user);
      if ((window.HabitArc?.getAuthUser?.()?.uid || hydratedChatUid) !== uid) return;
      cloudSyncCompletedUid = uid;
      const remote = normaliseRemoteChatPayload(rawRemote);
      const merged = mergeArcChats(chatThreads, remote.chats);
      if (JSON.stringify(merged) !== JSON.stringify(chatThreads)) {
        chatThreads = saveLocalArcChats(uid, merged, getChatStorage());
      }
      if (histDrawerEl && !histDrawerEl.hidden) renderSheetHistoryDrawer();
      if (dialog?.open && !sheetTurns.length && !activeController) renderSheetHome();
    } catch {}
  };
  cloudSyncPromise = run().finally(() => { cloudSyncPromise = null; });
  await cloudSyncPromise;
  if (subscribedCloudUid !== uid && typeof cloud.subscribeArcChats === 'function') {
    subscribedCloudUid = uid;
    cloudChatUnsubscribe = cloud.subscribeArcChats((rawRemote) => {
      cloudSyncCompletedUid = uid;
      const remote = normaliseRemoteChatPayload(rawRemote);
      const merged = mergeArcChats(chatThreads, remote.chats);
      if (JSON.stringify(merged) !== JSON.stringify(chatThreads)) {
        chatThreads = saveLocalArcChats(uid, merged, getChatStorage());
        if (histDrawerEl && !histDrawerEl.hidden) renderSheetHistoryDrawer();
        if (dialog?.open && !sheetTurns.length && !activeController) renderSheetHome();
      }
    }, () => {});
  }
}

function hydrateSavedSheetSession(loadIntoThread = false, targetChatId = '') {
  const uid = getActiveUid();
  ensureSheetChatsLoaded(uid);
  try {
    const live = getLiveArcChats(chatThreads).filter((c) => Array.isArray(c.turns) && c.turns.length > 0);
    const activeId = targetChatId || loadActiveArcChatId(uid, getChatStorage());
    const preferred = (activeId && live.find((c) => c.id === activeId)) || live[0] || null;
    if (loadIntoThread && preferred) {
      loadThreadObjectIntoState(preferred, { syncActiveId: true });
    }
    return { recentChat: preferred, totalSaved: live.length };
  } catch {
    return { recentChat: null, totalSaved: 0 };
  }
}

function loadThreadObjectIntoState(thread, { syncActiveId = true } = {}) {
  if (!thread) return false;
  const uid = getActiveUid();
  sheetChatId = thread.id;
  sheetTurns = (thread.turns || []).map((t) => ({
    question: t.question,
    answer: t.answer,
    timestamp: t.timestamp || Date.now(),
  }));
  lastEvidence = typeof thread.lastEvidence === 'string' ? thread.lastEvidence : '';
  lastVerifiedSnapshot = thread.lastVerifiedSnapshot || null;
  lastCasualGreeting = Boolean(thread.lastCasualGreeting);
  activeAction = thread.lastAction || null;
  activeActionApplied = Boolean(thread.lastActionApplied);
  activeActionAutoCreated = Boolean(thread.lastActionAutoCreated);
  activeCreatedHabitId = typeof thread.lastCreatedHabitId === 'string' ? thread.lastCreatedHabitId : '';
  activePrevHabitPatch = thread.lastPrevHabitPatch || null;
  activeActionUndo = thread.lastActionUndo || null;
  activeActionDismissed = false;
  if (syncActiveId && uid) {
    saveActiveArcChatId(uid, sheetChatId, getChatStorage(), Date.now());
    void flushSheetCloudChats(uid);
  }
  return true;
}

function persistSheetThreadState(uid = getActiveUid()) {
  if (!uid) return;
  ensureSheetChatsLoaded(uid);
  const storage = getChatStorage();
  const nowMs = Date.now();
  if (!sheetTurns.length) {
    saveActiveArcChatId(uid, '', storage, nowMs);
    void flushSheetCloudChats(uid);
    return;
  }
  if (!sheetChatId) sheetChatId = generateArcChatId(nowMs);
  const existing = getLiveArcChats(chatThreads).find((c) => c.id === sheetChatId);
  chatThreads = upsertArcChat(chatThreads, {
    id: sheetChatId,
    title: existing?.title || deriveArcChatTitle(sheetTurns[0]?.question),
    customTitle: Boolean(existing?.customTitle),
    pinned: Boolean(existing?.pinned),
    createdAt: existing?.createdAt || sheetTurns[0]?.timestamp || nowMs,
    updatedAt: nowMs,
    turns: sheetTurns.slice(-MAX_LOCAL_TURNS),
    lastEvidence,
    lastVerifiedSnapshot,
    lastCasualGreeting,
    lastAction: activeAction,
    lastActionApplied: activeActionApplied,
    lastActionAutoCreated: activeActionAutoCreated,
    lastCreatedHabitId: activeCreatedHabitId,
    lastPrevHabitPatch: activePrevHabitPatch,
    lastActionUndo: activeActionUndo,
  }, nowMs);
  chatThreads = saveLocalArcChats(uid, chatThreads, storage);
  saveActiveArcChatId(uid, sheetChatId, storage, nowMs);
  void flushSheetCloudChats(uid);
}

/* ─── 60fps Theme-Adaptive Constellation Background Canvas ────────────────── */
function resizeConstellationCanvas() {
  if (!canvasEl || !panelEl || typeof window === 'undefined') return;
  const rect = panelEl.getBoundingClientRect();
  const w = Math.max(200, Math.round(rect.width || window.innerWidth || 390));
  const h = Math.max(200, Math.round(rect.height || window.innerHeight || 844));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvasEl.width !== Math.round(w * dpr) || canvasEl.height !== Math.round(h * dpr)) {
    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
  }
  canvasEl._logicalW = w;
  canvasEl._logicalH = h;
  canvasEl._dpr = dpr;
  if (!constellationPts.length) {
    const fract = (n) => n - Math.floor(n);
    constellationPts = Array.from({ length: 24 }, (_, idx) => {
      const rx = fract(Math.sin((idx + 1) * 12.9898) * 43758.5453);
      const ry = fract(Math.sin((idx + 1) * 78.233) * 24634.6345);
      const ang = fract(Math.sin((idx + 1) * 39.346) * 19532.17) * Math.PI * 2;
      const spd = 0.16 + (idx % 5) * 0.055;
      return {
        x: rx * w,
        y: ry * h,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        mint: idx % 3 === 0,
      };
    });
  }
}

function stopConstellation() {
  if (constellationRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(constellationRaf);
  }
  constellationRaf = 0;
  if (canvasEl) {
    const ctx = canvasEl.getContext?.('2d');
    ctx?.clearRect?.(0, 0, canvasEl.width || 0, canvasEl.height || 0);
  }
}

function readThemeConstellationPalette() {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return { primaryRgb: '124, 58, 237', secondaryRgb: '16, 122, 87', lineAlpha: 0.16, dotAlpha: 0.45 };
  }
  const root = document.documentElement;
  const theme = root?.getAttribute('data-theme') || 'light';
  const isLightTheme = theme === 'light' || theme === 'sage';
  const cs = getComputedStyle(root);
  const toCsv = (raw, fallback) => {
    const nums = String(raw || '').trim().split(/[\s,]+/).filter(Boolean).slice(0, 3);
    return nums.length === 3 ? nums.join(', ') : fallback;
  };
  return {
    primaryRgb: toCsv(cs.getPropertyValue('--ha-primary'), isLightTheme ? '124, 58, 237' : '197, 182, 255'),
    secondaryRgb: toCsv(cs.getPropertyValue('--ha-secondary'), isLightTheme ? '16, 122, 87' : '71, 227, 147'),
    lineAlpha: isLightTheme ? 0.15 : 0.2,
    dotAlpha: isLightTheme ? 0.46 : 0.72,
  };
}

function startConstellation() {
  stopConstellation();
  if (!canvasEl || typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  if (!panelEl?.classList?.contains('is-empty')) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  const ctx = canvasEl.getContext?.('2d');
  if (!ctx) return;
  resizeConstellationCanvas();
  let palette = readThemeConstellationPalette();
  let frameCount = 0;

  const step = () => {
    if (!dialog?.open || !canvasEl?.isConnected || !panelEl?.classList?.contains('is-empty')) {
      stopConstellation();
      return;
    }
    if (++frameCount % 45 === 0) {
      palette = readThemeConstellationPalette();
    }
    const w = canvasEl._logicalW || 390;
    const h = canvasEl._logicalH || 844;
    const dpr = canvasEl._dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < constellationPts.length; i++) {
      const p = constellationPts[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      else if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      else if (p.y > h) p.y = 0;

      for (let j = i + 1; j < constellationPts.length; j++) {
        const q = constellationPts[j];
        const dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (dist < 84) {
          ctx.strokeStyle = `rgba(${palette.primaryRgb}, ${((1 - dist / 84) * palette.lineAlpha).toFixed(3)})`;
          ctx.lineWidth = 0.85;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = p.mint
        ? `rgba(${palette.secondaryRgb}, ${palette.dotAlpha})`
        : `rgba(${palette.primaryRgb}, ${palette.dotAlpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.65, 0, Math.PI * 2);
      ctx.fill();
    }
    constellationRaf = requestAnimationFrame(step);
  };
  constellationRaf = requestAnimationFrame(step);
}

/* ─── Viewport & Composer Sizing ──────────────────────────────────────────── */
function resizeComposerInput() {
  if (!inputEl) return;
  const isEmptyMode = Boolean(panelEl?.classList?.contains('is-empty'));
  const minH = isEmptyMode ? 68 : 36;
  const maxH = isEmptyMode ? 140 : 108;
  inputEl.style.height = 'auto';
  const next = Math.min(maxH, Math.max(minH, inputEl.value ? (inputEl.scrollHeight || minH) : minH));
  inputEl.style.height = `${next}px`;
}

function scrollThreadToLatest(force = false) {
  if (!bodyEl || bodyEl.hidden || (!force && !followLatestScroll)) return;
  if (force) followLatestScroll = true;
  bodyEl.scrollTop = Math.max(0, bodyEl.scrollHeight - bodyEl.clientHeight);
}

function syncSheetViewport() {
  if (!dialog || !dialog.open || typeof window === 'undefined') return;
  const isDesktop = window.innerWidth >= 768;
  if (isDesktop) {
    dialog.style.removeProperty('--arc-vvh');
    dialog.style.removeProperty('--arc-vvt');
    dialog.classList.remove('is-kb-open');
    resizeConstellationCanvas();
    return;
  }
  const vv = window.visualViewport;
  const h = Math.round(vv ? vv.height : window.innerHeight);
  const top = Math.round(vv ? vv.offsetTop : 0);
  const inputFocused = Boolean(typeof document !== 'undefined' && inputEl && document.activeElement === inputEl);
  if (!inputFocused && h > baselineMobileHeight) {
    baselineMobileHeight = h;
  }
  if (h > 120) {
    dialog.style.setProperty('--arc-vvh', `${h}px`);
    dialog.style.setProperty('--arc-vvt', `${Math.max(0, top)}px`);
  }
  const shrunkFromBaseline = baselineMobileHeight > 0 && (baselineMobileHeight - h) > 100;
  const shrunkFromLayout = Boolean(vv && (window.innerHeight - vv.height) > 100);
  const kbOpen = shrunkFromLayout || shrunkFromBaseline || (inputFocused && h < 560);
  const wasKbOpen = dialog.classList.contains('is-kb-open');
  dialog.classList.toggle('is-kb-open', kbOpen);
  if (kbOpen && !wasKbOpen) {
    scrollThreadToLatest(true);
  }
  resizeConstellationCanvas();
}

function attachViewportSync() {
  detachViewportSync();
  if (typeof window === 'undefined') return;
  const onViewport = () => syncSheetViewport();
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onViewport);
  vv?.addEventListener('scroll', onViewport);
  window.addEventListener('resize', onViewport);
  syncSheetViewport();
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(onViewport) : 0;
  const t1 = setTimeout(onViewport, 90);
  const t2 = setTimeout(onViewport, 260);
  const t3 = setTimeout(onViewport, 450);
  vvCleanup = () => {
    vv?.removeEventListener('resize', onViewport);
    vv?.removeEventListener('scroll', onViewport);
    window.removeEventListener('resize', onViewport);
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    clearTimeout(t1);
    clearTimeout(t2);
    clearTimeout(t3);
  };
}

function detachViewportSync() {
  vvCleanup?.();
  vvCleanup = null;
}

function closeSheetSubDrawers() {
  renamingChatId = '';
  openHistMenuChatId = '';
  if (histDrawerEl) histDrawerEl.hidden = true;
  if (hubDrawerEl) hubDrawerEl.hidden = true;
  if (subBackdropEl) subBackdropEl.hidden = true;
}

function cleanupClosedState() {
  activeController?.abort();
  stopConstellation();
  detachViewportSync();
  closeSheetSubDrawers();
  sheetContextApi?.dispose?.();
  sheetContextApi = null;
  if (typeof document !== 'undefined') {
    document.documentElement?.classList?.remove('ha-arc-sheet-open');
    if (inputEl && document.activeElement === inputEl) {
      inputEl.blur();
    }
  }
  if (dialog) {
    dialog.classList.remove('is-kb-open');
    dialog.style.removeProperty('--arc-vvh');
    dialog.style.removeProperty('--arc-vvt');
  }
}

function ensureSheetContextMounted() {
  if (!plusBtn || !contextHostEl || sheetContextApi) return;
  try {
    sheetContextApi = mountArcContext({
      button: plusBtn,
      host: contextHostEl,
      chips: contextChipsEl,
    });
  } catch {
    sheetContextApi = null;
  }
}

function syncComposerChrome() {
  const isEmptyMode = sheetTurns.length === 0 && !activeController;
  panelEl?.classList?.toggle('is-empty', isEmptyMode);
  panelEl?.classList?.toggle('is-thread', !isEmptyMode);

  if (!isEmptyMode) {
    stopConstellation();
  } else if (dialog?.open && !constellationRaf) {
    startConstellation();
  }

  if (plusLabelEl) {
    plusLabelEl.textContent = isEmptyMode ? '+ Attach' : '+';
  }

  const meta = getAiMeta();
  const toneLabels = { default: 'Coach', calm: 'Calm', drill: 'Drill', hinglish: 'Hinglish' };
  const toneText = toneLabels[meta.activeTone || meta.aiTone] || 'Coach';
  if (toneChipEl) {
    toneChipEl.textContent = `${toneText} · LVL ${meta.level} ›`;
  }

  if (inputEl && !inputEl.value) {
    inputEl.rows = isEmptyMode ? 2 : 1;
    inputEl.placeholder = isEmptyMode
      ? 'Ask for a 2-minute backup habit, split a tough task, or audit your 28-day consistency…'
      : `Ask ${meta.aiName} a follow-up…`;
  }

  syncSendButtonState();
  resizeComposerInput();
}

function syncSendButtonState() {
  if (!sendBtn) return;
  const streaming = Boolean(activeController);
  const isEmptyMode = sheetTurns.length === 0 && !streaming;
  sendBtn.classList.toggle('is-streaming', streaming);
  if (streaming) {
    sendBtn.innerHTML = STOP_SVG;
    sendBtn.setAttribute('aria-label', 'Stop generating');
  } else if (isEmptyMode) {
    sendBtn.innerHTML = '<span>Ask</span><span aria-hidden="true">→</span>';
    sendBtn.setAttribute('aria-label', `Ask ${getAiName()}`);
  } else {
    sendBtn.innerHTML = SEND_SVG;
    sendBtn.setAttribute('aria-label', 'Send message');
  }
}

/* ─── In-Sheet Saved Chats Drawer (Pin, Rename, Delete, Search, + New) ────── */
function formatChatDateShort(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(ts));
  } catch {
    return '';
  }
}

function renderSheetHistoryDrawer() {
  ensureSheetChatsLoaded(getActiveUid());
  const meta = getAiMeta();
  const histKickerEl = dialog?.querySelector('#ha-sheet-hist-kicker');
  if (histKickerEl) histKickerEl.textContent = `${meta.aiName} STUDIO`;

  const live = getLiveArcChats(chatThreads).filter((c) => Array.isArray(c.turns) && c.turns.length > 0);
  if (histCountBadgeEl) {
    histCountBadgeEl.textContent = String(live.length);
    histCountBadgeEl.hidden = live.length === 0;
  }
  if (histSyncEl) {
    const authUser = window.HabitArc?.getAuthUser?.();
    histSyncEl.textContent = (authUser && !authUser.isAnonymous)
      ? 'Synced to your HabitArc account'
      : 'Saved on this device';
  }
  if (!histListEl) return;

  const q = String(histSearchEl?.value || '').trim().toLowerCase();
  const filtered = q
    ? live.filter((c) => String(c.title || '').toLowerCase().includes(q)
      || c.turns.some((t) => String(t.question || '').toLowerCase().includes(q) || String(t.answer || '').toLowerCase().includes(q)))
    : live;

  if (histEmptyEl) histEmptyEl.hidden = filtered.length > 0;
  if (!filtered.length) {
    openHistMenuChatId = '';
    histListEl.innerHTML = '';
    return;
  }

  const groups = groupArcChatsByRecency(filtered);
  const flatItems = groups.flatMap((g) => g.items);
  const lastFlatId = flatItems.length >= 4 ? flatItems[flatItems.length - 1]?.id : '';

  histListEl.innerHTML = groups.map((group) => `
    <section class="ha-sheet-hist-group" aria-label="${esc(group.label)}">
      <div class="ha-sheet-hist-group-lbl">
        <span class="ha-sheet-hist-gline is-left" aria-hidden="true"></span>
        <span class="ha-sheet-hist-gtxt">${esc(group.label)}</span>
        <span class="ha-sheet-hist-gline is-right" aria-hidden="true"></span>
      </div>
      ${group.items.map((chat) => {
        const isActive = chat.id === sheetChatId && sheetTurns.length > 0;
        const dateTxt = chat.updatedAt ? formatChatDateShort(chat.updatedAt) : '';
        const lastTurn = chat.turns[chat.turns.length - 1];
        const rawPreview = cleanArcDisplayText(lastTurn?.answer || lastTurn?.question || '').replace(/\s+/g, ' ').trim();
        const previewTxt = rawPreview ? clipWords(rawPreview, 130) : '';
        const safeId = esc(chat.id);
        const safeTitle = esc(chat.title || 'Conversation');
        const menuOpen = openHistMenuChatId === chat.id;
        const flipUp = menuOpen && chat.id === lastFlatId;

        if (renamingChatId === chat.id) {
          return `
            <div class="ha-sheet-hist-item is-renaming" role="listitem">
              <div class="ha-sheet-rename-row">
                <input type="text" class="ha-sheet-rename-input" data-sheet-rename-input="${safeId}" maxlength="60" value="${safeTitle}" aria-label="Rename conversation" />
                <button type="button" class="ha-sheet-rename-save" data-sheet-rename-save="${safeId}">Save</button>
                <button type="button" class="ha-sheet-rename-cancel" data-sheet-rename-cancel="${safeId}">Cancel</button>
              </div>
            </div>
          `;
        }
        return `
          <div class="ha-sheet-hist-item${isActive ? ' is-active' : ''}${menuOpen ? ' has-pop' : ''}" role="listitem">
            <button type="button" class="ha-sheet-hist-open" data-sheet-chat-open="${safeId}">
              <span class="ha-sheet-hist-rtop">
                <span class="ha-sheet-hist-title">${chat.pinned ? `<span class="ha-sheet-hist-pinico" aria-hidden="true">${PIN_SVG}</span>` : ''}<span class="ha-sheet-hist-ttext">${safeTitle}</span></span>
                ${dateTxt ? `<span class="ha-sheet-hist-date">${esc(dateTxt)}</span>` : ''}
              </span>
              ${previewTxt ? `<span class="ha-sheet-hist-preview">${esc(previewTxt)}</span>` : ''}
              ${isActive ? '<span class="ha-sheet-hist-turnpill is-live">● Active now</span>' : ''}
            </button>
            <button type="button" class="ha-sheet-hist-more${menuOpen ? ' is-open' : ''}" data-sheet-chat-menu="${safeId}" aria-haspopup="menu" aria-expanded="${menuOpen ? 'true' : 'false'}" title="Chat options" aria-label="Options for ${safeTitle}">${MORE_DOTS_SVG}</button>
            ${menuOpen ? `
              <div class="ha-sheet-hist-pop${flipUp ? ' is-flip-up' : ''}" role="menu">
                <button type="button" role="menuitem" class="ha-sheet-pop-item${chat.pinned ? ' is-pinned' : ''}" data-sheet-chat-pin="${safeId}">${PIN_SVG}<span>${chat.pinned ? 'Unpin chat' : 'Pin to top'}</span></button>
                <button type="button" role="menuitem" class="ha-sheet-pop-item" data-sheet-chat-rename="${safeId}">${PEN_SVG}<span>Rename chat</span></button>
                <div class="ha-sheet-pop-sep" role="separator"></div>
                <button type="button" role="menuitem" class="ha-sheet-pop-item is-del" data-sheet-chat-del="${safeId}">${TRASH_SVG}<span>Delete chat</span></button>
              </div>` : ''}
          </div>
        `;
      }).join('')}
    </section>
  `).join('');
}

export function openSheetHistoryDrawer() {
  if (!dialog?.open) openArcSheet();
  if (!histDrawerEl || !subBackdropEl) return;
  if (hubDrawerEl) hubDrawerEl.hidden = true;
  renderSheetHistoryDrawer();
  subBackdropEl.hidden = false;
  histDrawerEl.hidden = false;
}

/* ─── In-Sheet Quests, Power Tiers (L1-L4) & AI Voice/Tones Drawer ────────── */
function renderSheetHubDrawer() {
  if (!hubBodyEl) return;
  const meta = getAiMeta();
  const doneQ = meta.questsDoneCount ?? 0;
  const totalQ = meta.questsTotalCount ?? 3;
  const filledSegs = Math.max(0, Math.min(8, Math.round((meta.progressPct || 0) / 12.5)));
  const segsHtml = Array.from({ length: 8 }, (_, idx) => (
    `<span class="ha-sheet-px-seg${idx < filledSegs ? ' is-filled' : ''}"></span>`
  )).join('');

  const powerSummary = meta.level === 1
    ? `At Level 1, ${meta.aiName} can create daily habits directly in chat with 1-tap Undo.`
    : `Level ${meta.level} Active — ${String(meta.summary || '').replace(/\.+$/, '')}.`;

  const quests = Array.isArray(meta.quests) ? meta.quests : [];
  const tierDefs = [
    { level: 1, title: 'Make Habits', desc: 'Draft & save new daily habits right in chat', prompt: 'Create a 10-min stretching habit at 08:00' },
    { level: 2, title: 'Delete, Edit & Tasks', desc: 'Update cues, check off habits & add Planner tasks', prompt: 'Change my first habit reminder to 08:30' },
    { level: 3, title: 'Streak Shield & Plan-B', desc: '2-minute fallback habits to save streaks on hard days', prompt: 'Create a 5-min low-energy Plan-B backup habit for tight days' },
    { level: 4, title: 'Batch Tune & Tones', desc: 'Rebalance schedules in bulk & switch AI personality', prompt: 'Rebalance my daily habit schedule so mornings feel lighter' },
  ];
  const unlockedTone = meta.level >= 4;
  const curTone = meta.activeTone || meta.aiTone || 'default';
  const tones = [
    { id: 'default', label: 'Balanced' },
    { id: 'calm', label: 'Calm Zen' },
    { id: 'drill', label: 'Drill Coach' },
    { id: 'hinglish', label: 'Hinglish Bro' },
  ];

  hubBodyEl.innerHTML = `
    <div class="ha-sheet-hub-top">
      <div class="ha-sheet-hub-id">
        <span class="ha-sheet-hub-lvl">LVL ${meta.level}</span>
        <div>
          <div class="ha-sheet-hub-name-row">
            <strong>${esc(meta.aiName)}</strong>
            <span class="ha-sheet-hub-rank">${esc(String(meta.rank || 'Habit Builder').toUpperCase())}</span>
          </div>
          <p class="ha-sheet-hub-sub">Quests, powers &amp; personality unlocks</p>
        </div>
      </div>
      <button type="button" id="ha-sheet-hub-close" class="ha-sheet-drawer-close" aria-label="Close quests drawer">${CLOSE_SVG}</button>
    </div>

    <div class="ha-sheet-hub-xp">
      <div class="ha-sheet-px-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${meta.progressPct || 0}">${segsHtml}</div>
      <p class="ha-sheet-power-copy">${esc(powerSummary)}</p>
    </div>

    <div class="ha-sheet-hub-scroll">
      <section class="ha-sheet-hub-sec">
        <div class="ha-sheet-sec-hdr">
          <span>${meta.nextLevel ? `QUESTS TO LVL ${meta.nextLevel}` : 'ALL LEVELS UNLOCKED ✓'}</span>
          <span>${meta.nextLevel ? `${doneQ}/${totalQ}` : 'MAX'}</span>
        </div>
        <div class="ha-sheet-quest-list">
          ${quests.map((q) => `
            <div class="ha-sheet-quest-row${q.done ? ' is-done' : ''}">
              <span class="ha-sheet-q-box">${q.done ? '✓' : '·'}</span>
              <div class="ha-sheet-q-main">
                <span class="ha-sheet-q-lbl">${esc(q.label)}</span>
                ${q.hint ? `<small class="ha-sheet-q-hint">${esc(q.hint)}</small>` : ''}
              </div>
              <span class="ha-sheet-q-prog">${q.done ? 'DONE' : `${q.current}/${q.target}`}</span>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="ha-sheet-hub-sec">
        <div class="ha-sheet-sec-hdr">
          <span>POWER TIERS</span>
          <span>L1 → L4</span>
        </div>
        <div class="ha-sheet-quest-list">
          ${tierDefs.map((td) => {
            const tierMeta = (meta.tiers || []).find((x) => x.level === td.level);
            const unlocked = tierMeta ? Boolean(tierMeta.unlocked) : td.level <= meta.level;
            const current = tierMeta ? Boolean(tierMeta.current) : td.level === meta.level;
            const stateLbl = current ? 'ACTIVE' : (unlocked ? 'ON ✓' : 'LOCKED');
            return `
              <div class="ha-sheet-tier-row${unlocked ? ' is-unlocked' : ''}">
                <span class="ha-sheet-tier-badge">L${td.level}</span>
                <div class="ha-sheet-tier-copy">
                  <strong>${esc(td.title)}</strong>
                  <small>${esc(td.desc)}</small>
                </div>
                <div class="ha-sheet-tier-right">
                  ${unlocked ? `<button type="button" class="ha-sheet-try-btn" data-hub-try-prompt="${esc(td.prompt)}">Try</button>` : ''}
                  <span class="ha-sheet-tier-state">${stateLbl}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <section class="ha-sheet-hub-sec">
        <div class="ha-sheet-sec-hdr">
          <span>AI VOICE &amp; TONE</span>
          <span>${unlockedTone ? 'ACTIVE' : 'LOCKED · LVL 4'}</span>
        </div>
        <div class="ha-sheet-tone-grid">
          ${tones.map((t) => `
            <button type="button" class="ha-sheet-tone-btn${unlockedTone && curTone === t.id ? ' is-active' : ''}" data-hub-tone="${t.id}" ${unlockedTone ? '' : 'disabled'}>
              ${esc(t.label)}
            </button>
          `).join('')}
        </div>
      </section>
    </div>
  `;

  hubBodyEl.querySelector('#ha-sheet-hub-close')?.addEventListener('click', closeSheetSubDrawers);
  hubBodyEl.querySelectorAll('[data-hub-try-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-hub-try-prompt') || '';
      closeSheetSubDrawers();
      if (inputEl && !activeController) {
        inputEl.value = prompt;
        resizeComposerInput();
        inputEl.focus();
      }
    });
  });
  hubBodyEl.querySelectorAll('[data-hub-tone]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (meta.level < 4) return;
      const toneId = btn.getAttribute('data-hub-tone') || 'default';
      window.HabitArc?.updateSettings?.({ aiTone: toneId });
      renderSheetHubDrawer();
      syncComposerChrome();
      showStatusMessage(`Switched ${meta.aiName} voice to ${toneId === 'default' ? 'Balanced' : toneId}.`);
    });
  });
}

export function openSheetHubDrawer() {
  if (!dialog?.open) openArcSheet();
  if (!hubDrawerEl || !subBackdropEl) return;
  if (histDrawerEl) histDrawerEl.hidden = true;
  renderSheetHubDrawer();
  subBackdropEl.hidden = false;
  hubDrawerEl.hidden = false;
}

/* ─── Full Level 1–4 Action Execution + 1-Tap Undo + Level-Up Celebration ── */
function showLevelUpBanner(fromLevel, toLevel, meta = getAiMeta()) {
  if (!lvlUpBannerEl || !lvlUpTextEl || toLevel <= fromLevel) return;
  lvlUpTextEl.textContent = `🎉 LEVEL UP! ${meta.aiName} LVL ${fromLevel} → LVL ${toLevel} · ${meta.shortPower || meta.rank} unlocked!`;
  lvlUpBannerEl.hidden = false;
}

function recordActionProgression(kind, beforeLevel) {
  if (typeof window.HabitArc?.recordAiAction === 'function') {
    const after = window.HabitArc.recordAiAction(kind);
    if (after?.level > beforeLevel) showLevelUpBanner(beforeLevel, after.level, after);
  }
  syncComposerChrome();
}

function formatActionSubtitle(action) {
  if (!action) return '';
  const parts = [];
  if (action.type === 'create_task') {
    if (action.dueDate) parts.push(`Due ${action.dueDate}`);
    if (action.priority && action.priority !== 'none') parts.push(`${String(action.priority).toUpperCase()} priority`);
    if (action.description) parts.push(clipWords(action.description, 50));
    return parts.join(' · ') || 'Planner task';
  }
  if (action.type === 'batch_update_habits') {
    return (action.updates || []).map((u) => `${u.habitName}${u.reminder ? ` (${u.reminder})` : ''}`).join(', ');
  }
  if (action.type === 'delete_habit') return 'Removes habit & log history (reversible with Undo)';
  if (action.type === 'complete_habit') return 'Marks completed for today';
  if (action.category) parts.push(action.category);
  if (action.reminder) parts.push(`Reminder ${action.reminder}`);
  if (Array.isArray(action.repeat) && action.repeat.length) {
    parts.push(action.repeat.length === 7 ? 'Daily' : action.repeat.map((d) => String(d).toUpperCase()).join(', '));
  }
  if (action.why) parts.push(clipWords(action.why, 54));
  return parts.join(' · ');
}

function executeActionNow(action, { auto = false } = {}) {
  const app = window.HabitArc;
  if (!action || !app) return { ok: false, message: 'Action unavailable.' };
  const beforeLevel = getAiMeta().level;

  if (action.type === 'create_habit' && typeof app.addHabit === 'function') {
    if (auto) {
      const targetKey = normaliseHabitKey(action.name);
      const dup = (app.getHabits?.() || []).find((h) => normaliseHabitKey(h?.name) === targetKey);
      if (dup) return { ok: false, duplicate: true, message: `"${action.name}" is already in your habits.` };
    }
    const created = app.addHabit({
      name: String(action.name || '').slice(0, 60),
      category: action.category || 'General',
      reminder: action.reminder || '09:00',
      repeat: Array.isArray(action.repeat) && action.repeat.length ? action.repeat : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      why: action.why || '',
    });
    if (!created?.success) return { ok: false, message: created?.message || 'Could not add habit.' };
    recordActionProgression('create', beforeLevel);
    return {
      ok: true,
      applied: true,
      autoCreated: true,
      createdHabitId: created.habit?.id || '',
      message: `Added "${action.name}" to HabitArc.`,
    };
  }

  if (action.type === 'update_habit' && typeof app.updateHabit === 'function') {
    const targetHabit = app.getHabitById?.(action.habitId)
      || (app.getHabits?.() || []).find((h) => normaliseHabitKey(h?.name) === normaliseHabitKey(action.habitName || action.name));
    const updates = {};
    const prevPatch = {};
    if (action.reminder) {
      prevPatch.reminder = targetHabit?.reminder ?? '';
      updates.reminder = action.reminder;
    }
    if (Array.isArray(action.repeat) && action.repeat.length) {
      prevPatch.repeat = Array.isArray(targetHabit?.repeat) ? [...targetHabit.repeat] : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      updates.repeat = action.repeat;
    }
    if (typeof action.why === 'string' && action.why.trim()) {
      prevPatch.why = targetHabit?.why ?? '';
      updates.why = action.why;
    }
    const targetId = targetHabit?.id || action.habitId;
    if (!targetId || !Object.keys(updates).length || !app.updateHabit(targetId, updates)) {
      return { ok: false, message: 'Could not find that habit to update.' };
    }
    action.habitId = targetId;
    action.habitName = targetHabit?.name || action.habitName || 'Habit';
    recordActionProgression('manage', beforeLevel);
    return {
      ok: true,
      applied: true,
      prevPatch: Object.keys(prevPatch).length ? prevPatch : null,
      message: `Updated "${action.habitName}".`,
    };
  }

  if (action.type === 'delete_habit' && typeof app.deleteHabit === 'function') {
    const targetHabit = app.getHabitById?.(action.habitId)
      || (app.getHabits?.() || []).find((h) => normaliseHabitKey(h?.name) === normaliseHabitKey(action.habitName || action.name));
    if (!targetHabit?.id) return { ok: false, message: 'Could not find that habit to delete.' };
    const backup = JSON.parse(JSON.stringify(targetHabit));
    app.deleteHabit(targetHabit.id);
    action.habitId = targetHabit.id;
    action.habitName = targetHabit.name || action.habitName || 'Habit';
    recordActionProgression('manage', beforeLevel);
    return {
      ok: true,
      applied: true,
      undoData: { kind: 'delete_habit', backup },
      message: `Deleted "${action.habitName}".`,
    };
  }

  if (action.type === 'complete_habit' && typeof app.completeHabit === 'function') {
    const targetHabit = app.getHabitById?.(action.habitId)
      || (app.getHabits?.() || []).find((h) => normaliseHabitKey(h?.name) === normaliseHabitKey(action.habitName || action.name));
    if (!targetHabit?.id) return { ok: false, message: 'Could not find that habit to complete.' };
    const wasDone = Boolean(app.isCompletedToday?.(targetHabit.id));
    app.completeHabit(targetHabit.id);
    action.habitId = targetHabit.id;
    action.habitName = targetHabit.name || action.habitName || 'Habit';
    recordActionProgression('manage', beforeLevel);
    return {
      ok: true,
      applied: true,
      undoData: !wasDone ? { kind: 'complete_habit', habitId: targetHabit.id } : null,
      message: `Completed "${action.habitName}" for today.`,
    };
  }

  if (action.type === 'create_task' && action.title) {
    taskStore.start();
    const created = taskStore.put(newTask({
      title: String(action.title).slice(0, 140),
      dueDate: action.dueDate || localDay(),
      priority: action.priority || 'medium',
      description: action.description || '',
    }));
    recordActionProgression('manage', beforeLevel);
    return {
      ok: true,
      applied: true,
      undoData: { kind: 'create_task', taskId: created.id },
      message: `Added task "${action.title}" to Plan.`,
    };
  }

  if (action.type === 'batch_update_habits' && typeof app.updateHabit === 'function') {
    const prevList = [];
    for (const item of (action.updates || [])) {
      const target = app.getHabitById?.(item.habitId)
        || (app.getHabits?.() || []).find((h) => normaliseHabitKey(h?.name) === normaliseHabitKey(item.habitName));
      if (!target) continue;
      const prevPatch = {};
      const nextPatch = {};
      if (item.reminder) {
        prevPatch.reminder = target.reminder ?? '';
        nextPatch.reminder = item.reminder;
      }
      if (Array.isArray(item.repeat) && item.repeat.length) {
        prevPatch.repeat = Array.isArray(target.repeat) ? [...target.repeat] : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        nextPatch.repeat = item.repeat;
      }
      if (Object.keys(nextPatch).length && app.updateHabit(target.id, nextPatch)) {
        prevList.push({ habitId: target.id, prevPatch });
      }
    }
    if (!prevList.length) return { ok: false, message: 'No matching habits to rebalance.' };
    recordActionProgression('manage', beforeLevel);
    return {
      ok: true,
      applied: true,
      undoData: { kind: 'batch_update_habits', prevList },
      message: `Rebalanced ${prevList.length} habit${prevList.length === 1 ? '' : 's'}.`,
    };
  }

  return { ok: false, message: 'Action unavailable.' };
}

function undoActiveActionNow() {
  const app = window.HabitArc;
  if (!activeAction || !activeActionApplied || !app) return '';

  if (activeActionAutoCreated && activeCreatedHabitId && typeof app.deleteHabit === 'function') {
    const removedName = activeAction.name;
    app.deleteHabit(activeCreatedHabitId);
    app.recordAiAction?.('undo_create');
    activeCreatedHabitId = '';
    activeActionAutoCreated = false;
    activeActionApplied = false;
    return `Removed "${removedName}".`;
  }

  if (activePrevHabitPatch && activeAction.type === 'update_habit' && typeof app.updateHabit === 'function') {
    app.updateHabit(activeAction.habitId, activePrevHabitPatch);
    app.recordAiAction?.('undo_manage');
    activePrevHabitPatch = null;
    activeActionApplied = false;
    return `Restored "${activeAction.habitName || 'habit'}".`;
  }

  const undo = activeActionUndo;
  if (!undo) return '';
  if (undo.kind === 'delete_habit' && undo.backup && typeof app.restoreHabit === 'function') {
    app.restoreHabit(undo.backup);
    app.recordAiAction?.('undo_manage');
  } else if (undo.kind === 'complete_habit' && undo.habitId && typeof app.uncompleteHabit === 'function') {
    app.uncompleteHabit(undo.habitId);
    app.recordAiAction?.('undo_manage');
  } else if (undo.kind === 'create_task' && undo.taskId) {
    taskStore.remove?.(undo.taskId);
    app.recordAiAction?.('undo_manage');
  } else if (undo.kind === 'batch_update_habits' && Array.isArray(undo.prevList) && typeof app.updateHabit === 'function') {
    undo.prevList.forEach((entry) => app.updateHabit(entry.habitId, entry.prevPatch));
    app.recordAiAction?.('undo_manage');
  } else {
    return '';
  }
  activeActionUndo = null;
  activeActionApplied = false;
  return 'Undid AI action.';
}

function renderActiveActionMarkup() {
  if (!activeAction || activeActionDismissed || !SUPPORTED_ACTION_TYPES.has(activeAction.type)) return '';
  const meta = getAiMeta();
  const aiUpper = meta.aiName.toUpperCase();
  const isUpdatedWithUndo = Boolean(activeActionApplied && activePrevHabitPatch && activeAction.type === 'update_habit');
  const hasGenericUndo = Boolean(activeActionApplied && activeActionUndo);
  const canUndoHabitCreate = Boolean(activeActionAutoCreated && activeCreatedHabitId && window.HabitArc?.getHabitById?.(activeCreatedHabitId));
  const canUndo = canUndoHabitCreate || isUpdatedWithUndo || hasGenericUndo;

  let kicker = '';
  if (activeActionApplied) {
    const verb = {
      create_habit: 'ADDED',
      update_habit: 'UPDATED',
      delete_habit: 'DELETED',
      complete_habit: 'COMPLETED',
      create_task: 'TASK ADDED',
      batch_update_habits: 'REBALANCED',
    }[activeAction.type] || 'APPLIED';
    kicker = `✓ ${verb} BY ${aiUpper}`;
  } else {
    kicker = {
      create_habit: 'PROPOSED NEW HABIT',
      update_habit: 'PROPOSED HABIT UPDATE',
      delete_habit: 'PROPOSED HABIT DELETE',
      complete_habit: 'PROPOSED CHECK-IN',
      create_task: 'PROPOSED PLAN TASK',
      batch_update_habits: 'PROPOSED ROUTINE REBALANCE',
    }[activeAction.type] || `${aiUpper} ACTION`;
  }

  const title = {
    create_habit: `${activeActionApplied ? 'Added' : 'Add'} "${activeAction.name}"`,
    update_habit: `${activeActionApplied ? 'Updated' : 'Update'} "${activeAction.habitName || activeAction.name || 'Habit'}"`,
    delete_habit: `${activeActionApplied ? 'Deleted' : 'Delete'} "${activeAction.habitName || activeAction.name || 'Habit'}"`,
    complete_habit: `${activeActionApplied ? 'Completed' : 'Mark'} "${activeAction.habitName || activeAction.name || 'Habit'}"${activeActionApplied ? '' : ' done'}`,
    create_task: `${activeActionApplied ? 'Added' : 'Add'} task "${activeAction.title}"`,
    batch_update_habits: `${activeActionApplied ? 'Rebalanced' : 'Rebalance'} ${(activeAction.updates || []).length} habits`,
  }[activeAction.type] || 'HabitArc Action';

  const desc = formatActionSubtitle(activeAction);

  let buttonsHtml = '';
  if (activeActionApplied) {
    buttonsHtml = canUndo
      ? `<button type="button" id="ha-sheet-action-undo" class="ha-arc-draft-dismiss">↩ Undo</button>`
      : '';
  } else {
    const ctaLbl = {
      create_habit: '✓ Add Habit',
      update_habit: '✓ Apply Update',
      delete_habit: 'Delete Habit',
      complete_habit: '✓ Mark Done',
      create_task: '✓ Add Task',
      batch_update_habits: '✓ Apply All',
    }[activeAction.type] || '✓ Approve & Save';
    buttonsHtml = `
      <button type="button" id="ha-sheet-action-dismiss" class="ha-arc-draft-dismiss">Not now</button>
      <button type="button" id="ha-sheet-action-apply" class="ha-arc-draft-approve">${esc(ctaLbl)}</button>
    `;
  }

  return `
    <div class="ha-arc-draft-card">
      <div class="ha-arc-draft-kicker">${esc(kicker)}</div>
      <div class="ha-arc-draft-title">${esc(title)}</div>
      ${desc ? `<div class="ha-arc-draft-desc">${esc(desc)}</div>` : ''}
      ${buttonsHtml ? `<div class="ha-arc-draft-actions">${buttonsHtml}</div>` : ''}
    </div>
  `;
}

function deriveFollowups() {
  if (!sheetTurns.length || activeController) return [];
  if (activeAction?.type === 'create_habit') {
    return [
      'Make a 2-min Plan-B version of this habit',
      'Pick the best reminder time for my schedule',
    ];
  }
  if (activeAction?.type === 'create_task') {
    return [
      'Break this task into 2 smaller steps',
      'Review my habits and tasks for today',
    ];
  }
  if (lastCasualGreeting) {
    return [
      'Audit my habit consistency this week',
      'Create a realistic 5-min daily habit',
    ];
  }
  return [
    'Give me a 2-min Plan-B for tough days',
    'Compare my last 7 days with the week before',
  ];
}

/* ─── Home & Thread Rendering ─────────────────────────────────────────────── */
function buildContextSummary() {
  const app = window.HabitArc;
  const page = currentPage();
  const firstName = (app?.getAuthUser?.()?.displayName || app?.getSettings?.()?.userName || 'there').trim().split(/\s+/)[0] || 'there';
  const habits = app?.getTodayHabits?.() || app?.getHabits?.() || [];
  const allTasks = taskStore.getTasks?.() || [];
  const tasks = allTasks.filter((t) => t.dueDate === localDay());
  const habitsDone = habits.filter((h) => app?.isCompletedToday?.(h.id)).length;
  const tasksDone = tasks.filter((t) => t.completed).length;
  const totalItems = habits.length + tasks.length;
  const totalDone = habitsDone + tasksDone;
  const nextHabit = habits.find((h) => !app?.isCompletedToday?.(h.id));
  const nextTask = tasks.find((t) => !t.completed);
  const overdueCount = allTasks.filter((t) => !t.completed && t.dueDate && t.dueDate < localDay()).length;

  let ctxLead = 'Today';
  if (page === 'Insights.html') ctxLead = 'Insights · 28d';
  else if (page === 'Notes.html') ctxLead = 'Notes Studio';
  else if (page === 'Habits.html') ctxLead = 'Plan & Schedule';
  else ctxLead = totalItems > 0 ? `Today · ${totalDone}/${totalItems}` : 'Today';

  const ctxTail = nextHabit
    ? clipWords(nextHabit.name, 26)
    : (nextTask ? clipWords(nextTask.title, 26) : '');

  const chips = [];
  if (nextHabit) {
    chips.push({
      primary: true,
      label: `“Give me a 2-min ${clipWords(nextHabit.name, 24)} backup”`,
      prompt: `Low energy today — give me a 2-minute backup version of "${nextHabit.name}" so my streak stays safe.`,
    });
  } else {
    chips.push({
      primary: true,
      label: '“Spot my biggest 28-day consistency leak”',
      prompt: 'Audit my 28-day habit history, tell me which weekday or habit drops off most, and suggest one concrete fix.',
    });
  }

  if (nextTask) {
    chips.push({
      primary: false,
      label: `“Split ${clipWords(nextTask.title, 26)} into 3 steps”`,
      prompt: `Break my task "${nextTask.title}" into 3 quick actionable steps I can finish today.`,
    });
  } else if (overdueCount > 0) {
    chips.push({
      primary: false,
      label: `“Open Daily Rescue Mode for ${overdueCount} overdue”`,
      href: 'Habits.html?section=tasks&rescue=1',
    });
  } else {
    chips.push({
      primary: false,
      label: '“Suggest one tiny 2-minute habit to stack”',
      prompt: 'Suggest one tiny 2-minute habit that pairs well with my existing routine.',
    });
  }

  chips.push({
    primary: false,
    label: '“Which weekday do I miss most in 28d?”',
    prompt: 'Give me a concise 28-day weekday breakdown with my strongest day, weakest day, and one adjustment.',
  });

  return { firstName, ctxLead, ctxTail, chips, totalDone, totalItems };
}

function renderContextDividerHtml(ctxLead, ctxTail) {
  return `<div class="ha-arc-ctx-pill" aria-label="Session context">`
    + `<span class="ha-arc-ctx-line is-left" aria-hidden="true"></span>`
    + `<span class="ha-arc-ctx-label">`
      + `<span class="ha-arc-ctx-dot" aria-hidden="true"></span>`
      + `<strong class="ha-arc-ctx-lead">${esc(ctxLead)}</strong>`
      + (ctxTail ? `<span class="ha-arc-ctx-sep" aria-hidden="true">·</span><span class="ha-arc-ctx-tail">${esc(ctxTail)}</span>` : '')
    + `</span>`
    + `<span class="ha-arc-ctx-line is-right" aria-hidden="true"></span>`
    + `</div>`;
}

function showStatusMessage(messageHtml, retryQuestion = '') {
  if (!statusEl) return;
  lastFailedQuestion = retryQuestion;
  if (!messageHtml) {
    statusEl.innerHTML = '';
    return;
  }
  statusEl.innerHTML = `<span>${messageHtml}</span>${retryQuestion ? '<button type="button" id="ha-arc-sheet-retry" class="ha-arc-retry-btn">Retry ↻</button>' : ''}`;
  statusEl.querySelector('#ha-arc-sheet-retry')?.addEventListener('click', () => {
    const q = lastFailedQuestion;
    lastFailedQuestion = '';
    if (q) void submitPrompt(q);
  });
}

function renderSheetHome() {
  if (!bodyEl || !chipsEl) return;
  const meta = getAiMeta();
  const { firstName, ctxLead, ctxTail, chips } = buildContextSummary();
  const { recentChat, totalSaved } = hydrateSavedSheetSession(false);

  const titleNode = dialog?.querySelector('#ha-arc-sheet-title');
  if (titleNode) titleNode.textContent = meta.aiName;
  const kickerNode = dialog?.querySelector('#ha-arc-empty-kicker');
  if (kickerNode) kickerNode.textContent = `${meta.aiName} STUDIO`;

  if (histBtnEl) {
    const label = totalSaved > 0 ? `Saved chats (${totalSaved})` : 'Saved chats';
    histBtnEl.setAttribute('aria-label', label);
    histBtnEl.setAttribute('title', label);
  }
  if (histCountBadgeEl) {
    histCountBadgeEl.textContent = String(totalSaved);
    histCountBadgeEl.hidden = totalSaved === 0;
  }
  if (newChatBtn) newChatBtn.hidden = sheetTurns.length === 0;
  if (headingEl) {
    headingEl.textContent = firstName && firstName !== 'there'
      ? `What’s on your mind, ${firstName}?`
      : 'What’s on your mind today?';
  }

  syncComposerChrome();

  if (!sheetTurns.length) {
    if (emptyHeroEl) emptyHeroEl.hidden = false;
    bodyEl.hidden = true;
    bodyEl.innerHTML = '';
    chipsEl.hidden = false;

    const continueMarkup = recentChat
      ? `<button type="button" id="ha-arc-continue-btn" class="ha-arc-continue-btn">
          <span class="ha-arc-continue-title">↺ Continue: “${esc(recentChat.title || recentChat.turns?.[0]?.question || 'Recent chat')}”</span>
          <span aria-hidden="true">›</span>
        </button>`
      : '';

    chipsEl.innerHTML =
      `<div class="ha-arc-try-kicker">TRY ASKING</div>` +
      chips.map((c, idx) => (
        `<button type="button" class="ha-arc-sheet-chip${c.primary ? ' is-primary' : ''}" data-chip-idx="${idx}">` +
          `<span>${esc(c.label)}</span><span class="ha-arc-chip-arrow" aria-hidden="true">↗</span>` +
        `</button>`
      )).join('') +
      continueMarkup;

    chipsEl.querySelectorAll('[data-chip-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = chips[Number(btn.dataset.chipIdx)];
        if (!chosen) return;
        if (chosen.href) {
          dialog?.close();
          location.href = chosen.href;
          return;
        }
        void submitPrompt(chosen.prompt);
      });
    });

    chipsEl.querySelector('#ha-arc-continue-btn')?.addEventListener('click', () => {
      hydrateSavedSheetSession(true);
      renderSheetHome();
      scrollThreadToLatest(true);
    });
  } else {
    if (emptyHeroEl) emptyHeroEl.hidden = true;
    chipsEl.hidden = true;
    bodyEl.hidden = false;

    const followups = deriveFollowups();
    const turnsMarkup = sheetTurns.map((t, idx) => {
      const isLast = idx === sheetTurns.length - 1;
      const snap = isLast ? lastVerifiedSnapshot : null;
      const ansHtml = renderArcChatAnswer(t.answer, esc, snap);
      const evidenceHtml = (isLast && !lastCasualGreeting && lastEvidence)
        ? `<p class="ha-sheet-evidence">${esc(lastEvidence)}</p>`
        : '';
      const actionCard = isLast ? renderActiveActionMarkup() : '';
      const followupHtml = (isLast && followups.length)
        ? `<div class="ha-arc-turn-followups">${followups.map((fp) => (
            `<button type="button" class="ha-arc-turn-fchip" data-fprompt="${esc(fp)}">${esc(fp)} ↗</button>`
          )).join('')}</div>`
        : '';
      const respTools = isLast
        ? `<div class="ha-sheet-resp-tools">
            <button type="button" class="ha-sheet-resp-lvl" data-open-sheet-hub="1">LVL ${meta.level}</button>
            <button type="button" id="ha-sheet-ans-retry" class="ha-sheet-ans-tool" title="Regenerate response">↻ RETRY</button>
            <button type="button" id="ha-sheet-ans-copy" class="ha-sheet-ans-tool" title="Copy response">COPY</button>
          </div>`
        : `<div class="ha-sheet-resp-tools"><span class="ha-sheet-resp-lvl is-static">LVL ${meta.level}</span></div>`;

      return `
        <div class="ha-arc-sheet-user">${esc(t.question)}</div>
        <article class="ha-arc-sheet-reply">
          <div class="ha-sheet-resp-hdr">
            <span class="ha-sheet-resp-brand"><span class="ha-sheet-resp-dot" aria-hidden="true"></span>${esc(meta.chatLabel)}</span>
            ${respTools}
          </div>
          <div class="ha-sheet-ans-prose">${ansHtml}</div>
          ${evidenceHtml}
          ${actionCard}
          ${followupHtml}
        </article>
      `;
    }).join('');

    bodyEl.innerHTML = `${renderContextDividerHtml(ctxLead, ctxTail)}${turnsMarkup}`;

    bodyEl.querySelector('#ha-sheet-action-apply')?.addEventListener('click', () => {
      if (!activeAction) return;
      const outcome = executeActionNow(activeAction, { auto: false });
      if (outcome.ok) {
        activeActionApplied = true;
        activeActionAutoCreated = Boolean(outcome.autoCreated);
        activeCreatedHabitId = outcome.createdHabitId || '';
        activePrevHabitPatch = outcome.prevPatch || null;
        activeActionUndo = outcome.undoData || null;
        persistSheetThreadState();
      }
      if (outcome.message) showStatusMessage(esc(outcome.message));
      renderSheetHome();
    });

    bodyEl.querySelector('#ha-sheet-action-undo')?.addEventListener('click', () => {
      const msg = undoActiveActionNow();
      persistSheetThreadState();
      if (msg) showStatusMessage(esc(msg));
      renderSheetHome();
    });

    bodyEl.querySelector('#ha-sheet-action-dismiss')?.addEventListener('click', () => {
      activeActionDismissed = true;
      renderSheetHome();
    });

    bodyEl.querySelector('#ha-sheet-ans-copy')?.addEventListener('click', (ev) => {
      const btn = ev.currentTarget;
      const latest = sheetTurns[sheetTurns.length - 1];
      if (!latest?.answer || !navigator.clipboard?.writeText) return;
      const clean = cleanArcDisplayText(latest.answer);
      void navigator.clipboard.writeText(clean).then(() => {
        if (btn) btn.textContent = 'COPIED ✓';
        setTimeout(() => { if (btn?.isConnected) btn.textContent = 'COPY'; }, 1400);
      }).catch(() => {});
    });

    bodyEl.querySelector('#ha-sheet-ans-retry')?.addEventListener('click', () => {
      if (activeController || !sheetTurns.length) return;
      const popped = sheetTurns.pop();
      activeAction = null;
      activeActionApplied = false;
      persistSheetThreadState();
      if (popped?.question) void submitPrompt(popped.question);
    });

    bodyEl.querySelectorAll('[data-open-sheet-hub]').forEach((btn) => {
      btn.addEventListener('click', openSheetHubDrawer);
    });

    bodyEl.querySelectorAll('[data-fprompt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void submitPrompt(btn.getAttribute('data-fprompt') || '');
      });
    });

    scrollThreadToLatest(true);
  }
}

/* ─── Real Streaming Ask Coach Engine (Word Reveal + Context + AutoExecute) ─ */
async function submitPrompt(rawText) {
  const question = String(rawText || '').trim().slice(0, 1000);
  if (!question || activeController) return;
  const app = window.HabitArc;
  const meta = getAiMeta();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    showStatusMessage(`You appear to be offline. Reconnect to ask ${esc(meta.chatLabel)}.`, question);
    return;
  }

  let user = app?.getAuthUser?.();
  if (!user && typeof app?.whenAuthReady === 'function') {
    try { user = await app.whenAuthReady(); } catch {}
  }
  if (!user || user.isAnonymous) {
    if (inputEl) {
      inputEl.value = question;
      resizeComposerInput();
    }
    showStatusMessage(`Sign in from <a href="Profile.html" id="ha-arc-signin-link" style="text-decoration:underline;font-weight:700;">Profile</a> to chat with ${esc(meta.chatLabel)}.`);
    statusEl?.querySelector('#ha-arc-signin-link')?.addEventListener('click', () => dialog?.close());
    return;
  }

  const controller = new AbortController();
  activeController = controller;

  const { ctxLead, ctxTail } = buildContextSummary();
  if (emptyHeroEl) emptyHeroEl.hidden = true;
  chipsEl.hidden = true;
  bodyEl.hidden = false;

  if (inputEl) {
    inputEl.value = '';
    inputEl.blur();
  }
  showStatusMessage('');
  syncComposerChrome();

  // Render prior turns + live incoming bubble immediately
  const priorMarkup = sheetTurns.map((t) => `
    <div class="ha-arc-sheet-user">${esc(t.question)}</div>
    <article class="ha-arc-sheet-reply">
      <div class="ha-sheet-resp-hdr">
        <span class="ha-sheet-resp-brand"><span class="ha-sheet-resp-dot" aria-hidden="true"></span>${esc(meta.chatLabel)}</span>
        <div class="ha-sheet-resp-tools"><span class="ha-sheet-resp-lvl is-static">LVL ${meta.level}</span></div>
      </div>
      <div class="ha-sheet-ans-prose">${renderArcChatAnswer(t.answer, esc)}</div>
    </article>
  `).join('');

  bodyEl.innerHTML = `${renderContextDividerHtml(ctxLead, ctxTail)}${priorMarkup}`;
  const userBubble = document.createElement('div');
  userBubble.className = 'ha-arc-sheet-user';
  userBubble.textContent = question;
  const replyCard = document.createElement('article');
  replyCard.className = 'ha-arc-sheet-reply';
  replyCard.innerHTML = `
    <div class="ha-sheet-resp-hdr">
      <span class="ha-sheet-resp-brand"><span class="ha-sheet-resp-dot" aria-hidden="true"></span>${esc(meta.chatLabel)}</span>
      <div class="ha-sheet-resp-tools"><span class="ha-sheet-resp-lvl is-static">LVL ${meta.level}</span></div>
    </div>
    <div class="ha-sheet-ans-prose"><span class="ha-arc-thinking"><span class="ha-arc-thinking-dot" aria-hidden="true"></span>Thinking through your routines…</span></div>
  `;
  const liveProseEl = replyCard.querySelector('.ha-sheet-ans-prose');
  bodyEl.append(userBubble, replyCard);
  scrollThreadToLatest(true);

  let receivedDraft = '';
  let streamFellBack = false;
  const wordReveal = createArcWordReveal((text) => {
    if (controller !== activeController || controller.signal.aborted || !liveProseEl) return;
    liveProseEl.innerHTML = renderArcChatAnswer(text, esc);
    scrollThreadToLatest();
  }, { intervalMs: 42 });
  controller.signal.addEventListener('abort', () => wordReveal.cancel(), { once: true });

  try {
    await app.flushCloudSync?.();
    const idToken = await app.getAuthToken();

    let workspaceContext = null;
    if (sheetContextApi?.collect) {
      try { workspaceContext = await sheetContextApi.collect(); } catch {}
    }

    const response = await fetch('/api/coach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        question,
        conversation: sheetTurns.slice(-3).map(({ question: q, answer: a }) => ({ question: q, answer: a })),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(workspaceContext ? { workspaceContext } : {}),
      }),
      signal: controller.signal,
    });

    let payload = null;
    if (!response.ok) {
      try { payload = await response.json(); } catch {}
      throw new Error(payload?.error?.message || `${meta.chatLabel} is temporarily unavailable. Please try again.`);
    }

    const ct = response.headers?.get?.('content-type') || '';
    if (/text\/event-stream/i.test(ct)) {
      await consumeArcCoachStream(response, async (ev, val) => {
        if (controller !== activeController || controller.signal.aborted) return;
        if (ev === 'delta' && typeof val?.text === 'string') {
          receivedDraft += val.text;
          wordReveal.push(val.text);
        } else if (ev === 'reset') {
          streamFellBack = true;
          wordReveal.reset();
          receivedDraft = '';
          if (liveProseEl) {
            liveProseEl.innerHTML = '<span class="ha-arc-thinking"><span class="ha-arc-thinking-dot" aria-hidden="true"></span>Finishing your reply…</span>';
          }
        } else if (ev === 'done') {
          if (!streamFellBack) {
            await wordReveal.finish();
          }
          payload = val;
        }
      }, controller.signal);
    } else {
      payload = await response.json();
    }

    const answer = String(payload?.answer || receivedDraft || '').trim().slice(0, 12000);
    if (!answer) throw new Error(`${meta.chatLabel} did not finish a reply. Please try again.`);

    ensureSheetChatsLoaded(user.uid);
    sheetTurns = [
      ...sheetTurns.slice(-(MAX_LOCAL_TURNS - 1)),
      { question, answer: answer.slice(0, 4000), timestamp: Date.now() },
    ];
    lastCasualGreeting = Boolean(payload?.casualGreeting || payload?.routineDataUsed === false);
    const srcSnap = lastCasualGreeting ? null : payload?.snapshot;
    lastVerifiedSnapshot = srcSnap && [srcSnap.habitCount, srcSnap.totalScheduled, srcSnap.totalLogged].every(Number.isSafeInteger)
      ? { habitCount: srcSnap.habitCount, totalScheduled: srcSnap.totalScheduled, totalLogged: srcSnap.totalLogged }
      : null;
    const deviceCount = app.getHabits?.()?.length;
    lastEvidence = (lastVerifiedSnapshot && Number.isSafeInteger(deviceCount) && deviceCount !== lastVerifiedSnapshot.habitCount)
      ? `Cloud account shows ${lastVerifiedSnapshot.habitCount} habits, but this device shows ${deviceCount}. Check sync before comparing rates.`
      : '';

    activeAction = payload?.suggestedAction || null;
    activeActionApplied = false;
    activeActionAutoCreated = false;
    activeCreatedHabitId = '';
    activePrevHabitPatch = null;
    activeActionUndo = null;
    activeActionDismissed = false;

    let autoMsg = '';
    if (payload?.autoExecute && activeAction) {
      const outcome = executeActionNow(activeAction, { auto: true });
      if (outcome.ok) {
        activeActionApplied = Boolean(outcome.applied);
        activeActionAutoCreated = Boolean(outcome.autoCreated);
        activeCreatedHabitId = outcome.createdHabitId || '';
        activePrevHabitPatch = outcome.prevPatch || null;
        activeActionUndo = outcome.undoData || null;
      }
      autoMsg = outcome.message || '';
    }

    sheetContextApi?.clearAfterSend?.();
    activeController = null;
    persistSheetThreadState(user.uid);
    renderSheetHome();
    if (autoMsg) showStatusMessage(esc(autoMsg));
  } catch (err) {
    activeController = null;
    if (controller.signal.aborted) {
      if (!receivedDraft.trim()) {
        renderSheetHome();
        if (inputEl && !inputEl.value) {
          inputEl.value = question;
          resizeComposerInput();
        }
      }
      showStatusMessage('Stopped response.');
    } else {
      renderSheetHome();
      if (inputEl && !inputEl.value) {
        inputEl.value = question;
        resizeComposerInput();
      }
      showStatusMessage(esc(err?.message || `Could not reach ${meta.chatLabel} right now.`), question);
    }
    syncSendButtonState();
  } finally {
    if (activeController === controller) {
      activeController = null;
      syncSendButtonState();
    }
  }
}

export function startNewSheetChat() {
  activeController?.abort();
  const uid = getActiveUid();
  if (uid && sheetTurns.length) persistSheetThreadState(uid);
  sheetTurns = [];
  sheetChatId = '';
  lastEvidence = '';
  lastVerifiedSnapshot = null;
  lastCasualGreeting = false;
  activeAction = null;
  activeActionApplied = false;
  activeActionAutoCreated = false;
  activeCreatedHabitId = '';
  activePrevHabitPatch = null;
  activeActionUndo = null;
  activeActionDismissed = false;
  if (uid) {
    saveActiveArcChatId(uid, '', getChatStorage(), Date.now());
    void flushSheetCloudChats(uid);
  }
  closeSheetSubDrawers();
  showStatusMessage('');
  renderSheetHome();
}

export function openArcSheetChatById(chatId) {
  if (!dialog) mountArcSheet();
  ensureSheetChatsLoaded(getActiveUid());
  const match = getLiveArcChats(chatThreads).find((c) => c.id === chatId);
  if (match) {
    loadThreadObjectIntoState(match, { syncActiveId: true });
  }
  closeSheetSubDrawers();
  openArcSheet();
}

export function openArcSheet(prefill = '', { autoSubmit = false } = {}) {
  if (!dialog) mountArcSheet();
  if (!dialog) return;
  ensureSheetChatsLoaded(getActiveUid());
  ensureSheetContextMounted();
  closeSheetSubDrawers();
  showStatusMessage('');
  renderSheetHome();

  if (typeof document !== 'undefined') {
    document.documentElement?.classList?.add('ha-arc-sheet-open');
  }
  if (!dialog.open) {
    dialog.showModal();
  }
  attachViewportSync();
  startConstellation();
  void syncCloudChatsInBackground();

  // Never auto-focus the text input on open so Android never pops the keyboard uninvited.
  const backBtn = dialog.querySelector('#ha-arc-sheet-close');
  backBtn?.focus?.({ preventScroll: true });

  if (prefill) {
    if (autoSubmit && window.HabitArc?.getAuthUser?.()) {
      void submitPrompt(prefill);
      return;
    }
    if (inputEl) {
      inputEl.value = prefill;
      resizeComposerInput();
    }
  } else {
    resizeComposerInput();
  }
}

/* ─── Inline Insights Signal Card & Bottom-Right FAB Sync ─────────────────── */
function syncInlineContextualPrompts() {
  if (typeof document === 'undefined') return;
  const app = window.HabitArc;
  if (!app?.getHabits) return;
  const aiName = getAiName();
  const page = currentPage();

  document.getElementById('ha-today-arc-nudge')?.remove();

  const grid28Card = document.getElementById('ha-insights-28d-card');
  let signalCard = document.getElementById('ha-insights-arc-signal');
  if (page === 'Insights.html' && grid28Card) {
    const habits = app.getHabits?.() || [];
    if (habits.length > 0) {
      const { snapshot } = buildHabitCoachContext({
        habits,
        completionHistory: app.getCompletionHistory?.() || [],
        settings: app.getSettings?.() || {},
        now: new Date(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      const dayNames = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
      const scheduledDays = (snapshot.weekdays || []).filter((d) => d.scheduled > 0);
      const weakestDay = [...scheduledDays].sort((a, b) => a.rate - b.rate)[0];
      const strongestDay = snapshot.strongestDay;
      const weakHabitObj = snapshot.weakestHabit ? habits.find((h) => h.id === snapshot.weakestHabit.id) : null;

      let summaryHtml = '';
      let chip1 = { label: '7-day recap ↗', prompt: 'Give me a concise 7-day consistency recap and one focus for next week.' };
      let chip2 = { label: 'Optimize schedule ↗', prompt: 'Review my current habit schedule and suggest one timing adjustment to improve consistency.' };

      if (weakestDay && strongestDay && weakestDay.day !== strongestDay.day) {
        const wLabel = dayNames[weakestDay.day] || weakestDay.day;
        const sLabel = dayNames[strongestDay.day] || strongestDay.day;
        summaryHtml = `${esc(wLabel)} check-ins sit at <strong>${weakestDay.rate}%</strong>, while ${esc(sLabel)} leads at <strong>${strongestDay.rate}%</strong>.`;
        chip1 = {
          label: `Why ${wLabel}s dip? ↗`,
          prompt: `Why do my ${wLabel} habit check-ins dip to ${weakestDay.rate}%, and how can I protect that day?`,
        };
      } else if (weakHabitObj && snapshot.weakestHabit) {
        summaryHtml = `<strong>${esc(weakHabitObj.name)}</strong> is at <strong>${snapshot.weakestHabit.rate}%</strong> over the last 28 days — biggest room for an easy win.`;
      } else {
        summaryHtml = `Logged <strong>${snapshot.total.completed}/${snapshot.total.scheduled}</strong> scheduled check-ins across your 28-day window.`;
      }

      if (weakHabitObj) {
        chip2 = {
          label: `Fix ${clipWords(weakHabitObj.name, 18)} drop-off ↗`,
          prompt: `Give me a friction-free 2-minute version or better cue for "${weakHabitObj.name}" to boost consistency.`,
        };
      }

      if (!signalCard) {
        signalCard = document.createElement('section');
        signalCard.id = 'ha-insights-arc-signal';
        signalCard.className = 'ha-groww-signal-card';
        signalCard.setAttribute('aria-label', `${aiName} 28-day insight`);
        grid28Card.after(signalCard);
      }
      signalCard.hidden = false;
      signalCard.innerHTML = `
        <div class="ha-groww-signal-kicker">✦ ${esc(aiName)} INSIGHT · BASED ON 28D LOGS</div>
        <p class="ha-groww-signal-copy">${summaryHtml}</p>
        <div class="ha-groww-signal-chips">
          <button type="button" class="ha-groww-signal-chip" data-sig-idx="0">${esc(chip1.label)}</button>
          <button type="button" class="ha-groww-signal-chip" data-sig-idx="1">${esc(chip2.label)}</button>
        </div>
      `;
      const pair = [chip1, chip2];
      signalCard.querySelectorAll('[data-sig-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const picked = pair[Number(btn.dataset.sigIdx)];
          if (picked) openArcSheet(picked.prompt, { autoSubmit: true });
        });
      });
    } else if (signalCard) {
      signalCard.hidden = true;
    }
  } else if (signalCard) {
    signalCard.remove();
  }
}

export function syncArcFab() {
  if (!fab) return;
  const page = currentPage();
  const hide = HIDDEN_FAB_PAGES.has(page);
  fab.hidden = hide;
  const aiName = getAiName();
  const label = fab.querySelector('.ha-arc-fab-label');
  if (label) label.textContent = `Ask ${aiName}`;
  fab.setAttribute('aria-label', `Ask ${aiName} AI Assistant`);
  syncInlineContextualPrompts();
}

export function mountArcSheet() {
  if (typeof document === 'undefined' || !document.body) return;
  taskStore.start();

  if (!fab) {
    fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'ha-arc-fab';
    fab.className = 'ha-arc-fab';
    fab.innerHTML = `${BUDDY_FAB_SVG}<span class="ha-arc-fab-label">Ask ARC</span>`;
    fab.addEventListener('click', () => openArcSheet());
    document.body.append(fab);
  }

  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'ha-arc-sheet';
    dialog.className = 'ha-arc-sheet-dialog';
    dialog.setAttribute('aria-labelledby', 'ha-arc-sheet-title');
    dialog.innerHTML = `
      <div class="ha-arc-sheet-panel is-empty" tabindex="-1">
        <canvas id="ha-arc-constellation" class="ha-arc-constellation" aria-hidden="true"></canvas>

        <header class="ha-arc-sheet-head">
          <div class="ha-arc-sheet-brand">
            <button type="button" id="ha-arc-sheet-close" class="ha-arc-sheet-back" autofocus aria-label="Back">${BACK_SVG}</button>
          </div>
          <h2 id="ha-arc-sheet-title" class="ha-arc-sheet-title">ARC</h2>
          <div class="ha-arc-sheet-actions">
            <button type="button" id="ha-arc-sheet-history-btn" class="ha-arc-sheet-hist" aria-label="Saved chats" title="Saved chats">
              ${CHATS_SVG}
              <span id="ha-arc-sheet-hist-count" class="ha-sheet-hist-badge" hidden>0</span>
            </button>
            <button type="button" id="ha-arc-sheet-new" class="ha-arc-sheet-new-btn" aria-label="New chat" title="New chat" hidden>${NEW_CHAT_SVG}</button>
          </div>
        </header>

        <div id="ha-arc-lvlup-banner" class="ha-sheet-lvlup-banner" role="status" aria-live="polite" hidden>
          <span id="ha-arc-lvlup-text">🎉 LEVEL UP!</span>
          <button type="button" id="ha-arc-lvlup-close" class="ha-sheet-lvlup-close">OK</button>
        </div>

        <div class="ha-arc-stage">
          <div id="ha-arc-empty-hero" class="ha-arc-empty-hero">
            <div class="ha-arc-buddy-box">${BUDDY_STAGE_SVG}</div>
            <div class="min-w-0">
              <div id="ha-arc-empty-kicker" class="ha-arc-empty-kicker">ARC STUDIO</div>
              <h1 id="ha-arc-empty-heading" class="ha-arc-empty-heading">What’s on your mind?</h1>
            </div>
          </div>

          <div id="ha-arc-sheet-body" class="ha-arc-sheet-body" aria-live="polite" hidden></div>

          <p id="ha-arc-sheet-status" class="ha-arc-sheet-status" role="status" aria-live="polite"></p>

          <div class="ha-arc-sheet-composer-wrap">
            <div id="ha-arc-sheet-context-host" class="ha-sheet-context-host"></div>
            <div class="ha-arc-beam-frame">
              <form id="ha-arc-sheet-form" class="ha-arc-sheet-form">
                <div id="ha-arc-sheet-context-chips" class="ha-arc-context-chips hidden" aria-label="Attached context"></div>
                <textarea id="ha-arc-sheet-input" class="ha-arc-sheet-input" rows="2" maxlength="1000" placeholder="Ask for a 2-minute backup habit, split a tough task, or audit your 28-day consistency…" autocomplete="off" aria-label="Ask ARC anything"></textarea>
                <div class="ha-arc-composer-foot">
                  <div class="ha-arc-composer-pills">
                    <button type="button" id="ha-arc-sheet-plus" class="ha-arc-sheet-plus" aria-haspopup="dialog" aria-expanded="false" title="Attach Tasks, Focus sessions or Notes" aria-label="Attach Tasks, Focus sessions or Notes"><span id="ha-arc-plus-label">+ Attach</span></button>
                    <button type="button" id="ha-arc-tone-chip" class="ha-arc-tone-chip" aria-label="Open quests, powers and AI voice tones">Coach · LVL 1 ›</button>
                  </div>
                  <button id="ha-arc-sheet-send" class="ha-arc-sheet-send" type="submit" aria-label="Ask ARC"><span>Ask</span><span aria-hidden="true">→</span></button>
                </div>
              </form>
            </div>
          </div>

          <div id="ha-arc-sheet-chips" class="ha-arc-sheet-chips"></div>
        </div>

        <!-- In-Sheet Backdrop + Saved Chats Drawer + Quests/Tones Drawer -->
        <div id="ha-arc-sheet-subbackdrop" class="ha-sheet-subbackdrop" hidden></div>

        <aside id="ha-arc-sheet-hist-drawer" class="ha-sheet-subdrawer is-hist" aria-label="Saved conversations" hidden>
          <div class="ha-sheet-drawer-hdr">
            <div class="min-w-0">
              <div id="ha-sheet-hist-kicker" class="ha-sheet-hist-kicker">ARC STUDIO</div>
              <strong>Saved Chats</strong>
            </div>
            <button type="button" id="ha-sheet-hist-close" class="ha-sheet-drawer-close" aria-label="Close saved chats">${CLOSE_SVG}</button>
          </div>
          <div class="ha-sheet-search-wrap">
            <label class="ha-sheet-search-field" for="ha-sheet-hist-search">
              <span class="ha-sheet-search-ico" aria-hidden="true">${SEARCH_SVG}</span>
              <input type="search" id="ha-sheet-hist-search" class="ha-sheet-search-input" placeholder="Search threads…" autocomplete="off" aria-label="Search saved chats" />
            </label>
            <button type="button" id="ha-sheet-hist-new" class="ha-sheet-new-pill">${PLUS_SM_SVG}<span>New</span></button>
          </div>
          <div id="ha-sheet-hist-list" class="ha-sheet-hist-list" role="list"></div>
          <div id="ha-sheet-hist-empty" class="ha-sheet-hist-empty" hidden>
            <p>Your conversations save here automatically across sessions.</p>
          </div>
          <div class="ha-sheet-hist-foot">
            <span class="ha-sheet-sync-dot" aria-hidden="true"></span>
            <span id="ha-sheet-hist-sync">Saved on this device</span>
          </div>
        </aside>

        <aside id="ha-arc-sheet-hub-drawer" class="ha-sheet-subdrawer is-hub" aria-label="Quests, powers and AI tones" hidden>
          <div id="ha-sheet-hub-body" class="ha-sheet-hub-inner"></div>
        </aside>
      </div>
    `;
    document.body.append(dialog);
    panelEl = dialog.querySelector('.ha-arc-sheet-panel');
    canvasEl = dialog.querySelector('#ha-arc-constellation');
    emptyHeroEl = dialog.querySelector('#ha-arc-empty-hero');
    headingEl = dialog.querySelector('#ha-arc-empty-heading');
    bodyEl = dialog.querySelector('#ha-arc-sheet-body');
    chipsEl = dialog.querySelector('#ha-arc-sheet-chips');
    statusEl = dialog.querySelector('#ha-arc-sheet-status');
    lvlUpBannerEl = dialog.querySelector('#ha-arc-lvlup-banner');
    lvlUpTextEl = dialog.querySelector('#ha-arc-lvlup-text');
    inputEl = dialog.querySelector('#ha-arc-sheet-input');
    sendBtn = dialog.querySelector('#ha-arc-sheet-send');
    plusBtn = dialog.querySelector('#ha-arc-sheet-plus');
    plusLabelEl = dialog.querySelector('#ha-arc-plus-label');
    contextHostEl = dialog.querySelector('#ha-arc-sheet-context-host');
    contextChipsEl = dialog.querySelector('#ha-arc-sheet-context-chips');
    toneChipEl = dialog.querySelector('#ha-arc-tone-chip');
    newChatBtn = dialog.querySelector('#ha-arc-sheet-new');
    histBtnEl = dialog.querySelector('#ha-arc-sheet-history-btn');
    histCountBadgeEl = dialog.querySelector('#ha-arc-sheet-hist-count');

    subBackdropEl = dialog.querySelector('#ha-arc-sheet-subbackdrop');
    histDrawerEl = dialog.querySelector('#ha-arc-sheet-hist-drawer');
    histSearchEl = dialog.querySelector('#ha-sheet-hist-search');
    histListEl = dialog.querySelector('#ha-sheet-hist-list');
    histEmptyEl = dialog.querySelector('#ha-sheet-hist-empty');
    histSyncEl = dialog.querySelector('#ha-sheet-hist-sync');
    hubDrawerEl = dialog.querySelector('#ha-arc-sheet-hub-drawer');
    hubBodyEl = dialog.querySelector('#ha-sheet-hub-body');

    // Code block copy inside answers
    bodyEl?.addEventListener('click', (event) => {
      const copyCodeBtn = event.target?.closest?.('button[data-arc-copy-code]');
      if (!copyCodeBtn) return;
      const src = copyCodeBtn.closest('.ha-arc-code-frame')?.querySelector('pre code')?.textContent;
      if (typeof src !== 'string' || !navigator.clipboard?.writeText) return;
      void navigator.clipboard.writeText(src).then(() => {
        copyCodeBtn.textContent = 'COPIED';
        setTimeout(() => { if (copyCodeBtn.isConnected) copyCodeBtn.textContent = 'COPY CODE'; }, 1400);
      }).catch(() => {});
    });

    bodyEl?.addEventListener('scroll', () => {
      const gap = (bodyEl.scrollHeight || 0) - (bodyEl.scrollTop || 0) - (bodyEl.clientHeight || 0);
      followLatestScroll = gap <= 100;
    }, { passive: true });

    inputEl?.addEventListener('input', resizeComposerInput);
    inputEl?.addEventListener('focus', () => {
      syncSheetViewport();
      setTimeout(syncSheetViewport, 60);
      setTimeout(syncSheetViewport, 220);
    });
    inputEl?.addEventListener('blur', () => {
      syncSheetViewport();
      setTimeout(syncSheetViewport, 80);
      setTimeout(syncSheetViewport, 220);
      setTimeout(syncSheetViewport, 420);
    });
    inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.innerWidth >= 768) {
        e.preventDefault();
        void submitPrompt(inputEl.value || '');
      }
    });

    histBtnEl?.addEventListener('click', () => {
      if (histDrawerEl && !histDrawerEl.hidden) closeSheetSubDrawers();
      else openSheetHistoryDrawer();
    });
    toneChipEl?.addEventListener('click', () => {
      if (hubDrawerEl && !hubDrawerEl.hidden) closeSheetSubDrawers();
      else openSheetHubDrawer();
    });
    subBackdropEl?.addEventListener('click', closeSheetSubDrawers);
    dialog.querySelector('#ha-sheet-hist-close')?.addEventListener('click', closeSheetSubDrawers);
    dialog.querySelector('#ha-sheet-hist-new')?.addEventListener('click', () => {
      startNewSheetChat();
    });
    histSearchEl?.addEventListener('input', renderSheetHistoryDrawer);

    histDrawerEl?.addEventListener('click', (event) => {
      if (!openHistMenuChatId) return;
      const t = event.target;
      if (t?.closest?.('.ha-sheet-hist-pop') || t?.closest?.('[data-sheet-chat-menu]')) return;
      openHistMenuChatId = '';
      renderSheetHistoryDrawer();
    });

    histListEl?.addEventListener('click', (event) => {
      const target = event.target;
      const menuBtn = target?.closest?.('[data-sheet-chat-menu]');
      if (menuBtn) {
        const id = menuBtn.getAttribute('data-sheet-chat-menu') || '';
        openHistMenuChatId = openHistMenuChatId === id ? '' : id;
        renderSheetHistoryDrawer();
        return;
      }
      const pinBtn = target?.closest?.('[data-sheet-chat-pin]');
      if (pinBtn) {
        const id = pinBtn.getAttribute('data-sheet-chat-pin');
        const uid = getActiveUid();
        openHistMenuChatId = '';
        if (id && uid) {
          chatThreads = togglePinArcChat(chatThreads, id, Date.now());
          chatThreads = saveLocalArcChats(uid, chatThreads, getChatStorage());
          void flushSheetCloudChats(uid);
          renderSheetHistoryDrawer();
        }
        return;
      }
      const renBtn = target?.closest?.('[data-sheet-chat-rename]');
      if (renBtn) {
        const id = renBtn.getAttribute('data-sheet-chat-rename');
        openHistMenuChatId = '';
        if (id) {
          renamingChatId = id;
          renderSheetHistoryDrawer();
          const inp = histListEl.querySelector(`[data-sheet-rename-input="${id}"]`);
          inp?.focus?.();
          inp?.select?.();
        }
        return;
      }
      const saveRen = target?.closest?.('[data-sheet-rename-save]');
      if (saveRen) {
        const id = saveRen.getAttribute('data-sheet-rename-save');
        const inp = histListEl.querySelector(`[data-sheet-rename-input="${id}"]`);
        const nextTitle = String(inp?.value || '').trim();
        const uid = getActiveUid();
        renamingChatId = '';
        if (id && nextTitle && uid) {
          chatThreads = renameArcChat(chatThreads, id, nextTitle, Date.now());
          chatThreads = saveLocalArcChats(uid, chatThreads, getChatStorage());
          void flushSheetCloudChats(uid);
        }
        renderSheetHistoryDrawer();
        if (!sheetTurns.length) renderSheetHome();
        return;
      }
      const cancelRen = target?.closest?.('[data-sheet-rename-cancel]');
      if (cancelRen) {
        renamingChatId = '';
        renderSheetHistoryDrawer();
        return;
      }
      const delBtn = target?.closest?.('[data-sheet-chat-del]');
      if (delBtn) {
        const id = delBtn.getAttribute('data-sheet-chat-del');
        const uid = getActiveUid();
        openHistMenuChatId = '';
        if (id && uid) {
          const nowMs = Date.now();
          chatThreads = deleteArcChat(chatThreads, id, nowMs);
          chatThreads = saveLocalArcChats(uid, chatThreads, getChatStorage());
          if (id === sheetChatId) {
            sheetTurns = [];
            sheetChatId = '';
            saveActiveArcChatId(uid, '', getChatStorage(), nowMs);
          }
          void flushSheetCloudChats(uid);
          renderSheetHistoryDrawer();
          renderSheetHome();
        }
        return;
      }
      const openBtn = target?.closest?.('[data-sheet-chat-open]');
      if (openBtn) {
        openHistMenuChatId = '';
        const id = openBtn.getAttribute('data-sheet-chat-open');
        const thread = getLiveArcChats(chatThreads).find((c) => c.id === id);
        if (thread) {
          loadThreadObjectIntoState(thread, { syncActiveId: true });
          closeSheetSubDrawers();
          renderSheetHome();
          scrollThreadToLatest(true);
        }
      }
    });

    histListEl?.addEventListener('keydown', (event) => {
      const inp = event.target?.closest?.('[data-sheet-rename-input]');
      if (!inp) return;
      const id = inp.getAttribute('data-sheet-rename-input');
      if (event.key === 'Enter') {
        event.preventDefault();
        const nextTitle = String(inp.value || '').trim();
        const uid = getActiveUid();
        renamingChatId = '';
        if (id && nextTitle && uid) {
          chatThreads = renameArcChat(chatThreads, id, nextTitle, Date.now());
          chatThreads = saveLocalArcChats(uid, chatThreads, getChatStorage());
          void flushSheetCloudChats(uid);
        }
        renderSheetHistoryDrawer();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        renamingChatId = '';
        renderSheetHistoryDrawer();
      }
    });

    dialog.querySelector('#ha-arc-lvlup-close')?.addEventListener('click', () => {
      if (lvlUpBannerEl) lvlUpBannerEl.hidden = true;
    });

    newChatBtn?.addEventListener('click', startNewSheetChat);

    dialog.querySelector('#ha-arc-sheet-close')?.addEventListener('click', () => {
      dialog.close();
    });
    dialog.addEventListener('cancel', (e) => {
      if (openHistMenuChatId) {
        e.preventDefault();
        openHistMenuChatId = '';
        renderSheetHistoryDrawer();
        return;
      }
      if ((histDrawerEl && !histDrawerEl.hidden) || (hubDrawerEl && !hubDrawerEl.hidden)) {
        e.preventDefault();
        closeSheetSubDrawers();
        return;
      }
      cleanupClosedState();
    });
    dialog.addEventListener('close', () => {
      cleanupClosedState();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.close();
      }
    });
    dialog.querySelector('#ha-arc-sheet-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (activeController) {
        activeController.abort();
        return;
      }
      void submitPrompt(inputEl?.value || '');
    });
    taskStore.subscribe(() => syncInlineContextualPrompts());
  }

  syncArcFab();
  window.HabitArcSheet = {
    open: openArcSheet,
    openChat: openArcSheetChatById,
    openHistory: openSheetHistoryDrawer,
    openHub: openSheetHubDrawer,
    sync: syncArcFab,
    mount: mountArcSheet,
  };
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('habitarc:data-changed', () => {
    syncArcFab();
    if (dialog?.open) syncComposerChrome();
  });
  window.addEventListener('habitarc:ai-level-up', (event) => {
    const d = event?.detail;
    if (dialog?.open && d?.toLevel > d?.fromLevel) {
      showLevelUpBanner(d.fromLevel, d.toLevel, d.prog || getAiMeta());
    }
  });
  window.addEventListener('habitarc-auth-state-changed', () => {
    hydratedChatUid = '';
    cloudSyncCompletedUid = '';
    subscribedCloudUid = '';
    chatThreads = [];
    sheetTurns = [];
    sheetChatId = '';
    syncArcFab();
  });
}
