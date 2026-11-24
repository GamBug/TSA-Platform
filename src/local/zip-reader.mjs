// Read the files of a .zip archive held in memory (stored or deflated entries), with no dependency. Used by the admin
// inbox so ChatGPT can hand over one ZIP holding the answer and its figures. The archive is untrusted: every limit is
// enforced before an entry is inflated, names are reduced to their base name by the caller, and ZIP64, encrypted and
// multi-disk archives are refused.
import { inflateRawSync } from 'node:zlib';

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export class ZipError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * The file entries of a ZIP archive as [{ name, data }]. Directory entries are skipped.
 * Limits: `maxEntries`, `maxEntryBytes` (uncompressed), `maxTotalBytes` (uncompressed, all entries).
 */
export function readZip(buffer, { maxEntries = 200, maxEntryBytes = 2 * 1024 * 1024, maxTotalBytes = 32 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new ZipError('ZIP_INVALID', 'The file is not a ZIP archive.');
  let end = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 22 - 0xffff); index -= 1) {
    if (buffer.readUInt32LE(index) === END_SIGNATURE) { end = index; break; }
  }
  if (end === -1) throw new ZipError('ZIP_INVALID', 'The file is not a ZIP archive.');
  const count = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  const centralOffset = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) !== 0 || count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new ZipError('ZIP_UNSUPPORTED', 'Multi-disk and ZIP64 archives are not supported.');
  }
  if (count > maxEntries) throw new ZipError('ZIP_TOO_MANY_FILES', `The archive holds more than ${maxEntries} entries.`);

  const entries = [];
  let total = 0;
  let cursor = centralOffset;
  for (let item = 0; item < count; item += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) throw new ZipError('ZIP_INVALID', 'The archive directory is damaged.');
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString((flags & 0x800) ? 'utf8' : 'latin1', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (flags & 0x1) throw new ZipError('ZIP_UNSUPPORTED', 'Encrypted archives are not supported.');
    if (method !== 0 && method !== 8) throw new ZipError('ZIP_UNSUPPORTED', `${name}: compression method ${method} is not supported.`);
    if (size > maxEntryBytes) throw new ZipError('ZIP_ENTRY_TOO_LARGE', `${name} is larger than ${maxEntryBytes} bytes.`);
    total += size;
    if (total > maxTotalBytes) throw new ZipError('ZIP_TOO_LARGE', 'The archive is too large when unpacked.');
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new ZipError('ZIP_INVALID', 'The archive is damaged.');
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (start + compressedSize > buffer.length) throw new ZipError('ZIP_INVALID', 'The archive is damaged.');
    const raw = buffer.subarray(start, start + compressedSize);
    let data;
    try { data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: maxEntryBytes }); }
    catch { throw new ZipError('ZIP_INVALID', `${name} could not be unpacked.`); }
    if (data.length !== size) throw new ZipError('ZIP_INVALID', `${name} does not match its recorded size.`);
    entries.push({ name, data });
  }
  return entries;
}
