import assert from 'node:assert/strict';

/** Original isolated stock exercises successive NEW_ONLY; never production inventory. */
export async function runNewOnlyJourney({ evaluate, click, query, waitFor, fixture, capture, report, expectReviewOffer = false }) {
  assert.equal(fixture.bundles.length, 2);
  assert.notEqual(fixture.bundles[0].content[0].text, fixture.bundles[1].content[0].text);
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__newOnlyCreates=[];window.fetch=async(input,init={})=>{const response=await original(input,init);const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;if(init.method==='POST'&&path==='/api/v1/attempts')window.__newOnlyCreates.push({status:response.status,request:JSON.parse(init.body),body:await response.clone().json()});return response;};})()`);
  const snapshot = async (attemptId) => (await fixture.pool.query(`SELECT to_jsonb(a) AS attempt,to_jsonb(f) AS form,to_jsonb(ar) AS manifest,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordinal) FROM tsa.form_slots s WHERE s.form_id=f.id) AS slots,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.slot_id) FROM tsa_private.form_slot_secrets s WHERE s.form_id=f.id) AS secrets,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.question_id) FROM tsa.student_question_history h WHERE h.first_attempt_id=a.id) AS history,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM tsa.score_runs s WHERE s.attempt_id=a.id) AS scores,
    (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.score_run_id,i.slot_id) FROM tsa.score_items i JOIN tsa.score_runs s ON s.id=i.score_run_id WHERE s.attempt_id=a.id) AS items,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM tsa.result_releases r WHERE r.attempt_id=a.id) AS releases
    FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id JOIN tsa.assembly_runs ar ON ar.id=f.assembly_run_id WHERE a.id=$1`, [attemptId])).rows[0];
  const outcomes = [], questionIds = new Set(), versions = new Set(), groups = new Set(), bundles = new Set(), stems = new Set();
  const gradedSnapshots = new Map();
  for (let number = 1; number <= 2; number++) {
    await click('demo-start'); await waitFor("Boolean(document.getElementById('question-title'))", `NEW_ONLY attempt${number} starts`);
    const created = await evaluate('window.__newOnlyCreates'); assert.equal(created.length, number); assert.equal(created.at(-1).status, 201);
    const attemptId = created.at(-1).body.attemptId;
    assert.equal(outcomes.some((item) => item.attemptId === attemptId), false);
    const view = await evaluate(`fetch('/api/v1/attempts/${attemptId}').then(r=>r.json())`);
    assert.equal(view.state, 'IN_PROGRESS'); assert.equal(view.reuseMode, 'NEW_ONLY'); assert.equal(view.slots.length, 2);
    const frozen = await snapshot(attemptId);
    const identities = (await fixture.pool.query(`SELECT fs.question_id,fs.question_version_id,fs.bundle_id,m.group_id
      FROM tsa.form_slots fs JOIN tsa.duplicate_group_members m ON m.question_id=fs.question_id
      JOIN tsa.duplicate_groups g ON g.id=m.group_id AND g.merged_into_id IS NULL
      WHERE fs.form_id=$1 ORDER BY fs.ordinal`, [view.formId])).rows;
    assert.equal(identities.length, 2); assert.equal(new Set(identities.map((item) => item.bundle_id)).size, 1);
    assert.equal(bundles.has(identities[0].bundle_id), false); bundles.add(identities[0].bundle_id);
    const bundle = fixture.bundles.find((item) => item.id === identities[0].bundle_id); assert.ok(bundle);
    assert.deepEqual(identities.map((item) => item.question_version_id), bundle.questions.map((item) => item.versionId));
    for (const [index, identity] of identities.entries()) {
      assert.equal(questionIds.has(identity.question_id), false); questionIds.add(identity.question_id);
      assert.equal(versions.has(identity.question_version_id), false); versions.add(identity.question_version_id);
      assert.equal(groups.has(identity.group_id), false); groups.add(identity.group_id);
      const stem = view.slots[index].content[0].text; assert.equal(stems.has(stem), false); stems.add(stem);
      assert.deepEqual(view.slots[index].stimulus, { id: bundle.stimulusId, content: bundle.content });
      if (index) await click('question-next');
      assert.equal(await evaluate(`${query('question-card')}.textContent.includes(${JSON.stringify(bundle.content[0].text)})`), true);
      await click(index === 0 ? 'option-b' : 'option-c');
      await waitFor(`${query('save-status')}.classList.contains('saved')`, 'original passage answer acknowledged');
    }
    await click('submit-open'); await click('submit-confirm'); await waitFor(`Boolean(${query('result')})`, `attempt${number} grades`);
    assert.match(await evaluate(`${query('result-score')}.textContent`), /100%/);
    const after = await snapshot(attemptId);
    assert.deepEqual(after.form, frozen.form); assert.deepEqual(after.manifest, frozen.manifest);
    assert.deepEqual(after.slots, frozen.slots); assert.deepEqual(after.secrets, frozen.secrets); assert.deepEqual(after.history, frozen.history);
    assert.equal(after.attempt.started_at, frozen.attempt.started_at); assert.equal(after.attempt.deadline_at, frozen.attempt.deadline_at);
    assert.equal(after.scores.length, 1); assert.equal(after.items.length, 2); assert.equal(after.releases.length, 1);
    gradedSnapshots.set(attemptId, after);
    for (const previous of outcomes) assert.deepEqual(await snapshot(previous.attemptId), gradedSnapshots.get(previous.attemptId));
    outcomes.push({ attemptId, formId: view.formId, bundleId: bundle.id, questionIds: identities.map((item) => item.question_id),
      versionIds: identities.map((item) => item.question_version_id), groupIds: identities.map((item) => item.group_id), percentage: '100.00' });
    await capture(`new-only-result-${number}`);
    await click('return-catalog'); await waitFor(`Boolean(${query('catalog-grid')})`, 'explicit return, no automatic next attempt');
  }
  assert.equal(questionIds.size, 4); assert.equal(versions.size, 4); assert.equal(groups.size, 4); assert.equal(bundles.size, 2);
  const committed = async () => (await fixture.pool.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM tsa.attempts a) AS attempts,
    (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id) FROM tsa.forms f) AS forms,
    (SELECT jsonb_agg(to_jsonb(ar) ORDER BY ar.id) FROM tsa.assembly_runs ar) AS manifests,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.question_id) FROM tsa.student_question_history h) AS history,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM tsa.idempotency_records r) AS receipts,
    (SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM tsa.jobs j) AS jobs,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM tsa.score_runs s) AS scores,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM tsa.result_releases r) AS releases`)).rows[0];
  const beforeShortage = await committed();
  assert.equal(beforeShortage.attempts.length, 2); assert.equal(beforeShortage.forms.length, 2); assert.equal(beforeShortage.manifests.length, 2);
  assert.equal(beforeShortage.history.length, 4); assert.equal(beforeShortage.jobs.length, 2); assert.equal(beforeShortage.scores.length, 2);
  assert.equal(beforeShortage.releases.length, 2); assert.ok(beforeShortage.jobs.every((job) => job.kind === 'exam_grade_attempt'));
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.questions WHERE eligible_version_id IS NOT NULL')).rows[0].n, 4);
  await click('demo-start');
  const shortageTarget = expectReviewOffer ? 'review-mode-offer' : 'screen-message';
  await waitFor(`Boolean(${query(shortageTarget)})`, 'third creation displays actual unseen-stock shortage');
  assert.match(await evaluate(`${query(shortageTarget)}.textContent`), expectReviewOffer ? /câu mới/ : /Chưa đủ câu hỏi mới/);
  assert.equal(await evaluate("Boolean(document.getElementById('question-title'))"), false);
  const requests = await evaluate('window.__newOnlyCreates'); assert.deepEqual(requests.map((r) => r.status), [201, 201, 422]);
  assert.equal(requests[2].body.error.code, 'INSUFFICIENT_UNSEEN_INVENTORY');
  for (const request of requests) assert.deepEqual(request.request, { blueprintVersionId: fixture.blueprint.versionId });
  assert.deepEqual(await committed(), beforeShortage, 'shortage leaves attempts/forms/manifests/history/receipts/jobs/scores/releases exact');
  for (const outcome of outcomes) {
    assert.deepEqual(await snapshot(outcome.attemptId), gradedSnapshots.get(outcome.attemptId));
    const result = await evaluate(`fetch('/api/v1/attempts/${outcome.attemptId}/result').then(r=>r.json())`);
    assert.equal(result.percentage, '100.00'); assert.equal(result.attemptId, outcome.attemptId);
  }
  const history = await evaluate("fetch('/api/v1/attempts').then(r=>r.json())");
  assert.equal(history.items.length, 2); assert.ok(history.items.every((item) => item.state === 'GRADED' && item.score.percentage === '100.00'));
  await capture('new-only-shortage');
  report.newOnly = { outcomes, distinctQuestions: questionIds.size, distinctVersions: versions.size, distinctGroups: groups.size,
    statuses: requests.map((r) => r.status), shortage: requests[2].body.error.code, committedGraphUnchanged: true };
  report.checks = ['Two explicitly created NEW_ONLY reading forms use disjoint original passage bundles, stable identities, exact versions and canonical equivalence groups',
    'Each saves two acknowledged answers and grades100%, preserving prior sealed snapshots/history/result',
    'Third actual422 unseen shortage displays truthfully without replacement, reuse override, generation job or partial persistence',
    'Both owned results remain readable, with exactly two graded history entries and unchanged committed graph after shortage'];
}
