import { types } from 'node:util';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 4096;
export const MAX_IMAGE_PIXELS = 4_194_304;
const supported = new Set(['image/png', 'image/jpeg', 'image/webp']);
const fail = () => { throw new TypeError('IMAGE_NOT_SUPPORTED'); };
const need = (condition) => { if (!condition) fail(); };
const typed = Object.getPrototypeOf(Uint8Array.prototype);
const getBuffer = Object.getOwnPropertyDescriptor(typed, 'buffer').get;
const getOffset = Object.getOwnPropertyDescriptor(typed, 'byteOffset').get;
const getLength = Object.getOwnPropertyDescriptor(typed, 'byteLength').get;

/** Copy the native view; never evaluate shadowed byte-view properties. */
export function copyImageBytes(value) {
  need(value && typeof value === 'object' && !types.isProxy(value));
  need(Buffer.isBuffer(value) || Object.getPrototypeOf(value) === Uint8Array.prototype);
  let backing, offset, length;
  try { backing = getBuffer.call(value); offset = getOffset.call(value); length = getLength.call(value); }
  catch { fail(); }
  need(backing instanceof ArrayBuffer && length > 0 && length <= MAX_IMAGE_BYTES);
  const copy = Buffer.alloc(length);
  Uint8Array.prototype.set.call(copy, new Uint8Array(backing, offset, length));
  return copy;
}

function dimensions(width, height) {
  need(Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    && width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION && width * height <= MAX_IMAGE_PIXELS);
  return { width, height };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function png(bytes) {
  need(bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  let offset = 8, image = null, idat = false, afterIdat = false;
  while (offset < bytes.length) {
    need(offset + 12 <= bytes.length);
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
    need(end <= bytes.length);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    need(/^[A-Za-z]{4}$/.test(type) && (bytes[offset + 6] & 0x20) === 0);
    need(crc32(bytes.subarray(offset + 4, end - 4)) === bytes.readUInt32BE(end - 4));
    need(!['acTL', 'fcTL', 'fdAT', 'iCCP', 'zTXt', 'iTXt'].includes(type));
    if (offset === 8) need(type === 'IHDR');
    if (type === 'IHDR') {
      need(!image && size === 13 && bytes[offset + 16] === 8
        && [0, 2, 3, 4, 6].includes(bytes[offset + 17])
        && bytes[offset + 18] === 0 && bytes[offset + 19] === 0 && bytes[offset + 20] <= 1);
      image = dimensions(bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12));
    } else if (type === 'IDAT') { need(image && !afterIdat); idat = true; }
    else if (type === 'IEND') { need(image && idat && size === 0 && end === bytes.length); return image; }
    else {
      if (idat) afterIdat = true;
      need(type[0] === type[0].toLowerCase() || type === 'PLTE');
    }
    offset = end;
  }
  fail();
}

function jpeg(bytes) {
  need(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8);
  let offset = 2, image = null, scan = false, sawScan = false;
  while (offset < bytes.length) {
    if (scan) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset++;
      need(offset < bytes.length);
    }
    need(bytes[offset++] === 0xff);
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    need(offset < bytes.length);
    const marker = bytes[offset++];
    if (scan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    scan = false;
    if (marker === 0xd9) { need(image && sawScan && offset === bytes.length); return image; }
    need(marker !== 0 && marker !== 0xd8 && marker !== 1 && !(marker >= 0xd0 && marker <= 0xd7));
    need(offset + 2 <= bytes.length);
    const size = bytes.readUInt16BE(offset), end = offset + size;
    need(size >= 2 && end <= bytes.length);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      need([0xc0, 0xc2].includes(marker) && !image && size >= 8 && bytes[offset + 2] === 8);
      image = dimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
      need([1, 3].includes(bytes[offset + 7]));
    }
    if (marker === 0xe2) {
      const prefix = bytes.toString('latin1', offset + 2, Math.min(end, offset + 14));
      need(!prefix.startsWith('ICC_PROFILE') && !prefix.startsWith('MPF\0'));
    }
    if (marker === 0xda) { need(image); sawScan = true; scan = true; }
    offset = end;
  }
  fail();
}

function webp(bytes) {
  need(bytes.length >= 20 && bytes.toString('latin1', 0, 4) === 'RIFF'
    && bytes.toString('latin1', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) === bytes.length - 8);
  let offset = 12, image = null, primary = false, extended = false;
  const seen = new Set();
  while (offset < bytes.length) {
    need(offset + 8 <= bytes.length);
    const type = bytes.toString('latin1', offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size, padded = end + (size % 2);
    need(padded <= bytes.length && (! (size % 2) || bytes[end] === 0));
    need(['VP8X', 'VP8 ', 'VP8L', 'ALPH', 'EXIF', 'XMP '].includes(type) && !seen.has(type)); seen.add(type);
    if (type === 'VP8X') {
      need(offset === 12 && size === 10 && !extended && (bytes[offset + 8] & 0xe3) === 0
        && bytes[offset + 9] === 0 && bytes[offset + 10] === 0 && bytes[offset + 11] === 0);
      image = dimensions(bytes.readUIntLE(offset + 12, 3) + 1, bytes.readUIntLE(offset + 15, 3) + 1); extended = true;
    } else if (type === 'VP8 ' || type === 'VP8L') {
      need(!primary); primary = true;
      if (type === 'VP8L') {
        need(size >= 5 && bytes[offset + 8] === 0x2f);
        const bits = bytes.readUInt32LE(offset + 9);
        const actual = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
        need(!image || (image.width === actual.width && image.height === actual.height)); image ??= actual;
      } else {
        need(size >= 10 && bytes[offset + 11] === 0x9d && bytes[offset + 12] === 1 && bytes[offset + 13] === 0x2a);
        const actual = dimensions(bytes.readUInt16LE(offset + 14) & 0x3fff, bytes.readUInt16LE(offset + 16) & 0x3fff);
        need(!image || (image.width === actual.width && image.height === actual.height)); image ??= actual;
      }
    } else need(extended);
    offset = padded;
  }
  need(primary && image && offset === bytes.length); return image;
}

/** Container framing is necessary; callers must also perform a full pixel decode. */
export function validateImageContainer(value, mediaType) {
  need(supported.has(mediaType));
  const bytes = copyImageBytes(value);
  const image = mediaType === 'image/png' ? png(bytes) : mediaType === 'image/jpeg' ? jpeg(bytes) : webp(bytes);
  return { mediaType, byteSize: bytes.length, ...image };
}
