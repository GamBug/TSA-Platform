import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  AttemptViewSchema,
  canonicalize,
  studentRouteRegistry,
} from '../../../packages/contracts/dist/internal.js';
import { privateQuestionFixture, privateTrueFalseGroupFixture } from '../../../apps/practice-prototype/src/private-question-fixture.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createPrivateTemplate, LOCAL_TAXONOMY } from '../../../src/local/seed.mjs';
import { bankRequest } from '../bank/harness.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const CREATE_RATE = Object.freeze({ capacity: 50, refillPerSecond: 10 });
const SAVE_RATE = Object.freeze({
  user: Object.freeze({ capacity: 50, refillPerSecond: 0.000001 }),
  attempt: Object.freeze({ capacity: 50, refillPerSecond: 0.000001 }),
});
const RUBRIC = Object.freeze(Object.fromEntries(
  ['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'].map((key) => [key, true])));

function key(label) { return `${label}-${randomUUID()}`; }
function createBody(blueprintVersionId) { return { blueprintVersionId }; }

async function assertSaveError(promise, status, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    const details = error.details ?? {};
    studentRouteRegistry.saveAnswer.responses[status].schema.parse({
      error: { code, message: code, requestId: randomUUID(), details },
    });
    return true;
  });
}

function assertNoPrivateKeys(value) {
  const forbidden = new Set([
    'answerKey', 'keySnapshot', 'explanation', 'correctAnswer', 'provenance',
    'sourceVersionId', 'reviewNotes', 'normalizedFingerprint',
  ]);
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (item === null || typeof item !== 'object') return;
    for (const [name, child] of Object.entries(item)) {
      assert.equal(forbidden.has(name), false, `private property leaked: ${name}`);
      visit(child);
    }
  };
  visit(value);
}

async function saveBuckets(pool) {
  const result = await pool.query(`SELECT scope,subject_id,tokens::text AS tokens FROM tsa.rate_limit_buckets
    WHERE scope IN ('USER_SAVE','ATTEMPT_SAVE') ORDER BY scope,subject_id`);
  return result.rows;
}

function assertBothSaveBucketsDecreased(before, after) {
  for (const scope of ['USER_SAVE', 'ATTEMPT_SAVE']) {
    const oldRow = before.find((row) => row.scope === scope);
    const newRow = after.find((row) => row.scope === scope);
    assert.ok(oldRow && newRow, `${scope} bucket exists`);
    assert.ok(Number(newRow.tokens) <= Number(oldRow.tokens) - 0.999,
      `${scope} bucket charged before typed validation`);
  }
}

async function publishSyntheticQuestion(fixture, source, { interaction, answerKey, label }) {
  const template = createPrivateTemplate(source);
  const draftResponse = await bankRequest(fixture.harness, fixture.browsers.author, '/api/v1/questions', {
    method: 'POST',
    key: key('save-question-draft'),
    body: {
      schemaVersion: 'question/1',
      language: 'vi-VN',
      section: 'MATH',
      taxonomyVersionId: template.taxonomyVersionId,
      domainId: template.domainId,
      skillIds: template.skillIds,
      subskillIds: [],
      cognitiveLevel: null,
      targetDifficulty: 'EASY',
      content: [{ type: 'text', text: `Synthetic answer-save ${label} fixture ${randomUUID()}` }],
      interaction,
      answerKey,
      explanation: [{ type: 'text', text: 'Synthetic explanation for isolated engineering tests.' }],
      stimulusVersionId: null,
      evidenceRefs: template.evidenceRefs,
      origin: 'MANUAL',
      provenance: template.provenance,
    },
  });
  const draft = await draftResponse.json();
  assert.equal(draftResponse.status, 201, `${label} question draft failed: ${JSON.stringify(draft)}`);

  await fixture.workflow.submitReview(fixture.principals.author, draft.versionId, key('save-question-submit'), {
    expectedRevision: 1,
  });
  await fixture.workflow.confirmSingleton(fixture.principals.reviewer, draft.versionId, key('save-question-singleton'), {
    expectedRevision: 2,
    contentHash: draft.contentHash,
    reason: 'Synthetic fixture exact-version singleton decision.',
  });
  await fixture.workflow.review(fixture.principals.reviewer, draft.versionId, key('save-question-review'), {
    expectedRevision: 2,
    contentHash: draft.contentHash,
    decision: 'APPROVE',
    rubric: { ...RUBRIC },
    reason: 'Synthetic approval used only in a disposable isolated test database.',
  });
  return draft;
}

