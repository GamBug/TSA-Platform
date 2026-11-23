// Owner maintenance for defective published questions (OPEN_DECISIONS: owner instruction of 2026-11-16).
// A correction never edits a stored version. REVISE creates a new version of the same question through the
// author route, submits it for review and approves it on the owner connection with every publication check, so the
// old version stays as history and only the eligible pointer moves. WITHHOLD quarantines a version that cannot be
// repaired confidently, using the existing manager route. The specification is private: it carries answer keys.
import { createHash } from 'node:crypto';
import { withTransaction } from '../modules/database/pool.mjs';
import { ownerApprove, ownerConfirmSingleton } from './owner-publication.mjs';

export const CORRECTION_ACTIONS = Object.freeze(['REVISE', 'WITHHOLD']);
export const CORRECTION_CLASSIFICATIONS = Object.freeze([
  'INCORRECT_ANSWER_KEY', 'INCORRECT_OPTIONS', 'INCORRECT_EXPRESSION', 'INCORRECT_TRANSCRIPTION',
  'AMBIGUOUS_QUESTION', 'INVALID_PROBLEM', 'DUPLICATE_OF_SERVED_QUESTION',
]);
export const REVISABLE_FIELDS = Object.freeze(['answerKey', 'content', 'interaction', 'explanation']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_NOTE = 1_500;

export function confirmationPhrase(count) {
  return `CORRECT ${count}`;
}

function fail(message) { throw new TypeError(message); }

/** Validate the private specification and return a normalized copy. Never logs answer content. */
export function parseCorrectionSpec(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.items) || input.items.length === 0) fail('spec.items must list at least one correction');
  if (typeof input.reason !== 'string' || input.reason.trim().length < 10) fail('spec.reason is required');
  const seen = new Set();
  const items = input.items.map((item, index) => {
    const where = `items[${index}]`;
    if (!item || typeof item !== 'object') fail(`${where} must be an object`);
    if (typeof item.versionId !== 'string' || !UUID.test(item.versionId)) fail(`${where}.versionId must be a version UUID`);
    if (seen.has(item.versionId)) fail(`${where} repeats a version`);
    seen.add(item.versionId);
    if (!CORRECTION_ACTIONS.includes(item.action)) fail(`${where}.action must be REVISE or WITHHOLD`);
    if (!CORRECTION_CLASSIFICATIONS.includes(item.classification)) fail(`${where}.classification is not recognized`);
    if (typeof item.note !== 'string' || item.note.trim().length < 10 || item.note.length > MAX_NOTE) fail(`${where}.note must be 10-${MAX_NOTE} characters`);
    if (item.action === 'WITHHOLD') {
      if (item.changes !== undefined) fail(`${where}: WITHHOLD carries no changes`);
      return { versionId: item.versionId, action: 'WITHHOLD', classification: item.classification, note: item.note.trim() };
    }
    if (!item.changes || typeof item.changes !== 'object') fail(`${where}.changes is required for REVISE`);
    const fields = Object.keys(item.changes);
    if (fields.length === 0 || fields.some((field) => !REVISABLE_FIELDS.includes(field))) fail(`${where}.changes may only set ${REVISABLE_FIELDS.join(', ')}`);
    return { versionId: item.versionId, action: 'REVISE', classification: item.classification, note: item.note.trim(), changes: structuredClone(item.changes) };
  });
  return { reason: input.reason.trim(), items };
}

/** Stable digest of a spec, used to make every request idempotent across re-runs. */
export function specDigest(spec) {
  return createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 16);
}

/** Read what a revision of this version needs. Only owner-connection reads; nothing is written. */
export async function loadCorrectionTarget(client, versionId) {
  const version = (await client.query(`SELECT v.id, v.question_id, v.version_no, v.schema_version, v.language, v.section::text AS section,
      v.taxonomy_version_id, v.domain_id, v.skill_ids, v.subskill_ids, v.cognitive_level::text AS cognitive_level, v.difficulty,
      v.content, v.interaction, v.stimulus_version_id, v.origin::text AS origin,
      s.answer_key, s.explanation, w.state::text AS state, w.revision::integer AS revision,
      (SELECT max(version_no)::integer FROM tsa.question_versions x WHERE x.question_id=v.question_id) AS latest_version_no,
      q.eligible_version_id
    FROM tsa.question_versions v JOIN tsa_private.question_secrets s ON s.question_version_id=v.id
    JOIN tsa.question_workflow w ON w.question_version_id=v.id JOIN tsa.questions q ON q.id=v.question_id
    WHERE v.id=$1`, [versionId])).rows[0];
  if (!version) throw new Error(`Version ${versionId} does not exist`);
  const provenance = (await client.query(`SELECT p.source_version_id AS "sourceVersionId", p.source_span AS span,
      sr.decision_id AS "decisionId"
    FROM tsa.question_provenance p LEFT JOIN tsa.source_rights sr ON sr.source_version_id=p.source_version_id
    WHERE p.question_version_id=$1 ORDER BY p.ordinal`, [versionId])).rows;
  const nodes = (await client.query(`SELECT id, code, kind, parent_id FROM tsa.taxonomy_nodes WHERE taxonomy_version_id=$1`, [version.taxonomy_version_id])).rows;
  return { version, provenance, nodes };
}

