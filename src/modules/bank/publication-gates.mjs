import { randomUUID } from 'node:crypto';
import { canonicalize, computeQuestionIdentity, computeDuplicateFingerprint, QuestionVersionSchema } from '../../../packages/contracts/dist/internal.js';
import { reject, resolveReferenceGraph, UUID_PATTERN, jsonDigest } from './common.mjs';

export async function loadWorkflowTarget(client, versionId) {
  const result = await client.query(`SELECT qv.*, w.state::text AS state, w.revision,
    w.approved_review_id, qs.answer_key, qs.explanation, qs.evidence, qs.scoring_policy_version,
    manifest.received_by AS operator_id, receipt.producer_namespace,
    run.external_generation_run_id,
    mapping.external_id AS external_stimulus_version_id
    FROM tsa.question_versions qv
    JOIN tsa.question_workflow w ON w.question_version_id=qv.id
    JOIN tsa_private.question_secrets qs ON qs.question_version_id=qv.id
    LEFT JOIN tsa_private.factory_import_receipts receipt ON receipt.question_version_id=qv.id
    LEFT JOIN tsa_private.factory_import_manifests manifest
      ON manifest.producer_namespace=receipt.producer_namespace AND manifest.batch_key=receipt.batch_key
    LEFT JOIN tsa_private.factory_import_runs run ON run.question_version_id=qv.id
    LEFT JOIN tsa_private.factory_external_mappings mapping ON mapping.producer_namespace=receipt.producer_namespace
      AND mapping.external_kind='stimulus' AND mapping.local_id=qv.stimulus_version_id
    WHERE qv.id=$1 FOR UPDATE OF w`, [versionId]);
  if (result.rowCount !== 1) reject(404, 'NOT_FOUND');
  const row = result.rows[0];
  if (!Number.isSafeInteger(Number(row.revision))) reject(409, 'REVISION_CONFLICT');
  return { ...row, revision: Number(row.revision) };
}

export function assertIndependentReviewer(identityService, principal, target) {
  if (!principal?.authenticated) reject(401, 'UNAUTHENTICATED');
  if (!identityService.mayPerform(principal, 'bank.question.review', {
    authorId: target.created_by, operatorId: target.operator_id,
  })) reject(403, 'FORBIDDEN');
}

export async function validateWorkflowTarget(client, target) {
  if (!target.reference_namespace || !target.authored_created_at) reject(422, 'VALIDATION_ERROR');
  const graph = await resolveReferenceGraph(client, target.reference_namespace,
    [{ kind: 'question', id: target.id }]);
  const root = graph.find((node) => node.kind === 'question' && node.id === target.id);
  if (!root || Object.hasOwn(root.payload, 'contentHash')) reject(422, 'VALIDATION_ERROR');
  const references = graph.filter((node) => node !== root);
  let question;
  try {
    question = QuestionVersionSchema.parse({ ...root.payload, contentHash: target.content_hash });
    if (computeQuestionIdentity(question, references).contentHash !== target.content_hash
        || computeDuplicateFingerprint(question, references).fingerprint !== target.normalized_fingerprint) reject(422, 'VALIDATION_ERROR');
    const normalized = {
      schemaVersion: target.schema_version, id: target.id, questionId: target.question_id,
      versionNo: target.version_no, parentVersionId: target.parent_version_id,
      language: target.language, section: target.section, taxonomyVersionId: target.taxonomy_version_id,
      domainId: target.domain_id, skillIds: target.skill_ids, subskillIds: target.subskill_ids,
      cognitiveLevel: target.cognitive_level, difficulty: target.difficulty, content: target.content,
      stimulusVersionId: target.external_stimulus_version_id ?? target.stimulus_version_id,
      interaction: target.interaction,
      private: { answerKey: target.answer_key, explanation: target.explanation,
        evidenceRefs: target.evidence, scoringPolicy: target.scoring_policy_version },
      origin: target.origin, provenanceIds: target.provenance_ids,
      generationRunId: target.external_generation_run_id ?? target.generation_run_id,
      createdBy: target.created_by, createdAt: target.authored_created_at, contentHash: target.content_hash,
    };
    if (!Buffer.from(canonicalize(normalized)).equals(Buffer.from(canonicalize(question)))) reject(422, 'VALIDATION_ERROR');
  } catch { reject(422, 'VALIDATION_ERROR'); }
  const failed = await client.query(`SELECT 1 FROM tsa.validation_runs WHERE question_version_id=$1
    AND input_hash=$2 AND outcome<>'PASS' LIMIT 1`, [target.id, target.content_hash]);
  if (failed.rowCount) reject(422, 'VALIDATION_ERROR');
  return { question, references };
}

