import { canonicalize, computeQuestionIdentity, computeDuplicateFingerprint, QuestionVersionSchema } from '../../../packages/contracts/dist/internal.js';
import { StaffReviewContextSchema } from '../../../packages/contracts/dist/staff.js';
import { assertBankConnection, reject, requireActor, resolveReferenceGraph, referenceKey, jsonDigest, UUID_PATTERN } from './common.mjs';
import { assertSafeQuestionContent } from './content-safety.mjs';
import { withTransaction } from '../database/pool.mjs';

const LIMIT_BYTES = 1024 * 1024;
const fail = () => reject(503, 'TEMPORARILY_UNAVAILABLE');
const exact = (left, right) => Buffer.from(canonicalize(left)).equals(Buffer.from(canonicalize(right)));
const need = (condition) => { if (!condition) fail(); };

async function importContext(client, row) {
  if (!row.reference_namespace?.startsWith('factory/2/')) return row;
  // Ancestors have no candidate receipt. Bind their stored namespace to the
  // original immutable manifest, not the current child or a claimed creator.
  const manifests = await client.query(`SELECT producer_namespace,batch_key,received_by
    FROM tsa_private.factory_import_manifests WHERE
      manifest->'references' @> $1::jsonb OR manifest->'candidates' @> $2::jsonb`,
  [JSON.stringify([{ kind: 'question', id: row.id }]), JSON.stringify([{ question: { id: row.id } }])]);
  const matching = manifests.rows.filter((manifest) =>
    `factory/2/${jsonDigest([manifest.producer_namespace, manifest.batch_key])}` === row.reference_namespace);
  need(matching.length === 1);
  row = { ...row, producer_namespace: matching[0].producer_namespace, operator_id: matching[0].received_by };
  if (row.stimulus_version_id) {
    const mapping = await client.query(`SELECT external_id FROM tsa_private.factory_external_mappings
      WHERE producer_namespace=$1 AND external_kind='stimulus' AND local_id=$2`, [row.producer_namespace, row.stimulus_version_id]);
    need(mapping.rowCount === 1);
    row.external_stimulus_version_id = mapping.rows[0].external_id;
  }
  return row;
}

// This projection is deliberately separate from workflow commands, which write
// validation/delivery caches. The transaction below enforces read-only execution.
async function loadVersion(client, versionId) {
  const result = await client.query(`SELECT qv.*, w.state::text AS state, w.revision,
    qs.answer_key, qs.explanation, qs.evidence, qs.scoring_policy_version,
    receipt.producer_namespace, manifest.received_by AS operator_id,
    run.external_generation_run_id, mapping.external_id AS external_stimulus_version_id
    FROM tsa.question_versions qv
    JOIN tsa.question_workflow w ON w.question_version_id=qv.id
    JOIN tsa_private.question_secrets qs ON qs.question_version_id=qv.id
    LEFT JOIN tsa_private.factory_import_receipts receipt ON receipt.question_version_id=qv.id
    LEFT JOIN tsa_private.factory_import_manifests manifest
      ON manifest.producer_namespace=receipt.producer_namespace AND manifest.batch_key=receipt.batch_key
    LEFT JOIN tsa_private.factory_import_runs run ON run.question_version_id=qv.id
    LEFT JOIN tsa_private.factory_external_mappings mapping ON mapping.producer_namespace=receipt.producer_namespace
      AND mapping.external_kind='stimulus' AND mapping.local_id=qv.stimulus_version_id
    WHERE qv.id=$1`, [versionId]);
  need(result.rowCount <= 1);
  return result.rows[0] ? importContext(client, result.rows[0]) : null;
}

function normalizedQuestion(row) {
  need(row.reference_namespace && row.authored_created_at);
  if (row.producer_namespace && row.stimulus_version_id) need(row.external_stimulus_version_id);
  return QuestionVersionSchema.parse({
    schemaVersion: row.schema_version, id: row.id, questionId: row.question_id,
    versionNo: row.version_no, parentVersionId: row.parent_version_id,
    language: row.language, section: row.section, taxonomyVersionId: row.taxonomy_version_id,
    domainId: row.domain_id, skillIds: row.skill_ids, subskillIds: row.subskill_ids,
    cognitiveLevel: row.cognitive_level, difficulty: row.difficulty, content: row.content,
    stimulusVersionId: row.external_stimulus_version_id ?? row.stimulus_version_id,
    interaction: row.interaction,
    private: { answerKey: row.answer_key, explanation: row.explanation,
      evidenceRefs: row.evidence, scoringPolicy: row.scoring_policy_version },
    origin: row.origin, provenanceIds: row.provenance_ids,
    generationRunId: row.external_generation_run_id ?? row.generation_run_id,
    createdBy: row.created_by, createdAt: row.authored_created_at, contentHash: row.content_hash,
  });
}

