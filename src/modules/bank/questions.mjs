import { randomUUID } from 'node:crypto';
import {
  AnswerKeySchema,
  BlockSchema,
  InteractionSchema,
  QuestionVersionSchema,
  canonicalize,
  computeDuplicateFingerprint,
  computeQuestionIdentity,
  createReferenceHash,
} from '../../../packages/contracts/dist/internal.js';
import {
  MANUAL_REFERENCE_NAMESPACE,
  MAX_REFERENCE_NODES,
  BankCommandError,
  assertBankConnection,
  compareReference,
  nonEmptyString,
  reject,
  referenceKey,
  requireActor,
  resolveReferenceGraph,
  storeReferenceGraph,
  strictRecord,
  withIdempotency,
} from './common.mjs';
import { withTransaction } from '../database/pool.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const QUESTION_DRAFT_KEYS = [
  'schemaVersion', 'language', 'section', 'taxonomyVersionId', 'domainId', 'skillIds', 'subskillIds',
  'cognitiveLevel', 'targetDifficulty', 'content', 'stimulusVersionId', 'interaction', 'answerKey',
  'explanation', 'evidenceRefs', 'origin', 'provenance',
];
const PRIVATE_NAMESPACE_PREFIX = 'question/1/';
const DRAFT_HASH_PLACEHOLDER = `sha256:${'0'.repeat(64)}`;
const WORKFLOW_STATES = new Set(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'QUARANTINED', 'RETIRED']);
const SECTIONS = new Set(['MATH', 'READING', 'SCIENCE']);
const COGNITIVE_LEVELS = new Set(['M1', 'M2', 'M3']);
const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);

function parseJson(value) {
  if (typeof value !== 'string') return value;
  return JSON.parse(value);
}

function arraysAreUnique(values) {
  return Array.isArray(values) && new Set(values).size === values.length;
}

function imageAssets(value, purpose, result = new Map()) {
  if (Array.isArray(value)) {
    for (const item of value) imageAssets(item, purpose, result);
  } else if (value !== null && typeof value === 'object') {
    if (value.type === 'image' && typeof value.assetVersionId === 'string') {
      const uses = result.get(value.assetVersionId) ?? new Set();
      uses.add(purpose);
      result.set(value.assetVersionId, uses);
    }
    for (const item of Object.values(value)) imageAssets(item, purpose, result);
  }
  return result;
}

function requiredRoots(question) {
  const roots = [{ kind: 'taxonomy', id: question.taxonomyVersionId }];
  if (question.parentVersionId !== null) roots.push({ kind: 'question', id: question.parentVersionId });
  if (question.stimulusVersionId !== null) roots.push({ kind: 'stimulus', id: question.stimulusVersionId });
  for (const id of question.provenanceIds) roots.push({ kind: 'provenance', id });
  for (const id of question.private.evidenceRefs) roots.push({ kind: 'evidence', id });
  const assets = imageAssets(question.content, 'QUESTION');
  imageAssets(question.interaction, 'QUESTION', assets);
  imageAssets(question.private.explanation, 'EXPLANATION', assets);
  for (const id of assets.keys()) roots.push({ kind: 'asset', id });
  return roots;
}

function deduplicateDefinitions(definitions) {
  const byKey = new Map();
  for (const node of definitions) {
    const key = referenceKey(node.kind, node.id);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, node);
      continue;
    }
    if (!Buffer.from(canonicalize(existing.payload)).equals(Buffer.from(canonicalize(node.payload)))
        || !Buffer.from(canonicalize(existing.references)).equals(Buffer.from(canonicalize(node.references)))
        || (existing.contentHash !== undefined && node.contentHash !== undefined
          && existing.contentHash !== node.contentHash)) {
      reject(422, 'REFERENCE_ID_CONFLICT');
    }
  }
  return [...byKey.values()];
}

