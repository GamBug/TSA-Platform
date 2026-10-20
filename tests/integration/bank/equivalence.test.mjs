import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ensureLocalTaxonomy } from '../../../src/local/seed.mjs';
import { createEquivalenceService } from '../../../src/modules/bank/equivalence.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { createBankHarness, loginActor, bankRequest } from './harness.mjs';

let harness;
let taxonomy;
let fixtureScopeId;
let equivalence;
let publication;
let authorBrowser;
let reviewerBrowser;
let managerBrowser;
let candidateBrowser;
let authorReviewerBrowser;
let author;
let reviewer;
let manager;
let candidate;
let authorReviewer;

const APPROVE_RUBRIC = Object.freeze({
  correctness: true,
  unambiguous: true,
  relevant: true,
  language: true,
  explanation: true,
  rights: true,
});

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function principal(browser) {
  return harness.identity.authenticate(new Request(harness.origin, {
    headers: { cookie: browser.cookies.join('; ') },
  }));
}

async function success(response, status) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}

async function registerSource(browser) {
  const sourceKey = randomUUID();
  const sourceResponse = await bankRequest(harness, browser, '/api/v1/sources', {
    method: 'POST', key: `equivalence-source-${sourceKey}`,
    body: { title: `Synthetic equivalence source ${sourceKey}`, canonicalUri: null, origin: 'OWNED' },
  });
  const source = await success(sourceResponse, 201);
  const versionResponse = await bankRequest(harness, browser, `/api/v1/sources/${source.sourceId}/versions`, {
    method: 'POST', key: `equivalence-source-version-${sourceKey}`,
    body: {
      contentHash: sha256(`equivalence-source:${sourceKey}`),
      evidenceUri: 'manual://synthetic-equivalence-test',
      metadata: { purpose: 'synthetic equivalence integration fixture' },
    },
  });
  const version = await success(versionResponse, 201);
  const rightsResponse = await bankRequest(harness, managerBrowser,
    `/api/v1/source-versions/${version.sourceVersionId}/rights`, {
      method: 'POST', key: `equivalence-rights-${sourceKey}`,
      body: {
        status: 'OWNED', allowedUses: ['DISPLAY', 'ADAPT', 'GENERATE'], territory: ['VN'],
        validFrom: '2000-01-01T00:00:00Z', validTo: null,
        evidence: 'Synthetic test record; not a real rights attestation.', expectedRevision: 0,
      },
    });
  const rights = await success(rightsResponse, 201);
  return { ...version, decisionId: rights.decisionId };
}

function questionDraft(source, text) {
  return {
    schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH',
    taxonomyVersionId: taxonomy.taxonomyVersionId, domainId: taxonomy.domainId,
    skillIds: [taxonomy.skillId], subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
    content: [{ type: 'text', text }], stimulusVersionId: null,
    interaction: {
      type: 'SINGLE_CHOICE',
      options: [
        { id: 'a', content: [{ type: 'text', text: 'Synthetic option A' }] },
        { id: 'b', content: [{ type: 'text', text: 'Synthetic option B' }] },
      ],
    },
    answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' },
    explanation: [{ type: 'text', text: 'Synthetic private explanation.' }],
    evidenceRefs: [source.decisionId], origin: 'MANUAL',
    provenance: [{ sourceVersionId: source.sourceVersionId, span: null, transformation: 'synthetic original entry' }],
  };
}

async function createDraft({ browser = authorBrowser, text = `Synthetic equivalence question ${randomUUID()}` } = {}) {
  const source = await registerSource(browser);
  const response = await bankRequest(harness, browser, '/api/v1/questions', {
    method: 'POST', key: `equivalence-question-${randomUUID()}`, body: questionDraft(source, text),
  });
  const question = await success(response, 201);
  return { ...question, source, principal: await principal(browser) };
}

async function submit(question, actor = question.principal) {
  const result = await publication.submitReview(actor, question.versionId,
    `equivalence-submit-${randomUUID()}`, { expectedRevision: 1 });
  assert.deepEqual(result.body, { versionId: question.versionId, state: 'IN_REVIEW', revision: 2 });
  return result;
}

