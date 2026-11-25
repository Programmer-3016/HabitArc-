// Bottom-Right [ Ask ARC ] Pill + Dark Constellation & Prompt-First Center Stage Studio (Design 7 + Live 5).
import {
  buildHabitCoachContext,
  consumeArcCoachStream,
  renderArcChatAnswer,
} from './habit-analytics.js';
import {
  generateArcChatId,
  getLiveArcChats,
  loadLocalArcChats,
  loadActiveArcChatId,
  upsertArcChat,
  saveLocalArcChats,
  saveActiveArcChatId,
} from './arc-chat-store.js';
import { taskStore, newTask, localDay } from './task-store.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const HIDDEN_FAB_PAGES = new Set(['Arc_AI.html', 'Add_Habit.html', 'Onboarding.html', 'offline.html', 'privacy.html']);

const BUDDY_FAB_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="7" y="1" width="2" height="2" fill="#47e393"/><rect x="4" y="4" width="8" height="1" fill="#ffffff"/><rect x="3" y="5" width="1" height="8" fill="#ffffff"/><rect x="12" y="5" width="1" height="8" fill="#ffffff"/><rect x="4" y="5" width="8" height="8" fill="#c5b6ff"/><rect x="5" y="7" width="2" height="2" fill="#121215"/><rect x="9" y="7" width="2" height="2" fill="#121215"/></svg>';
const BUDDY_STAGE_SVG = '<svg width="28" height="28" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect class="ha-arc-buddy-antenna" x="7" y="1" width="2" height="2"/><rect class="ha-arc-buddy-body" x="4" y="4" width="8" height="9"/><rect class="ha-arc-buddy-body" x="3" y="5" width="10" height="7"/><g class="ha-arc-buddy-eyes"><rect class="ha-arc-buddy-eye" x="5" y="7" width="2" height="2"/><rect class="ha-arc-buddy-eye" x="9" y="7" width="2" height="2"/></g></svg>';
const SEND_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const STOP_SVG = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2"/></svg>';
const BACK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
const CHATS_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>';

let fab = null;
let dialog = null;
let panelEl = null;
let canvasEl = null;
let emptyHeroEl = null;
let headingEl = null;
let bodyEl = null;
let chipsEl = null;
let statusEl = null;
let inputEl = null;
let sendBtn = null;
let plusBtn = null;
let toneChipEl = null;
let newChatBtn = null;
let histLinkEl = null;
let lvlPillEl = null;
let activeController = null;
let includeTasksCtx = true;
let sheetTurns = [];
let sheetChatId = '';
let lastFailedQuestion = '';
let vvCleanup = null;
let baselineMobileHeight = 0;
let constellationRaf = 0;
let constellationPts = [];

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

function getAiName() {
  const raw = window.HabitArc?.getSettings?.()?.aiName;
  return window.HabitArc?.normaliseAiName?.(raw) || (raw && String(raw).trim()) || 'ARC';
}

function getAiLevelMeta() {
  const prog = window.HabitArc?.getAiProgression?.();
  return {
    level: prog?.level || 1,
    tone: prog?.activeTone || 'Coach',
  };
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

// Finds the most recent saved conversation so Design 7 can offer 1-tap "Continue: <title>"
// while keeping a fresh empty-chat opening experience clean.
function hydrateSavedSheetSession(loadIntoThread = false) {
  const uid = getActiveUid();
  try {
    const { chats } = loadLocalArcChats(uid);
    const live = getLiveArcChats(chats).filter((c) => Array.isArray(c.turns) && c.turns.length > 0);
    const activeId = loadActiveArcChatId(uid);
    const preferred = (activeId && live.find((c) => c.id === activeId)) || live[0] || null;
    if (loadIntoThread && preferred) {
      sheetChatId = preferred.id;
      sheetTurns = preferred.turns.map((t, idx) => ({
        question: t.question,
        answer: t.answer,
        timestamp: t.timestamp || Date.now(),
        action: idx === preferred.turns.length - 1 ? (preferred.lastAction || null) : null,
        actionApplied: Boolean(preferred.lastActionApplied),
        actionDismissed: false,
      }));
    }
    return { recentChat: preferred, totalSaved: live.length };
  } catch {
    return { recentChat: null, totalSaved: 0 };
  }
}

/* ─── 60fps Neural Constellation Background Canvas ────────────────────────── */
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
  const primaryRgb = toCsv(cs.getPropertyValue('--ha-primary'), isLightTheme ? '124, 58, 237' : '197, 182, 255');
  const secondaryRgb = toCsv(cs.getPropertyValue('--ha-secondary'), isLightTheme ? '16, 122, 87' : '71, 227, 147');
  return {
    primaryRgb,
    secondaryRgb,
    lineAlpha: isLightTheme ? 0.15 : 0.2,
    dotAlpha: isLightTheme ? 0.46 : 0.72,
  };
}