async function loadTaxonomyNode(client, taxonomyVersionId) {
  const result = await client.query(
    `SELECT tv.id AS taxonomy_id, tv.name, tv.version_no, tv.definition_hash,
            tn.id, tn.code, tn.kind, tn.parent_id, tn.metadata
       FROM tsa.taxonomy_versions tv
       LEFT JOIN tsa.taxonomy_nodes tn ON tn.taxonomy_version_id = tv.id
      WHERE tv.id = $1 ORDER BY tn.code`, [taxonomyVersionId]);
  if (result.rowCount === 0) reject(422, 'TAXONOMY_NOT_FOUND');
  const first = result.rows[0];
  const nodes = result.rows.filter((row) => row.id !== null).map((row) => ({
    id: row.id,
    code: row.code,
    kind: row.kind,
    parentId: row.parent_id,
    metadata: parseJson(row.metadata),
  }));
  if (nodes.length === 0) reject(422, 'TAXONOMY_NOT_FOUND');
  return {
    kind: 'taxonomy',
    id: taxonomyVersionId,
    payload: {
      schemaVersion: 'taxonomy/1',
      taxonomyVersionId,
      name: first.name,
      versionNo: Number(first.version_no),
      definitionHash: first.definition_hash,
      nodes,
    },
    references: [],
  };
}

function validateTaxonomyMembership(question, taxonomyNode) {
  const nodes = taxonomyNode.payload.nodes;
  const byCode = new Map(nodes.map((node) => [node.code, node]));
  const domain = byCode.get(question.domainId);
  if (!domain || domain.kind !== 'DOMAIN') reject(422, 'TAXONOMY_MEMBERSHIP_INVALID');
  const skillNodes = [];
  for (const id of question.skillIds) {
    const node = byCode.get(id);
    if (!node || node.kind !== 'SKILL' || node.parentId !== domain.id) reject(422, 'TAXONOMY_MEMBERSHIP_INVALID');
    skillNodes.push(node);
  }
  const skillNodeIds = new Set(skillNodes.map((node) => node.id));
  for (const id of question.subskillIds) {
    const node = byCode.get(id);
    if (!node || node.kind !== 'SUBSKILL' || !skillNodeIds.has(node.parentId)) reject(422, 'TAXONOMY_MEMBERSHIP_INVALID');
  }
}

function canonicalizeTaxonomyIds(draft, taxonomyNode) {
  const nodes = taxonomyNode.payload.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const domain = byId.get(draft.domainId);
  if (!domain || domain.kind !== 'DOMAIN') reject(422, 'TAXONOMY_MEMBERSHIP_INVALID');
  const skills = draft.skillIds.map((id) => byId.get(id));
  if (skills.some((node) => !node || node.kind !== 'SKILL' || node.parentId !== domain.id)) {
    reject(422, 'TAXONOMY_MEMBERSHIP_INVALID');
  }
  const skillIds = new Set(skills.map((node) => node.id));
  const subskills = draft.subskillIds.map((id) => byId.get(id));
  if (subskills.some((node) => !node || node.kind !== 'SUBSKILL' || !skillIds.has(node.parentId))) {
    reject(422, 'TAXONOMY_MEMBERSHIP_INVALID');
  }
  return {
    ...draft,
    domainId: domain.code,
    skillIds: skills.map((node) => node.code),
    subskillIds: subskills.map((node) => node.code),
  };
}

async function loadQuestionRow(client, versionId) {
  const result = await client.query(
    `SELECT qv.id, qv.question_id, qv.version_no, qv.parent_version_id,
            qv.schema_version, qv.language, qv.section, qv.taxonomy_version_id,
            qv.domain_id, qv.skill_ids, qv.subskill_ids, qv.cognitive_level,
            qv.difficulty, qv.content, qv.stimulus_version_id, qv.interaction,
            qv.origin, qv.provenance_ids, qv.generation_run_id, qv.created_by,
            qv.authored_created_at, qv.content_hash, qv.normalized_fingerprint,
            qv.reference_namespace, qs.answer_key, qs.explanation, qs.evidence,
            qs.scoring_policy_version
       FROM tsa.question_versions qv
       JOIN tsa_private.question_secrets qs ON qs.question_version_id = qv.id
      WHERE qv.id = $1`, [versionId]);
  return result.rows[0] ?? null;
}

