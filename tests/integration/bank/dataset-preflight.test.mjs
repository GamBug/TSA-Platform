import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canonicalize,
  computeQuestionIdentity,
  createReferenceHash,
} from '../../../packages/contracts/dist/internal.js';
import { preflightDataset } from '../../../src/modules/bank/dataset-preflight.mjs';

const id = (index) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const rubric = ['correctness', 'ambiguity', 'relevance', 'language', 'explanation', 'rights', 'equivalence'];

function sealNodes(nodes) {
  const byKey = new Map(nodes.map((node) => [`${node.kind}\0${node.id}`, node]));
  const completed = new Map();
  const seal = (node) => {
    const key = `${node.kind}\0${node.id}`;
    if (completed.has(key)) return completed.get(key);
    const dependencies = node.references.map((reference) => {
      const child = byKey.get(`${reference.kind}\0${reference.id}`);
      if (!child) throw new Error('fixture contains a missing reference');
      const sealed = seal(child);
      return { kind: sealed.kind, id: sealed.id, contentHash: sealed.contentHash };
    });
    const sealed = {
      ...node,
      contentHash: createReferenceHash({
        kind: node.kind,
        id: node.id,
        payload: node.payload,
        references: dependencies,
      }),
    };
    completed.set(key, sealed);
    return sealed;
  };
  return nodes.map(seal);
}

function sharedReferences() {
  return sealNodes([
    { kind: 'taxonomy', id: id(900), payload: { name: 'Synthetic taxonomy' }, references: [] },
    {
      kind: 'source', id: 'source-synthetic',
      payload: {
        title: 'Synthetic source', lawfulInventoryClaim: true, rightsClaim: 'CURRENT',
        authorClaim: 'named-author', reviewerClaim: 'independent-reviewer',
        secretEvidence: 'SOURCE_EVIDENCE_SECRET',
      },
      references: [],
    },
    {
      kind: 'provenance', id: 'provenance-synthetic',
      payload: { sourceVersion: 'synthetic-v1' },
      references: [{ kind: 'source', id: 'source-synthetic' }],
    },
    {
      kind: 'evidence', id: 'evidence-synthetic',
      payload: { note: 'SYNTHETIC_EVIDENCE_SECRET' },
      references: [{ kind: 'source', id: 'source-synthetic' }],
    },
  ]);
}

function buildQuestion(index, options = {}) {
  const interactionType = options.interactionType ?? ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'][index % 3];
  const optionsContent = [
    { id: `option-${index}-a`, content: [{ type: 'text', text: 'First answer' }] },
    { id: `option-${index}-b`, content: [{ type: 'text', text: 'Second answer' }] },
  ];
  const interaction = interactionType === 'TRUE_FALSE_GROUP'
    ? { type: interactionType, statements: [
      { id: `statement-${index}-a`, content: [{ type: 'text', text: 'First statement' }] },
      { id: `statement-${index}-b`, content: [{ type: 'text', text: 'Second statement' }] },
    ] }
    : interactionType === 'MULTIPLE_CHOICE'
      ? { type: interactionType, options: optionsContent, minSelections: 1, maxSelections: 1 }
      : { type: interactionType, options: optionsContent };
  const answerKey = interactionType === 'TRUE_FALSE_GROUP'
    ? { type: interactionType, values: { [`statement-${index}-a`]: true, [`statement-${index}-b`]: false } }
    : interactionType === 'MULTIPLE_CHOICE'
      ? { type: interactionType, optionIds: [`option-${index}-a`] }
      : { type: interactionType, optionId: `option-${index}-a` };
  return {
    schemaVersion: 'question/1',
    id: id(1000 + index),
    questionId: id(2000 + index),
    versionNo: options.versionNo ?? 1,
    parentVersionId: null,
    language: 'vi-VN',
    section: options.section ?? 'MATH',
    taxonomyVersionId: id(900),
    domainId: `synthetic-${options.section ?? 'MATH'}`,
    skillIds: [],
    subskillIds: [],
    cognitiveLevel: null,
    difficulty: { target: null, predicted: null, empiricalStudyId: null },
    content: [{ type: 'text', text: options.text ?? `Synthetic question ${index}` }],
    stimulusVersionId: null,
    interaction,
    private: {
      answerKey,
      explanation: [{ type: 'text', text: 'PRIVATE_EXPLANATION_SECRET' }],
      evidenceRefs: ['evidence-synthetic'],
      scoringPolicy: 'practice-binary-v1',
    },
    origin: 'MANUAL',
    provenanceIds: ['provenance-synthetic'],
    generationRunId: null,
    createdBy: 'synthetic-author',
    createdAt: '2026-10-20T00:00:00Z',
    contentHash: 'sha256:placeholder',
  };
}