async function confirmSingleton(question) {
  return publication.confirmSingleton(reviewer, question.versionId, `equivalence-singleton-${randomUUID()}`, {
    expectedRevision: 2, contentHash: question.contentHash,
    reason: 'Synthetic singleton fixture for equivalence integration testing.',
  });
}

async function bankRevision() {
  const result = await harness.database.pool.query('SELECT eligibility_revision::text AS revision FROM tsa.bank_state WHERE id=1');
  return result.rows[0].revision;
}

function equivalenceInput(left, right, overrides = {}) {
  return {
    left: { versionId: left.versionId, contentHash: left.contentHash, expectedRevision: left.expectedRevision ?? 2 },
    right: { versionId: right.versionId, contentHash: right.contentHash, expectedRevision: right.expectedRevision ?? 2 },
    kind: 'EXACT', decision: 'CONFIRMED', expectedBankRevision: '0',
    reason: 'Synthetic independent equivalence adjudication fixture.',
    ...overrides,
  };
}

async function adjudicate(left, right, overrides = {}, { actor = reviewer, key = `equivalence-${randomUUID()}` } = {}) {
  const input = equivalenceInput(left, right, {
    expectedBankRevision: await bankRevision(), ...overrides,
  });
  const result = await equivalence.adjudicate(actor, key, input);
  return { ...result, input, key };
}

async function insertRelation(left, right, {
  kind = 'EXACT', evidence = { fingerprint: 'sha256:synthetic-detector-evidence' },
  detectorVersion = 'fingerprint/test',
} = {}) {
  const [leftVersionId, rightVersionId] = [left.versionId, right.versionId].sort();
  const id = randomUUID();
  await harness.database.pool.query(
    `INSERT INTO tsa.duplicate_relations
       (id,left_version_id,right_version_id,kind,evidence,detector_version)
     VALUES ($1,$2,$3,$4::tsa.duplicate_kind,$5::jsonb,$6)`,
    [id, leftVersionId, rightVersionId, kind, JSON.stringify(evidence), detectorVersion]);
  return id;
}

async function relation(left, right, kind = 'EXACT') {
  const [leftVersionId, rightVersionId] = [left.versionId, right.versionId].sort();
  const result = await harness.database.pool.query(
    `SELECT id, resolution::text AS resolution, evidence, detector_version, resolved_by, resolution_evidence
       FROM tsa.duplicate_relations WHERE left_version_id=$1 AND right_version_id=$2 AND kind=$3::tsa.duplicate_kind`,
    [leftVersionId, rightVersionId, kind]);
  return result.rows[0] ?? null;
}

async function groupFor(question) {
  const result = await harness.database.pool.query(
    `SELECT gm.group_id, dg.merged_into_id FROM tsa.duplicate_group_members gm
       JOIN tsa.duplicate_groups dg ON dg.id=gm.group_id WHERE gm.question_id=$1`, [question.questionId]);
  return result.rows[0] ?? null;
}

async function workflow(question) {
  const result = await harness.database.pool.query(
    `SELECT qv.question_id, qw.state::text AS state, qw.revision::text AS revision,
            q.eligible_version_id,
            (SELECT count(*)::int FROM tsa.audit_events a
              WHERE a.entity_type='question_version' AND a.entity_id=qv.id::text) AS audits,
            (SELECT count(*)::int FROM tsa.reviews r WHERE r.question_version_id=qv.id) AS reviews
       FROM tsa.question_versions qv JOIN tsa.question_workflow qw ON qw.question_version_id=qv.id
       JOIN tsa.questions q ON q.id=qv.question_id WHERE qv.id=$1`, [question.versionId]);
  return result.rows[0];
}

async function assertFailure(promise, status, code) {
  await assert.rejects(promise, (error) => error?.status === status && error?.code === code);
}

async function addFactoryOperator(target, operatorId) {
  const namespace = `equivalence-test-${randomUUID()}`;
  const batchKey = randomUUID();
  await harness.database.pool.query(
    `INSERT INTO tsa_private.factory_import_manifests
       (producer_namespace,batch_key,manifest_hash,manifest,received_by)
     VALUES ($1,$2,$3,'{}'::jsonb,$4)`,
    [namespace, batchKey, sha256(batchKey), operatorId]);
  await harness.database.pool.query(
    `INSERT INTO tsa_private.factory_import_receipts
       (producer_namespace,batch_key,item_key,candidate_ordinal,input_hash,question_id,question_version_id)
     VALUES ($1,$2,'synthetic-equivalence-item',0,$3,$4,$5)`,
    [namespace, batchKey, target.contentHash, target.questionId, target.versionId]);
}