function startConstellation() {
  stopConstellation();
  if (!canvasEl || typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  const ctx = canvasEl.getContext?.('2d');
  if (!ctx) return;
  resizeConstellationCanvas();
  let palette = readThemeConstellationPalette();
  let frameCount = 0;

  const step = () => {
    if (!dialog?.open || !canvasEl?.isConnected) {
      constellationRaf = 0;
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
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const dist = Math.hypot(dx, dy);
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
  if (kbOpen && !wasKbOpen && bodyEl && !bodyEl.hidden) {
    bodyEl.scrollTop = bodyEl.scrollHeight;
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

function cleanupClosedState() {
  activeController?.abort();
  stopConstellation();
  detachViewportSync();
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

function syncComposerChrome(totalDone = 0, totalItems = 0) {
  const isEmptyMode = sheetTurns.length === 0 && !activeController;
  panelEl?.classList?.toggle('is-empty', isEmptyMode);
  panelEl?.classList?.toggle('is-thread', !isEmptyMode);

  if (plusBtn) {
    plusBtn.setAttribute('aria-pressed', String(includeTasksCtx));
    if (isEmptyMode) {
      const counts = totalItems > 0 ? `${totalDone}/${totalItems}` : 'On';
      plusBtn.textContent = includeTasksCtx ? `✓ Today ${counts}` : '+ Attach Today';
    } else {
      plusBtn.textContent = '+';
    }
  }

  const { level } = getAiLevelMeta();
  if (toneChipEl) {
    toneChipEl.textContent = `Tone: Coach · L${level}`;
  }
  if (lvlPillEl) {
    lvlPillEl.textContent = `LVL ${level}`;
  }

  if (inputEl) {
    const aiName = getAiName();
    inputEl.rows = isEmptyMode ? 2 : 1;
    inputEl.placeholder = isEmptyMode
      ? 'Ask for a 2-minute backup habit, split a tough task, or audit your 28-day consistency…'
      : `Ask ${aiName} anything…`;
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
    sendBtn.setAttribute('aria-label', 'Ask ARC');
  } else {
    sendBtn.innerHTML = SEND_SVG;
    sendBtn.setAttribute('aria-label', 'Send message');
  }
}

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

  const ctxParts = [];
  if (page === 'Insights.html') ctxParts.push('INSIGHTS · 28D LOGS');
  else if (page === 'Notes.html') ctxParts.push('NOTES STUDIO');
  else if (page === 'Habits.html') ctxParts.push('PLAN & SCHEDULE');
  else ctxParts.push(`TODAY (${totalDone}/${totalItems} DONE)`);
  if (nextHabit) ctxParts.push(nextHabit.name.slice(0, 24));
  else if (nextTask) ctxParts.push(nextTask.title.slice(0, 24));
  const ctxPill = `CONTEXT · ${ctxParts.join(' · ')}`;

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

  return { firstName, ctxPill, chips, totalDone, totalItems };
}

function buildWorkspaceContextPayload() {
  if (!includeTasksCtx) return undefined;
  const list = (taskStore.getTasks?.() || []).slice(0, 10).map((t) => ({
    title: String(t.title || '').trim().slice(0, 140),
    dueDate: String(t.dueDate || ''),
    priority: ['none', 'low', 'medium', 'high'].includes(t.priority) ? t.priority : 'none',
    completed: Boolean(t.completed),
  })).filter((t) => t.title);
  if (!list.length) return undefined;
  return { tasks: list };
}

function describeDraftAction(action) {
  if (!action || typeof action !== 'object') return null;
  if (action.type === 'create_habit' && action.name) {
    return {
      title: `Create habit "${action.name}"`,
      desc: `${action.category || 'Focus'} routine${action.reminder ? ` · Reminder at ${action.reminder}` : ''} · Daily schedule`,
    };
  }
  if (action.type === 'create_task' && action.title) {
    return {
      title: `Add task "${action.title}"`,
      desc: `Due ${action.dueDate || localDay()} · ${(action.priority || 'medium').toUpperCase()} priority`,
    };
  }
  if (action.type === 'complete_habit' && (action.name || action.habitId)) {
    return {
      title: `Mark "${action.name || 'Habit'}" completed today`,
      desc: 'Logs today’s completion on your schedule.',
    };
  }
  return null;
}

function applySuggestedAction(action) {
  const app = window.HabitArc;
  if (!action || !app) return 'Action unavailable.';
  if (action.type === 'create_habit' && action.name) {
    const res = app.addHabit?.({
      name: String(action.name).slice(0, 60),
      category: action.category || 'Focus',
      reminder: action.reminder || '',
      repeat: Array.isArray(action.repeat) && action.repeat.length ? action.repeat : ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      why: action.why || '',
    });
    return res?.success ? `Saved habit "${action.name}".` : 'Habit already exists or could not be added.';
  }
  if (action.type === 'create_task' && action.title) {
    taskStore.start();
    taskStore.put(newTask({
      title: String(action.title).slice(0, 140),
      dueDate: action.dueDate || localDay(),
      priority: action.priority || 'medium',
    }));
    return `Saved task "${action.title}".`;
  }
  if (action.type === 'complete_habit') {
    const habits = app.getHabits?.() || [];
    const match = habits.find((h) => h.id === action.habitId || h.name?.toLowerCase() === String(action.name || '').toLowerCase());
    if (match) {
      app.completeHabit?.(match.id);
      return `Marked "${match.name}" complete for today.`;
    }
  }
  return '';
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
  const { firstName, ctxPill, chips, totalDone, totalItems } = buildContextSummary();
  const { recentChat, totalSaved } = hydrateSavedSheetSession(false);

  if (histLinkEl) {
    histLinkEl.innerHTML = `${CHATS_SVG}<span>${totalSaved > 0 ? `Recent (${totalSaved})` : 'History'}</span>`;
  }
  if (newChatBtn) newChatBtn.hidden = sheetTurns.length === 0;
  if (headingEl) {
    headingEl.textContent = firstName && firstName !== 'there'
      ? `What’s on your mind, ${firstName}?`
      : 'What’s on your mind today?';
  }

  syncComposerChrome(totalDone, totalItems);

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
    });
  } else {
    if (emptyHeroEl) emptyHeroEl.hidden = true;
    chipsEl.hidden = true;
    bodyEl.hidden = false;

    const turnsMarkup = sheetTurns.map((t, idx) => {
      const meta = describeDraftAction(t.action);
      let draftCard = '';
      if (meta && !t.actionDismissed) {
        draftCard = t.actionApplied
          ? `<div class="ha-arc-draft-card"><div class="ha-arc-draft-kicker">✓ SAVED TO WORKSPACE</div><div class="ha-arc-draft-title">${esc(meta.title)}</div></div>`
          : `<div class="ha-arc-draft-card">
              <div class="ha-arc-draft-kicker">DRAFT ACTION · REVIEW TO APPLY</div>
              <div class="ha-arc-draft-title">${esc(meta.title)}</div>
              <div class="ha-arc-draft-desc">${esc(meta.desc)}</div>
              <div class="ha-arc-draft-actions">
                <button type="button" class="ha-arc-draft-dismiss" data-dismiss-turn="${idx}">Not now</button>
                <button type="button" class="ha-arc-draft-approve" data-apply-turn="${idx}">✓ Approve &amp; Save</button>
              </div>
            </div>`;
      }
      const isLast = idx === sheetTurns.length - 1;
      const followups = isLast
        ? `<div class="ha-arc-turn-followups">
            <button type="button" class="ha-arc-turn-fchip" data-fprompt="Give me a 2-minute fallback plan for tired days">2-min Plan-B ↗</button>
            <button type="button" class="ha-arc-turn-fchip" data-fprompt="Show my 7-day consistency recap">Show 7d recap ↗</button>
          </div>`
        : '';
      return `<div class="ha-arc-sheet-user">${esc(t.question)}</div>` +
        `<div class="ha-arc-sheet-reply">${renderArcChatAnswer(t.answer, esc)}${draftCard}${followups}</div>`;
    }).join('');

    bodyEl.innerHTML = `<div class="ha-arc-ctx-pill">${esc(ctxPill)}</div>${turnsMarkup}`;

    bodyEl.querySelectorAll('[data-apply-turn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const turn = sheetTurns[Number(btn.dataset.applyTurn)];
        if (!turn?.action) return;
        const msg = applySuggestedAction(turn.action);
        turn.actionApplied = true;
        if (msg) showStatusMessage(esc(msg));
        renderSheetHome();
      });
    });
    bodyEl.querySelectorAll('[data-dismiss-turn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const turn = sheetTurns[Number(btn.dataset.dismissTurn)];
        if (!turn) return;
        turn.actionDismissed = true;
        renderSheetHome();
      });
    });
    bodyEl.querySelectorAll('[data-fprompt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void submitPrompt(btn.dataset.fprompt || '');
      });
    });
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
}