function descendants(node, nodes) {
  const found = new Map();
  const visit = (current) => {
    for (const edge of current.references) {
      const key = referenceKey(edge.kind, edge.id), child = nodes.get(key);
      need(child);
      if (!found.has(key)) { found.set(key, child); visit(child); }
    }
  };
  visit(node);
  return [...found.values()];
}

async function mappedId(client, producer, namespace, node) {
  need(typeof producer === 'string' && producer.length > 0);
  const result = await client.query(`SELECT local_id,payload_hash FROM tsa_private.factory_external_mappings
    WHERE producer_namespace=$1 AND external_kind=$2 AND external_id=$3`, [producer, node.kind, node.id]);
  const stored = await client.query(`SELECT dependency_refs FROM tsa_private.reference_nodes
    WHERE reference_namespace=$1 AND kind=$2 AND id=$3`, [namespace, node.kind, node.id]);
  need(stored.rowCount === 1 && result.rowCount === 1);
  need(result.rows[0].payload_hash === jsonDigest({ ...node, references: stored.rows[0].dependency_refs }));
  return result.rows[0].local_id;
}

async function verifyGraph(client, target) {
  const graph = await resolveReferenceGraph(client, target.reference_namespace, [{ kind: 'question', id: target.id }]);
  const nodes = new Map(graph.map((node) => [referenceKey(node.kind, node.id), node]));
  const sources = new Set(), stimuli = new Map(), contexts = new Map(), materialized = new Map(), questions = [];
  let question;
  // Every ancestor's normalized immutable storage must agree with its authored
  // node, not merely with its own currently eligible version.
  for (const node of graph.filter((entry) => entry.kind === 'question')) {
    const row = node.id === target.id ? target : await loadVersion(client, node.id);
    need(row);
    const parsed = normalizedQuestion(row);
    questions.push({ row, question: parsed });
    need(!Object.hasOwn(node.payload, 'contentHash'));
    need(exact(parsed, { ...node.payload, contentHash: row.content_hash }));
    const dependencies = descendants(node, nodes);
    need(computeQuestionIdentity(parsed, dependencies).contentHash === row.content_hash);
    need(computeDuplicateFingerprint(parsed, dependencies).fingerprint === row.normalized_fingerprint);
    if (node.id === target.id) question = parsed;
    // A local revision may embed an imported ancestor. Materialization belongs
    // to each question's own namespace; stop at parent-question edges here.
    const seen = new Set();
    const visit = (current) => {
      for (const edge of current.references) {
        if (edge.kind === 'question') continue;
        const key = referenceKey(edge.kind, edge.id), child = nodes.get(key);
        need(child);
        if (seen.has(key)) continue;
        seen.add(key);
        if (['source', 'stimulus', 'asset'].includes(child.kind)) {
          const owners = contexts.get(key) ?? new Map();
          owners.set(row.reference_namespace, row);
          contexts.set(key, owners);
        }
        visit(child);
      }
    };
    visit(node);
  }
  need(question);
  for (const node of graph) {
    if (!['source', 'stimulus', 'asset'].includes(node.kind)) continue;
    const owners = contexts.get(referenceKey(node.kind, node.id));
    need(owners?.size);
    for (const owner of owners.values()) {
      if (node.kind === 'source') {
        const manual = !owner.producer_namespace && node.payload.schemaVersion === 'manual-source/1' && node.payload.sourceVersionId === node.id;
        const id = manual ? node.id : await mappedId(client, owner.producer_namespace, owner.reference_namespace, node);
        need(UUID_PATTERN.test(id));
        const stored = await client.query(`SELECT sv.*,s.title,s.origin FROM tsa.source_versions sv
          JOIN tsa.sources s ON s.id=sv.source_id WHERE sv.id=$1`, [id]);
        need(stored.rowCount === 1);
        const row = stored.rows[0];
        if (manual) {
          need(row.content_hash === node.payload.sourceContentHash && row.source_id === node.payload.sourceId);
          need(row.title === node.payload.sourceTitle && row.origin === node.payload.sourceOrigin);
          need(row.version_no === node.payload.sourceVersionNo);
          need(exact(row.metadata, node.payload.metadata) && row.evidence_uri === node.payload.evidenceUri);
        } else {
          need(row.content_hash === jsonDigest(node.payload) && row.title === node.payload.title && row.origin === 'EXTERNAL');
          need(row.metadata.referenceKind === 'source' && row.metadata.referenceId === node.id);
        }
        sources.add(id);
      materialized.set(`${owner.reference_namespace}:source:${node.id}`, id);
      } else if (node.kind === 'stimulus') {
        const id = owner.producer_namespace ? await mappedId(client, owner.producer_namespace, owner.reference_namespace, node) : node.id;
        const stored = await client.query('SELECT content,content_hash FROM tsa.stimulus_versions WHERE id=$1', [id]);
        need(stored.rowCount === 1 && stored.rows[0].content_hash === node.contentHash);
        need(exact(stored.rows[0].content, node.payload.content));
        stimuli.set(`${node.id}:${id}`, { versionId: id, contentHash: node.contentHash, content: stored.rows[0].content });
      materialized.set(`${owner.reference_namespace}:stimulus:${node.id}`, id);
      } else if (node.kind === 'asset') {
        const id = owner.producer_namespace ? await mappedId(client, owner.producer_namespace, owner.reference_namespace, node) : node.id;
        const stored = await client.query('SELECT source_version_id FROM tsa.asset_versions WHERE id=$1', [id]);
        need(stored.rowCount === 1);
        sources.add(stored.rows[0].source_version_id);
      materialized.set(`${owner.reference_namespace}:asset:${node.id}`, id);
      }
    }
  }
  for (const { row, question: current } of questions) {
    const expected = current.provenanceIds.map((id) => {
      const provenance = nodes.get(referenceKey('provenance', id));
      need(provenance);
      const sourceId = materialized.get(`${row.reference_namespace}:source:${provenance.payload.sourceVersionId}`);
      need(sourceId);
      return { provenance_id: id, source_version_id: sourceId };
    });
    const stored = await client.query(`SELECT provenance_id,source_version_id FROM tsa.question_provenance
      WHERE question_version_id=$1 ORDER BY ordinal`, [row.id]);
    need(exact(stored.rows, expected));
  }
  for (const node of graph.filter((entry) => entry.kind === 'stimulus')) {
    for (const owner of contexts.get(referenceKey(node.kind, node.id)).values()) {
      const id = materialized.get(`${owner.reference_namespace}:stimulus:${node.id}`);
      const expected = [...new Set(node.payload.provenanceIds.map((provenanceId) => {
        const provenance = nodes.get(referenceKey('provenance', provenanceId));
        need(provenance);
        const sourceId = materialized.get(`${owner.reference_namespace}:source:${provenance.payload.sourceVersionId}`);
        need(sourceId); return sourceId;
      }))].sort();
      const stored = await client.query('SELECT source_version_id FROM tsa.stimulus_sources WHERE stimulus_version_id=$1 ORDER BY source_version_id', [id]);
      need(exact(stored.rows.map((row) => row.source_version_id), expected));
    }
  }
  need(sources.size > 0 && sources.size <= 100);
  const stimulus = question.stimulusVersionId === null ? null : stimuli.get(`${question.stimulusVersionId}:${target.stimulus_version_id}`);
  need(question.stimulusVersionId === null || stimulus);
  return { graph, question, sources: [...sources].sort(), stimulus };
}

