import { randomUUID } from 'node:crypto';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { jsonDigest, resolveReferenceGraph, storeReferenceGraph, MANUAL_REFERENCE_NAMESPACE } from '../../../src/modules/bank/common.mjs';
import { bankRequest } from '../bank/harness.mjs';
import { createAllocationFixture } from './fixtures.mjs';

/** Original private disposable inventory; no retained provisioning or human approval. */
export async function createBundleFixture({ bundleCount = 2, memberCount = 2, ordinals, materialize = true, mismatchedStimulus = false } = {}) {
  const f = await createAllocationFixture({ questionCount: 0, blueprintCount: 4 });
  try {
    f.bundles = [];
    for (let bundleIndex = 0; bundleIndex < bundleCount; bundleIndex++) {
      const source = await f.registerSource();
      const stimulusId = randomUUID(), stimulusVersionId = randomUUID(), provenanceId = randomUUID();
      const content = [{ type: 'text', text: `Đoạn dẫn tổng hợp ${bundleIndex + 1}: số liệu tự viết dùng chung cho hai câu. Chỉ kiểm thử kỹ thuật.` }];
      await withTransaction(f.pool, async (client) => {
        const graph = await resolveReferenceGraph(client, MANUAL_REFERENCE_NAMESPACE, [{ kind: 'stimulus', id: stimulusVersionId }], [
          { kind: 'provenance', id: provenanceId, payload: { sourceVersionId: source.sourceVersionId, rightsEvidence: source.decisionId },
            references: [{ kind: 'source', id: source.sourceVersionId }, { kind: 'evidence', id: source.decisionId }] },
          { kind: 'stimulus', id: stimulusVersionId, payload: { content, provenanceIds: [provenanceId] },
            references: [{ kind: 'provenance', id: provenanceId }] },
        ]);
        await storeReferenceGraph(client, MANUAL_REFERENCE_NAMESPACE, graph);
        await client.query('INSERT INTO tsa.stimuli(id) VALUES($1)', [stimulusId]);
        await client.query('INSERT INTO tsa.stimulus_versions(id,stimulus_id,version_no,content,content_hash) VALUES($1,$2,1,$3,$4)',
          [stimulusVersionId, stimulusId, JSON.stringify(content), graph.find((node) => node.kind === 'stimulus').contentHash]);
        await client.query('INSERT INTO tsa.stimulus_sources(stimulus_version_id,source_version_id) VALUES($1,$2)', [stimulusVersionId, source.sourceVersionId]);
      });
      const questions = [];
      for (let index = 0; index < memberCount; index++) {
        const template = createPrivateTemplate(f.source);
        const response = await bankRequest(f.harness, f.browsers.author, '/api/v1/questions', { method: 'POST', key: randomUUID(), body: {
          schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH', taxonomyVersionId: template.taxonomyVersionId,
          domainId: template.domainId, skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
          content: [{ type: 'text', text: `Câu hỏi tổng hợp có đoạn dẫn ${bundleIndex + 1}, vị trí ${index + 1}, mã ${randomUUID()}.` }],
          stimulusVersionId, interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b', 'c'].map((id) => ({ id, content: [{ type: 'text', text: `Nhãn ${id}` }] })) },
          answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' }, explanation: [{ type: 'text', text: 'Lời giải tổng hợp cho dữ liệu tự viết.' }],
          evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
        } });
        const question = await response.json();
        if (response.status !== 201) throw new Error(`Bundle draft rejected: ${JSON.stringify(question)}`);
        await f.workflow.submitReview(f.principals.author, question.versionId, randomUUID(), { expectedRevision: 1 });
        await f.workflow.confirmSingleton(f.principals.reviewer, question.versionId, randomUUID(), {
          expectedRevision: 2, contentHash: question.contentHash, reason: 'Original isolated bundle fixture singleton exercise.',
        });
        await f.workflow.review(f.principals.reviewer, question.versionId, randomUUID(), {
          expectedRevision: 2, contentHash: question.contentHash, decision: 'APPROVE',
          rubric: { correctness: true, unambiguous: true, relevant: true, language: true, explanation: true, rights: true },
          reason: 'Synthetic disposable exercise, not qualified human review or real publication authority.',
        });
        questions.push(question);
      }
      const bundle = { id: randomUUID(), stimulusId, stimulusVersionId, source, content, questions };
      bundle.materialize = () => withTransaction(f.pool, async (client) => {
        // Bundle hash is opaque existing metadata; no new public recipe is claimed.
        await client.query('INSERT INTO tsa.bundles(id,stimulus_version_id,content_hash) VALUES($1,$2,$3)',
          [bundle.id, mismatchedStimulus && bundleIndex > 0 ? f.bundles[0].stimulusVersionId : stimulusVersionId, jsonDigest(questions.map((question) => question.versionId))]);
        for (const [index, question] of questions.entries()) await client.query(
          'INSERT INTO tsa.bundle_members(bundle_id,question_version_id,ordinal) VALUES($1,$2,$3)', [bundle.id, question.versionId, ordinals?.[index] ?? index]);
      });
      if (materialize) await bundle.materialize();
      f.bundles.push(bundle);
    }
    return f;
  } catch (error) { await f.close(); throw error; }
}
