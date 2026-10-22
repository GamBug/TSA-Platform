import assert from 'node:assert/strict';

/** Two real clients recover one durable allocation; no synthetic409 response. */
export async function runAllocationRaceJourney({ evaluate, command, click, query, waitFor, fixture, capture, report, openSecondTab, second }) {
  report.allocationRaceStage = 'open-second-catalog';
  await openSecondTab({ expectCatalog: true }); const other = second();
  const observe = `(()=>{const original=window.fetch.bind(window);window.__race={history:null,allocations:[],starts:[]};let hold=true;window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if(hold&&(!init.method||init.method==='GET')&&url.pathname==='/api/v1/attempts'&&url.searchParams.get('limit')==='100'){hold=false;window.__race.history={status:response.status,body:await response.clone().json()};await new Promise(resolve=>{window.__releaseRaceHistory=resolve;});}if(init.method==='POST'&&url.pathname==='/api/v1/attempts')window.__race.allocations.push({status:response.status,key:new Headers(init.headers).get('idempotency-key'),body:await response.clone().json()});if(init.method==='POST'&&url.pathname.endsWith('/start'))window.__race.starts.push({path:url.pathname,status:response.status,body:await response.clone().json()});return response;};})()`;
  report.allocationRaceStage = 'install-observers';
  await Promise.all([evaluate(observe), other.evaluate(observe)]);
  report.allocationRaceStage = 'hold-genuine-histories';
  await click('demo-start'); await waitFor('Boolean(window.__releaseRaceHistory)', 'first client holds its actual empty history response');
  await other.click('demo-start'); await other.waitFor('Boolean(window.__releaseRaceHistory)', 'second client holds its actual empty history response');
  for (const read of [evaluate, other.evaluate]) {
    const history = await read('window.__race.history'); assert.equal(history.status, 200); assert.deepEqual(history.body.items, []);
    assert.deepEqual(await read('window.__race.allocations'), []);
  }
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 0);
  // Release genuine responses. Both ordinary clients now attempt new creation.
  report.allocationRaceStage = 'release-histories';
  await Promise.all([evaluate('window.__releaseRaceHistory()'), other.evaluate('window.__releaseRaceHistory()')]);
  report.allocationRaceStage = 'recover-both-clients';
  await Promise.all([waitFor("Boolean(document.getElementById('question-title'))", 'first client reaches the owned exam'),
    other.waitFor("Boolean(document.getElementById('question-title'))", 'second client recovers the same owned exam')]);
  report.allocationRaceStage = 'verify-race';
  const [firstRace, secondRace] = await Promise.all([evaluate('window.__race'), other.evaluate('window.__race')]);
  const allocations = [...firstRace.allocations, ...secondRace.allocations]; assert.equal(allocations.length, 2);
  assert.deepEqual(allocations.map((r) => r.status).sort(), [201, 409]);
  assert.ok(allocations.every((r) => typeof r.key === 'string' && r.key.length > 0)); assert.notEqual(allocations[0].key, allocations[1].key);
  const winner = allocations.find((r) => r.status === 201), loser = allocations.find((r) => r.status === 409);
  const attemptId = winner.body.attemptId;
  assert.equal(loser.body.error.code, 'CONCURRENT_ATTEMPT_EXISTS'); assert.equal(loser.body.error.details.existingAttemptId, attemptId);
  const readView = `fetch('/api/v1/attempts/${attemptId}').then(r=>r.json())`;
  const views = await Promise.all([evaluate(readView), other.evaluate(readView)]);
  for (const view of views) { assert.equal(view.attemptId, attemptId); assert.equal(view.state, 'IN_PROGRESS'); assert.equal(view.slots.length, 2); }
  assert.equal(views[0].formId, views[1].formId); assert.equal(views[0].startedAt, views[1].startedAt); assert.equal(views[0].deadlineAt, views[1].deadlineAt);
  const startReceipts = [...firstRace.starts, ...secondRace.starts]; assert.ok(startReceipts.length >= 1 && startReceipts.length <= 2);
  for (const start of startReceipts) {
    assert.equal(start.status, 200); assert.equal(start.path, `/api/v1/attempts/${attemptId}/start`);
    assert.equal(start.body.startedAt, views[0].startedAt); assert.equal(start.body.deadlineAt, views[0].deadlineAt);
  }
  const counts = (await fixture.pool.query(`SELECT (SELECT count(*)::int FROM tsa.attempts) AS attempts,
    (SELECT count(*)::int FROM tsa.forms) AS forms,(SELECT count(*)::int FROM tsa.assembly_runs) AS manifests,
    (SELECT count(*)::int FROM tsa.student_question_history) AS history,
    (SELECT count(*)::int FROM tsa.idempotency_records WHERE route_scope='POST /api/v1/attempts') AS receipts`)).rows[0];
  assert.deepEqual(counts, { attempts: 1, forms: 1, manifests: 1, history: 2, receipts: 1 });
  const frozen = async () => (await fixture.pool.query(`SELECT to_jsonb(f) AS form,to_jsonb(ar) AS assembly,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordinal) FROM tsa.form_slots s WHERE s.form_id=f.id) AS slots,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.slot_id) FROM tsa_private.form_slot_secrets s WHERE s.form_id=f.id) AS secrets,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.question_id) FROM tsa.student_question_history h WHERE h.first_attempt_id=a.id) AS history,
    a.started_at::text,a.deadline_at::text FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id
    JOIN tsa.assembly_runs ar ON ar.id=f.assembly_run_id WHERE a.id=$1`, [attemptId])).rows[0];
  const original = await frozen();
  report.allocationRaceStage = 'save-and-reload';
  await command('Page.bringToFront');
  await capture('allocation-race-owned-exam');
  await click('option-b'); await waitFor(`${query('save-status')}.classList.contains('saved')`, 'first tab acknowledges original first answer');
  await other.command('Page.bringToFront');
  const beforeOtherReload = await other.evaluate('performance.timeOrigin'); await other.command('Page.reload', { ignoreCache: true });
  await other.waitFor(`performance.timeOrigin!==${beforeOtherReload} && Boolean(${query('option-b')}) && ${query('option-b')}.checked`, 'second tab reloads first tab acknowledged answer');
  assert.deepEqual(await frozen(), original);
  await other.click('question-next'); await other.click('option-c');
  await other.waitFor(`${query('save-status')}.classList.contains('saved')`, 'second tab acknowledges original second answer');
  report.allocationRaceStage = 'submit-and-grade';
  await other.click('submit-open'); await other.click('submit-confirm');
  await other.waitFor(`Boolean(${query('result')})`, 'recovered tab submits and grades original form');
  assert.match(await other.evaluate(`${query('result-score')}.textContent`), /100%/);
  await command('Page.bringToFront');
  const beforeReload = await evaluate('performance.timeOrigin'); await command('Page.reload', { ignoreCache: true });
  await waitFor(`performance.timeOrigin!==${beforeReload} && Boolean(${query('result')})`, 'first tab reloads the same released result');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /100%/);
  assert.deepEqual(await frozen(), original);
  const completed = (await fixture.pool.query(`SELECT (SELECT count(*)::int FROM tsa.attempts) AS attempts,
    (SELECT count(*)::int FROM tsa.jobs) AS jobs,(SELECT count(*)::int FROM tsa.score_runs) AS scores,
    (SELECT count(*)::int FROM tsa.result_releases) AS releases,
    (SELECT count(*)::int FROM tsa.answers WHERE revision=1) AS answers,
    (SELECT count(*)::int FROM tsa.student_question_history) AS history`)).rows[0];
  assert.deepEqual(completed, { attempts: 1, jobs: 1, scores: 1, releases: 1, answers: 2, history: 2 });
  await capture('allocation-race-shared-result');
  report.allocationRaceStage = 'complete';
  report.allocationRace = { attemptId, statuses: allocations.map((r) => r.status), distinctCreationKeys: true,
    sameForm: views[0].formId, startReceipts: startReceipts.length, counts, completed, percentage: '100.00' };
  report.checks = ['Both real clients read and hold genuine empty history before issuing distinct-key create requests',
    'Actual201/409 conflict recovers original owned ID in both clients, with one form/manifest/history allocation/receipt and unchanged clocks',
    'First-tab saved answer reloads in second tab; second tab completes original form and first tab reloads same100% release',
    'One attempt/job/score/release, two revision1 answers and original immutable snapshots/history remain after completion'];
}
