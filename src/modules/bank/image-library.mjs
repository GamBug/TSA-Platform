// Reusable image library: stable readable codes (IMG-GEO-000123) over the Bank's content-addressed asset versions.
// Registration decodes the file, deduplicates by SHA-256 only (visually similar images are never merged), stores the
// bytes in the private image store and records one library asset. Functions take an owner/maintenance client or pool;
// questions keep referencing asset versions by UUID, so published content and student delivery are unchanged.
import { createHash, randomUUID } from 'node:crypto';
import { inspectImage } from '../media/image-inspection.mjs';
import { copyImageBytes, MAX_IMAGE_BYTES } from '../media/image-containers.mjs';
import { withTransaction } from '../database/pool.mjs';

export const ASSET_CODE_PATTERN = /^IMG-[A-Z][A-Z0-9]{1,7}-[0-9]{6}$/;
export const ASSET_AREA_PATTERN = /^[A-Z][A-Z0-9]{1,7}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PURPOSES = Object.freeze(['QUESTION', 'EXPLANATION']);

export class ImageLibraryError extends Error {
  constructor(code, message) { super(message ?? code); this.name = 'ImageLibraryError'; this.code = code; }
}
const fail = (code, message) => { throw new ImageLibraryError(code, message); };

/** Identify the container from its leading bytes. The decoder then confirms it; the extension is never trusted. */
export function sniffMediaType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const row = (record) => record && ({
  assetCode: record.asset_code, contentHash: record.content_hash, mediaType: record.media_type, byteSize: Number(record.byte_size),
  width: record.width, height: record.height, title: record.title, alt: record.alt_text, status: record.status,
  createdAt: record.created_at instanceof Date ? record.created_at.toISOString() : record.created_at,
});

/** Decode and describe a file without writing anything. */
export async function describeImage(input) {
  let bytes;
  try { bytes = copyImageBytes(Buffer.isBuffer(input) ? input : Buffer.from(input)); }
  catch { fail('IMAGE_NOT_SUPPORTED', `The file must be a non-empty PNG, JPEG or WebP image of at most ${MAX_IMAGE_BYTES} bytes`); }
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) fail('IMAGE_NOT_SUPPORTED', 'The file is not a PNG, JPEG or WebP image');
  let receipt;
  try { receipt = await inspectImage(bytes, { mediaType, contentHash: digest(bytes) }); }
  catch { fail('IMAGE_NOT_SUPPORTED', 'The image could not be decoded safely (corrupt, too large or too many pixels)'); }
  return { bytes, receipt };
}

export async function findByHash(client, contentHash) {
  return row((await client.query('SELECT * FROM tsa.image_assets WHERE content_hash = $1', [contentHash])).rows[0]);
}

export async function getImageAsset(client, assetCode) {
  if (!ASSET_CODE_PATTERN.test(assetCode)) fail('ASSET_CODE_INVALID', `${assetCode} is not an asset code such as IMG-GEO-000123`);
  const asset = row((await client.query('SELECT * FROM tsa.image_assets WHERE asset_code = $1', [assetCode])).rows[0]);
  if (!asset) fail('ASSET_NOT_FOUND', `Image asset ${assetCode} does not exist in the library`);
  const versions = (await client.query('SELECT asset_version_id, purpose::text AS purpose FROM tsa.image_asset_versions WHERE asset_code = $1 ORDER BY purpose',
    [assetCode])).rows;
  return { ...asset, versions: Object.fromEntries(versions.map((version) => [version.purpose, version.asset_version_id])) };
}

export async function listImageAssets(client, { status = null } = {}) {
  const result = await client.query(`SELECT * FROM tsa.image_assets WHERE ($1::text IS NULL OR status = $1) ORDER BY asset_code`, [status]);
  return result.rows.map(row);
}

/** Codes that a question may use: active assets only. */
export async function activeAssetCodes(client) {
  return (await client.query(`SELECT asset_code FROM tsa.image_assets WHERE status = 'ACTIVE' ORDER BY asset_code`)).rows.map((record) => record.asset_code);
}

