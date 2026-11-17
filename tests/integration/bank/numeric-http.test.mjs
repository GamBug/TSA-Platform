import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPrototypeServer } from '../../../apps/practice-prototype/server.mjs';
import { StaffReviewContextSchema } from '../../../packages/contracts/dist/staff.js';
import { StaffReviewContextV2Schema } from '../../../packages/contracts/dist/staff-v2.js';
import { createBankHandler } from '../../../src/http/bank.mjs';
import { createLocalAuthHandler } from '../../../src/http/local-auth.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createLocalSyntheticIdentityService } from '../../../src/modules/identity/local-synthetic.mjs';
import { createManualImportFixture } from './manual-import-fixture.mjs';
import { bankRequest, loginActor } from './harness.mjs';

test('numeric staff HTTP stays opt-in and preserves private access, immutable revisions, and review gates', { timeout: 60_000 }, async () => {
  // This fixture backs up its disposable database before migrating or seeding it.
  const fixture = await createManualImportFixture();
  let server;
  try {
    let auth, activeBank;
    server = createPrototypeServer({ maxRequestBytes: 1024 * 1024, integratedRequestHandler: (request) =>
      new URL(request.url).pathname.startsWith('/local-auth/') ? auth(request) : activeBank(request) });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const env = { ...fixture.env, LOCAL_AUTH_TRUSTED_ORIGIN: origin };
    const identityService = await createLocalSyntheticIdentityService(fixture.authPool, { env });
    auth = await createLocalAuthHandler({ pool: fixture.authPool, env });
    const options = { bankPool: fixture.bankPool, identityService, trustedOrigin: origin, enableReviewContext: true };
    const legacy = await createBankHandler(options);
    const numeric = await createBankHandler({ ...options, enableNumericQuestions: true });
    activeBank = legacy;
    const harness = { origin };
    const [author, reviewer, manager, student, examManager] = await Promise.all(
      ['author', 'reviewer', 'bankManager', 'studentA', 'examManager'].map((key) => loginActor(harness, key)));
    const call = (actor, path, body) => bankRequest(harness, actor, path, body === undefined ? {} : {
      method: 'POST', key: randomUUID(), body,
    });
    const read = async (response, expected) => {
      assert.equal(response.status, expected, await response.clone().text());
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      return response.json();
    };
    const source = await read(await call(author, '/api/v1/sources', {
      title: 'Synthetic numeric staff source', canonicalUri: null, origin: 'OWNED',
    }), 201);
    const version = await read(await call(author, `/api/v1/sources/${source.sourceId}/versions`, {
      contentHash: jsonDigest({ source: source.sourceId }), evidenceUri: 'manual://numeric-staff-test', metadata: {},
    }), 201);
    const rights = await read(await call(manager, `/api/v1/source-versions/${version.sourceVersionId}/rights`, {
      status: 'OWNED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2020-01-01T00:00:00Z',
      validTo: null, evidence: 'Synthetic engineering fixture; not qualified human approval.', expectedRevision: 0,
    }), 201);
    const draft = () => ({ schemaVersion: 'question/2', language: 'vi-VN', section: 'READING',
      taxonomyVersionId: fixture.taxonomy.taxonomyVersionId,
      domainId: fixture.taxonomy.nodes.find((node) => node.kind === 'DOMAIN').id,
      skillIds: [fixture.taxonomy.nodes.find((node) => node.kind === 'SKILL').id], subskillIds: [],
      cognitiveLevel: 'M1', targetDifficulty: null, content: [{ type: 'text', text: `Tổng hợp ${randomUUID()}` }],
      stimulusVersionId: null, interaction: { type: 'NUMERIC_RESPONSE', label: 'Đáp án', format: 'DECIMAL' },
      answerKey: { type: 'NUMERIC_RESPONSE', value: '9007199254740993.00000000000000000001' },
      explanation: [{ type: 'text', text: 'Lời giải tổng hợp riêng.' }], evidenceRefs: [rights.decisionId], origin: 'MANUAL',
      provenance: [{ sourceVersionId: version.sourceVersionId, span: null, transformation: 'Synthetic original entry.' }],
    });
    await read(await call(author, '/api/v1/questions', draft()), 422);
    await read(await call(author, '/api/v2/questions', draft()), 404);
    activeBank = numeric;
    await read(await call(author, '/api/v1/questions', draft()), 422);
    await read(await call(author, '/api/v2/sources', {}), 404);
    await read(await call(author, '/api/v2/taxonomies'), 404);
    assert.equal((await call(author, '/api/v3/questions', draft())).status, 404);
    await read(await call(author, '/api/v2/questions', { ...draft(), schemaVersion: 'question/1' }), 422);
    await read(await call(author, '/api/v2/questions', { ...draft(), answerKey: { type: 'NUMERIC_RESPONSE', value: '+01,20' } }), 422);
    await read(await call(author, '/api/v2/questions', { ...draft(), answerKey: { type: 'SINGLE_CHOICE', optionId: 'a' } }), 422);
    const created = await read(await call(author, '/api/v2/questions', draft()), 201);
    const revised = await read(await call(author, `/api/v2/questions/${created.questionId}/versions`, {
      parentVersionId: created.versionId, draft: draft(),
    }), 201);
    assert.notEqual(revised.versionId, created.versionId);
    assert.notEqual(revised.contentHash, created.contentHash);
    const contextPath = (id, api = 'v2') => `/api/${api}/question-versions/${id}/review-context`;
    const parent = StaffReviewContextV2Schema.parse(await read(await call(author, contextPath(created.versionId)), 200));
    const context = StaffReviewContextV2Schema.parse(await read(await call(author, contextPath(revised.versionId)), 200));
    assert.equal(context.version.parentVersionId, created.versionId);
    assert.equal(parent.version.contentHash, created.contentHash);
    assert.equal(context.accessBasis, 'AUTHOR_OWN');
    assert.equal(context.preview.status, 'AVAILABLE');
    assert.equal(context.preview.question.interaction.type, 'NUMERIC_RESPONSE');
    assert.equal(context.preview.question.answerKey.value, '9007199254740993.00000000000000000001');
    assert.equal(context.preview.question.scoringPolicyVersion, 'practice-binary-v2');
    assert.equal(StaffReviewContextSchema.safeParse(context).success, false);
    const invalid = (change) => { const value = structuredClone(context); change(value); assert.equal(StaffReviewContextV2Schema.safeParse(value).success, false); };
    invalid((value) => { value.preview.question.answerKey.value = '01'; });
    invalid((value) => { value.preview.question.answerKey = { type: 'SINGLE_CHOICE', optionId: 'a' }; });
    invalid((value) => { value.preview.question.scoringPolicyVersion = 'practice-binary-v1'; });
    invalid((value) => { value.preview.question.interaction.label = '<b>Answer</b>'; });
    invalid((value) => { value.sources[0].currentRights.allowedUses = []; });
    invalid((value) => { value.sources.push(structuredClone(value.sources[0])); });
    invalid((value) => { value.preview.question.extra = true; });
    invalid((value) => { value.workflow.state = 'QUARANTINED'; });
    invalid((value) => { value.preview.question.content = [{ type: 'image', assetId: randomUUID(), alt: 'Synthetic image' }]; });
    const legacyContext = await read(await call(author, contextPath(revised.versionId, 'v1')), 503);
    assert.deepEqual(Object.keys(legacyContext), ['error']);
    activeBank = legacy;
    await read(await call(author, contextPath(revised.versionId)), 404);
    activeBank = numeric;
    const v1List = await read(await call(author, '/api/v1/questions?limit=1'), 200);
    assert.equal(v1List.items.length, 0, 'v1 SQL filters numeric versions before LIMIT');
    const v2List = await read(await call(author, '/api/v2/questions'), 200);
    assert.ok(v2List.items.some((item) => item.versionId === revised.versionId));
    assert.doesNotMatch(JSON.stringify(v2List), /answerKey|9007199254740993|Lời giải/);
    for (const actor of [student, examManager]) {
      await read(await call(actor, '/api/v2/questions'), 403);
      await read(await call(actor, contextPath(revised.versionId)), 403);
      await read(await call(actor, '/api/v2/questions', draft()), 403);
    }
    await read(await call(reviewer, contextPath(revised.versionId)), 404);
    await read(await fetch(origin + contextPath(revised.versionId)), 401);
    await read(await fetch(origin + contextPath(revised.versionId), { headers: { origin: 'https://invalid.example', cookie: author.cookies.join('; ') } }), 403);
    await read(await fetch(origin + `/api/v2/question-versions/${revised.versionId}/submit-review`, {
      method: 'POST', headers: { origin, cookie: author.cookies.join('; '), 'content-type': 'application/json' }, body: '{"expectedRevision":1}',
    }), 403);
    const submitted = await read(await call(author, `/api/v2/question-versions/${revised.versionId}/submit-review`, { expectedRevision: 1 }), 200);
    assert.equal(submitted.state, 'IN_REVIEW');
    const queued = await read(await call(reviewer, contextPath(revised.versionId)), 200);
    assert.equal(queued.accessBasis, 'REVIEW_QUEUE');
    const review = { expectedRevision: 2, contentHash: revised.contentHash, decision: 'REJECT',
      rubric: { correctness: false, unambiguous: true, relevant: true, language: true, explanation: true, rights: true },
      reason: 'Synthetic engineering rejection; no qualified approval.', };
    await read(await call(author, `/api/v2/question-versions/${revised.versionId}/reviews`, review), 403);
    await read(await call(reviewer, `/api/v2/question-versions/${revised.versionId}/reviews`, {
      ...review, decision: 'APPROVE', rubric: { ...review.rubric, correctness: true },
    }), 403);
    const rejected = await read(await call(reviewer, `/api/v2/question-versions/${revised.versionId}/reviews`, review), 201);
    assert.equal(rejected.state, 'REJECTED');
    await read(await call(reviewer, contextPath(revised.versionId)), 404);
    const held = await read(await call(manager, `/api/v2/question-versions/${created.versionId}/quarantine`, {
      expectedRevision: 1, reason: 'Synthetic inspection hold.',
    }), 200);
    assert.equal(held.state, 'QUARANTINED');
    const heldContext = StaffReviewContextV2Schema.parse(await read(await call(manager, contextPath(created.versionId)), 200));
    assert.deepEqual(heldContext.preview, { status: 'BLOCKED', reason: 'WORKFLOW_HELD' });
    const legacyDraft = { ...draft(), schemaVersion: 'question/1', interaction: { type: 'SINGLE_CHOICE', options: [
      { id: 'a', content: [{ type: 'text', text: 'Một' }] }, { id: 'b', content: [{ type: 'text', text: 'Hai' }] },
    ] }, answerKey: { type: 'SINGLE_CHOICE', optionId: 'a' } };
    const q1 = await read(await call(author, '/api/v1/questions', legacyDraft), 201);
    const q1Context = StaffReviewContextSchema.parse(await read(await call(author, contextPath(q1.versionId, 'v1')), 200));
    assert.equal(q1Context.schemaVersion, 'staff-review-context/1');
    assert.ok((await read(await call(author, '/api/v1/questions?limit=1'), 200)).items.every((item) => item.interactionType !== 'NUMERIC_RESPONSE'));
  } finally {
    try { if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    finally { await fixture.close(); }
  }
});