async function accessBasis(client, identityService, principal, target) {
  if (principal.roles.includes('BANK_MANAGER')) return 'BANK_MANAGER';
  if (principal.roles.includes('AUTHOR') && target.created_by === principal.userId) {
    const result = await client.query('SELECT tsa.bank_local_version_authored_by($1,$2) AS allowed', [target.id, principal.userId]);
    if (result.rows[0]?.allowed === true) return 'AUTHOR_OWN';
  }
  if (principal.roles.includes('REVIEWER') && target.state === 'IN_REVIEW'
      && target.created_by !== principal.userId) {
    const attributed = await importContext(client, target);
    if (identityService.mayPerform(principal, 'bank.question.review', { authorId: attributed.created_by, operatorId: attributed.operator_id })) return 'REVIEW_QUEUE';
  }
  reject(404, 'NOT_FOUND');
}

async function readSnapshot(client, identityService, principal, versionId) {
  const access = await client.query(`SELECT qv.id,qv.created_by,qv.reference_namespace,w.state::text AS state,
    manifest.received_by AS operator_id
    FROM tsa.question_versions qv JOIN tsa.question_workflow w ON w.question_version_id=qv.id
    LEFT JOIN tsa_private.factory_import_receipts receipt ON receipt.question_version_id=qv.id
    LEFT JOIN tsa_private.factory_import_manifests manifest
      ON manifest.producer_namespace=receipt.producer_namespace AND manifest.batch_key=receipt.batch_key
    WHERE qv.id=$1`, [versionId]);
  if (access.rowCount === 0) reject(404, 'NOT_FOUND');
  need(access.rowCount === 1);
  const basis = await accessBasis(client, identityService, principal, access.rows[0]);
  const target = await loadVersion(client, versionId);
  need(target);
  const verified = await verifyGraph(client, target);
  const observation = await client.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at`);
  const observedAt = observation.rows[0].observed_at;
  const requiredUses = ['DISPLAY'];
  if (['GENERATED', 'AUGMENTED'].includes(verified.question.origin)) requiredUses.push('GENERATE');
  if (verified.question.origin === 'AUGMENTED') requiredUses.push('ADAPT');
  const result = await client.query(`SELECT sv.id,sv.content_hash,s.origin,sr.decision_id,sr.revision,
    rd.status::text AS status,rd.allowed_uses::text[] AS allowed_uses,rd.territory,
    to_char(rd.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS valid_from,
    to_char(rd.valid_to AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS valid_to,
    COALESCE(rd.status IN ('OWNED','LICENSED','OPEN_LICENSE','PUBLIC_DOMAIN')
      AND rd.allowed_uses @> $2::tsa.rights_use[]
      AND ('VN'=ANY(rd.territory) OR 'WORLDWIDE'=ANY(rd.territory))
      AND rd.valid_from IS NOT NULL AND rd.valid_from <= $3::timestamptz
      AND (rd.valid_to IS NULL OR $3::timestamptz < rd.valid_to)
      AND jsonb_typeof(rd.evidence->'text')='string' AND btrim(rd.evidence->>'text')<>''
      AND attestor.disabled_at IS NULL AND attestor.id IS NOT NULL,false) AS permitted
    FROM tsa.source_versions sv JOIN tsa.sources s ON s.id=sv.source_id
    LEFT JOIN tsa.source_rights sr ON sr.source_version_id=sv.id
    LEFT JOIN tsa.rights_decisions rd ON rd.source_version_id=sv.id AND rd.id=sr.decision_id
    LEFT JOIN tsa.users attestor ON attestor.id=rd.decided_by
    WHERE sv.id=ANY($1::uuid[]) ORDER BY sv.id`, [verified.sources, requiredUses, observedAt]);
  need(result.rowCount === verified.sources.length);
  const sources = result.rows.map((row) => ({ sourceVersionId: row.id, contentHash: row.content_hash, origin: row.origin,
    currentRights: row.decision_id === null ? null : {
      decisionId: row.decision_id, revision: Number(row.revision), status: row.status,
      allowedUses: row.allowed_uses, territory: row.territory, validFrom: row.valid_from, validTo: row.valid_to,
    } }));
  let reason = ['QUARANTINED', 'RETIRED'].includes(target.state) ? 'WORKFLOW_HELD'
    : result.rows.some((row) => !row.permitted) ? 'RIGHTS_BLOCKED' : null;
  if (!reason) {
    try { assertSafeQuestionContent(verified.question, verified.graph.filter((node) => !(node.kind === 'question' && node.id === target.id))); }
    catch { reason = 'CONTENT_UNSUPPORTED'; }
  }
  const preview = reason ? { status: 'BLOCKED', reason } : { status: 'AVAILABLE', question: {
    language: verified.question.language, content: verified.question.content, interaction: verified.question.interaction,
    answerKey: verified.question.private.answerKey, explanation: verified.question.private.explanation,
    scoringPolicyVersion: verified.question.private.scoringPolicy, stimulus: verified.stimulus,
  } };
  const payload = {
    schemaVersion: 'staff-review-context/1', observedAt, accessBasis: basis, environment: 'LOCAL_SYNTHETIC_ONLY',
    version: { questionId: target.question_id, versionId: target.id, versionNo: target.version_no,
      parentVersionId: target.parent_version_id, section: target.section, contentHash: target.content_hash },
    workflow: { state: target.state, revision: Number(target.revision) }, sources, preview,
    rightsEvidenceIncluded: false, publicationEligibility: 'NOT_EVALUATED',
  };
  need(Buffer.byteLength(JSON.stringify(payload), 'utf8') <= LIMIT_BYTES);
  return StaffReviewContextSchema.parse(payload);
}

export async function createReviewContextService({ bankPool, identityService }) {
  await assertBankConnection(bankPool);
  return Object.freeze({ async read(principal, versionId) {
    requireActor(identityService, principal, 'bank.question.read');
    if (!UUID_PATTERN.test(versionId)) reject(404, 'NOT_FOUND');
    return withTransaction(bankPool, async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      try { return await readSnapshot(client, identityService, principal, versionId); }
      catch (error) {
        if (error?.status === 404 && error?.code === 'NOT_FOUND') throw error;
        fail();
      }
    }, { role: 'tsa_bank' });
  } });
}
