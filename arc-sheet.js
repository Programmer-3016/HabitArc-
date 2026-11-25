// Bottom-Right [ Ask ARC ] Pill + Groww-Style Contextual Nudges & Full-Screen Chat.
import {
  buildHabitCoachContext,
  consumeArcCoachStream,
  renderArcChatAnswer,
} from './habit-analytics.js';
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
const SEND_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const BACK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

let fab = null;
let dialog = null;
let bodyEl = null;
let chipsEl = null;
let statusEl = null;
let inputEl = null;
let sendBtn = null;
let plusBtn = null;
let newChatBtn = null;
let activeController = null;
let includeTasksCtx = true;
let sheetTurns = [];
let sheetChatId = '';

function currentPage() {
  return (typeof location === 'object' ? location.pathname.split('/').pop() : '') || 'Dashboard.html';
}

function clipWords(text, max = 28) {
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

function buildContextSummary() {
  const app = window.HabitArc;
  const page = currentPage();
  const aiName = getAiName();
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

  let greeting = `Hey <strong>${esc(firstName)}</strong>! `;
  if (!totalItems) {
    greeting += `I’m <strong>${esc(aiName)}</strong>. Tell me one goal and I’ll draft a simple daily routine you can review and save in 1 tap.`;
  } else if (totalDone >= totalItems) {
    greeting += `You’re <strong>${totalDone}/${totalItems} done</strong> today — clean sweep! Want a 7-day consistency breakdown or tomorrow’s game plan?`;
  } else {
    greeting += `You’re <strong>${totalDone}/${totalItems} done</strong> today.`;
    if (nextHabit && nextTask) {
      greeting += ` Want a quick 2-minute Plan-B for <strong>${esc(nextHabit.name)}</strong>, or help breaking down <strong>${esc(nextTask.title)}</strong>?`;
    } else if (nextHabit) {
      greeting += ` Want a quick 2-minute Plan-B for <strong>${esc(nextHabit.name)}</strong> so your streak stays safe?`;
    } else if (nextTask) {
      greeting += ` Want help breaking down <strong>${esc(nextTask.title)}</strong> into smaller steps?`;
    }
  }

  const chips = [];
  if (page === 'Insights.html') {
    chips.push({
      primary: true,
      label: '✦ Spot my biggest 28d drop-off ↗',
      prompt: 'Audit my 28-day habit history, tell me which weekday or habit drops off most, and suggest one concrete fix.',
    });
    chips.push({
      primary: false,
      label: '7-day consistency recap ↗',
      prompt: 'Give me a concise 7-day consistency recap with my strongest routine and one focus for next week.',
    });
  } else if (nextHabit) {
    chips.push({
      primary: true,
      label: `✦ 2-min ${nextHabit.name.slice(0, 22)} backup ↗`,
      prompt: `Low energy today — give me a 2-minute backup version of "${nextHabit.name}" so my streak stays safe.`,
    });
    chips.push({
      primary: false,
      label: '7-day recap ↗',
      prompt: 'Give me a concise 7-day consistency recap with my strongest habit and one focus for this week.',
    });
  } else {
    chips.push({
      primary: true,
      label: '✦ Audit my routine leaks ↗',
      prompt: 'Audit my recent habit history and point out my biggest consistency drop-off with one small fix.',
    });
    chips.push({
      primary: false,
      label: 'Suggest 1 tiny habit ↗',
      prompt: 'Suggest one tiny 2-minute habit that pairs well with my existing routine.',
    });
  }

  if (nextTask) {
    chips.push({
      primary: false,
      label: `Break down "${clipWords(nextTask.title, 26)}" ↗`,
      prompt: `Break my task "${nextTask.title}" into 3 quick actionable steps I can finish today.`,
    });
  } else if (overdueCount > 0) {
    chips.push({
      primary: false,
      label: `Rescue ${overdueCount} overdue ↗`,
      href: 'Habits.html?section=tasks&rescue=1',
    });
  }
  return { ctxPill, greeting, chips, nextHabit, nextTask, totalDone, totalItems };
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

function renderSheetHome() {
  if (!bodyEl || !chipsEl) return;
  const { ctxPill, greeting, chips } = buildContextSummary();
  if (newChatBtn) newChatBtn.hidden = sheetTurns.length === 0;

  if (!sheetTurns.length) {
    bodyEl.innerHTML = `<div class="ha-arc-ctx-pill">${esc(ctxPill)}</div><div class="ha-arc-sheet-greet">${greeting}</div>`;
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
        if (statusEl && msg) statusEl.textContent = msg;
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
    if (inputEl) inputEl.value = question;
    if (statusEl) statusEl.innerHTML = 'Sign in from <a href="Profile.html" style="text-decoration:underline;font-weight:700;">Profile</a> to send live AI prompts.';
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
  if (!sheetTurns.length) {
    const { ctxPill } = buildContextSummary();
    bodyEl.innerHTML = `<div class="ha-arc-ctx-pill">${esc(ctxPill)}</div>`;
  }
  bodyEl.append(userBubble, replyBubble);
  bodyEl.scrollTop = bodyEl.scrollHeight;

  const controller = new AbortController();
  activeController = controller;
  if (sendBtn) sendBtn.disabled = true;

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

    // Groww-style safety guardrail: keep suggestedAction in Draft Review state for explicit user approval.
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

export function openArcSheet(prefill = '', { autoSubmit = false } = {}) {
  if (!dialog) mountArcSheet();
  if (!dialog) return;
  const aiName = getAiName();
  const titleNode = dialog.querySelector('#ha-arc-sheet-title');
  if (titleNode) titleNode.textContent = aiName;
  if (inputEl) inputEl.placeholder = `Ask ${aiName} anything…`;
  if (statusEl) statusEl.textContent = '';
  renderSheetHome();
  if (!dialog.open) dialog.showModal();
  if (prefill) {
    if (autoSubmit && window.HabitArc?.getAuthUser?.()) {
      void submitPrompt(prefill);
      return;
    }
    if (inputEl) inputEl.value = prefill;
  }
  inputEl?.focus({ preventScroll: true });
}

function syncInlineContextualPrompts() {
  if (typeof document === 'undefined') return;
  const app = window.HabitArc;
  if (!app?.getHabits) return;
  const aiName = getAiName();
  const page = currentPage();

  // 1) Today (Dashboard.html) — Quiet Groww-style inline nudge right below UP NEXT TODAY
  const todaySurface = document.querySelector('main.ha-dashboard .ha-today-surface');
  let todayNudge = document.getElementById('ha-today-arc-nudge');
  if (page === 'Dashboard.html' && todaySurface) {
    const todayHabits = app.getTodayHabits?.() || [];
    const pendingHabit = todayHabits.find((h) => !app.isCompletedToday?.(h.id));
    const dueTasks = (taskStore.getTasks?.() || []).filter((t) => t.dueDate === localDay() && !t.completed);
    const highTask = dueTasks.find((t) => t.priority === 'high') || dueTasks[0];

    if (pendingHabit || highTask) {
      if (!todayNudge) {
        todayNudge = document.createElement('button');
        todayNudge.type = 'button';
        todayNudge.id = 'ha-today-arc-nudge';
        todayNudge.className = 'ha-groww-nudge';
        todaySurface.after(todayNudge);
        todayNudge.addEventListener('click', () => {
          const prompt = todayNudge.dataset.prompt || '';
          openArcSheet(prompt, { autoSubmit: true });
        });
      }
      const copyHtml = pendingHabit
        ? `Low energy? <strong>2-min backup for ${esc(pendingHabit.name)}</strong>`
        : `Need momentum? <strong>Break down ${esc(highTask.title)}</strong>`;
      const promptText = pendingHabit
        ? `Low energy today — give me a 2-minute backup version of "${pendingHabit.name}" so my streak stays safe.`
        : `Break my task "${highTask.title}" into 3 quick steps I can finish today.`;
      todayNudge.dataset.prompt = promptText;
      todayNudge.hidden = false;
      todayNudge.innerHTML = `<span class="ha-groww-nudge-left"><span class="ha-groww-nudge-spark" aria-hidden="true">✦</span><span class="ha-groww-nudge-copy">${copyHtml}</span></span><span class="ha-groww-nudge-cta">Ask ${esc(aiName)} ›</span>`;
    } else if (todayNudge) {
      todayNudge.hidden = true;
    }
  } else if (todayNudge) {
    todayNudge.remove();
  }

  // 2) Insights (Insights.html) — Quiet Groww-style ✦ ARC INSIGHT card right below Monthly Activity Grid
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
      let chip1 = { label: `7-day recap ↗`, prompt: 'Give me a concise 7-day consistency recap and one focus for next week.' };
      let chip2 = { label: `Optimize schedule ↗`, prompt: 'Review my current habit schedule and suggest one timing adjustment to improve consistency.' };

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
          label: `Fix ${weakHabitObj.name.slice(0, 16)} drop-off ↗`,
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
      <div class="ha-arc-sheet-panel">
        <header class="ha-arc-sheet-head">
          <div class="ha-arc-sheet-brand">
            <button type="button" id="ha-arc-sheet-close" class="ha-arc-sheet-back" aria-label="Back">${BACK_SVG}</button>
            <span class="ha-arc-sheet-avatar" aria-hidden="true">✦</span>
            <div class="min-w-0">
              <h2 id="ha-arc-sheet-title" class="ha-arc-sheet-title">ARC</h2>
              <p class="ha-arc-sheet-sub">● Synced with Today &amp; 28d logs</p>
            </div>
          </div>
          <div class="ha-arc-sheet-actions">
            <button type="button" id="ha-arc-sheet-new" class="ha-arc-sheet-new-btn" hidden>+ New</button>
            <a href="Arc_AI.html" id="ha-arc-sheet-history-link" class="ha-arc-sheet-hist">History</a>
          </div>
        </header>
        <div id="ha-arc-sheet-body" class="ha-arc-sheet-body" aria-live="polite"></div>
        <div id="ha-arc-sheet-chips" class="ha-arc-sheet-chips"></div>
        <p id="ha-arc-sheet-status" class="ha-arc-sheet-status" role="status" aria-live="polite"></p>
        <div class="ha-arc-sheet-composer-wrap">
          <form id="ha-arc-sheet-form" class="ha-arc-sheet-form">
            <button type="button" id="ha-arc-sheet-plus" class="ha-arc-sheet-plus" aria-pressed="true" title="Include Today's tasks context" aria-label="Toggle tasks context">+</button>
            <input id="ha-arc-sheet-input" class="ha-arc-sheet-input" type="text" maxlength="1000" placeholder="Ask ARC anything…" autocomplete="off" aria-label="Ask ARC anything">
            <button id="ha-arc-sheet-send" class="ha-arc-sheet-send" type="submit" aria-label="Send message">${SEND_SVG}</button>
          </form>
        </div>
      </div>
    `;
    document.body.append(dialog);
    bodyEl = dialog.querySelector('#ha-arc-sheet-body');
    chipsEl = dialog.querySelector('#ha-arc-sheet-chips');
    statusEl = dialog.querySelector('#ha-arc-sheet-status');
    inputEl = dialog.querySelector('#ha-arc-sheet-input');
    sendBtn = dialog.querySelector('#ha-arc-sheet-send');
    plusBtn = dialog.querySelector('#ha-arc-sheet-plus');
    newChatBtn = dialog.querySelector('#ha-arc-sheet-new');

    plusBtn?.addEventListener('click', () => {
      includeTasksCtx = !includeTasksCtx;
      plusBtn.setAttribute('aria-pressed', String(includeTasksCtx));
      if (statusEl) {
        statusEl.textContent = includeTasksCtx
          ? 'Tasks & Today context attached.'
          : 'Tasks context detached for next message.';
      }
    });
    newChatBtn?.addEventListener('click', () => {
      activeController?.abort();
      sheetTurns = [];
      sheetChatId = '';
      if (statusEl) statusEl.textContent = '';
      renderSheetHome();
    });
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
    taskStore.subscribe(() => syncInlineContextualPrompts());
  }

  syncArcFab();
  window.HabitArcSheet = { open: openArcSheet, sync: syncArcFab, mount: mountArcSheet };
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('habitarc:data-changed', syncArcFab);
}
