import { randomUUID } from 'node:crypto';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { jsonDigest, resolveReferenceGraph, storeReferenceGraph, MANUAL_REFERENCE_NAMESPACE } from '../../../src/modules/bank/common.mjs';
import { bankRequest } from '../bank/harness.mjs';
import { createAllocationFixture } from './fixtures.mjs';

/** Original private disposable inventory; no retained provisioning or human approval. */
export async function createBundleFixture({ bundleCount = 2, memberCount = 2, ordinals, materialize = true, mismatchedStimulus = false, section = 'MATH', durationSeconds = 180 } = {}) {
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) throw new RangeError('Positive integral fixture duration required');
  if (!['MATH', 'READING'].includes(section)) throw new RangeError('Unsupported bundle fixture section');
  const f = await createAllocationFixture({ questionCount: 0, blueprintCount: 4 });
  try {
    // A separate immutable taxonomy/profile is required for real READING coverage.
    let taxonomy = createPrivateTemplate(f.source);
    if (section === 'READING') {
      const taxonomyVersionId = randomUUID(), domainId = randomUUID(), skillId = randomUUID();
      const definition = { schemaVersion: 'taxonomy/1', taxonomyVersionId, name: 'Synthetic shared-reading taxonomy', versionNo: 1,
        nodes: [{ id: domainId, code: 'READING', kind: 'DOMAIN', parentId: null, metadata: {} },
          { id: skillId, code: 'READING_REASONING', kind: 'SKILL', parentId: domainId, metadata: {} }] };
      await withTransaction(f.pool, async (client) => {
        await client.query('INSERT INTO tsa.taxonomy_versions(id,name,version_no,definition_hash) VALUES($1,$2,1,$3)',
          [taxonomyVersionId, definition.name, jsonDigest(definition)]);
        await client.query(`INSERT INTO tsa.taxonomy_nodes(id,taxonomy_version_id,code,kind,parent_id,metadata)
          VALUES($1,$3,'READING','DOMAIN',NULL,'{}'),($2,$3,'READING_REASONING','SKILL',$1,'{}')`, [domainId, skillId, taxonomyVersionId]);
      });
      taxonomy = { taxonomyVersionId, domainId, skillIds: [skillId] };
      const config = structuredClone(f.blueprint.config), oldVersion = f.blueprint.versionId;
      Object.assign(config, { name: 'Bài đọc hiểu có đoạn dẫn tổng hợp', taxonomyVersionId,
        sections: [{ id: 'reading-bundle', section, count: 2, durationSeconds }],
        quotas: [{ sectionId: 'reading-bundle', dimension: 'SKILL', value: skillId, min: 1, max: 2 }] });
      const id = randomUUID(), versionId = randomUUID(), contentHash = jsonDigest(config);
      await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, config.name]);
      await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
        VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`, [versionId, id, taxonomyVersionId, config, contentHash]);
      await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
        VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`, [versionId]);
      await f.pool.query('UPDATE tsa.blueprint_offerings SET enabled=false,revision=revision+1 WHERE blueprint_version_id=$1', [oldVersion]);
      f.blueprint = { id, versionId, contentHash, config };
    }
    f.bundles = [];
    for (let bundleIndex = 0; bundleIndex < bundleCount; bundleIndex++) {
      const source = await f.registerSource();
      const stimulusId = randomUUID(), stimulusVersionId = randomUUID(), provenanceId = randomUUID();
      const content = [{ type: 'text', text: section === 'READING' ? 'Đoạn đọc tự viết: Nhóm bạn tổ chức ba buổi đổi sách tại thư viện. Buổi đầu nhóm nhận mười hai quyển sách. Buổi cuối nhóm sắp xếp sách theo chủ đề để người đọc dễ tìm. Chỉ kiểm thử kỹ thuật, không phải đề thi chính thức.' : `Đoạn dẫn tổng hợp ${bundleIndex + 1}: số liệu tự viết dùng chung cho hai câu. Chỉ kiểm thử kỹ thuật.` }];
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
          schemaVersion: 'question/1', language: 'vi-VN', section, taxonomyVersionId: taxonomy.taxonomyVersionId,
          domainId: taxonomy.domainId, skillIds: taxonomy.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
          content: [{ type: 'text', text: section === 'READING' ? (index === 0 ? 'Theo đoạn đọc, nhóm tổ chức bao nhiêu buổi đổi sách?' : 'Vì sao nhóm sắp xếp sách theo chủ đề?') : `Câu hỏi tổng hợp có đoạn dẫn ${bundleIndex + 1}, vị trí ${index + 1}, mã ${randomUUID()}.` }],
          stimulusVersionId, interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b', 'c'].map((id) => ({ id, content: [{ type: 'text', text: section === 'READING' ? (index === 0 ? { a: 'Hai buổi', b: 'Ba buổi', c: 'Bốn buổi' } : { a: 'Để đếm số buổi', b: 'Để thay đổi bìa sách', c: 'Để người đọc dễ tìm' })[id] : `Nhãn ${id}` }] })) },
          answerKey: { type: 'SINGLE_CHOICE', optionId: section === 'READING' && index === 1 ? 'c' : 'b' }, explanation: [{ type: 'text', text: section === 'READING' ? (index === 0 ? 'Đoạn đọc nêu rõ nhóm tổ chức ba buổi đổi sách.' : 'Đoạn đọc nêu mục đích sắp xếp theo chủ đề là để người đọc dễ tìm.') : 'Lời giải tổng hợp cho dữ liệu tự viết.' }],
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
