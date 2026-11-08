/** Registered immutable classification metadata for authenticated staff authoring. */
export async function listAuthoringTaxonomies(bankPool) {
  const result = await bankPool.query(
    `SELECT v.id AS "taxonomyVersionId", v.name, v.version_no AS "versionNo",
            n.id, n.code, n.kind, n.parent_id AS "parentId", n.metadata
       FROM tsa.taxonomy_versions v JOIN tsa.taxonomy_nodes n ON n.taxonomy_version_id=v.id
      ORDER BY v.name, v.version_no DESC, n.code`);
  const versions = new Map();
  for (const row of result.rows) {
    if (!versions.has(row.taxonomyVersionId)) versions.set(row.taxonomyVersionId, {
      taxonomyVersionId: row.taxonomyVersionId, name: row.name, versionNo: row.versionNo, nodes: [],
    });
    versions.get(row.taxonomyVersionId).nodes.push({
      id: row.id, code: row.code, kind: row.kind, parentId: row.parentId, metadata: row.metadata,
    });
  }
  return [...versions.values()];
}