async function submitPrompt(rawText) {
  const question = String(rawText || '').trim().slice(0, 1000);
  if (!question || activeController) return;
  const app = window.HabitArc;
  const user = app?.getAuthUser?.();
  if (!user) {
    if (inputEl) {
      inputEl.value = question;
      resizeComposerInput();
    }
    showStatusMessage('Sign in from <a href="Profile.html" id="ha-arc-signin-link" style="text-decoration:underline;font-weight:700;">Profile</a> to send live AI prompts.');
    statusEl?.querySelector('#ha-arc-signin-link')?.addEventListener('click', () => dialog?.close());
    return;
  }

  const controller = new AbortController();
  activeController = controller;

  const { ctxPill, totalDone, totalItems } = buildContextSummary();
  if (emptyHeroEl) emptyHeroEl.hidden = true;
  chipsEl.hidden = true;
  bodyEl.hidden = false;

  if (inputEl) {
    inputEl.value = '';
    inputEl.blur();
  }
  showStatusMessage('');
  syncComposerChrome(totalDone, totalItems);

  const userBubble = document.createElement('div');
  userBubble.className = 'ha-arc-sheet-user';
  userBubble.textContent = question;
  const replyBubble = document.createElement('div');
  replyBubble.className = 'ha-arc-sheet-reply';
  replyBubble.innerHTML = '<span class="ha-arc-thinking"><span class="ha-arc-thinking-dot" aria-hidden="true"></span>Thinking…</span>';
  if (!sheetTurns.length) {
    bodyEl.innerHTML = `<div class="ha-arc-ctx-pill">${esc(ctxPill)}</div>`;
  }
  bodyEl.append(userBubble, replyBubble);
  bodyEl.scrollTop = bodyEl.scrollHeight;

  let draft = '';
  try {
    await app.flushCloudSync?.();
    const idToken = await app.getAuthToken();
    const workspaceContext = buildWorkspaceContextPayload();
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
      throw new Error(payload?.error?.message || 'ARC is temporarily unavailable. Please try again.');
    }

    const ct = response.headers?.get?.('content-type') || '';
    if (/text\/event-stream/i.test(ct)) {
      await consumeArcCoachStream(response, async (ev, val) => {
        if (ev === 'delta' && typeof val?.text === 'string') {
          draft += val.text;
          replyBubble.innerHTML = renderArcChatAnswer(draft, esc);
          bodyEl.scrollTop = bodyEl.scrollHeight;
        } else if (ev === 'reset') {
          draft = '';
          replyBubble.innerHTML = '<span class="ha-arc-thinking"><span class="ha-arc-thinking-dot" aria-hidden="true"></span>Finishing reply…</span>';
        } else if (ev === 'done') {
          payload = val;
        }
      }, controller.signal);
    } else {
      payload = await response.json();
    }

    const answer = String(payload?.answer || draft || '').trim();
    if (!answer) throw new Error('ARC did not finish a reply. Please try again.');

    const action = payload?.suggestedAction || null;
    sheetTurns.push({ question, answer, action, actionApplied: false, actionDismissed: false, timestamp: Date.now() });

    try {
      const uid = user.uid || 'local';
      const nowMs = Date.now();
      if (!sheetChatId) sheetChatId = generateArcChatId(nowMs);
      const { chats } = loadLocalArcChats(uid);
      const existing = chats.find((c) => c.id === sheetChatId);
      const updated = upsertArcChat(chats, {
        id: sheetChatId,
        createdAt: existing?.createdAt || nowMs,
        updatedAt: nowMs,
        turns: sheetTurns.map(({ question: q, answer: a, timestamp }) => ({ question: q, answer: a, timestamp })),
        lastAction: action,
        lastActionApplied: false,
      }, nowMs);
      saveLocalArcChats(uid, updated);
      saveActiveArcChatId(uid, sheetChatId, undefined, nowMs);
    } catch { /* Non-blocking chat archive */ }

    activeController = null;
    renderSheetHome();
  } catch (err) {
    activeController = null;
    if (controller.signal.aborted) {
      if (!draft.trim()) {
        replyBubble.remove();
        userBubble.remove();
        if (!sheetTurns.length) renderSheetHome();
        if (inputEl && !inputEl.value) {
          inputEl.value = question;
          resizeComposerInput();
        }
      }
      showStatusMessage('Stopped response.');
    } else {
      replyBubble.remove();
      userBubble.remove();
      if (!sheetTurns.length) renderSheetHome();
      if (inputEl && !inputEl.value) {
        inputEl.value = question;
        resizeComposerInput();
      }
      showStatusMessage(esc(err?.message || 'Could not reach ARC right now.'), question);
    }
    syncSendButtonState();
  } finally {
    if (activeController === controller) {
      activeController = null;
      syncSendButtonState();
    }
  }
}