function toQuestionVersion(row) {
  if (!row.authored_created_at || !row.reference_namespace) reject(422, 'PARENT_REFERENCE_NOT_REGISTERED');
  return QuestionVersionSchema.parse({
    schemaVersion: row.schema_version,
    id: row.id,
    questionId: row.question_id,
    versionNo: Number(row.version_no),
    parentVersionId: row.parent_version_id,
    language: row.language,
    section: row.section,
    taxonomyVersionId: row.taxonomy_version_id,
    domainId: row.domain_id,
    skillIds: parseJson(row.skill_ids),
    subskillIds: parseJson(row.subskill_ids),
    cognitiveLevel: row.cognitive_level,
    difficulty: parseJson(row.difficulty),
    content: parseJson(row.content),
    stimulusVersionId: row.stimulus_version_id,
    interaction: parseJson(row.interaction),
    private: {
      answerKey: parseJson(row.answer_key),
      explanation: parseJson(row.explanation),
      evidenceRefs: parseJson(row.evidence),
      scoringPolicy: row.scoring_policy_version,
    },
    origin: row.origin,
    provenanceIds: parseJson(row.provenance_ids),
    generationRunId: row.generation_run_id,
    createdBy: row.created_by,
    createdAt: row.authored_created_at,
    contentHash: row.content_hash,
  });
}

function questionProjection(question) {
  const { contentHash: _contentHash, ...projection } = question;
  return projection;
}

async function loadParentGraph(client, parentVersionId, questionId) {
  const row = await loadQuestionRow(client, parentVersionId);
  if (!row || row.question_id !== questionId) reject(404, 'NOT_FOUND');
  const question = toQuestionVersion(row);
  const parentNodeClosure = await resolveReferenceGraph(client, row.reference_namespace,
    [{ kind: 'question', id: parentVersionId }]);
  const parentNode = parentNodeClosure.find((node) => node.kind === 'question' && node.id === parentVersionId);
  if (!parentNode || !Buffer.from(canonicalize(parentNode.payload)).equals(Buffer.from(canonicalize(questionProjection(question))))) {
    reject(422, 'PARENT_REFERENCE_MISMATCH');
  }
  const dependencies = await resolveReferenceGraph(client, row.reference_namespace, parentNode.references);
  const identity = computeQuestionIdentity(question, dependencies);
  if (identity.contentHash !== question.contentHash) reject(422, 'PARENT_IDENTITY_MISMATCH');
  return { question, version: question, nodeClosure: parentNodeClosure };
}

async function loadManualReferences(client, question, provenanceDefinitions, parentDefinitions, taxonomyNode, assetNodes) {
  const manualRoots = [];
  for (const item of question.provenanceIds) {
    const definition = provenanceDefinitions.find((node) => node.id === item);
    for (const reference of definition.references) {
      if (reference.kind === 'source' || reference.kind === 'evidence') manualRoots.push(reference);
    }
  }
  for (const id of question.private.evidenceRefs) manualRoots.push({ kind: 'evidence', id });
  if (question.stimulusVersionId !== null) manualRoots.push({ kind: 'stimulus', id: question.stimulusVersionId });
  if (manualRoots.length === 0) return [];
  const manualClosure = await resolveReferenceGraph(client, MANUAL_REFERENCE_NAMESPACE, manualRoots);
  return deduplicateDefinitions([
    ...manualClosure,
    ...provenanceDefinitions,
    ...parentDefinitions,
    taxonomyNode,
    ...assetNodes,
  ]);
}

