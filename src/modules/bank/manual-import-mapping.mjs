import { createHash } from 'node:crypto';
import { canonicalize, CORPUS_INTERACTIONS_TRANSFORMATION, MATH_INTERACTIONS_TRANSFORMATION, parseManualImportMapping, parseManualImportMappingV4 } from '../../../packages/contracts/dist/internal.js';
import { jsonDigest, reject } from './common.mjs';

const same = (left, right) => Buffer.from(canonicalize(left)).equals(Buffer.from(canonicalize(right)));
const need = (condition) => { if (!condition) reject(422, 'MANUAL_MAPPING_INVALID'); };
const isInteraction = (profile) => ['corpus-reading-interactions-draft/1', 'corpus-math-interactions-draft/1'].includes(profile);
const MATH_PROFILES = new Set(['corpus-math-draft/1', 'corpus-math-numeric-draft/1', 'corpus-math-interactions-draft/1']);
const sectionFor = (profile) => MATH_PROFILES.has(profile) ? 'MATH' : 'READING';

function parseMapping(input) {
  try { return parseManualImportMappingV4(input); }
  catch {
    try { return parseManualImportMapping(input); }
    catch { need(false); }
  }
}

function verifyInteractionProvenance(pkg, mapping, principal) {
  const permission = pkg.sourcePermissions?.[0];
  const authoring = pkg.sourceAuthoring?.[0];
  const sourceNode = pkg.references.find((node) => node.kind === 'source' && node.id === mapping.sourceVersionId);
  const text = sourceNode?.payload?.content?.length === 1 && sourceNode.payload.content[0]?.type === 'text'
    ? sourceNode.payload.content[0].text : null;
  need(typeof text === 'string');
  const sourceTextHash = `sha256:${createHash('sha256').update(new TextEncoder().encode(text)).digest('hex')}`;
  need(pkg.schemaVersion === 'factory-package/4' && isInteraction(pkg.profile)
    && pkg.manualRun.kind === (sectionFor(pkg.profile) === 'MATH' ? 'SUBSCRIPTION_VISION_TRANSCRIPTION' : 'DETERMINISTIC_CORPUS_EXTRACTION')
    && permission?.sourceVersionId === mapping.sourceVersionId && permission.sourceTextHash === sourceTextHash
    && permission.copyrightVerification === 'UNVERIFIED' && permission.publicationPermission === false
    && authoring?.kind === 'CORPUS_IMPORTED' && authoring.sourceVersionId === mapping.sourceVersionId
    && authoring.sourceTextHash === sourceTextHash && authoring.exactModelRevision === null
    && authoring.scientificVerification === 'UNVERIFIED' && authoring.copyrightVerification === 'UNVERIFIED');
  const provenance = pkg.references.filter((node) => node.kind === 'provenance');
  need(provenance.length === 1);
  const record = provenance[0];
  need(record.payload.sourceVersionId === mapping.sourceVersionId && record.payload.origin === 'IMPORTED'
    && record.payload.creator === principal.userId && record.payload.sourcePermissionId === permission.id
    && record.payload.transformation === (sectionFor(pkg.profile) === 'MATH' ? MATH_INTERACTIONS_TRANSFORMATION : CORPUS_INTERACTIONS_TRANSFORMATION)
    && record.payload.manualRunId === pkg.manualRun.manualRunId);
  for (const candidate of pkg.candidates) {
    const question = candidate.question;
    need(question.schemaVersion === 'question/3' && question.private.scoringPolicy === 'practice-binary-v3'
      && question.origin === 'IMPORTED' && question.createdBy === principal.userId
      && question.provenanceIds.length === 1 && question.provenanceIds[0] === record.id);
  }
}

