import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { importQuestions } from '../../../scripts/questions-import.mjs';
import { ownerPublish, session } from '../../../scripts/owner-publish.mjs';
import { OWNER_RIGHTS, ownerConfirmTwin } from '../../../src/local/owner-publication.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';
import { createTrackBRuntime } from '../../../src/local/track-b.mjs';

const env = { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' };
const silent = () => {};
const EXAMPLE = new URL('../../../docs/question-bank/examples/valid/single-choice.json', import.meta.url);

async function workspace(directory) {
  const dataDirectory = path.join(directory, 'bank');
  await (await createTrackBRuntime({ env, dataDirectory, port: 0 })).close();
  const sourceVersionId = randomUUID(), sourceId = randomUUID();
  const database = await startPersistentPostgres(dataDirectory);
  try {
    await database.ownerPool.query(`INSERT INTO tsa.sources (id, title, canonical_uri, owner_reference, origin, created_by) VALUES ($1, 'Corpus twin fixture', NULL, NULL, 'EXTERNAL', NULL)`, [sourceId]);
    await database.ownerPool.query(`INSERT INTO tsa.source_versions (id, source_id, version_no, content_hash, metadata, evidence_uri) VALUES ($1, $2, 1, $3, '{}'::jsonb, NULL)`, [sourceVersionId, sourceId, `sha256:${'c'.repeat(64)}`]);
  } finally { await database.stop(); }
  const runtime = await createTrackBRuntime({ env, dataDirectory, port: 0 });
  try {
    const manager = await session(runtime.origin, 'bankManager');
    await manager(`/api/v1/source-versions/${sourceVersionId}/rights`, { ...OWNER_RIGHTS, expectedRevision: 0 });
  } finally { await runtime.close(); }
  return { dataDirectory, sourceVersionId };
}

async function importOne(dataDirectory, sourceVersionId, question, batch) {
  const document = { format: 'tsa-question-set/1', batch_id: batch, passages: [], questions: [question] };
  const applied = await importQuestions({ dataDirectory, sourceVersionId, document, confirm: 'IMPORT 1', log: silent });
  assert.equal(applied.imported, 1, JSON.stringify(applied.plan?.problems));
  return applied.created[0].versionId;
}

test('an exact twin is confirmed as one equivalence group, so only one of the pair is ever chosen', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'owner-twins-'));
  try {
    const { dataDirectory, sourceVersionId } = await workspace(directory);
    const first = (JSON.parse(await readFile(EXAMPLE, 'utf8'))).questions[0];
    first.question_id = 'MATH-TWIN-000001'; first.topic = 'ALGEBRA'; first.subject = 'MATH';
    const originalId = await importOne(dataDirectory, sourceVersionId, first, 'TWIN-ORIGINAL');
    const dry = await ownerPublish({ dataDirectory, log: silent });
    assert.equal(dry.published, 0);
    await ownerPublish({ dataDirectory, confirm: dry.phrase, log: silent });

    const copy = structuredClone(first);
    copy.question_id = 'MATH-TWIN-000002';
    const copyId = await importOne(dataDirectory, sourceVersionId, copy, 'TWIN-COPY');

    let database = await startPersistentPostgres(dataDirectory);
    try {
      const open = (await database.ownerPool.query("SELECT count(*)::int AS n FROM tsa.duplicate_relations WHERE resolution='OPEN' AND kind='EXACT'")).rows[0].n;
      assert.equal(open, 1, 'importing the copy opens one exact relation');
      const hidden = (await database.ownerPool.query('SELECT tsa.bank_question_selection_allowed($1) AS ok', [originalId])).rows[0].ok;
      assert.equal(hidden, false, 'while the relation is open the published original is not selectable');
    } finally { await database.stop(); }

    const messages = [];
    const preview = await ownerPublish({ dataDirectory, keepOneOfTwins: true, log: (line) => messages.push(line) });
    assert.ok(messages.some((line) => /Open exact twins to confirm as one equivalence group each: 1/.test(line)));
    await assert.rejects(ownerPublish({ dataDirectory, confirm: preview.phrase, log: silent }), /CONSTRAINT_CONFLICT|twin|duplicate/i,
      'without the explicit option the twin still blocks publication');

    const result = await ownerPublish({ dataDirectory, keepOneOfTwins: true, confirm: preview.phrase, log: silent });
    assert.equal(result.published, 1);

    database = await startPersistentPostgres(dataDirectory);
    try {
      const rows = (await database.ownerPool.query(`SELECT v.id, w.state::text AS state, tsa.bank_question_selection_allowed(v.id) AS ok
        FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id=v.id WHERE v.id=ANY($1) ORDER BY v.id`, [[originalId, copyId]])).rows;
      assert.equal(rows.length, 2);
      assert.ok(rows.every((row) => row.state === 'APPROVED' && row.ok === true), 'both versions are approved and selectable');
      const relation = (await database.ownerPool.query('SELECT resolution::text AS resolution, resolution_evidence FROM tsa.duplicate_relations')).rows;
      assert.deepEqual(relation.map((row) => row.resolution), ['CONFIRMED']);
      assert.match(relation[0].resolution_evidence.reason, /keep one/);
      const groups = (await database.ownerPool.query(`SELECT DISTINCT m.group_id FROM tsa.duplicate_group_members m
        JOIN tsa.question_versions v ON v.question_id=m.question_id WHERE v.id=ANY($1)`, [[originalId, copyId]])).rows;
      assert.equal(groups.length, 1, 'the two questions share one canonical group');
      assert.equal((await database.ownerPool.query('SELECT merged_into_id FROM tsa.duplicate_groups WHERE id=$1', [groups[0].group_id])).rows[0].merged_into_id, null);
      await assert.rejects(ownerConfirmTwin(database.ownerPool, randomUUID()), /not an OPEN exact twin/);
    } finally { await database.stop(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