async function waitForBankLockWaits(count) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await harness.database.pool.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE application_name='tsa-bank-api-test' AND wait_event_type='Lock'`);
    if (result.rows[0].waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${count} equivalence sessions on the bank row lock`);
}

async function initializeFixtureScope() {
  const scopeId = randomUUID();
  await harness.database.pool.query(
    `INSERT INTO tsa_private.bank_workflow_fixture_scope (scope_id,database_oid,postmaster_started_at)
     SELECT $1, db.oid, pg_postmaster_start_time() FROM pg_database db WHERE db.datname=current_database()`, [scopeId]);
  return scopeId;
}

before(async () => {
  harness = await createBankHarness();
  taxonomy = await ensureLocalTaxonomy(harness.database.pool);
  [authorBrowser, reviewerBrowser, managerBrowser, candidateBrowser, authorReviewerBrowser] = await Promise.all([
    loginActor(harness, 'author'), loginActor(harness, 'reviewer'), loginActor(harness, 'bankManager'),
    loginActor(harness, 'studentA'), loginActor(harness, 'authorReviewer'),
  ]);
  [author, reviewer, manager, candidate, authorReviewer] = await Promise.all([
    principal(authorBrowser), principal(reviewerBrowser), principal(managerBrowser),
    principal(candidateBrowser), principal(authorReviewerBrowser),
  ]);
  fixtureScopeId = await initializeFixtureScope();
  equivalence = await createEquivalenceService({ bankPool: harness.bankPool, identityService: harness.identity });
  publication = await createPublicationService({
    bankPool: harness.bankPool, identityService: harness.identity, fixtureScopeId,
  });
});

after(async () => { await harness?.close(); });

test('CONFIRMED adjudication preserves detector evidence, atomically merges new groups, and never promotes eligibility', async () => {
  const left = await createDraft();
  const right = await createDraft();
  await submit(left);
  await submit(right);
  const detectorEvidence = { normalizedFingerprint: sha256('existing detector flag'), signal: 'fingerprint/1' };
  const detectorVersion = 'fingerprint/1';
  const relationId = await insertRelation(left, right, { evidence: detectorEvidence, detectorVersion });
  const beforeBankRevision = await bankRevision();
  const leftBefore = await workflow(left);
  const rightBefore = await workflow(right);

  const result = await adjudicate(left, right);
  assert.equal(result.status, 200);
  assert.equal(result.body.decision, 'CONFIRMED');
  assert.equal(result.body.bankRevision, String(BigInt(beforeBankRevision) + 1n));
  assert.equal(result.body.incidentRecorded, false);
  assert.ok(result.body.canonicalGroupId);
  assert.ok(result.body.retiredGroupId);
  assert.equal(result.body.canonicalGroupId, [
    (await groupFor(left)).group_id,
    (await groupFor(right)).group_id,
  ][0]);

  const resolved = await relation(left, right);
  assert.equal(resolved.id, relationId);
  assert.equal(resolved.resolution, 'CONFIRMED');
  assert.deepEqual(resolved.evidence, detectorEvidence);
  assert.equal(resolved.detector_version, detectorVersion);
  assert.equal(resolved.resolved_by, reviewer.userId);
  assert.deepEqual(resolved.resolution_evidence, {
    reason: result.input.reason,
    leftVersionId: left.versionId,
    leftContentHash: left.contentHash,
    rightVersionId: right.versionId,
    rightContentHash: right.contentHash,
    reviewerId: reviewer.userId,
  });
  assert.equal((await groupFor(left)).group_id, result.body.canonicalGroupId);
  assert.equal((await groupFor(right)).group_id, result.body.canonicalGroupId);
  assert.equal((await harness.database.pool.query(
    'SELECT merged_into_id FROM tsa.duplicate_groups WHERE id=$1', [result.body.retiredGroupId])).rows[0].merged_into_id,
  result.body.canonicalGroupId);

  let leftState = await workflow(left);
  let rightState = await workflow(right);
  assert.equal(leftState.revision, '3');
  assert.equal(rightState.revision, '3');
  assert.equal(leftState.audits, leftBefore.audits + 1);
  assert.equal(rightState.audits, rightBefore.audits + 1);
  assert.equal(leftState.eligible_version_id, null);
  assert.equal(rightState.eligible_version_id, null);
  assert.equal(leftState.reviews, 0);
  assert.equal(rightState.reviews, 0);

  const approval = await publication.review(reviewer, left.versionId, `approve-after-merge-${randomUUID()}`, {
    expectedRevision: 3, contentHash: left.contentHash, decision: 'APPROVE',
    rubric: { ...APPROVE_RUBRIC }, reason: 'Synthetic exact-version approval after equivalence merge.',
  });
  assert.equal(approval.body.state, 'APPROVED');
  leftState = await workflow(left);
  rightState = await workflow(right);
  assert.equal(leftState.eligible_version_id, left.versionId);
  assert.equal(rightState.eligible_version_id, null);
});