/** Which of these codes cannot be used. Reports unknown and retired codes separately so authors can act. */
export async function missingImageAssets(client, codes) {
  const unique = [...new Set(codes)];
  const found = (await client.query('SELECT asset_code, status FROM tsa.image_assets WHERE asset_code = ANY($1::text[])', [unique])).rows;
  const byCode = new Map(found.map((record) => [record.asset_code, record.status]));
  return {
    unknown: unique.filter((code) => !byCode.has(code)),
    retired: unique.filter((code) => byCode.get(code) === 'RETIRED'),
  };
}

/** Questions that display an asset, in any purpose, with their workflow state. */
export async function imageAssetReferences(client, assetCode) {
  await getImageAsset(client, assetCode);
  const result = await client.query('SELECT question_version_id, state FROM tsa.image_asset_references($1) ORDER BY question_version_id', [assetCode]);
  return result.rows.map((record) => ({ questionVersionId: record.question_version_id, state: record.state }));
}

async function insertAssetVersion(client, { code, purpose, sourceVersionId, receipt, alt, title }) {
  const assetVersionId = randomUUID();
  const hex = receipt.contentHash.slice(7);
  await client.query(`INSERT INTO tsa.asset_versions (id, source_version_id, object_key, content_hash, mime, byte_size, alt_metadata, security_class)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::tsa.asset_security_class)`,
  [assetVersionId, sourceVersionId, `image-library/${hex}/${purpose.toLowerCase()}`, receipt.contentHash, receipt.mediaType,
    receipt.byteSize, JSON.stringify({ alt, ...(title ? { title } : {}), libraryCode: code }), purpose]);
  await client.query(`INSERT INTO tsa_private.asset_inspections (asset_version_id, content_hash, media_type, byte_size, width, height, decoder_version)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  [assetVersionId, receipt.contentHash, receipt.mediaType, receipt.byteSize, receipt.width, receipt.height, receipt.decoderVersion]);
  await client.query('INSERT INTO tsa.image_asset_versions (asset_version_id, asset_code, purpose) VALUES ($1, $2, $3::tsa.asset_security_class)',
    [assetVersionId, code, purpose]);
  return assetVersionId;
}

/**
 * Register an image. Returns { created, assetCode, ... }. A byte-identical file returns the existing asset and
 * writes nothing, whatever title or area is offered. The caller names an existing source version; the library never
 * creates or edits sources or rights.
 */
export async function registerImage(ownerPool, imageStore, { bytes, area, alt, title = null, sourceVersionId }) {
  if (!ASSET_AREA_PATTERN.test(area ?? '')) fail('ASSET_AREA_INVALID', 'area must be 2-8 uppercase letters or digits starting with a letter, such as GEO');
  if (typeof alt !== 'string' || alt.trim().length === 0 || alt.length > 1_000) fail('ASSET_ALT_REQUIRED', 'alt text is required (at most 1000 characters)');
  if (title !== null && (typeof title !== 'string' || title.trim().length === 0 || title.length > 300)) fail('ASSET_TITLE_INVALID', 'title must be 1-300 characters');
  if (typeof sourceVersionId !== 'string' || !UUID.test(sourceVersionId)) fail('SOURCE_VERSION_REQUIRED', 'an existing source version id is required');
  if (!imageStore?.status?.().enabled) fail('IMAGE_STORE_DISABLED', 'The private image store is not enabled');
  const { bytes: image, receipt } = await describeImage(bytes);
  const existing = await findByHash(ownerPool, receipt.contentHash);
  if (existing) return { created: false, duplicateOf: existing.assetCode, ...existing };
  await imageStore.inspectAndStore({ bytes: image, contentHash: receipt.contentHash, mediaType: receipt.mediaType });
  return withTransaction(ownerPool, async (client) => {
    if ((await client.query('SELECT 1 FROM tsa.source_versions WHERE id = $1', [sourceVersionId])).rowCount !== 1) {
      fail('SOURCE_VERSION_NOT_FOUND', 'The named source version does not exist');
    }
    // A concurrent registration of the same bytes wins the unique hash; report it as the duplicate it is.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`image-library:${receipt.contentHash}`]);
    const raced = await findByHash(client, receipt.contentHash);
    if (raced) return { created: false, duplicateOf: raced.assetCode, ...raced };
    const code = (await client.query('SELECT tsa.next_image_asset_code($1) AS code', [area])).rows[0].code;
    await client.query(`INSERT INTO tsa.image_assets (asset_code, content_hash, media_type, byte_size, width, height, title, alt_text)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [code, receipt.contentHash, receipt.mediaType, receipt.byteSize, receipt.width, receipt.height, title, alt.trim()]);
    await insertAssetVersion(client, { code, purpose: 'QUESTION', sourceVersionId, receipt, alt: alt.trim(), title });
    return { created: true, ...row((await client.query('SELECT * FROM tsa.image_assets WHERE asset_code = $1', [code])).rows[0]) };
  });
}

