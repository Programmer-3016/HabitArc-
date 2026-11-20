/**
 * HabitArc Tasks: account-scoped local-first task store.
 * Offline mutations remain queued on this device until Firestore accepts them.
 * Notes and recurring habits are intentionally separate data models.
 */
export const PRIORITIES = Object.freeze(['none', 'low', 'medium', 'high']);
export const PRIORITY_WEIGHT = Object.freeze({ high: 0, medium: 1, low: 2, none: 3 });

export function localDay(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

export function safeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value + 'T12:00:00');
  return !Number.isNaN(date.getTime()) && localDay(date) === value ? value : '';
}

const trim = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const id = () => (globalThis.crypto?.randomUUID?.() || ('task-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)));

export function normalizeTask(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const subtasks = (Array.isArray(input.subtasks) ? input.subtasks : [])
    .slice(0, 40).map((item, index) => ({
      id: trim(item?.id || ('step-' + index), 90),
      text: trim(item?.text, 180),
      completed: Boolean(item?.completed)
    })).filter(item => item.text);
  const completed = Boolean(input.completed);
  return {
    id: trim(input.id, 90) || id(),
    title: trim(input.title, 160),
    description: trim(input.description, 1500),
    dueDate: safeDate(input.dueDate),
    priority: PRIORITIES.includes(input.priority) ? input.priority : 'none',
    habitId: trim(input.habitId, 90),
    noteId: trim(input.noteId, 90),
    subtasks,
    completed,
    completedAt: completed ? (trim(input.completedAt, 40) || new Date().toISOString()) : null,
    createdAt: trim(input.createdAt, 40) || new Date().toISOString(),
    updatedAt: trim(input.updatedAt, 40) || new Date().toISOString()
  };
}

export function newTask(fields = {}) {
  const now = new Date().toISOString();
  return normalizeTask({ ...fields, id: id(), completed: false, createdAt: now, updatedAt: now });
}

export function updateTask(task, fields = {}) {
  const original = normalizeTask(task);
  const next = normalizeTask({ ...original, ...fields, id: original.id, createdAt: original.createdAt, updatedAt: new Date().toISOString() });
  if (fields.completed === true && !original.completed) next.completedAt = next.updatedAt;
  if (fields.completed === false) next.completedAt = null;
  return next;
}

export function toggleSubtask(task, subtaskId) {
  const original = normalizeTask(task);
  const subtasks = original.subtasks.map(item => item.id === subtaskId ? { ...item, completed: !item.completed } : item);
  const allComplete = subtasks.length > 0 && subtasks.every(item => item.completed);
  return updateTask(original, { subtasks, completed: allComplete });
}

export function sortedTasks(input) {
  return (input || []).map(normalizeTask).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (PRIORITY_WEIGHT[a.priority] !== PRIORITY_WEIGHT[b.priority]) return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function groupTasks(input, today = localDay()) {
  const groups = { overdue: [], today: [], upcoming: [], someday: [], completed: [] };
  for (const task of sortedTasks(input)) {
    if (task.completed) groups.completed.push(task);
    else if (!task.dueDate) groups.someday.push(task);
    else if (task.dueDate < today) groups.overdue.push(task);
    else if (task.dueDate === today) groups.today.push(task);
    else groups.upcoming.push(task);
  }
  return groups;
}

export function timelineDays(input, today = localDay()) {
  const days = new Set([today]);
  const todayDate = new Date(today + 'T12:00:00');
  for (let offset = 1; offset <= 6; offset += 1) {
    const day = new Date(todayDate);
    day.setDate(day.getDate() + offset);
    days.add(localDay(day));
  }
  for (const task of (input || [])) if (safeDate(task.dueDate)) days.add(task.dueDate);
  return [...days].sort().map(date => ({
    date,
    tasks: sortedTasks((input || []).filter(task => task.dueDate === date))
  }));
}

const DATA_PREFIX = 'habitarc_tasks_data:';
const PENDING_PREFIX = 'habitarc_tasks_pending:';
const parse = (raw, fallback) => { try { return JSON.parse(raw) ?? fallback; } catch { return fallback; } };
const copy = (value) => JSON.parse(JSON.stringify(value));
const userScope = () => {
  try { return window.HabitArcAuth?.getCurrentUser?.()?.uid || window.HabitArc?.getAuthUser?.()?.uid || localStorage.getItem('habitarc_active_uid') || 'local'; }
  catch { return 'local'; }
};

function makeStore() {
  let owner = 'local';
  let tasks = [];
  let pending = {};
  let cloud = null;
  let unsubscribeCloud = null;
  let unsubscribeAuth = null;
  let flushing = false;
  let started = false;
  let state = 'local';
  let lastError = '';
  const listeners = new Set();

  function notify() {
    const snapshot = getStatus();
    for (const cb of listeners) { try { cb(snapshot); } catch (error) { console.error('HabitArc task subscriber failed:', error); } }
  }
  function readLocal(scope) {
    let saved = [];
    let operations = {};
    try {
      saved = parse(localStorage.getItem(DATA_PREFIX + scope), []);
      operations = parse(localStorage.getItem(PENDING_PREFIX + scope), {});
    } catch { /* Storage might be unavailable. */ }
    tasks = Array.isArray(saved) ? saved.slice(0, 2000).map(normalizeTask).filter(task => task.title) : [];
    pending = operations && typeof operations === 'object' && !Array.isArray(operations) ? operations : {};
  }
  function persist() {
    try {
      localStorage.setItem(DATA_PREFIX + owner, JSON.stringify(tasks));
      localStorage.setItem(PENDING_PREFIX + owner, JSON.stringify(pending));
    } catch (error) {
      lastError = 'Device storage unavailable or full.';
      state = 'error';
      notify();
      throw error;
    }
  }
  function getStatus() {
    return {
      owner, state, pending: Object.keys(pending).length, lastError,
      signedIn: owner !== 'local'
    };
  }
  function getTasks() { return copy(sortedTasks(tasks)); }
  function getTask(taskId) { const task = tasks.find(item => item.id === taskId); return task ? copy(task) : null; }

  function reconcile(remote, metadata = {}) {
    if (metadata.fromCache && tasks.length) {
      // An empty Firestore memory cache is not an authoritative delete.
      const next = new Map(tasks.map(task => [task.id, task]));
      remote.forEach(raw => {
        const task = normalizeTask(raw);
        if (!pending[task.id] && (!next.has(task.id) || task.updatedAt >= next.get(task.id).updatedAt)) next.set(task.id, task);
      });
      tasks = [...next.values()];
    } else {
      const next = new Map(remote.map(raw => {
        const task = normalizeTask(raw);
        return [task.id, task];
      }));
      for (const [taskId, op] of Object.entries(pending)) {
        if (op?.type === 'delete') next.delete(taskId);
        if (op?.type === 'upsert' && op.task) next.set(taskId, normalizeTask(op.task));
      }
      tasks = [...next.values()];
    }
    state = Object.keys(pending).length ? (navigator.onLine === false ? 'offline' : 'syncing') : (owner === 'local' ? 'local' : 'synced');
    lastError = '';
    try { persist(); } catch { /* Status already emitted. */ }
    notify();
  }

  async function flush() {
    if (flushing || !cloud || owner === 'local' || navigator.onLine === false) return;
    if (!cloud.getCurrentUser?.() || cloud.getCurrentUser().uid !== owner) return;
    const thisOwner = owner;
    flushing = true;
    try {
      for (const [taskId, operation] of Object.entries(pending)) {
        if (owner !== thisOwner || !cloud.getCurrentUser?.() || cloud.getCurrentUser().uid !== owner) break;
        state = 'syncing'; notify();
        if (operation.type === 'delete') await cloud.deleteTask(taskId);
        else if (operation.type === 'upsert' && operation.task) await cloud.saveTask(operation.task);
        if (owner === thisOwner && pending[taskId]?.revision === operation.revision) {
          delete pending[taskId];
          persist();
        }
      }
      if (owner === thisOwner) {
        state = Object.keys(pending).length ? 'syncing' : 'synced';
        lastError = '';
      }
    } catch (error) {
      if (owner === thisOwner) {
        state = 'error';
        lastError = error?.code === 'permission-denied'
          ? 'Task sync needs Firestore task permissions.'
          : 'Could not sync tasks. Saved on this device.';
      }
    } finally {
      flushing = false;
      notify();
      // A change during an in-flight write must also be uploaded.
      if (owner === thisOwner && state !== 'error' && Object.keys(pending).length && navigator.onLine !== false) void flush();
    }
  }

  function activate(scope) {
    const target = scope || 'local';
    if (target === owner && started && (target === 'local' || unsubscribeCloud)) return;
    unsubscribeCloud?.(); unsubscribeCloud = null;
    owner = target; readLocal(owner);
    lastError = '';
    state = owner === 'local' ? 'local' : (navigator.onLine === false ? 'offline' : 'syncing');
    notify();
    if (owner !== 'local' && cloud?.getCurrentUser?.()?.uid === owner) {
      const captured = owner;
      unsubscribeCloud = cloud.subscribeTasks((remote, metadata) => {
        if (captured !== owner) return;
        reconcile(remote, metadata);
        if (Object.keys(pending).length) void flush();
      }, (error) => {
        if (captured !== owner) return;
        state = 'error';
        lastError = error?.code === 'permission-denied'
          ? 'Deploy Firestore rules to enable Tasks cloud sync.'
          : 'Cloud connection interrupted; device copy available.';
        notify();
      });
      if (Object.keys(pending).length) void flush();
    }
  }

  function put(rawTask) {
    const task = normalizeTask(rawTask);
    if (!task.title) throw new Error('Task title cannot be empty.');
    const prior = tasks.findIndex(item => item.id === task.id);
    if (prior >= 0) tasks[prior] = task;
    else tasks.push(task);
    if (owner !== 'local') pending[task.id] = { type: 'upsert', task: copy(task), revision: Date.now() + Math.random() };
    state = owner === 'local' ? 'local' : (navigator.onLine === false ? 'offline' : 'syncing');
    persist(); notify(); void flush();
    return copy(task);
  }

  function remove(taskId) {
    tasks = tasks.filter(item => item.id !== taskId);
    if (owner !== 'local') pending[taskId] = { type: 'delete', revision: Date.now() + Math.random() };
    state = owner === 'local' ? 'local' : (navigator.onLine === false ? 'offline' : 'syncing');
    persist(); notify(); void flush();
  }

  function subscribe(cb) {
    listeners.add(cb);
    cb(getStatus());
    return () => listeners.delete(cb);
  }

  function start() {
    if (started) return;
    started = true;
    owner = userScope();
    readLocal(owner);
    notify();
    window.addEventListener('online', () => { if (state !== 'local') { state = 'syncing'; notify(); } void flush(); });
    window.addEventListener('offline', () => { if (owner !== 'local') { state = 'offline'; notify(); } });
    Promise.resolve(window.HabitArcAuthReady).then((client) => {
      if (!client) return;
      cloud = client;
      unsubscribeAuth?.();
      unsubscribeAuth = client.subscribe((user) => activate(user?.uid || 'local'));
      activate(client.getCurrentUser?.()?.uid || 'local');
    }).catch(() => { state = 'local'; notify(); });
  }
  return { start, subscribe, getTasks, getTask, getStatus, put, remove, flush };
}

export const taskStore = makeStore();
