import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { startDisposablePostgres } from '../database/foundation/postgres.mjs';
import { bankRequest, createBankHarness, loginActor } from './harness.mjs';

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));

let harness;
let author;
let manager;
let reviewer;
let candidate;
let examManager;
let authorReviewer;
let taxonomy;

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function seedTaxonomy() {
  const taxonomyVersionId = randomUUID();
  const domainId = randomUUID();
  const skillId = randomUUID();
  await withTransaction(harness.database.pool, async (client) => {
    await client.query(
      `INSERT INTO tsa.taxonomy_versions (id, name, version_no, definition_hash)
       VALUES ($1, $2, 1, $3)`, [taxonomyVersionId, `bank-test-${taxonomyVersionId}`, sha256('taxonomy-v1')]);
    await client.query(
      `INSERT INTO tsa.taxonomy_nodes (id, taxonomy_version_id, code, kind, parent_id, metadata)
       VALUES ($1, $2, 'MATH', 'DOMAIN', NULL, '{}'::jsonb)`, [domainId, taxonomyVersionId]);
    await client.query(
      `INSERT INTO tsa.taxonomy_nodes (id, taxonomy_version_id, code, kind, parent_id, metadata)
       VALUES ($1, $2, 'ALGEBRA', 'SKILL', $3, '{}'::jsonb)`, [skillId, taxonomyVersionId, domainId]);
  });
  return { taxonomyVersionId, domainId, skillId };
}

async function assertError(response, status, code) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'details', 'message', 'requestId']);
  assert.equal(body.error.code, code);
  assert.deepEqual(body.error.details, {});
  assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  assert.equal(typeof body.error.message, 'string');
  assert.ok(body.error.message.length > 0);
  return body.error;
}

async function assertSuccess(response, status, fields) {
  assert.equal(response.status, status, JSON.stringify(await response.clone().json()));
  assert.ok(response.headers.get('x-request-id'));
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), [...fields].sort());
  assert.equal(Object.hasOwn(body, 'requestId'), false);
  return body;
}

async function registerSource(title = 'Synthetic manual source') {
  const sourceResponse = await bankRequest(harness, author, '/api/v1/sources', {
    method: 'POST', key: `source-${randomUUID()}`,
    body: { title, canonicalUri: null, origin: 'OWNED' },
  });
  const { sourceId } = await assertSuccess(sourceResponse, 201, ['sourceId']);
  const versionResponse = await bankRequest(harness, author, `/api/v1/sources/${sourceId}/versions`, {
    method: 'POST', key: `source-version-${randomUUID()}`,
    body: { contentHash: sha256(`source:${sourceId}`), evidenceUri: 'manual://test-record', metadata: { note: 'synthetic test record' } },
  });
  const { sourceVersionId } = await assertSuccess(versionResponse, 201, ['sourceVersionId']);
  const rightsResponse = await registerRights(sourceVersionId, manager, 0, 'OWNED');
  const rights = await assertSuccess(rightsResponse, 201, ['decisionId', 'revision']);
  assert.equal(rights.revision, 1);
  return { sourceId, sourceVersionId, decisionId: rights.decisionId };
}

function rightsBody(expectedRevision, status = 'OWNED') {
  return {
    status,
    allowedUses: ['DISPLAY', 'GENERATE'],
    territory: ['VN'],
    validFrom: '2026-10-19T00:00:00+07:00',
    validTo: null,
    evidence: 'Synthetic test record; this is not a rights clearance claim.',
    expectedRevision,
  };
}

async function registerRights(sourceVersionId, browser, expectedRevision, status = 'OWNED') {
  return bankRequest(harness, browser, `/api/v1/source-versions/${sourceVersionId}/rights`, {
    method: 'POST', key: `rights-${randomUUID()}`, body: rightsBody(expectedRevision, status),
  });
}