test('DISMISSED adjudication retains detector evidence and does not create or merge groups', async () => {
  const left = await createDraft();
  const right = await createDraft();
  await submit(left);
  await submit(right);
  const detectorEvidence = { semanticScore: 0.91, model: 'synthetic-detector-fixture' };
  await insertRelation(left, right, { kind: 'NEAR_DUPLICATE', evidence: detectorEvidence, detectorVersion: 'semantic/test' });
  const revisionBefore = await bankRevision();

  const result = await adjudicate(left, right, { kind: 'NEAR_DUPLICATE', decision: 'DISMISSED' });
  assert.equal(result.body.decision, 'DISMISSED');
  assert.equal(result.body.canonicalGroupId, null);
  assert.equal(result.body.retiredGroupId, null);
  assert.equal(result.body.incidentRecorded, false);
  assert.equal(result.body.bankRevision, String(BigInt(revisionBefore) + 1n));
  const resolved = await relation(left, right, 'NEAR_DUPLICATE');
  assert.equal(resolved.resolution, 'DISMISSED');
  assert.deepEqual(resolved.evidence, detectorEvidence);
  assert.equal(resolved.detector_version, 'semantic/test');
  assert.equal(resolved.resolution_evidence.reviewerId, reviewer.userId);
  assert.equal(await groupFor(left), null);
  assert.equal(await groupFor(right), null);
  assert.equal((await workflow(left)).eligible_version_id, null);
  assert.equal((await workflow(right)).eligible_version_id, null);
});

test('adjudicating an already-approved target keeps its existing eligible pointer unchanged', async () => {
  const approved = await createDraft();
  const inReview = await createDraft();
  await Promise.all([submit(approved), submit(inReview)]);
  await confirmSingleton(approved);
  const approval = await publication.review(reviewer, approved.versionId, `approve-before-merge-${randomUUID()}`, {
    expectedRevision: 2, contentHash: approved.contentHash, decision: 'APPROVE',
    rubric: { ...APPROVE_RUBRIC }, reason: 'Synthetic approval before equivalence fixture.',
  });
  assert.equal(approval.body.state, 'APPROVED');
  const beforeRevision = await bankRevision();
  const result = await adjudicate(approved, inReview, {
    left: { versionId: approved.versionId, contentHash: approved.contentHash, expectedRevision: 3 },
  });
  assert.equal(result.body.bankRevision, String(BigInt(beforeRevision) + 1n));
  assert.equal((await workflow(approved)).state, 'APPROVED');
  assert.equal((await workflow(approved)).revision, '4');
  assert.equal((await workflow(approved)).eligible_version_id, approved.versionId);
  assert.equal((await workflow(inReview)).state, 'IN_REVIEW');
  assert.equal((await workflow(inReview)).revision, '3');
});

test('adjudication leaves other open duplicate flags unresolved', async () => {
  const left = await createDraft();
  const right = await createDraft();
  const related = await createDraft();
  await Promise.all([submit(left), submit(right), submit(related)]);
  await insertRelation(left, right, { kind: 'EXACT', evidence: { detector: 'target flag' } });
  await insertRelation(left, related, { kind: 'RELATED', evidence: { detector: 'unrelated relation' } });
  const result = await adjudicate(left, right);
  assert.equal(result.body.decision, 'CONFIRMED');
  assert.equal((await relation(left, right, 'EXACT')).resolution, 'CONFIRMED');
  assert.equal((await relation(left, related, 'RELATED')).resolution, 'OPEN');
  assert.equal(await groupFor(related), null);
});

