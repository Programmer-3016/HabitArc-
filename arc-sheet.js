// Placement B — Global Floating [ Ask ARC ] Corner Pill & Contextual Slide-Up Sheet.
import { consumeArcCoachStream, renderArcChatAnswer } from './habit-analytics.js';
import {
  generateArcChatId,
  loadLocalArcChats,
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
const BUDDY_SHEET_SVG = '<svg width="17" height="17" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="7" y="1" width="2" height="2" fill="#7c3aed"/><rect x="4" y="4" width="8" height="1" fill="#121215"/><rect x="3" y="5" width="1" height="8" fill="#121215"/><rect x="12" y="5" width="1" height="8" fill="#121215"/><rect x="4" y="5" width="8" height="8" fill="#121215"/><rect x="5" y="7" width="2" height="2" fill="#ffffff"/><rect x="9" y="7" width="2" height="2" fill="#ffffff"/></svg>';
const SEND_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

let fab = null;
let dialog = null;
let bodyEl = null;
let chipsEl = null;
let statusEl = null;
let inputEl = null;
let sendBtn = null;
let activeController = null;
let sheetTurns = [];
let sheetChatId = '';

function currentPage() {
  return (typeof location === 'object' ? location.pathname.split('/').pop() : '') || 'Dashboard.html';
}

function getAiName() {
  const raw = window.HabitArc?.getSettings?.()?.aiName;
  return window.HabitArc?.normaliseAiName?.(raw) || (raw && String(raw).trim()) || 'ARC';
}

function buildContextSummary() {
  const app = window.HabitArc;
  const firstName = (app?.getAuthUser?.()?.displayName || app?.getSettings?.()?.userName || 'there').trim().split(/\s+/)[0] || 'there';
  const habits = app?.getTodayHabits?.() || app?.getHabits?.() || [];
  const tasks = (taskStore.getTasks?.() || []).filter((t) => t.dueDate === localDay());
  const habitsDone = habits.filter((h) => app?.isCompletedToday?.(h.id)).length;
  const tasksDone = tasks.filter((t) => t.completed).length;
  const totalItems = habits.length + tasks.length;
  const totalDone = habitsDone + tasksDone;
  const nextHabit = habits.find((h) => !app?.isCompletedToday?.(h.id));
  const nextTask = tasks.find((t) => !t.completed);
  const overdueCount = (taskStore.getTasks?.() || []).filter((t) => !t.completed && t.dueDate && t.dueDate < localDay()).length;

  let greeting = `Hey <strong>${esc(firstName)}</strong>! `;
  if (!totalItems) {
    greeting += 'Ready to design a simple daily routine or plan your first task?';
  } else if (totalDone >= totalItems) {
    greeting += `You’re <strong>${totalDone}/${totalItems} done</strong> today — clean sweep! Want a quick weekly recap or tomorrow’s plan?`;
  } else {
    greeting += `You’re <strong>${totalDone}/${totalItems} done</strong> today.`;
    if (nextHabit && nextTask) {
      greeting += ` Want a quick 2-minute backup plan for <strong>${esc(nextHabit.name)}</strong>, or help breaking down <strong>${esc(nextTask.title)}</strong>?`;
    } else if (nextHabit) {
      greeting += ` Want a quick 2-minute backup plan for <strong>${esc(nextHabit.name)}</strong>?`;
    } else if (nextTask) {
      greeting += ` Want help breaking down <strong>${esc(nextTask.title)}</strong> into smaller steps?`;
    }
  }

  const chips = [];
  if (nextHabit) {
    chips.push({
      primary: true,
      label: `⚡ 2-min ${nextHabit.name.slice(0, 22)} backup`,
      prompt: `Give me a 2-minute low-energy backup version of "${nextHabit.name}" so I don't miss today.`,
    });
  } else {
    chips.push({
      primary: true,
      label: '⚡ Spot my routine leaks',
      prompt: 'Audit my recent habit history and point out my biggest consistency drop-off with one small fix.',
    });
  }
  chips.push({
    primary: false,
    label: '📊 Weekly recap',
    prompt: 'Give me a concise 7-day consistency recap with my strongest habit and one focus for this week.',
  });
  if (overdueCount > 0) {
    chips.push({
      primary: false,
      label: `✨ Rescue ${overdueCount} overdue`,
      href: 'Habits.html?section=tasks&rescue=1',
    });
  } else {
    chips.push({
      primary: false,
      label: '✨ Suggest 1 tiny habit',
      prompt: 'Suggest one tiny 2-minute habit that pairs well with my existing routine.',
    });
  }
  return { greeting, chips };
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
    return res?.success ? `Added habit "${action.name}".` : 'Habit already exists or could not be added.';
  }
  if (action.type === 'create_task' && action.title) {
    taskStore.start();
    taskStore.put(newTask({
      title: String(action.title).slice(0, 140),
      dueDate: action.dueDate || localDay(),
      priority: action.priority || 'medium',
    }));
    return `Added task "${action.title}".`;
  }
  return '';
}