/**
 * The asset version to embed for a purpose. Question and explanation images stay separate asset versions of the same
 * file, so the explanation copy is created on first use. Retired assets cannot be used for new content.
 */
export async function ensureAssetVersion(ownerPool, assetCode, purpose) {
  if (!PURPOSES.includes(purpose)) fail('ASSET_PURPOSE_INVALID', 'purpose must be QUESTION or EXPLANATION');
  return withTransaction(ownerPool, async (client) => {
    const asset = await getImageAsset(client, assetCode);
    if (asset.status !== 'ACTIVE') fail('ASSET_RETIRED', `Image asset ${assetCode} is retired and cannot be used in new questions`);
    if (asset.versions[purpose]) return asset.versions[purpose];
    const base = (await client.query(`SELECT a.source_version_id FROM tsa.asset_versions a JOIN tsa.image_asset_versions v ON v.asset_version_id = a.id
      WHERE v.asset_code = $1 ORDER BY a.created_at LIMIT 1`, [assetCode])).rows[0];
    const inspection = (await client.query(`SELECT i.* FROM tsa_private.asset_inspections i JOIN tsa.image_asset_versions v ON v.asset_version_id = i.asset_version_id
      WHERE v.asset_code = $1 LIMIT 1`, [assetCode])).rows[0];
    if (!base || !inspection) fail('ASSET_NOT_INSPECTED', `Image asset ${assetCode} has no inspected file; register it again from the original`);
    return insertAssetVersion(client, {
      code: assetCode, purpose, sourceVersionId: base.source_version_id, alt: asset.alt ?? asset.title ?? assetCode, title: asset.title,
      receipt: { contentHash: inspection.content_hash, mediaType: inspection.media_type, byteSize: Number(inspection.byte_size),
        width: inspection.width, height: inspection.height, decoderVersion: inspection.decoder_version },
    });
  });
}

/** Read the stored bytes of an asset, verified against its hash, for export or preview. */
export async function readImageAsset(client, imageStore, assetCode) {
  const asset = await getImageAsset(client, assetCode);
  try {
    const { bytes } = await imageStore.read({ contentHash: asset.contentHash, mediaType: asset.mediaType, byteSize: asset.byteSize });
    return { asset, bytes };
  } catch { fail('IMAGE_OBJECT_UNAVAILABLE', `The stored file for ${assetCode} is missing or does not match its hash`); }
}

/**
 * Retire an asset so no new question can use it. Refused while an active question (draft, in review or approved) still
 * shows it; the database enforces the same rule. Assets are never deleted.
 */
export async function retireImageAsset(ownerPool, assetCode) {
  return withTransaction(ownerPool, async (client) => {
    const asset = await getImageAsset(client, assetCode);
    if (asset.status === 'RETIRED') return { changed: false, ...asset };
    const references = await imageAssetReferences(client, assetCode);
    const active = references.filter((reference) => ['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(reference.state));
    if (active.length > 0) {
      fail('ASSET_IN_USE', `Image asset ${assetCode} is still used by ${active.length} active question version(s); retire or replace those first`);
    }
    await client.query(`UPDATE tsa.image_assets SET status = 'RETIRED', retired_at = clock_timestamp() WHERE asset_code = $1`, [assetCode]);
    return { changed: true, ...await getImageAsset(client, assetCode) };
  });
}