test('a finalized relation cannot be changed with another key, while the original receipt replays', async () => {
  const left = await createDraft();
  const right = await createDraft();
  await submit(left);
  await submit(right);
  const input = equivalenceInput(left, right, {
    expectedBankRevision: await bankRevision(), decision: 'DISMISSED',
  });
  const key = `final-relation-${randomUUID()}`;
  const first = await equivalence.adjudicate(reviewer, key, input);
  const replay = await equivalence.adjudicate(reviewer, key, input);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.body, first.body);
  const finalBefore = await relation(left, right);
  const stateBefore = await workflow(left);
  const rightStateBefore = await workflow(right);
  const bankBefore = await bankRevision();
  await assertFailure(equivalence.adjudicate(reviewer, `flip-final-${randomUUID()}`, {
    ...input,
    left: { ...input.left, expectedRevision: Number(stateBefore.revision) },
    right: { ...input.right, expectedRevision: Number(rightStateBefore.revision) },
    expectedBankRevision: bankBefore, decision: 'CONFIRMED',
  }), 409, 'INVALID_WORKFLOW_TRANSITION');
  assert.deepEqual(await relation(left, right), finalBefore);
  assert.equal((await workflow(left)).revision, stateBefore.revision);
  assert.equal(await bankRevision(), bankBefore);
  await assert.rejects(harness.database.pool.query(
    `UPDATE tsa.duplicate_relations SET resolution='CONFIRMED' WHERE id=$1`, [finalBefore.id]),
  { code: '23514' });
});

test('a confirmed relation merges canonical aliases monotonically through a later lexicographically smaller root', async () => {
  const first = await createDraft();
  const second = await createDraft();
  const third = await createDraft();
  await Promise.all([submit(first), submit(second), submit(third)]);
  const groupFirst = '10000000-0000-4000-8000-000000000001';
  const groupSecond = '20000000-0000-4000-8000-000000000002';
  const groupThird = '00000000-0000-4000-8000-000000000003';
  await harness.database.pool.query(
    `INSERT INTO tsa.duplicate_groups (id,reason,confirmed_by)
     VALUES ($1,'Synthetic canonical group A',$4),($2,'Synthetic canonical group B',$4),($3,'Synthetic canonical group C',$4)`,
    [groupFirst, groupSecond, groupThird, reviewer.userId]);
  await harness.database.pool.query(
    `INSERT INTO tsa.duplicate_group_members (group_id,question_id)
     VALUES ($1,$4),($2,$5),($3,$6)`,
    [groupFirst, groupSecond, groupThird, first.questionId, second.questionId, third.questionId]);

  const firstMerge = await adjudicate(first, second);
  assert.equal(firstMerge.body.canonicalGroupId, groupFirst);
  assert.equal(firstMerge.body.retiredGroupId, groupSecond);
  assert.deepEqual((await relation(first, second)).evidence, { syntheticWorkflow: true });
  assert.equal((await relation(first, second)).detector_version, 'human-equivalence/1');
  const secondMerge = await adjudicate(second, third, {
    left: { versionId: second.versionId, contentHash: second.contentHash, expectedRevision: 3 },
  });
  assert.equal(secondMerge.body.canonicalGroupId, groupThird);
  assert.equal(secondMerge.body.retiredGroupId, groupFirst);
  for (const question of [first, second, third]) assert.equal((await groupFor(question)).group_id, groupThird);
  const aliases = await harness.database.pool.query(
    'SELECT id,merged_into_id FROM tsa.duplicate_groups WHERE id=ANY($1::uuid[]) ORDER BY id',
    [[groupFirst, groupSecond, groupThird]]);
  assert.deepEqual(new Map(aliases.rows.map((row) => [row.id, row.merged_into_id])), new Map([
    [groupFirst, groupThird], [groupSecond, groupFirst], [groupThird, null],
  ]));
});