/**
 * The domain and skill a question takes in another section of the same taxonomy version: the domain whose code is the
 * section and its only skill. Throws when the taxonomy has no such domain or the choice of skill is not unique.
 */
export function sectionTaxonomy(nodes, section) {
  const domain = nodes.find((node) => node.kind === 'DOMAIN' && node.code === section);
  if (!domain) throw new Error(`This question's taxonomy has no ${section} domain, so it cannot move to ${section}; import it again in the ${section} inbox`);
  const skills = nodes.filter((node) => node.kind === 'SKILL' && node.parent_id === domain.id);
  if (skills.length !== 1) throw new Error(`The ${section} domain of this taxonomy has ${skills.length} skills; a move needs exactly one`);
  return { domainId: domain.id, skillIds: [skills[0].id] };
}

/** Build the author draft for a revision from the stored parent and the requested changes. */
export function buildRevisionDraft(target, item) {
  const { version, provenance, nodes } = target;
  if (version.stimulus_version_id) throw new Error('Revising a version that belongs to a shared passage is not supported');
  if (version.state === 'QUARANTINED') throw new Error('A quarantined version cannot be revised: its descendants stay blocked by the quarantine');
  if (version.version_no !== version.latest_version_no) throw new Error('Only the latest version of a question can be revised');
  if (provenance.length === 0 || provenance.some((entry) => !entry.decisionId)) throw new Error('Every source of the version needs a recorded rights decision');
  const idOf = (code) => {
    const node = nodes.find((candidate) => candidate.code === code);
    if (!node) throw new Error(`Taxonomy code ${code} is not registered`);
    return node.id;
  };
  const list = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
  const set = item.changes;
  const evidenceRefs = [...new Set(provenance.map((entry) => entry.decisionId))];
  // A section change keeps the taxonomy version and takes that section's domain and skill in it.
  const section = set.section ?? version.section;
  const moved = section !== version.section ? sectionTaxonomy(nodes, section) : null;
  return {
    schemaVersion: version.schema_version,
    language: version.language,
    section,
    taxonomyVersionId: version.taxonomy_version_id,
    domainId: moved ? moved.domainId : idOf(version.domain_id),
    skillIds: moved ? moved.skillIds : list(version.skill_ids).map(idOf),
    subskillIds: moved ? [] : list(version.subskill_ids).map(idOf),
    cognitiveLevel: version.cognitive_level,
    targetDifficulty: list(version.difficulty)?.target ?? null,
    content: set.content ?? list(version.content),
    stimulusVersionId: null,
    interaction: set.interaction ?? list(version.interaction),
    answerKey: set.answerKey ?? list(version.answer_key),
    explanation: set.explanation ?? list(version.explanation),
    evidenceRefs,
    origin: 'MANUAL',
    provenance: provenance.map((entry) => ({
      sourceVersionId: entry.sourceVersionId,
      span: entry.span ?? null,
      transformation: (item.transformation ?? `Corrected after independent verification (${item.classification}): ${item.note}`).slice(0, 4_000),
    })),
  };
}

const ROUTE_PREFIX = Object.freeze({ 'question/1': 'v1', 'question/2': 'v2', 'question/3': 'v4' });

/**
 * Plan every correction against the Bank without writing anything. Returns rows safe to print: no answer content.
 */
export async function planCorrections(ownerPool, spec) {
  const rows = [];
  const targets = new Map();
  for (const item of spec.items) {
    const target = await withTransaction(ownerPool, (client) => loadCorrectionTarget(client, item.versionId));
    targets.set(item.versionId, target);
    const problems = [];
    if (!['APPROVED', 'IN_REVIEW', 'DRAFT'].includes(target.version.state)) problems.push(`state ${target.version.state} cannot change`);
    if (item.action === 'REVISE') {
      try { buildRevisionDraft(target, item); } catch (error) { problems.push(error.message); }
    }
    rows.push({
      versionId: item.versionId, questionId: target.version.question_id, action: item.action, classification: item.classification,
      schemaVersion: target.version.schema_version, state: target.version.state, served: target.version.eligible_version_id === item.versionId,
      fields: item.action === 'REVISE' ? Object.keys(item.changes) : [], problems,
    });
  }
  return { rows, targets };
}

export { ROUTE_PREFIX, ownerApprove, ownerConfirmSingleton };
