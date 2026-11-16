// Store a reading passage once as a Bank stimulus so that exchange questions can share it.
// The stimulus version id is derived from the passage id and its content, so running an import again finds the same
// stimulus instead of creating a copy, and a changed passage becomes a new stimulus version (stimuli are immutable).
// Everything is written in one transaction on the maintenance connection, mirroring the reference graph that the
// question route requires for a stimulus: provenance (source and rights evidence) plus any image assets.
import { createHash } from 'node:crypto';
import { passageContent } from '../../packages/contracts/dist/question-exchange.js';
import { MANUAL_REFERENCE_NAMESPACE, resolveReferenceGraph, storeReferenceGraph } from '../modules/bank/common.mjs';
import { ensureAssetVersion } from '../modules/bank/image-library.mjs';
import { withTransaction } from '../modules/database/pool.mjs';

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
};

/** Stable digest of a passage as written in the exchange file. */
export const passageHash = (passage) => `sha256:${createHash('sha256').update(JSON.stringify(sortKeys(passage))).digest('hex')}`;

function uuidFrom(text) {
  const digest = createHash('sha256').update(text).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const stimulusVersionIdFor = (passage) => uuidFrom(`exchange-stimulus|${passage.passage_id}|${passageHash(passage)}`);

/** Image ids shown inside a passage. */
export function passageImageIds(passage) {
  return passage.content_blocks.filter((block) => block.type === 'image').map((block) => block.asset_id);
}

/** Create the stimulus for a passage if it does not exist yet and return its version id. */
export async function ensureStimulus(ownerPool, passage, { sourceVersionId, rightsDecisionId }) {
  const stimulusVersionId = stimulusVersionIdFor(passage);
  const assetVersions = new Map();
  for (const assetId of new Set(passageImageIds(passage))) assetVersions.set(assetId, await ensureAssetVersion(ownerPool, assetId, 'QUESTION'));
  const content = passageContent(passage, (assetId) => assetVersions.get(assetId));
  await withTransaction(ownerPool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`exchange-stimulus:${stimulusVersionId}`]);
    const assetRows = assetVersions.size === 0 ? [] : (await client.query(
      'SELECT id, content_hash, mime, byte_size FROM tsa.asset_versions WHERE id = ANY($1::uuid[])', [[...assetVersions.values()]])).rows;
    const assetNodes = assetRows.map((row) => ({ kind: 'asset', id: row.id, payload: { mediaType: row.mime, byteLength: Number(row.byte_size), bytesHash: row.content_hash }, references: [] }));
    const provenanceId = uuidFrom(`exchange-stimulus-provenance|${stimulusVersionId}`);
    const provenance = { kind: 'provenance', id: provenanceId, payload: { sourceVersionId, rightsEvidence: rightsDecisionId },
      references: [{ kind: 'source', id: sourceVersionId }, { kind: 'evidence', id: rightsDecisionId }] };
    const stimulus = { kind: 'stimulus', id: stimulusVersionId, payload: { content, provenanceIds: [provenanceId] },
      references: [{ kind: 'provenance', id: provenanceId }, ...assetNodes.map((node) => ({ kind: 'asset', id: node.id }))] };
    const graph = await resolveReferenceGraph(client, MANUAL_REFERENCE_NAMESPACE, [{ kind: 'stimulus', id: stimulusVersionId }], [provenance, stimulus, ...assetNodes]);
    await storeReferenceGraph(client, MANUAL_REFERENCE_NAMESPACE, graph);
    const existing = await client.query('SELECT content_hash FROM tsa.stimulus_versions WHERE id = $1', [stimulusVersionId]);
    if (existing.rowCount === 1) return;
    const contentHash = graph.find((node) => node.kind === 'stimulus').contentHash;
    const stimulusId = uuidFrom(`exchange-stimulus-root|${stimulusVersionId}`);
    await client.query('INSERT INTO tsa.stimuli (id) VALUES ($1)', [stimulusId]);
    await client.query('INSERT INTO tsa.stimulus_versions (id, stimulus_id, version_no, content, content_hash) VALUES ($1, $2, 1, $3::jsonb, $4)',
      [stimulusVersionId, stimulusId, JSON.stringify(content), contentHash]);
    await client.query('INSERT INTO tsa.stimulus_sources (stimulus_version_id, source_version_id, span) VALUES ($1, $2, NULL)', [stimulusVersionId, sourceVersionId]);
    for (const row of assetRows) await client.query('INSERT INTO tsa.stimulus_assets (stimulus_version_id, asset_version_id) VALUES ($1, $2)', [stimulusVersionId, row.id]);
  });
  return stimulusVersionId;
}