test('a confirmed relation inside one already-canonical group does not split or retire it', async () => {
  const left = await createDraft();
  const right = await createDraft();
  await Promise.all([submit(left), submit(right)]);
  const groupId = randomUUID();
  await harness.database.pool.query(
    'INSERT INTO tsa.duplicate_groups (id,reason,confirmed_by) VALUES ($1,$2,$3)',
    [groupId, 'Synthetic existing canonical family', reviewer.userId]);
  await harness.database.pool.query(
    'INSERT INTO tsa.duplicate_group_members (group_id,question_id) VALUES ($1,$2),($1,$3)',
    [groupId, left.questionId, right.questionId]);
  const result = await adjudicate(left, right);
  assert.equal(result.body.canonicalGroupId, groupId);
  assert.equal(result.body.retiredGroupId, null);
  assert.equal((await groupFor(left)).group_id, groupId);
  assert.equal((await groupFor(right)).group_id, groupId);
  assert.equal((await harness.database.pool.query(
    'SELECT merged_into_id FROM tsa.duplicate_groups WHERE id=$1', [groupId])).rows[0].merged_into_id, null);
});

test('reviewer, self-author, factory operator, and forged-principal authorization checks fail closed', async () => {
  const selfAuthored = await createDraft({ browser: authorReviewerBrowser });
  const other = await createDraft();
  await Promise.all([submit(selfAuthored, authorReviewer), submit(other)]);
  const selfInput = equivalenceInput(selfAuthored, other, { expectedBankRevision: await bankRevision() });
  await assertFailure(equivalence.adjudicate(authorReviewer, `self-review-${randomUUID()}`, selfInput), 403, 'FORBIDDEN');

  const operatorAuthored = await createDraft();
  const another = await createDraft();
  await Promise.all([submit(operatorAuthored), submit(another)]);
  await addFactoryOperator(operatorAuthored, reviewer.userId);
  const operatorInput = equivalenceInput(operatorAuthored, another, { expectedBankRevision: await bankRevision() });
  await assertFailure(equivalence.adjudicate(reviewer, `operator-review-${randomUUID()}`, operatorInput), 403, 'FORBIDDEN');

  const unauthorizedLeft = await createDraft();
  const unauthorizedRight = await createDraft();
  await Promise.all([submit(unauthorizedLeft), submit(unauthorizedRight)]);
  const unauthorizedInput = equivalenceInput(unauthorizedLeft, unauthorizedRight, {
    expectedBankRevision: await bankRevision(),
  });
  await assertFailure(equivalence.adjudicate(candidate, `candidate-${randomUUID()}`, unauthorizedInput), 403, 'FORBIDDEN');
  await assertFailure(equivalence.adjudicate({ ...reviewer, userId: randomUUID() }, `forged-${randomUUID()}`, unauthorizedInput),
    403, 'FORBIDDEN');
  assert.equal(await relation(unauthorizedLeft, unauthorizedRight), null);
});

