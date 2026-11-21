/**
 * ARC Rescue Mode — deterministic, explainable backlog triage.
 * No AI-generated dates, invisible changes or network dependency.
 * The user reviews every proposed due-date change before it is persisted.
 */
import { localDay, safeDate, PRIORITY_WEIGHT, updateTask } from './task-store.js';

const priorityWeight = task => PRIORITY_WEIGHT[task.priority] ?? 3;
const addDays = (key, offset) => {
  const date = new Date(key + 'T12:00:00');
  date.setDate(date.getDate() + offset);
  return localDay(date);
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || min)));

export function priorityOrder(a, b) {
  return priorityWeight(a) - priorityWeight(b)
    || String(a.dueDate || '').localeCompare(String(b.dueDate || ''))
    || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    || String(a.id).localeCompare(String(b.id));
}

function progressHint(task) {
  const steps = Array.isArray(task.subtasks) ? task.subtasks : [];
  if (steps.length === 0) return 'Try a 25-minute focus block; split the task if it feels too big.';
  const left = steps.filter(step => !step.completed);
  return left.length
    ? 'Start with: ' + String(left[0].text || 'next step').slice(0, 100)
    : 'All subtasks are checked; review the parent task.';
}

export function buildRescuePlan(tasks, {
  today = localDay(),
  dailyCap = 3,
  horizonDays = 28
} = {}) {
  if (!safeDate(today)) throw new RangeError('Invalid planning date.');
  const cap = clamp(dailyCap, 1, 5);
  const horizon = clamp(horizonDays, 7, 60);
  const values = Array.isArray(tasks) ? tasks : [];
  const pending = values.filter(t => t && !t.completed && typeof t.id === 'string' && t.title);
  // Never silently change undated tasks or any future-dated existing obligation.
  const backlog = pending.filter(t => safeDate(t.dueDate) && t.dueDate <= today).sort(priorityOrder);
  const undated = pending.filter(t => !safeDate(t.dueDate)).length;
  const overdueCount = backlog.filter(t => t.dueDate < today).length;
  const futureLoad = new Map();
  for (const task of pending) {
    if (!safeDate(task.dueDate) || task.dueDate <= today) continue;
    futureLoad.set(task.dueDate, (futureLoad.get(task.dueDate) || 0) + 1);
  }
  const suggestions = [];
  const unplaced = [];
  backlog.forEach((task, index) => {
    let destination = today;
    if (index >= cap) {
      destination = '';
      for (let offset = 1; offset <= horizon; offset++) {
        const day = addDays(today, offset);
        if ((futureLoad.get(day) || 0) < cap) {
          destination = day;
          futureLoad.set(day, (futureLoad.get(day) || 0) + 1);
          break;
        }
      }
    }
    if (!destination) {
      unplaced.push(task.id);
      return;
    }
    suggestions.push({
      taskId: task.id,
      title: String(task.title).slice(0, 160),
      priority: task.priority || 'none',
      originalDate: task.dueDate,
      proposedDate: destination,
      updatedAt: task.updatedAt || '',
      changed: task.dueDate !== destination,
      overdue: task.dueDate < today,
      hint: progressHint(task),
      reason: index < cap ? 'Keep this among today’s top priorities.' : 'Spread the workload across less busy days.'
    });
  });
  const changes = suggestions.filter(s => s.changed);
  return {
    generatedAt: new Date().toISOString(),
    today, dailyCap: cap, horizonDays: horizon,
    pendingCount: pending.length, backlogCount: backlog.length,
    overdueCount, undatedCount: undated, unplacedCount: unplaced.length,
    focus: suggestions.filter(s => s.proposedDate === today).slice(0, 3),
    suggestions, changes
  };
}

/**
 * Convert checked suggestions into validated edits without mutating source tasks.
 * If tasks changed since preview, return a skipped reason rather than overriding.
 */
export function prepareRescueEdits(plan, tasks, selectedIds, proposedOverrides = {}) {
  const byId = new Map((tasks || []).map(task => [task.id, task]));
  const checked = new Set(selectedIds || []);
  const changes = [];
  const skipped = [];
  if (!plan || !safeDate(plan.today)) return { changes, skipped: [{ reason: 'Invalid plan.' }] };
  for (const proposal of plan.changes || []) {
    if (!checked.has(proposal.taskId)) continue;
    const task = byId.get(proposal.taskId);
    if (!task || task.completed || task.dueDate !== proposal.originalDate
      || (task.updatedAt || '') !== proposal.updatedAt) {
      skipped.push({ taskId: proposal.taskId, reason: 'Task changed since the preview.' });
      continue;
    }
    const target = Object.prototype.hasOwnProperty.call(proposedOverrides, proposal.taskId)
      ? proposedOverrides[proposal.taskId] : proposal.proposedDate;
    if (!safeDate(target) || target < plan.today) {
      skipped.push({ taskId: proposal.taskId, reason: 'Select today or a future date.' });
      continue;
    }
    if (task.dueDate === target) continue;
    changes.push({
      taskId: task.id,
      from: task.dueDate,
      to: target,
      originalUpdatedAt: task.updatedAt || '',
      task: updateTask(task, { dueDate: target })
    });
  }
  return { changes, skipped };
}
