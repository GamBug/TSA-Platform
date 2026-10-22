import { createHash, randomUUID } from 'node:crypto';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { bankRequest } from '../bank/harness.mjs';

/** Disposable postmaster-scoped engineering inventory, never a persistent stock seed. */
export async function createMixedStudentFixture({ durationSeconds = 600 } = {}) {
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 21_600) {
    throw new RangeError('Fixture durationSeconds must be an integer from 1 through 21600.');
  }
  const f = await createAllocationFixture({ questionCount: 0, blueprintCount: 4 });
  try {
    const text = (value) => [{ type: 'text', text: value }];
    const options = ['a', 'b', 'c'].map((id) => ({ id, content: text(`Phương án tổng hợp ${id}`) }));
    const specs = [
      { interaction: { type: 'SINGLE_CHOICE', options }, answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' } },
      { interaction: { type: 'SINGLE_CHOICE', options }, answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' } },
      { interaction: { type: 'MULTIPLE_CHOICE', options, minSelections: 2, maxSelections: 3 },
        answerKey: { type: 'MULTIPLE_CHOICE', optionIds: ['a', 'c'] } },
      { interaction: { type: 'TRUE_FALSE_GROUP', statements: [
        { id: 's1', content: text('Mệnh đề tổng hợp một') }, { id: 's2', content: text('Mệnh đề tổng hợp hai') },
      ] }, answerKey: { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false } } },
    ];
    const template = createPrivateTemplate(f.source);
    const questions = [];
    for (const [index, spec] of specs.entries()) {
      const draft = {
        schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH',
        taxonomyVersionId: template.taxonomyVersionId, domainId: template.domainId,
        skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
        content: [
          { type: 'text', text: `Câu hỏi tổng hợp ${index + 1} — chỉ kiểm thử kỹ thuật.` },
          { type: 'math', tex: 'x^2 + 1', display: true, accessibleText: 'x bình phương cộng một' },
          { type: 'table', caption: 'Bảng dữ liệu tổng hợp', headers: ['x', 'y'], rows: [['1', '2']] },
        ], ...spec, explanation: text('Lời giải tổng hợp; không phải nội dung kỳ thi chính thức.'),
        stimulusVersionId: null, evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
      };
      const response = await bankRequest(f.harness, f.browsers.author, '/api/v1/questions', {
        method: 'POST', key: randomUUID(), body: draft,
      });
      const created = await response.json();
      if (response.status !== 201) throw new Error(`Mixed fixture draft rejected: ${created.error?.code ?? response.status}`);
      await f.workflow.submitReview(f.principals.author, created.versionId, randomUUID(), { expectedRevision: 1 });
      await f.workflow.confirmSingleton(f.principals.reviewer, created.versionId, randomUUID(), {
        expectedRevision: 2, contentHash: created.contentHash, reason: 'Synthetic isolated browser fixture singleton.',
      });
      await f.workflow.review(f.principals.reviewer, created.versionId, randomUUID(), {
        expectedRevision: 2, contentHash: created.contentHash, decision: 'APPROVE',
        rubric: { correctness: true, unambiguous: true, relevant: true, language: true, explanation: true, rights: true },
        reason: 'Synthetic disposable workflow exercise; not qualified human review or production publication.',
      });
      questions.push(created);
    }
    const oldBlueprint = f.blueprint;
    const config = structuredClone(oldBlueprint.config);
    config.name = 'Bài luyện tập PostgreSQL tổng hợp';
    config.sections[0].durationSeconds = durationSeconds;
    config.allowedTypes = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'];
    const id = randomUUID(), versionId = randomUUID();
    const contentHash = `sha256:${createHash('sha256').update(canonicalize(config)).digest('hex')}`;
    await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, config.name]);
    await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
      VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`, [versionId, id, config.taxonomyVersionId, config, contentHash]);
    await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
      VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`, [versionId]);
    await f.pool.query('UPDATE tsa.blueprint_offerings SET enabled=false,revision=revision+1 WHERE blueprint_version_id=$1', [oldBlueprint.versionId]);
    Object.assign(f, { questions, blueprint: { id, versionId, config, contentHash } });
    return f;
  } catch (error) { await f.close(); throw error; }
}