async function assertNoOpenFlags(client, target) {
  const flags = await client.query(`SELECT 1 FROM tsa.duplicate_relations d
    JOIN tsa.question_versions l ON l.id=d.left_version_id
    JOIN tsa.question_versions r ON r.id=d.right_version_id
    WHERE (l.question_id=$1 OR r.question_id=$1) AND d.resolution='OPEN' LIMIT 1`, [target.question_id]);
  if (flags.rowCount) reject(422, 'CONSTRAINT_CONFLICT');
}

export async function assertSingletonAllowed(client, target) {
  await assertNoOpenFlags(client, target);
  const existing = await client.query(`SELECT 1 FROM tsa.duplicate_group_members m
    JOIN tsa.duplicate_groups g ON g.id=m.group_id WHERE m.question_id=$1
      AND (g.merged_into_id IS NOT NULL OR EXISTS (SELECT 1 FROM tsa.duplicate_group_members other
        WHERE other.group_id=g.id AND other.question_id<>$1)) LIMIT 1`, [target.question_id]);
  if (existing.rowCount) reject(422, 'CONSTRAINT_CONFLICT');
  const equivalent = await client.query(`SELECT 1 FROM tsa.duplicate_relations d
    JOIN tsa.question_versions l ON l.id=d.left_version_id JOIN tsa.question_versions r ON r.id=d.right_version_id
    WHERE (l.question_id=$1 OR r.question_id=$1) AND l.question_id<>r.question_id
      AND d.kind IN ('EXACT','NEAR_DUPLICATE') AND d.resolution='CONFIRMED' LIMIT 1`, [target.question_id]);
  if (equivalent.rowCount) reject(422, 'CONSTRAINT_CONFLICT');
}

async function assertEquivalence(client, target) {
  await assertNoOpenFlags(client, target);
  const adjudication = await client.query('SELECT tsa.bank_equivalence_reviewed($1) AS reviewed', [target.id]);
  if (adjudication.rows[0]?.reviewed !== true) reject(422, 'CONSTRAINT_CONFLICT');
  const group = await client.query(`SELECT g.id FROM tsa.duplicate_group_members m
    JOIN tsa.duplicate_groups g ON g.id=m.group_id WHERE m.question_id=$1 AND g.merged_into_id IS NULL`, [target.question_id]);
  if (group.rowCount !== 1) reject(422, 'CONSTRAINT_CONFLICT');
  const unmerged = await client.query(`SELECT 1 FROM tsa.duplicate_relations d
    JOIN tsa.question_versions l ON l.id=d.left_version_id JOIN tsa.question_versions r ON r.id=d.right_version_id
    LEFT JOIN tsa.duplicate_group_members lm ON lm.question_id=l.question_id
    LEFT JOIN tsa.duplicate_group_members rm ON rm.question_id=r.question_id
    WHERE (l.question_id=$1 OR r.question_id=$1) AND l.question_id<>r.question_id
      AND d.kind IN ('EXACT','NEAR_DUPLICATE') AND d.resolution='CONFIRMED'
      AND (lm.group_id IS NULL OR rm.group_id IS NULL OR lm.group_id<>rm.group_id) LIMIT 1`, [target.question_id]);
  if (unmerged.rowCount) reject(422, 'CONSTRAINT_CONFLICT');
}

