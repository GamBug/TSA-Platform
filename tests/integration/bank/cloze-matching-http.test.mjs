import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { StaffReviewContextV3Schema } from '../../../packages/contracts/dist/staff-v3.js';
import { createBankHandler } from '../../../src/http/bank.mjs';
import { createLocalAuthHandler } from '../../../src/http/local-auth.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createLocalSyntheticIdentityService } from '../../../src/modules/identity/local-synthetic.mjs';
import { createManualImportFixture } from './manual-import-fixture.mjs';
import { bankRequest, loginActor } from './harness.mjs';

test('question/3 Bank HTTP is opt-in and private staff review is versioned and role-limited', { timeout: 60_000 }, async () => {
  const fixture = await createManualImportFixture();
  let server;
  try {
    let auth, activeBank;
    server = createServer((request, outgoing) => {
      void (async () => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (Array.isArray(value)) headers.set(name, value.join(', '));
          else if (value !== undefined) headers.set(name, value);
        }
        const fetchRequest = new Request(`http://${request.headers.host}${request.url}`, {
          method: request.method, headers, ...(bytes.length ? { body: bytes } : {}),
        });
        const handler = new URL(fetchRequest.url).pathname.startsWith('/local-auth/') ? auth : activeBank;
        const response = await handler(fetchRequest);
        outgoing.statusCode = response.status;
        for (const [name, value] of response.headers) {
          if (name.toLowerCase() !== 'set-cookie') outgoing.setHeader(name, value);
        }
        const cookies = response.headers.getSetCookie?.() ?? [];
        if (cookies.length) outgoing.setHeader('set-cookie', cookies);
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      })().catch(() => { outgoing.statusCode = 500; outgoing.end(); });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const env = { ...fixture.env, LOCAL_AUTH_TRUSTED_ORIGIN: origin };
    const identityService = await createLocalSyntheticIdentityService(fixture.authPool, { env });
    auth = await createLocalAuthHandler({ pool: fixture.authPool, env });
    const options = { bankPool: fixture.bankPool, identityService, trustedOrigin: origin, enableReviewContext: true };
    const legacy = await createBankHandler(options);
    const numeric = await createBankHandler({ ...options, enableNumericQuestions: true });
    const clozeMatching = await createBankHandler({ ...options, enableClozeMatching: true });
    activeBank = legacy;
    const harness = { origin };
    const [author, reviewer, manager, student, examManager] = await Promise.all(
      ['author', 'reviewer', 'bankManager', 'studentA', 'examManager'].map((key) => loginActor(harness, key)));
    const post = (actor, path, body, key = randomUUID()) => bankRequest(harness, actor, path,
      { method: 'POST', key, body });
    const get = (actor, path) => bankRequest(harness, actor, path);
    const read = async (response, expected) => {
      assert.equal(response.status, expected, await response.clone().text());
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      const payload = await response.json();
      if (expected >= 400) {
        assert.deepEqual(Object.keys(payload), ['error']);
        assert.deepEqual(Object.keys(payload.error).sort(), ['code', 'details', 'message', 'requestId']);
        assert.deepEqual(payload.error.details, {});
      }
      return payload;
    };
    const source = await read(await post(author, '/api/v1/sources', {
      title: 'Synthetic q3 Bank source', canonicalUri: null, origin: 'OWNED',
    }), 201);
    const sourceVersion = await read(await post(author, `/api/v1/sources/${source.sourceId}/versions`, {
      contentHash: jsonDigest({ source: source.sourceId }), evidenceUri: 'manual://cloze-matching-http-test', metadata: {},
    }), 201);
    const rights = await read(await post(manager, `/api/v1/source-versions/${sourceVersion.sourceVersionId}/rights`, {
      status: 'OWNED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2020-01-01T00:00:00Z',
      validTo: null, evidence: 'Synthetic engineering fixture; not qualified human approval.', expectedRevision: 0,
    }), 201);
    const taxonomy = await fixture.bankPool.query('SELECT id FROM tsa.taxonomy_nodes WHERE taxonomy_version_id=$1 AND kind=$2 ORDER BY code',
      [fixture.taxonomy.taxonomyVersionId, 'DOMAIN']);
    const domainId = taxonomy.rows[0].id;
    const skillId = fixture.taxonomy.nodes.find((node) => node.kind === 'SKILL').id;
    const draft = (type, text = `Câu hỏi riêng ${randomUUID()}`) => {
      const cloze = type === 'CLOZE';
      const interaction = cloze ? {
        type: 'CLOZE', fields: [{ id: 'blank-a', label: 'Nội dung cần điền' }], maxLength: 64,
        normalization: { unicode: 'NFC', trim: 'OUTER', caseSensitive: true, diacritics: 'PRESERVE' },
      } : {
        type: 'MATCHING', rows: [{ id: 'row-a', label: 'Mệnh đề A' }],
        targets: [{ id: 'target-a', label: 'Đáp án A', maxUses: 1 }],
      };
      const answerKey = cloze ? { type: 'CLOZE', acceptedValues: { 'blank-a': ['café', 'cafe'] } }
        : { type: 'MATCHING', answers: { 'row-a': 'target-a' } };
      return {
        schemaVersion: 'question/3', language: 'vi-VN', section: 'READING',
        taxonomyVersionId: fixture.taxonomy.taxonomyVersionId, domainId, skillIds: [skillId], subskillIds: [],
        cognitiveLevel: 'M1', targetDifficulty: null, content: [{ type: 'text', text }], stimulusVersionId: null,
        interaction, answerKey, explanation: [{ type: 'text', text: 'Lời giải riêng cho nhân viên.' }],
        evidenceRefs: [rights.decisionId], origin: 'MANUAL',
        provenance: [{ sourceVersionId: sourceVersion.sourceVersionId, span: null, transformation: 'Synthetic original entry.' }],
      };
    };

    activeBank = legacy;
    await read(await post(author, '/api/v4/questions', draft('CLOZE')), 404);
    activeBank = clozeMatching;
    await read(await post(author, '/api/v4/sources', {}), 404);
    await read(await post(author, '/api/v4/questions', { ...draft('CLOZE'), answerKey: { type: 'CLOZE', acceptedValues: {} } }), 422);
    await read(await post(author, '/api/v4/questions', { ...draft('CLOZE'), schemaVersion: 'question/2' }), 422);

    const clozeKey = randomUUID();
    const clozeDraft = draft('CLOZE');
    const cloze = await read(await post(author, '/api/v4/questions', clozeDraft, clozeKey), 201);
    assert.deepEqual(await read(await post(author, '/api/v4/questions', clozeDraft, clozeKey), 201), cloze);
    const matching = await read(await post(author, '/api/v4/questions', draft('MATCHING')), 201);
    const revision = await read(await post(author, `/api/v4/questions/${cloze.questionId}/versions`, {
      parentVersionId: cloze.versionId, draft: draft('CLOZE', `Cloze revision ${randomUUID()}`),
    }), 201);

    const contextPath = (id) => `/api/v4/question-versions/${id}/review-context`;
    for (const [version, type] of [[cloze, 'CLOZE'], [matching, 'MATCHING'], [revision, 'CLOZE']]) {
      const context = StaffReviewContextV3Schema.parse(await read(await get(author, contextPath(version.versionId)), 200));
      assert.equal(context.version.versionId, version.versionId);
      assert.equal(context.version.parentVersionId, version === revision ? cloze.versionId : null);
      assert.equal(context.preview.status, 'AVAILABLE');
      assert.equal(context.preview.question.interaction.type, type);
      assert.equal(context.preview.question.scoringPolicyVersion, 'practice-binary-v3');
      assert.ok(context.preview.question.answerKey);
      assert.ok(context.preview.question.explanation.length > 0);
      assert.equal(StaffReviewContextV3Schema.safeParse(context).success, true);
    }
    const clozeContext = await get(author, contextPath(cloze.versionId));
    const clozePayload = await read(clozeContext, 200);
    assert.deepEqual(clozePayload.preview.question.answerKey.acceptedValues['blank-a'], ['café', 'cafe']);
    assert.doesNotMatch(JSON.stringify(await read(await get(author, '/api/v4/questions'), 200)), /acceptedValues|answers|café|Lời giải/);

    for (const actor of [student, examManager]) {
      await read(await get(actor, '/api/v4/questions'), 403);
      await read(await get(actor, contextPath(cloze.versionId)), 403);
      await read(await post(actor, '/api/v4/questions', draft('MATCHING')), 403);
    }
    await read(await get(reviewer, contextPath(cloze.versionId)), 404);
    await read(await fetch(origin + contextPath(cloze.versionId)), 401);
    await read(await fetch(origin + contextPath(cloze.versionId), {
      headers: { origin: 'https://invalid.example', cookie: author.cookies.join('; ') },
    }), 403);

    const submitted = await read(await post(author, `/api/v4/question-versions/${cloze.versionId}/submit-review`, {
      expectedRevision: 1,
    }), 200);
    assert.equal(submitted.state, 'IN_REVIEW');
    const queued = StaffReviewContextV3Schema.parse(await read(await get(reviewer, contextPath(cloze.versionId)), 200));
    assert.equal(queued.accessBasis, 'REVIEW_QUEUE');
    assert.deepEqual(queued.preview.question.answerKey.acceptedValues['blank-a'], ['café', 'cafe']);

    activeBank = numeric;
    const v2Page = await read(await get(author, '/api/v2/questions?limit=100'), 200);
    assert.ok(v2Page.items.every((item) => ![cloze.versionId, matching.versionId, revision.versionId].includes(item.versionId)));
    activeBank = legacy;
    const v1Page = await read(await get(author, '/api/v1/questions?limit=100'), 200);
    assert.ok(v1Page.items.every((item) => ![cloze.versionId, matching.versionId, revision.versionId].includes(item.versionId)));
    await read(await get(author, '/api/v4/questions'), 404);
  } finally {
    try {
      if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } finally {
      await fixture.close();
    }
  }
});