async function loadManualProvenance(client, principal, draft, evidenceIds) {
  const definitions = [];
  const persisted = [];
  for (const item of draft.provenance) {
    strictRecord(item, ['sourceVersionId', 'span', 'transformation'], 'provenance');
    if (!UUID_PATTERN.test(item.sourceVersionId) || !(item.span === null || typeof item.span === 'string')
        || !nonEmptyString(item.transformation, { max: 1024 * 1024 })) reject(422, 'VALIDATION_ERROR');
    const result = await client.query(
      `SELECT sv.id, sr.decision_id
         FROM tsa.source_versions sv
         LEFT JOIN tsa.source_rights sr ON sr.source_version_id = sv.id
        WHERE sv.id = $1`, [item.sourceVersionId]);
    if (result.rowCount !== 1) reject(422, 'SOURCE_VERSION_NOT_FOUND');
    const rightsEvidence = result.rows[0].decision_id;
    if (!rightsEvidence || !evidenceIds.includes(rightsEvidence)) reject(422, 'RIGHTS_EVIDENCE_REQUIRED');
    const provenanceId = randomUUID();
    const payload = {
      sourceVersionId: item.sourceVersionId,
      origin: draft.origin,
      sourceSpan: item.span,
      transformation: item.transformation,
      creator: principal.userId,
      rightsEvidence,
    };
    definitions.push({
      kind: 'provenance',
      id: provenanceId,
      payload,
      references: [
        { kind: 'source', id: item.sourceVersionId },
        { kind: 'evidence', id: rightsEvidence },
      ],
    });
    persisted.push({ ...payload, provenanceId });
  }
  return { definitions, persisted };
}

async function loadAssets(client, question) {
  const usages = imageAssets(question.content, 'QUESTION');
  imageAssets(question.interaction, 'QUESTION', usages);
  imageAssets(question.private.explanation, 'EXPLANATION', usages);
  if (usages.size === 0) return { definitions: [], usages };
  const ids = [...usages.keys()];
  const result = await client.query(
    `SELECT id, content_hash, mime, byte_size, security_class
       FROM tsa.asset_versions WHERE id = ANY($1::uuid[])`, [ids]);
  if (result.rowCount !== ids.length) reject(422, 'ASSET_NOT_FOUND');
  const definitions = result.rows.map((row) => {
    const byteLength = Number(row.byte_size);
    if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || !/^sha256:[0-9a-f]{64}$/.test(row.content_hash)) {
      reject(422, 'ASSET_METADATA_INVALID');
    }
    const purposes = usages.get(row.id);
    if (purposes.has('QUESTION') && row.security_class !== 'QUESTION'
        || purposes.has('EXPLANATION') && row.security_class !== 'EXPLANATION') reject(422, 'ASSET_PURPOSE_MISMATCH');
    return {
      kind: 'asset',
      id: row.id,
      payload: { mediaType: row.mime, byteLength, bytesHash: row.content_hash },
      references: [],
    };
  });
  return { definitions, usages };
}

function buildDraftQuestion(draft, { questionId, versionId, versionNo, parentVersionId, principal, createdAt, provenanceIds }) {
  strictRecord(draft, QUESTION_DRAFT_KEYS, 'question draft');
    if (!['MANUAL', 'IMPORTED'].includes(draft.origin)) reject(422, 'UNSUPPORTED_TYPE');
  if (!arraysAreUnique(draft.evidenceRefs) || !arraysAreUnique(draft.skillIds) || !arraysAreUnique(draft.subskillIds)) {
    reject(422, 'VALIDATION_ERROR');
  }
  return {
    schemaVersion: draft.schemaVersion,
    id: versionId,
    questionId,
    versionNo,
    parentVersionId,
    language: draft.language,
    section: draft.section,
    taxonomyVersionId: draft.taxonomyVersionId,
    domainId: draft.domainId,
    skillIds: draft.skillIds,
    subskillIds: draft.subskillIds,
    cognitiveLevel: draft.cognitiveLevel,
    difficulty: { target: draft.targetDifficulty, predicted: null, empiricalStudyId: null },
    content: draft.content,
    stimulusVersionId: draft.stimulusVersionId,
    interaction: draft.interaction,
    private: {
      answerKey: draft.answerKey,
      explanation: draft.explanation,
      evidenceRefs: draft.evidenceRefs,
      scoringPolicy: 'practice-binary-v1',
    },
    origin: draft.origin,
    provenanceIds,
    generationRunId: null,
    createdBy: principal.userId,
    createdAt,
    contentHash: DRAFT_HASH_PLACEHOLDER,
  };
}

