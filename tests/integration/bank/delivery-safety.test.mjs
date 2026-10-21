import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ensureLocalTaxonomy, createPrivateTemplate } from '../../../src/local/seed.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { drainDeliveryHolds } from '../../../src/modules/bank/delivery-holds.mjs';
import { createBankHarness, loginActor, bankRequest } from './harness.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const RUBRIC = Object.freeze({
  correctness: true,
  unambiguous: true,
  relevant: true,
  language: true,
  explanation: true,
  rights: true,
});

let harness;
let taxonomy;
let browsers;
let principals;
let fixtureScopeId;
let workflow;
let sources;
let blueprint;
let shortBlueprint;

function key(prefix) { return `${prefix}-${randomUUID()}`; }

async function authenticated(browser) {
  return harness.identity.authenticate(new Request(harness.origin, {
    headers: { cookie: browser.cookies.join('; ') },
  }));
}

async function response(browser, route, body, status = 201) {
  const result = await bankRequest(harness, browser, route, {
    method: 'POST', key: key('delivery-safety'), body,
  });
  const payload = await result.json();
  assert.equal(result.status, status, JSON.stringify(payload));
  assert.equal(result.headers.get('cache-control'), 'no-store');
  return payload;
}

async function registerSource({ validTo = null } = {}) {
  const sourceId = randomUUID();
  const created = await response(browsers.author, '/api/v1/sources', {
    title: `Synthetic delivery source ${sourceId}`, canonicalUri: null, origin: 'OWNED',
  });
  const version = await response(browsers.author, `/api/v1/sources/${created.sourceId}/versions`, {
    contentHash: `sha256:${sourceId.replaceAll('-', '').padEnd(64, '0').slice(0, 64)}`,
    evidenceUri: 'manual://synthetic-delivery-safety', metadata: { syntheticOnly: 'true' },
  });
  const rights = await response(browsers.bankManager, `/api/v1/source-versions/${version.sourceVersionId}/rights`, {
    status: 'OWNED', allowedUses: ['DISPLAY'], territory: ['VN'],
    validFrom: '2000-01-01T00:00:00Z', validTo,
    evidence: 'Synthetic fixture only; not a real rights attestation.', expectedRevision: 0,
  });
  return { sourceId: created.sourceId, sourceVersionId: version.sourceVersionId, decisionId: rights.decisionId };
}

function draftInput(source, text = `Synthetic delivery question ${randomUUID()}`) {
  const template = createPrivateTemplate(source);
  return {
    schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH',
    taxonomyVersionId: template.taxonomyVersionId, domainId: template.domainId,
    skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
    content: [{ type: 'text', text }],
    interaction: {
      type: 'SINGLE_CHOICE',
      options: [
        { id: 'a', content: [{ type: 'text', text: 'Synthetic option A' }] },
        { id: 'b', content: [{ type: 'text', text: 'Synthetic option B' }] },
      ],
    },
    answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' },
    explanation: [{ type: 'text', text: 'Synthetic private explanation.' }],
    stimulusVersionId: null, evidenceRefs: template.evidenceRefs,
    origin: 'MANUAL', provenance: template.provenance,
  };
}

async function createDraft({ source = null, text, parent = null } = {}) {
  const provenanceSource = source ?? await registerSource();
  const body = draftInput(provenanceSource, text);
  if (!parent) return {
    ...await response(browsers.author, '/api/v1/questions', body),
    source: provenanceSource,
  };
  const child = await response(browsers.author, `/api/v1/questions/${parent.questionId}/versions`, {
    parentVersionId: parent.versionId, draft: body,
  });
  return { ...child, source: provenanceSource };
}

async function approve(question) {
  await workflow.submitReview(principals.author, question.versionId, key('submit'), { expectedRevision: 1 });
  await workflow.confirmSingleton(principals.reviewer, question.versionId, key('singleton'), {
    expectedRevision: 2, contentHash: question.contentHash,
    reason: 'Synthetic exact-version singleton fixture.',
  });
  const result = await workflow.review(principals.reviewer, question.versionId, key('approve'), {
    expectedRevision: 2, contentHash: question.contentHash, decision: 'APPROVE',
    rubric: { ...RUBRIC }, reason: 'Synthetic test fixture; not human content review.',
  });
  assert.equal(result.body.state, 'APPROVED');
  return question;
}

