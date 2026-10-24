import { jsonDigest, reject, UUID_PATTERN } from './common.mjs';

const need = (condition) => { if (!condition) reject(503, 'TEMPORARILY_UNAVAILABLE'); };

// Candidate receipts are incomplete for imported reference ancestors. Resolve
// the trusted original import operator from its immutable namespace/manifest.
export async function resolveOriginalImportAttribution(client, row) {
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
  need(UUID_PATTERN.test(matching[0].received_by));
  return { ...row, producer_namespace: matching[0].producer_namespace, operator_id: matching[0].received_by };
}
