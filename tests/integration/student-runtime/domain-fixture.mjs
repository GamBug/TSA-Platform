import { createHash, randomUUID } from 'node:crypto';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { bankRequest } from '../bank/harness.mjs';
import { createMixedStudentFixture } from './mixed-fixture.mjs';

const hash = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;

/** Original standalone engineering fixtures; no retained seed or human approval. */
export async function createDomainStudentFixture() {
  const f = await createMixedStudentFixture({ durationSeconds: 360 });
  try {
    f.domainBlueprints = { MATH: f.blueprint };
    for (const [section, count, durationSeconds, name] of [
      ['READING', 2, 180, 'Bài đọc hiểu tổng hợp'],
      ['SCIENCE', 4, 360, 'Bài khoa học tổng hợp'],
    ]) {
      const taxonomyVersionId = randomUUID(), domainId = randomUUID(), skillId = randomUUID();
      const skill = `${section}_REASONING`;
      const definition = { schemaVersion: 'taxonomy/1', taxonomyVersionId,
        name: `Synthetic ${section} taxonomy`, versionNo: 1, nodes: [
          { id: domainId, code: section, kind: 'DOMAIN', parentId: null, metadata: {} },
          { id: skillId, code: skill, kind: 'SKILL', parentId: domainId, metadata: {} },
        ] };
      await withTransaction(f.pool, async (client) => {
        await client.query('INSERT INTO tsa.taxonomy_versions(id,name,version_no,definition_hash) VALUES($1,$2,1,$3)',
          [taxonomyVersionId, definition.name, hash(definition)]);
        await client.query(`INSERT INTO tsa.taxonomy_nodes(id,taxonomy_version_id,code,kind,parent_id,metadata)
          VALUES($1,$3,$4,'DOMAIN',NULL,'{}'),($2,$3,$5,'SKILL',$1,'{}')`, [domainId, skillId, taxonomyVersionId, section, skill]);
      });
      const template = createPrivateTemplate(f.source);
      for (let index = 0; index < count; index++) {
        const text = (value) => [{ type: 'text', text: value }];
        const question = {
          schemaVersion: 'question/1', language: 'vi-VN', section, taxonomyVersionId, domainId,
          skillIds: [skillId], subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
          content: text(`${name}, câu ${index + 1}. Ghi chú tự viết: mẫu số ${index + 1} được đánh dấu B. Chọn nhãn được nêu trong ghi chú. Chỉ kiểm thử kỹ thuật.`),
          interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b', 'c'].map((id) => ({ id, content: text(`Nhãn ${id.toUpperCase()}`) })) },
          answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' },
          explanation: text('Ghi chú tự viết nêu nhãn B; đây không phải câu hỏi kỳ thi chính thức.'),
          stimulusVersionId: null, evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
        };
        const response = await bankRequest(f.harness, f.browsers.author, '/api/v1/questions', {
          method: 'POST', key: randomUUID(), body: question,
        });
        const created = await response.json();
        if (response.status !== 201) throw new Error(`Domain fixture rejected (${section}): ${created.error?.code ?? response.status}`);
        await f.workflow.submitReview(f.principals.author, created.versionId, randomUUID(), { expectedRevision: 1 });
        await f.workflow.confirmSingleton(f.principals.reviewer, created.versionId, randomUUID(), {
          expectedRevision: 2, contentHash: created.contentHash, reason: 'Original disposable domain fixture singleton.',
        });
        await f.workflow.review(f.principals.reviewer, created.versionId, randomUUID(), {
          expectedRevision: 2, contentHash: created.contentHash, decision: 'APPROVE',
          rubric: { correctness: true, unambiguous: true, relevant: true, language: true, explanation: true, rights: true },
          reason: 'Synthetic disposable workflow exercise; not qualified human content review or production publication.',
        });
      }
      const config = structuredClone(f.blueprint.config);
      Object.assign(config, { name, taxonomyVersionId, allowedTypes: ['SINGLE_CHOICE'],
        sections: [{ id: `${section.toLowerCase()}-fixture`, section, count, durationSeconds }] });
      config.quotas = [{ sectionId: config.sections[0].id, dimension: 'SKILL', value: skillId, min: 1, max: count }];
      const id = randomUUID(), versionId = randomUUID(), contentHash = hash(config);
      await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, name]);
      await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
        VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`, [versionId, id, taxonomyVersionId, config, contentHash]);
      await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
        VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`, [versionId]);
      f.domainBlueprints[section] = { id, versionId, contentHash, config };
    }
    return f;
  } catch (error) { await f.close(); throw error; }
}
