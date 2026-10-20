import { createHash, randomUUID } from 'node:crypto';
import {
  QuestionVersionSchema, canonicalize, computeDuplicateFingerprint, computeQuestionIdentity, createReferenceHash,
  parseFactoryPackageV2,
} from '../../../packages/contracts/dist/internal.js';
import { withTransaction } from '../database/pool.mjs';
import {
  assertBankConnection, compareReference, reject, requireActor, resolveReferenceGraph, storeReferenceGraph,
} from './common.mjs';

const ZERO_HASH = `sha256:${'0'.repeat(64)}`;

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}
function keyOf(ref) { return `${ref.kind}\u0000${ref.id}`; }
function namespaceFor(pkg) { return `factory/2/${digest([pkg.producerNamespace, pkg.batchKey])}`; }
function questionRoots(question) {
  const roots = [{ kind: 'taxonomy', id: question.taxonomyVersionId }];
  if (question.parentVersionId) roots.push({ kind: 'question', id: question.parentVersionId });
  if (question.stimulusVersionId) roots.push({ kind: 'stimulus', id: question.stimulusVersionId });
  for (const id of question.provenanceIds) roots.push({ kind: 'provenance', id });
  for (const id of question.private.evidenceRefs) roots.push({ kind: 'evidence', id });
  const images = new Set();
  const scan = (value) => {
    if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === 'object') {
      if (value.type === 'image' && typeof value.assetVersionId === 'string') images.add(value.assetVersionId);
      Object.values(value).forEach(scan);
    }
  };
  scan(question.content); scan(question.interaction); scan(question.private.explanation);
  for (const id of images) roots.push({ kind: 'asset', id });
  return roots;
}
function closure(question, nodes) {
  const found = new Map(); const pending = questionRoots(question);
  while (pending.length) {
    const ref = pending.pop(); const key = keyOf(ref);
    if (found.has(key)) continue;
    const node = nodes.get(key); if (!node) reject(422, 'REFERENCE_NOT_FOUND');
    found.set(key, node); pending.push(...node.references);
  }
  return [...found.values()].sort(compareReference);
}
function projection(question) { const { contentHash: _ignored, ...result } = question; return result; }