async function createBlueprint(taxonomyVersionId, durationSeconds = 600) {
  const id = randomUUID();
  const versionId = randomUUID();
  const config = {
    schemaVersion: 'blueprint/1', name: `Synthetic delivery form ${id}`,
    taxonomyVersionId, profileKind: 'INDEPENDENT_PRACTICE', evidenceIds: ['synthetic-delivery-fixture'],
    sections: [{ id: 'math-main', section: 'MATH', count: 1, durationSeconds }],
    allowedTypes: ['SINGLE_CHOICE'], quotas: [], maxPerSource: null, excludedQuestionIds: [],
    bundlePolicy: 'ALL_OR_NONE', scoringPolicy: 'practice-binary-v1', releasePolicy: 'after-grade-v1',
  };
  await harness.database.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, config.name]);
  await harness.database.pool.query(`INSERT INTO tsa.blueprint_versions
    (id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4::jsonb,$5)`,
  [versionId, id, taxonomyVersionId, JSON.stringify(config), HASH_A]);
  return versionId;
}

async function createSealedForm(question, { blueprintVersionId = blueprint, durationSeconds = 600 } = {}) {
  const formId = randomUUID();
  const runId = randomUUID();
  const slotId = randomUUID();
  const questionRow = (await harness.database.pool.query(`SELECT qv.question_id,qv.taxonomy_version_id,
    qv.section::text AS section,qv.content,qv.interaction,qs.answer_key,qs.explanation,qs.scoring_policy_version
    FROM tsa.question_versions qv JOIN tsa_private.question_secrets qs ON qs.question_version_id=qv.id WHERE qv.id=$1`,
  [question.versionId])).rows[0];
  assert.ok(questionRow);
  assert.equal(questionRow.taxonomy_version_id, taxonomy.taxonomyVersionId);
  const snapshot = {
    slotId, sectionId: 'math-main', ordinal: 1, stimulus: null,
    content: questionRow.content, interaction: questionRow.interaction,
  };
  await withTransaction(harness.database.pool, async (client) => {
    await client.query(`INSERT INTO tsa.assembly_runs
      (id,blueprint_version_id,user_id,form_mode,reuse_mode,history_revision,bank_revision,request_hash,seed,
       algorithm_version,limits,manifest,manifest_hash,outcome)
      VALUES($1,$2,NULL,'PUBLISHED_FIXED','FIXED_AS_PUBLISHED',0,'fixture-bank/1',$3,1,
       'assembly/1','{}'::jsonb,'{"schemaVersion":"assembly-manifest/1"}'::jsonb,$3,'SUCCESS')`,
    [runId, blueprintVersionId, HASH_A]);
    await client.query(`INSERT INTO tsa.forms
      (id,assembly_run_id,blueprint_version_id,mode,owner_user_id,content_hash,policy_versions,sealed_at)
      VALUES($1,$2,$3,'PUBLISHED_FIXED',NULL,$4,'{"scoring":"practice-binary-v1"}'::jsonb,clock_timestamp())`,
    [formId, runId, blueprintVersionId, HASH_B]);
    await client.query(`INSERT INTO tsa.form_sections(form_id,section_id,section,ordinal,duration_seconds,question_count)
      VALUES($1,'math-main',$2::tsa.question_section,0,$3,1)`, [formId, questionRow.section, durationSeconds]);
    await client.query(`INSERT INTO tsa.form_slots
      (form_id,slot_id,section_id,ordinal,question_id,question_version_id,public_snapshot,snapshot_hash)
      VALUES($1,$2,'math-main',1,$3,$4,$5::jsonb,$6)`,
    [formId, slotId, questionRow.question_id, question.versionId, JSON.stringify(snapshot), HASH_B]);
    await client.query(`INSERT INTO tsa_private.form_slot_secrets
      (form_id,slot_id,key_snapshot,explanation_snapshot,policy_version,secret_hash)
      VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6)`,
    [formId, slotId, JSON.stringify(questionRow.answer_key), JSON.stringify(questionRow.explanation),
      questionRow.scoring_policy_version, HASH_A]);
  });
  const availableFrom = new Date(Date.now() - 60_000);
  const availableUntil = new Date(Date.now() + 3_600_000);
  await harness.database.pool.query(`INSERT INTO tsa.form_availability(form_id,available_from,available_until)
    VALUES($1,$2,$3)`, [formId, availableFrom, availableUntil]);
  return { formId, slotId };
}

async function createAttempt(formId, userId) {
  const attemptId = randomUUID();
  await harness.database.pool.query(`INSERT INTO tsa.attempts
    (id,user_id,form_id,form_mode,reuse_mode,reuse_policy_version,created_at,admission_until_at_creation,start_before_at)
    VALUES($1,$2,$3,'PUBLISHED_FIXED','FIXED_AS_PUBLISHED','reuse/1',clock_timestamp(),
      clock_timestamp()+interval '600 seconds',clock_timestamp()+interval '600 seconds')`,
  [attemptId, userId, formId]);
  return attemptId;
}

