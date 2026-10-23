import assert from 'node:assert/strict';

/** Ordinary schedule edits affect new admission, not captured existing clocks. */
export async function runAdmissionJourney({ evaluate, command, click, query, waitFor, fixture, capture, report, requestRecords, assertTimingNotice }) {
  const create = () => evaluate(`fetch('/api/v1/attempts',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':decodeURIComponent(document.cookie.split('; ').find(s=>s.startsWith('tsa_local_csrf=')).split('=')[1]),'idempotency-key':crypto.randomUUID()},body:JSON.stringify({blueprintVersionId:${JSON.stringify(fixture.blueprint.versionId)}})}).then(async r=>({status:r.status,body:await r.json()}))`);
  const allocated = await create(); assert.equal(allocated.status, 201);
  const { attemptId } = allocated.body;
  const frozen = async () => (await fixture.pool.query(`SELECT to_jsonb(f) AS form,to_jsonb(ar) AS assembly,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordinal) FROM tsa.form_slots s WHERE s.form_id=f.id) AS slots,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.slot_id) FROM tsa_private.form_slot_secrets s WHERE s.form_id=f.id) AS secrets,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.question_id) FROM tsa.student_question_history h WHERE h.first_attempt_id=a.id) AS history,
    a.created_at::text,a.start_before_at::text,a.admission_until_at_creation::text
    FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id JOIN tsa.assembly_runs ar ON ar.id=f.assembly_run_id WHERE a.id=$1`, [attemptId])).rows[0];
  const original = await frozen();
  const clocks = async () => (await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [attemptId])).rows[0];
  const creates = () => requestRecords.filter((r) => r.method === 'POST' && new URL(r.url).pathname === '/api/v1/attempts').length;
  const starts = () => requestRecords.filter((r) => r.method === 'POST' && new URL(r.url).pathname.endsWith('/start'));
  const reload = async (testId) => {
    const before = await evaluate('performance.timeOrigin'); await command('Page.reload', { ignoreCache: true });
    await waitFor(`performance.timeOrigin!==${before} && Boolean(${query(testId)})`, 'reload reconciles existing owned attempt');
  };
  const catalog = async (state) => {
    await click(state === 'CREATED' ? 'return-catalog' : 'exam-catalog');
    await waitFor(`Boolean(${query('catalog-grid')})`, 'catalog opens with server-provided entries');
  };
  const login = async (actor) => {
    await click('persistent-logout'); await waitFor(`Boolean(${query('persistent-login-' + actor)})`, 'explicit candidate selection');
    await click('persistent-login-' + actor);
    await waitFor(actor === 'studentB' ? `Boolean(${query('catalog-grid')})` : `Boolean(${query('created-attempt')}) || Boolean(document.getElementById('question-title'))`, 'candidate restores only own state');
  };
  const windowFacts = async (label) => {
    assert.equal(await evaluate(`${query('catalog-card-READING')}.querySelector('.status-badge').textContent`), label);
    const text = await evaluate(`${query('catalog-card-READING')}.querySelector('.domain-facts').textContent`);
    assert.match(text, /Mở.*ICT/); assert.match(text, /Đóng.*ICT/); return text;
  };
  const disabledPointer = async (id) => {
    assert.equal(await evaluate(`${query(id)}.disabled`), true);
    const box = await evaluate(`(()=>{const el=${query(id)};el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
    assert.equal(await evaluate(`${query(id)}.contains(document.elementFromPoint(${box.x},${box.y}))`), true);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...box, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...box, button: 'left', clickCount: 1 });
  };
  const deniedNew = async (label, status, code, listed = true) => {
    await login('studentB');
    const before = creates(); let facts = null;
    if (listed) {
      facts = await windowFacts(label);
      await disabledPointer('demo-start');
      assert.equal(creates(), before, 'disabled new-start sends no allocation request');
      await click('exam-intro'); await assertTimingNotice('intro-start');
      assert.match(await evaluate(`${query('intro-structure')}.textContent`), /Mở:.*ICT.*Đóng:.*ICT/);
      await disabledPointer('intro-start'); assert.equal(creates(), before);
    } else {
      assert.equal(await evaluate(`Boolean(${query('catalog-card-READING')})`), false, 'elapsed offerings are omitted by the frozen catalog');
      assert.equal(await evaluate(`Boolean(${query('demo-start')})`), false);
    }
    const denied = await create(); assert.equal(denied.status, status); assert.equal(denied.body.error.code, code);
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 1);
    await capture(`admission-${code.toLowerCase()}-new-blocked`);
    await login('studentA'); return facts;
  };
  await fixture.pool.query(`UPDATE tsa.blueprint_offerings SET available_from=clock_timestamp()+interval '1 day',available_until=clock_timestamp()+interval '2 days',revision=revision+1 WHERE blueprint_version_id=$1`, [fixture.blueprint.versionId]);
  await reload('created-attempt'); await catalog('CREATED');
  assert.equal(await evaluate(`Boolean(${query('demo-start')}) && !${query('demo-start')}.disabled`), true, 'future ordinary window cannot hide the original reserved start');
  const futureFacts = await windowFacts('Chưa mở');
  await command('Emulation.setTimezoneOverride', { timezoneId: 'Pacific/Honolulu' });
  assert.equal(await evaluate('new Date().getTimezoneOffset()'), 600);
  const expectedFacts = await deniedNew('Chưa mở', 409, 'FORM_NOT_OPEN'); assert.equal(expectedFacts, futureFacts);
  await catalog('CREATED');
  await click('catalog-filter-available');
  assert.equal(await evaluate(`Boolean(${query('catalog-card-READING')})`), true, 'available filter retains a valid owned attempt');
  const beforeStart = creates(); await click('exam-intro'); await assertTimingNotice('intro-start');
  assert.equal(await evaluate(`${query('intro-start')}.disabled`), false);
  await click('intro-start'); await waitFor("Boolean(document.getElementById('question-title'))", 'reserved start ignores later ordinary offering edit');
  assert.equal(creates(), beforeStart); assert.equal(starts().length, 1);
  assert.equal(new URL(starts()[0].url).pathname, `/api/v1/attempts/${attemptId}/start`);
  const running = await clocks(); assert.ok(running.started_at); assert.ok(running.deadline_at);
  assert.deepEqual(await frozen(), original);
  await click('option-b'); await waitFor(`${query('save-status')}.classList.contains('saved')`, 'original first answer acknowledged');
  await catalog('IN_PROGRESS'); const beforeResume = creates();
  await click('demo-start'); await waitFor("Boolean(document.getElementById('question-title'))", 'future-window card resumes active attempt');
  assert.equal(creates(), beforeResume); assert.equal(starts().length, 1); assert.deepEqual(await clocks(), running);
  await fixture.pool.query(`UPDATE tsa.blueprint_offerings SET available_from=clock_timestamp()-interval '2 days',available_until=clock_timestamp()-interval '1 day',revision=revision+1 WHERE blueprint_version_id=$1`, [fixture.blueprint.versionId]);
  await reload('question-card'); await catalog('IN_PROGRESS');
  assert.equal(await evaluate(`Boolean(${query('catalog-card-READING')})`), false);
  assert.equal(await evaluate(`${query('persistent-resume')}.disabled`), false);
  await deniedNew(null, 410, 'FORM_UNAVAILABLE', false);
  await catalog('IN_PROGRESS');
  const beforeClosedResume = creates(); await click('persistent-resume');
  await waitFor("Boolean(document.getElementById('question-title'))", 'owned callout resumes original attempt when elapsed offering is absent');
  assert.equal(creates(), beforeClosedResume); assert.equal(starts().length, 1); assert.deepEqual(await clocks(), running);
  assert.equal(await evaluate(`${query('option-b')}.checked && ${query('save-status')}.classList.contains('saved')`), true);
  await click('question-next'); await click('option-c'); await waitFor(`${query('save-status')}.classList.contains('saved')`, 'second original answer acknowledged after closure of new admission');
  await click('submit-open'); await click('submit-confirm'); await waitFor(`Boolean(${query('result')})`, 'original attempt completes after ordinary offering closure');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /100%/);
  assert.deepEqual(await frozen(), original); assert.deepEqual(await clocks(), running);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 1);
  await capture('admission-original-result');
  report.admission = { attemptId, futureFacts, elapsedOfferingListed: false, startRequests: starts().length, creationRequests: creates(), attempts: 1, percentage: '100.00' };
  report.checks = ['Future ordinary window retains valid original start/resume on card/details/filter; omitted elapsed offering retains owned callout resume',
    'New candidate sees accurate future label/ICT times and elapsed catalog omission, disabled start/details creation, and real409/410 guards',
    'No replacement allocation or clock reset for owned resume; original manifest/snapshots/history/saved answer remain intact',
    'Original two-question exam completes100% after the new-admission window closes'];
}
