import { inspectImage, IMAGE_INSPECTION_VERSION } from '../media/image-inspection.mjs';
import { reject } from './common.mjs';

export const INSPECTED_IMAGE_PROFILE = 'text-math-table-inspected-image/2';

/** Private Bank validation only; never accepts a path, URL or client receipt. */
export async function checkReferencedImages(client, references, imageStore) {
  const assets = references.filter((node) => node.kind === 'asset');
  if (!assets.length) return 'text-math-table/1';
  if (!imageStore?.status?.().enabled || process.env.NODE_ENV === 'production') reject(422, 'ASSET_SANITIZATION_REQUIRED');
  for (const node of assets) {
    const result = await client.query('SELECT content_hash,mime,byte_size FROM tsa.asset_versions WHERE id=$1', [node.id]);
    const asset = result.rows[0];
    if (!asset || asset.content_hash !== node.payload.bytesHash || asset.mime !== node.payload.mediaType
        || Number(asset.byte_size) !== node.payload.byteLength) reject(422, 'ASSET_SANITIZATION_REQUIRED');
    const metadata = { contentHash: asset.content_hash, mediaType: asset.mime, byteSize: Number(asset.byte_size) };
    let receipt;
    try {
      const { bytes } = await imageStore.read(metadata);
      receipt = await inspectImage(bytes, { contentHash: metadata.contentHash, mediaType: metadata.mediaType });
    } catch { reject(422, 'ASSET_SANITIZATION_REQUIRED'); }
    if (receipt.decoderVersion !== IMAGE_INSPECTION_VERSION) reject(422, 'ASSET_SANITIZATION_REQUIRED');
    await client.query(`INSERT INTO tsa_private.asset_inspections
      (asset_version_id,content_hash,media_type,byte_size,width,height,decoder_version)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [node.id, receipt.contentHash, receipt.mediaType, receipt.byteSize, receipt.width, receipt.height, receipt.decoderVersion]);
    const pinned = await client.query('SELECT tsa.bank_asset_inspected($1) AS allowed', [node.id]);
    if (pinned.rows[0]?.allowed !== true) reject(422, 'ASSET_SANITIZATION_REQUIRED');
  }
  return INSPECTED_IMAGE_PROFILE;
}
