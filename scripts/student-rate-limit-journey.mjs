import assert from 'node:assert/strict';

/** Real PostgreSQL budget/refill coverage; never a mocked HTTP429 response. */
export async function runRateLimitJourney({ evaluate, command, click, query, waitFor, fixture, capture, report, scope }) {
  await click('demo-start');
  await waitFor("Boolean(document.getElementById('question-title'))", 'rate-limited reading test starts');
  const view = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json())`);
  assert.equal(view.domain, 'READING'); assert.equal(view.slots.length, 2);
  const [first, second] = view.slots;
  const bucketRows = async () => (await fixture.pool.query(`SELECT scope,subject_id,tokens::text,refilled_at::text FROM tsa.rate_limit_buckets
    WHERE scope IN('USER_SAVE','ATTEMPT_SAVE') ORDER BY scope,subject_id`)).rows;
  const answers = async () => (await fixture.pool.query('SELECT slot_id,value,revision::text FROM tsa.answers WHERE attempt_id=$1 ORDER BY slot_id', [view.attemptId])).rows;
  const receipt = async () => (await fixture.pool.query('SELECT id FROM tsa.idempotency_records WHERE route_scope=$1',
    [`PUT /api/v1/attempts/${view.attemptId}/answers/${second.slotId}`])).rows;
  const clock = (await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0];
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__rateSaves=[];window.__rateSubmits=[];window.fetch=async(input,init={})=>{const response=await original(input,init);const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;if(init.method==='PUT'&&path.includes('/answers/'))window.__rateSaves.push({path,key:new Headers(init.headers).get('idempotency-key'),body:JSON.parse(init.body),status:response.status,retryAfter:response.headers.get('retry-after'),response:await response.clone().json()});if(init.method==='POST'&&path.endsWith('/submit'))window.__rateSubmits.push(response.status);return response;};})()`);
  await click('option-b');
  await waitFor(`${query('option-b')}.checked && ${query('save-status')}.classList.contains('saved')`, 'first acknowledged answer consumes one token');
  const acknowledged = await answers(); assert.equal(acknowledged.length, 1); assert.equal(acknowledged[0].slot_id, first.slotId);
  const depleted = await bucketRows(); assert.equal(depleted.find((row) => row.scope === scope).tokens, '0.000000');
  await click('question-next'); await click('option-c');
  await waitFor(`Boolean(${query('save-error')})`, `${scope} real429 retains pending answer`);
  const pending = async () => {
    assert.equal(await evaluate(`${query('option-c')}.checked && Boolean(${query('answer-unsaved')}) && !${query('save-status')}.classList.contains('saved')`), true);
    for (const id of ['question-prev', 'question-next', 'question-counter', 'submit-open', 'exam-catalog']) {
      assert.equal(await evaluate(`${query(id)}.disabled`), true, `${id} stays disabled with an unacknowledged choice`);
    }
    assert.match(await evaluate(`${query('save-status')}.textContent`), /Chưa lưu/);
    assert.match(await evaluate(`${query('save-error')}.textContent`), /quá nhanh|đợi/);
    assert.deepEqual(await answers(), acknowledged); assert.deepEqual(await receipt(), []);
    assert.deepEqual(await bucketRows(), depleted, 'denial updates neither rate bucket');
  };
  await pending(); await capture(`${scope.toLowerCase()}-pending429`);
  // A deliberate early explicit retry must still fail; no automated retry or false ACK.
  await click('save-error-action');
  await waitFor('window.__rateSaves.length===3', 'early retry has an observed real response');
  await waitFor(`Boolean(${query('save-error')})`, 'early retry remains explicitly unsaved');
  await pending();
  const attempts = await evaluate('window.__rateSaves');
  assert.deepEqual(attempts.map((item) => item.status), [200, 429, 429]);
  assert.notEqual(attempts[0].key, attempts[1].key); assert.equal(attempts[1].key, attempts[2].key);
  for (const response of attempts.slice(1)) {
    assert.match(response.retryAfter ?? '', /^[1-9][0-9]*$/); assert.equal(response.response.error.code, 'RATE_LIMITED');
    assert.equal(Number(response.retryAfter), response.response.error.details.retryAfterSeconds);
    assert.deepEqual(response.body, { expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: 'c' } });
  }
  const until = Date.now() + 15_000;
  while (!(await fixture.pool.query(`SELECT tokens+greatest(0,extract(epoch FROM clock_timestamp()-refilled_at))*0.1>=1 AS available
    FROM tsa.rate_limit_buckets WHERE scope=$1`, [scope])).rows[0].available) {
    assert.ok(Date.now() < until, 'actual PostgreSQL refill must become available within the configured bound');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(await evaluate('window.__rateSaves.length'), 3, 'no background retry consumes a token');
  assert.deepEqual(await receipt(), []); assert.deepEqual(await bucketRows(), depleted, 'waiting alone does not mutate persisted bucket timestamps/tokens');
  await click('save-error-action');
  await waitFor(`!${query('save-error')} && !${query('answer-unsaved')} && ${query('option-c')}.checked && ${query('save-status')}.classList.contains('saved')`, 'explicit retry acknowledges the saved choice after real refill');
  const requests = await evaluate('window.__rateSaves'); assert.deepEqual(requests.map((r) => r.status), [200, 429, 429, 200]);
  assert.equal(requests[3].key, requests[1].key); assert.deepEqual(requests[3].body, requests[1].body);
  const stored = await answers(); assert.equal(stored.length, 2); assert.ok(stored.every((a) => a.revision === '1'));
  assert.equal(stored.find((a) => a.slot_id === second.slotId).value.optionId, 'c'); assert.equal((await receipt()).length, 1);
  assert.deepEqual((await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0], clock);
  assert.equal((await fixture.pool.query(`SELECT tokens+greatest(0,extract(epoch FROM clock_timestamp()-refilled_at))*0.1<1 AS depleted
    FROM tsa.rate_limit_buckets WHERE scope=$1`, [scope])).rows[0].depleted, true);
  await capture(`${scope.toLowerCase()}-saved-after-refill`);
  const beforeSubmit = await bucketRows();
  await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'save throttle does not throttle submission/grading');
  assert.deepEqual(await evaluate('window.__rateSubmits'), [200]);
  assert.match(await evaluate(`${query('result-score')}.textContent`), /100%/);
  const grade = (await fixture.pool.query(`SELECT s.correct_count,s.total_count,s.percentage::text AS percentage,
    (SELECT count(*)::int FROM tsa.jobs WHERE attempt_id=a.id) AS jobs
    FROM tsa.attempts a JOIN tsa.score_runs s ON s.id=a.latest_score_id WHERE a.id=$1`, [view.attemptId])).rows[0];
  assert.deepEqual(grade, { correct_count: 2, total_count: 2, percentage: '100.00', jobs: 1 });
  assert.deepEqual(await bucketRows(), beforeSubmit, 'submission does not consume or refill either save budget');
  assert.equal((await fixture.pool.query(`SELECT tokens+greatest(0,extract(epoch FROM clock_timestamp()-refilled_at))*0.1<1 AS depleted
    FROM tsa.rate_limit_buckets WHERE scope=$1`, [scope])).rows[0].depleted, true, 'save budget remains unavailable through successful submission');
  await capture(`${scope.toLowerCase()}-result`);
  report.rateLimit = { scope, attemptId: view.attemptId, retryAfter: attempts.slice(1).map((r) => r.retryAfter),
    statuses: requests.map((r) => r.status), pendingKey: requests[1].key, savedRevision: '1', percentage: grade.percentage };
  report.checks = [`Actual ${scope} PostgreSQL save budget produces429/Retry-After without answer, receipt or bucket mutation`,
    'Pending draft remains selected and unsaved; previous/next/navigator/catalog/submit remain blocked',
    'Early explicit retry remains429; no background retry; actual refill permits the same-key/body explicit retry once',
    'Both question answers persist at revision1, clocks unchanged, depleted save budget does not block submit and100% result'];
}