async function makeGradedAttempt(form, userId) {
  const attemptId = await createAttempt(form.formId, userId);
  const scoreId = randomUUID();
  const jobId = randomUUID();
  await withTransaction(harness.database.pool, async (client) => {
    await client.query(`UPDATE tsa.attempts SET state='IN_PROGRESS' WHERE id=$1`, [attemptId]);
    await client.query(`INSERT INTO tsa.answers(attempt_id,form_id,slot_id,value,revision)
      VALUES($1,$2,$3,'{"selectedOptionId":"a"}'::jsonb,1)`, [attemptId, form.formId, form.slotId]);
    await client.query(`UPDATE tsa.attempts SET state='SUBMITTED' WHERE id=$1`, [attemptId]);
    await client.query(`INSERT INTO tsa.jobs
      (id,kind,dedup_key,payload_ref,attempt_id,state,attempts,max_attempts,lease_owner,lease_token,lease_until)
      VALUES($1,'exam_grade_attempt',$2,$3,$4,'RUNNING',1,5,'delivery-test-grader',1,clock_timestamp()+interval '2 minutes')`,
    [jobId, `delivery-grade-${jobId}`, `attempt:${attemptId}`, attemptId]);
    await client.query(`INSERT INTO tsa.score_runs
      (id,attempt_id,form_id,policy_version,input_hash,correct_count,total_count,percentage,section_totals)
      VALUES($1,$2,$3,'practice-binary-v1',$4,1,1,100.00,
        '[{"sectionId":"math-main","section":"MATH","correctCount":1,"totalCount":1}]'::jsonb)`,
    [scoreId, attemptId, form.formId, HASH_A]);
    await client.query('INSERT INTO tsa.score_items(score_run_id,form_id,slot_id,earned) VALUES($1,$2,$3,1)',
      [scoreId, form.formId, form.slotId]);
    await client.query(`INSERT INTO tsa.result_releases(id,attempt_id,score_run_id,policy_version)
      VALUES($1,$2,$3,'practice-binary-v1')`, [randomUUID(), attemptId, scoreId]);
    await client.query(`UPDATE tsa.attempts SET state='GRADED',latest_score_id=$2 WHERE id=$1`, [attemptId, scoreId]);
    await client.query(`UPDATE tsa.jobs SET state='SUCCEEDED',lease_owner=NULL,lease_until=NULL WHERE id=$1`, [jobId]);
  });
  return { attemptId, scoreId };
}

async function makeSubmittedAttempt(form, userId) {
  const attemptId = await createAttempt(form.formId, userId);
  await withTransaction(harness.database.pool, async (client) => {
    await client.query("UPDATE tsa.attempts SET state='IN_PROGRESS' WHERE id=$1", [attemptId]);
    await client.query(`INSERT INTO tsa.answers(attempt_id,form_id,slot_id,value,revision)
      VALUES($1,$2,$3,'{"selectedOptionId":"a"}'::jsonb,1)`, [attemptId, form.formId, form.slotId]);
    await client.query("UPDATE tsa.attempts SET state='SUBMITTED' WHERE id=$1", [attemptId]);
    const jobId = randomUUID();
    await client.query(`INSERT INTO tsa.jobs(id,kind,dedup_key,payload_ref,attempt_id)
      VALUES($1,'exam_grade_attempt',$2,$3,$4)`,
    [jobId, `delivery-submit-${jobId}`, `attempt:${attemptId}`, attemptId]);
  });
  return attemptId;
}

async function makeExpiredAttempt(form, userId) {
  const attemptId = await createAttempt(form.formId, userId);
  await withTransaction(harness.database.pool, async (client) => {
    await client.query("UPDATE tsa.attempts SET state='IN_PROGRESS' WHERE id=$1", [attemptId]);
    await client.query(`INSERT INTO tsa.answers(attempt_id,form_id,slot_id,value,revision)
      VALUES($1,$2,$3,'{"selectedOptionId":"b"}'::jsonb,1)`, [attemptId, form.formId, form.slotId]);
  });
  await waitUntil(async () => {
    const row = await harness.database.pool.query(`SELECT clock_timestamp() >= deadline_at AS elapsed
      FROM tsa.attempts WHERE id=$1`, [attemptId]);
    return row.rows[0].elapsed;
  }, 'the short exam deadline to elapse');
  await withTransaction(harness.database.pool, async (client) => {
    await client.query("UPDATE tsa.attempts SET state='EXPIRED' WHERE id=$1", [attemptId]);
    const jobId = randomUUID();
    await client.query(`INSERT INTO tsa.jobs(id,kind,dedup_key,payload_ref,attempt_id)
      VALUES($1,'exam_grade_attempt',$2,$3,$4)`,
    [jobId, `delivery-expiry-${jobId}`, `attempt:${attemptId}`, attemptId]);
  });
  return attemptId;
}

