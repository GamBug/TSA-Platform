import assert from 'node:assert/strict';
import { createExamWorker } from '../src/modules/jobs/exam-worker.mjs';

/** Actual worker failure commands and browser HTTP; no corruption of sealed input. */
export async function runGradeFailureJourney({ evaluate, command, click, query, waitFor, fixture, capture, report, workerPool, workerState, requestRecords }) {
  assert.equal(workerState.available, false, 'ordinary poller stays isolated until the terminal failure is committed');
  await click('demo-start'); await waitFor("Boolean(document.getElementById('question-title'))", 'failure fixture starts');
  const view = await evaluate("fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json())");
  assert.equal(view.state, 'IN_PROGRESS'); assert.equal(view.slots.length, 2);
  for (let index = 0; index < 2; index++) {
    if (index) await click('question-next');
    await click(`option-${fixture.expectedOptions[index]}`);
    await waitFor(`${query('save-status')}.classList.contains('saved')`, 'acknowledged answer before failure');
  }
  await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('grading-pending')})`, 'persisted pending submission');
  const snapshot = async () => (await fixture.pool.query(`SELECT to_jsonb(f) AS form,to_jsonb(ar) AS manifest,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY ordinal) FROM tsa.form_slots s WHERE s.form_id=f.id) AS slots,
    (SELECT jsonb_agg(to_jsonb(k) ORDER BY slot_id) FROM tsa_private.form_slot_secrets k WHERE k.form_id=f.id) AS keys,
    (SELECT jsonb_agg(to_jsonb(ans) ORDER BY slot_id) FROM tsa.answers ans WHERE ans.attempt_id=a.id) AS answers,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY question_id) FROM tsa.student_question_history h WHERE h.first_attempt_id=a.id) AS history,
    jsonb_build_object('createdAt',a.created_at,'startBefore',a.start_before_at,'startedAt',a.started_at,'deadlineAt',a.deadline_at,
      'closedAt',a.closed_at,'terminalReason',a.terminal_reason) AS clocks,tsa.exam_grading_input_hash(a.id) AS digest
    FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id JOIN tsa.assembly_runs ar ON ar.id=f.assembly_run_id WHERE a.id=$1`, [view.attemptId])).rows[0];
  const original = await snapshot(); assert.equal(original.answers.length, 2); assert.equal(original.history.length, 2);
  const worker = createExamWorker({ workerPool, executorId: 'browser-failure-evidence', leaseSeconds: 30, retrySeconds: 1 });
  const first = await worker.claim(); assert.equal(first.status, 'CLAIMED');
  assert.equal((await worker.fail(first, 'TEMPORARILY_UNAVAILABLE')).status, 'FAILED_RETRYABLE');
  assert.deepEqual(await worker.claim(), { status: 'IDLE' }, 'actual retry delay prevents immediate reclaim');
  await waitFor(`${query('grading-status')}?.dataset.gradingStatus==='FAILED_RETRYABLE' && ${query('grading-status')}.textContent.includes('máy chủ sẽ thử lại')`, 'student sees real retryable state in Vietnamese');
  assert.equal(await evaluate(`Boolean(${query('result')} || ${query('review-open')})`), false);
  await capture('grading-retryable');
  let second; const until = Date.now() + 3_000;
  do {
    second = await worker.claim();
    if (second.status === 'CLAIMED') break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < until);
  assert.equal(second.status, 'CLAIMED'); assert.equal(second.dispatch.jobId, first.dispatch.jobId);
  assert.ok(BigInt(second.leaseToken) > BigInt(first.leaseToken));
  // Explicit synthetic trusted failure report, not a claim that correct fixture input is corrupt.
  assert.equal((await worker.fail(second, 'INVALID_GRADING_INPUT')).status, 'FAILED_FINAL');
  workerState.available = true;
  await waitFor(`Boolean(${query('grading-failed-final')})`, 'student sees actual terminal failure');
  assert.match(await evaluate(`${query('grading-failed-final')}.innerText`), /CHƯA CÓ ĐIỂM/);
  assert.equal(await evaluate(`Boolean(${query('result')} || ${query('review-open')} || document.getElementById('question-title'))`), false);
  await capture('grading-final');
  const counts = async () => (await fixture.pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.score_runs) AS scores,(SELECT count(*)::int FROM tsa.score_items) AS items,
    (SELECT count(*)::int FROM tsa.result_releases) AS releases,
    (SELECT count(*)::int FROM tsa.audit_events WHERE action='ATTEMPT_GRADED') AS graded_audits`)).rows[0];
  assert.deepEqual(await counts(), { scores: 0, items: 0, releases: 0, graded_audits: 0 });
  const state = async () => (await fixture.pool.query('SELECT a.state,a.grading_status,to_jsonb(j) AS job FROM tsa.attempts a JOIN tsa.jobs j ON j.attempt_id=a.id WHERE a.id=$1', [view.attemptId])).rows[0];
  const settled = await state(); assert.equal(settled.state, 'SUBMITTED'); assert.equal(settled.grading_status, 'FAILED_FINAL');
  assert.equal(settled.job.attempts, 2); assert.equal(settled.job.state, 'FAILED_FINAL');
  const route = `/api/v1/attempts/${view.attemptId}`;
  const gets = () => requestRecords.filter((item) => item.method === 'GET' && new URL(item.url).pathname === route).length;
  const stoppedAt = gets(); await new Promise((resolve) => setTimeout(resolve, 2_200));
  assert.equal(gets(), stoppedAt, 'terminal screen stops automatic status polling');
  const mutations = requestRecords.filter((item) => item.method !== 'GET').length;
  const completed = await evaluate(`performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===${JSON.stringify(route)}).length`);
  await click('grade-status-retry');
  await waitFor(`performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===${JSON.stringify(route)}).length===${completed + 1}`, 'explicit status check completes one GET');
  assert.equal(gets(), stoppedAt + 1); assert.equal(requestRecords.filter((item) => item.method !== 'GET').length, mutations);
  assert.deepEqual(await state(), settled, 'student status checking cannot requeue or regrade');
  const owner = await evaluate(`fetch(${JSON.stringify(route)}).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(owner.status, 200); assert.equal(owner.body.closure.gradingStatus, 'FAILED_FINAL');
  assert.equal(owner.body.slots.length, 0); assert.equal(owner.body.answers.length, 0);
  const result = await evaluate(`fetch(${JSON.stringify(route + '/result')}).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(result.status, 409); assert.equal(result.body.error.code, 'RESULT_NOT_READY');
  const previous = await evaluate('performance.timeOrigin'); await command('Page.reload', { ignoreCache: true });
  await waitFor(`performance.timeOrigin!==${previous} && Boolean(${query('grading-failed-final')})`, 'fresh document retains terminal failed state');
  await capture('grading-final-reload');
  await click('persistent-logout'); await click('persistent-login-studentB');
  await waitFor(`Boolean(${query('demo-start')})`, 'foreign candidate catalog');
  for (const url of [route, route + '/result']) {
    const foreign = await evaluate(`fetch(${JSON.stringify(url)}).then(async r=>({status:r.status,body:await r.json()}))`);
    assert.equal(foreign.status, 404); assert.equal(foreign.body.error.code, 'NOT_FOUND');
  }
  assert.deepEqual(await snapshot(), original); assert.deepEqual(await state(), settled);
  assert.deepEqual(await counts(), { scores: 0, items: 0, releases: 0, graded_audits: 0 });
  assert.deepEqual(await worker.claim(), { status: 'IDLE' });
  report.gradingFailure = { attemptId: view.attemptId, observed: ['FAILED_RETRYABLE', 'FAILED_FINAL'], leaseAttempts: settled.job.attempts,
    scoreRuns: 0, releases: 0, terminalPollingStopped: true, statusCheckIsReadOnly: true, exactInputsPreserved: true };
  report.checks = ['Real trusted worker retry/backoff/final-failure commands exercise student HTTP/UI without modifying sealed input',
    'Retryable status and terminal no-score screen are truthful; no score/keys/release or automatic regrade',
    'Explicit status check is GET-only, reload retains final failure and foreign access is404',
    'Exact original snapshots/answers/history/clocks/digest remain; zero score/items/releases/grading-success audits'];
}
