import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { privateQuestionFixture } from '../../../apps/practice-prototype/src/private-question-fixture.mjs';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createFixedFormSealingService } from '../../../src/modules/bank/fixed-form-sealing.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { bankRequest } from './harness.mjs';

const STATEMENT_TIMEOUT_MS = 10_000;
const BARRIER_TIMEOUT_MS = 7_500;
const RACE_TEST_TIMEOUT_MS = 60_000;

function interceptPool(pool, hook) {
  return {
    query: (...args) => pool.query(...args),
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') return (...args) => hook(target.query.bind(target), ...args);
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}

function pauseAfterQuery(pool, predicate) {
  let intercepted = false;
  let abortReason = null;
  let announceReached;
  let openGate;
  const reached = new Promise((resolve) => { announceReached = resolve; });
  const gate = new Promise((resolve) => { openGate = resolve; });
  const wrapped = interceptPool(pool, async (query, text, values) => {
    if (text === 'BEGIN') {
      const result = await query(text, values);
      await query(`SET LOCAL statement_timeout=${STATEMENT_TIMEOUT_MS}`);
      return result;
    }
    if (abortReason) throw abortReason;
    if (!intercepted && typeof text === 'string' && predicate(text)) {
      intercepted = true;
      const result = await query(text, values);
      announceReached({ text, values, result });
      await gate;
      if (abortReason) throw abortReason;
      return result;
    }
    return query(text, values);
  });
  return {
    pool: wrapped,
    reached,
    release: openGate,
    abort(error) {
      abortReason ??= error;
      openGate();
      announceReached({ error });
    },
    get intercepted() { return intercepted; },
  };
}

async function waitForReached(barrier, label) {
  let timer;
  try {
    const result = await Promise.race([
      barrier.reached,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not reach its database barrier within ${BARRIER_TIMEOUT_MS} ms`)), BARRIER_TIMEOUT_MS);
      }),
    ]);
    if (result.error) throw result.error;
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForBankLock(pool) {
  const deadline = Date.now() + BARRIER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE application_name='tsa-bank-api-test' AND wait_event_type='Lock'
        AND query LIKE '%pg_advisory_xact_lock%'`);
    if (result.rows[0].waiting >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Competing bank writer did not wait on a real PostgreSQL advisory lock');
}

async function waitForSettled(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not settle within ${BARRIER_TIMEOUT_MS} ms`)), BARRIER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function graphCounts(pool) {
  return (await pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.forms) AS forms,
    (SELECT count(*)::int FROM tsa.form_sections) AS sections,
    (SELECT count(*)::int FROM tsa.form_slots) AS slots,
    (SELECT count(*)::int FROM tsa.assembly_runs) AS runs,
    (SELECT count(*)::int FROM tsa_private.fixed_form_seals) AS seals,
    (SELECT count(*)::int FROM tsa.attempts) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history) AS history`)).rows[0];
}

async function sealedGraph(pool, formId) {
  const form = (await pool.query('SELECT to_jsonb(f) AS value FROM tsa.forms f WHERE f.id=$1', [formId])).rows[0].value;
  const run = (await pool.query('SELECT to_jsonb(r) AS value FROM tsa.assembly_runs r WHERE r.id=$1', [form.assembly_run_id])).rows[0].value;
  const sections = (await pool.query('SELECT to_jsonb(s) AS value FROM tsa.form_sections s WHERE s.form_id=$1 ORDER BY s.ordinal', [formId])).rows.map((row) => row.value);
  const slots = (await pool.query(`SELECT to_jsonb(s) AS value,to_jsonb(secret) AS secret
    FROM tsa.form_slots s JOIN tsa_private.form_slot_secrets secret USING(form_id,slot_id)
    WHERE s.form_id=$1 ORDER BY s.ordinal`, [formId])).rows;
  const seal = (await pool.query('SELECT to_jsonb(s) AS value FROM tsa_private.fixed_form_seals s WHERE s.form_id=$1', [formId])).rows[0].value;
  return { form, run, sections, slots, seal };
}

async function makeFixture() {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
  return fixture;
}

test('when fixed sealing holds the publication guard first, quarantine waits and preserves the complete sealed graph', { timeout: RACE_TEST_TIMEOUT_MS }, async (t) => {
  const fixture = await makeFixture();
  t.after(() => fixture.close());
  const input = {
    mode: 'PUBLISHED_FIXED',
    blueprintVersionId: fixture.blueprint.versionId,
    blueprintHash: fixture.blueprint.contentHash,
    windowMinutes: 60,
  };
  const sealPause = pauseAfterQuery(fixture.bankPool, (text) => text.includes('tsa.fixed_seal_commit'));
  const sealService = await createFixedFormSealingService({
    bankPool: sealPause.pool,
    identityService: fixture.identityService,
    enableCreation: true,
  });
  const quarantinePause = pauseAfterQuery(fixture.bankPool, (text) => text.includes('SELECT tsa.bank_apply_delivery_hold'));
  const quarantineService = await createPublicationService({
    bankPool: quarantinePause.pool,
    identityService: fixture.identityService,
    fixtureScopeId: fixture.fixtureScopeId,
  });
  const sealKey = randomUUID();
  const pending = [];
  let completed = false;
  try {
    const sealPending = sealService.create(fixture.principals.examManager, input, sealKey);
    pending.push(sealPending);
    const committed = await waitForReached(sealPause, 'fixed seal commit');
    assert.equal(committed.result.rows[0].value.studentDeliverySupported, false);

    let quarantineSettled = false;
    const quarantinePending = quarantineService.quarantine(
      fixture.principals.bankManager,
      fixture.questions[0].versionId,
      randomUUID(),
      { expectedRevision: 3, reason: 'Synthetic fixed-form race quarantine.' },
    ).then((value) => { quarantineSettled = true; return value; }, (error) => { quarantineSettled = true; throw error; });
    pending.push(quarantinePending);
    await waitForBankLock(fixture.pool);
    assert.equal(quarantineSettled, false, 'Quarantine must remain blocked until the sealing transaction commits');

    sealPause.release();
    const sealed = await waitForSettled(sealPending, 'fixed seal');
    assert.equal(sealed.status, 201);
    const quarantineBarrier = await waitForReached(quarantinePause, 'quarantine delivery hold');
    assert.match(quarantineBarrier.text, /bank_apply_delivery_hold/);
    const beforeRestriction = await sealedGraph(fixture.pool, sealed.body.formId);
    const beforeAvailability = (await fixture.pool.query(`SELECT revision,withdrawn_at,withdrawal_reason
      FROM tsa.form_availability WHERE form_id=$1`, [sealed.body.formId])).rows[0];
    assert.equal(Number(beforeAvailability.revision), 1);
    assert.equal(beforeAvailability.withdrawn_at, null);

    quarantinePause.release();
    const restricted = await waitForSettled(quarantinePending, 'quarantine');
    assert.equal(restricted.body.state, 'QUARANTINED');
    const afterRestriction = await sealedGraph(fixture.pool, sealed.body.formId);
    assert.deepEqual(afterRestriction, beforeRestriction, 'Quarantine must not rewrite any sealed form, run, slot, secret or receipt bytes');
    assert.equal(afterRestriction.form.content_hash, sealed.body.formHash);
    assert.equal(afterRestriction.run.manifest_hash, sealed.body.manifestHash);
    assert.deepEqual(afterRestriction.seal.receipt, sealed.body);
    assert.equal(afterRestriction.slots.length, 4);
    assert.equal(afterRestriction.sections.length, 1);

    const afterAvailability = (await fixture.pool.query(`SELECT revision,withdrawn_at,withdrawal_reason
      FROM tsa.form_availability WHERE form_id=$1`, [sealed.body.formId])).rows[0];
    assert.equal(Number(afterAvailability.revision), 2);
    assert.ok(afterAvailability.withdrawn_at);
    assert.equal(afterAvailability.withdrawal_reason, 'Synthetic fixed-form race quarantine.');
    assert.equal((await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa_private.form_delivery_holds
      WHERE form_id=$1 AND kind='QUARANTINE' AND target_id=$2`, [sealed.body.formId, fixture.questions[0].versionId])).rows[0].n, 1);
    assert.equal((await fixture.pool.query('SELECT tsa.bank_form_delivery_allowed($1) AS allowed', [sealed.body.formId])).rows[0].allowed, false);
    const current = await sealService.read(fixture.principals.examManager, sealed.body.formId);
    assert.equal(current.form.formHash, sealed.body.formHash);
    assert.equal(current.form.manifestHash, sealed.body.manifestHash);
    assert.equal(current.form.state, 'SEALED');
    assert.equal(current.availability.revision, 2);
    assert.ok(current.availability.withdrawnAt);
    assert.deepEqual(await graphCounts(fixture.pool), {
      forms: 1, sections: 1, slots: 4, runs: 1, seals: 1, attempts: 0, history: 0,
    });
    completed = true;
  } finally {
    if (completed) {
      sealPause.release();
      quarantinePause.release();
    } else {
      const error = new Error('Aborting fixed-seal/quarantine race after test failure');
      sealPause.abort(error);
      quarantinePause.abort(error);
    }
    await Promise.allSettled(pending);
  }
});

test('when quarantine holds the publication guard first, fixed seal returns a truthful shortage with no graph or receipt; NEW_ONLY still works', { timeout: RACE_TEST_TIMEOUT_MS }, async (t) => {
  const fixture = await makeFixture();
  t.after(() => fixture.close());
  const input = {
    mode: 'PUBLISHED_FIXED',
    blueprintVersionId: fixture.blueprint.versionId,
    blueprintHash: fixture.blueprint.contentHash,
    windowMinutes: 60,
  };
  const quarantinePause = pauseAfterQuery(fixture.bankPool, (text) => text.includes('SELECT tsa.bank_apply_delivery_hold'));
  const quarantineService = await createPublicationService({
    bankPool: quarantinePause.pool,
    identityService: fixture.identityService,
    fixtureScopeId: fixture.fixtureScopeId,
  });
  const sealPause = pauseAfterQuery(fixture.bankPool, (text) => text.includes('tsa.fixed_seal_commit'));
  const sealService = await createFixedFormSealingService({
    bankPool: sealPause.pool,
    identityService: fixture.identityService,
    enableCreation: true,
  });
  const sealKey = randomUUID();
  const pending = [];
  let completed = false;
  try {
    const before = await graphCounts(fixture.pool);
    const quarantinePending = quarantineService.quarantine(
      fixture.principals.bankManager,
      fixture.questions[0].versionId,
      randomUUID(),
      { expectedRevision: 3, reason: 'Synthetic fixed-form race quarantine.' },
    );
    pending.push(quarantinePending);
    await waitForReached(quarantinePause, 'quarantine delivery hold');

    const sealPending = sealService.create(fixture.principals.examManager, input, sealKey);
    pending.push(sealPending);
    await waitForBankLock(fixture.pool);
    quarantinePause.release();
    const restricted = await waitForSettled(quarantinePending, 'quarantine');
    assert.equal(restricted.body.state, 'QUARANTINED');
    await assert.rejects(waitForSettled(sealPending, 'fixed seal'), (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.code, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
      return true;
    });
    assert.deepEqual(await graphCounts(fixture.pool), before, 'A losing fixed seal must not persist any part of a form/run/history graph');
    assert.equal((await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa.idempotency_records
      WHERE actor_id=$1 AND route_scope='POST /api/v1/assemblies' AND idempotency_key=$2`,
    [fixture.principals.examManager.userId, sealKey])).rows[0].n, 0, 'A failed seal must not persist a successful receipt');
    assert.equal(sealPause.intercepted, false, 'An inventory shortage must fail before the fixed-seal commit function');

    const extraSource = await fixture.registerSource();
    const extraQuestion = await fixture.createQuestion(extraSource, 'fixed-seal-race-new-only-extra');
    const allocation = createAllocationService({ examPool: fixture.examPool, identityService: fixture.identityService });
    const personal = await allocation.create(fixture.principals.studentA, randomUUID(), {
      blueprintVersionId: fixture.blueprint.versionId,
    });
    assert.equal(personal.status, 201);
    assert.equal(personal.body.formMode, 'PERSONALIZED_PRACTICE');
    assert.equal(personal.body.reuseMode, 'NEW_ONLY');
    const personalSlots = (await fixture.pool.query(`SELECT question_version_id FROM tsa.form_slots
      WHERE form_id=$1 ORDER BY ordinal`, [personal.body.formId])).rows.map((row) => row.question_version_id);
    assert.equal(personalSlots.length, 4);
    assert.equal(personalSlots.includes(fixture.questions[0].versionId), false);
    assert.equal(personalSlots.includes(extraQuestion.versionId), true);
    assert.deepEqual(await graphCounts(fixture.pool), {
      forms: 1, sections: 1, slots: 4, runs: 1, seals: 0, attempts: 1, history: 4,
    }, 'Ordinary NEW_ONLY allocation remains available for the surviving eligible questions');
    completed = true;
  } finally {
    if (completed) {
      quarantinePause.release();
      sealPause.release();
    } else {
      const error = new Error('Aborting quarantine/fixed-seal race after test failure');
      quarantinePause.abort(error);
      sealPause.abort(error);
    }
    await Promise.allSettled(pending);
  }
});

test('when fixed sealing holds the publication guard first, REVOKED source rights wait and restrict availability without rewriting the seal', { timeout: RACE_TEST_TIMEOUT_MS }, async (t) => {
  const fixture = await makeFixture();
  t.after(() => fixture.close());
  const input = {
    mode: 'PUBLISHED_FIXED',
    blueprintVersionId: fixture.blueprint.versionId,
    blueprintHash: fixture.blueprint.contentHash,
    windowMinutes: 60,
  };
  const sealPause = pauseAfterQuery(fixture.bankPool, (text) => text.includes('tsa.fixed_seal_commit'));
  const sealService = await createFixedFormSealingService({
    bankPool: sealPause.pool,
    identityService: fixture.identityService,
    enableCreation: true,
  });
  const rightsPause = pauseAfterQuery(fixture.bankPool, (text) => text.includes("SELECT tsa.bank_apply_delivery_hold('RIGHTS'"));
  const sourceService = await createSourceService({
    bankPool: rightsPause.pool,
    identityService: fixture.identityService,
  });
  const sealKey = randomUUID();
  const pending = [];
  let completed = false;
  try {
    const sealPending = sealService.create(fixture.principals.examManager, input, sealKey);
    pending.push(sealPending);
    await waitForReached(sealPause, 'fixed seal commit');

    let rightsSettled = false;
    const rightsPending = sourceService.registerRightsDecision(
      fixture.principals.bankManager,
      fixture.source.sourceVersionId,
      randomUUID(),
      {
        status: 'REVOKED',
        allowedUses: ['DISPLAY'],
        territory: ['VN'],
        validFrom: '2000-01-01T00:00:00Z',
        validTo: null,
        evidence: 'Synthetic race restriction only; not a rights attestation.',
        expectedRevision: 1,
      },
    ).then((value) => { rightsSettled = true; return value; }, (error) => { rightsSettled = true; throw error; });
    pending.push(rightsPending);
    await waitForBankLock(fixture.pool);
    assert.equal(rightsSettled, false, 'Rights revocation must remain blocked until the seal commits');

    sealPause.release();
    const sealed = await waitForSettled(sealPending, 'fixed seal');
    assert.equal(sealed.status, 201);
    await waitForReached(rightsPause, 'rights delivery hold');
    const beforeRestriction = await sealedGraph(fixture.pool, sealed.body.formId);
    const beforeAvailability = (await fixture.pool.query(`SELECT revision,withdrawn_at,withdrawal_reason
      FROM tsa.form_availability WHERE form_id=$1`, [sealed.body.formId])).rows[0];
    assert.equal(Number(beforeAvailability.revision), 1);
    assert.equal(beforeAvailability.withdrawn_at, null);

    rightsPause.release();
    const restricted = await waitForSettled(rightsPending, 'rights revocation');
    assert.equal(restricted.status, 201);
    assert.equal(restricted.body.revision, 2);
    const afterRestriction = await sealedGraph(fixture.pool, sealed.body.formId);
    assert.deepEqual(afterRestriction, beforeRestriction, 'Rights restriction must not rewrite immutable form, run, slot, secret or seal receipt rows');
    assert.equal(afterRestriction.form.content_hash, sealed.body.formHash);
    assert.equal(afterRestriction.run.manifest_hash, sealed.body.manifestHash);
    assert.deepEqual(afterRestriction.seal.receipt, sealed.body);

    const afterAvailability = (await fixture.pool.query(`SELECT revision,withdrawn_at,withdrawal_reason
      FROM tsa.form_availability WHERE form_id=$1`, [sealed.body.formId])).rows[0];
    assert.equal(Number(afterAvailability.revision), 2);
    assert.ok(afterAvailability.withdrawn_at);
    assert.equal(afterAvailability.withdrawal_reason, 'Source rights no longer permit delivery');
    assert.equal((await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa_private.form_delivery_holds
      WHERE form_id=$1 AND kind='RIGHTS' AND target_id=$2`,
    [sealed.body.formId, fixture.source.sourceVersionId])).rows[0].n, 1);
    assert.equal((await fixture.pool.query('SELECT tsa.bank_form_delivery_allowed($1) AS allowed', [sealed.body.formId])).rows[0].allowed, false);
    const decision = (await fixture.pool.query(`SELECT d.status,r.revision FROM tsa.source_rights r
      JOIN tsa.rights_decisions d ON d.id=r.decision_id WHERE r.source_version_id=$1`, [fixture.source.sourceVersionId])).rows[0];
    assert.equal(decision.status, 'REVOKED');
    assert.equal(Number(decision.revision), 2);
    const current = await sealService.read(fixture.principals.examManager, sealed.body.formId);
    assert.equal(current.form.formHash, sealed.body.formHash);
    assert.equal(current.form.manifestHash, sealed.body.manifestHash);
    assert.equal(current.form.state, 'SEALED');
    assert.equal(current.availability.revision, 2);
    assert.ok(current.availability.withdrawnAt);
    assert.deepEqual(await graphCounts(fixture.pool), {
      forms: 1, sections: 1, slots: 4, runs: 1, seals: 1, attempts: 0, history: 0,
    });
    completed = true;
  } finally {
    if (completed) {
      sealPause.release();
      rightsPause.release();
    } else {
      const error = new Error('Aborting fixed-seal/rights race after test failure');
      sealPause.abort(error);
      rightsPause.abort(error);
    }
    await Promise.allSettled(pending);
  }
});

test('when an eligible corrected version wins the publication guard, fixed seal captures current pins and hashes', { timeout: RACE_TEST_TIMEOUT_MS }, async (t) => {
  const fixture = await makeFixture();
  t.after(() => fixture.close());
  const original = fixture.questions[0];
  const originalSecretBefore = (await fixture.pool.query(`SELECT answer_key,explanation,scoring_policy_version
    FROM tsa_private.question_secrets WHERE question_version_id=$1`, [original.versionId])).rows[0];
  const template = createPrivateTemplate(original.source);
  const draftResponse = await bankRequest(fixture.harness, fixture.browsers.author,
    `/api/v1/questions/${original.questionId}/versions`, {
      method: 'POST',
      key: randomUUID(),
      body: {
        parentVersionId: original.versionId,
        draft: {
          schemaVersion: 'question/1',
          language: 'vi-VN',
          section: 'MATH',
          taxonomyVersionId: template.taxonomyVersionId,
          domainId: template.domainId,
          skillIds: template.skillIds,
          subskillIds: [],
          cognitiveLevel: null,
          targetDifficulty: 'EASY',
          content: [{ type: 'text', text: 'Synthetic corrected version for a fixed-seal concurrency test.' }],
          interaction: privateQuestionFixture.interaction,
          answerKey: privateQuestionFixture.private.answerKey,
          explanation: privateQuestionFixture.private.explanation,
          stimulusVersionId: null,
          evidenceRefs: template.evidenceRefs,
          origin: 'MANUAL',
          provenance: template.provenance,
        },
      },
    });
  assert.equal(draftResponse.status, 201, await draftResponse.clone().text());
  const corrected = await draftResponse.json();
  assert.notEqual(corrected.versionId, original.versionId);
  assert.notEqual(corrected.contentHash, original.contentHash);
  await fixture.workflow.submitReview(fixture.principals.author, corrected.versionId, randomUUID(), { expectedRevision: 1 });
  await fixture.workflow.confirmSingleton(fixture.principals.reviewer, corrected.versionId, randomUUID(), {
    expectedRevision: 2,
    contentHash: corrected.contentHash,
    reason: 'Synthetic fixture decision only; not human content review.',
  });
  assert.equal((await fixture.pool.query('SELECT eligible_version_id FROM tsa.questions WHERE id=$1', [original.questionId])).rows[0].eligible_version_id,
    original.versionId, 'The old immutable version remains current until the gated transition commits');

  const reviewPause = pauseAfterQuery(fixture.bankPool, (text) =>
    text.includes('UPDATE tsa.questions SET eligible_version_id = $2'));
  const reviewService = await createPublicationService({
    bankPool: reviewPause.pool,
    identityService: fixture.identityService,
    fixtureScopeId: fixture.fixtureScopeId,
  });
  const sealPause = pauseAfterQuery(fixture.bankPool, () => false);
  const sealService = await createFixedFormSealingService({
    bankPool: sealPause.pool,
    identityService: fixture.identityService,
    enableCreation: true,
  });
  const input = {
    mode: 'PUBLISHED_FIXED',
    blueprintVersionId: fixture.blueprint.versionId,
    blueprintHash: fixture.blueprint.contentHash,
    windowMinutes: 60,
  };
  const pending = [];
  let completed = false;
  try {
    const approvalPending = reviewService.review(fixture.principals.reviewer, corrected.versionId, randomUUID(), {
      expectedRevision: 2,
      contentHash: corrected.contentHash,
      decision: 'APPROVE',
      rubric: { correctness: true, unambiguous: true, relevant: true, language: true, explanation: true, rights: true },
      reason: 'Synthetic fixture approval only; not human content review.',
    });
    pending.push(approvalPending);
    await waitForReached(reviewPause, 'corrected-version eligibility update');

    const sealPending = sealService.create(fixture.principals.examManager, input, randomUUID());
    pending.push(sealPending);
    await waitForBankLock(fixture.pool);
    reviewPause.release();
    const approved = await waitForSettled(approvalPending, 'corrected-version approval');
    assert.equal(approved.body.state, 'APPROVED');
    const sealed = await waitForSettled(sealPending, 'fixed seal');
    assert.equal(sealed.status, 201);

    const currentVersion = (await fixture.pool.query('SELECT eligible_version_id FROM tsa.questions WHERE id=$1', [original.questionId])).rows[0].eligible_version_id;
    assert.equal(currentVersion, corrected.versionId);
    const run = (await fixture.pool.query(`SELECT bank_revision,manifest,manifest_hash FROM tsa.assembly_runs WHERE id=$1`,
      [sealed.body.assemblyRunId])).rows[0];
    const manifestVersionIds = run.manifest.units.flatMap((unit) => unit.members.map((member) => member.versionId));
    assert.equal(manifestVersionIds.length, 4);
    assert.ok(manifestVersionIds.includes(corrected.versionId), 'Seal must use the current corrected eligible pin');
    assert.equal(manifestVersionIds.includes(original.versionId), false, 'Seal must not retain the stale replaced version');
    assert.equal(run.bank_revision, run.manifest.bankRevision);
    assert.equal(run.bank_revision, (await fixture.pool.query('SELECT eligibility_revision::text AS revision FROM tsa.bank_state WHERE id=1')).rows[0].revision);
    assert.equal(run.manifest_hash, sealed.body.manifestHash);

    const slots = (await fixture.pool.query(`SELECT fs.question_id,fs.question_version_id,fs.public_snapshot,fs.snapshot_hash,
        secret.secret_hash,qv.content_hash,q.eligible_version_id
      FROM tsa.form_slots fs JOIN tsa_private.form_slot_secrets secret USING(form_id,slot_id)
      JOIN tsa.question_versions qv ON qv.id=fs.question_version_id
      JOIN tsa.questions q ON q.id=fs.question_id
      WHERE fs.form_id=$1 ORDER BY fs.ordinal`, [sealed.body.formId])).rows;
    assert.equal(slots.length, 4);
    assert.ok(slots.every((slot) => slot.question_version_id === slot.eligible_version_id),
      'Every sealed slot must pin the version current at the serialized winner point');
    assert.ok(slots.every((slot) => slot.snapshot_hash === jsonDigest(slot.public_snapshot)),
      'Every sealed public snapshot hash must match its captured bytes');
    const correctedSlot = slots.find((slot) => slot.question_version_id === corrected.versionId);
    assert.ok(correctedSlot);
    assert.equal(correctedSlot.content_hash, corrected.contentHash);
    assert.ok(correctedSlot.secret_hash);
    await fixture.pool.query('SELECT tsa.assert_form_integrity($1)', [sealed.body.formId]);

    assert.deepEqual((await fixture.pool.query(`SELECT answer_key,explanation,scoring_policy_version
      FROM tsa_private.question_secrets WHERE question_version_id=$1`, [original.versionId])).rows[0], originalSecretBefore,
    'Correcting an eligible version must not rewrite the old answer key or explanation');
    assert.deepEqual(await graphCounts(fixture.pool), {
      forms: 1, sections: 1, slots: 4, runs: 1, seals: 1, attempts: 0, history: 0,
    });
    completed = true;
  } finally {
    if (completed) {
      reviewPause.release();
      sealPause.release();
    } else {
      const error = new Error('Aborting corrected-version/fixed-seal race after test failure');
      reviewPause.abort(error);
      sealPause.abort(error);
    }
    await Promise.allSettled(pending);
  }
});