async function exactTaxonomy(client, node) {
  const result = await client.query(
    `SELECT tv.id, tv.name, tv.version_no, tv.definition_hash, tn.id AS node_id, tn.code, tn.kind, tn.parent_id, tn.metadata
       FROM tsa.taxonomy_versions tv LEFT JOIN tsa.taxonomy_nodes tn ON tn.taxonomy_version_id = tv.id
      WHERE tv.id = $1 ORDER BY tn.code`, [node.id]);
  if (result.rowCount === 0) reject(422, 'TAXONOMY_NOT_REGISTERED');
  const first = result.rows[0];
  const local = { schemaVersion: 'taxonomy/1', taxonomyVersionId: first.id, name: first.name,
    versionNo: Number(first.version_no), definitionHash: first.definition_hash,
    nodes: result.rows.filter((row) => row.node_id).map((row) => ({ id: row.node_id, code: row.code, kind: row.kind, parentId: row.parent_id, metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata })) };
  if (!Buffer.from(canonicalize(local)).equals(Buffer.from(canonicalize(node.payload)))) reject(422, 'TAXONOMY_REFERENCE_MISMATCH');
}
async function mapping(client, producer, kind, externalId, payload, create) {
  const hash = digest(payload);
  const result = await client.query(
    `SELECT local_id, payload_hash FROM tsa_private.factory_external_mappings
      WHERE producer_namespace=$1 AND external_kind=$2 AND external_id=$3`, [producer, kind, externalId]);
  if (result.rowCount) {
    if (result.rows[0].payload_hash !== hash) reject(409, 'IMPORT_CONFLICT');
    return result.rows[0].local_id;
  }
  const id = randomUUID();
  await create(id);
  await client.query(`INSERT INTO tsa_private.factory_external_mappings
    (producer_namespace, external_kind, external_id, local_id, payload_hash) VALUES ($1,$2,$3,$4,$5)`, [producer, kind, externalId, id, hash]);
  return id;
}
async function importSource(client, pkg, node) {
  return mapping(client, pkg.producerNamespace, 'source', node.id, node, async (sourceVersionId) => {
    const sourceId = randomUUID();
    await client.query(`INSERT INTO tsa.sources (id,title,canonical_uri,owner_reference,origin,created_by) VALUES ($1,$2,NULL,NULL,'EXTERNAL',NULL)`, [sourceId, node.payload.title]);
    await client.query(`INSERT INTO tsa.source_versions (id,source_id,version_no,content_hash,metadata,evidence_uri)
      VALUES ($1,$2,1,$3,$4::jsonb,NULL)`, [sourceVersionId, sourceId, digest(node.payload), JSON.stringify({ referenceNamespace: namespaceFor(pkg), referenceKind: 'source', referenceId: node.id })]);
  });
}
async function importAsset(client, pkg, node, member) {
  return mapping(client, pkg.producerNamespace, 'asset', node.id, node, async (assetId) => {
    const sourceId = randomUUID(); const sourceVersionId = randomUUID(); const bytes = Buffer.from(member.bytesBase64, 'base64');
    await client.query(`INSERT INTO tsa.sources (id,title,canonical_uri,owner_reference,origin,created_by) VALUES ($1,$2,NULL,NULL,'EXTERNAL',NULL)`, [sourceId, `Imported artifact ${member.bytesHash}`]);
    await client.query(`INSERT INTO tsa.source_versions (id,source_id,version_no,content_hash,metadata,evidence_uri) VALUES ($1,$2,1,$3,$4::jsonb,NULL)`, [sourceVersionId, sourceId, member.bytesHash, JSON.stringify({ importArtifact: true, referenceNamespace: namespaceFor(pkg), referenceKind: 'asset', referenceId: node.id })]);
    await client.query(`INSERT INTO tsa.asset_versions (id,source_version_id,object_key,content_hash,mime,byte_size,alt_metadata,security_class)
      VALUES ($1,$2,$3,$4,$5,$6,'{}'::jsonb,'QUESTION')`, [assetId, sourceVersionId, `factory/2/${digest([pkg.producerNamespace, pkg.batchKey, node.id])}`, member.bytesHash, member.mediaType, member.byteLength]);
    await client.query('INSERT INTO tsa_private.factory_asset_bytes (asset_version_id,bytes) VALUES ($1,$2)', [assetId, bytes]);
  });
}
async function importStimulus(client, pkg, node, nodeMap, sourceIds, assetIds) {
  return mapping(client, pkg.producerNamespace, 'stimulus', node.id, node, async (stimulusVersionId) => {
    const stimulusId = randomUUID();
    await client.query('INSERT INTO tsa.stimuli (id) VALUES ($1)', [stimulusId]);
    await client.query(`INSERT INTO tsa.stimulus_versions (id,stimulus_id,version_no,content,content_hash) VALUES ($1,$2,1,$3::jsonb,$4)`, [stimulusVersionId, stimulusId, JSON.stringify(node.payload.content), node.contentHash]);
    for (const provenanceId of node.payload.provenanceIds) {
      const provenance = nodeMap.get(keyOf({ kind: 'provenance', id: provenanceId }));
      const sourceVersionId = sourceIds.get(provenance.payload.sourceVersionId);
      await client.query(`INSERT INTO tsa.stimulus_sources (stimulus_version_id,source_version_id,span) VALUES ($1,$2,NULL) ON CONFLICT DO NOTHING`, [stimulusVersionId, sourceVersionId]);
    }
    for (const ref of node.references.filter((ref) => ref.kind === 'asset')) await client.query('INSERT INTO tsa.stimulus_assets (stimulus_version_id,asset_version_id) VALUES ($1,$2)', [stimulusVersionId, assetIds.get(ref.id)]);
  });
}

