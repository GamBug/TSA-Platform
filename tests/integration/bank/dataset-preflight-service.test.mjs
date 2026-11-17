import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createReferenceHash } from '../../../packages/contracts/dist/internal.js';
import { before, after, test } from 'node:test';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { createDatasetPreflightService } from '../../../src/modules/bank/dataset-preflight-service.mjs';
import { createBankHarness, loginActor, bankRequest } from './harness.mjs';
import { ensureLocalTaxonomy, createPrivateTemplate } from '../../../src/local/seed.mjs';
import { privateQuestionFixture } from '../../../apps/practice-prototype/src/private-question-fixture.mjs';

let harness, service, author, reviewer, candidate, pin, draft;
const hash = `sha256:${'1'.repeat(64)}`;
async function create(browser, path, body) {
  const response = await bankRequest(harness, browser, path,
    { method: 'POST', body, key: randomUUID() });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}
async function principal(browser) {
  return harness.identity.authenticate(new Request(harness.origin, {
    headers: { cookie: browser.cookies.join('; ') },
  }));
}
async function snapshot() {
  const { rows } = await harness.database.pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.question_versions) AS versions,
    (SELECT count(*)::int FROM tsa.reviews) AS reviews,
    (SELECT count(*)::int FROM tsa.validation_runs) AS validations,
    (SELECT count(*)::int FROM tsa.idempotency_records) AS receipts,
    (SELECT eligibility_revision::text FROM tsa.bank_state WHERE id=1) AS revision,
    (SELECT jsonb_agg(jsonb_build_array(question_version_id,state,revision,approved_review_id)
                     ORDER BY question_version_id) FROM tsa.question_workflow) AS workflow,
    (SELECT jsonb_agg(jsonb_build_array(id,eligible_version_id) ORDER BY id) FROM tsa.questions) AS eligible`);
  return rows[0];
}
before(async () => {
  harness = await createBankHarness();
  await ensureLocalTaxonomy(harness.database.pool);
  author = await loginActor(harness, 'author');
  reviewer = await loginActor(harness, 'reviewer');
  candidate = await loginActor(harness, 'studentA');
  const manager = await loginActor(harness, 'bankManager');
  const { sourceId } = await create(author, '/api/v1/sources',
    { title: 'Synthetic preflight test only', canonicalUri: null, origin: 'EXTERNAL' });
  const { sourceVersionId } = await create(author, `/api/v1/sources/${sourceId}/versions`,
    { contentHash: hash, evidenceUri: 'manual://synthetic-preflight', metadata: {} });
  const { decisionId } = await create(manager, `/api/v1/source-versions/${sourceVersionId}/rights`, {
    status: 'UNKNOWN', allowedUses: ['GENERATE'], territory: ['LOCAL_SYNTHETIC_ONLY'],
    validFrom: '2026-10-19T00:00:00Z', validTo: null, evidence: 'Synthetic fixture, no lawful publication claim.', expectedRevision: 0,
  });
  const template = createPrivateTemplate({ sourceVersionId, decisionId });
  draft = {
    schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH',
    taxonomyVersionId: template.taxonomyVersionId, domainId: template.domainId,
    skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
    content: privateQuestionFixture.content, interaction: privateQuestionFixture.interaction,
    answerKey: privateQuestionFixture.private.answerKey, explanation: privateQuestionFixture.private.explanation,
    stimulusVersionId: null, evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
  };
  const result = await create(author, '/api/v1/questions', draft);
  pin = { versionId: result.versionId, contentHash: result.contentHash };
  service = await createDatasetPreflightService({ bankPool: harness.bankPool, identityService: harness.identity });
});
after(async () => { await harness?.close(); });

test('real PG retained graph produces deterministic exact-hash private packet without Bank mutations', async () => {
  const before = await snapshot();
  const a = await service.preflight(await principal(author), { versions: [pin] });
  const b = await service.preflight(await principal(reviewer), { versions: [pin] });
  assert.deepEqual(a, b);
  assert.equal(a.databaseSnapshot.versions[0].state, 'DRAFT');
  assert.equal(a.databaseSnapshot.scope, 'CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION');
  const serialized = JSON.stringify(a);
  assert.ok(serialized.includes(pin.contentHash));
  for (const secret of ['answerKey', 'Subtract 2', 'What is x', 'canonicalUri', 'manual://synthetic-preflight']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.deepEqual(await snapshot(), before);
});

test('candidate, forged staff principal, and anonymous access fail before graph reads', async () => {
  for (const actor of [await principal(candidate), { authenticated: true, userId: randomUUID(), roles: ['AUTHOR'] }]) {
    await assert.rejects(service.preflight(actor, { versions: [pin] }), { status: 403, code: 'FORBIDDEN' });
  }
  await assert.rejects(service.preflight(null, { versions: [pin] }), { status: 401, code: 'UNAUTHENTICATED' });
});

test('invalid, duplicate, unknown and stale pins fail closed without side effects', async () => {
  const actor = await principal(author);
  const before = await snapshot();
  for (const input of [{ versions: [] }, { versions: [pin, pin] }, { versions: [pin], approve: true },
    { versions: [{ ...pin, approve: true }] }, { versions: Array(101).fill(pin) }]) {
    await assert.rejects(service.preflight(actor, input), { status: 422, code: 'VALIDATION_ERROR' });
  }
  await assert.rejects(service.preflight(actor, { versions: [{ ...pin, versionId: randomUUID() }] }),
    { status: 404, code: 'NOT_FOUND' });
  await assert.rejects(service.preflight(actor, { versions: [{ ...pin, contentHash: hash }] }),
    { status: 409, code: 'CONTENT_HASH_MISMATCH' });
  assert.deepEqual(await snapshot(), before);
});

test('PostgreSQL enforces repeatable-read READ ONLY and prevents accidental writes', async () => {
  const observed = [];
  const pool = {
    query: (...args) => harness.bankPool.query(...args),
    async connect() {
      const client = await harness.bankPool.connect();
      return {
        release: (...args) => client.release(...args),
        async query(sql, values) {
          if (sql.startsWith('SELECT eligibility_revision')) {
            const { rows } = await client.query(`SELECT current_setting('transaction_read_only') AS read_only,
              current_setting('transaction_isolation') AS isolation`);
            observed.push(rows[0]);
            // Real SQLSTATE25006 from the diagnostic transaction itself.
            await client.query('UPDATE tsa.bank_state SET eligibility_revision=eligibility_revision+1 WHERE id=1');
          }
          return client.query(sql, values);
        },
      };
    },
  };
  const diagnostic = await createDatasetPreflightService({ bankPool: pool, identityService: harness.identity });
  const before = await snapshot();
  await assert.rejects(diagnostic.preflight(await principal(author), { versions: [pin] }), { code: '25006' });
  assert.deepEqual(observed, [{ read_only: 'on', isolation: 'repeatable read' }]);
  assert.deepEqual(await snapshot(), before);
  await service.preflight(await principal(author), { versions: [pin] });
});

test('new draft versions do not substitute for an exact pinned historical review packet', async () => {
  const actor = await principal(author);
  const original = await service.preflight(actor, { versions: [pin] });
  const questionId = (await harness.database.pool.query('SELECT question_id FROM tsa.question_versions WHERE id=$1', [pin.versionId])).rows[0].question_id;
  const revision = await create(author, `/api/v1/questions/${questionId}/versions`,
    { parentVersionId: pin.versionId, draft: { ...draft, content: [{ type: 'text', text: 'Synthetic revised prompt.' }] } });
  assert.notEqual(revision.contentHash, pin.contentHash);
  assert.deepEqual(await service.preflight(actor, { versions: [pin] }), original);
  await assert.rejects(service.preflight(actor, { versions: [{ versionId: revision.versionId, contentHash: pin.contentHash }] }),
    { code: 'CONTENT_HASH_MISMATCH' });
});


test('one PostgreSQL snapshot survives a concurrent workflow and bank revision change', async () => {
  const baseline = await service.preflight(await principal(author), { versions: [pin] });
  let changed = false;
  const pool = {
    query: (...args) => harness.bankPool.query(...args),
    async connect() {
      const client = await harness.bankPool.connect();
      return {
        release: (...args) => client.release(...args),
        async query(sql, values) {
          if (!changed && sql.includes('SELECT qv.id, qv.question_id')) {
            changed = true;
            await withTransaction(harness.database.pool, async (writer) => {
              await writer.query("UPDATE tsa.question_workflow SET state='QUARANTINED', revision=revision+1 WHERE question_version_id=$1", [pin.versionId]);
              await writer.query('UPDATE tsa.bank_state SET eligibility_revision=eligibility_revision+1 WHERE id=1');
            });
          }
          return client.query(sql, values);
        },
      };
    },
  };
  try {
    const diagnostic = await createDatasetPreflightService({ bankPool: pool, identityService: harness.identity });
    const report = await diagnostic.preflight(await principal(author), { versions: [pin] });
    assert.ok(changed, 'separate writer committed after the snapshot revision read');
    assert.deepEqual(report, baseline, 'one report never mixes old bank revision and new workflow');
    const fresh = await service.preflight(await principal(author), { versions: [pin] });
    assert.equal(fresh.databaseSnapshot.versions[0].state, 'QUARANTINED');
    assert.equal(BigInt(fresh.databaseSnapshot.eligibilityRevision), BigInt(baseline.databaseSnapshot.eligibilityRevision) + 1n);
    assert.deepEqual(fresh.manifest, baseline.manifest, 'workflow updates do not change immutable manifest');
    assert.equal(fresh.report.publishing, false);
  } finally {
    await harness.database.pool.query("UPDATE tsa.question_workflow SET state='DRAFT' WHERE question_version_id=$1", [pin.versionId]);
  }
});


test('aggregate byte budget aborts before fetching later pins', async () => {
  // Driver fixture exercises the adapter budget without persisting large data.
  // Graph hashes are valid; publication and content validation are never reached.
  const source = { kind: 'source', id: 'large-synthetic-source',
    payload: { text: 'x'.repeat(6 * 1024 * 1024) }, references: [] };
  source.contentHash = createReferenceHash(source);
  const extraPins = [pin, ...Array.from({ length: 3 }, () => ({ versionId: randomUUID(), contentHash: hash }))]
    .sort((a, b) => a.versionId < b.versionId ? -1 : 1);
  const queried = [];
  const pool = {
    query: (...args) => harness.bankPool.query(...args),
    async connect() {
      const client = await harness.bankPool.connect();
      let current;
      return {
        release: (...args) => client.release(...args),
        async query(sql, values) {
          if (sql.includes('SELECT qv.id, qv.question_id')) {
            current = extraPins.find((entry) => entry.versionId === values[0]);
            queried.push(current.versionId);
            return { rowCount: 1, rows: [{ id: current.versionId, question_id: pin.versionId,
              content_hash: current.contentHash, reference_namespace: 'synthetic-budget',
              state: 'DRAFT', revision: '1', open_duplicate_flags: 0 }] };
          }
          if (sql.includes('FROM tsa_private.reference_nodes')) {
            const root = { kind: 'question', id: current.versionId,
              payload: { id: current.versionId, questionId: pin.versionId },
              references: [{ kind: source.kind, id: source.id }] };
            root.contentHash = createReferenceHash({ ...root,
              references: [{ kind: source.kind, id: source.id, contentHash: source.contentHash }] });
            const node = values[1] === 'question' ? root : source;
            return { rowCount: 1, rows: [{ ...node, dependency_refs: node.references, content_hash: node.contentHash }] };
          }
          return client.query(sql, values);
        },
      };
    },
  };
  const diagnostic = await createDatasetPreflightService({ bankPool: pool, identityService: harness.identity });
  await assert.rejects(diagnostic.preflight(await principal(author), { versions: extraPins }),
    { status: 422, code: 'PREFLIGHT_BYTE_LIMIT' });
  assert.deepEqual(queried, extraPins.slice(0, 3).map((entry) => entry.versionId));
});