async function createTypedBlueprint(fixture, interactionType, durationSeconds) {
  const id = randomUUID();
  const versionId = randomUUID();
  const config = {
    schemaVersion: 'blueprint/1',
    name: `Synthetic ${interactionType} answer-save blueprint ${id}`,
    taxonomyVersionId: LOCAL_TAXONOMY.taxonomyVersionId,
    profileKind: 'INDEPENDENT_PRACTICE',
    evidenceIds: ['synthetic-answer-save-fixture'],
    sections: [{ id: 'save-section', section: 'MATH', count: 4, durationSeconds }],
    allowedTypes: [interactionType],
    quotas: [{ sectionId: 'save-section', dimension: 'SKILL', value: LOCAL_TAXONOMY.skillId, min: 4, max: 4 }],
    maxPerSource: null,
    excludedQuestionIds: [],
    bundlePolicy: 'ALL_OR_NONE',
    scoringPolicy: 'practice-binary-v1',
    releasePolicy: 'after-grade-v1',
  };
  const contentHash = `sha256:${createHash('sha256').update(canonicalize(config)).digest('hex')}`;
  await fixture.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, config.name]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_versions
    (id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4::jsonb,$5)`,
  [versionId, id, LOCAL_TAXONOMY.taxonomyVersionId, JSON.stringify(config), contentHash]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_offerings
    (blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`, [versionId]);
  return versionId;
}

