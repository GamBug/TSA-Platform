import assert from 'node:assert/strict';

/** Real resume warning/timezone checks, not qualified screen-reader acceptance. */
export async function runWarningResumeJourney({ evaluate, command, click, query, waitFor, fixture, capture, report }) {
  const observe = `(()=>{window.__warningEvents=[];let previous='';new MutationObserver(()=>{const text=document.getElementById('announcements')?.textContent??'';if(text!==previous){previous=text;if(text.includes('60 giây'))window.__warningEvents.push({text,at:performance.now()});}}).observe(document,{subtree:true,childList:true,characterData:true});})()`;
  await command('Page.addScriptToEvaluateOnNewDocument', { source: observe });
  await evaluate(observe);
  await click('demo-start');
  await waitFor("Boolean(document.getElementById('question-title')) && window.__warningEvents.length===1", 'short test announces warning once');
  const view = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json())`);
  assert.equal(view.domain, 'READING'); assert.equal(view.slots.length, 2);
  assert.equal(Date.parse(view.deadlineAt) - Date.parse(view.startedAt), 45000);
  const frozen = async () => (await fixture.pool.query(`SELECT to_jsonb(f) AS form,to_jsonb(ar) AS assembly,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordinal) FROM tsa.form_slots s WHERE s.form_id=f.id) AS slots,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.slot_id) FROM tsa_private.form_slot_secrets s WHERE s.form_id=f.id) AS secrets,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.question_id) FROM tsa.student_question_history h WHERE h.first_attempt_id=a.id) AS history,
    a.started_at::text,a.deadline_at::text
    FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id JOIN tsa.assembly_runs ar ON ar.id=f.assembly_run_id WHERE a.id=$1`, [view.attemptId])).rows[0];
  const original = await frozen();
  const seconds = () => evaluate(`(()=>{const p=${query('timer')}.textContent.split(':').map(Number);return p[0]*60+p[1]})()`);
  const warning = async () => {
    assert.equal(await evaluate("document.getElementById('announcements').getAttribute('role')"), 'status');
    assert.equal(await evaluate("document.getElementById('announcements').getAttribute('aria-live')"), 'polite');
    assert.equal(await evaluate("document.getElementById('announcements').getAttribute('aria-atomic')"), 'true');
    const events = await evaluate('window.__warningEvents'); assert.equal(events.length, 1); assert.match(events[0].text, /60 giây/);
    return events;
  };
  const initialWarning = await warning();
  await click('option-b'); await waitFor(`${query('save-status')}.classList.contains('saved')`, 'first answer acknowledged inside warning window');
  const saved = (await fixture.pool.query('SELECT slot_id,value,revision::text,saved_at::text FROM tsa.answers WHERE attempt_id=$1', [view.attemptId])).rows;
  assert.equal(saved.length, 1); assert.equal(saved[0].value.optionId, 'b'); assert.equal(saved[0].revision, '1');
  const beforeTick = await seconds(); assert.ok(beforeTick > 0 && beforeTick <= 45);
  await waitFor(`(()=>{const p=${query('timer')}.textContent.split(':').map(Number);return p[0]*60+p[1]<${beforeTick}})()`, 'real monotonic countdown advances');
  await click('question-next'); await click('question-prev');
  await warning();
  const timezones = [];
  for (const timezoneId of ['Pacific/Honolulu', 'Asia/Ho_Chi_Minh']) {
    const before = await seconds();
    await command('Emulation.setTimezoneOverride', { timezoneId });
    const resolvedZone = await evaluate('Intl.DateTimeFormat().resolvedOptions().timeZone');
    assert.ok((timezoneId === 'Asia/Ho_Chi_Minh' ? ['Asia/Ho_Chi_Minh', 'Asia/Saigon'] : [timezoneId]).includes(resolvedZone));
    assert.equal(await evaluate('new Date().getTimezoneOffset()'), timezoneId === 'Pacific/Honolulu' ? 600 : -420);
    const after = await seconds(); assert.ok(after > 0 && after <= before && before - after <= 2, 'timezone does not reset or jump countdown');
    assert.deepEqual(await frozen(), original); await warning(); timezones.push({ timezoneId, resolvedZone, before, after });
  }
  const beforeReload = await seconds(), documentId = await evaluate('performance.timeOrigin');
  await command('Page.reload', { ignoreCache: true });
  await waitFor(`performance.timeOrigin!==${documentId} && Boolean(document.getElementById('question-title')) && window.__warningEvents.length===1`, 'reload inside warning window re-announces on resumed document');
  assert.equal(await evaluate(`${query('option-b')}.checked && ${query('save-status')}.classList.contains('saved')`), true);
  const resumedWarning = await warning(), resumedSeconds = await seconds();
  assert.ok(resumedSeconds > 0 && resumedSeconds <= beforeReload + 1, 'resume never grants a fresh45seconds');
  const dbRemaining = (await fixture.pool.query('SELECT extract(epoch FROM deadline_at-clock_timestamp())::float8 AS seconds FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0].seconds;
  assert.ok(Math.abs(resumedSeconds - dbRemaining) <= 2, 'resumed countdown agrees with real PostgreSQL deadline');
  assert.deepEqual(await frozen(), original);
  assert.deepEqual((await fixture.pool.query('SELECT slot_id,value,revision::text,saved_at::text FROM tsa.answers WHERE attempt_id=$1', [view.attemptId])).rows, saved);
  const resumed = await evaluate(`fetch('/api/v1/attempts/${view.attemptId}').then(r=>r.json())`);
  assert.equal(resumed.startedAt, view.startedAt); assert.equal(resumed.deadlineAt, view.deadlineAt); assert.equal(resumed.attemptId, view.attemptId);
  const afterResume = await seconds();
  await waitFor(`(()=>{const p=${query('timer')}.textContent.split(':').map(Number);return p[0]*60+p[1]<${afterResume}})()`, 'resumed clock continues without repeated warning');
  await warning(); await capture('warning-resumed-answer');
  await click('question-next'); await click('option-c'); await waitFor(`${query('save-status')}.classList.contains('saved')`, 'second answer acknowledged after resume');
  await warning(); await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'resumed test grades normally');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /100%/); await warning();
  assert.deepEqual(await frozen(), original);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 1);
  await capture('warning-resumed-result');
  report.warningResume = { attemptId: view.attemptId, initialWarning, resumedWarning, timezones, beforeReload, resumedSeconds,
    dbRemaining, percentage: '100.00' };
  report.checks = ['Actual45-second test emits one polite atomic warning per loaded document, including resume inside the warning window',
    'Ticks, saved-answer redraws and navigation do not repeat the warning in the same document',
    'Real Honolulu/ICT timezone changes preserve monotonic countdown and exact PostgreSQL clocks/form/history',
    'Reload retains acknowledged answer and original deadline with no fresh duration; resumed second answer grades100%'];
}