test('stale bank/hash/workflow pins, invalid workflow states, repeated identities, and malformed inputs mutate nothing', async () => {
  const left = await createDraft();
  const right = await createDraft();
  await Promise.all([submit(left), submit(right)]);
  const currentRevision = await bankRevision();
  const valid = equivalenceInput(left, right, { expectedBankRevision: currentRevision });
  const bankBefore = currentRevision;
  const auditsBefore = [(await workflow(left)).audits, (await workflow(right)).audits];

  await assertFailure(equivalence.adjudicate(reviewer, `stale-bank-${randomUUID()}`,
    { ...valid, expectedBankRevision: String(BigInt(currentRevision) + 1n) }), 409, 'REVISION_CONFLICT');
  await assertFailure(equivalence.adjudicate(reviewer, `stale-hash-${randomUUID()}`,
    { ...valid, left: { ...valid.left, contentHash: sha256('not-current') } }), 409, 'CONTENT_HASH_MISMATCH');
  await assertFailure(equivalence.adjudicate(reviewer, `stale-workflow-${randomUUID()}`,
    { ...valid, right: { ...valid.right, expectedRevision: 1 } }), 409, 'REVISION_CONFLICT');
  await assertFailure(equivalence.adjudicate(reviewer, `extra-field-${randomUUID()}`,
    { ...valid, ignored: true }), 422, 'VALIDATION_ERROR');
  await assertFailure(equivalence.adjudicate(reviewer, `bad-bigint-${randomUUID()}`,
    { ...valid, expectedBankRevision: '01' }), 422, 'VALIDATION_ERROR');
  await assertFailure(equivalence.adjudicate(reviewer, `long-bigint-${randomUUID()}`,
    { ...valid, expectedBankRevision: '9'.repeat(20) }), 422, 'VALIDATION_ERROR');
  await assertFailure(equivalence.adjudicate(reviewer, `bad-hash-${randomUUID()}`,
    { ...valid, left: { ...valid.left, contentHash: 'sha256:ABC' } }), 422, 'VALIDATION_ERROR');
  await assertFailure(equivalence.adjudicate(reviewer, `same-version-${randomUUID()}`,
    { ...valid, right: { ...valid.right, versionId: valid.left.versionId } }), 422, 'VALIDATION_ERROR');
  await assertFailure(equivalence.adjudicate(reviewer, `empty-reason-${randomUUID()}`,
    { ...valid, reason: '  ' }), 422, 'VALIDATION_ERROR');
  assert.equal(await relation(left, right), null);
  assert.equal(await bankRevision(), bankBefore);
  assert.deepEqual([(await workflow(left)).audits, (await workflow(right)).audits], auditsBefore);

  const revisionResponse = await bankRequest(harness, authorBrowser, `/api/v1/questions/${left.questionId}/versions`, {
    method: 'POST', key: `same-identity-version-${randomUUID()}`,
    body: {
      parentVersionId: left.versionId,
      draft: questionDraft(left.source, `Corrected same stable identity ${randomUUID()}`),
    },
  });
  const nextVersion = await success(revisionResponse, 201);
  await publication.submitReview(author, nextVersion.versionId, `submit-same-identity-${randomUUID()}`, { expectedRevision: 1 });
  await assertFailure(equivalence.adjudicate(reviewer, `same-identity-${randomUUID()}`, {
    left: valid.left,
    right: { versionId: nextVersion.versionId, contentHash: nextVersion.contentHash, expectedRevision: 2 },
    kind: valid.kind, decision: valid.decision, expectedBankRevision: await bankRevision(), reason: valid.reason,
  }), 422, 'VALIDATION_ERROR');

  const rejected = await createDraft();
  await submit(rejected);
  await publication.review(reviewer, rejected.versionId, `reject-before-equivalence-${randomUUID()}`, {
    expectedRevision: 2, contentHash: rejected.contentHash, decision: 'REJECT',
    rubric: { ...APPROVE_RUBRIC, correctness: false }, reason: 'Synthetic terminal rejection fixture.',
  });
  await assertFailure(equivalence.adjudicate(reviewer, `terminal-state-${randomUUID()}`, {
    left: { versionId: rejected.versionId, contentHash: rejected.contentHash, expectedRevision: 3 },
    right: valid.right, kind: valid.kind, decision: valid.decision,
    expectedBankRevision: await bankRevision(), reason: valid.reason,
  }), 409, 'INVALID_WORKFLOW_TRANSITION');

  assert.equal(await relation(left, right), null);
  assert.equal((await workflow(left)).revision, '2');
  assert.equal((await workflow(right)).revision, '2');
  assert.deepEqual([(await workflow(left)).audits, (await workflow(right)).audits], auditsBefore);
});

test('same-key replay is immutable, role revocation blocks replay, and audits remain append-only', async () => {
  const left = await createDraft();
  const right = await createDraft();
  await Promise.all([submit(left), submit(right)]);
  const input = equivalenceInput(left, right, { expectedBankRevision: await bankRevision() });
  const key = `replay-equivalence-${randomUUID()}`;
  const first = await equivalence.adjudicate(reviewer, key, input);
  const replay = await equivalence.adjudicate(reviewer, key, input);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.body, first.body);
  assert.equal(await bankRevision(), first.body.bankRevision);
  assert.equal((await workflow(left)).audits, 3);
  assert.equal((await workflow(right)).audits, 3);

  await harness.database.pool.query('DELETE FROM tsa.user_roles WHERE user_id=$1 AND role=\'REVIEWER\'', [reviewer.userId]);
  try {
    const revokedPrincipal = await principal(reviewerBrowser);
    assert.equal(revokedPrincipal.roles.includes('REVIEWER'), false);
    await assertFailure(equivalence.adjudicate(revokedPrincipal, key, input), 403, 'FORBIDDEN');
  } finally {
    await harness.database.pool.query(
      `INSERT INTO tsa.user_roles (user_id,role) VALUES ($1,'REVIEWER') ON CONFLICT DO NOTHING`, [reviewer.userId]);
  }

  await assert.rejects(harness.database.pool.query(
    `UPDATE tsa.audit_events SET reason='tampered' WHERE entity_type='question_version' AND entity_id=$1`, [left.versionId]),
  { code: '55000' });
});

