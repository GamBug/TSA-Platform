import { randomUUID } from 'node:crypto';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { createQuestionService } from '../../../src/modules/bank/questions.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';

/** Original disposable numeric inventory. It supplies no human publication approval. */
export async function createNumericFixture({ durationSeconds = 600 } = {}) {
  const f = await createAllocationFixture({ questionCount: 0, blueprintCount: 4 });
  try {
    const questions = await createQuestionService({ bankPool: f.bankPool, identityService: f.identityService, enableNumericQuestions: true });
    const workflow = await createPublicationService({ bankPool: f.bankPool, identityService: f.identityService,
      fixtureScopeId: f.fixtureScopeId, enableNumericQuestions: true });
    const template = createPrivateTemplate(f.source), created = [], keys = new Map();
    const examples = [['3 : 2', '1.5'], ['-9 : 4', '-2.25'], ['9007199254740992 + 1', '9007199254740993'], ['1 : 100000000000000000000', '0.00000000000000000001']];
    for (const [index, [expression, value]] of examples.entries()) {
      const receipt = await questions.createQuestionDraft(f.principals.author, randomUUID(), {
        schemaVersion: 'question/2', language: 'vi-VN', section: 'MATH', taxonomyVersionId: template.taxonomyVersionId,
        domainId: template.domainId, skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
        content: [{ type: 'text', text: `Câu tổng hợp ${index+1}: tính ${expression}. Chỉ dùng để kiểm thử kỹ thuật.` }],
        interaction: { type: 'NUMERIC_RESPONSE', label: 'Nhập đáp án bằng số thập phân', format: 'DECIMAL' },
        answerKey: { type: 'NUMERIC_RESPONSE', value },
        explanation: [{ type: 'text', text: `SYNTHETIC_NUMERIC_PRIVATE_${index}: kết quả ${value}. Không phải câu hỏi thi chính thức.` }],
        stimulusVersionId: null, evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
      });
      const draft = receipt.body;
      if (receipt.status !== 201 || !draft?.versionId) throw new Error('Numeric fixture draft failed');
      await workflow.submitReview(f.principals.author, draft.versionId, randomUUID(), { expectedRevision: 1 });
      await workflow.confirmSingleton(f.principals.reviewer, draft.versionId, randomUUID(), {
        expectedRevision: 2, contentHash: draft.contentHash, reason: 'Original numeric fixture singleton.' });
      await workflow.review(f.principals.reviewer, draft.versionId, randomUUID(), {
        expectedRevision: 2, contentHash: draft.contentHash, decision: 'APPROVE',
        rubric: Object.fromEntries(['correctness','unambiguous','relevant','language','explanation','rights'].map(key => [key, true])),
        reason: 'Disposable synthetic technical verification, not human content approval.',
      });
      created.push(draft); keys.set(draft.versionId, value);
    }
    const config = { ...structuredClone(f.blueprint.config), schemaVersion: 'blueprint/2', name: 'Luyện tập trả lời số — dữ liệu tổng hợp',
      scoringPolicy: 'practice-binary-v2', allowedTypes: ['NUMERIC_RESPONSE'] };
    config.sections[0].durationSeconds = durationSeconds;
    const id = randomUUID(), versionId = randomUUID(), contentHash = jsonDigest(config);
    await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, config.name]);
    await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
      VALUES($1,$2,$3,1,'blueprint/2',$4,$5)`, [versionId, id, config.taxonomyVersionId, config, contentHash]);
    await f.pool.query('INSERT INTO tsa_private.numeric_practice_profiles(blueprint_version_id,blueprint_hash) VALUES($1,$2)', [versionId, contentHash]);
    await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
      VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`, [versionId]);
    await f.pool.query('UPDATE tsa.blueprint_offerings SET enabled=false,revision=revision+1 WHERE blueprint_version_id=$1', [f.blueprint.versionId]);
    Object.assign(f, { questions: created, numericKeys: keys, numericWorkflow: workflow, blueprint: { id, versionId, config, contentHash } });
    return f;
  } catch (error) { await f.close(); throw error; }
}