async function persistQuestion(client, question, local, nodeMap, sourceIds, assetIds, pkg, principal, { allowExistingAncestor = false } = {}) {
  const identity = computeQuestionIdentity(question, closure(question, nodeMap));
  const fingerprint = computeDuplicateFingerprint(question, closure(question, nodeMap));
  const existing = await client.query('SELECT question_id, content_hash FROM tsa.question_versions WHERE id=$1', [question.id]);
  if (existing.rowCount) {
    if (existing.rows[0].question_id !== question.questionId || existing.rows[0].content_hash !== identity.contentHash) reject(409, 'IMPORT_CONFLICT');
    if (!allowExistingAncestor) reject(409, 'IMPORT_CONFLICT');
    return identity.contentHash;
  }
  const author = await client.query('SELECT id FROM tsa.users WHERE id = $1', [question.createdBy]);
  if (author.rowCount !== 1) reject(422, 'AUTHOR_NOT_REGISTERED');
  const q = await client.query('SELECT id FROM tsa.questions WHERE id=$1', [question.questionId]);
  if (!q.rowCount) await client.query('INSERT INTO tsa.questions (id) VALUES ($1)', [question.questionId]);
  await client.query(`INSERT INTO tsa.question_versions (id,question_id,version_no,parent_version_id,schema_version,language,section,taxonomy_version_id,domain_id,skill_ids,subskill_ids,cognitive_level,difficulty,content,stimulus_version_id,interaction,origin,provenance_ids,generation_run_id,created_by,created_at,authored_created_at,content_hash,normalized_fingerprint,reference_namespace)
    VALUES ($1,$2,$3,$4,$5,$6,$7::tsa.question_section,$8,$9,$10::jsonb,$11::jsonb,$12::tsa.cognitive_level,$13::jsonb,$14::jsonb,$15,$16::jsonb,$17::tsa.question_origin,$18::jsonb,$19,$20,$21::timestamptz,$22,$23,$24,$25)`,
    [question.id,question.questionId,question.versionNo,question.parentVersionId,question.schemaVersion,question.language,question.section,question.taxonomyVersionId,question.domainId,JSON.stringify(question.skillIds),JSON.stringify(question.subskillIds),question.cognitiveLevel,JSON.stringify(question.difficulty),JSON.stringify(question.content),local.stimuli.get(question.stimulusVersionId) ?? null,JSON.stringify(question.interaction),question.origin,JSON.stringify(question.provenanceIds),null,question.createdBy,question.createdAt,question.createdAt,identity.contentHash,fingerprint.fingerprint,namespaceFor(pkg)]);
  await client.query(`INSERT INTO tsa_private.question_secrets (question_version_id,answer_key,explanation,scoring_policy_version,evidence) VALUES ($1,$2::jsonb,$3::jsonb,$4,$5::jsonb)`, [question.id,JSON.stringify(question.private.answerKey),JSON.stringify(question.private.explanation),question.private.scoringPolicy,JSON.stringify(question.private.evidenceRefs)]);
  const taxonomy = await client.query('SELECT id,code,kind,parent_id FROM tsa.taxonomy_nodes WHERE taxonomy_version_id=$1', [question.taxonomyVersionId]);
  const byCode = new Map(taxonomy.rows.map((row) => [row.code,row]));
  const domain = byCode.get(question.domainId);
  const skills = question.skillIds.map((code) => byCode.get(code));
  if (!domain || domain.kind !== 'DOMAIN' || skills.some((node) => !node || node.kind !== 'SKILL' || node.parent_id !== domain.id)) reject(422, 'TAXONOMY_MEMBERSHIP_INVALID');
  const skillIds = new Set(skills.map((node) => node.id));
  if (question.subskillIds.some((code) => { const node = byCode.get(code); return !node || node.kind !== 'SUBSKILL' || !skillIds.has(node.parent_id); })) reject(422, 'TAXONOMY_MEMBERSHIP_INVALID');
  const rows = [{ code:question.domainId,dimension:'DOMAIN',ordinal:0 }, ...question.skillIds.map((code,ordinal)=>({code,dimension:'SKILL',ordinal})), ...question.subskillIds.map((code,ordinal)=>({code,dimension:'SUBSKILL',ordinal}))];
  for (const row of rows) { if (!byCode.has(row.code)) reject(422,'TAXONOMY_MEMBERSHIP_INVALID'); await client.query('INSERT INTO tsa.question_taxonomy (question_version_id,taxonomy_version_id,node_code,dimension,ordinal) VALUES ($1,$2,$3,$4,$5)',[question.id,question.taxonomyVersionId,row.code,row.dimension,row.ordinal]); }
  for (const [ordinal, provenanceId] of question.provenanceIds.entries()) {
    const node=nodeMap.get(keyOf({kind:'provenance',id:provenanceId})); const p=node.payload; const sourceVersionId=sourceIds.get(p.sourceVersionId);
    await client.query(`INSERT INTO tsa.question_provenance (question_version_id,provenance_id,ordinal,source_version_id,origin,source_span,transformation,creator,rights_decision_at_authoring) VALUES ($1,$2,$3,$4,$5::tsa.question_origin,$6,$7,$8,NULL)`,[question.id,provenanceId,ordinal,sourceVersionId,p.origin,p.sourceSpan,p.transformation,p.creator]);
  }
  const assetPurposes = new Map();
  const scanAssets = (value, purpose) => {
    if (Array.isArray(value)) value.forEach((item) => scanAssets(item, purpose));
    else if (value && typeof value === 'object') {
      if (value.type === 'image' && typeof value.assetVersionId === 'string') {
        const purposes = assetPurposes.get(value.assetVersionId) ?? new Set(); purposes.add(purpose); assetPurposes.set(value.assetVersionId, purposes);
      }
      Object.values(value).forEach((item) => scanAssets(item, purpose));
    }
  };
  scanAssets(question.content, 'QUESTION'); scanAssets(question.interaction, 'QUESTION'); scanAssets(question.private.explanation, 'EXPLANATION');
  for (const [externalId, purposes] of assetPurposes) for (const purpose of purposes) await client.query(`INSERT INTO tsa.question_assets (question_version_id,asset_version_id,purpose) VALUES ($1,$2,$3::tsa.question_asset_purpose)`,[question.id,assetIds.get(externalId),purpose]);
  await client.query(`INSERT INTO tsa.question_workflow (question_version_id,state,revision) VALUES ($1,'DRAFT',1)`,[question.id]);
  const duplicates=await client.query(`SELECT qv.id FROM tsa.question_versions qv WHERE qv.section=$1 AND qv.normalized_fingerprint=$2 AND qv.id<>$3`,[question.section,fingerprint.fingerprint,question.id]);
  for (const row of duplicates.rows) { const [left,right]=row.id<question.id?[row.id,question.id]:[question.id,row.id]; await client.query(`INSERT INTO tsa.duplicate_relations (id,left_version_id,right_version_id,kind,evidence,detector_version) VALUES ($1,$2,$3,'EXACT',$4::jsonb,'fingerprint/1') ON CONFLICT DO NOTHING`,[randomUUID(),left,right,JSON.stringify({fingerprint:fingerprint.fingerprint})]); }
  if (duplicates.rowCount) await client.query('UPDATE tsa.bank_state SET eligibility_revision=eligibility_revision+1,updated_at=clock_timestamp() WHERE id=1');
  return identity.contentHash;
}

function parsedJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function integrity(condition) {
  if (!condition) reject(409, 'IMPORT_INTEGRITY_CONFLICT');
}

function sameCanonical(left, right) {
  return Buffer.from(canonicalize(left)).equals(Buffer.from(canonicalize(right)));
}

function comparableNode(node) {
  return {
    kind: node.kind,
    id: node.id,
    payload: node.payload,
    references: node.references.map(({ kind, id }) => ({ kind, id })).sort(compareReference),
    contentHash: node.contentHash,
  };
}

async function loadPersistedQuestion(client, versionId, producerNamespace) {
  const result = await client.query(
    `SELECT qv.id, qv.question_id, qv.version_no, qv.parent_version_id,
            qv.schema_version, qv.language, qv.section, qv.taxonomy_version_id,
            qv.domain_id, qv.skill_ids, qv.subskill_ids, qv.cognitive_level,
            qv.difficulty, qv.content, qv.stimulus_version_id, qv.interaction,
            qv.origin, qv.provenance_ids, qv.generation_run_id, qv.created_by,
            qv.authored_created_at, qv.content_hash, qv.normalized_fingerprint,
            qv.reference_namespace, qs.answer_key, qs.explanation, qs.evidence,
            qs.scoring_policy_version, run.external_generation_run_id,
            stimulus.external_id AS external_stimulus_version_id
       FROM tsa.question_versions qv
       JOIN tsa_private.question_secrets qs ON qs.question_version_id = qv.id
       LEFT JOIN tsa_private.factory_import_runs run ON run.question_version_id = qv.id
       LEFT JOIN tsa_private.factory_external_mappings stimulus
         ON stimulus.producer_namespace = $2
        AND stimulus.external_kind = 'stimulus'
        AND stimulus.local_id = qv.stimulus_version_id
      WHERE qv.id = $1`, [versionId, producerNamespace]);
  if (result.rowCount !== 1) reject(409, 'IMPORT_INTEGRITY_CONFLICT');
  const row = result.rows[0];
  if (!row.authored_created_at || !row.reference_namespace
      || (row.stimulus_version_id !== null && row.external_stimulus_version_id === null)) {
    reject(409, 'IMPORT_INTEGRITY_CONFLICT');
  }
  let question;
  try {
    question = QuestionVersionSchema.parse({
      schemaVersion: row.schema_version,
      id: row.id,
      questionId: row.question_id,
      versionNo: Number(row.version_no),
      parentVersionId: row.parent_version_id,
      language: row.language,
      section: row.section,
      taxonomyVersionId: row.taxonomy_version_id,
      domainId: row.domain_id,
      skillIds: parsedJson(row.skill_ids),
      subskillIds: parsedJson(row.subskill_ids),
      cognitiveLevel: row.cognitive_level,
      difficulty: parsedJson(row.difficulty),
      content: parsedJson(row.content),
      stimulusVersionId: row.external_stimulus_version_id,
      interaction: parsedJson(row.interaction),
      private: {
        answerKey: parsedJson(row.answer_key),
        explanation: parsedJson(row.explanation),
        evidenceRefs: parsedJson(row.evidence),
        scoringPolicy: row.scoring_policy_version,
      },
      origin: row.origin,
      provenanceIds: parsedJson(row.provenance_ids),
      generationRunId: row.external_generation_run_id ?? row.generation_run_id,
      createdBy: row.created_by,
      createdAt: row.authored_created_at,
      contentHash: row.content_hash,
    });
  } catch {
    reject(409, 'IMPORT_INTEGRITY_CONFLICT');
  }
  return { row, question };
}