function item(index, options = {}) {
  const question = buildQuestion(index, options);
  const references = options.references ?? sharedReferences();
  question.contentHash = computeQuestionIdentity(question, references).contentHash;
  return { question, references };
}

function makeTargetItems() {
  return [
    ...Array.from({ length: 12 }, (_, index) => item(index, { section: 'MATH' })),
    ...Array.from({ length: 6 }, (_, offset) => item(12 + offset, { section: 'READING' })),
    ...Array.from({ length: 12 }, (_, offset) => item(18 + offset, { section: 'SCIENCE' })),
  ];
}

function reverseReferenceOrder(dataset) {
  return [...dataset].reverse().map(({ question, references }) => ({
    question: structuredClone(question),
    references: [...references].reverse(),
  }));
}

test('builds an order-independent exact-hash manifest, safe report and private review packet', () => {
  const dataset = makeTargetItems();
  const before = structuredClone(dataset);
  const result = preflightDataset({ items: dataset });
  const reordered = preflightDataset({ items: reverseReferenceOrder(dataset) });

  assert.equal(result.manifest.digest, reordered.manifest.digest);
  assert.equal(result.report.digest, reordered.report.digest);
  assert.equal(result.reviewPacket.digest, reordered.reviewPacket.digest);
  assert.deepEqual(result.report.counts.bySection, { MATH: 12, READING: 6, SCIENCE: 12 });
  assert.deepEqual(result.report.shortfalls, { MATH: 0, READING: 0, SCIENCE: 0 });
  assert.deepEqual(result.report.counts.byInteractionType, {
    SINGLE_CHOICE: 10, MULTIPLE_CHOICE: 10, TRUE_FALSE_GROUP: 10,
  });
  assert.deepEqual(result.report.counts.bySectionAndInteractionType, {
    MATH: { SINGLE_CHOICE: 4, MULTIPLE_CHOICE: 4, TRUE_FALSE_GROUP: 4 },
    READING: { SINGLE_CHOICE: 2, MULTIPLE_CHOICE: 2, TRUE_FALSE_GROUP: 2 },
    SCIENCE: { SINGLE_CHOICE: 4, MULTIPLE_CHOICE: 4, TRUE_FALSE_GROUP: 4 },
  });
  assert.deepEqual(result.reviewPacket.rubric, rubric);
  assert.equal(result.reviewPacket.items[0].contentHash, result.manifest.items[0].contentHash);
  assert.equal(result.reviewPacket.items[0].questionId, result.manifest.items[0].questionId);
  assert.deepEqual(result.reviewPacket.items[0].evidenceHashRefs, [{
    id: 'evidence-synthetic',
    contentHash: result.manifest.items[0].referenceClosure.find((reference) => reference.kind === 'evidence').contentHash,
  }]);
  assert.equal(result.report.publishing, false);
  assert.equal(Object.hasOwn(result.report, 'eligible'), false);
  assert.equal(Object.hasOwn(result.report, 'approval'), false);
  assert.deepEqual(dataset, before);
  assert.equal(JSON.stringify(result).includes('PRIVATE_EXPLANATION_SECRET'), false);
  assert.equal(JSON.stringify(result).includes('SOURCE_EVIDENCE_SECRET'), false);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_EVIDENCE_SECRET'), false);
  assert.equal(JSON.stringify(result).includes('Synthetic question 0'), false);
  assert.equal(JSON.stringify(result).includes('"answerKey"'), false);
  assert.ok(Buffer.from(canonicalize(result.manifest)).length > 0);
});

test('reports 12/6/12 shortfalls and never treats synthetic claims as verified prerequisites', () => {
  const result = preflightDataset({ items: [item(1)] });

  assert.deepEqual(result.report.shortfalls, { MATH: 11, READING: 6, SCIENCE: 12 });
  assert.deepEqual(result.report.blockerCodes, [
    'CURRENT_RIGHTS_UNVERIFIED',
    'HUMAN_EQUIVALENCE_REVIEW_REQUIRED',
    'LAWFUL_INVENTORY_UNVERIFIED',
    'NAMED_HUMAN_AUTHOR_REQUIRED',
    'NAMED_INDEPENDENT_REVIEWER_REQUIRED',
    'STARTER_TARGET_SHORTFALL',
  ]);
});