async function waitUntilDeadline(pool, attemptId) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT clock_timestamp()>=deadline_at AS elapsed
      FROM tsa.attempts WHERE id=$1`, [attemptId]);
    assert.equal(result.rowCount, 1);
    if (result.rows[0].elapsed) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The short immutable attempt deadline did not elapse in the bounded test wait');
}

test('PostgreSQL answer saves persist exact revisions, replay, conflicts, authorization and rate side effects', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  t.after(() => fixture.close());
  const serviceA = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });
  const serviceB = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });
  assert.throws(() => createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: { user: { capacity: 1, refillPerSecond: 0.0000009 }, attempt: SAVE_RATE.attempt },
  }), TypeError, 'rates below the persisted six-decimal precision are rejected');

  const created = await serviceA.create(fixture.principals.studentA, key('save-create'), createBody(fixture.blueprint.versionId));
  const started = await serviceA.start(fixture.principals.studentA, created.body.attemptId, key('save-start'), {});
  assert.equal(started.status, 200);
  assert.deepEqual(await saveBuckets(fixture.pool), [], 'creation and start do not consume USER_SAVE or ATTEMPT_SAVE');
  const active = await serviceA.read(fixture.principals.studentA, created.body.attemptId);
  AttemptViewSchema.parse(active);
  const slot = active.slots[0];
  const originalValue = { type: 'SINGLE_CHOICE', optionId: 'a' };
  const firstKey = key('save-first');

  const sameKeyRace = await Promise.all([
    serviceA.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, firstKey,
      { expectedRevision: 0, value: originalValue }),
    serviceB.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, firstKey,
      { expectedRevision: 0, value: originalValue }),
  ]);
  assert.deepEqual(sameKeyRace[0].body, sameKeyRace[1].body, 'same-key concurrent saves share one immutable acknowledgement');
  assert.ok(sameKeyRace.every((result) => result.status === 200));
  studentRouteRegistry.saveAnswer.responses[200].schema.parse(sameKeyRace[0].body);
  assert.equal(sameKeyRace.filter((result) => result.replayed).length, 1);

  const conflictingRace = await Promise.allSettled([
    serviceA.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key('save-cross-tab-a'),
      { expectedRevision: 1, value: { type: 'SINGLE_CHOICE', optionId: 'b' } }),
    serviceB.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key('save-cross-tab-b'),
      { expectedRevision: 1, value: { type: 'SINGLE_CHOICE', optionId: 'a' } }),
  ]);
  assert.equal(conflictingRace.filter((result) => result.status === 'fulfilled').length, 1,
    JSON.stringify(conflictingRace.map((result) => result.status === 'fulfilled'
      ? { status: 'fulfilled', revision: result.value.body.revision, replayed: result.value.replayed }
      : { status: 'rejected', errorStatus: result.reason.status, code: result.reason.code })));
  assert.equal(conflictingRace.filter((result) => result.status === 'rejected').length, 1);
  const rejected = conflictingRace.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.status, 409);
  assert.equal(rejected.reason.code, 'REVISION_CONFLICT');
  studentRouteRegistry.saveAnswer.responses[409].schema.parse({
    error: { code: rejected.reason.code, message: rejected.reason.code, requestId: randomUUID(), details: rejected.reason.details },
  });
  const winner = conflictingRace.find((result) => result.status === 'fulfilled').value;
  assert.equal(winner.body.revision, 2);

  const clearKey = key('save-clear');
  const cleared = await serviceB.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, clearKey,
    { expectedRevision: 2, value: { type: 'SINGLE_CHOICE', optionId: null } });
  assert.equal(cleared.body.revision, 3);
  const replayAfterRestart = await createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  }).save(fixture.principals.studentA, created.body.attemptId, slot.slotId, clearKey,
  { expectedRevision: 2, value: { type: 'SINGLE_CHOICE', optionId: null } });
  assert.equal(replayAfterRestart.replayed, true);
  assert.deepEqual(replayAfterRestart.body, cleared.body, 'lost-ack replay survives service reconstruction without incrementing the revision');

  await assertSaveError(serviceA.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, clearKey,
    { expectedRevision: 3, value: { type: 'SINGLE_CHOICE', optionId: 'a' } }), 409, 'IDEMPOTENCY_CONFLICT');
  await assertSaveError(serviceA.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key('save-stale'),
    { expectedRevision: 1, value: { type: 'SINGLE_CHOICE', optionId: 'a' } }), 409, 'REVISION_CONFLICT');
  await assertSaveError(serviceA.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key('save-max-revision'),
    { expectedRevision: Number.MAX_SAFE_INTEGER, value: { type: 'SINGLE_CHOICE', optionId: 'a' } }), 409, 'REVISION_CONFLICT');

  const beforeInvalidTyped = await saveBuckets(fixture.pool);
  await assertSaveError(serviceA.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key('save-wrong-interaction'),
    { expectedRevision: 3, value: { type: 'MULTIPLE_CHOICE', optionIds: [] } }), 422, 'VALIDATION_ERROR');
  assertBothSaveBucketsDecreased(beforeInvalidTyped, await saveBuckets(fixture.pool));
  await assertSaveError(serviceA.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key('save-unknown-option'),
    { expectedRevision: 3, value: { type: 'SINGLE_CHOICE', optionId: 'not-an-option' } }), 422, 'VALIDATION_ERROR');

  const beforeInvalidShape = await saveBuckets(fixture.pool);
  await assertSaveError(serviceA.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key('save-invalid-shape'),
    { expectedRevision: -1, value: { type: 'SINGLE_CHOICE', optionId: null } }), 422, 'VALIDATION_ERROR');
  assertBothSaveBucketsDecreased(beforeInvalidShape, await saveBuckets(fixture.pool));

  const beforeUnauthorized = await saveBuckets(fixture.pool);
  await assertSaveError(serviceA.save(fixture.principals.studentB, created.body.attemptId, slot.slotId, key('save-bola'),
    { expectedRevision: 3, value: { type: 'SINGLE_CHOICE', optionId: null } }), 404, 'NOT_FOUND');
  await assertSaveError(serviceA.save(fixture.principals.studentA, created.body.attemptId, randomUUID(), key('save-invalid-slot'),
    { expectedRevision: 3, value: { type: 'SINGLE_CHOICE', optionId: null } }), 404, 'NOT_FOUND');
  await assertSaveError(serviceA.save(fixture.principals.author, created.body.attemptId, slot.slotId, key('save-unauthorized-role'),
    { expectedRevision: 3, value: { type: 'SINGLE_CHOICE', optionId: null } }), 403, 'FORBIDDEN');
  assert.deepEqual(await saveBuckets(fixture.pool), beforeUnauthorized,
    'foreign attempt, invalid slot and unauthorized role create or consume no save bucket tokens');

  const viewAfterSaves = await serviceA.read(fixture.principals.studentA, created.body.attemptId);
  assert.equal(viewAfterSaves.answers.length, 1);
  assert.deepEqual(viewAfterSaves.answers[0], cleared.body);
  assertNoPrivateKeys(viewAfterSaves);
  const persisted = await fixture.pool.query(`SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2`,
    [created.body.attemptId, slot.slotId]);
  assert.equal(persisted.rowCount, 1);
  assert.equal(Number(persisted.rows[0].revision), 3);
  assert.deepEqual(persisted.rows[0].value, { type: 'SINGLE_CHOICE', optionId: null });
});

test('PostgreSQL saves validate and replay SC, MC and complete TFG response shapes against sealed interactions', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 0, blueprintCount: 1 });
  t.after(() => fixture.close());
  const service = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });

  const multipleChoice = {
    type: 'MULTIPLE_CHOICE',
    options: ['a', 'b', 'c'].map((id) => ({ id, content: [{ type: 'text', text: `Synthetic option ${id}` }] })),
    minSelections: 2,
    maxSelections: 2,
  };
  const cases = [
    {
      type: 'SINGLE_CHOICE',
      interaction: privateQuestionFixture.interaction,
      answerKey: privateQuestionFixture.private.answerKey,
      source: await fixture.registerSource(),
      values: [
        { type: 'SINGLE_CHOICE', optionId: 'a' },
        { type: 'SINGLE_CHOICE', optionId: null },
      ],
      duration: 3,
    },
    {
      type: 'MULTIPLE_CHOICE',
      interaction: multipleChoice,
      answerKey: { type: 'MULTIPLE_CHOICE', optionIds: ['a', 'b'] },
      source: await fixture.registerSource(),
      values: [
        { type: 'MULTIPLE_CHOICE', optionIds: ['a', 'b'] },
        { type: 'MULTIPLE_CHOICE', optionIds: [] },
      ],
      duration: 600,
    },
    {
      type: 'TRUE_FALSE_GROUP',
      interaction: privateTrueFalseGroupFixture.interaction,
      answerKey: { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false } },
      source: await fixture.registerSource(),
      values: [
        { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: null } },
        { type: 'TRUE_FALSE_GROUP', values: { s1: null, s2: null } },
      ],
      duration: 600,
    },
  ];

  for (const item of cases) {
    for (let index = 0; index < 4; index += 1) {
      await publishSyntheticQuestion(fixture, item.source, {
        interaction: item.interaction,
        answerKey: item.answerKey,
        label: `${item.type}-${index + 1}`,
      });
    }
    const blueprintVersionId = await createTypedBlueprint(fixture, item.type, item.duration);
    const created = await service.create(fixture.principals.studentA, key(`typed-${item.type}-create`), createBody(blueprintVersionId));
    await service.start(fixture.principals.studentA, created.body.attemptId, key(`typed-${item.type}-start`), {});
    const active = await service.read(fixture.principals.studentA, created.body.attemptId);
    assert.equal(active.slots.length, 4);
    const slot = active.slots[0];
    assert.equal(slot.interaction.type, item.type);
    let priorAck;
    const valueKeys = [];
    for (const [index, value] of item.values.entries()) {
      const saveKey = key(`typed-${item.type}-${index}`);
      valueKeys.push(saveKey);
      const saved = await service.save(fixture.principals.studentA, created.body.attemptId, slot.slotId,
        saveKey, { expectedRevision: index, value });
      assert.equal(saved.body.revision, index + 1);
      assert.deepEqual(saved.body.value, value);
      priorAck = saved.body;
    }
    if (item.type === 'TRUE_FALSE_GROUP') {
      await assertSaveError(service.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key('typed-tfg-incomplete'),
        { expectedRevision: 2, value: { type: 'TRUE_FALSE_GROUP', values: { s1: true } } }), 422, 'VALIDATION_ERROR');
      await assertSaveError(service.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key('typed-tfg-extra'),
        { expectedRevision: 2, value: { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false, extra: null } } }), 422, 'VALIDATION_ERROR');
      await assertSaveError(service.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key('typed-tfg-nonboolean'),
        { expectedRevision: 2, value: { type: 'TRUE_FALSE_GROUP', values: { s1: 'true', s2: false } } }), 422, 'VALIDATION_ERROR');
    }

    if (item.type === 'MULTIPLE_CHOICE') {
      for (const [label, optionIds] of [
        ['below-minimum', ['a']],
        ['duplicate', ['a', 'a']],
        ['unknown', ['a', 'unknown']],
        ['above-maximum', ['a', 'b', 'c']],
      ]) {
        await assertSaveError(service.save(fixture.principals.studentA, created.body.attemptId, slot.slotId, key(`typed-mc-${label}`),
          { expectedRevision: 2, value: { type: 'MULTIPLE_CHOICE', optionIds } }), 422, 'VALIDATION_ERROR');
      }
    }

    if (item.type === 'SINGLE_CHOICE') {
      await waitUntilDeadline(fixture.pool, created.body.attemptId);
      const expired = await service.read(fixture.principals.studentA, created.body.attemptId);
      assert.equal(expired.state, 'EXPIRED');
      const replay = await service.save(fixture.principals.studentA, created.body.attemptId, slot.slotId,
        valueKeys[1], { expectedRevision: 1, value: item.values[1] });
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.body, priorAck, 'ordinary expiry preserves the exact already-committed acknowledgement');
    }

    if (item.type === 'MULTIPLE_CHOICE') {
      const sourceService = await createSourceService({
        bankPool: fixture.bankPool,
        identityService: fixture.identityService,
      });
      await sourceService.registerRightsDecision(fixture.principals.bankManager, item.source.sourceVersionId,
        key('typed-mc-revoke'), {
          status: 'REVOKED',
          allowedUses: ['DISPLAY'],
          territory: ['VN'],
          validFrom: '2000-01-01T00:00:00Z',
          validTo: null,
          evidence: 'Synthetic isolated rights-revocation regression; not a real rights attestation.',
          expectedRevision: 1,
        });
      await assertSaveError(service.save(fixture.principals.studentA, created.body.attemptId, slot.slotId,
        valueKeys[1], { expectedRevision: 1, value: item.values[1] }), 410, 'CONTENT_WITHDRAWN');
    }
  }
});