async function verifyPersistedQuestion(client, versionId, producerNamespace, expectedQuestion, expectedNode) {
  const { row, question } = await loadPersistedQuestion(client, versionId, producerNamespace);
  const graph = await resolveReferenceGraph(client, row.reference_namespace, [{ kind: 'question', id: versionId }]);
  const questionNode = graph.find((node) => node.kind === 'question' && node.id === versionId);
  integrity(questionNode);
  integrity(sameCanonical(questionNode.payload, projection(question)));
  if (expectedNode) integrity(sameCanonical(comparableNode(questionNode), comparableNode(expectedNode)));
  if (expectedQuestion) integrity(sameCanonical(question, expectedQuestion));

  const dependencies = graph.filter((node) => !(node.kind === 'question' && node.id === versionId));
  const identity = computeQuestionIdentity(question, dependencies);
  const fingerprint = computeDuplicateFingerprint(question, dependencies);
  integrity(identity.contentHash === row.content_hash);
  integrity(fingerprint.fingerprint === row.normalized_fingerprint);
  return { row, question, graph, identity, fingerprint };
}

async function verifyNodeAtNamespace(client, namespace, expectedNode) {
  integrity(typeof namespace === 'string' && namespace.startsWith('factory/2/'));
  const graph = await resolveReferenceGraph(client, namespace, [{ kind: expectedNode.kind, id: expectedNode.id }]);
  const stored = graph.find((node) => node.kind === expectedNode.kind && node.id === expectedNode.id);
  integrity(stored && sameCanonical(comparableNode(stored), comparableNode(expectedNode)));
}

async function verifyMaterializedMappings(client, pkg) {
  const nodes = new Map(pkg.references.map((node) => [keyOf(node), node]));
  const members = new Map(pkg.assets.map((asset) => [asset.assetVersionId, asset]));
  const sourceIds = new Map();
  const assetIds = new Map();
  const stimulusIds = new Map();

  for (const node of pkg.references) {
    if (!['source', 'asset', 'stimulus'].includes(node.kind)) continue;
    const kind = node.kind;
    const mapped = await client.query(
      `SELECT local_id, payload_hash FROM tsa_private.factory_external_mappings
        WHERE producer_namespace = $1 AND external_kind = $2 AND external_id = $3`,
      [pkg.producerNamespace, kind, node.id]);
    integrity(mapped.rowCount === 1 && mapped.rows[0].payload_hash === digest(node));
    const localId = mapped.rows[0].local_id;

    if (kind === 'source') {
      const stored = await client.query(
        `SELECT s.id AS source_id, s.title, s.origin, sv.id, sv.content_hash, sv.metadata
           FROM tsa.source_versions sv JOIN tsa.sources s ON s.id = sv.source_id
          WHERE sv.id = $1`, [localId]);
      integrity(stored.rowCount === 1);
      const row = stored.rows[0];
      const metadata = parsedJson(row.metadata);
      integrity(row.title === node.payload.title && row.origin === 'EXTERNAL'
        && row.content_hash === digest(node.payload)
        && metadata.referenceKind === 'source' && metadata.referenceId === node.id);
      await verifyNodeAtNamespace(client, metadata.referenceNamespace, node);
      sourceIds.set(node.id, localId);
    } else if (kind === 'asset') {
      const member = members.get(node.id);
      integrity(member);
      const stored = await client.query(
        `SELECT av.id, av.source_version_id, av.content_hash, av.mime, av.byte_size,
                av.object_key, sv.content_hash AS source_hash, sv.metadata AS source_metadata,
                s.title, s.origin
           FROM tsa.asset_versions av
           JOIN tsa.source_versions sv ON sv.id = av.source_version_id
           JOIN tsa.sources s ON s.id = sv.source_id
          WHERE av.id = $1`, [localId]);
      integrity(stored.rowCount === 1);
      const row = stored.rows[0];
      const bytes = await client.query('SELECT bytes FROM tsa_private.factory_asset_bytes WHERE asset_version_id = $1', [localId]);
      integrity(bytes.rowCount === 1 && Buffer.isBuffer(bytes.rows[0].bytes));
      const metadata = parsedJson(row.source_metadata);
      integrity(row.content_hash === member.bytesHash && row.mime === member.mediaType
        && Number(row.byte_size) === member.byteLength && row.source_hash === member.bytesHash
        && row.origin === 'EXTERNAL' && row.title === `Imported artifact ${member.bytesHash}`
        && /^factory\/2\/sha256:[0-9a-f]{64}$/.test(row.object_key)
        && metadata.importArtifact === true && metadata.referenceKind === 'asset' && metadata.referenceId === node.id
        && bytes.rows[0].bytes.length === member.byteLength
        && `sha256:${createHash('sha256').update(bytes.rows[0].bytes).digest('hex')}` === member.bytesHash);
      await verifyNodeAtNamespace(client, metadata.referenceNamespace, node);
      assetIds.set(node.id, localId);
    } else {
      const stored = await client.query(
        `SELECT id, content, content_hash FROM tsa.stimulus_versions WHERE id = $1`, [localId]);
      integrity(stored.rowCount === 1);
      integrity(sameCanonical(parsedJson(stored.rows[0].content), node.payload.content)
        && stored.rows[0].content_hash === node.contentHash);
      stimulusIds.set(node.id, localId);
    }
  }

  for (const node of pkg.references.filter((item) => item.kind === 'taxonomy')) {
    await exactTaxonomy(client, node);
  }
  for (const node of pkg.references.filter((item) => item.kind === 'stimulus')) {
    const localId = stimulusIds.get(node.id);
    const expectedSources = [...new Set(node.payload.provenanceIds.map((provenanceId) => {
      const provenance = nodes.get(keyOf({ kind: 'provenance', id: provenanceId }));
      integrity(provenance);
      const sourceId = sourceIds.get(provenance.payload.sourceVersionId);
      integrity(sourceId);
      return sourceId;
    }))].sort();
    const expectedAssets = node.references.filter((ref) => ref.kind === 'asset')
      .map((ref) => assetIds.get(ref.id)).sort();
    const [sources, assets] = await Promise.all([
      client.query('SELECT source_version_id FROM tsa.stimulus_sources WHERE stimulus_version_id = $1 ORDER BY source_version_id', [localId]),
      client.query('SELECT asset_version_id FROM tsa.stimulus_assets WHERE stimulus_version_id = $1 ORDER BY asset_version_id', [localId]),
    ]);
    integrity(sameCanonical(sources.rows.map((row) => row.source_version_id), expectedSources));
    integrity(sameCanonical(assets.rows.map((row) => row.asset_version_id), expectedAssets));
  }
}

