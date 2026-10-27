import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Exercise the actual private UI callback without introducing a production
// export or a DOM dependency solely for a delayed-response regression.
const source = await readFile(new URL('../public/app/main.js', import.meta.url), 'utf8');
const match = source.match(/^async function refreshPersistentHistory\(\) \{[\s\S]*?(?=^function |^async function )/m);
assert.ok(match, 'the real history callback exists');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
for (const outcome of ['success', 'authentication failure']) test(`late history ${outcome} cannot overwrite or clear a newer identity`, async () => {
  const state = { identityGeneration: 1, historyRequestGeneration: 0, history: [{ attemptId: 'candidate-a' }], historyStatus: '', historyLoading: false };
  const gate = deferred(); let updates = 0, errorHandlers = 0;
  const refresh = new Function('state', 'api', 'persistentMode', 'updatePersistentHistory', 'handlePersistentError',
    `return (${match[0]});`)(state, { loadHistory: () => gate.promise }, true, () => { updates++; }, () => { errorHandlers++; return true; });
  const pending = refresh();
  state.identityGeneration += 1;
  const current = [{ attemptId: 'candidate-b' }]; state.history = current;
  if (outcome === 'success') gate.resolve([{ attemptId: 'candidate-a', score: { percentage: '100.00' } }]);
  else gate.reject(Object.assign(new Error('Old session ended'), { code: 'UNAUTHENTICATED', status: 401 }));
  await pending;
  assert.equal(state.history, current); assert.equal(updates, 1, 'only the immediate loading state was rendered'); assert.equal(errorHandlers, 0);
});

for (const staleOutcome of ['success', 'read failure']) test(`a newer same-session history refresh wins a late ${staleOutcome}`, async () => {
  const requests = [deferred(), deferred()];
  const state = { identityGeneration: 7, historyRequestGeneration: 0,
    history: [{ attemptId: 'already-visible' }], historyStatus: '', historyLoading: false };
  let request = 0, updates = 0, errorHandlers = 0;
  const refresh = new Function('state', 'api', 'persistentMode', 'updatePersistentHistory', 'handlePersistentError',
    `return (${match[0]});`)(state, { loadHistory: () => requests[request++].promise }, true,
    () => { updates++; }, () => { errorHandlers++; return false; });
  const stale = refresh();
  const current = refresh();
  assert.equal(state.historyRequestGeneration, 2);
  const newest = [{ attemptId: 'newest-same-owner' }];
  requests[1].resolve(newest);
  await current;
  assert.equal(state.history, newest);
  assert.equal(state.historyLoading, false);
  if (staleOutcome === 'success') requests[0].resolve([{ attemptId: 'stale-same-owner' }]);
  else requests[0].reject(Object.assign(new Error('Old history page failed'), { code: 'TEMPORARILY_UNAVAILABLE', status: 503 }));
  await stale;
  assert.equal(state.history, newest, 'late response does not replace current history');
  assert.equal(state.historyStatus, '', 'late failure cannot replace the current success state');
  assert.equal(state.historyLoading, false);
  assert.equal(updates, 3, 'only the two loading states and newest response updated the view');
  assert.equal(errorHandlers, 0, 'stale failures do not trigger auth/error handling');
});

function uiCallback(name, bindings) {
  const callback = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?(?=^function |^async function )`, 'm'));
  assert.ok(callback, `actual ${name} callback exists`);
  return new Function(...Object.keys(bindings), `return (${callback[0]});`)(...Object.values(bindings));
}

function savedAttemptReadHarness() {
  const state = { identityGeneration: 1, savedAttemptRead: null, busy: false,
    attempt: { attemptId: 'current-owner-attempt', state: 'IN_PROGRESS' } };
  const calls = { updates: 0, accepted: [], errors: [], announcements: [] };
  const requests = [];
  const savedAttemptReadIsCurrent = uiCallback('savedAttemptReadIsCurrent', { state });
  const cancelSavedAttemptRead = uiCallback('cancelSavedAttemptRead', { state });
  const readPersistentSavedAttempt = uiCallback('readPersistentSavedAttempt', {
    persistentMode: true,
    state,
    fixedSelectionLocked: () => false,
    hasUnacknowledgedChanges: () => false,
    readExpectedAttempt(attemptId, record) {
      const request = deferred();
      requests.push({ attemptId, record, request });
      return request.promise;
    },
    updateSavedAttemptRead() { calls.updates++; },
    announce(message) { calls.announcements.push(message); },
    savedAttemptReadIsCurrent,
    acceptAttempt(attempt) { calls.accepted.push(attempt); state.attempt = attempt; },
    handlePersistentError(error) { calls.errors.push(error); return false; },
  });
  return { state, calls, requests, readPersistentSavedAttempt, cancelSavedAttemptRead };
}

test('cancelled saved-attempt read cannot apply a late success', async () => {
  const h = savedAttemptReadHarness();
  const record = { attemptId: 'selected-history-attempt' };
  const pending = h.readPersistentSavedAttempt(record.attemptId, record, 'history');
  assert.equal(h.state.busy, true);
  assert.equal(h.state.savedAttemptRead.phase, 'loading');
  assert.equal(h.requests.length, 1);

  h.cancelSavedAttemptRead();
  assert.equal(h.state.busy, false);
  assert.equal(h.state.savedAttemptRead, null);
  const updatesAfterCancel = h.calls.updates;
  h.requests[0].request.resolve({ attempt: { attemptId: record.attemptId, state: 'GRADED' } });
  await pending;

  assert.equal(h.state.attempt.attemptId, 'current-owner-attempt');
  assert.equal(h.state.busy, false);
  assert.equal(h.state.savedAttemptRead, null);
  assert.equal(h.calls.updates, updatesAfterCancel, 'cancelled completion does not rerender a stale saved-read state');
  assert.deepEqual(h.calls.accepted, []);
  assert.deepEqual(h.calls.errors, []);
});

test('saved-attempt response from an older identity cannot replace the new owner attempt', async () => {
  const h = savedAttemptReadHarness();
  const record = { attemptId: 'owner-a-attempt' };
  const pending = h.readPersistentSavedAttempt(record.attemptId, record, 'history');
  h.state.identityGeneration++;
  h.state.savedAttemptRead = null;
  h.state.busy = false;
  const ownerBAttempt = { attemptId: 'owner-b-attempt', state: 'IN_PROGRESS' };
  h.state.attempt = ownerBAttempt;
  const updatesAfterIdentityChange = h.calls.updates;
  h.requests[0].request.resolve({ attempt: { attemptId: record.attemptId, state: 'GRADED' } });
  await pending;

  assert.equal(h.state.attempt, ownerBAttempt);
  assert.equal(h.state.busy, false);
  assert.equal(h.state.savedAttemptRead, null);
  assert.equal(h.calls.updates, updatesAfterIdentityChange, 'old identity completion does not update the new owner view');
  assert.deepEqual(h.calls.accepted, []);
  assert.deepEqual(h.calls.errors, []);
});

test('cancelled saved-attempt response cannot clear a newer read busy state', async () => {
  const h = savedAttemptReadHarness();
  const oldRecord = { attemptId: 'old-history-attempt' };
  const stale = h.readPersistentSavedAttempt(oldRecord.attemptId, oldRecord, 'history');
  h.cancelSavedAttemptRead();
  const newRecord = { attemptId: 'new-history-attempt' };
  const current = h.readPersistentSavedAttempt(newRecord.attemptId, newRecord, 'history');
  const currentRead = h.state.savedAttemptRead;
  assert.equal(h.state.busy, true);
  assert.equal(currentRead.attemptId, newRecord.attemptId);

  h.requests[0].request.resolve({ attempt: { attemptId: oldRecord.attemptId, state: 'GRADED' } });
  await stale;
  assert.equal(h.state.savedAttemptRead, currentRead);
  assert.equal(h.state.busy, true, 'late completion cannot clear the active read lock');
  assert.deepEqual(h.calls.accepted, []);

  const newest = { attemptId: newRecord.attemptId, state: 'GRADED' };
  h.requests[1].request.resolve({ attempt: newest });
  await current;
  assert.equal(h.state.busy, false);
  assert.equal(h.state.savedAttemptRead, null);
  assert.deepEqual(h.calls.accepted, [newest]);
});

test('recoverable saved-attempt read failure remains retryable local state', async () => {
  const h = savedAttemptReadHarness();
  const record = { attemptId: 'selected-history-attempt' };
  const pending = h.readPersistentSavedAttempt(record.attemptId, record, 'history');
  h.requests[0].request.reject(Object.assign(new Error('Temporary read failure'), {
    code: 'TEMPORARILY_UNAVAILABLE', status: 503,
  }));
  await pending;

  assert.equal(h.state.busy, false);
  assert.equal(h.state.savedAttemptRead.phase, 'error');
  assert.equal(h.state.savedAttemptRead.record, record);
  assert.equal(h.state.savedAttemptRead.source, 'history');
  assert.match(h.state.savedAttemptRead.message, /Chưa mở bài.*thử đọc lại/);
  assert.equal(h.calls.updates, 2, 'loading and local error states update the saved attempt surface');
  assert.equal(h.calls.errors.length, 1);
  assert.deepEqual(h.calls.accepted, []);
});

function closedSaveHarness({ kind = 'single', read, save } = {}) {
  const state = { identityGeneration: 1, attempt: { attemptId: 'owned', state: 'IN_PROGRESS' }, busy: false,
    savingSlotId: null, pendingAnswer: null,
    pendingMultipleChoice: kind === 'multiple' ? { slotId: 'slot', optionIds: ['a', 'c'], saveAttempted: false } : null,
    resumeNotice: '' };
  const calls = { reads: 0, saves: 0, renders: 0, statuses: [], messages: [] };
  const api = {
    async saveAnswer(...args) {
      calls.saves++;
      if (save) return save(...args);
      throw Object.assign(new Error('Closed elsewhere'), { code: 'ATTEMPT_CLOSED', status: 409 });
    },
    async readAttempt(...args) { calls.reads++; return read(...args); },
  };
  const noop = () => {};
  const render = () => { calls.renders++; };
  const app = { querySelector: () => null, querySelectorAll: () => [] };
  const updateSaveStatus = (message, kind, action, label) => calls.statuses.push({ message, kind, action, label });
  const acceptAttempt = uiCallback('acceptAttempt', {
    state, persistentMode: true,
    hasUnacknowledgedChanges: () => Boolean(state.pendingAnswer || state.pendingMultipleChoice),
    stopGradePolling: noop, clearTimer: noop, clearAttemptReviewState: noop, startGradePolling: noop,
    renderPendingGrade: render, renderFailedGrade: render, renderResult: render,
    renderReleasedResultUnavailable: render, renderCreatedAttempt: render, renderExam: render,
    loadAttemptReviewState: noop, startTimer: noop,
    clearAttemptState() { state.attempt = null; state.pendingAnswer = null; state.pendingMultipleChoice = null; },
    renderPersistentBlocked: (message) => calls.messages.push(message), renderCatalog: render,
  });
  const reload = uiCallback('reloadAttemptAfterSaveConflict', {
    state, api, persistentMode: true, app, updateSaveStatus, acceptAttempt,
    handlePersistentError: (error) => {
      if (error.code !== 'UNAUTHENTICATED') return false;
      calls.messages.push('AUTH_HANDLER'); return true;
    },
    renderExam: render, showMessage: (message) => calls.messages.push(message),
  });
  const saveAnswer = uiCallback('saveSelectedAnswer', {
    state, api, persistentMode: true, app, updateSaveStatus, acceptAttempt,
    handlePersistentError: () => false, renderExam: render, announce: noop,
    reloadAttemptAfterSaveConflict: reload,
    retryPendingAnswer: () => assert.fail('closed attempts must not offer another write'),
    retryPendingMultipleChoice: () => assert.fail('closed attempts must not offer another write'),
  });
  return { state, calls, reload, save: () => saveAnswer('slot', { optionId: 'b' }, 'option-b') };
}

for (const terminal of ['SUBMITTED', 'EXPIRED', 'GRADED']) {
  test(`closed save offers a fresh read and explains server-recorded scoring when authoritative state is ${terminal}`, async () => {
    const h = closedSaveHarness({ read: async () => ({ attempt: { attemptId: 'owned', state: terminal, gradingStatus: 'PENDING', result: null } }) });
    await h.save();
    assert.equal(h.calls.saves, 1); assert.equal(h.calls.reads, 0);
    assert.equal(h.state.attempt.state, 'IN_PROGRESS');
    assert.ok(h.state.pendingAnswer);
    const error = h.calls.statuses.at(-1);
    assert.equal(error.action, h.reload); assert.match(error.label, /Tải lại/); assert.doesNotMatch(error.label, /Thử lưu/);
    await error.action();
    assert.equal(h.calls.reads, 1); assert.equal(h.calls.saves, 1);
    assert.equal(h.state.attempt.state, terminal);
    assert.equal(h.state.pendingAnswer, null);
    assert.match(h.state.resumeNotice, /máy chủ đã ghi nhận trước khi đóng bài/);
  });
}

for (const kind of ['single', 'multiple']) {
  test(`failed closed-state reconciliation preserves ${kind} pending edits and retries only the read`, async () => {
    let unavailable = true;
    const h = closedSaveHarness({ kind, read: async () => {
      if (unavailable) throw Object.assign(new Error('Read unavailable'), { code: 'TEMPORARILY_UNAVAILABLE' });
      return { attempt: { attemptId: 'owned', state: 'SUBMITTED', gradingStatus: 'PENDING' } };
    } });
    await h.save();
    assert.equal(h.calls.statuses.at(-1).action, h.reload);
    const pending = kind === 'single' ? h.state.pendingAnswer : h.state.pendingMultipleChoice;
    await h.reload();
    assert.equal(h.state.busy, false);
    assert.equal(kind === 'single' ? h.state.pendingAnswer : h.state.pendingMultipleChoice, pending);
    assert.equal(h.calls.statuses.at(-1).action, h.reload);
    assert.match(h.calls.statuses.at(-1).label, /Tải lại/);
    unavailable = false;
    await h.calls.statuses.at(-1).action();
    assert.equal(h.calls.saves, 1); assert.equal(h.calls.reads, 2);
    assert.equal(h.state.attempt.state, 'SUBMITTED');
    assert.equal(h.state.pendingAnswer, null); assert.equal(h.state.pendingMultipleChoice, null);
    assert.match(h.state.resumeNotice, /máy chủ đã ghi nhận trước khi đóng bài/);
  });
}

for (const outcome of ['success', 'authentication failure']) for (const change of ['identity', 'attempt']) {
  test(`late reconciliation ${outcome} cannot replace a newer ${change}`, async () => {
    const gate = deferred();
    const h = closedSaveHarness({ read: () => gate.promise });
    await h.save();
    const pendingRead = h.reload();
    if (change === 'identity') h.state.identityGeneration++;
    const current = { attemptId: change === 'identity' ? 'new-owner' : 'new-attempt', state: 'IN_PROGRESS' };
    const pending = { slotId: 'new-slot', value: { optionId: 'c' } };
    h.state.attempt = current; h.state.pendingAnswer = pending; h.state.busy = false;
    const renders = h.calls.renders, statuses = h.calls.statuses.length;
    if (outcome === 'success') gate.resolve({ attempt: { attemptId: 'owned', state: 'SUBMITTED' } });
    else gate.reject(Object.assign(new Error('Old session ended'), { code: 'UNAUTHENTICATED', status: 401 }));
    await pendingRead;
    assert.equal(h.state.attempt, current); assert.equal(h.state.pendingAnswer, pending);
    assert.equal(h.state.busy, false); assert.equal(h.calls.renders, renders);
    assert.equal(h.calls.statuses.length, statuses); assert.deepEqual(h.calls.messages, []);
  });
}


test('a committed save with lost acknowledgement is not falsely described as excluded after another tab submits', async () => {
  let committed = false;
  const h = closedSaveHarness({
    save: async () => { committed = true; throw Object.assign(new Error('Lost acknowledgement'), { code: 'TEMPORARILY_UNAVAILABLE' }); },
    read: async () => ({ attempt: { attemptId: 'owned', state: 'GRADED', result: { percentage: '25.00' } } }),
  });
  await h.save();
  assert.equal(committed, true); assert.ok(h.state.pendingAnswer);
  // Explicit discard/reconciliation also reads uncertain writes; the terminal
  // projection cannot reveal whether that previously unacknowledged write won.
  await h.reload();
  assert.equal(h.state.attempt.result.percentage, '25.00');
  assert.match(h.state.resumeNotice, /máy chủ đã ghi nhận trước khi đóng bài/);
  assert.doesNotMatch(h.state.resumeNotice, /không được tính|đã không được gửi/);
  assert.equal(h.state.pendingAnswer, null);
});
