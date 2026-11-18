import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ownerPublish, planOwnerPublication, restrictToTaxonomy } from '../../../scripts/owner-publish.mjs';
import { createTrackBRuntime } from '../../../src/local/track-b.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';

const knownAuthor = '00000000-0000-4000-8000-000000000201';
const supported = { id: 'supported', schemaVersion: 'question/3', createdBy: knownAuthor,
  sourceVersionIds: ['shared', 'selected-only'] };
const unknownAuthor = { id: 'unknown-author', schemaVersion: 'question/3', createdBy: 'unregistered',
  sourceVersionIds: ['shared', 'skipped-only'] };
const unsupportedProtocol = { id: 'unsupported-protocol', schemaVersion: 'question/99', createdBy: knownAuthor,
  sourceVersionIds: ['unsupported-only'] };
const sources = ['selected-only', 'shared', 'skipped-only', 'unsupported-only'].map(id => ({ id, allowed: false, revision: 0 }));

test('owner publication plans rights only for selected candidates, including shared source dependencies', () => {
  const before = { versions: [supported, unknownAuthor, unsupportedProtocol], sources };
  const snapshot = structuredClone(before);
  const plan = planOwnerPublication(before);
  assert.deepEqual(plan.targets, [supported]);
  assert.deepEqual(plan.unsupported, [unknownAuthor, unsupportedProtocol]);
  assert.deepEqual(plan.sources.map(row => row.id), ['selected-only', 'shared']);
  assert.deepEqual(before, snapshot, 'planning must not mutate inspection evidence');
});

test('a plan with no supported candidates grants no source rights', () => {
  const plan = planOwnerPublication({ versions: [unknownAuthor, unsupportedProtocol], sources });
  assert.deepEqual(plan.targets, []);
  assert.deepEqual(plan.sources, []);
});

test('confirming zero publication candidates does not create sessions, backups or workflow changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-owner-noop-'));
  let runtime;
  t.after(async () => { await runtime?.close(); await rm(root, { recursive: true, force: true }); });
  const dataDirectory = join(root, 'bank');
  runtime = await createTrackBRuntime({ env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, dataDirectory, port: 0 });
  await runtime.close();
  const snapshot = async () => {
    const database = await startPersistentPostgres(dataDirectory);
    try {
      return (await database.ownerPool.query(`SELECT
        (SELECT count(*)::int FROM tsa.source_rights) AS rights,
        (SELECT count(*)::int FROM tsa.reviews) AS reviews,
        (SELECT count(*)::int FROM tsa.question_workflow) AS workflow,
        (SELECT count(*)::int FROM tsa_private.local_auth_sessions) AS sessions`)).rows[0];
    } finally { await database.stop(); }
  };
  const before = await snapshot();
  const backups = (await readdir(`${dataDirectory}-backups`)).sort();
  const messages = [];
  assert.deepEqual(await ownerPublish({ dataDirectory, confirm: 'PUBLISH 0 ALL', log: line => messages.push(line) }),
    { published: 0, phrase: 'PUBLISH 0 ALL' });
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual((await readdir(`${dataDirectory}-backups`)).sort(), backups);
  assert.ok(messages.some(line => line.includes('no rights or workflow changes were made')));
});

test('a taxonomy restriction keeps only that taxonomy\'s candidates and the sources they need', () => {
  const inside = { ...supported, id: 'inside' };
  const outside = { ...supported, id: 'outside', sourceVersionIds: ['skipped-only'] };
  const before = { versions: [inside, outside], sources };
  const snapshot = structuredClone(before);
  const restricted = restrictToTaxonomy(before, ['inside', 'not-a-candidate']);
  assert.deepEqual(restricted.versions, [inside]);
  assert.deepEqual(planOwnerPublication(restricted).sources.map(row => row.id), ['selected-only', 'shared']);
  assert.deepEqual(restrictToTaxonomy(before, []).versions, []);
  assert.deepEqual(before, snapshot, 'restriction must not mutate inspection evidence');
});