async function verifyStoredPackage(client, pkg, { requireDraftReceipts = false } = {}) {
  const namespace = namespaceFor(pkg);
  const nodeMap = new Map(pkg.references.map((node) => [keyOf(node), node]));
  const candidateNodes = pkg.candidates.map((candidate) => {
    const dependencies = questionRoots(candidate.question).map((reference) => {
      const node = nodeMap.get(keyOf(reference));
      integrity(node);
      return { ...reference, contentHash: node.contentHash };
    }).sort(compareReference);
    return {
      kind: 'question',
      id: candidate.question.id,
      payload: projection(candidate.question),
      references: dependencies.map(({ kind, id }) => ({ kind, id })),
      contentHash: createReferenceHash({
        kind: 'question', id: candidate.question.id,
        payload: projection(candidate.question), references: dependencies,
      }),
    };
  });
  const expectedNodes = new Map([...pkg.references, ...candidateNodes].map((node) => [keyOf(node), comparableNode(node)]));
  const resolvedNodes = new Map();
  for (const candidate of pkg.candidates) {
    const graph = await resolveReferenceGraph(client, namespace, [{ kind: 'question', id: candidate.question.id }]);
    for (const node of graph) resolvedNodes.set(keyOf(node), comparableNode(node));
  }
  integrity(resolvedNodes.size === expectedNodes.size);
  for (const [key, expected] of expectedNodes) integrity(sameCanonical(resolvedNodes.get(key), expected));

  await verifyMaterializedMappings(client, pkg);
  const questionNodes = [
    ...pkg.references.filter((node) => node.kind === 'question'),
    ...candidateNodes,
  ];
  const candidateById = new Map(pkg.candidates.map((candidate) => [candidate.question.id, candidate]));
  for (const node of questionNodes) {
    const candidate = candidateById.get(node.id);
    await verifyPersistedQuestion(
      client,
      node.id,
      pkg.producerNamespace,
      candidate?.question,
      node,
    );
  }
  if (requireDraftReceipts) {
    for (const candidate of pkg.candidates) {
      const state = await client.query(
        `SELECT qw.state::text AS state, q.eligible_version_id,
                (SELECT count(*)::int FROM tsa.reviews review WHERE review.question_version_id = qv.id) AS review_count
           FROM tsa.question_versions qv
           JOIN tsa.questions q ON q.id = qv.question_id
           JOIN tsa.question_workflow qw ON qw.question_version_id = qv.id
          WHERE qv.id = $1`, [candidate.question.id]);
      integrity(state.rowCount === 1 && state.rows[0].state === 'DRAFT'
        && state.rows[0].eligible_version_id !== candidate.question.id && state.rows[0].review_count === 0);
    }
  }
}

