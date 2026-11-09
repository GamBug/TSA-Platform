import { canonicalize, parseManualImportMapping } from '../../../packages/contracts/dist/internal.js';
import { jsonDigest, reject } from './common.mjs';

const same = (left, right) => Buffer.from(canonicalize(left)).equals(Buffer.from(canonicalize(right)));
const need = (condition) => { if (!condition) reject(422, 'MANUAL_MAPPING_INVALID'); };

export async function loadRegisteredManualTaxonomy(client, input) {
  const mapping = parseManualImportMapping(input);
  const section = mapping.profile === 'corpus-math-draft/1' ? 'MATH' : 'READING';
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
  const mapping = parseManualImportMapping(input);
  const section = mapping.profile === 'corpus-math-draft/1' ? 'MATH' : 'READING';
  need(principal.userId === mapping.registeredAuthorId
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
  return { mapping, taxonomy };
}
