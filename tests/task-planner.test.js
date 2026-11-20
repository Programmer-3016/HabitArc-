import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  localDay, safeDate, normalizeTask, newTask, updateTask,
  toggleSubtask, groupTasks, timelineDays, sortedTasks
} from '../task-store.js';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const sample = (fields = {}) => normalizeTask({
  id: 'sample', title: 'Finish project',
  dueDate: '2026-11-21', priority: 'medium',
  subtasks: [
    { id: 'one', text: 'Research', completed: false },
    { id: 'two', text: 'Present', completed: false }
  ],
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  ...fields
});

test('new tasks validate title, due date and preserve independent habit/note references', () => {
  const task = newTask({
    title: 'Study arrays', dueDate: '2026-11-22',
    priority: 'high', habitId: 'study', noteId: 'notes-1'
  });
  assert.equal(task.title, 'Study arrays');
  assert.equal(task.habitId, 'study');
  assert.equal(task.noteId, 'notes-1');
  assert.equal(task.priority, 'high');
  assert.equal(task.dueDate, '2026-11-22');
  assert.ok(task.id);
  assert.equal(safeDate('2026-02-30'), '');
  assert.equal(safeDate('2026-11-21'), '2026-11-21');
  assert.equal(localDay(new Date('2026-11-21T12:00:00')), '2026-11-21');
});

test('subtasks toggle completion and undo automatic task completion', () => {
  const first = toggleSubtask(sample(), 'one');
  assert.equal(first.completed, false);
  assert.equal(first.subtasks[0].completed, true);
  const second = toggleSubtask(first, 'two');
  assert.equal(second.completed, true);
  assert.ok(second.completedAt);
  const undone = toggleSubtask(second, 'one');
  assert.equal(undone.completed, false);
  assert.equal(undone.completedAt, null);
  assert.equal(undone.subtasks[0].completed, false);
});

test('tasks are grouped by deadline and completion, without changing recurring habits', () => {
  const tasks = [
    sample({ id: 'old', dueDate: '2026-11-19', priority: 'high' }),
    sample({ id: 'today', dueDate: '2026-11-21' }),
    sample({ id: 'later', dueDate: '2026-11-24' }),
    sample({ id: 'someday', dueDate: '' }),
    sample({ id: 'done', completed: true })
  ];
  const groups = groupTasks(tasks, '2026-11-21');
  assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([key, list]) => [key, list.length])), {
    overdue: 1, today: 1, upcoming: 1, someday: 1, completed: 1
  });
  assert.equal(sortedTasks(tasks).at(-1).id, 'done');
  assert.equal(updateTask(sample(), { description: 'Updated' }).description, 'Updated');
});

test('timeline and task list reuse the same source records', () => {
  const tasks = [sample({ id: 'a', dueDate: '2026-11-21' }), sample({ id: 'b', dueDate: '2026-11-23', completed: true })];
  const days = timelineDays(tasks, '2026-11-21');
  assert.equal(days.find(d => d.date === '2026-11-21').tasks.length, 1);
  assert.equal(days.find(d => d.date === '2026-11-23').tasks[0].id, 'b');
});

test('Planner is embedded in Habits with original habit list preserved', () => {
  const html = read('Habits.html');
  assert.match(html, /id="ha-plan-overview"/);
  assert.match(html, /id="ha-plan-habits"/);
  assert.match(html, /id="habits-list"/);
  assert.match(html, /id="ha-plan-tasks"/);
  assert.match(html, /data-task-view="timeline"/);
  assert.match(html, /import\('\.\/plan-tasks\.js'\)/);
  assert.match(read('app-ui.js'), /ensurePlannerStyles/);
});

test('Tasks are queued locally and cloud writes are scoped under account', () => {
  const source = read('task-store.js');
  const auth = read('firebase-auth.js');
  const rules = read('firestore.rules');
  assert.match(source, /habitarc_tasks_pending:/);
  assert.match(source, /cloud\.saveTask\(operation\.task\)/);
  assert.match(source, /cloud\.deleteTask\(taskId\)/);
  assert.match(auth, /function tasksCollection\(user\)/);
  assert.match(auth, /subscribeTasks,/);
  assert.match(rules, /match \/users\/\{userId\}\/tasks\/\{taskId\}/);
  assert.match(read('sw.js'), /'\/plan-tasks\.js'/);
});
