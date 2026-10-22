import assert from 'node:assert/strict';

/** Actual deadline overrides pending429 without resubmitting an unsaved draft. */
export async function runRateLimitExpiryJourney({ evaluate, command, click, query, waitFor, fixture, capture, report, scope, workerState }) {
  await click('demo-start');
  await waitFor("Boolean(document.getElementById('question-title'))", 'short reading attempt starts');
  const view = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json())`);
  assert.equal(view.domain, 'READING'); assert.equal(view.slots.length, 2);
  assert.equal(Date.parse(view.deadlineAt) - Date.parse(view.startedAt), 8000);
  const [first, second] = view.slots;
  const frozen = async () => (await fixture.pool.query(`SELECT to_jsonb(f) AS form,to_jsonb(ar) AS assembly,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordinal) FROM tsa.form_sections s WHERE s.form_id=f.id) AS sections,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordinal) FROM tsa.form_slots s WHERE s.form_id=f.id) AS slots,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.slot_id) FROM tsa_private.form_slot_secrets s WHERE s.form_id=f.id) AS secrets,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.question_id) FROM tsa.student_question_history h WHERE h.first_attempt_id=a.id) AS history,
    a.started_at::text,a.deadline_at::text
    FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id JOIN tsa.assembly_runs ar ON ar.id=f.assembly_run_id WHERE a.id=$1`, [view.attemptId])).rows[0];
  const original = await frozen(); assert.equal(original.history.length, 2);
  const answers = async () => (await fixture.pool.query('SELECT slot_id,value,revision::text,saved_at::text FROM tsa.answers WHERE attempt_id=$1 ORDER BY slot_id', [view.attemptId])).rows;
  const buckets = async () => (await fixture.pool.query("SELECT scope,subject_id,tokens::text,refilled_at::text FROM tsa.rate_limit_buckets WHERE scope IN('USER_SAVE','ATTEMPT_SAVE') ORDER BY scope,subject_id")).rows;
  const secondReceipt = async () => (await fixture.pool.query('SELECT id FROM tsa.idempotency_records WHERE route_scope=$1', [`PUT /api/v1/attempts/${view.attemptId}/answers/${second.slotId}`])).rows;
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__expirySaves=[];window.__expirySubmits=[];window.fetch=async(input,init={})=>{const response=await original(input,init);const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;if(init.method==='PUT')window.__expirySaves.push({path,status:response.status,retryAfter:response.headers.get('retry-after'),body:await response.clone().json()});if(init.method==='POST'&&path.endsWith('/submit'))window.__expirySubmits.push(response.status);return response;};})()`);
  await click('option-b');
  await waitFor(`${query('save-status')}.classList.contains('saved')`, 'first answer acknowledged before deadline');
  const saved = await answers(); assert.equal(saved.length, 1); assert.equal(saved[0].slot_id, first.slotId);
  assert.equal(saved[0].revision, '1'); assert.equal(saved[0].value.optionId, 'b');
  const depleted = await buckets(); assert.equal(depleted.find((r) => r.scope === scope).tokens, '0.000000');
  await click('question-next'); await click('option-c');
  await waitFor(`Boolean(${query('save-error')}) && Boolean(${query('answer-unsaved')})`, 'actual429 keeps second answer pending');
  assert.equal(await evaluate(`${query('option-c')}.checked && !${query('save-status')}.classList.contains('saved')`), true);
  for (const id of ['question-prev', 'question-next', 'question-counter', 'submit-open', 'exam-catalog']) assert.equal(await evaluate(`${query(id)}.disabled`), true);
  const observed = await evaluate('window.__expirySaves'); assert.deepEqual(observed.map((r) => r.status), [200, 429]);
  assert.equal(observed[1].body.error.code, 'RATE_LIMITED'); assert.match(observed[1].retryAfter, /^[1-9][0-9]*$/);
  assert.equal(Number(observed[1].retryAfter), observed[1].body.error.details.retryAfterSeconds);
  assert.deepEqual(await answers(), saved); assert.deepEqual(await secondReceipt(), []); assert.deepEqual(await buckets(), depleted);
  assert.deepEqual((await fixture.pool.query('SELECT state,clock_timestamp()<deadline_at AS before_deadline FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0], { state: 'IN_PROGRESS', before_deadline: true });
  const inputHash = (await fixture.pool.query('SELECT tsa.exam_grading_input_hash($1) AS hash', [view.attemptId])).rows[0].hash;
  await capture(`${scope.toLowerCase()}-pending-before-deadline`);
  // Stay on this page: the existing monotonic timer must reconcile despite the pending save.
  await waitFor(`Boolean(${query('grading-pending')})`, 'deadline closes the attempt despite an unresolved429 draft');
  assert.equal(await evaluate('document.body.innerText.includes("máy chủ đã ghi nhận trước khi đóng bài")'), true);
  assert.equal(await evaluate(`Boolean(${query('answer-unsaved')}) || Boolean(${query('save-error-action')})`), false);
  assert.deepEqual(await evaluate('window.__expirySaves.map(r=>r.status)'), [200, 429]);
  assert.deepEqual(await evaluate('window.__expirySubmits'), [], 'deadline reconciliation is an owned read, not a forced submit');
  const closed = (await fixture.pool.query(`SELECT state,terminal_reason,grading_status,closed_at=deadline_at AS exact_deadline,
    clock_timestamp()>=deadline_at AS deadline_reached FROM tsa.attempts WHERE id=$1`, [view.attemptId])).rows[0];
  assert.deepEqual(closed, { state: 'EXPIRED', terminal_reason: 'DEADLINE', grading_status: 'PENDING', exact_deadline: true, deadline_reached: true });
  const jobs = async () => (await fixture.pool.query('SELECT id,state,dedup_key,payload_ref FROM tsa.jobs WHERE attempt_id=$1', [view.attemptId])).rows;
  const queued = await jobs(); assert.equal(queued.length, 1); assert.equal(queued[0].state, 'QUEUED');
  assert.ok(queued[0].dedup_key.endsWith(`:${inputHash}`)); assert.equal(queued[0].payload_ref, `attempt:${view.attemptId}`);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.result_releases WHERE attempt_id=$1', [view.attemptId])).rows[0].n, 0);
  assert.deepEqual(await frozen(), original); assert.deepEqual(await answers(), saved); assert.deepEqual(await secondReceipt(), []);
  assert.deepEqual(await buckets(), depleted);
  await capture(`${scope.toLowerCase()}-expired-pending`);
  // Repeated owned reconciliation must not duplicate jobs or alter original inputs.
  await evaluate(`fetch('/api/v1/attempts/${view.attemptId}').then(r=>r.json())`);
  assert.deepEqual(await jobs(), queued);
  workerState.available = true;
  await waitFor(`Boolean(${query('result')})`, 'grader scores only the one acknowledged answer');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /50%/);
  const result = await evaluate(`fetch('/api/v1/attempts/${view.attemptId}/result').then(r=>r.json())`);
  assert.equal(result.correctCount, 1); assert.equal(result.totalCount, 2); assert.equal(result.percentage, '50.00');
  assert.deepEqual(result.items.map((item) => item.earned), [1, 0]);
  const grade = (await fixture.pool.query(`SELECT s.input_hash,s.correct_count,s.total_count,
    (SELECT count(*)::int FROM tsa.score_runs WHERE attempt_id=a.id) AS scores,
    (SELECT count(*)::int FROM tsa.result_releases WHERE attempt_id=a.id) AS releases,
    (SELECT count(*)::int FROM tsa.jobs WHERE attempt_id=a.id) AS jobs
    FROM tsa.attempts a JOIN tsa.score_runs s ON s.id=a.latest_score_id WHERE a.id=$1`, [view.attemptId])).rows[0];
  assert.deepEqual(grade, { input_hash: inputHash, correct_count: 1, total_count: 2, scores: 1, releases: 1, jobs: 1 });
  assert.deepEqual(await frozen(), original); assert.deepEqual(await answers(), saved); assert.deepEqual(await secondReceipt(), []); assert.deepEqual(await buckets(), depleted);
  assert.equal((await fixture.pool.query(`SELECT tokens+greatest(0,extract(epoch FROM clock_timestamp()-refilled_at))*0.01<1 AS depleted
    FROM tsa.rate_limit_buckets WHERE scope=$1`, [scope])).rows[0].depleted, true);
  assert.deepEqual(await evaluate('window.__expirySaves.map(r=>r.status)'), [200, 429], 'no late retry through grading/result');
  assert.deepEqual(await evaluate('window.__expirySubmits'), [], 'no late submit through grading/result');
  const beforeReload = await evaluate('performance.timeOrigin');
  await command('Page.reload', { ignoreCache: true });
  await waitFor(`performance.timeOrigin!==${beforeReload} && Boolean(${query('result')})`, 'reload retains the original expiry result');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /50%/);
  assert.deepEqual(await jobs(), [{ ...queued[0], state: 'SUCCEEDED' }]);
  assert.deepEqual(await frozen(), original); assert.deepEqual(await answers(), saved);
  await capture(`${scope.toLowerCase()}-expiry-result`);
  report.rateLimitExpiry = { scope, attemptId: view.attemptId, statuses: [200, 429], retryAfter: observed[1].retryAfter,
    closure: closed, percentage: result.percentage, jobs: 1, scores: 1, releases: 1 };
  report.checks = ['Actual429 pending choice stays unsaved and blocks navigation/submit before the real deadline',
    'Monotonic timer reconciles actual PostgreSQL expiry without retrying the pending answer or submitting',
    'Exact deadline, immutable form/manifest/secrets/history/clocks and one acknowledged answer remain intact',
    'One original-input job/score/release produces50%; pending correct choice remains absent, including after reload'];
}