function validateDraftInput(draft) {
  strictRecord(draft, QUESTION_DRAFT_KEYS, 'question draft');
  if (draft.schemaVersion !== 'question/1' || draft.language !== 'vi-VN'
      || !SECTIONS.has(draft.section) || !UUID_PATTERN.test(draft.taxonomyVersionId)
      || !UUID_PATTERN.test(draft.domainId) || !['MANUAL', 'IMPORTED'].includes(draft.origin)
      || !(draft.cognitiveLevel === null || COGNITIVE_LEVELS.has(draft.cognitiveLevel))
      || !(draft.targetDifficulty === null || DIFFICULTIES.has(draft.targetDifficulty))
      || !(draft.stimulusVersionId === null || UUID_PATTERN.test(draft.stimulusVersionId))) reject(422, 'VALIDATION_ERROR');
  for (const values of [draft.skillIds, draft.subskillIds, draft.evidenceRefs]) {
    if (!Array.isArray(values) || values.some((value) => !nonEmptyString(value, { max: 2_048 }))) reject(422, 'VALIDATION_ERROR');
  }
  if ([...draft.skillIds, ...draft.subskillIds].some((id) => !UUID_PATTERN.test(id))) reject(422, 'VALIDATION_ERROR');
  if (!arraysAreUnique(draft.skillIds) || !arraysAreUnique(draft.subskillIds)
      || !arraysAreUnique(draft.evidenceRefs) || !Array.isArray(draft.provenance)
      || draft.provenance.length < 1 || draft.provenance.length > MAX_REFERENCE_NODES) reject(422, 'VALIDATION_ERROR');
  for (const block of [...(Array.isArray(draft.content) ? draft.content : []),
    ...(Array.isArray(draft.explanation) ? draft.explanation : [])]) {
    if (!BlockSchema.safeParse(block).success) reject(422, 'VALIDATION_ERROR');
  }
  if (!Array.isArray(draft.content) || !Array.isArray(draft.explanation)
      || !InteractionSchema.safeParse(draft.interaction).success
      || !AnswerKeySchema.safeParse(draft.answerKey).success) reject(422, 'VALIDATION_ERROR');
  for (const item of draft.provenance) {
    strictRecord(item, ['sourceVersionId', 'span', 'transformation'], 'provenance');
    if (!UUID_PATTERN.test(item.sourceVersionId) || !(item.span === null || typeof item.span === 'string')
        || !nonEmptyString(item.transformation, { max: 1024 * 1024 })) reject(422, 'VALIDATION_ERROR');
  }
}

