// Explicit synthetic source Bank for rehearsing the university demo. It is built in
// its own disposable cluster and handed over as an archive, so the demo pipeline
// treats it exactly like the private Bank. Fixture approvals approve no real content.
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAllocationFixture } from '../tests/integration/assembly/fixtures.mjs';
import { bankRequest } from '../tests/integration/bank/harness.mjs';
import { backupLocalDatabase } from '../src/local/database-backup.mjs';
import { createPrivateTemplate } from '../src/local/seed.mjs';
import { createQuestionService } from '../src/modules/bank/questions.mjs';
import { createPublicationService } from '../src/modules/bank/publication.mjs';
import { jsonDigest } from '../src/modules/bank/common.mjs';
import { withTransaction } from '../src/modules/database/pool.mjs';

// One full simulation (40/20/40) plus spare items for topic and section practice.
export const REHEARSAL_DEFAULT_COUNTS = Object.freeze({ MATH: 50, READING: 30, SCIENCE: 50 });
export const REHEARSAL_DEFAULT_QUEUE = Object.freeze({ inReview: 3, draft: 2 });
// Published numeric-answer Math items (question/2) for the numeric practice; the tests opt in explicitly.
export const REHEARSAL_DEFAULT_NUMERIC = 5;
const DOMAINS = Object.freeze([
  { section: 'MATH', label: 'Toán học', skills: [['MATH_ALGEBRA', 'Đại số'], ['MATH_GEOMETRY', 'Hình học']] },
  { section: 'READING', label: 'Đọc hiểu', skills: [['READING_DETAIL', 'Tìm chi tiết'], ['READING_INFERENCE', 'Suy luận']] },
  { section: 'SCIENCE', label: 'Khoa học', skills: [['SCIENCE_PHYSICS', 'Vật lí'], ['SCIENCE_CHEMISTRY', 'Hoá học']] },
]);
const RUBRIC = Object.freeze(Object.fromEntries(
  ['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'].map((key) => [key, true])));
const PARALLEL = 6;

const text = (value) => [{ type: 'text', text: value }];

async function inBatches(items, action) {
  const results = [];
  for (let start = 0; start < items.length; start += PARALLEL) {
    results.push(...await Promise.all(items.slice(start, start + PARALLEL).map(action)));
  }
  return results;
}

/**
 * Build the synthetic rehearsal Bank and return its archive.
 * `counts` are published items per section; `queue` adds unpublished staff-queue items.
 */