test('failure after relation and group mutation rolls back the entire adjudication and receipt', async () => {
  const left = await createDraft();
  const right = await createDraft();
  await Promise.all([submit(left), submit(right)]);
  const key = `rollback-equivalence-${randomUUID()}`;
  const input = equivalenceInput(left, right, { expectedBankRevision: await bankRevision() });
  const leftBefore = await workflow(left);
  const rightBefore = await workflow(right);
  const bankBefore = await bankRevision();
  let injected = false;
  const faultPool = {
    query: (...args) => harness.bankPool.query(...args),
    async connect() {
      const client = await harness.bankPool.connect();
      return {
        query(sql, values) {
          if (!injected && typeof sql === 'string' && sql.includes('INSERT INTO tsa.audit_events')
              && values?.[2] === 'BANK_EQUIVALENCE_CONFIRMED') {
            injected = true;
            throw new Error('injected equivalence audit fault');
          }
          return client.query(sql, values);
        },
        release: (...args) => client.release(...args),
      };
    },
  };
  const faultService = await createEquivalenceService({ bankPool: faultPool, identityService: harness.identity });
  await assert.rejects(faultService.adjudicate(reviewer, key, input), /injected equivalence audit fault/);
  assert.equal(injected, true);
  assert.equal(await relation(left, right), null);
  assert.equal(await groupFor(left), null);
  assert.equal(await groupFor(right), null);
  assert.equal((await workflow(left)).revision, leftBefore.revision);
  assert.equal((await workflow(right)).revision, rightBefore.revision);
  assert.equal((await workflow(left)).audits, leftBefore.audits);
  assert.equal((await workflow(right)).audits, rightBefore.audits);
  assert.equal(await bankRevision(), bankBefore);
  assert.equal((await harness.database.pool.query(
    `SELECT count(*)::int AS count FROM tsa.idempotency_records
      WHERE actor_id=$1 AND route_scope='POST /internal/bank/equivalence' AND idempotency_key=$2`,
    [reviewer.userId, key])).rows[0].count, 0);
});

test('bank-row locking serializes confirmed and dismissed contenders in both observed winner orders', async () => {
  for (const firstDecision of ['CONFIRMED', 'DISMISSED']) {
    const left = await createDraft();
    const right = await createDraft();
    await Promise.all([submit(left), submit(right)]);
    const expectedRevision = await bankRevision();
    const blocker = await harness.database.pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM tsa.bank_state WHERE id=1 FOR UPDATE');
    const start = (decision) => equivalence.adjudicate(reviewer, `race-${decision}-${randomUUID()}`,
      equivalenceInput(left, right, { expectedBankRevision: expectedRevision, decision }));
    const firstPromise = start(firstDecision);
    try {
      await waitForBankLockWaits(1);
      const secondPromise = start(firstDecision === 'CONFIRMED' ? 'DISMISSED' : 'CONFIRMED');
      await waitForBankLockWaits(2);
      await blocker.query('COMMIT');
      const results = await Promise.allSettled([firstPromise, secondPromise]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const winner = results.find((result) => result.status === 'fulfilled').value;
      const loser = results.find((result) => result.status === 'rejected').reason;
      assert.equal(winner.body.decision, firstDecision);
      assert.equal(loser.status, 409);
      assert.equal(loser.code, 'REVISION_CONFLICT');
      assert.equal((await relation(left, right)).resolution, firstDecision);
      assert.equal(await bankRevision(), String(BigInt(expectedRevision) + 1n));
      assert.equal((await workflow(left)).revision, '3');
      assert.equal((await workflow(right)).revision, '3');
    } finally {
      try { await blocker.query('ROLLBACK'); } catch { /* transaction already committed */ }
      blocker.release();
    }
  }
});

test('production process cannot construct the equivalence service', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(createEquivalenceService({ bankPool: harness.bankPool, identityService: harness.identity }),
      /disabled in production/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
