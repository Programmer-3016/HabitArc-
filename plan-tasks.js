import { taskStore, localDay, newTask, updateTask, toggleSubtask, groupTasks, timelineDays } from './task-store.js';
import { mountDay, unmountDay, showDate } from './day-workspace.js';
import { mountRescueMode } from './rescue-mode.js';

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));
const uid = (value) => encodeURIComponent(String(value ?? ''));
const labelDate = (date) => {
  if (!date) return 'No due date';
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' });
};
const priorityLabels = { high: 'High priority', medium: 'Medium', low: 'Low', none: 'No priority' };

let active = null;

async function localNotesFor(owner) {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('habitarc-notes-studio', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('notes')) {
          request.result.createObjectStore('notes', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise((resolve, reject) => {
      const request = db.transaction('notes', 'readonly').objectStore('notes').getAll();
      request.onsuccess = () => { db.close(); resolve(request.result.filter(note => note.owner === owner).slice(0, 300)); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch {
    return [];
  }
}

function taskCard(task) {
  const completed = task.completed;
  const progress = task.subtasks.length
    ? task.subtasks.filter(step => step.completed).length + '/' + task.subtasks.length + ' subtasks'
    : '';
  const habit = task.habitId && window.HabitArc?.getHabitById?.(task.habitId);
  const meta = [];
  if (task.dueDate) meta.push('<span><span class="material-symbols-outlined">event</span>' + escapeHTML(labelDate(task.dueDate)) + '</span>');
  if (task.priority !== 'none') meta.push('<span class="ha-task-priority ha-task-priority-' + escapeHTML(task.priority) + '"><span class="material-symbols-outlined">flag</span>' + priorityLabels[task.priority] + '</span>');
  if (habit) meta.push('<a href="Habit_Detail.html?id=' + uid(habit.id) + '" class="ha-task-linked" title="Open linked habit"><span class="material-symbols-outlined">repeat</span>' + escapeHTML(habit.name) + '</a>');
  if (task.noteId) meta.push('<a href="Notes.html?note=' + uid(task.noteId) + '" class="ha-task-linked" title="Open linked note"><span class="material-symbols-outlined">description</span>Note</a>');
  const steps = task.subtasks.length
    ? '<div class="ha-task-steps">' + task.subtasks.map(step => (
      '<label class="ha-task-step' + (step.completed ? ' is-done' : '') + '">' +
      '<input type="checkbox" data-task-action="subtask" data-task-id="' + escapeHTML(task.id) + '" data-step-id="' + escapeHTML(step.id) + '"' + (step.completed ? ' checked' : '') + '>' +
      '<span>' + escapeHTML(step.text) + '</span></label>'
    )).join('') + '</div>'
    : '';
  return '<article class="ha-task-card' + (completed ? ' is-complete' : '') + '" data-task-id="' + escapeHTML(task.id) + '">' +
    '<button type="button" class="ha-task-toggle" data-task-action="toggle" data-task-id="' + escapeHTML(task.id) + '" aria-label="' + (completed ? 'Mark incomplete' : 'Mark complete') + ': ' + escapeHTML(task.title) + '" aria-pressed="' + completed + '">' +
      '<span class="material-symbols-outlined" aria-hidden="true">' + (completed ? 'check_circle' : 'radio_button_unchecked') + '</span></button>' +
    '<div class="ha-task-card-body"><h3>' + escapeHTML(task.title) + '</h3>' +
      (task.description ? '<p class="ha-task-description">' + escapeHTML(task.description) + '</p>' : '') +
      (meta.length ? '<div class="ha-task-card-meta">' + meta.join('') + '</div>' : '') +
      steps +
      (progress ? '<span class="ha-task-step-summary">' + escapeHTML(progress) + '</span>' : '') +
    '</div>' +
    '<button type="button" class="ha-task-edit" data-task-action="edit" data-task-id="' + escapeHTML(task.id) + '" aria-label="Edit ' + escapeHTML(task.title) + '"><span class="material-symbols-outlined" aria-hidden="true">more_horiz</span></button>' +
  '</article>';
}

function renderAll(tasks) {
  const grouped = groupTasks(tasks);
  const labels = {
    overdue: ['Overdue', 'error_outline'],
    today: ['Today', 'today'],
    upcoming: ['Upcoming', 'event_upcoming'],
    someday: ['No due date', 'inbox'],
    completed: ['Completed', 'task_alt']
  };
  const cards = Object.entries(grouped).filter(([, list]) => list.length).map(([key, list]) =>
    '<section class="ha-task-group" aria-label="' + labels[key][0] + '">' +
      '<div class="ha-task-group-head"><h3><span class="material-symbols-outlined" aria-hidden="true">' + labels[key][1] + '</span>' + labels[key][0] + '</h3><span>' + list.length + '</span></div>' +
      '<div class="ha-task-card-stack">' + list.map(taskCard).join('') + '</div>' +
    '</section>'
  ).join('');
  return cards || '<div class="ha-task-empty"><span class="material-symbols-outlined">checklist</span><h3>Make room for what matters.</h3><p>Add your first task, break it into steps and plan when to finish.</p><button type="button" data-task-action="new"><span class="material-symbols-outlined">add</span> Create a task</button></div>';
}

function renderTimeline(tasks) {
  return '<div class="ha-task-timeline">' + timelineDays(tasks).map(day => {
    const complete = day.tasks.filter(task => task.completed).length;
    const today = day.date === localDay();
    return '<section class="ha-task-day' + (today ? ' is-today' : '') + '" aria-label="' + escapeHTML(labelDate(day.date)) + '">' +
      '<div class="ha-task-day-head"><span class="ha-task-day-dot" aria-hidden="true"></span><h3><button class="ha-task-day-open" type="button" data-task-action="open-day" data-due-date="' + day.date + '" aria-label="Open daily planner for ' + escapeHTML(labelDate(day.date)) + '">' + escapeHTML(labelDate(day.date)) + '</button></h3>' +
      (today ? '<span class="ha-task-today-label">TODAY</span>' : '') +
      '<span class="ha-task-day-progress">' + complete + '/' + day.tasks.length + '</span></div>' +
      (day.tasks.length
        ? '<div class="ha-task-card-stack">' + day.tasks.map(taskCard).join('') + '</div>'
        : '<div class="ha-task-day-empty">Nothing planned <button type="button" data-task-action="new" data-due-date="' + day.date + '">+ Add task</button></div>') +
      '</section>';
  }).join('') + '</div>';
}

function onStatus(statusEl, state) {
  const count = state.pending;
  const messages = {
    local: 'Saved locally · Sign in to sync across devices',
    offline: 'Offline · Changes queued on this device',
    syncing: count ? count + ' change' + (count === 1 ? '' : 's') + ' waiting to sync' : 'Connecting to tasks…',
    synced: 'Synced with your account',
    error: state.lastError || 'Saved locally · Sync unavailable'
  };
  statusEl.textContent = messages[state.state] || messages.local;
  statusEl.dataset.syncState = state.state;
}

function readOption(key, fallback) {
  try { return sessionStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writeOption(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* Optional preference. */ }
}

export function mount() {
  const root = document.getElementById('ha-plan-overview');
  const panelHabits = document.getElementById('ha-plan-habits');
  const panelTasks = document.getElementById('ha-plan-tasks');
  const panelDay = document.getElementById('ha-plan-day');
  const feed = document.getElementById('ha-task-feed');
  const form = document.getElementById('ha-task-form');
  const dialog = document.getElementById('ha-task-dialog');
  if (!root || !panelHabits || !panelTasks || !panelDay || !feed || !form || !dialog) return;
  if (active?.root === root) return;
  unmount();

  const controller = new AbortController();
  const signal = controller.signal;
  const $ = (selector) => document.querySelector(selector);
  let editing = null;
  const urlParams = new URLSearchParams(location.search);
  const sectionFromUrl = urlParams.get('section');
  let mode = urlParams.get('rescue') === '1' ? 'tasks'
    : ['habits','tasks','day'].includes(sectionFromUrl) ? sectionFromUrl : readOption('ha-plan-mode','habits');
  if (!['habits','tasks','day'].includes(mode)) mode='habits';
  let view = readOption('ha-task-view', 'all') === 'timeline' ? 'timeline' : 'all';
  let mounted = true;
  const statusEl = $('#ha-task-status');

  function syncCounts() {
    const habitsCntEl = $('#ha-plan-habits-cnt');
    if (habitsCntEl) habitsCntEl.textContent = '(' + (window.HabitArc?.getHabits?.()?.length || 0) + ')';
    const tasksCntEl = $('#ha-plan-tasks-cnt');
    if (tasksCntEl) tasksCntEl.textContent = '(' + taskStore.getTasks().filter(t => !t.completed).length + ')';
  }

  function render() {
    if (!mounted || !root.isConnected) return;
    syncCounts();
    const tasks = taskStore.getTasks();
    onStatus(statusEl, taskStore.getStatus());
    feed.innerHTML = view === 'timeline' ? renderTimeline(tasks) : renderAll(tasks);
    const today = tasks.filter(task => task.dueDate === localDay());
    const done = today.filter(task => task.completed).length;
    const percent = today.length ? Math.round(done * 100 / today.length) : 0;
    $('#ha-task-focus-count').textContent = done + ' / ' + today.length;
    $('#ha-task-focus-caption').textContent = today.length ? 'tasks completed today' : 'Plan a small win for today.';
    $('#ha-task-focus-pct').textContent = percent + '%';
    const ring = $('#ha-task-progress-ring');
    ring.style.setProperty('--ha-tasks-percent', String(percent) + '%');
    ring.setAttribute('aria-valuenow', String(percent));
  }

  function updateMode() {
    syncCounts();
    panelHabits.hidden = mode !== 'habits';
    panelTasks.hidden = mode !== 'tasks';
    panelDay.hidden = mode !== 'day';
    if(mode === 'day') mountDay(panelDay);
    else unmountDay();
    const quickAdd = $('#ha-plan-v1-add');
    if (quickAdd) quickAdd.setAttribute('href', mode === 'tasks' ? '#ha-plan-tasks' : 'Add_Habit.html');
    root.querySelectorAll('[data-plan-mode]').forEach(button => {
      const chosen = button.dataset.planMode === mode;
      button.setAttribute('aria-selected', String(chosen));
      button.tabIndex = chosen ? 0 : -1;
    });
    document.querySelectorAll('[data-task-view]').forEach(button => {
      const chosen = button.dataset.taskView === view;
      button.setAttribute('aria-selected', String(chosen));
      button.tabIndex = chosen ? 0 : -1;
    });
    if (mode === 'tasks') render();
  }

  async function populateLinkedOptions(noteId = '') {
    const habitSelect = $('#ha-task-habit');
    habitSelect.replaceChildren(new Option('None', ''));
    for (const habit of (window.HabitArc?.getHabits?.() || [])) habitSelect.add(new Option(habit.name, habit.id));
    const noteSelect = $('#ha-task-note');
    noteSelect.replaceChildren(new Option('None', ''));
    const owner = taskStore.getStatus().owner;
    const notes = await localNotesFor(owner);
    if (!mounted || !dialog.open) return;
    notes.forEach(note => noteSelect.add(new Option(String(note.title || 'Untitled note').slice(0, 100), note.id)));
    if (noteId && !notes.some(note => note.id === noteId)) {
      noteSelect.add(new Option('Linked note unavailable here', noteId));
    }
    noteSelect.value = noteId;
  }

  function openEditor(task = null, dueDate = '') {
    editing = task;
    form.reset();
    $('#ha-task-dialog-title').textContent = task ? 'Edit task' : 'New task';
    $('#ha-task-title').value = task?.title || '';
    $('#ha-task-description').value = task?.description || '';
    $('#ha-task-date').value = task?.dueDate || dueDate || localDay();
    $('#ha-task-priority').value = task?.priority || 'none';
    $('#ha-task-subtasks').value = task?.subtasks.map(step => step.text).join('\n') || '';
    $('#ha-task-habit').replaceChildren(new Option('None', ''));
    $('#ha-task-note').replaceChildren(new Option('None', ''));
    $('#ha-task-delete').hidden = !task;
    $('#ha-task-form-error').hidden = true;
    if (!dialog.open) dialog.showModal();
    void populateLinkedOptions(task?.noteId || '').then(() => {
      if (mounted && dialog.open) $('#ha-task-habit').value = task?.habitId || '';
    });
    $('#ha-task-title').focus();
  }

  function closeEditor() {
    if (dialog.open) dialog.close();
    editing = null;
  }

  function saveEditor(event) {
    event.preventDefault();
    const title = $('#ha-task-title').value.trim();
    if (!title) {
      const error = $('#ha-task-form-error');
      error.textContent = 'Enter a task title.';
      error.hidden = false;
      return;
    }
    const rawLines = $('#ha-task-subtasks').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 40);
    const previous = editing?.subtasks || [];
    const used = new Set();
    const subtasks = rawLines.map((text) => {
      const old = previous.find(step => step.text === text && !used.has(step.id));
      if (old) { used.add(old.id); return { ...old }; }
      return { id: crypto.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)), text, completed: false };
    });
    const fields = {
      title, description: $('#ha-task-description').value.trim(),
      dueDate: $('#ha-task-date').value,
      priority: $('#ha-task-priority').value,
      habitId: $('#ha-task-habit').value,
      noteId: $('#ha-task-note').value,
      subtasks
    };
    if (editing && subtasks.length) fields.completed = subtasks.every(step => step.completed);
    try {
      const saved = editing ? updateTask(editing, fields) : newTask(fields);
      taskStore.put(saved);
      closeEditor();
    } catch (error) {
      const el = $('#ha-task-form-error');
      el.textContent = error.message || 'Could not save this task.';
      el.hidden = false;
    }
  }

  function taskAction(event) {
    const target = event.target.closest('[data-task-action]');
    if (!target || !panelTasks.contains(target)) return;
    const action = target.dataset.taskAction;
    if (action === 'open-day') {
      mode='day';writeOption('ha-plan-mode',mode);updateMode();showDate(target.dataset.dueDate);return;
    }
    if (action === 'new') {
      openEditor(null, target.dataset.dueDate || '');
      return;
    }
    const task = taskStore.getTask(target.dataset.taskId);
    if (!task) return;
    if (action === 'edit') openEditor(task);
    if (action === 'toggle') taskStore.put(updateTask(task, { completed: !task.completed }));
    if (action === 'subtask') taskStore.put(toggleSubtask(task, target.dataset.stepId));
  }

  root.querySelectorAll('[data-plan-mode]').forEach(button => {
    button.addEventListener('click', () => {
      mode = button.dataset.planMode;
      writeOption('ha-plan-mode', mode);
      updateMode();
    }, { signal });
  });
  panelTasks.querySelectorAll('[data-task-view]').forEach(button => {
    button.addEventListener('click', () => {
      view = button.dataset.taskView;
      writeOption('ha-task-view', view);
      updateMode();
    }, { signal });
  });
  $('#ha-task-new').addEventListener('click', () => openEditor(), { signal });
  $('#ha-plan-v1-add')?.addEventListener('click', (event) => {
    if (mode === 'tasks') {
      event.preventDefault();
      openEditor();
    }
  }, { signal });
  root.querySelector('.ha-plan-badge')?.addEventListener('click', () => {
    if (mode !== 'day') {
      mode = 'day';
      writeOption('ha-plan-mode', mode);
      updateMode();
    }
    document.getElementById('ha-calendar-toggle')?.click();
  }, { signal });
  $('#ha-task-close').addEventListener('click', closeEditor, { signal });
  dialog.addEventListener('cancel', () => { editing = null; }, { signal });
  form.addEventListener('submit', saveEditor, { signal });
  $('#ha-task-delete').addEventListener('click', () => {
    if (!editing || !window.confirm('Delete this task permanently?')) return;
    taskStore.remove(editing.id);
    closeEditor();
  }, { signal });
  feed.addEventListener('click', (event) => {
    if (event.target.matches('[data-task-action="subtask"]')) return;
    taskAction(event);
  }, { signal });
  feed.addEventListener('change', (event) => {
    if (event.target.matches('[data-task-action="subtask"]')) taskAction(event);
  }, { signal });
  const unsubscribeStore = taskStore.subscribe(render);
  window.addEventListener('habitarc:data-changed', render, { signal });
  updateMode();
  taskStore.start();
  if(urlParams.get('new') === '1')openEditor(null,urlParams.get('date')||'');
  if(mode==='day' && urlParams.get('date'))showDate(urlParams.get('date'));
  const stopRescue=mountRescueMode({
    launcher:document.getElementById('ha-rescue-open'),
    dialog:document.getElementById('ha-rescue-dialog'),
    autoOpen:urlParams.get('rescue')==='1'
  });
  active = {
    root,
    destroy() {
      mounted = false;
      controller.abort();
      unsubscribeStore();
      unmountDay();
      stopRescue();
      if (dialog.open) dialog.close();
    }
  };
}

export function unmount() {
  active?.destroy();
  active = null;
}
if (typeof window !== 'undefined') window.HabitArcPlanner = { mount, unmount };
