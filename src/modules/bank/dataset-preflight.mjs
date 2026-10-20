import { createHash } from 'node:crypto';
import {
  QuestionVersionSchema,
  canonicalize,
  computeDuplicateFingerprint,
  computeQuestionIdentity,
} from '../../../packages/contracts/dist/internal.js';

export const MAX_PREFLIGHT_ITEMS = 100;
export const MAX_PREFLIGHT_CANONICAL_BYTES = 16 * 1024 * 1024;
const SECTIONS = ['MATH', 'READING', 'SCIENCE'];
const INTERACTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'];
const TARGETS = Object.freeze({ MATH: 12, READING: 6, SCIENCE: 12 });
const REVIEW_RUBRIC = Object.freeze([
  'correctness',
  'ambiguity',
  'relevance',
  'language',
  'explanation',
  'rights',
  'equivalence',
]);
const REQUIRED_BLOCKERS = Object.freeze([
  'CURRENT_RIGHTS_UNVERIFIED',
  'HUMAN_EQUIVALENCE_REVIEW_REQUIRED',
  'LAWFUL_INVENTORY_UNVERIFIED',
  'NAMED_HUMAN_AUTHOR_REQUIRED',
  'NAMED_INDEPENDENT_REVIEWER_REQUIRED',
]);

function fail(code) {
  throw new TypeError(code);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function digest(value) {
  return sha256(canonicalize(value));
}

function assertPlainRecord(value, allowedKeys, requiredKeys, code) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string' || !allowedKeys.includes(key))) fail(code);
  for (const key of requiredKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail(code);
  }
  return value;
}

function assertDensePlainArray(value, code) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string'
    || (key !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)))) fail(code);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail(code);
  }
  return value;
}

function closureFor(references) {
  return references.map(({ kind, id, contentHash }) => ({ kind, id, contentHash }))
    .sort((left, right) => compareText(left.kind, right.kind) || compareText(left.id, right.id));
}

function countTemplate() {
  const bySection = Object.fromEntries(SECTIONS.map((section) => [section, 0]));
  const byInteractionType = Object.fromEntries(INTERACTION_TYPES.map((type) => [type, 0]));
  const bySectionAndInteractionType = Object.fromEntries(SECTIONS.map((section) => [
    section,
    Object.fromEntries(INTERACTION_TYPES.map((type) => [type, 0])),
  ]));
  return { bySection, byInteractionType, bySectionAndInteractionType };
}

function buildDuplicateGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const group = groups.get(record.fingerprint) ?? [];
    group.push({
      questionId: record.questionId,
      versionId: record.versionId,
      versionNo: record.versionNo,
      contentHash: record.contentHash,
    });
    groups.set(record.fingerprint, group);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .sort(([left], [right]) => compareText(left, right))
    .map(([fingerprint, items]) => ({
      fingerprint,
      items: items.sort((left, right) => compareText(left.questionId, right.questionId)
        || left.versionNo - right.versionNo || compareText(left.versionId, right.versionId)),
    }));
}

/**
 * Build deterministic internal manifest, report and private review-packet candidates.
 * Input is `{items:[{question,references}]}` with a complete identity/1 graph per question.
 * This helper validates immutable content but cannot verify lawful inventory, current rights,
 * human identities, or human equivalence decisions; its outputs never authorize publication.
 */