function questionDraft(source, options = {}) {
  const content = [{ type: 'text', text: options.text ?? 'A synthetic question for contract testing.' }];
  if (options.assetId) content.push({ type: 'image', assetVersionId: options.assetId, alt: 'Synthetic test asset' });
  let interaction;
  let answerKey;
  if (options.interactionType === 'MULTIPLE_CHOICE') {
    interaction = {
      type: 'MULTIPLE_CHOICE',
      options: [
        { id: 'a', content: [{ type: 'text', text: 'First option' }] },
        { id: 'b', content: [{ type: 'text', text: 'Second option' }] },
        { id: 'c', content: [{ type: 'text', text: 'Third option' }] },
      ],
      minSelections: 1,
      maxSelections: 2,
    };
    answerKey = { type: 'MULTIPLE_CHOICE', optionIds: ['b', 'c'] };
  } else if (options.interactionType === 'TRUE_FALSE_GROUP') {
    interaction = {
      type: 'TRUE_FALSE_GROUP',
      statements: [
        { id: 's1', content: [{ type: 'text', text: 'First statement' }] },
        { id: 's2', content: [{ type: 'text', text: 'Second statement' }] },
      ],
    };
    answerKey = { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false } };
  } else {
    interaction = {
      type: 'SINGLE_CHOICE',
      options: [
        { id: 'a', content: [{ type: 'text', text: 'First option' }] },
        { id: 'b', content: [{ type: 'text', text: 'Second option' }] },
      ],
    };
    answerKey = { type: 'SINGLE_CHOICE', optionId: 'b' };
  }
  return {
    schemaVersion: 'question/1',
    language: 'vi-VN',
    section: 'MATH',
    taxonomyVersionId: taxonomy.taxonomyVersionId,
    domainId: taxonomy.domainId,
    skillIds: [taxonomy.skillId],
    subskillIds: [],
    cognitiveLevel: null,
    targetDifficulty: 'EASY',
    content,
    stimulusVersionId: options.stimulusVersionId ?? null,
    interaction,
    answerKey,
    explanation: [{ type: 'text', text: 'Synthetic private explanation.' }],
    evidenceRefs: [source.decisionId],
    origin: options.origin ?? 'MANUAL',
    provenance: [{ sourceVersionId: source.sourceVersionId, span: null, transformation: 'original manual entry' }],
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function holdBankLock(lockSql, values) {
  const acquired = deferred();
  const release = deferred();
  const done = withTransaction(harness.bankPool, async (client) => {
    await client.query(lockSql, values);
    acquired.resolve();
    await release.promise;
  }, { role: 'tsa_bank' });
  await acquired.promise;
  return { release: () => release.resolve(), done };
}

async function waitForBlockedBankQueries(pattern, expectedCount) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await harness.database.pool.query(
      `SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE application_name = 'tsa-bank-api-test'
          AND wait_event_type = 'Lock'
          AND (query ILIKE $1 OR query ILIKE '%1414742321%')`, [pattern]);
    if (result.rows[0].count >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${expectedCount} blocked bank queries matching ${pattern}`);
}

async function seedLegacyStimulusWithoutReference() {
  const stimulusId = randomUUID();
  const stimulusVersionId = randomUUID();
  await withTransaction(harness.database.pool, async (client) => {
    await client.query('INSERT INTO tsa.stimuli (id) VALUES ($1)', [stimulusId]);
    await client.query(
      `INSERT INTO tsa.stimulus_versions (id, stimulus_id, version_no, content, content_hash)
       VALUES ($1, $2, 1, $3::jsonb, $4)`,
      [stimulusVersionId, stimulusId, JSON.stringify([{ type: 'text', text: 'Legacy fixture stimulus' }]), sha256(stimulusId)]);
  });
  return stimulusVersionId;
}

before(async () => {
  harness = await createBankHarness();
  [author, manager, reviewer, candidate, examManager, authorReviewer] = await Promise.all([
    loginActor(harness, 'author'),
    loginActor(harness, 'bankManager'),
    loginActor(harness, 'reviewer'),
    loginActor(harness, 'studentA'),
    loginActor(harness, 'examManager'),
    loginActor(harness, 'authorReviewer'),
  ]);
  taxonomy = await seedTaxonomy();
});

after(async () => {
  if (harness) await harness.close();
});

test('staff HTTP uses versioned routes, exact success and error envelopes, and strict bounds', async () => {
  const source = await registerSource();
  assert.ok(source.sourceId);

  const barePath = await bankRequest(harness, author, '/sources', {
    method: 'POST', key: `bare-${randomUUID()}`,
    body: { title: 'Must not route', canonicalUri: null, origin: 'OWNED' },
  });
  await assertError(barePath, 404, 'NOT_FOUND');

  const unknownQuery = await bankRequest(harness, author, '/api/v1/sources', {
    method: 'POST', query: 'debug=true', key: `query-${randomUUID()}`,
    body: { title: 'Must not route', canonicalUri: null, origin: 'OWNED' },
  });
  await assertError(unknownQuery, 422, 'VALIDATION_ERROR');

  const unknownField = await bankRequest(harness, author, '/api/v1/sources', {
    method: 'POST', key: `unknown-${randomUUID()}`,
    body: { title: 'Rejected source', canonicalUri: null, origin: 'OWNED', createdBy: 'forged' },
  });
  await assertError(unknownField, 422, 'VALIDATION_ERROR');

  const malformed = await bankRequest(harness, author, '/api/v1/sources', {
    method: 'POST', key: `malformed-${randomUUID()}`, rawBody: '{',
  });
  await assertError(malformed, 400, 'MALFORMED_JSON');

  const missingKey = await bankRequest(harness, author, '/api/v1/sources', {
    method: 'POST', body: { title: 'Missing idempotency key', canonicalUri: null, origin: 'OWNED' },
  });
  await assertError(missingKey, 422, 'VALIDATION_ERROR');

  const largeQuestion = questionDraft(source);
  largeQuestion.content = Array.from({ length: 15 }, (_, index) => ({
    type: 'text', text: `${index}${'x'.repeat(19_999)}`,
  }));
  const overQuestionLimit = await bankRequest(harness, author, '/api/v1/questions', {
    method: 'POST', key: `large-question-${randomUUID()}`, body: largeQuestion,
  });
  await assertError(overQuestionLimit, 422, 'VALIDATION_ERROR');

  const tooLarge = await bankRequest(harness, author, '/api/v1/sources', {
    method: 'POST', key: `too-large-${randomUUID()}`,
    rawBody: JSON.stringify({ title: 'x'.repeat(1024 * 1024 + 20), canonicalUri: null, origin: 'OWNED' }),
  });
  await assertError(tooLarge, 413, 'PAYLOAD_TOO_LARGE');

  const malformedSourceVersion = await bankRequest(harness, author, '/api/v1/sources/deadbeef/versions', {
    method: 'POST', key: `bad-source-id-${randomUUID()}`,
    body: { contentHash: sha256('unused'), evidenceUri: 'manual://unused', metadata: {} },
  });
  await assertError(malformedSourceVersion, 404, 'NOT_FOUND');
  const malformedRightsId = await bankRequest(harness, manager, '/api/v1/source-versions/deadbeef/rights', {
    method: 'POST', key: `bad-rights-id-${randomUUID()}`, body: rightsBody(0),
  });
  await assertError(malformedRightsId, 404, 'NOT_FOUND');

  const examManagerRead = await bankRequest(harness, examManager, '/api/v1/questions');
  await assertError(examManagerRead, 403, 'FORBIDDEN');
  const candidateRead = await bankRequest(harness, candidate, '/api/v1/questions');
  await assertError(candidateRead, 403, 'FORBIDDEN');
  const candidateWrite = await bankRequest(harness, candidate, '/api/v1/sources', {
    method: 'POST', key: `candidate-write-${randomUUID()}`,
    body: { title: 'Denied candidate source', canonicalUri: null, origin: 'OWNED' },
  });
  await assertError(candidateWrite, 403, 'FORBIDDEN');
});

test('source, rights, and question operations enforce staff roles and idempotent receipts', async () => {
  const managerCreate = await bankRequest(harness, manager, '/api/v1/sources', {
    method: 'POST', key: `manager-create-${randomUUID()}`,
    body: { title: 'Not allowed', canonicalUri: null, origin: 'OWNED' },
  });
  await assertError(managerCreate, 403, 'FORBIDDEN');

  const sourceCreate = await bankRequest(harness, author, '/api/v1/sources', {
    method: 'POST', key: `source-replay-${randomUUID()}`,
    body: { title: 'Manual source for rights checks', canonicalUri: null, origin: 'OWNED' },
  });
  const { sourceId } = await assertSuccess(sourceCreate, 201, ['sourceId']);
  const versionCreate = await bankRequest(harness, author, `/api/v1/sources/${sourceId}/versions`, {
    method: 'POST', key: `source-version-${randomUUID()}`,
    body: { contentHash: sha256(sourceId), evidenceUri: 'manual://test', metadata: { kind: 'synthetic' } },
  });
  const { sourceVersionId } = await assertSuccess(versionCreate, 201, ['sourceVersionId']);

  const authorRights = await registerRights(sourceVersionId, author, 0);
  await assertError(authorRights, 403, 'FORBIDDEN');
  const firstRights = await registerRights(sourceVersionId, manager, 0);
  const rights = await assertSuccess(firstRights, 201, ['decisionId', 'revision']);
  assert.equal(rights.revision, 1);

  const staleRights = await registerRights(sourceVersionId, manager, 0, 'UNKNOWN');
  await assertError(staleRights, 409, 'REVISION_CONFLICT');
  const savedRevision = await harness.database.pool.query(
    'SELECT revision FROM tsa.source_rights WHERE source_version_id = $1', [sourceVersionId]);
  assert.equal(Number(savedRevision.rows[0].revision), 1);

  const invalidDate = await bankRequest(harness, manager, `/api/v1/source-versions/${sourceVersionId}/rights`, {
    method: 'POST', key: `invalid-date-${randomUUID()}`,
    body: { ...rightsBody(1), validFrom: '2026-02-30T00:00:00Z' },
  });
  await assertError(invalidDate, 422, 'VALIDATION_ERROR');
  const worldwide = await bankRequest(harness, manager, `/api/v1/source-versions/${sourceVersionId}/rights`, {
    method: 'POST', key: `worldwide-${randomUUID()}`,
    body: {
      ...rightsBody(1), territory: ['Worldwide'],
      validFrom: '2026-10-19T00:00:00.000000Z', validTo: '2026-10-19T00:00:00.000001Z',
    },
  });
  const worldwideReceipt = await assertSuccess(worldwide, 201, ['decisionId', 'revision']);
  assert.equal(worldwideReceipt.revision, 2);

  const equalIntervalKey = `equal-interval-${randomUUID()}`;
  const equalInterval = await bankRequest(harness, manager, `/api/v1/source-versions/${sourceVersionId}/rights`, {
    method: 'POST', key: equalIntervalKey,
    body: {
      ...rightsBody(2), validFrom: '2026-10-19T00:00:00.000001Z',
      validTo: '2026-10-19T00:00:00.000001Z',
    },
  });
  await assertError(equalInterval, 422, 'VALIDATION_ERROR');
  const unchangedRights = await harness.database.pool.query(
    'SELECT revision FROM tsa.source_rights WHERE source_version_id = $1', [sourceVersionId]);
  assert.equal(Number(unchangedRights.rows[0].revision), 2);
  const rolledBackReceipt = await harness.database.pool.query(
    `SELECT count(*)::int AS count FROM tsa.idempotency_records
      WHERE actor_id = (SELECT id FROM tsa.users WHERE subject = 'bank-manager') AND idempotency_key = $1`,
    [equalIntervalKey]);
  assert.equal(rolledBackReceipt.rows[0].count, 0);

  const foreignSourceVersion = await bankRequest(harness, authorReviewer,
    `/api/v1/sources/${sourceId}/versions`, {
      method: 'POST', key: `foreign-source-version-${randomUUID()}`,
      body: { contentHash: sha256('foreign'), evidenceUri: 'manual://foreign', metadata: {} },
    });
  await assertError(foreignSourceVersion, 404, 'NOT_FOUND');

  const draft = questionDraft({ sourceVersionId, decisionId: worldwideReceipt.decisionId });
  const create = await bankRequest(harness, author, '/api/v1/questions', {
    method: 'POST', key: `question-${randomUUID()}`, body: draft,
  });
  const created = await assertSuccess(create, 201, ['questionId', 'versionId', 'state', 'contentHash']);
  assert.equal(created.state, 'DRAFT');
  assert.match(created.contentHash, /^sha256:[0-9a-f]{64}$/);

  const reviewerList = await bankRequest(harness, reviewer, '/api/v1/questions?section=MATH&limit=10');
  assert.equal(reviewerList.status, 200);
  const list = await reviewerList.json();
  assert.deepEqual(Object.keys(list).sort(), ['items', 'nextCursor']);
  assert.equal(list.items.length, 1);
  assert.deepEqual(Object.keys(list.items[0]).sort(), [
    'contentHash', 'interactionType', 'questionId', 'section', 'state', 'versionId',
  ]);
  assert.equal(list.items[0].state, 'DRAFT');
  assert.doesNotMatch(JSON.stringify(list), /answerKey|explanation|correctAnswer|private/i);

  const duplicateList = await bankRequest(harness, author, '/api/v1/questions?section=MATH&section=READING');
  await assertError(duplicateList, 422, 'VALIDATION_ERROR');
  const unknownListQuery = await bankRequest(harness, author, '/api/v1/questions?authorId=anything');
  await assertError(unknownListQuery, 422, 'VALIDATION_ERROR');

  const versionDraft = structuredClone(draft);
  versionDraft.content[0].text = 'A corrected immutable revision.';
  const revise = await bankRequest(harness, author, `/api/v1/questions/${created.questionId}/versions`, {
    method: 'POST', key: `revision-${randomUUID()}`,
    body: { parentVersionId: created.versionId, draft: versionDraft },
  });
  const revised = await assertSuccess(revise, 201, ['questionId', 'versionId', 'state', 'contentHash']);
  assert.equal(revised.questionId, created.questionId);
  assert.equal(revised.state, 'DRAFT');
  const versions = await harness.database.pool.query(
    `SELECT version_no, parent_version_id, content_hash
       FROM tsa.question_versions WHERE question_id = $1 ORDER BY version_no`, [created.questionId]);
  assert.deepEqual(versions.rows.map((row) => Number(row.version_no)), [1, 2]);
  assert.equal(versions.rows[1].parent_version_id, created.versionId);

  const importedDraft = questionDraft({ sourceVersionId, decisionId: worldwideReceipt.decisionId }, {
    origin: 'IMPORTED', interactionType: 'MULTIPLE_CHOICE', text: 'Imported multiple choice',
  });
  const imported = await bankRequest(harness, author, '/api/v1/questions', {
    method: 'POST', key: `imported-${randomUUID()}`, body: importedDraft,
  });
  const importedCreated = await assertSuccess(imported, 201, ['questionId', 'versionId', 'state', 'contentHash']);
  const importedStored = await harness.database.pool.query(
    'SELECT origin::text AS origin, interaction->>\'type\' AS type FROM tsa.question_versions WHERE id = $1',
    [importedCreated.versionId]);
  assert.deepEqual(importedStored.rows[0], { origin: 'IMPORTED', type: 'MULTIPLE_CHOICE' });

  const trueFalseDraft = questionDraft({ sourceVersionId, decisionId: worldwideReceipt.decisionId }, {
    interactionType: 'TRUE_FALSE_GROUP', text: 'True false group interaction',
  });
  const trueFalse = await bankRequest(harness, author, '/api/v1/questions', {
    method: 'POST', key: `true-false-${randomUUID()}`, body: trueFalseDraft,
  });
  const trueFalseCreated = await assertSuccess(trueFalse, 201, ['questionId', 'versionId', 'state', 'contentHash']);
  const trueFalseStored = await harness.database.pool.query(
    'SELECT interaction->>\'type\' AS type FROM tsa.question_versions WHERE id = $1', [trueFalseCreated.versionId]);
  assert.equal(trueFalseStored.rows[0].type, 'TRUE_FALSE_GROUP');

  const legacyStimulusId = await seedLegacyStimulusWithoutReference();
  const unsupportedStimulus = await bankRequest(harness, author, '/api/v1/questions', {
    method: 'POST', key: `legacy-stimulus-${randomUUID()}`,
    body: questionDraft({ sourceVersionId, decisionId: worldwideReceipt.decisionId }, { stimulusVersionId: legacyStimulusId }),
  });
  await assertError(unsupportedStimulus, 422, 'VALIDATION_ERROR');
  const legacyStimulusPersisted = await harness.database.pool.query(
    'SELECT count(*)::int AS count FROM tsa.question_versions WHERE stimulus_version_id = $1', [legacyStimulusId]);
  assert.equal(legacyStimulusPersisted.rows[0].count, 0);

  const unknownEvidenceDraft = structuredClone(draft);
  unknownEvidenceDraft.evidenceRefs.push(randomUUID());
  const unknownEvidence = await bankRequest(harness, author, '/api/v1/questions', {
    method: 'POST', key: `unknown-evidence-${randomUUID()}`, body: unknownEvidenceDraft,
  });
  await assertError(unknownEvidence, 422, 'VALIDATION_ERROR');
  const unknownTaxonomyId = randomUUID();
  const invalidTaxonomyDraft = structuredClone(draft);
  invalidTaxonomyDraft.skillIds = [unknownTaxonomyId];
  const invalidTaxonomy = await bankRequest(harness, author, '/api/v1/questions', {
    method: 'POST', key: `unknown-taxonomy-${randomUUID()}`, body: invalidTaxonomyDraft,
  });
  await assertError(invalidTaxonomy, 422, 'VALIDATION_ERROR');
});

test('concurrent identical draft POSTs create one immutable version and receipt', async () => {
  const source = await registerSource('Concurrent idempotency source');
  const draft = questionDraft(source, { text: `Concurrent draft ${randomUUID()}` });
  const key = `concurrent-${randomUUID()}`;
  const actorId = (await harness.database.pool.query("SELECT id FROM tsa.users WHERE subject = 'author'")).rows[0].id;
  const held = await holdBankLock(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [JSON.stringify([actorId, 'POST /api/v1/questions', key])]);
  const responses = [
    bankRequest(harness, author, '/api/v1/questions', { method: 'POST', key, body: draft }),
    bankRequest(harness, author, '/api/v1/questions', { method: 'POST', key, body: draft }),
  ];
  try {
    await waitForBlockedBankQueries('%pg_advisory_xact_lock%', 2);
  } finally {
    held.release();
  }
  await held.done;
  const [firstResponse, secondResponse] = await Promise.all(responses);
  const first = await assertSuccess(firstResponse, 201, ['questionId', 'versionId', 'state', 'contentHash']);
  const second = await assertSuccess(secondResponse, 201, ['questionId', 'versionId', 'state', 'contentHash']);
  assert.deepEqual(second, first);
  const stored = await harness.database.pool.query(
    'SELECT count(*)::int AS versions FROM tsa.question_versions WHERE question_id = $1', [first.questionId]);
  assert.equal(stored.rows[0].versions, 1);
  const receipt = await harness.database.pool.query(
    `SELECT count(*)::int AS receipts FROM tsa.idempotency_records
      WHERE actor_id = (SELECT id FROM tsa.users WHERE subject = 'author')
        AND route_scope = 'POST /api/v1/questions' AND idempotency_key = $1`, [key]);
  assert.equal(receipt.rows[0].receipts, 1);
});

test('target-scoped idempotency and changed-body conflict are enforced', async () => {
  const sourceOne = await registerSource('Idempotency target one');
  const sourceTwo = await registerSource('Idempotency target two');
  const key = `same-key-different-target-${randomUUID()}`;
  const body = { contentHash: sha256('same-version-body'), evidenceUri: 'manual://same', metadata: { record: 'same' } };
  const first = await bankRequest(harness, author, `/api/v1/sources/${sourceOne.sourceId}/versions`, {
    method: 'POST', key, body,
  });
  const firstValue = await assertSuccess(first, 201, ['sourceVersionId']);
  const second = await bankRequest(harness, author, `/api/v1/sources/${sourceTwo.sourceId}/versions`, {
    method: 'POST', key, body,
  });
  const secondValue = await assertSuccess(second, 201, ['sourceVersionId']);
  assert.notEqual(firstValue.sourceVersionId, secondValue.sourceVersionId);
  const ownership = await harness.database.pool.query(
    `SELECT source_id FROM tsa.source_versions WHERE id = ANY($1::uuid[]) ORDER BY source_id`,
    [[firstValue.sourceVersionId, secondValue.sourceVersionId]]);
  assert.deepEqual(ownership.rows.map((row) => row.source_id).sort(), [sourceOne.sourceId, sourceTwo.sourceId].sort());

  const reusedKey = `same-target-changed-body-${randomUUID()}`;
  const firstUse = await bankRequest(harness, author, `/api/v1/sources/${sourceOne.sourceId}/versions`, {
    method: 'POST', key: reusedKey, body,
  });
  await assertSuccess(firstUse, 201, ['sourceVersionId']);
  const changedUse = await bankRequest(harness, author, `/api/v1/sources/${sourceOne.sourceId}/versions`, {
    method: 'POST', key: reusedKey, body: { ...body, evidenceUri: 'manual://changed' },
  });
  await assertError(changedUse, 409, 'IDEMPOTENCY_CONFLICT');
});

test('rights revisions serialize on the bank guard and recheck the expected revision', async () => {
  const source = await registerSource('Rights revision race');
  const held = await holdBankLock('SELECT id FROM tsa.bank_state WHERE id = 1 FOR UPDATE', []);
  const firstRequest = registerRights(source.sourceVersionId, manager, 1, 'LICENSED');
  const secondRequest = registerRights(source.sourceVersionId, manager, 1, 'OPEN_LICENSE');
  try {
    await waitForBlockedBankQueries('%bank_state%FOR UPDATE%', 2);
  } finally {
    held.release();
  }
  await held.done;
  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  const responses = [first, second];
  const statuses = responses.map((response) => response.status).sort((left, right) => left - right);
  assert.deepEqual(statuses, [201, 409]);
  const rejected = responses.find((response) => response.status === 409);
  await assertError(rejected, 409, 'REVISION_CONFLICT');
  const current = await harness.database.pool.query(
    'SELECT revision FROM tsa.source_rights WHERE source_version_id = $1', [source.sourceVersionId]);
  assert.equal(Number(current.rows[0].revision), 2);
});

test('simultaneous same-fingerprint drafts create open duplicate flags without merging questions', async () => {
  const source = await registerSource('Fingerprint race source');
  const text = `Concurrent fingerprint ${randomUUID()}`;
  const seed = await bankRequest(harness, author, '/api/v1/questions', {
    method: 'POST', key: `fingerprint-seed-${randomUUID()}`, body: questionDraft(source, { text }),
  });
  const seedValue = await assertSuccess(seed, 201, ['questionId', 'versionId', 'state', 'contentHash']);
  const storedFingerprint = await harness.database.pool.query(
    'SELECT normalized_fingerprint FROM tsa.question_versions WHERE id = $1', [seedValue.versionId]);
  const guard = await holdBankLock('SELECT id FROM tsa.bank_state WHERE id = 1 FOR UPDATE', []);
  const body = questionDraft(source, { text });
  const requests = [
    bankRequest(harness, author, '/api/v1/questions', { method: 'POST', key: `fingerprint-a-${randomUUID()}`, body }),
    bankRequest(harness, author, '/api/v1/questions', { method: 'POST', key: `fingerprint-b-${randomUUID()}`, body }),
  ];
  try {
    await waitForBlockedBankQueries('%bank_state%FOR UPDATE%', 2);
  } finally {
    guard.release();
  }
  await guard.done;
  const values = await Promise.all(requests.map(async (request) =>
    assertSuccess(await request, 201, ['questionId', 'versionId', 'state', 'contentHash'])));
  assert.notEqual(values[0].questionId, values[1].questionId);
  assert.equal(values[0].state, 'DRAFT');
  assert.equal(values[1].state, 'DRAFT');
  const allVersions = [seedValue.versionId, ...values.map((value) => value.versionId)];
  const relations = await harness.database.pool.query(
    `SELECT count(*)::int AS count FROM tsa.duplicate_relations
      WHERE left_version_id = ANY($1::uuid[]) AND right_version_id = ANY($1::uuid[])`, [allVersions]);
  assert.equal(relations.rows[0].count, 3);
  const groups = await harness.database.pool.query(
    `SELECT count(*)::int AS count FROM tsa.duplicate_group_members
      WHERE question_id = ANY($1::uuid[])`, [[seedValue.questionId, ...values.map((value) => value.questionId)]]);
  assert.equal(groups.rows[0].count, 0);
  const revision = await harness.database.pool.query('SELECT eligibility_revision FROM tsa.bank_state WHERE id = 1');
  assert.ok(Number(revision.rows[0].eligibility_revision) >= 2);
  assert.match(storedFingerprint.rows[0].normalized_fingerprint, /^sha256:[0-9a-f]{64}$/);
});

test('metadata pagination retains PostgreSQL microseconds without skipping immutable versions', async () => {
  const source = await registerSource('Microsecond pagination source');
  const created = [];
  for (const text of [`Pagination first ${randomUUID()}`, `Pagination second ${randomUUID()}`]) {
    const response = await bankRequest(harness, author, '/api/v1/questions', {
      method: 'POST', key: `pagination-${randomUUID()}`, body: questionDraft(source, { text }),
    });
    created.push(await assertSuccess(response, 201, ['questionId', 'versionId', 'state', 'contentHash']));
  }

  const seen = new Set();
  let cursor = null;
  let firstCursorTimestamp;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const path = cursor
      ? `/api/v1/questions?section=MATH&state=DRAFT&limit=1&cursor=${encodeURIComponent(cursor)}`
      : '/api/v1/questions?section=MATH&state=DRAFT&limit=1';
    const response = await bankRequest(harness, author, path);
    assert.equal(response.status, 200);
    const page = await response.json();
    for (const item of page.items) seen.add(item.versionId);
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
    if (firstCursorTimestamp === undefined) {
      firstCursorTimestamp = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')).createdAt;
    }
  }
  assert.match(firstCursorTimestamp, /\.\d{6}Z$/);
  for (const item of created) assert.ok(seen.has(item.versionId), `missing ${item.versionId} across pages`);
});

test('rights withdrawal for an indirect eligible question asset dependency is durable and clears eligibility', async () => {
  const provenanceSource = await registerSource('Eligible question provenance source');
  const assetSource = await registerSource('Question image source');
  const assetId = randomUUID();
  await harness.database.pool.query(
    `INSERT INTO tsa.asset_versions
      (id, source_version_id, object_key, content_hash, mime, byte_size, security_class)
     VALUES ($1, $2, $3, $4, 'image/png', 32, 'QUESTION')`,
    [assetId, assetSource.sourceVersionId, `bank-test/${assetId}`, sha256('synthetic image bytes')]);

  const draft = questionDraft(provenanceSource, { assetId, text: `Indirect asset ${randomUUID()}` });
  const create = await bankRequest(harness, author, '/api/v1/questions', {
    method: 'POST', key: `asset-question-${randomUUID()}`, body: draft,
  });
  const question = await assertSuccess(create, 201, ['questionId', 'versionId', 'state', 'contentHash']);
  await harness.database.pool.query(
    'UPDATE tsa.questions SET eligible_version_id = $2 WHERE id = $1', [question.questionId, question.versionId]);

  const dependency = await harness.database.pool.query(
    'SELECT tsa.source_has_delivery_dependencies($1) AS depends', [assetSource.sourceVersionId]);
  assert.equal(dependency.rows[0].depends, true);

  const revisedRights = await registerRights(assetSource.sourceVersionId, manager, 1, 'REVOKED');
  assert.equal(revisedRights.status, 201);
  const savedRevision = await harness.database.pool.query(
    `SELECT sr.revision, rd.status::text AS status, q.eligible_version_id
       FROM tsa.source_rights sr JOIN tsa.rights_decisions rd ON rd.id = sr.decision_id
       JOIN tsa.questions q ON q.id=$2
      WHERE sr.source_version_id = $1`, [assetSource.sourceVersionId,question.questionId]);
  assert.equal(Number(savedRevision.rows[0].revision), 2);
  assert.equal(savedRevision.rows[0].status, 'REVOKED');
  assert.equal(savedRevision.rows[0].eligible_version_id, null);
});

test('Bank idempotency RLS cannot expose student attempt receipts', async () => {
  const actor = await harness.database.pool.query("SELECT id FROM tsa.users WHERE subject = 'student-a'");
  await harness.database.pool.query(
    `INSERT INTO tsa.idempotency_records
      (id, actor_id, route_scope, idempotency_key, request_hash, response_status, safe_response)
     VALUES ($1, $2, 'POST /api/v1/questions', $3, $4, 201, '{}'::jsonb)`,
    [randomUUID(), actor.rows[0].id, `student-${randomUUID()}`, sha256('student receipt')]);
  const visible = await withTransaction(harness.bankPool, async (client) => {
    await client.query("SELECT set_config('tsa.bank_actor_id', $1, true)", ['00000000-0000-4000-8000-000000000201']);
    return client.query(
      "SELECT count(*)::int AS rows FROM tsa.idempotency_records WHERE actor_id = $1",
      [actor.rows[0].id]);
  }, { role: 'tsa_bank' });
  assert.equal(visible.rows[0].rows, 0);
});

test('migration 004 preserves legacy sources and student/staff receipts from 003', async () => {
  const database = await startDisposablePostgres();
  const priorMigrationsDirectory = await mkdtemp(path.join(os.tmpdir(), 'tsa-bank-legacy-migrations-'));
  try {
    for (const migrationName of ['001_bank_core.sql', '002_exam_integrity.sql', '003_local_identity.sql']) {
      const contents = await readFile(path.join(MIGRATIONS_DIRECTORY, migrationName));
      await writeFile(path.join(priorMigrationsDirectory, migrationName), contents, { mode: 0o600 });
    }
    const prior = await migrate(database.pool, { directory: priorMigrationsDirectory });
    assert.deepEqual(prior.applied, ['001_bank_core.sql', '002_exam_integrity.sql', '003_local_identity.sql']);

    const authorId = randomUUID();
    const studentId = randomUUID();
    const sourceId = randomUUID();
    const sourceVersionId = randomUUID();
    const studentReceiptId = randomUUID();
    const staffReceiptId = randomUUID();
    const sourceHash = sha256('legacy source content hash');
    const studentKey = `legacy-student-${randomUUID()}`;
    const staffKey = `legacy-staff-${randomUUID()}`;
    const metadata = { preserved: 'before migration 004', lexical: ['first', 'second'] };
    await database.pool.query(
      `INSERT INTO tsa.users (id, issuer, subject, display_name)
       VALUES ($1, 'synthetic', 'legacy-author', 'Legacy Author'),
              ($2, 'synthetic', 'legacy-student', 'Legacy Student')`, [authorId, studentId]);
    await database.pool.query(
      `INSERT INTO tsa.sources (id, title, canonical_uri, owner_reference)
       VALUES ($1, 'Legacy source title', 'https://example.invalid/source', 'legacy-owner')`, [sourceId]);
    await database.pool.query(
      `INSERT INTO tsa.source_versions (id, source_id, version_no, content_hash, metadata, evidence_uri)
       VALUES ($1, $2, 1, $3, $4::jsonb, 'legacy://evidence')`,
      [sourceVersionId, sourceId, sourceHash, JSON.stringify(metadata)]);
    await database.pool.query(
      `INSERT INTO tsa.idempotency_records
        (id, actor_id, route_scope, idempotency_key, request_hash, response_status, safe_response)
       VALUES ($1, $2, 'POST /api/v1/attempts', $3, $4, 201, '{"attemptId":"legacy"}'::jsonb),
              ($5, $6, 'POST /api/v1/sources', $7, $8, 201, '{"sourceId":"legacy"}'::jsonb)`,
      [studentReceiptId, studentId, studentKey, sha256('student request'),
        staffReceiptId, authorId, staffKey, sha256('staff request')]);

    const latest = await migrate(database.pool, { directory: MIGRATIONS_DIRECTORY });
    assert.deepEqual(latest.applied, ['004_bank_ingestion.sql', '005_factory_package_v2_import.sql', '006_bank_review_workflow.sql', '007_bank_equivalence.sql', '008_bank_delivery_safety.sql', '009_assembly_stock.sql','010_atomic_allocation.sql','011_attempt_delivery.sql','012_answer_saves.sql','013_attempt_submission.sql','014_exam_grading.sql']);
    const preservedSource = await database.pool.query(
      `SELECT id, title, canonical_uri, owner_reference, origin, created_by
         FROM tsa.sources WHERE id = $1`, [sourceId]);
    assert.deepEqual(preservedSource.rows[0], {
      id: sourceId,
      title: 'Legacy source title',
      canonical_uri: 'https://example.invalid/source',
      owner_reference: 'legacy-owner',
      origin: null,
      created_by: null,
    });
    const preservedVersion = await database.pool.query(
      `SELECT id, source_id, version_no, content_hash, metadata, evidence_uri
         FROM tsa.source_versions WHERE id = $1`, [sourceVersionId]);
    assert.deepEqual(preservedVersion.rows[0], {
      id: sourceVersionId,
      source_id: sourceId,
      version_no: 1,
      content_hash: sourceHash,
      metadata,
      evidence_uri: 'legacy://evidence',
    });
    const receipts = await database.pool.query(
      `SELECT id, actor_id, route_scope, idempotency_key, request_hash, response_status, safe_response
         FROM tsa.idempotency_records WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[studentReceiptId, staffReceiptId]]);
    assert.equal(receipts.rowCount, 2);
    assert.deepEqual(new Set(receipts.rows.map((row) => row.id)), new Set([studentReceiptId, staffReceiptId]));
    assert.deepEqual(new Set(receipts.rows.map((row) => row.actor_id)), new Set([studentId, authorId]));
    await assert.rejects(
      database.pool.query('UPDATE tsa.source_versions SET evidence_uri = $2 WHERE id = $1', [sourceVersionId, 'changed']),
      (error) => error.code === '23514');
  } finally {
    await database.stop();
    await rm(priorMigrationsDirectory, { recursive: true, force: true });
  }
});
