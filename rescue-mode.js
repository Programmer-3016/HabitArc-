/* ARC Rescue Mode UI: user-controlled due-date proposals for real local Tasks. */
import { taskStore, localDay } from './task-store.js';
import { buildRescuePlan, prepareRescueEdits } from './rescue-planner.js';

const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, ch =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])
);
const dateLabel = day => {
  const date = new Date(day + 'T12:00:00');
  return date.toLocaleDateString(undefined, { weekday:'short',month:'short',day:'numeric' });
};

let current = null;
export function mountRescueMode({
  launcher = document.getElementById('ha-rescue-open'),
  dialog = document.getElementById('ha-rescue-dialog'),
  autoOpen = false
} = {}) {
  if (!launcher || !dialog) return () => {};
  if (current?.dialog === dialog) return current.destroy;
  current?.destroy?.();

  const controller = new AbortController();
  const signal = controller.signal;
  const $ = selector => dialog.querySelector(selector);
  const statusEl = document.getElementById('ha-rescue-launch-status');
  const focusList = $('#ha-rescue-focus-list');
  const proposalsList = $('#ha-rescue-moves');
  const feedback = $('#ha-rescue-feedback');
  const capControl = $('#ha-rescue-cap');
  const approvalButton = $('#ha-rescue-apply');
  let plan = null;
  let planOwner = '';
  let applied = false;
  let mounted = true;

  function setFeedback(message, mode = '') {
    feedback.textContent = message;
    feedback.dataset.status = mode;
  }
  function setLaunchCount() {
    if (!statusEl || !statusEl.isConnected) return;
    const tasks = taskStore.getTasks();
    const overdue = tasks.filter(task => !task.completed && task.dueDate && task.dueDate < localDay()).length;
    statusEl.textContent = overdue
      ? overdue + ' overdue task' + (overdue === 1 ? '' : 's') + '. Get a realistic reset plan.'
      : 'Review your workload and plan a calmer day.';
  }

  function draw() {
    const count = Number(capControl.value);
    plan = buildRescuePlan(taskStore.getTasks(), { dailyCap:count });
    planOwner = taskStore.getStatus().owner;
    applied = false;
    const desc = [
      plan.overdueCount + ' overdue',
      (plan.backlogCount - plan.overdueCount) + ' due today',
      plan.undatedCount + ' without a date'
    ];
    $('#ha-rescue-overview').innerHTML =
      '<strong>'+plan.backlogCount+' tasks to consider</strong><span>'+escapeHTML(desc.join(' · '))+'</span>';

    if (plan.focus.length) {
      focusList.innerHTML = plan.focus.map((item, index) =>
        '<article class="ha-rescue-focus-item">' +
          '<span class="ha-rescue-number">'+(index+1)+'</span>'+
          '<div><strong>'+escapeHTML(item.title)+'</strong>'+
          '<small>'+escapeHTML(item.priority==='none'?'Regular priority':item.priority+' priority')+
          (item.overdue?' · overdue':' · due today')+'</small>'+
          '<p>'+escapeHTML(item.hint)+'</p></div>'+
        '</article>'
      ).join('');
    } else {
      focusList.innerHTML = '<p class="ha-rescue-empty">Nothing overdue or due today. You are on top of your dated tasks!</p>';
    }
    const suggested = plan.changes;
    $('#ha-rescue-change-count').textContent = suggested.length+' proposed';
    proposalsList.innerHTML = suggested.length
      ? suggested.map((item, index) =>
        '<div class="ha-rescue-move" data-rescue-id="'+escapeHTML(item.taskId)+'">'+
          '<label class="ha-rescue-move-check">'+
            '<input type="checkbox" data-rescue-select="'+escapeHTML(item.taskId)+'" checked aria-label="Approve date change for '+escapeHTML(item.title)+'">'+
            '<div class="ha-rescue-move-copy"><strong>'+escapeHTML(item.title)+'</strong><small>'+escapeHTML(dateLabel(item.originalDate))+' → '+escapeHTML(dateLabel(item.proposedDate))+'</small></div>'+
          '</label>'+
          '<label class="ha-rescue-move-date">Move to <input type="date" data-rescue-date="'+escapeHTML(item.taskId)+'" value="'+escapeHTML(item.proposedDate)+'" min="'+plan.today+'"></label>'+
        '</div>'
      ).join('')
      : '<p class="ha-rescue-empty">No date changes needed. Use Today’s priorities to choose what to tackle first.</p>';
    if (plan.unplacedCount) {
      proposalsList.insertAdjacentHTML('beforeend',
        '<p class="ha-rescue-overflow">'+plan.unplacedCount+' remaining task(s) could not fit inside the planning horizon. These are left untouched.</p>');
    }
    approvalButton.disabled = suggested.length === 0;
    approvalButton.textContent = 'Approve selected changes';
    setFeedback('Preview only — nothing has been moved.', '');
    updateSelected();
  }

  function updateSelected() {
    const active = [...dialog.querySelectorAll('[data-rescue-select]:checked')].length;
    const total = plan?.changes.length || 0;
    approvalButton.disabled = active === 0 || applied;
    if (!applied) approvalButton.textContent = active
      ? 'Approve '+active+' date change'+(active===1?'':'s')
      : total?'Select changes to apply':'No changes to apply';
  }

  function open() {
    if (!mounted) return;
    capControl.value = ['2','3','4','5'].includes(capControl.value) ? capControl.value : '3';
    draw();
    if (!dialog.open) dialog.showModal();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  async function apply() {
    if (!plan || applied) return;
    const checked = [...dialog.querySelectorAll('[data-rescue-select]:checked')]
      .map(input => input.dataset.rescueSelect);
    const overrides = {};
    for (const input of dialog.querySelectorAll('[data-rescue-date]')) {
      overrides[input.dataset.rescueDate] = input.value;
    }
    // Account switches and concurrent edits must never write the wrong user's records.
    if (taskStore.getStatus().owner !== planOwner) {
      setFeedback('Account changed. Rebuild the recovery plan before continuing.', 'error');
      return;
    }
    const result = prepareRescueEdits(plan, taskStore.getTasks(), checked, overrides);
    if (result.skipped.length) {
      setFeedback('Some tasks changed or have invalid dates. Rebuild your plan to continue.', 'error');
      return;
    }
    if (!result.changes.length) {
      setFeedback('No changes selected. Nothing was updated.', '');
      return;
    }
    const count = result.changes.length;
    const ok = window.confirm('Move '+count+' task'+(count===1?'':'s')+' to the reviewed dates? HabitArc will save these changes to your Tasks list.');
    if (!ok) return;
    approvalButton.disabled = true;
    let saved = 0;
    let skipped = 0;
    for (const operation of result.changes) {
      if (!mounted || taskStore.getStatus().owner !== planOwner) {
        skipped = count-saved;
        break;
      }
      const latest = taskStore.getTask(operation.taskId);
      if (!latest || latest.completed || latest.dueDate !== operation.from
        || (latest.updatedAt || '') !== operation.originalUpdatedAt) {
        skipped++;
        continue;
      }
      try {
        taskStore.put(operation.task);
        saved++;
      } catch(error) {
        setFeedback('Storage is unavailable. '+saved+' saved, '+(count-saved)+' not saved. '+(error?.message||''), 'error');
        return;
      }
    }
    applied = true;
    approvalButton.disabled = true;
    approvalButton.textContent = 'Changes applied';
    setFeedback(saved+' task date'+(saved===1?'':'s')+' updated.'+
      (skipped?' '+skipped+' skipped because the data changed.':'')+
      ' Check Tasks or Timeline to review.',skipped?'warning':'success');
    setLaunchCount();
  }

  const unsubscribe = taskStore.subscribe(() => {
    setLaunchCount();
    // Do not erase checkboxes/date edits during background Firestore updates.
    if (dialog.open && !applied && plan && taskStore.getStatus().owner!==planOwner) {
      setFeedback('Account changed; close and reopen to rebuild the plan.', 'error');
    }
  });
  launcher.addEventListener('click', open, {signal});
  $('#ha-rescue-close').addEventListener('click', close, {signal});
  $('#ha-rescue-cancel').addEventListener('click', close, {signal});
  $('#ha-rescue-refresh').addEventListener('click', draw, {signal});
  capControl.addEventListener('change', draw, {signal});
  approvalButton.addEventListener('click', () => { void apply(); }, {signal});
  proposalsList.addEventListener('change', event => {
    if (event.target.matches('[data-rescue-select]')) updateSelected();
  }, {signal});
  dialog.addEventListener('cancel', ()=>{ /* native Escape closes the modal */ }, {signal});
  const destroy = () => {
    if (!mounted) return;
    mounted=false;
    controller.abort();
    unsubscribe();
    close();
    if (current?.dialog === dialog) current=null;
  };
  current={dialog,destroy};
  if (autoOpen) open();
  setLaunchCount();
  return destroy;
}
