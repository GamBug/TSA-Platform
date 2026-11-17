import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSourceService } from '../src/modules/sources/service.mjs';

/** Actual browser coverage with original isolated stock; no human content acceptance. */
export async function runReadingJourney({ evaluate, command, click, query, waitFor, fixture, capture, report }) {
  const passage = fixture.bundles[0], passageText = passage.content[0].text;
  await waitFor(`Boolean(${query('catalog-card-READING')})`, 'READING2 catalog');
  assert.equal(await evaluate("document.querySelectorAll('[data-testid^=catalog-card-]').length"), 1);
  await click('demo-start');
  await waitFor("Boolean(document.getElementById('question-title'))", 'shared-reading start');
  const view = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json())`);
  assert.equal(view.domain, 'READING'); assert.equal(view.slots.length, 2);
  assert.equal(Date.parse(view.deadlineAt) - Date.parse(view.startedAt), 180_000);
  for (const slot of view.slots) assert.deepEqual(slot.stimulus, { id: passage.stimulusId, content: passage.content });
  const frozen = async () => (await fixture.pool.query(`SELECT fs.slot_id,fs.question_version_id,fs.bundle_id,fs.ordinal,
    fs.public_snapshot,fs.snapshot_hash,p.secret_hash FROM tsa.form_slots fs JOIN tsa_private.form_slot_secrets p USING(form_id,slot_id)
    WHERE fs.form_id=$1 ORDER BY fs.ordinal`, [view.formId])).rows;
  const snapshots = await frozen();
  assert.deepEqual(snapshots.map((s) => s.question_version_id), passage.questions.map((q) => q.versionId));
  assert.ok(snapshots.every((s) => s.bundle_id === passage.id));
  const clock = (await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0];
  for (let index = 0; index < 2; index++) {
    if (index) await click('question-next');
    await waitFor(`${query('question-card')}.innerText.includes(${JSON.stringify(passageText)})`, `exact visible shared passage ${index + 1}`);
    assert.equal(await evaluate('document.getElementById("question-title").textContent'), view.slots[index].content[0].text);
    await click(`option-${fixture.expectedOptions[index]}`);
    await waitFor(`${query('option-' + fixture.expectedOptions[index])}.checked && ${query('save-status')}.classList.contains('saved')`, 'acknowledged shared-reading answer');
    if (index) await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await capture(`reading-shared-slot-${index + 1}`);
  }
  const previousDocument = await evaluate('performance.timeOrigin');
  await command('Page.reload', { ignoreCache: true });
  await waitFor(`performance.timeOrigin!==${previousDocument} && Boolean(document.getElementById('question-title'))`, 'reading reload');
  await waitFor(`${query('question-card')}.innerText.includes(${JSON.stringify(passageText)}) && ${query('option-b')}.checked`, 'reloaded first passage and acknowledged answer');
  await click('question-next');
  await waitFor(`${query('question-card')}.innerText.includes(${JSON.stringify(passageText)}) && ${query('option-c')}.checked`, 'reloaded second passage and acknowledged answer');
  assert.deepEqual((await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0], clock);
  await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'shared-reading worker result');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /100%/);
  assert.equal(await evaluate(`${query('result-domain')}.textContent.includes('Đọc hiểu')`), true);
  const result = await evaluate(`fetch('/api/v1/attempts/${view.attemptId}/result').then(r=>r.json())`);
  assert.equal(result.correctCount, 2); assert.equal(result.totalCount, 2); assert.equal(result.percentage, '100.00');
  for (const [index, item] of result.items.entries()) assert.deepEqual(item.question.stimulus, view.slots[index].stimulus);
  await capture('reading-shared-result');
  await click('review-open'); await waitFor(`Boolean(${query('back-score')})`, 'shared-reading released review');
  for (let index = 0; index < 2; index++) {
    if (index) await click('review-next');
    await waitFor(`${query('review-question')}.innerText.includes(${JSON.stringify(passageText)})`, `released exact passage ${index + 1}`);
    if (!(await evaluate(`${query('explanation')}.open`))) await click('review-explanation-toggle');
    await waitFor(`${query('explanation')}.open && !document.getElementById('review-explanation-pane').hidden && document.getElementById('review-explanation-pane').getBoundingClientRect().height>0`, `visible reading explanation ${index + 1}`);
    assert.equal(await evaluate('document.querySelector(".review-explanation-copy").innerText.trim()'), result.items[index].explanation[0].text);
    await capture(`reading-shared-review-${index + 1}`);
  }
  await click('back-score');
  const history = await evaluate("fetch('/api/v1/attempts').then(r=>r.json())");
  assert.equal(history.items.length, 1); assert.equal(history.items[0].domain, 'READING'); assert.equal(history.items[0].score.percentage, '100.00');
  const create = () => evaluate(`fetch('/api/v1/attempts',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':decodeURIComponent(document.cookie.split('; ').find(s=>s.startsWith('tsa_local_csrf=')).split('=')[1]),'idempotency-key':crypto.randomUUID()},body:JSON.stringify({blueprintVersionId:${JSON.stringify(fixture.blueprint.versionId)}})}).then(async r=>({status:r.status,body:await r.json()}))`);
  const shortage = await create(); assert.equal(shortage.status, 422); assert.equal(shortage.body.error.code, 'INSUFFICIENT_UNSEEN_INVENTORY');
  const assigned = (await fixture.pool.query('SELECT * FROM tsa.student_question_history ORDER BY question_id')).rows;
  const sources = await createSourceService({ bankPool: fixture.bankPool, identityService: fixture.identityService });
  await sources.registerRightsDecision(fixture.principals.bankManager, passage.source.sourceVersionId, randomUUID(), {
    status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Disposable browser passage-only restriction, not a real attestation.', expectedRevision: 1,
  });
  await click('review-open'); await waitFor(`Boolean(${query('persistent-blocked')})`, 'passage-only revocation clears released content');
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(passageText)})`), false);
  for (const slot of view.slots) assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(slot.content[0].text)})`), false);
  assert.equal(await evaluate(`Boolean(${query('review-question')})`), false);
  assert.deepEqual(await frozen(), snapshots);
  assert.deepEqual((await fixture.pool.query('SELECT * FROM tsa.student_question_history ORDER BY question_id')).rows, assigned);
  await capture('reading-passage-rights-blocked');
  await click('persistent-logout'); await click('persistent-login-studentB');
  await waitFor(`Boolean(${query('demo-start')})`, 'foreign candidate catalog');
  const foreign = await evaluate(`fetch('/api/v1/attempts/${view.attemptId}/result').then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(foreign.status, 404);
  const blocked = await create(); assert.equal(blocked.status, 422); assert.equal(blocked.body.error.code, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 1);
  report.reading = { attemptId: view.attemptId, formId: view.formId, questionCount: 2, durationSeconds: 180,
    passageId: passage.stimulusId, orderedVersions: snapshots.map((s) => s.question_version_id), percentage: result.percentage };
  report.checks = ['Original correct-taxonomy READING2 ALL_OR_NONE bundle uses frozen HTTP transport and shared sealed passage',
    'Both ordered slots visibly render the exact passage on desktop/mobile; reload preserves answers and PostgreSQL clocks',
    'Leased worker grades two questions, owned100% result and both visible released explanations retain the exact passage',
    'Whole-bundle unseen shortage and passage-only rights restriction fail closed; restricted review clears content',
    'Sealed snapshots and committed history stay unchanged; foreign result access and future rights-blocked allocation are denied'];
}
