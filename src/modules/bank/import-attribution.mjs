import { jsonDigest, reject, UUID_PATTERN } from './common.mjs';
import { factoryImportNamespace, isFactoryImportNamespace } from './factory-namespace.mjs';

const need = (condition) => { if (!condition) reject(503, 'TEMPORARILY_UNAVAILABLE'); };

// Candidate receipts are incomplete for imported reference ancestors. Resolve
// the trusted original import operator from its immutable namespace/manifest.
export async function resolveOriginalImportAttribution(client, row) {
  if (!row.reference_namespace?.startsWith('factory/')) return row;
  need(isFactoryImportNamespace(row.reference_namespace));
  // Ancestors have no candidate receipt. Bind their stored namespace to the
  // original immutable manifest, not the current child or a claimed creator.
  const manifests = await client.query(`SELECT producer_namespace,batch_key,received_by,manifest,manifest_hash
    FROM tsa_private.factory_import_manifests WHERE
      manifest->'references' @> $1::jsonb OR manifest->'candidates' @> $2::jsonb`,
  [JSON.stringify([{ kind: 'question', id: row.id }]), JSON.stringify([{ question: { id: row.id } }])]);
  const matching = manifests.rows.filter((record) => {
    const manifest = typeof record.manifest === 'string' ? JSON.parse(record.manifest) : record.manifest;
    need(jsonDigest(manifest) === record.manifest_hash);
    need(manifest.producerNamespace === record.producer_namespace && manifest.batchKey === record.batch_key);
    try { return factoryImportNamespace(manifest) === row.reference_namespace; }
    catch { return false; }
  });
  need(matching.length === 1);
  need(UUID_PATTERN.test(matching[0].received_by));
  return { ...row, producer_namespace: matching[0].producer_namespace, operator_id: matching[0].received_by };
}