function renderSheetHome() {
  if (!bodyEl || !chipsEl) return;
  const { greeting, chips } = buildContextSummary();
  if (!sheetTurns.length) {
    bodyEl.innerHTML = `<div class="ha-arc-sheet-greet">${greeting}</div>`;
    chipsEl.hidden = false;
    chipsEl.innerHTML = chips.map((c, idx) => (
      `<button type="button" class="ha-arc-sheet-chip${c.primary ? ' is-primary' : ''}" data-chip-idx="${idx}">${esc(c.label)}</button>`
    )).join('');
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
  } else {
    chipsEl.hidden = true;
    bodyEl.innerHTML = sheetTurns.map((t, idx) => {
      const actionBtn = t.action && !t.actionApplied
        ? `<div class="ha-arc-sheet-action-bar"><span style="font-size:11.5px;font-weight:700;">Suggested: ${esc(t.action.name || t.action.title || 'Update')}</span><button type="button" class="ha-arc-sheet-apply" data-apply-turn="${idx}">+ Apply</button></div>`
        : (t.actionApplied ? `<div class="ha-arc-sheet-action-bar"><span style="font-size:11.5px;font-weight:700;color:#0e6c4a;">✓ Applied to your workspace</span></div>` : '');
      return `<div class="ha-arc-sheet-user">${esc(t.question)}</div>` +
        `<div class="ha-arc-sheet-reply">${renderArcChatAnswer(t.answer, esc)}${actionBtn}</div>`;
    }).join('');
    bodyEl.querySelectorAll('[data-apply-turn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const turn = sheetTurns[Number(btn.dataset.applyTurn)];
        if (!turn?.action) return;
        const msg = applySuggestedAction(turn.action);
        turn.actionApplied = true;
        if (statusEl && msg) statusEl.textContent = msg;
        renderSheetHome();
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
    if (statusEl) statusEl.innerHTML = 'Sign in from <a href="Profile.html" style="text-decoration:underline;font-weight:700;">Profile</a> to chat with live AI.';
    return;
  }

  if (inputEl) inputEl.value = '';
  if (statusEl) statusEl.textContent = '';
  chipsEl.hidden = true;

  const userBubble = document.createElement('div');
  userBubble.className = 'ha-arc-sheet-user';
  userBubble.textContent = question;
  const replyBubble = document.createElement('div');
  replyBubble.className = 'ha-arc-sheet-reply';
  replyBubble.textContent = 'Thinking…';
  if (!sheetTurns.length) bodyEl.innerHTML = '';
  bodyEl.append(userBubble, replyBubble);
  bodyEl.scrollTop = bodyEl.scrollHeight;

  const controller = new AbortController();
  activeController = controller;
  if (sendBtn) sendBtn.disabled = true;

  try {
    await app.flushCloudSync?.();
    const idToken = await app.getAuthToken();
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
      }),
      signal: controller.signal,
    });

    let payload = null;
    if (!response.ok) {
      try { payload = await response.json(); } catch {}
      throw new Error(payload?.error?.message || 'ARC is temporarily unavailable. Please try again.');
    }

    let draft = '';
    const ct = response.headers?.get?.('content-type') || '';
    if (/text\/event-stream/i.test(ct)) {
      await consumeArcCoachStream(response, async (ev, val) => {
        if (ev === 'delta' && typeof val?.text === 'string') {
          draft += val.text;
          replyBubble.innerHTML = renderArcChatAnswer(draft, esc);
          bodyEl.scrollTop = bodyEl.scrollHeight;
        } else if (ev === 'reset') {
          draft = '';
          replyBubble.textContent = 'Finishing reply…';
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
    let actionApplied = false;
    if (payload?.autoExecute && action) {
      const msg = applySuggestedAction(action);
      if (msg) {
        actionApplied = true;
        if (statusEl) statusEl.textContent = msg;
      }
    }

    sheetTurns.push({ question, answer, action, actionApplied, timestamp: Date.now() });
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
        lastActionApplied: actionApplied,
      }, nowMs);
      saveLocalArcChats(uid, updated);
      saveActiveArcChatId(uid, sheetChatId, undefined, nowMs);
    } catch { /* Non-blocking chat archive */ }

    renderSheetHome();
  } catch (err) {
    if (!controller.signal.aborted) {
      replyBubble.remove();
      userBubble.remove();
      if (inputEl && !inputEl.value) inputEl.value = question;
      if (statusEl) statusEl.textContent = err?.message || 'Could not reach ARC right now.';
      if (!sheetTurns.length) renderSheetHome();
    }
  } finally {
    if (activeController === controller) {
      activeController = null;
      if (sendBtn) sendBtn.disabled = false;
    }
  }
}

