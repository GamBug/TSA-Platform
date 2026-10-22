import assert from 'node:assert/strict';

/** Real CREATED recovery; admission cap shortens the wait, never the600s policy. */
export async function runReservationJourney({ evaluate, command, click, query, waitFor, fixture, capture, report, workerState, requestRecords, late }) {
  if (late) await fixture.pool.query(`UPDATE tsa.blueprint_offerings SET available_until=clock_timestamp()+interval '12 seconds',revision=revision+1 WHERE blueprint_version_id=$1`, [fixture.blueprint.versionId]);
  const reserved = await evaluate(`fetch('/api/v1/attempts',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':decodeURIComponent(document.cookie.split('; ').find(s=>s.startsWith('tsa_local_csrf=')).split('=')[1]),'idempotency-key':crypto.randomUUID()},body:JSON.stringify({blueprintVersionId:${JSON.stringify(fixture.blueprint.versionId)}})}).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(reserved.status, 201); const { attemptId, formId, startBefore } = reserved.body;
  const immutable = async () => (await fixture.pool.query(`SELECT to_jsonb(f) AS form,to_jsonb(ar) AS assembly,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordinal) FROM tsa.form_slots s WHERE s.form_id=f.id) AS slots,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.slot_id) FROM tsa_private.form_slot_secrets s WHERE s.form_id=f.id) AS secrets,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.question_id) FROM tsa.student_question_history h WHERE h.first_attempt_id=a.id) AS history,
    a.created_at::text,a.start_before_at::text,a.admission_until_at_creation::text
    FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id JOIN tsa.assembly_runs ar ON ar.id=f.assembly_run_id WHERE a.id=$1`, [attemptId])).rows[0];
  const original = await immutable(); assert.equal(original.history.length, 2); assert.equal(original.form.id, formId);
  const policy = (await fixture.pool.query(`SELECT o.start_ttl_seconds,a.start_before_at=least(a.created_at+interval '600 seconds',a.admission_until_at_creation) AS exact,
    extract(epoch FROM a.start_before_at-a.created_at)::float8 AS seconds FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id
    JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=f.blueprint_version_id WHERE a.id=$1`, [attemptId])).rows[0];
  assert.equal(policy.start_ttl_seconds, 600); assert.equal(policy.exact, true);
  assert.ok(late ? policy.seconds > 0 && policy.seconds <= 12 : policy.seconds === 600);
  const raw = await evaluate(`fetch('/api/v1/attempts/${attemptId}').then(r=>r.json())`);
  assert.equal(raw.state, 'CREATED'); assert.deepEqual(raw.slots, []); assert.deepEqual(raw.answers, []);
  assert.equal(raw.startedAt, null); assert.equal(raw.deadlineAt, null); assert.equal(Date.parse(raw.startBefore), Date.parse(startBefore));
  const creationCount = () => requestRecords.filter((r) => r.method === 'POST' && new URL(r.url).pathname === '/api/v1/attempts').length;
  const starts = () => requestRecords.filter((r) => r.method === 'POST' && new URL(r.url).pathname.endsWith('/start'));
  for (let index = 0; index < 2; index++) {
    const before = await evaluate('performance.timeOrigin'); await command('Page.reload', { ignoreCache: true });
    await waitFor(`performance.timeOrigin!==${before} && Boolean(${query('created-attempt')})`, 'reload restores reservation without starting');
    assert.equal(await evaluate(`Boolean(document.getElementById('question-title')) || Boolean(${query('timer')})`), false);
    assert.match(await evaluate(`${query('created-attempt')}.textContent`), /Bắt đầu trước.*ICT/);
    assert.deepEqual((await fixture.pool.query('SELECT state,started_at,deadline_at FROM tsa.attempts WHERE id=$1', [attemptId])).rows[0], { state: 'CREATED', started_at: null, deadline_at: null });
    assert.deepEqual(await immutable(), original); assert.equal(creationCount(), 1); assert.equal(starts().length, 0);
  }
  await capture(late ? 'reserved-admission-capped' : 'reserved-full-ttl');
  if (late) {
    // An ordinary extension cannot extend the reservation's captured deadline.
    await fixture.pool.query(`UPDATE tsa.blueprint_offerings SET available_until=clock_timestamp()+interval '1 day',revision=revision+1 WHERE blueprint_version_id=$1`, [fixture.blueprint.versionId]);
    assert.deepEqual(await immutable(), original);
    const until = Date.now() + 15000;
    while (!(await fixture.pool.query('SELECT clock_timestamp()>=start_before_at AS elapsed FROM tsa.attempts WHERE id=$1', [attemptId])).rows[0].elapsed) {
      assert.ok(Date.now() < until, 'real stored admission deadline must elapse');
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.equal((await fixture.pool.query('SELECT state FROM tsa.attempts WHERE id=$1', [attemptId])).rows[0].state, 'CREATED', 'worker outage leaves cancellation to owned start/read');
    assert.equal((await fixture.pool.query('SELECT clock_timestamp()<available_until AS open FROM tsa.blueprint_offerings WHERE blueprint_version_id=$1', [fixture.blueprint.versionId])).rows[0].open, true);
    await click('created-start');
    await waitFor(`Boolean(${query('persistent-blocked')})`, 'late explicit start shows authoritative cancellation');
    assert.equal(creationCount(), 1, 'late start never attempts a replacement allocation');
    assert.match(await evaluate(`${query('persistent-blocked')}.textContent`), /thời hạn bắt đầu/);
    const cancelled = await evaluate(`fetch('/api/v1/attempts/${attemptId}').then(r=>r.json())`);
    assert.equal(cancelled.state, 'CANCELLED'); assert.equal(cancelled.closure.cancellationReason, 'START_TTL_EXPIRED');
    assert.equal(cancelled.startedAt, null); assert.equal(cancelled.deadlineAt, null);
    assert.deepEqual(cancelled.slots, []); assert.deepEqual(cancelled.answers, []);
    assert.equal(await evaluate(`Boolean(document.getElementById('question-title')) || Boolean(${query('created-start')})`), false);
    assert.equal(creationCount(), 1, 'late start never attempts a replacement allocation');
    assert.equal(starts().length, 1, 'explicit start targets the reserved attempt');
    assert.equal(new URL(starts()[0].url).pathname, `/api/v1/attempts/${attemptId}/start`);
    assert.deepEqual(await immutable(), original);
    const counts = (await fixture.pool.query(`SELECT (SELECT count(*)::int FROM tsa.attempts) AS attempts,
      (SELECT count(*)::int FROM tsa.jobs) AS jobs,(SELECT count(*)::int FROM tsa.score_runs) AS scores,
      (SELECT count(*)::int FROM tsa.answers) AS answers`)).rows[0];
    assert.deepEqual(counts, { attempts: 1, jobs: 0, scores: 0, answers: 0 });
    await capture('reservation-start-expired');
  } else {
    workerState.available = true; await click('created-start');
    await waitFor("Boolean(document.getElementById('question-title'))", 'explicit start opens original reserved form');
    assert.equal(creationCount(), 1); assert.equal(starts().length, 1);
    assert.equal(new URL(starts()[0].url).pathname, `/api/v1/attempts/${attemptId}/start`);
    assert.deepEqual(await immutable(), original);
    const active = await evaluate(`fetch('/api/v1/attempts/${attemptId}').then(r=>r.json())`);
    assert.equal(active.state, 'IN_PROGRESS'); assert.equal(active.formId, formId); assert.equal(active.slots.length, 2);
    assert.equal(Date.parse(active.deadlineAt) - Date.parse(active.startedAt), 180000);
    for (const [index, option] of ['b', 'c'].entries()) {
      if (index) await click('question-next'); await click(`option-${option}`);
      await waitFor(`${query('save-status')}.classList.contains('saved')`, 'reserved form answer acknowledged');
    }
    await click('submit-open'); await click('submit-confirm');
    await waitFor(`Boolean(${query('result')})`, 'reserved exam yields real result');
    assert.match(await evaluate(`${query('result-score')}.textContent`), /100%/);
    assert.deepEqual(await immutable(), original); assert.equal(creationCount(), 1); assert.equal(starts().length, 1);
    await capture('reservation-result');
  }
  report.reservation = { attemptId, late, startBefore, policy, allocationRequests: creationCount(), startRequests: starts().length };
  report.checks = ['Actual reserved CREATED attempt reloads twice without question payload, running clocks or implicit start',
    'Immutable form/manifest/secrets/history and stored600s policy persist; late case uses actual capped admission end',
    late ? 'Late start cancels the original reservation with explicit reason and no replacement allocation, answers or jobs'
      : 'Explicit start uses the original reservation, saves both answers and yields100% through real grading'];
}