async function recordAssignmentHistory(attemptId, questionId, userId) {
  await harness.database.pool.query(`INSERT INTO tsa.student_question_history(user_id,question_id,first_attempt_id)
    VALUES($1,$2,$3)`, [userId, questionId, attemptId]);
}

async function deliveryState(attemptId, userId) {
  return withTransaction(harness.authPool, async (client) => {
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [userId]);
    return (await client.query('SELECT tsa.student_attempt_delivery_state($1) AS state', [attemptId])).rows[0].state;
  }, { role: 'tsa_identity' });
}

async function snapshot(formId) {
  const result = await harness.database.pool.query(`SELECT fs.slot_id,fs.question_id,fs.question_version_id,
      fs.public_snapshot,fs.snapshot_hash,secret.key_snapshot,secret.explanation_snapshot,secret.secret_hash
    FROM tsa.form_slots fs JOIN tsa_private.form_slot_secrets secret USING(form_id,slot_id) WHERE fs.form_id=$1`, [formId]);
  return result.rows;
}

async function waitUntil(predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

before(async () => {
  harness = await createBankHarness();
  taxonomy = await ensureLocalTaxonomy(harness.database.pool);
  const actorKeys = ['author', 'reviewer', 'bankManager', 'studentA', 'studentB'];
  const actorBrowsers = await Promise.all(actorKeys.map((actor) => loginActor(harness, actor)));
  browsers = Object.fromEntries(actorKeys.map((actor, index) => [actor, actorBrowsers[index]]));
  principals = Object.fromEntries(await Promise.all(actorKeys.map(async (actor, index) => [actor, await authenticated(actorBrowsers[index])] )));
  fixtureScopeId = randomUUID();
  await harness.database.pool.query(`INSERT INTO tsa_private.bank_workflow_fixture_scope
    (scope_id,database_oid,postmaster_started_at)
    SELECT $1,oid,pg_postmaster_start_time() FROM pg_database WHERE datname=current_database()`, [fixtureScopeId]);
  workflow = await createPublicationService({ bankPool: harness.bankPool, identityService: harness.identity, fixtureScopeId });
  sources = await createSourceService({ bankPool: harness.bankPool, identityService: harness.identity });
  blueprint = await createBlueprint(taxonomy.taxonomyVersionId);
  shortBlueprint = await createBlueprint(taxonomy.taxonomyVersionId, 5);
});

after(async () => { await harness?.close(); });

test('rights withdrawal holds a sealed form, cancels CREATED, and invalidates active, submitted, expired and graded attempts without losing history', async () => {
  const source = await registerSource();
  const question = await approve(await createDraft({ source }));
  const form = await createSealedForm(question, { blueprintVersionId: shortBlueprint, durationSeconds: 5 });
  const created = await createAttempt(form.formId, principals.author.userId);
  const active = await createAttempt(form.formId, principals.reviewer.userId);
  await harness.database.pool.query("UPDATE tsa.attempts SET state='IN_PROGRESS' WHERE id=$1", [active]);
  await harness.database.pool.query(`INSERT INTO tsa.answers(attempt_id,form_id,slot_id,value,revision)
    VALUES($1,$2,$3,'{"selectedOptionId":"a"}'::jsonb,1)`, [active, form.formId, form.slotId]);
  const submitted = await makeSubmittedAttempt(form, principals.studentA.userId);
  const expired = await makeExpiredAttempt(form, principals.studentB.userId);
  const graded = await makeGradedAttempt(form, principals.bankManager.userId);
  const attempts = [created, active, submitted, expired, graded.attemptId];
  const attemptUsers = [principals.author, principals.reviewer, principals.studentA, principals.studentB, principals.bankManager];
  for (let index = 0; index < attempts.length; index += 1) {
    await recordAssignmentHistory(attempts[index], question.questionId, attemptUsers[index].userId);
  }

  const before = await snapshot(form.formId);
  assert.equal((await deliveryState(created, principals.author.userId)).allowed, true);
  assert.equal((await deliveryState(active, principals.reviewer.userId)).allowed, true);
  assert.equal((await deliveryState(submitted, principals.studentA.userId)).allowed, true);
  assert.equal((await deliveryState(expired, principals.studentB.userId)).allowed, true);
  assert.equal((await deliveryState(graded.attemptId, principals.bankManager.userId)).allowed, true);
  assert.equal(await deliveryState(created, principals.studentB.userId), null, 'attempt guard hides another student\'s attempt');
  const historyBefore = await harness.database.pool.query(`SELECT user_id,question_id,first_attempt_id,assigned_at
    FROM tsa.student_question_history WHERE first_attempt_id=ANY($1::uuid[]) ORDER BY first_attempt_id`, [attempts]);
  assert.equal(historyBefore.rows.length, attempts.length);
  const answersBefore = await harness.database.pool.query(`SELECT attempt_id,form_id,slot_id,value,revision,saved_at
    FROM tsa.answers WHERE attempt_id=ANY($1::uuid[]) ORDER BY attempt_id`, [attempts]);
  assert.equal(answersBefore.rows.length, 4, 'all started attempts have an answer before withdrawal');

  const result = await sources.registerRightsDecision(principals.bankManager, source.sourceVersionId, key('rights-revoke'), {
    status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'],
    validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Synthetic rights withdrawal fixture.', expectedRevision: 1,
  });
  assert.deepEqual(result.body, { decisionId: result.body.decisionId, revision: 2 });
  for (let index = 0; index < attempts.length; index += 1) {
    assert.equal((await deliveryState(attempts[index], attemptUsers[index].userId)).allowed, false);
  }

  const state = await harness.database.pool.query(`SELECT a.id,a.state::text,a.cancellation_reason,a.invalidation_reason,
      a.latest_score_id,r.revoked_at,r.reason
    FROM tsa.attempts a LEFT JOIN tsa.result_releases r ON r.attempt_id=a.id
    WHERE a.id=ANY($1::uuid[]) ORDER BY a.id`, [attempts]);
  const byId = new Map(state.rows.map((row) => [row.id, row]));
  assert.equal(byId.get(created).state, 'CANCELLED');
  assert.equal(byId.get(created).cancellation_reason, 'RIGHTS_BLOCKED');
  assert.equal(byId.get(active).state, 'INVALIDATED');
  assert.equal(byId.get(active).invalidation_reason, 'Source rights no longer permit delivery');
  for (const attemptId of [submitted, expired]) {
    assert.equal(byId.get(attemptId).state, 'INVALIDATED');
    assert.equal(byId.get(attemptId).invalidation_reason, 'Source rights no longer permit delivery');
  }
  assert.equal(byId.get(graded.attemptId).state, 'INVALIDATED');
  assert.equal(byId.get(graded.attemptId).latest_score_id, graded.scoreId, 'graded score remains immutable history');
  assert.ok(byId.get(graded.attemptId).revoked_at);
  assert.equal(byId.get(graded.attemptId).reason, 'Source rights no longer permit delivery');
  const historyAfter = await harness.database.pool.query(`SELECT user_id,question_id,first_attempt_id,assigned_at
    FROM tsa.student_question_history WHERE first_attempt_id=ANY($1::uuid[]) ORDER BY first_attempt_id`, [attempts]);
  assert.deepEqual(historyAfter.rows, historyBefore.rows, 'assignment history remains unchanged across withdrawal');
  const answersAfter = await harness.database.pool.query(`SELECT attempt_id,form_id,slot_id,value,revision,saved_at
    FROM tsa.answers WHERE attempt_id=ANY($1::uuid[]) ORDER BY attempt_id`, [attempts]);
  assert.deepEqual(answersAfter.rows, answersBefore.rows, 'answers remain immutable history for submitted and expired attempts');
  const retainedScore = await harness.database.pool.query(`SELECT sr.id,sr.correct_count,sr.total_count,sr.percentage,
      count(si.slot_id)::int AS item_count
    FROM tsa.score_runs sr JOIN tsa.score_items si ON si.score_run_id=sr.id
    WHERE sr.id=$1 GROUP BY sr.id`, [graded.scoreId]);
  assert.deepEqual(retainedScore.rows[0], { id: graded.scoreId, correct_count: 1, total_count: 1, percentage: '100.00', item_count: 1 });
  assert.deepEqual(await snapshot(form.formId), before, 'public and private sealed snapshots stay byte-for-byte stable');

  const formState = await harness.database.pool.query(`SELECT fa.withdrawn_at,fa.withdrawal_reason,
      (SELECT count(*)::int FROM tsa_private.form_delivery_holds h WHERE h.form_id=fa.form_id) AS holds,
      (SELECT count(*)::int FROM tsa_private.delivery_hold_completions c JOIN tsa_private.form_delivery_holds h ON c.hold_id=h.id
        WHERE h.form_id=fa.form_id) AS completed,
      (SELECT count(*)::int FROM tsa.audit_events e WHERE e.action='DELIVERY_HOLD_ATTEMPT' AND e.entity_id=ANY($2::text[])) AS attempt_audits
    FROM tsa.form_availability fa WHERE fa.form_id=$1`,
  [form.formId, attempts]);
  assert.ok(formState.rows[0].withdrawn_at);
  assert.equal(formState.rows[0].withdrawal_reason, 'Source rights no longer permit delivery');
  assert.equal(formState.rows[0].holds, 1);
  assert.equal(formState.rows[0].completed, 1);
  assert.equal(formState.rows[0].attempt_audits, attempts.length);

  const restored = await sources.registerRightsDecision(principals.bankManager, source.sourceVersionId, key('rights-restore'), {
    status: 'OWNED', allowedUses: ['DISPLAY'], territory: ['VN'],
    validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Synthetic restored-rights fixture; prior assignments remain withdrawn.', expectedRevision: 2,
  });
  assert.equal(restored.body.revision, 3);
  assert.equal((await deliveryState(created, principals.author.userId)).allowed, false);
  const notRevived = await harness.database.pool.query(`SELECT q.eligible_version_id,fa.withdrawn_at,
      (SELECT count(*)::int FROM tsa_private.form_delivery_holds WHERE form_id=$2) AS holds,
      (SELECT count(*)::int FROM tsa.result_releases WHERE attempt_id=$3 AND revoked_at IS NOT NULL) AS revoked_releases
    FROM tsa.questions q JOIN tsa.form_availability fa ON fa.form_id=$2 WHERE q.id=$1`,
  [question.questionId, form.formId, graded.attemptId]);
  assert.equal(notRevived.rows[0].eligible_version_id, null);
  assert.ok(notRevived.rows[0].withdrawn_at);
  assert.equal(notRevived.rows[0].holds, 1);
  assert.equal(notRevived.rows[0].revoked_releases, 1);
});

test('natural rights expiry fails closed and restoration durably holds previously sealed forms', async () => {
  const validTo = new Date(Date.now() + 7_000).toISOString();
  const source = await registerSource({ validTo });
  const question = await approve(await createDraft({ source }));
  const form = await createSealedForm(question);
  const created = await createAttempt(form.formId, principals.studentB.userId);
  await waitUntil(async () => {
    const row = await harness.database.pool.query('SELECT tsa.bank_question_delivery_allowed($1) AS allowed', [question.versionId]);
    return row.rows[0].allowed === false;
  }, 'the immutable source-rights interval to expire');
  assert.equal((await deliveryState(created, principals.studentB.userId)).allowed, false);

  const restored = await sources.registerRightsDecision(principals.bankManager, source.sourceVersionId, key('expired-rights-restore'), {
    status: 'OWNED', allowedUses: ['DISPLAY'], territory: ['VN'],
    validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Synthetic post-expiry restoration fixture.', expectedRevision: 1,
  });
  assert.equal(restored.body.revision, 2);
  assert.equal((await deliveryState(created, principals.studentB.userId)).allowed, false);
  const state = await harness.database.pool.query(`SELECT a.state::text AS state,fa.withdrawn_at,
      (SELECT count(*)::int FROM tsa_private.form_delivery_holds WHERE form_id=$2) AS holds
    FROM tsa.attempts a JOIN tsa.form_availability fa ON fa.form_id=a.form_id WHERE a.id=$1`, [created, form.formId]);
  assert.equal(state.rows[0].state, 'CANCELLED');
  assert.ok(state.rows[0].withdrawn_at);
  assert.equal(state.rows[0].holds, 1);
});

test('quarantining an approved ancestor withdraws descendant forms and blocks their delivery', async () => {
  const source = await registerSource();
  const parent = await approve(await createDraft({ source, text: `Synthetic quarantine parent ${randomUUID()}` }));
  const child = await createDraft({ source, parent, text: `Synthetic quarantine child ${randomUUID()}` });
  await workflow.submitReview(principals.author, child.versionId, key('child-submit'), { expectedRevision: 1 });
  await workflow.confirmSingleton(principals.reviewer, child.versionId, key('child-singleton'), {
    expectedRevision: 2, contentHash: child.contentHash, reason: 'Synthetic child version singleton fixture.',
  });
  await workflow.review(principals.reviewer, child.versionId, key('child-approve'), {
    expectedRevision: 2, contentHash: child.contentHash, decision: 'APPROVE', rubric: { ...RUBRIC },
    reason: 'Synthetic child version approval fixture.',
  });
  const form = await createSealedForm(child);
  const created = await createAttempt(form.formId, principals.studentA.userId);
  const active = await createAttempt(form.formId, principals.studentB.userId);
  await harness.database.pool.query("UPDATE tsa.attempts SET state='IN_PROGRESS' WHERE id=$1", [active]);
  const before = await snapshot(form.formId);

  const result = await workflow.quarantine(principals.bankManager, parent.versionId, key('parent-quarantine'), {
    expectedRevision: 3, reason: 'Synthetic parent quarantine fixture.',
  });
  assert.deepEqual(result.body, { state: 'QUARANTINED', revision: 4 });
  assert.equal((await deliveryState(created, principals.studentA.userId)).allowed, false);
  assert.equal((await deliveryState(active, principals.studentB.userId)).allowed, false);
  const state = await harness.database.pool.query(`SELECT a.id,a.state::text AS state,a.cancellation_reason,
      a.invalidation_reason,w.state::text AS child_state,q.eligible_version_id,fa.withdrawn_at,
      (SELECT count(*)::int FROM tsa_private.form_delivery_holds WHERE form_id=$2 AND kind='QUARANTINE') AS holds
    FROM tsa.attempts a JOIN tsa.form_availability fa ON fa.form_id=a.form_id
    JOIN tsa.question_workflow w ON w.question_version_id=$3 JOIN tsa.questions q ON q.id=$4 WHERE a.id=ANY($1::uuid[])
    ORDER BY a.id`, [[created, active], form.formId, child.versionId, child.questionId]);
  assert.equal(state.rows.length, 2);
  assert.ok(state.rows.every((row) => row.child_state === 'APPROVED' && row.eligible_version_id === null && row.withdrawn_at));
  assert.equal(state.rows.find((row) => row.id === created).state, 'CANCELLED');
  assert.equal(state.rows.find((row) => row.id === created).cancellation_reason, 'FORM_WITHDRAWN');
  assert.equal(state.rows.find((row) => row.id === active).state, 'INVALIDATED');
  assert.equal(state.rows.find((row) => row.id === active).invalidation_reason, 'Synthetic parent quarantine fixture.');
  assert.ok(state.rows.every((row) => row.holds === 1));
  assert.deepEqual(await snapshot(form.formId), before);
});

test('durable form holds block delivery before retryable fan-out; service roles cannot mutate or inspect private holds', async () => {
  const source = await registerSource();
  const question = await approve(await createDraft({ source }));
  const form = await createSealedForm(question);
  const attempt = await createAttempt(form.formId, principals.studentA.userId);
  await withTransaction(harness.bankPool, async (client) => {
    await client.query("SELECT set_config('tsa.bank_actor_id',$1,true)", [principals.bankManager.userId]);
    const result = await client.query("SELECT tsa.bank_apply_delivery_hold('QUARANTINE',$1,$2,$3) AS forms", [
      question.versionId, principals.bankManager.userId, 'Synthetic pending-hold recovery fixture.',
    ]);
    assert.equal(result.rows[0].forms, 1);
  }, { role: 'tsa_bank' });

  assert.equal((await deliveryState(attempt, principals.studentA.userId)).allowed, false);
  const pending = await harness.database.pool.query(`SELECT a.state::text AS state,a.cancellation_reason,
      (SELECT count(*)::int FROM tsa_private.form_delivery_holds h WHERE h.form_id=$2) AS holds,
      (SELECT count(*)::int FROM tsa_private.delivery_hold_completions c JOIN tsa_private.form_delivery_holds h ON c.hold_id=h.id
        WHERE h.form_id=$2) AS completed FROM tsa.attempts a WHERE a.id=$1`, [attempt, form.formId]);
  assert.deepEqual(pending.rows[0], { state: 'CANCELLED', cancellation_reason: 'FORM_WITHDRAWN', holds: 1, completed: 0 });

  await assert.rejects(withTransaction(harness.database.pool, (client) => client.query(
    'SELECT tsa.bank_drain_delivery_holds()'), { role: 'tsa_web' }), { code: '42501' });
  await assert.rejects(withTransaction(harness.database.pool, (client) => client.query(
    'SELECT * FROM tsa_private.form_delivery_holds'), { role: 'tsa_identity' }), { code: '42501' });
  await assert.rejects(withTransaction(harness.bankPool, (client) => client.query(
    'SELECT tsa.student_attempt_delivery_state($1)', [attempt]), { role: 'tsa_bank' }), { code: '42501' });

  assert.equal(await drainDeliveryHolds(harness.bankPool, principals.bankManager), 1);
  assert.equal(await drainDeliveryHolds(harness.bankPool, principals.bankManager), 0, 'postcommit drain replay is idempotent');
  const drained = await harness.database.pool.query(`SELECT a.state::text AS state,a.cancellation_reason,
      c.hold_id IS NOT NULL AS completed
    FROM tsa.attempts a JOIN tsa_private.form_delivery_holds h ON h.form_id=a.form_id
    JOIN tsa_private.delivery_hold_completions c ON c.hold_id=h.id WHERE a.id=$1`, [attempt]);
  assert.deepEqual(drained.rows[0], { state: 'CANCELLED', cancellation_reason: 'FORM_WITHDRAWN', completed: true });
});

function barrierPool(pool, predicate) {
  let enter;
  let release;
  let paused = false;
  const entered = new Promise((resolve) => { enter = resolve; });
  const released = new Promise((resolve) => { release = resolve; });
  return {
    entered,
    release: () => release(),
    pool: {
      query: (...args) => pool.query(...args),
      async connect() {
        const client = await pool.connect();
        return {
          release: (...args) => client.release(...args),
          async query(sql, values) {
            const result = await client.query(sql, values);
            if (!paused && predicate(sql)) {
              paused = true;
              enter();
              await released;
            }
            return result;
          },
        };
      },
    },
  };
}

async function waitForRoleLockWait(applicationName) {
  const queryPattern = applicationName === 'tsa-bank-auth-test'
    ? '%student_attempt_delivery_state%'
    : '%1414742321%';
  await waitUntil(async () => {
    const result = await harness.database.pool.query(`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE application_name=$1 AND wait_event_type='Lock' AND query ILIKE $2`, [applicationName, queryPattern]);
    return result.rows[0].count > 0;
  }, `a PostgreSQL advisory publication-lock wait in ${applicationName}`, 5_000);
}

test('delivery reads and rights withdrawal serialize on the PostgreSQL Bank guard in both winner orders', async () => {
  for (const winner of ['DELIVERY', 'WITHDRAWAL']) {
    const source = await registerSource();
    const question = await approve(await createDraft({ source, text: `Synthetic delivery lock ${winner} ${randomUUID()}` }));
    const form = await createSealedForm(question);
    const attempt = await createAttempt(form.formId, principals.studentB.userId);
    const barrier = winner === 'DELIVERY'
      ? barrierPool(harness.authPool, (sql) => sql.includes('tsa.student_attempt_delivery_state'))
      : barrierPool(harness.bankPool, (sql) => sql === 'SELECT id FROM tsa.bank_state WHERE id = 1 FOR UPDATE');
    const withdrawalInput = {
      status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'],
      validFrom: '2000-01-01T00:00:00Z', validTo: null,
      evidence: `Synthetic delivery race ${winner}.`, expectedRevision: 1,
    };
    let first;
    let second;
    try {
      first = winner === 'DELIVERY'
        ? withTransaction(barrier.pool, async (client) => {
          await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principals.studentB.userId]);
          return (await client.query('SELECT tsa.student_attempt_delivery_state($1) AS state', [attempt])).rows[0].state;
        }, { role: 'tsa_identity' })
        : createSourceService({ bankPool: barrier.pool, identityService: harness.identity }).then((service) =>
          service.registerRightsDecision(principals.bankManager, source.sourceVersionId, key('racing-withdrawal'), withdrawalInput));
      first = first.then((value) => ({ value }), (error) => ({ error }));
      await Promise.race([barrier.entered, new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`${winner} operation did not acquire its PostgreSQL lock`)), 5000);
        timer.unref();
      })]);
      second = winner === 'DELIVERY'
        ? sources.registerRightsDecision(principals.bankManager, source.sourceVersionId, key('racing-withdrawal'), withdrawalInput)
        : deliveryState(attempt, principals.studentB.userId);
      second = second.then((value) => ({ value }), (error) => ({ error }));
      await waitForRoleLockWait(winner === 'DELIVERY' ? 'tsa-bank-api-test' : 'tsa-bank-auth-test');
    } finally { barrier.release(); }
    const [a, b] = await Promise.all([first, second]);
    assert.ok(a.value, a.error?.stack);
    assert.ok(b.value, b.error?.stack);
    if (winner === 'DELIVERY') assert.equal(a.value.allowed, true);
    else assert.equal(b.value.allowed, false);
    assert.equal((await deliveryState(attempt, principals.studentB.userId)).allowed, false,
      'after withdrawal commits, the student guard denies subsequent delivery');
    const final = await harness.database.pool.query(`SELECT a.state::text AS state,fa.withdrawn_at,
      (SELECT count(*)::int FROM tsa_private.form_delivery_holds WHERE form_id=$2) AS holds
      FROM tsa.attempts a JOIN tsa.form_availability fa ON fa.form_id=a.form_id WHERE a.id=$1`, [attempt, form.formId]);
    assert.equal(final.rows[0].state, 'CANCELLED');
    assert.ok(final.rows[0].withdrawn_at);
    assert.equal(final.rows[0].holds, 1);
  }
});
