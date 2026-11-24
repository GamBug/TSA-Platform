import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readZip, ZipError } from '../../src/local/zip-reader.mjs';
import { buildZip } from './fixtures/zip-builder.mjs';

test('a ZIP of stored and deflated files is read back with its names and bytes', () => {
  const text = Buffer.from('{"subject":"MATH"} '.repeat(200));
  const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
  const entries = readZip(buildZip([['batch/answer.json', text, 8], ['fig.png', binary, 0], ['batch/', Buffer.alloc(0), 0]]));
  assert.deepEqual(entries.map((entry) => entry.name), ['batch/answer.json', 'fig.png']);
  assert.deepEqual(entries[0].data, text);
  assert.deepEqual(entries[1].data, binary);
});

test('a ZIP that is not safe to unpack is refused with a code', () => {
  const refused = (buffer, options) => { try { readZip(buffer, options); } catch (error) { assert.ok(error instanceof ZipError); return error.code; } return null; };
  assert.equal(refused(Buffer.from('not a zip at all, just some text.')), 'ZIP_INVALID');
  assert.equal(refused(buildZip([['a.json', Buffer.alloc(100, 'x')]]), { maxEntryBytes: 99 }), 'ZIP_ENTRY_TOO_LARGE');
  assert.equal(refused(buildZip([['a.json', Buffer.alloc(60, 'x')], ['b.json', Buffer.alloc(60, 'x')]]), { maxTotalBytes: 100 }), 'ZIP_TOO_LARGE');
  assert.equal(refused(buildZip([['a.json', Buffer.from('x')], ['b.json', Buffer.from('x')]]), { maxEntries: 1 }), 'ZIP_TOO_MANY_FILES');
  const damaged = buildZip([['a.json', Buffer.from('hello hello hello hello')]]);
  damaged.writeUInt32LE(5, damaged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24); // central size no longer matches
  assert.equal(refused(damaged), 'ZIP_INVALID');
});