export async function buildRehearsalSource({ counts = REHEARSAL_DEFAULT_COUNTS, queue = REHEARSAL_DEFAULT_QUEUE, numeric = 0 } = {}) {
  for (const value of [...DOMAINS.map((domain) => counts[domain.section]), queue.inReview, queue.draft, numeric]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 200) throw new RangeError('Rehearsal counts must be integers from 0 through 200');
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-uni-demo-rehearsal-'));
  let fixture;
  try {
    fixture = await createAllocationFixture({ questionCount: 0 });
    const taxonomyVersionId = randomUUID();
    const domains = DOMAINS.map((domain) => ({ ...domain, domainId: randomUUID(),
      skills: domain.skills.map(([code, label]) => ({ code, label, id: randomUUID() })) }));
    const definition = { schemaVersion: 'taxonomy/1', taxonomyVersionId, name: 'Synthetic rehearsal taxonomy', versionNo: 1,
      nodes: domains.flatMap((domain) => [
        { id: domain.domainId, code: domain.section, kind: 'DOMAIN', parentId: null, metadata: { label: domain.label } },
        ...domain.skills.map((skill) => ({ id: skill.id, code: skill.code, kind: 'SKILL', parentId: domain.domainId, metadata: { label: skill.label } })),
      ]) };
    await withTransaction(fixture.pool, async (client) => {
      await client.query('INSERT INTO tsa.taxonomy_versions(id,name,version_no,definition_hash) VALUES($1,$2,1,$3)',
        [taxonomyVersionId, definition.name, jsonDigest(definition)]);
      for (const node of definition.nodes) {
        await client.query(`INSERT INTO tsa.taxonomy_nodes(id,taxonomy_version_id,code,kind,parent_id,metadata)
          VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [node.id, taxonomyVersionId, node.code, node.kind, node.parentId, JSON.stringify(node.metadata)]);
      }
    });

    const template = createPrivateTemplate(fixture.source);
    const createDraft = async (domain, index, lead) => {
      const key = ['a', 'b', 'c'][index % 3], label = key.toUpperCase();
      const response = await bankRequest(fixture.harness, fixture.browsers.author, '/api/v1/questions', {
        method: 'POST', key: randomUUID(), body: {
          schemaVersion: 'question/1', language: 'vi-VN', section: domain.section, taxonomyVersionId,
          domainId: domain.domainId, skillIds: [domain.skills[index % domain.skills.length].id], subskillIds: [],
          cognitiveLevel: null, targetDifficulty: 'EASY',
          content: text(`${lead} ${domain.label} số ${index + 1} (nội dung tổng hợp, không phải đề mẫu). Ghi chú tự viết nêu nhãn ${label}. Hãy chọn nhãn được nêu trong ghi chú.`),
          interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b', 'c'].map((id) => ({ id, content: text(`Nhãn ${id.toUpperCase()}`) })) },
          answerKey: { type: 'SINGLE_CHOICE', optionId: key },
          explanation: text(`Ghi chú nêu nhãn ${label}. Câu hỏi tổng hợp chỉ dùng để diễn tập kỹ thuật.`),
          stimulusVersionId: null, evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
        },
      });
      const draft = await response.json();
      if (response.status !== 201) throw new Error(`Rehearsal draft was rejected: ${draft.error?.code ?? response.status}`);
      return draft;
    };
    const publish = async (draft) => {
      const { workflow, principals } = fixture;
      await workflow.submitReview(principals.author, draft.versionId, randomUUID(), { expectedRevision: 1 });
      await workflow.confirmSingleton(principals.reviewer, draft.versionId, randomUUID(), {
        expectedRevision: 2, contentHash: draft.contentHash, reason: 'Synthetic rehearsal item; no other version exists.' });
      await workflow.review(principals.reviewer, draft.versionId, randomUUID(), {
        expectedRevision: 2, contentHash: draft.contentHash, decision: 'APPROVE', rubric: { ...RUBRIC },
        reason: 'Synthetic rehearsal fixture only; not a human review of real content.' });
    };

    for (const domain of domains) {
      await inBatches(Array.from({ length: counts[domain.section] }, (_, index) => index),
        async (index) => publish(await createDraft(domain, index, 'Câu diễn tập')));
    }
    // Numeric-answer Math items are question/2 and use the numeric services, as the numeric fixture does.
    if (numeric > 0) {
      const numericQuestions = await createQuestionService({ bankPool: fixture.bankPool, identityService: fixture.identityService, enableNumericQuestions: true });
      const numericWorkflow = await createPublicationService({ bankPool: fixture.bankPool, identityService: fixture.identityService,
        fixtureScopeId: fixture.fixtureScopeId, enableNumericQuestions: true });
      const mathDomain = domains[0];
      await inBatches(Array.from({ length: numeric }, (_, index) => index), async (index) => {
        const value = String(3 * (index + 2) + (index % 2 === 0 ? 0.5 : 0)).replace(/\.0$/u, '');
        const receipt = await numericQuestions.createQuestionDraft(fixture.principals.author, randomUUID(), {
          schemaVersion: 'question/2', language: 'vi-VN', section: 'MATH', taxonomyVersionId, domainId: mathDomain.domainId,
          skillIds: [mathDomain.skills[index % mathDomain.skills.length].id], subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
          content: text(`Câu diễn tập trả lời số ${index + 1} (nội dung tổng hợp, không phải đề mẫu). Ghi chú tự viết nêu số ${value}. Hãy nhập số được nêu trong ghi chú.`),
          interaction: { type: 'NUMERIC_RESPONSE', label: 'Nhập đáp án bằng số thập phân', format: 'DECIMAL' },
          answerKey: { type: 'NUMERIC_RESPONSE', value },
          explanation: text(`Ghi chú nêu số ${value}. Câu hỏi tổng hợp chỉ dùng để diễn tập kỹ thuật.`),
          stimulusVersionId: null, evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
        });
        const draft = receipt.body;
        if (receipt.status !== 201 || !draft?.versionId) throw new Error('Rehearsal numeric draft was rejected');
        await numericWorkflow.submitReview(fixture.principals.author, draft.versionId, randomUUID(), { expectedRevision: 1 });
        await numericWorkflow.confirmSingleton(fixture.principals.reviewer, draft.versionId, randomUUID(), {
          expectedRevision: 2, contentHash: draft.contentHash, reason: 'Synthetic rehearsal item; no other version exists.' });
        await numericWorkflow.review(fixture.principals.reviewer, draft.versionId, randomUUID(), {
          expectedRevision: 2, contentHash: draft.contentHash, decision: 'APPROVE', rubric: { ...RUBRIC },
          reason: 'Synthetic rehearsal fixture only; not a human review of real content.' });
      });
    }
    // Unpublished items give the staff review queue something to show; students never receive them.
    const math = domains[0];
    await inBatches(Array.from({ length: queue.inReview }, (_, index) => index), async (index) => {
      const draft = await createDraft(math, 1_000 + index, 'Bản chờ rà soát');
      await fixture.workflow.submitReview(fixture.principals.author, draft.versionId, randomUUID(), { expectedRevision: 1 });
    });
    await inBatches(Array.from({ length: queue.draft }, (_, index) => index),
      (index) => createDraft(math, 2_000 + index, 'Bản nháp'));

    const backup = await backupLocalDatabase({ connectionConfig: fixture.harness.database.connectionConfig,
      directory: path.join(directory, 'archive') });
    await fixture.close();
    fixture = null;
    let closing;
    return { archive: backup.archive, roles: backup.roles, directory, counts: { ...counts }, queue: { ...queue }, numeric,
      close() { closing ??= rm(directory, { recursive: true, force: true }); return closing; } };
  } catch (error) {
    await fixture?.close().catch(() => {});
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
