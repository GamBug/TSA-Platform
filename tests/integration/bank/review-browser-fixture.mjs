// Only for disposable browser acceptance; never alters retained source rights.
import { randomUUID } from 'node:crypto';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { bankRequest } from './harness.mjs';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { createLocalAuthHandler } from '../../../src/http/local-auth.mjs';
import { createLocalSyntheticIdentityService } from '../../../src/modules/identity/local-synthetic.mjs';
import { createBankHandler } from '../../../src/http/bank.mjs';
import { createPrototypeServer } from '../../../apps/practice-prototype/server.mjs';

export const SYNTHETIC_REVIEW_EVIDENCE = 'Synthetic administrative claim only; not qualified legal evidence.\n<img src="https://invalid.example/evidence.png" onerror="alert(1)">\nhttps://invalid.example/recorded-claim /synthetic/path "quoted"';

export async function createReviewBrowserFixture() {
  let fixture, server;
  const close = async () => {
    const errors = [];
    for (const action of [async () => {
      if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }, () => fixture?.close()]) {
      try { await action(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Staff browser fixture cleanup failed');
  };
  try {
    fixture = await createAllocationFixture({ questionCount: 0 });
    const rights = await bankRequest(fixture.harness, fixture.browsers.bankManager,
      `/api/v1/source-versions/${fixture.source.sourceVersionId}/rights`, {
        method: 'POST', key: randomUUID(), body: {
          status: 'OWNED', allowedUses: ['DISPLAY', 'ADAPT'], territory: ['VN'],
          validFrom: '2000-01-01T00:00:00Z', validTo: null,
          evidence: SYNTHETIC_REVIEW_EVIDENCE, expectedRevision: 1,
        },
      });
    if (rights.status !== 201) throw new Error('Synthetic evidence fixture rights failed');
    fixture.source.decisionId = (await rights.json()).decisionId;
    const text = (value) => [{ type: 'text', text: value }];
    const { sourceVersionId: _sourceVersionId, ...context } = createPrivateTemplate(fixture.source);
    const template = { ...context, schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH',
      subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY', stimulusVersionId: null, origin: 'MANUAL',
      content: text('Câu hỏi tổng hợp riêng'),
      interaction: { type: 'SINGLE_CHOICE', options: [{ id: 'a', content: text('Một') }, { id: 'b', content: text('Hai') }] },
      answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' }, explanation: text('Lời giải tổng hợp riêng'),
    };
    const specs = [
      { interaction: template.interaction, answerKey: template.answerKey },
      { interaction: { type: 'MULTIPLE_CHOICE', minSelections: 2, maxSelections: 2,
        options: [{ id: 'a', content: text('Một') }, { id: 'b', content: text('Hai') }] },
        answerKey: { type: 'MULTIPLE_CHOICE', optionIds: ['a', 'b'] } },
      { interaction: { type: 'TRUE_FALSE_GROUP', statements: [{ id: 's1', content: text('Một nhỏ hơn hai') }] },
        answerKey: { type: 'TRUE_FALSE_GROUP', values: { s1: true } } },
      { interaction: template.interaction, answerKey: template.answerKey,
        content: text('<img src="https://invalid.example/synthetic.png" onerror="alert(1)">') },
    ];
    const questions = [];
    for (const [index, spec] of specs.entries()) {
      const result = await bankRequest(fixture.harness, fixture.browsers.author, '/api/v1/questions', {
        method: 'POST', key: randomUUID(), body: { ...template, ...spec,
          content: spec.content ?? [
            { type: 'text', text: `Bản xem trước tổng hợp ${index + 1}; không phải nội dung kỳ thi.` },
            { type: 'math', tex: 'x^2 + 1', display: true, accessibleText: 'x bình phương cộng một' },
            { type: 'table', caption: 'Bảng tổng hợp riêng', headers: ['x', 'y'], rows: [['1', '2']] },
          ], explanation: text('Lời giải tổng hợp riêng để kiểm thử giao diện; không phải rà soát của người đủ điều kiện.'),
        },
      });
      if (result.status !== 201) throw new Error(`Staff browser fixture draft failed (${result.status})`);
      questions.push(await result.json());
    }
    let handlers;
    server = createPrototypeServer({ port: 0, maxRequestBytes: 1024 * 1024, integratedRequestHandler: async (request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname.startsWith('/local-auth/')) return handlers.auth(request);
      if (pathname.startsWith('/api/v1/')) return handlers.bank(request);
      if (pathname === '/local/workspace/template') {
        const principal = await handlers.identity.authenticate(request);
        if (!principal || !handlers.identity.mayPerform(principal, 'bank.question.author')) {
          return Response.json({ error: { code: principal ? 'FORBIDDEN' : 'UNAUTHENTICATED' } }, { status: principal ? 403 : 401 });
        }
        return Response.json({ template }, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      }
      return null;
    } });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const env = { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', LOCAL_AUTH_TRUSTED_ORIGIN: origin };
    const identity = await createLocalSyntheticIdentityService(fixture.harness.authPool, { env });
    handlers = { identity,
      auth: await createLocalAuthHandler({ pool: fixture.harness.authPool, env }),
      bank: await createBankHandler({ bankPool: fixture.bankPool, identityService: identity, trustedOrigin: origin, enableReviewContext: true, enableReviewEvidence: true, enableReviewHistory: true }),
    };
    return { origin, questions, close, fixture, identity, template, evidenceText: SYNTHETIC_REVIEW_EVIDENCE };
  } catch (error) {
    try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Staff browser fixture setup and cleanup failed'); }
    throw error;
  }
}