export function openArcSheet(prefill = '', { autoSubmit = false } = {}) {
  if (!dialog) mountArcSheet();
  if (!dialog) return;
  const aiName = getAiName();
  const titleNode = dialog.querySelector('#ha-arc-sheet-title');
  if (titleNode) titleNode.textContent = aiName;
  const kickerNode = dialog.querySelector('#ha-arc-empty-kicker');
  if (kickerNode) kickerNode.textContent = `${aiName} STUDIO · LIVE SYNC`;
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

function syncInlineContextualPrompts() {
  if (typeof document === 'undefined') return;
  const app = window.HabitArc;
  if (!app?.getHabits) return;
  const aiName = getAiName();
  const page = currentPage();

  // Keep bottom-right [ Ask ARC ] pill unobstructed on Today.
  document.getElementById('ha-today-arc-nudge')?.remove();

  // Insights (Insights.html) — Quiet ✦ ARC INSIGHT card below Monthly Activity Grid
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
            <div class="ha-arc-head-thread-meta">
              <div class="min-w-0">
                <h2 id="ha-arc-sheet-title" class="ha-arc-sheet-title">ARC</h2>
                <p class="ha-arc-sheet-sub">● LIVE SYNC</p>
              </div>
            </div>
          </div>
          <div class="ha-arc-sheet-actions">
            <button type="button" id="ha-arc-sheet-new" class="ha-arc-sheet-new-btn" hidden>+ New</button>
            <a href="Arc_AI.html" id="ha-arc-sheet-history-link" class="ha-arc-sheet-hist">${CHATS_SVG}<span>History</span></a>
            <a href="Arc_AI.html" id="ha-arc-sheet-lvl-pill" class="ha-arc-lvl-pill">LVL 1</a>
          </div>
        </header>

        <div class="ha-arc-stage">
          <div id="ha-arc-empty-hero" class="ha-arc-empty-hero">
            <div class="ha-arc-buddy-box">${BUDDY_STAGE_SVG}</div>
            <div class="min-w-0">
              <div id="ha-arc-empty-kicker" class="ha-arc-empty-kicker">ARC STUDIO · LIVE SYNC</div>
              <h1 id="ha-arc-empty-heading" class="ha-arc-empty-heading">What’s on your mind?</h1>
            </div>
          </div>

          <div id="ha-arc-sheet-body" class="ha-arc-sheet-body" aria-live="polite" hidden></div>

          <p id="ha-arc-sheet-status" class="ha-arc-sheet-status" role="status" aria-live="polite"></p>

          <div class="ha-arc-sheet-composer-wrap">
            <div class="ha-arc-beam-frame">
              <form id="ha-arc-sheet-form" class="ha-arc-sheet-form">
                <textarea id="ha-arc-sheet-input" class="ha-arc-sheet-input" rows="2" maxlength="1000" placeholder="Ask for a 2-minute backup habit, split a tough task, or audit your 28-day consistency…" autocomplete="off" aria-label="Ask ARC anything"></textarea>
                <div class="ha-arc-composer-foot">
                  <div class="ha-arc-composer-pills">
                    <button type="button" id="ha-arc-sheet-plus" class="ha-arc-sheet-plus" aria-pressed="true" title="Toggle Today & Tasks context" aria-label="Toggle Today and Tasks context">✓ Today</button>
                    <span id="ha-arc-tone-chip" class="ha-arc-tone-chip">Tone: Coach</span>
                  </div>
                  <button id="ha-arc-sheet-send" class="ha-arc-sheet-send" type="submit" aria-label="Ask ARC"><span>Ask</span><span aria-hidden="true">→</span></button>
                </div>
              </form>
            </div>
          </div>

          <div id="ha-arc-sheet-chips" class="ha-arc-sheet-chips"></div>
        </div>
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
    inputEl = dialog.querySelector('#ha-arc-sheet-input');
    sendBtn = dialog.querySelector('#ha-arc-sheet-send');
    plusBtn = dialog.querySelector('#ha-arc-sheet-plus');
    toneChipEl = dialog.querySelector('#ha-arc-tone-chip');
    newChatBtn = dialog.querySelector('#ha-arc-sheet-new');
    histLinkEl = dialog.querySelector('#ha-arc-sheet-history-link');
    lvlPillEl = dialog.querySelector('#ha-arc-sheet-lvl-pill');

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

    plusBtn?.addEventListener('click', () => {
      includeTasksCtx = !includeTasksCtx;
      const { totalDone, totalItems } = buildContextSummary();
      syncComposerChrome(totalDone, totalItems);
      showStatusMessage(includeTasksCtx
        ? 'Today & Tasks context attached.'
        : 'Today & Tasks context detached for next message.');
    });

    newChatBtn?.addEventListener('click', () => {
      activeController?.abort();
      sheetTurns = [];
      sheetChatId = '';
      showStatusMessage('');
      renderSheetHome();
    });

    dialog.querySelector('#ha-arc-sheet-close')?.addEventListener('click', () => {
      dialog.close();
    });
    dialog.querySelector('#ha-arc-sheet-history-link')?.addEventListener('click', () => {
      dialog.close();
    });
    dialog.querySelector('#ha-arc-sheet-lvl-pill')?.addEventListener('click', () => {
      dialog.close();
    });
    dialog.addEventListener('cancel', () => {
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
  window.HabitArcSheet = { open: openArcSheet, sync: syncArcFab, mount: mountArcSheet };
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('habitarc:data-changed', syncArcFab);
  window.addEventListener('habitarc-auth-state-changed', () => {
    sheetTurns = [];
    sheetChatId = '';
    syncArcFab();
  });
}