export function openArcSheet(prefill = '') {
  if (!dialog) mountArcSheet();
  if (!dialog) return;
  const aiName = getAiName();
  const titleNode = dialog.querySelector('#ha-arc-sheet-title');
  if (titleNode) titleNode.textContent = `${aiName} Assistant`;
  if (inputEl) inputEl.placeholder = `Ask ${aiName} anything…`;
  renderSheetHome();
  if (!dialog.open) dialog.showModal();
  if (prefill && inputEl) inputEl.value = prefill;
  inputEl?.focus({ preventScroll: true });
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
      <div class="ha-arc-sheet-panel">
        <div class="ha-arc-sheet-handle" aria-hidden="true"></div>
        <header class="ha-arc-sheet-head">
          <div class="ha-arc-sheet-brand">
            <span class="ha-arc-sheet-avatar">${BUDDY_SHEET_SVG}</span>
            <div class="min-w-0">
              <h2 id="ha-arc-sheet-title" class="ha-arc-sheet-title">ARC Assistant</h2>
              <p class="ha-arc-sheet-sub">Knows your Today list &amp; 28d history</p>
            </div>
          </div>
          <div class="ha-arc-sheet-actions">
            <a href="Arc_AI.html" id="ha-arc-sheet-history-link" class="ha-arc-sheet-hist">History</a>
            <button type="button" id="ha-arc-sheet-close" class="ha-arc-sheet-close" aria-label="Close ARC Assistant">✕</button>
          </div>
        </header>
        <div id="ha-arc-sheet-body" class="ha-arc-sheet-body" aria-live="polite"></div>
        <div id="ha-arc-sheet-chips" class="ha-arc-sheet-chips"></div>
        <p id="ha-arc-sheet-status" class="ha-arc-sheet-status" role="status" aria-live="polite"></p>
        <form id="ha-arc-sheet-form" class="ha-arc-sheet-form">
          <input id="ha-arc-sheet-input" class="ha-arc-sheet-input" type="text" maxlength="1000" placeholder="Ask ARC anything…" autocomplete="off" aria-label="Ask ARC anything">
          <button id="ha-arc-sheet-send" class="ha-arc-sheet-send" type="submit" aria-label="Send message">${SEND_SVG}</button>
        </form>
      </div>
    `;
    document.body.append(dialog);
    bodyEl = dialog.querySelector('#ha-arc-sheet-body');
    chipsEl = dialog.querySelector('#ha-arc-sheet-chips');
    statusEl = dialog.querySelector('#ha-arc-sheet-status');
    inputEl = dialog.querySelector('#ha-arc-sheet-input');
    sendBtn = dialog.querySelector('#ha-arc-sheet-send');

    dialog.querySelector('#ha-arc-sheet-close')?.addEventListener('click', () => {
      activeController?.abort();
      dialog.close();
    });
    dialog.querySelector('#ha-arc-sheet-history-link')?.addEventListener('click', () => {
      dialog.close();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        activeController?.abort();
        dialog.close();
      }
    });
    dialog.querySelector('#ha-arc-sheet-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      void submitPrompt(inputEl?.value || '');
    });
  }

  syncArcFab();
  window.HabitArcSheet = { open: openArcSheet, sync: syncArcFab, mount: mountArcSheet };
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('habitarc:data-changed', syncArcFab);
}