async function assertRights(client, target, references) {
  const sourceIds = new Set();
  const normalized = await client.query(`SELECT source_version_id FROM tsa.question_provenance WHERE question_version_id=$1
    UNION SELECT source_version_id FROM tsa.stimulus_sources WHERE stimulus_version_id=$2
    UNION SELECT av.source_version_id FROM tsa.asset_versions av JOIN tsa.question_assets qa ON qa.asset_version_id=av.id WHERE qa.question_version_id=$1
    UNION SELECT av.source_version_id FROM tsa.asset_versions av JOIN tsa.stimulus_assets sa ON sa.asset_version_id=av.id WHERE sa.stimulus_version_id=$2`, [target.id, target.stimulus_version_id]);
  for (const row of normalized.rows) sourceIds.add(row.source_version_id);
  for (const node of references.filter((ref) => ref.kind === 'source')) {
    if (node.payload.schemaVersion === 'manual-source/1' && node.payload.sourceVersionId === node.id && UUID_PATTERN.test(node.id)) {
      sourceIds.add(node.id);
    } else {
      const mappings = await client.query(`SELECT DISTINCT local_id FROM tsa_private.factory_external_mappings
        WHERE external_kind='source' AND external_id=$1 AND payload_hash=$2
          AND ($3::text IS NULL OR producer_namespace=$3)`, [node.id, jsonDigest(node), target.producer_namespace]);
      if (mappings.rowCount !== 1) reject(422, 'RIGHTS_BLOCKED');
      sourceIds.add(mappings.rows[0].local_id);
    }
  }
  if (!sourceIds.size) reject(422, 'RIGHTS_BLOCKED');
  const requiredUses = ['DISPLAY'];
  if (['GENERATED', 'AUGMENTED'].includes(target.origin)) requiredUses.push('GENERATE');
  if (target.origin === 'AUGMENTED') requiredUses.push('ADAPT');
  for (const sourceId of sourceIds) {
    const permitted = await client.query(`SELECT 1 FROM tsa.source_rights sr
      JOIN tsa.rights_decisions rd ON rd.source_version_id=sr.source_version_id AND rd.id=sr.decision_id
      JOIN tsa.users attestor ON attestor.id=rd.decided_by
      WHERE sr.source_version_id=$1 AND rd.status IN ('OWNED','LICENSED','OPEN_LICENSE','PUBLIC_DOMAIN')
        AND rd.allowed_uses @> $2::tsa.rights_use[]
        AND ('VN'=ANY(rd.territory) OR 'WORLDWIDE'=ANY(rd.territory))
        AND rd.valid_from IS NOT NULL AND rd.valid_from<=clock_timestamp()
        AND (rd.valid_to IS NULL OR clock_timestamp()<rd.valid_to)
        AND jsonb_typeof(rd.evidence->'text')='string' AND btrim(rd.evidence->>'text')<>''
        AND attestor.disabled_at IS NULL`, [sourceId, requiredUses]);
    if (permitted.rowCount !== 1) reject(422, 'RIGHTS_BLOCKED');
  }
}

export async function assertPublicationGates(client, target, principal, fixtureScopeId) {
  if (!fixtureScopeId || !UUID_PATTERN.test(fixtureScopeId)) reject(403, 'PUBLICATION_DISABLED');
  await client.query("SELECT set_config('tsa.bank_fixture_scope', $1, true)", [fixtureScopeId]);
  const fixture = await client.query('SELECT tsa.bank_fixture_scope_active() AS active');
  if (fixture.rows[0]?.active !== true) reject(403, 'PUBLICATION_DISABLED');
  const { references } = await validateWorkflowTarget(client, target);
  const validation = await client.query(`SELECT 1 FROM tsa.validation_runs
    WHERE question_version_id=$1 AND input_hash=$2 AND kind='BANK_IMMUTABLE'
      AND validator_version='bank-immutable/1' AND outcome='PASS'
      AND created_at>COALESCE(tsa.bank_latest_quarantine_at($1), '-infinity'::timestamptz) LIMIT 1`, [target.id, target.content_hash]);
  if (!validation.rowCount) reject(422, 'VALIDATION_ERROR');
  // No inspected/sanitized asset pipeline is implemented yet. Fail closed for
  // image-bearing closures, including stimulus, parent and explanation assets.
  if (references.some((ref) => ref.kind === 'asset')) reject(422, 'ASSET_SANITIZATION_REQUIRED');
  await assertRights(client, target, references);
  await assertEquivalence(client, target);
}

export async function appendWorkflowAudit(client, principal, target, action, afterRevision, reason) {
  await client.query(`INSERT INTO tsa.audit_events
    (id,actor_id,action,entity_type,entity_id,before_revision,after_revision,reason)
    VALUES ($1,$2,$3,'question_version',$4,$5,$6,$7)`,
  [randomUUID(), principal.userId, action, target.id, target.revision, afterRevision, reason]);
}

export async function quarantineSelectedForms(client, target, reason) {
  const result = await client.query('SELECT tsa.bank_version_has_sealed_forms($1) AS present', [target.id]);
  if (result.rows[0]?.present) reject(409, 'QUARANTINE_REQUIRES_HOLD');
}