export async function loadRegisteredManualTaxonomy(client, input) {
  const mapping = parseMapping(input);
  const section = sectionFor(mapping.profile);
  const result = await client.query(`SELECT tv.id,tv.name,tv.version_no,tv.definition_hash,
    n.id AS node_id,n.code,n.kind,n.parent_id,n.metadata
    FROM tsa.taxonomy_versions tv LEFT JOIN tsa.taxonomy_nodes n ON n.taxonomy_version_id=tv.id
    WHERE tv.id=$1 ORDER BY n.code`, [mapping.taxonomy.registeredVersionId]);
  need(result.rowCount > 0);
  const row = result.rows[0];
  need(row.definition_hash === mapping.taxonomy.registeredDefinitionHash);
  const taxonomy = { schemaVersion: 'taxonomy/1', taxonomyVersionId: row.id,
    name: row.name, versionNo: Number(row.version_no), definitionHash: row.definition_hash,
    nodes: result.rows.filter((node) => node.node_id).map((node) => ({ id: node.node_id,
      code: node.code, kind: node.kind, parentId: node.parent_id, metadata: node.metadata })) };
  const nodes = new Map(taxonomy.nodes.map((node) => [node.code, node]));
  need(mapping.taxonomy.nodes.length === 2);
  for (const declared of mapping.taxonomy.nodes) {
    const node = nodes.get(declared.registeredCode);
    need(node && node.id === declared.registeredNodeId && node.kind === declared.registeredKind
      && declared.stagingCode === declared.registeredCode && declared.stagingKind === declared.registeredKind
      && declared.section === section);
    if (node.kind === 'DOMAIN') need(node.code === section && node.parentId === null && declared.parentCode === null);
    else need(node.kind === 'SKILL' && nodes.get(section)?.id === node.parentId && declared.parentCode === section);
  }
  need(new Set(mapping.taxonomy.nodes.map((node) => node.registeredNodeId)).size === 2);
  return taxonomy;
}

/** Recheck current registered values inside the guarded import transaction. */
export async function verifyManualRegisteredMapping(client, principal, pkg, input) {
  const mapping = parseMapping(input);
  const section = sectionFor(mapping.profile);
  need(principal.userId === mapping.registeredAuthorId
    && pkg.profile === mapping.profile
    && pkg.manualRun.declaredOperatorId === mapping.declaredOperatorId
    && pkg.producerNamespace === mapping.producerNamespace && pkg.batchKey === mapping.batchKey
    && pkg.manualRun.sourceVersionIds.length === 1 && pkg.manualRun.sourceVersionIds[0] === mapping.sourceVersionId);
  const author = await client.query('SELECT id,disabled_at FROM tsa.users WHERE id=$1', [mapping.registeredAuthorId]);
  need(author.rowCount === 1 && author.rows[0].disabled_at === null);
  const taxonomy = await loadRegisteredManualTaxonomy(client, mapping);
  const tax = pkg.references.filter((node) => node.kind === 'taxonomy');
  need(tax.length === 1 && tax[0].id === taxonomy.taxonomyVersionId && same(tax[0].payload, taxonomy));
  const maps = pkg.references.filter((node) => node.kind === 'evidence' && node.payload.schemaVersion === 'manual-candidate-map/1');
  need(maps.length === mapping.candidates.length && pkg.candidates.length === mapping.candidates.length);
  for (const declared of mapping.candidates) {
    const candidate = pkg.candidates.find((item) => item.candidateOrdinal === declared.candidateOrdinal);
    need(candidate);
    const q = candidate.question;
    const bound = maps.find((node) => node.payload.candidateOrdinal === declared.candidateOrdinal);
    need(bound && bound.payload.rawQuestionId === declared.rawQuestionId
      && bound.payload.declaredOperatorId === mapping.declaredOperatorId
      && bound.payload.registeredAuthorId === principal.userId
      && bound.payload.stagingTaxonomyVersionId === mapping.taxonomy.stagingVersionId
      && bound.payload.registeredTaxonomyVersionId === mapping.taxonomy.registeredVersionId
      && bound.payload.taxonomyMappingHash === jsonDigest(mapping.taxonomy)
      && q.id === declared.questionVersionId && q.questionId === declared.questionId
      && q.stimulusVersionId === declared.stimulusVersionId
      && q.createdBy === principal.userId && q.taxonomyVersionId === taxonomy.taxonomyVersionId
      && q.section === section && q.domainId === section && q.skillIds.length === 1 && q.subskillIds.length === 0
      && mapping.taxonomy.nodes.some((node) => node.registeredKind === 'SKILL' && node.registeredCode === q.skillIds[0]));
  }
  if (isInteraction(mapping.profile)) verifyInteractionProvenance(pkg, mapping, principal);
  return { mapping, taxonomy };
}