async function createDraftVersion(client, principal, draft, { questionId = randomUUID(), parentVersionId = null, parent = null } = {}) {
  validateDraftInput(draft);
  const taxonomyNode = await loadTaxonomyNode(client, draft.taxonomyVersionId);
  const canonicalDraft = canonicalizeTaxonomyIds(draft, taxonomyNode);
  const versionId = randomUUID();
  const timestamp = await client.query(
    `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`);
  const createdAt = timestamp.rows[0].created_at;
  const provenance = await loadManualProvenance(client, principal, draft, draft.evidenceRefs);
  const question = buildDraftQuestion(canonicalDraft, {
    questionId, versionId, versionNo: parent ? parent.version.versionNo + 1 : 1,
    parentVersionId, principal, createdAt, provenanceIds: provenance.persisted.map((item) => item.provenanceId),
  });
  const parsed = QuestionVersionSchema.safeParse(question);
  if (!parsed.success) reject(422, 'VALIDATION_ERROR');
  const normalizedQuestion = parsed.data;
  validateTaxonomyMembership(normalizedQuestion, taxonomyNode);
  const assets = await loadAssets(client, normalizedQuestion);
  const parentDefinitions = parent?.nodeClosure ?? [];
  const definitions = await loadManualReferences(client, normalizedQuestion, provenance.definitions,
    parentDefinitions, taxonomyNode, assets.definitions);
  const roots = requiredRoots(normalizedQuestion);
  if (roots.length > MAX_REFERENCE_NODES) reject(422, 'INVALID_REFERENCE_GRAPH');
  const namespace = `${PRIVATE_NAMESPACE_PREFIX}${versionId}`;
  const closure = await resolveReferenceGraph(client, namespace, roots, definitions);
  const identity = computeQuestionIdentity(normalizedQuestion, closure);
  const fingerprint = computeDuplicateFingerprint(normalizedQuestion, closure);
  const storedQuestion = { ...normalizedQuestion, contentHash: identity.contentHash };
  const rootDigests = roots.map((root) => {
    const node = closure.find((candidate) => candidate.kind === root.kind && candidate.id === root.id);
    if (!node) reject(422, 'INVALID_REFERENCE_GRAPH');
    return { kind: node.kind, id: node.id, contentHash: node.contentHash };
  });
  const normalizedRoots = roots.map(({ kind, id }) => ({ kind, id })).sort(compareReference);
  const questionNode = {
    kind: 'question',
    id: versionId,
    payload: questionProjection(storedQuestion),
    references: normalizedRoots,
    contentHash: createReferenceHash({
      kind: 'question', id: versionId, payload: questionProjection(storedQuestion),
      references: rootDigests.sort(compareReference),
    }),
  };

  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    JSON.stringify(['fingerprint/1', storedQuestion.section, fingerprint.fingerprint]),
  ]);

  if (parent) {
    const latestResult = await client.query(
      'SELECT max(version_no) AS version_no FROM tsa.question_versions WHERE question_id = $1', [questionId]);
    if (Number(latestResult.rows[0].version_no) !== parent.version.versionNo) reject(409, 'REVISION_CONFLICT');
  } else {
    await client.query('INSERT INTO tsa.questions (id) VALUES ($1)', [questionId]);
  }

  await client.query(
    `INSERT INTO tsa.question_versions
      (id, question_id, version_no, parent_version_id, schema_version, language,
       section, taxonomy_version_id, domain_id, skill_ids, subskill_ids, cognitive_level,
       difficulty, content, stimulus_version_id, interaction, origin, provenance_ids,
       generation_run_id, created_by, created_at, authored_created_at, content_hash,
       normalized_fingerprint, reference_namespace)
     VALUES ($1, $2, $3, $4, $5, $6, $7::tsa.question_section, $8, $9,
       $10::jsonb, $11::jsonb, $12::tsa.cognitive_level, $13::jsonb, $14::jsonb,
       $15, $16::jsonb, $17::tsa.question_origin, $18::jsonb, $19, $20,
       $21::timestamptz, $22::text, $23, $24, $25)`,
    [versionId, questionId, storedQuestion.versionNo, parentVersionId, storedQuestion.schemaVersion,
      storedQuestion.language, storedQuestion.section, storedQuestion.taxonomyVersionId,
      storedQuestion.domainId, JSON.stringify(storedQuestion.skillIds), JSON.stringify(storedQuestion.subskillIds),
      storedQuestion.cognitiveLevel, JSON.stringify(storedQuestion.difficulty), JSON.stringify(storedQuestion.content),
      storedQuestion.stimulusVersionId, JSON.stringify(storedQuestion.interaction), storedQuestion.origin,
      JSON.stringify(storedQuestion.provenanceIds), null, principal.userId, storedQuestion.createdAt,
      storedQuestion.createdAt, identity.contentHash, fingerprint.fingerprint, namespace]);
  await client.query(
    `INSERT INTO tsa_private.question_secrets
      (question_version_id, answer_key, explanation, scoring_policy_version, evidence)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, $5::jsonb)`,
    [versionId, JSON.stringify(storedQuestion.private.answerKey), JSON.stringify(storedQuestion.private.explanation),
      storedQuestion.private.scoringPolicy, JSON.stringify(storedQuestion.private.evidenceRefs)]);

  const taxonomyNodes = taxonomyNode.payload.nodes;
  const nodeIdByCode = new Map(taxonomyNodes.map((node) => [node.code, node.id]));
  const taxonomyRows = [
    { code: storedQuestion.domainId, dimension: 'DOMAIN', ordinal: 0 },
    ...storedQuestion.skillIds.map((code, ordinal) => ({ code, dimension: 'SKILL', ordinal })),
    ...storedQuestion.subskillIds.map((code, ordinal) => ({ code, dimension: 'SUBSKILL', ordinal })),
  ];
  for (const item of taxonomyRows) {
    if (!nodeIdByCode.has(item.code)) reject(422, 'TAXONOMY_MEMBERSHIP_INVALID');
    await client.query(
      `INSERT INTO tsa.question_taxonomy (question_version_id, taxonomy_version_id, node_code, dimension, ordinal)
       VALUES ($1, $2, $3, $4, $5)`,
      [versionId, storedQuestion.taxonomyVersionId, item.code, item.dimension, item.ordinal]);
  }
  for (const [ordinal, item] of provenance.persisted.entries()) {
    await client.query(
      `INSERT INTO tsa.question_provenance
        (question_version_id, provenance_id, ordinal, source_version_id, origin, source_span,
         transformation, creator, rights_decision_at_authoring)
       VALUES ($1, $2, $3, $4, $5::tsa.question_origin, $6, $7, $8, $9)`,
      [versionId, item.provenanceId, ordinal, item.sourceVersionId, item.origin,
        item.sourceSpan, item.transformation, item.creator, item.rightsEvidence]);
  }
  for (const [assetVersionId, purposes] of assets.usages) {
    for (const purpose of purposes) {
      await client.query(
        `INSERT INTO tsa.question_assets (question_version_id, asset_version_id, purpose)
         VALUES ($1, $2, $3::tsa.question_asset_purpose)`, [versionId, assetVersionId, purpose]);
    }
  }
  await client.query(
    `INSERT INTO tsa.question_workflow (question_version_id, state, revision)
     VALUES ($1, 'DRAFT', 1)`, [versionId]);

  const duplicateResult = await client.query(
    `SELECT qv.id
       FROM tsa.question_versions qv JOIN tsa.questions q ON q.id = qv.question_id
      WHERE qv.section = $1 AND qv.normalized_fingerprint = $2 AND q.id <> $3
      ORDER BY qv.id`, [storedQuestion.section, fingerprint.fingerprint, questionId]);
  for (const row of duplicateResult.rows) {
    const leftId = row.id < versionId ? row.id : versionId;
    const rightId = row.id < versionId ? versionId : row.id;
    await client.query(
      `INSERT INTO tsa.duplicate_relations (id, left_version_id, right_version_id, kind, evidence, detector_version)
       VALUES ($1, $2, $3, 'EXACT', $4::jsonb, 'fingerprint/1')
       ON CONFLICT (left_version_id, right_version_id, kind) DO NOTHING`,
      [randomUUID(), leftId, rightId, JSON.stringify({ fingerprint: fingerprint.fingerprint })]);
  }
  if (duplicateResult.rowCount > 0) {
    await client.query('UPDATE tsa.bank_state SET eligibility_revision = eligibility_revision + 1, updated_at = clock_timestamp() WHERE id = 1');
  }
  await storeReferenceGraph(client, namespace, [...closure, questionNode]);
  await client.query(
    `INSERT INTO tsa.audit_events (id, actor_id, action, entity_type, entity_id, after_revision)
     VALUES ($1, $2, $3, 'question_version', $4, $5)`,
    [randomUUID(), principal.userId, parent ? 'QUESTION_DRAFT_VERSION_CREATED' : 'QUESTION_DRAFT_CREATED', versionId,
      storedQuestion.versionNo]);
  return {
    questionId,
    versionId,
    state: 'DRAFT',
    contentHash: identity.contentHash,
  };
}