async function importFactoryPackageV2(bankPool, identityService, principal, input, capability, configuredCapability) {
  if (!configuredCapability || capability !== configuredCapability) reject(403, 'FORBIDDEN');
  requireActor(identityService, principal, 'bank.question.author');
  let pkg; try { pkg=parseFactoryPackageV2(input); } catch { reject(422,'VALIDATION_ERROR'); }
  const manifestHash=digest(pkg); const namespace=namespaceFor(pkg);
  return withTransaction(bankPool, async (client) => {
    await client.query("SELECT set_config('tsa.bank_actor_id',$1,true)",[principal.userId]);
    await client.query('SELECT id FROM tsa.bank_state WHERE id=1 FOR UPDATE');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['factory-package/2',pkg.producerNamespace,pkg.batchKey])]);
    const prior = await client.query(
      `SELECT manifest_hash, manifest FROM tsa_private.factory_import_manifests
        WHERE producer_namespace = $1 AND batch_key = $2`,
      [pkg.producerNamespace, pkg.batchKey]);
    if (prior.rowCount) {
      const storedManifest = parsedJson(prior.rows[0].manifest);
      if (prior.rows[0].manifest_hash !== manifestHash || digest(storedManifest) !== prior.rows[0].manifest_hash
          || !sameCanonical(storedManifest, pkg)) reject(409, 'IMPORT_CONFLICT');
      const receipts = await client.query(
        `SELECT receipt.producer_namespace AS "producerNamespace",
                receipt.batch_key AS "batchKey",
                receipt.item_key AS "itemKey",
                receipt.candidate_ordinal AS "candidateOrdinal",
                receipt.input_hash AS "inputHash",
                receipt.question_id AS "questionId",
                receipt.question_version_id AS "questionVersionId",
                receipt.external_generation_run_id AS "generationRunId",
                'DRAFT'::text AS "workflowState"
           FROM tsa_private.factory_import_receipts receipt
          WHERE receipt.producer_namespace = $1 AND receipt.batch_key = $2
          ORDER BY receipt.item_key, receipt.candidate_ordinal`,
        [pkg.producerNamespace, pkg.batchKey]);
      if (receipts.rowCount !== pkg.candidates.length) reject(409, 'IMPORT_INTEGRITY_CONFLICT');
      const expected = new Map(pkg.candidates.map((candidate) => [`${candidate.itemKey}\u0000${candidate.candidateOrdinal}`, candidate]));
      for (const receipt of receipts.rows) {
        const candidate = expected.get(`${receipt.itemKey}\u0000${receipt.candidateOrdinal}`);
        if (!candidate || receipt.inputHash !== candidate.contentHash || receipt.questionId !== candidate.question.questionId
            || receipt.questionVersionId !== candidate.question.id || receipt.generationRunId !== candidate.question.generationRunId
            || receipt.workflowState !== 'DRAFT') {
          reject(409, 'IMPORT_INTEGRITY_CONFLICT');
        }
      }
      await verifyStoredPackage(client, pkg);
      return { receipts: pkg.candidates.map((candidate) => receipts.rows.find((receipt) =>
        receipt.itemKey === candidate.itemKey && receipt.candidateOrdinal === candidate.candidateOrdinal)), replayed:true };
    }
    const nodeMap=new Map(pkg.references.map((node)=>[keyOf(node),node]));
    for (const node of pkg.references.filter((node)=>node.kind==='taxonomy')) await exactTaxonomy(client,node);
    const sourceIds=new Map(); for (const node of pkg.references.filter((node)=>node.kind==='source')) sourceIds.set(node.id,await importSource(client,pkg,node));
    const assetIds=new Map(); const members=new Map(pkg.assets.map((asset)=>[asset.assetVersionId,asset])); for (const node of pkg.references.filter((node)=>node.kind==='asset')) assetIds.set(node.id,await importAsset(client,pkg,node,members.get(node.id)));
    const local={stimuli:new Map()};
    for (const node of pkg.references.filter((node)=>node.kind==='stimulus')) local.stimuli.set(node.id,await importStimulus(client,pkg,node,nodeMap,sourceIds,assetIds));
    const parentNodes=pkg.references.filter((node)=>node.kind==='question');
    const parents=parentNodes.map((node)=>({...node.payload,contentHash:ZERO_HASH}));
    const parentById=new Map(parents.map((parent)=>[parent.id,parent]));
    const ordered=[]; const visit=(question)=>{if(question.parentVersionId&&parentById.has(question.parentVersionId)) visit(parentById.get(question.parentVersionId));if(!ordered.some((item)=>item.id===question.id))ordered.push(question);};
    for(const candidate of pkg.candidates) visit(candidate.question); for(const parent of parents) visit(parent);
    const candidateVersionIds = new Set(pkg.candidates.map((candidate) => candidate.question.id));
    const imported=new Map();
    for(const question of ordered) {
      imported.set(question.id,await persistQuestion(
        client,question,local,nodeMap,sourceIds,assetIds,pkg,principal,
        { allowExistingAncestor: !candidateVersionIds.has(question.id) },
      ));
      if (!pkg.candidates.some((candidate) => candidate.question.id === question.id) && question.generationRunId !== null) {
        await client.query('INSERT INTO tsa_private.factory_import_runs (question_version_id,external_generation_run_id,run_metadata) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING', [question.id, question.generationRunId, JSON.stringify({ ancestralReference: true })]);
      }
    }
    for(const candidate of pkg.candidates) { await client.query('INSERT INTO tsa_private.factory_import_runs (question_version_id,external_generation_run_id,run_metadata) VALUES ($1,$2,$3::jsonb)',[candidate.question.id,candidate.run.generationRunId,JSON.stringify(candidate.run)]); for(const validation of candidate.validations) await client.query(`INSERT INTO tsa.validation_runs (id,question_version_id,input_hash,validator_version,kind,outcome,evidence,job_id,actor) VALUES ($1,$2,$3,$4,$5,$6::tsa.validation_outcome,$7::jsonb,NULL,$8)`,[randomUUID(),candidate.question.id,candidate.contentHash,validation.validatorVersion,validation.validatorKind,validation.outcome,JSON.stringify({evidencePointer:validation.evidencePointer,at:validation.at}),validation.actor]); }
    const candidateNodes = pkg.candidates.map((candidate) => {
      const dependencies = questionRoots(candidate.question).map((reference) => {
        const node = nodeMap.get(keyOf(reference));
        if (!node) reject(422, 'REFERENCE_NOT_FOUND');
        return { ...reference, contentHash: node.contentHash };
      }).sort(compareReference);
      return {
        kind: 'question', id: candidate.question.id, payload: projection(candidate.question),
        references: dependencies.map(({ kind, id }) => ({ kind, id })),
        contentHash: createReferenceHash({ kind: 'question', id: candidate.question.id,
          payload: projection(candidate.question), references: dependencies }),
      };
    });
    await storeReferenceGraph(client,namespace,[...pkg.references,...candidateNodes]);
    await client.query('INSERT INTO tsa_private.factory_import_manifests (producer_namespace,batch_key,manifest_hash,manifest,received_by) VALUES ($1,$2,$3,$4::jsonb,$5)',[pkg.producerNamespace,pkg.batchKey,manifestHash,JSON.stringify(pkg),principal.userId]);
    const receipts = [];
    for (const candidate of pkg.candidates) {
      const receipt = {
        producerNamespace: pkg.producerNamespace,
        batchKey: pkg.batchKey,
        itemKey: candidate.itemKey,
        candidateOrdinal: candidate.candidateOrdinal,
        inputHash: candidate.contentHash,
        questionId: candidate.question.questionId,
        questionVersionId: candidate.question.id,
        generationRunId: candidate.question.generationRunId,
        workflowState: 'DRAFT',
      };
      await client.query(
        `INSERT INTO tsa_private.factory_import_receipts
          (producer_namespace, batch_key, item_key, candidate_ordinal, input_hash,
           question_id, question_version_id, external_generation_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [receipt.producerNamespace, receipt.batchKey, receipt.itemKey, receipt.candidateOrdinal,
          receipt.inputHash, receipt.questionId, receipt.questionVersionId, receipt.generationRunId]);
      receipts.push(receipt);
    }
    await verifyStoredPackage(client, pkg, { requireDraftReceipts: true });
    return {receipts,replayed:false};
  },{role:'tsa_bank'});
}

export async function createFactoryImportService({bankPool,identityService,internalCapability}) {
  if (!internalCapability || (typeof internalCapability !== 'object' && typeof internalCapability !== 'function')) throw new TypeError('An internal import capability is required');
  await assertBankConnection(bankPool);
  return Object.freeze({ importFactoryPackageV2: (operatorPrincipal, input, capability) =>
    importFactoryPackageV2(bankPool, identityService, operatorPrincipal, input, capability, internalCapability) });
}
