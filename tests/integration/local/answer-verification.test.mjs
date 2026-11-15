import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runCompare, runExport } from '../../../scripts/answer-verify.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';
import { SOLUTIONS_FORMAT } from '../../../tools/answer-verification/verification-core.mjs';
import { buildPublishedBank, choice } from './published-bank-fixture.mjs';

const silent = () => {};
const bankState = async (dataDirectory) => {
  const database = await startPersistentPostgres(dataDirectory);
  try {
    return JSON.stringify((await database.ownerPool.query(`SELECT (SELECT count(*)::int FROM tsa.question_versions) versions, (SELECT count(*)::int FROM tsa.reviews) reviews,
      (SELECT count(*)::int FROM tsa.audit_events) audit, (SELECT string_agg(state::text || revision::text, ',' ORDER BY question_version_id) FROM tsa.question_workflow) workflow,
      (SELECT string_agg(answer_key::text, ',' ORDER BY question_version_id) FROM tsa_private.question_secrets) keys`)).rows[0]);
  } finally { await database.stop(); }
};

test('the verification workflow exports a blind batch from the published Bank, classifies solver answers and changes nothing', { timeout: 300_000 }, async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-verification-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataDirectory = path.join(directory, 'bank');
  const versions = await buildPublishedBank(dataDirectory, [choice('Câu một về số học.', 'a'), choice('Câu hai về hình học.', 'b'), choice('Câu ba về xác suất.', 'c')]);
  const before = await bankState(dataDirectory);
  process.env.TRACK_B_DATA_DIRECTORY = dataDirectory;
  t.after(() => { delete process.env.TRACK_B_DATA_DIRECTORY; });
  const out = path.join(directory, 'work');

  const built = await runExport({ section: 'MATH', 'out-dir': out, label: 'unit', limit: '10' }, silent);
  assert.equal(built.blind.count, 3);
  assert.deepEqual((await readdir(out)).sort(), ['unit.blind.json', 'unit.private.json']);
  for (const file of await readdir(out)) assert.equal((await stat(path.join(out, file))).mode & 0o077, 0, `${file} is owner-only`);
  const blindText = await readFile(path.join(out, 'unit.blind.json'), 'utf8');
  for (const version of versions) assert.ok(!blindText.includes(version), 'no version id reaches the solver');
  assert.ok(!/optionId|answerKey|explanation/u.test(blindText), 'no key or explanation reaches the solver');
  assert.match(blindText, /Câu một về số học/u);

  assert.equal((await runExport({ section: 'MATH', 'out-dir': out, label: 'page', limit: '2', offset: '2' }, silent)).blind.count, 1, 'paging yields the remainder');
  assert.equal((await runExport({ section: 'READING', 'out-dir': out, label: 'none' }, silent)).blind.count, 0);
  await assert.rejects(runExport({ section: 'MATH', 'out-dir': out, label: 'unit' }, silent), /EEXIST/u, 'an export never overwrites');

  // A solver (here a script) answers the three items from the blind file only.
  const blind = JSON.parse(blindText);
  const keyOf = new Map(built.private.join.map((entry) => [entry.itemId, entry.key.optionId]));
  const other = (id) => (id === 'a' ? 'b' : 'a');
  const [one, two, three] = blind.items;
  const solutions = { format: SOLUTIONS_FORMAT, exportHash: blind.exportHash, solver: 'integration test', solutions: [
    { itemId: one.itemId, answer: { optionId: keyOf.get(one.itemId) }, confidence: 'HIGH', reasoning: 'checked twice' },
    { itemId: two.itemId, answer: { optionId: other(keyOf.get(two.itemId)) }, confidence: 'HIGH', reasoning: 'computed differently' },
    { itemId: three.itemId, answer: { optionId: keyOf.get(three.itemId) }, confidence: 'MEDIUM', reasoning: 'probably' }] };
  await writeFile(path.join(out, 'unit.solutions.json'), JSON.stringify(solutions));
  const report = await runCompare({ private: path.join(out, 'unit.private.json'), solutions: path.join(out, 'unit.solutions.json'), 'out-dir': path.join(out, 'report') }, silent);
  assert.deepEqual(report.counts, { VERIFIED: 1, DISPUTED: 1, NEEDS_HUMAN_REVIEW: 1 });
  const summary = JSON.parse(await readFile(path.join(out, 'report', 'unit.summary.json'), 'utf8'));
  assert.deepEqual(summary.counts, report.counts);
  assert.ok(!JSON.stringify(summary).includes(versions[0]), 'the count-only summary names no version');
  assert.match(await readFile(path.join(out, 'report', 'unit.report.private.md'), 'utf8'), /DISPUTED.*CONFIDENT_DISAGREEMENT/u);

  assert.equal(await bankState(dataDirectory), before, 'verification never changes the Bank');
});