export async function createQuestionDraft(bankPool, identityService, principal, key, draft) {
  requireActor(identityService, principal, 'bank.question.author');
  return withIdempotency(bankPool, principal, key, 'POST /api/v1/questions', draft, async (client) => {
    const body = await createDraftVersion(client, principal, draft);
    return { status: 201, body, resourceId: body.versionId };
  });
}

export async function createQuestionDraftVersion(bankPool, identityService, principal, questionId, key, input) {
  requireActor(identityService, principal, 'bank.question.author');
  strictRecord(input, ['parentVersionId', 'draft'], 'question version');
  if (!UUID_PATTERN.test(questionId) || !UUID_PATTERN.test(input.parentVersionId)) reject(404, 'NOT_FOUND');
  return withIdempotency(bankPool, principal, key, `POST /api/v1/questions/${questionId}/versions`, input, async (client) => {
    const lockedQuestion = await client.query('SELECT id FROM tsa.questions WHERE id = $1 FOR UPDATE', [questionId]);
    if (lockedQuestion.rowCount !== 1) reject(404, 'NOT_FOUND');
    const parent = await loadParentGraph(client, input.parentVersionId, questionId);
    const body = await createDraftVersion(client, principal, input.draft, {
      questionId,
      parentVersionId: input.parentVersionId,
      parent,
    });
    return { status: 201, body, resourceId: body.versionId };
  });
}