test('flags normalized duplicate fingerprints without collapsing item identities', () => {
  const first = item(1, { interactionType: 'SINGLE_CHOICE', text: '  A\u00a0synthetic question  ' });
  const second = item(2, { section: 'SCIENCE', interactionType: 'SINGLE_CHOICE', text: 'A synthetic question' });
  const result = preflightDataset({ items: [first, second] });

  assert.equal(result.report.duplicateFingerprintGroups.length, 1);
  assert.equal(result.report.duplicateFingerprintGroups[0].items.length, 2);
  assert.ok(result.report.blockerCodes.includes('DUPLICATE_FINGERPRINTS_REQUIRE_REVIEW'));
  assert.equal(result.manifest.items.length, 2);
});

test('changes digests when exact answer-bearing version or reference closure changes', () => {
  const original = item(1);
  const baseline = preflightDataset({ items: [original] });
  const changedAnswer = structuredClone(original);
  changedAnswer.question.private.answerKey.optionIds = ['option-1-b'];
  changedAnswer.question.contentHash = computeQuestionIdentity(changedAnswer.question, changedAnswer.references).contentHash;
  const answerResult = preflightDataset({ items: [changedAnswer] });
  const reorderedAuthoredArray = structuredClone(original);
  reorderedAuthoredArray.question.interaction.options.reverse();
  reorderedAuthoredArray.question.contentHash = computeQuestionIdentity(
    reorderedAuthoredArray.question,
    reorderedAuthoredArray.references,
  ).contentHash;
  const reorderedResult = preflightDataset({ items: [reorderedAuthoredArray] });
  const changedReference = structuredClone(original);
  changedReference.references.find((reference) => reference.kind === 'source').payload.title = 'Changed synthetic source';
  changedReference.references = sealNodes(changedReference.references);
  changedReference.question.contentHash = computeQuestionIdentity(changedReference.question, changedReference.references).contentHash;
  const referenceResult = preflightDataset({ items: [changedReference] });

  assert.notEqual(answerResult.manifest.digest, baseline.manifest.digest);
  assert.notEqual(reorderedResult.manifest.digest, baseline.manifest.digest);
  assert.notEqual(referenceResult.manifest.digest, baseline.manifest.digest);
});

test('rejects stale question hashes, repeated identities/versions and malformed or oversized input', () => {
  const stale = item(1);
  stale.question.contentHash = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => preflightDataset({ items: [stale] }), /STALE_QUESTION_CONTENT_HASH/);

  const repeatedIdentity = item(2, { versionNo: 2 });
  repeatedIdentity.question.questionId = item(1).question.questionId;
  repeatedIdentity.question.contentHash = computeQuestionIdentity(repeatedIdentity.question, repeatedIdentity.references).contentHash;
  assert.throws(() => preflightDataset({ items: [item(1), repeatedIdentity] }), /DUPLICATE_QUESTION_IDENTITY/);
  assert.throws(() => preflightDataset({ items: [item(4), item(4)] }), /DUPLICATE_QUESTION_VERSION/);

  assert.throws(() => preflightDataset({ items: [{ question: {} }] }), /INVALID_PREFLIGHT_INPUT/);
  assert.throws(() => preflightDataset({ items: Array.from({ length: 101 }, (_, index) => item(index)) }), /PREFLIGHT_ITEM_LIMIT/);
  const oversized = item(3);
  oversized.question.content[0].text = 'x'.repeat(300_000);
  assert.throws(() => preflightDataset({ items: [oversized] }), /INVALID_PREFLIGHT_ITEM/);
});

test('rejects incomplete/corrupt DAGs and conflicting hashes for a shared reference identity', () => {
  const incomplete = item(1);
  incomplete.references = incomplete.references.filter((reference) => reference.kind !== 'source');
  assert.throws(() => preflightDataset({ items: [incomplete] }), /INVALID_PREFLIGHT_ITEM/);

  const corrupt = item(2);
  corrupt.references.find((reference) => reference.kind === 'evidence').contentHash = `sha256:${'f'.repeat(64)}`;
  assert.throws(() => preflightDataset({ items: [corrupt] }), /INVALID_PREFLIGHT_ITEM/);

  const cyclic = item(5);
  cyclic.references.find((reference) => reference.kind === 'source').references = [
    { kind: 'provenance', id: 'provenance-synthetic' },
  ];
  assert.throws(() => preflightDataset({ items: [cyclic] }), /INVALID_PREFLIGHT_ITEM/);

  const first = item(3);
  const second = item(4);
  const conflictingSource = second.references.find((reference) => reference.kind === 'source');
  conflictingSource.payload.title = 'Different content under same immutable source ID';
  second.references = sealNodes(second.references);
  second.question.contentHash = computeQuestionIdentity(second.question, second.references).contentHash;
  assert.throws(() => preflightDataset({ items: [first, second] }), /REFERENCE_IDENTITY_CONFLICT/);
});