export function preflightDataset(input) {
  assertPlainRecord(input, ['items'], ['items'], 'INVALID_PREFLIGHT_INPUT');
  const suppliedItems = assertDensePlainArray(input.items, 'INVALID_PREFLIGHT_INPUT');
  if (suppliedItems.length > MAX_PREFLIGHT_ITEMS) fail('PREFLIGHT_ITEM_LIMIT');

  let aggregateBytes = 0;
  const records = [];
  const stableIdentities = new Set();
  const stableVersions = new Set();
  const versionIds = new Set();
  const sharedReferenceHashes = new Map();

  for (const supplied of suppliedItems) {
    assertPlainRecord(supplied, ['question', 'references'], ['question', 'references'], 'INVALID_PREFLIGHT_INPUT');

    let question;
    let identity;
    let fingerprint;
    let referenceClosure;
    try {
      const questionBytes = canonicalize(supplied.question);
      const referenceBytes = canonicalize(supplied.references);
      aggregateBytes += questionBytes.byteLength + referenceBytes.byteLength;
      if (aggregateBytes > MAX_PREFLIGHT_CANONICAL_BYTES) fail('PREFLIGHT_BYTE_LIMIT');

      question = QuestionVersionSchema.parse(supplied.question);
      identity = computeQuestionIdentity(question, supplied.references);
      fingerprint = computeDuplicateFingerprint(question, supplied.references).fingerprint;
      referenceClosure = closureFor(supplied.references);
    } catch (error) {
      if (error instanceof TypeError && error.message === 'PREFLIGHT_BYTE_LIMIT') throw error;
      fail('INVALID_PREFLIGHT_ITEM');
    }

    if (question.contentHash !== identity.contentHash) fail('STALE_QUESTION_CONTENT_HASH');

    const stableVersionKey = `${question.questionId}\0${question.versionNo}`;
    if (stableVersions.has(stableVersionKey) || versionIds.has(question.id)) fail('DUPLICATE_QUESTION_VERSION');
    if (stableIdentities.has(question.questionId)) fail('DUPLICATE_QUESTION_IDENTITY');
    stableVersions.add(stableVersionKey);
    stableIdentities.add(question.questionId);
    versionIds.add(question.id);

    for (const reference of referenceClosure) {
      const referenceKey = `${reference.kind}\0${reference.id}`;
      const previousHash = sharedReferenceHashes.get(referenceKey);
      if (previousHash !== undefined && previousHash !== reference.contentHash) fail('REFERENCE_IDENTITY_CONFLICT');
      sharedReferenceHashes.set(referenceKey, reference.contentHash);
    }

    const referenceClosureHash = digest({
      schemaVersion: 'reference-closure/1',
      references: referenceClosure,
    });
    records.push({
      questionId: question.questionId,
      versionId: question.id,
      versionNo: question.versionNo,
      section: question.section,
      interactionType: question.interaction.type,
      contentHash: identity.contentHash,
      referenceClosureHash,
      referenceClosure,
      fingerprint,
    });
  }

  records.sort((left, right) => compareText(left.questionId, right.questionId)
    || left.versionNo - right.versionNo || compareText(left.versionId, right.versionId));

  const manifestBody = {
    schemaVersion: 'dataset-manifest-candidate/1',
    items: records.map((record) => ({
      questionId: record.questionId,
      versionId: record.versionId,
      versionNo: record.versionNo,
      section: record.section,
      interactionType: record.interactionType,
      contentHash: record.contentHash,
      referenceClosureHash: record.referenceClosureHash,
      referenceClosure: record.referenceClosure,
    })),
  };
  const manifest = { ...manifestBody, digest: digest(manifestBody) };

  const counts = countTemplate();
  counts.total = records.length;
  for (const record of records) {
    counts.bySection[record.section] += 1;
    counts.byInteractionType[record.interactionType] += 1;
    counts.bySectionAndInteractionType[record.section][record.interactionType] += 1;
  }
  const shortfalls = Object.fromEntries(SECTIONS.map((section) => [
    section,
    Math.max(0, TARGETS[section] - counts.bySection[section]),
  ]));
  const duplicateFingerprintGroups = buildDuplicateGroups(records);
  const blockerCodes = [...REQUIRED_BLOCKERS];
  if (Object.values(shortfalls).some((shortfall) => shortfall > 0)) blockerCodes.push('STARTER_TARGET_SHORTFALL');
  if (duplicateFingerprintGroups.length > 0) blockerCodes.push('DUPLICATE_FINGERPRINTS_REQUIRE_REVIEW');
  blockerCodes.sort(compareText);

  const reportBody = {
    schemaVersion: 'dataset-preflight-report/1',
    publishing: false,
    manifestDigest: manifest.digest,
    targets: { ...TARGETS },
    counts,
    shortfalls,
    duplicateFingerprintGroups,
    reviewChecklist: [...REVIEW_RUBRIC],
    blockerCodes,
  };
  const report = { ...reportBody, digest: digest(reportBody) };

  const reviewPacketBody = {
    schemaVersion: 'private-review-packet/1',
    manifestDigest: manifest.digest,
    rubric: [...REVIEW_RUBRIC],
    items: records.map((record) => ({
      questionId: record.questionId,
      versionId: record.versionId,
      versionNo: record.versionNo,
      contentHash: record.contentHash,
      referenceClosureHash: record.referenceClosureHash,
      evidenceHashRefs: record.referenceClosure
        .filter((reference) => reference.kind === 'evidence')
        .map(({ id, contentHash }) => ({ id, contentHash })),
      sourceHashRefs: record.referenceClosure
        .filter((reference) => reference.kind === 'source' || reference.kind === 'provenance')
        .map(({ kind, id, contentHash }) => ({ kind, id, contentHash })),
      checklist: [...REVIEW_RUBRIC],
    })),
  };
  const reviewPacket = { ...reviewPacketBody, digest: digest(reviewPacketBody) };

  return { manifest, report, reviewPacket };
}
