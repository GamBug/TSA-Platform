import { createEquivalenceService } from '../../../src/modules/bank/equivalence.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createTopicPracticeService } from '../../../src/modules/topic-practice/service.mjs';
import { createBundleFixture } from '../assembly/bundle-fixtures.mjs';
import { createDomainStudentFixture } from './domain-fixture.mjs';

const rate = { capacity: 100, refillPerSecond: 10 };

test('topic inventory and allocation both require complete selected reading bundles', { timeout: 30000 }, async (t) => {
  const f = await createBundleFixture({ section: 'READING', bundleCount: 1, splitSkills: true });
  t.after(() => f.close());
  const service = createTopicPracticeService({ examPool: f.examPool, identityService: f.identityService, createRate: rate });
  const root = (await service.catalog(f.principals.studentA)).groups.find((group) => group.taxonomyVersionId === f.bundleTaxonomy.taxonomyVersionId);
  assert.equal(root.eligibleCount, 2);
  assert.deepEqual(root.children.map((child) => child.eligibleCount), [0, 0], 'neither skill alone can select a complete bundle');
  const request = { taxonomyVersionId: root.taxonomyVersionId, topicIds: [root.children[0].id], questionCount: 1 };
  await assert.rejects(service.create(f.principals.studentA, randomUUID(), request), { code: 'INSUFFICIENT_ELIGIBLE_INVENTORY' });
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 0);
  const created = await service.create(f.principals.studentA, randomUUID(), { ...request,
    topicIds: root.children.map((child) => child.id), questionCount: 2 });
  assert.equal(created.status, 201);
  const members = (await f.pool.query('SELECT question_version_id FROM tsa.form_slots WHERE form_id=$1', [created.body.formId])).rows;
  assert.deepEqual(members.map((row) => row.question_version_id).sort(), f.bundles[0].questions.map((question) => question.versionId).sort());
});

test('topic receipt replay and body conflict precede exhausted budgets, and identical student requests do not collide', { timeout: 30000 }, async (t) => {
  const f = await createDomainStudentFixture(); t.after(() => f.close());
  const service = createTopicPracticeService({ examPool: f.examPool, identityService: f.identityService,
    createRate: { capacity: 1, refillPerSecond: 0.000001 } });
  const root = (await service.catalog(f.principals.studentA)).groups.find((group) => group.code === 'MATH');
  const request = { taxonomyVersionId: root.taxonomyVersionId, topicIds: [root.id], questionCount: 1 };
  const key = randomUUID();
  const first = await service.create(f.principals.studentA, key, request);
  assert.equal(first.status, 201);
  const replay = await service.create(f.principals.studentA, key, request);
  assert.equal(replay.body.attemptId, first.body.attemptId);
  await assert.rejects(service.create(f.principals.studentA, key, { ...request, questionCount: 2 }), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(service.create(f.principals.studentA, randomUUID(), request), { code: 'RATE_LIMITED' });
  const other = await service.create(f.principals.studentB, randomUUID(), request);
  assert.equal(other.status, 201); assert.notEqual(other.body.attemptId, first.body.attemptId);
  assert.notEqual(other.body.practiceProfile.blueprintVersionId, first.body.practiceProfile.blueprintVersionId);
});

test('topic catalog and shortage count canonical equivalence groups consistently', { timeout: 30000 }, async (t) => {
  const f = await createDomainStudentFixture(); t.after(() => f.close());
  const equivalence = await createEquivalenceService({ bankPool: f.bankPool, identityService: f.identityService });
  const revision = (await f.pool.query('SELECT eligibility_revision::text AS revision FROM tsa.bank_state WHERE id=1')).rows[0].revision;
  const pin = (q) => ({ versionId: q.versionId, contentHash: q.contentHash, expectedRevision: 3 });
  await equivalence.adjudicate(f.principals.reviewer, randomUUID(), { left: pin(f.questions[0]), right: pin(f.questions[1]),
    kind: 'EXACT', decision: 'CONFIRMED', expectedBankRevision: revision,
    reason: 'Synthetic canonical-equivalence inventory regression; not a human content attestation.' });
  const service = createTopicPracticeService({ examPool: f.examPool, identityService: f.identityService, createRate: rate });
  const root = (await service.catalog(f.principals.studentA)).groups.find((group) => group.code === 'MATH');
  assert.equal(root.eligibleCount, 3);
  await assert.rejects(service.create(f.principals.studentA, randomUUID(), {
    taxonomyVersionId: root.taxonomyVersionId, topicIds: [root.id], questionCount: 4,
  }), (error) => { assert.equal(error.code, 'INSUFFICIENT_ELIGIBLE_INVENTORY'); assert.equal(error.details.availableQuestionCount, root.eligibleCount); return true; });
});