function encodeCursor(createdAt, id) {
  return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (cursor === undefined) return null;
  if (typeof cursor !== 'string' || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) reject(422, 'VALIDATION_ERROR');
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) reject(422, 'VALIDATION_ERROR');
    const value = JSON.parse(bytes.toString('utf8'));
    strictRecord(value, ['createdAt', 'id'], 'cursor');
    if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt)) || !UUID_PATTERN.test(value.id)) {
      reject(422, 'VALIDATION_ERROR');
    }
    return value;
  } catch (error) {
    if (error instanceof BankCommandError) throw error;
    reject(422, 'VALIDATION_ERROR');
  }
}

export async function listQuestionSummaries(bankPool, identityService, principal, searchParams) {
  requireActor(identityService, principal, 'bank.question.read');
  const allowed = new Set(['section', 'state', 'cursor', 'limit']);
  for (const key of searchParams.keys()) if (!allowed.has(key)) reject(422, 'VALIDATION_ERROR');
  for (const key of allowed) if (searchParams.getAll(key).length > 1) reject(422, 'VALIDATION_ERROR');
  const section = searchParams.get('section');
  const state = searchParams.get('state');
  const limitValue = searchParams.get('limit');
  const limit = limitValue === null ? 20 : Number(limitValue);
  if (section !== null && !SECTIONS.has(section) || state !== null && !WORKFLOW_STATES.has(state)
      || !Number.isInteger(limit) || limit < 1 || limit > 100) reject(422, 'VALIDATION_ERROR');
  const cursor = decodeCursor(searchParams.get('cursor') ?? undefined);
  const result = await withTransaction(bankPool, (client) => client.query(
    `SELECT qv.question_id, qv.id AS version_id, qv.section, w.state,
            qv.interaction->>'type' AS interaction_type, qv.content_hash, qv.created_at,
            to_char(qv.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_cursor
       FROM tsa.question_versions qv
       JOIN tsa.question_workflow w ON w.question_version_id = qv.id
      WHERE ($1::text IS NULL OR qv.section::text = $1)
        AND ($2::text IS NULL OR w.state::text = $2)
        AND ($3::timestamptz IS NULL OR (qv.created_at, qv.id) < ($3::timestamptz, $4::uuid))
      ORDER BY qv.created_at DESC, qv.id DESC LIMIT $5`,
    [section, state, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1]), { role: 'tsa_bank' });
  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const items = rows.map((row) => ({
    questionId: row.question_id,
    versionId: row.version_id,
    section: row.section,
    state: row.state,
    interactionType: row.interaction_type,
    contentHash: row.content_hash,
  }));
  const last = rows.at(-1);
  const nextCursor = hasMore && last ? encodeCursor(last.created_cursor, last.version_id) : null;
  return { items, nextCursor };
}

export async function createQuestionService({ bankPool, identityService }) {
  if (!bankPool || !identityService) throw new TypeError('Bank pool and identity service are required');
  await assertBankConnection(bankPool);
  return Object.freeze({
    createQuestionDraft: (principal, key, draft) => createQuestionDraft(bankPool, identityService, principal, key, draft),
    createQuestionDraftVersion: (principal, questionId, key, input) =>
      createQuestionDraftVersion(bankPool, identityService, principal, questionId, key, input),
    listQuestionSummaries: (principal, searchParams) => listQuestionSummaries(bankPool, identityService, principal, searchParams),
  });
}
