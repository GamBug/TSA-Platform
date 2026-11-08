import { createHash } from 'node:crypto';
import { canonicalize, createReferenceHash } from '../../../packages/contracts/dist/internal.js';
import { buildSyntheticFactoryPackageV2 } from '../../../packages/contracts/test/fixtures/factory-package-v2.ts';

const hash = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
const uuid = (value) => {
  const chars = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  chars[12] = '4'; chars[16] = '8'; const h = chars.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export function rehashFixtureReferences(refs) {
  const nodes = new Map(refs.map((ref) => [`${ref.kind}\0${ref.id}`, ref]));
  const done = new Map(), active = new Set();
  const visit = (ref) => {
    if (!ref) throw new Error('Missing fixture dependency');
    const key = `${ref.kind}\0${ref.id}`;
    if (done.has(key)) return done.get(key);
    if (active.has(key)) throw new Error('Cyclic fixture graph');
    active.add(key);
    ref.contentHash = createReferenceHash({ kind: ref.kind, id: ref.id, payload: ref.payload, references: ref.references.map((edge) => ({
      ...edge, contentHash: visit(nodes.get(`${edge.kind}\0${edge.id}`)),
    })) });
    active.delete(key); done.set(key, ref.contentHash); return ref.contentHash;
  };
  refs.forEach(visit);
}

export function makeGenericFixtureInput({ section = 'MATH', interactionType = 'SINGLE_CHOICE',
  count = 1, withStimulus = false, operatorId = 'synthetic-operator', identitySeed = 'default' } = {}) {
  const pkg = buildSyntheticFactoryPackageV2({ candidateCount: count, withStimulus });
  const at = '2026-11-04T00:00:00Z';
  const taxonomy = pkg.references.find((ref) => ref.kind === 'taxonomy');
  const nodes = ['MATH', 'READING', 'SCIENCE'].flatMap((domain) => [
    { id: uuid(`${domain}:domain`), code: domain, kind: 'DOMAIN', parentId: null, metadata: {} },
    { id: uuid(`${domain}:skill`), code: `${domain}_SKILL`, kind: 'SKILL', parentId: uuid(`${domain}:domain`), metadata: {} },
  ]).sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  taxonomy.payload = { schemaVersion: 'taxonomy/1', taxonomyVersionId: taxonomy.id,
    name: 'Original synthetic generic taxonomy', versionNo: 1, definitionHash: hash(nodes), nodes };
  const provenance = pkg.references.find((ref) => ref.kind === 'provenance');
  provenance.payload.creator = operatorId;
  provenance.payload.transformation = 'DETERMINISTIC_FIXTURE_NOT_LLM';
  const source = pkg.references.find((ref) => ref.kind === 'source');
  source.payload = { title: 'Original synthetic source', content: [{ type: 'text', text: 'Đây là nguồn tổng hợp chỉ dùng để kiểm thử phần mềm.' }] };
  if (withStimulus) pkg.references.find((ref) => ref.kind === 'stimulus').payload.content = [
    { type: 'text', text: 'Đoạn văn tổng hợp dùng chung cho các câu hỏi kiểm thử.' },
  ];
  rehashFixtureReferences(pkg.references);
  const candidates = pkg.candidates.map(({ question }, index) => {
    const seed = `${identitySeed}:${section}:${interactionType}:${withStimulus}:${index}`;
    question.id = uuid(`version:${seed}`); question.questionId = uuid(`question:${seed}`);
    question.section = section; question.domainId = section; question.skillIds = [`${section}_SKILL`]; question.subskillIds = [];
    question.cognitiveLevel = 'M1'; question.createdBy = operatorId; question.createdAt = at; question.generationRunId = null;
    question.content = [{ type: 'text', text: `Câu hỏi tổng hợp ${section} ${interactionType} số ${index + 1}.` }];
    const choices = ['a', 'b'].map((id) => ({ id, content: [{ type: 'text', text: `Phương án ${id}` }] }));
    question.interaction = interactionType === 'TRUE_FALSE_GROUP'
      ? { type: interactionType, statements: choices }
      : { type: interactionType, options: choices, ...(interactionType === 'MULTIPLE_CHOICE' ? { minSelections: 1, maxSelections: 2 } : {}) };
    question.private.answerKey = interactionType === 'SINGLE_CHOICE' ? { type: interactionType, optionId: 'a' }
      : interactionType === 'MULTIPLE_CHOICE' ? { type: interactionType, optionIds: ['a'] }
        : { type: interactionType, values: { a: true, b: false } };
    question.private.explanation = [{ type: 'text', text: 'Lời giải tổng hợp; chưa được thẩm định nội dung.' }];
    question.contentHash = `sha256:${'0'.repeat(64)}`;
    return question;
  });
  const request = { specificationVersion: 'generation/1', requestId: `${identitySeed}/${section}/${interactionType}/${withStimulus}`,
    sourceVersionIds: [source.id], taxonomyVersionId: taxonomy.id, section, skillIds: [`${section}_SKILL`],
    interactionType, cognitiveLevel: 'M1', language: 'vi-VN', count,
    promptTemplateVersion: 'generic-synthetic/1', outputSchemaVersion: 'question/1', seed: 1,
    budget: { maxInputTokens: 0, maxOutputTokens: 0, maxCostMicros: 0 } };
  const bindings = candidates.map((q, index) => ({ itemKey: `${section}/${interactionType}`, candidateOrdinal: index,
    questionVersionId: q.id, questionId: q.questionId, versionNo: q.versionNo, parentVersionId: q.parentVersionId,
    domainId: q.domainId, subskillIds: q.subskillIds, difficulty: q.difficulty, stimulusVersionId: q.stimulusVersionId,
    provenanceIds: q.provenanceIds, evidenceRefs: q.private.evidenceRefs }));
  return { context: { fixture: true, namespace: `fixture.generic.${identitySeed}.${section}.${interactionType}.${withStimulus}`,
    batch: 'fixture-batch', at, operatorId, references: pkg.references, rightsEvidence: pkg.rightsEvidence },
  calls: [{ request, approvedSourcePayload: { schemaVersion: 'generic-approved-source/1',
    sources: [{ sourceVersionId: source.id, ...source.payload }] }, bindings,
  fixtureResult: { candidates, providerRunRef: null, modelRevision: 'fixture/fake-generation-adapter/1',
    usage: { inputTokens: 0, outputTokens: 0, costMicros: 0 }, finishReason: 'COMPLETE' } }] };
}
