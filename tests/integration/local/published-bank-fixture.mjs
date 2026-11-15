// Shared fixture: a small published Bank in a disposable workspace, built through the real author, rights and owner paths.
import { randomUUID } from 'node:crypto';
import { OWNER_RIGHTS, ownerApprove, ownerConfirmSingleton } from '../../../src/local/owner-publication.mjs';
import { session } from '../../../scripts/owner-publish.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';
import { createTrackBRuntime } from '../../../src/local/track-b.mjs';

export const env = { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' };
export const text = (value) => [{ type: 'text', text: value }];
export const choice = (stem, correct) => ({
  content: text(stem),
  interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b', 'c'].map((id) => ({ id, content: text(`Option ${id}`) })) },
  answerKey: { type: 'SINGLE_CHOICE', optionId: correct },
});
export const silent = () => {};

export async function buildPublishedBank(dataDirectory, questions) {
  // The synthetic seed source must keep its original rights, so the fixture records its own source.
  const sourceId = randomUUID(), sourceVersionId = randomUUID();
  await (await createTrackBRuntime({ env, dataDirectory, port: 0 })).close();
  const prepare = await startPersistentPostgres(dataDirectory);
  try {
    await prepare.ownerPool.query(`INSERT INTO tsa.sources (id,title,canonical_uri,owner_reference,origin,created_by)
      VALUES ($1,'Corpus correction fixture',NULL,NULL,'EXTERNAL',NULL)`, [sourceId]);
    await prepare.ownerPool.query(`INSERT INTO tsa.source_versions (id,source_id,version_no,content_hash,metadata,evidence_uri)
      VALUES ($1,$2,1,$3,'{}'::jsonb,NULL)`, [sourceVersionId, sourceId, `sha256:${'a'.repeat(64)}`]);
  } finally { await prepare.stop(); }
  const runtime = await createTrackBRuntime({ env, dataDirectory, port: 0 });
  const versions = [];
  try {
    const author = await session(runtime.origin, 'author');
    const manager = await session(runtime.origin, 'bankManager');
    const { template } = await author.get('/local/workspace/template');
    await manager(`/api/v1/source-versions/${sourceVersionId}/rights`, { ...OWNER_RIGHTS, expectedRevision: 0 });
    const rights = (await runtime.bankPool.query('SELECT decision_id FROM tsa.source_rights WHERE source_version_id=$1', [sourceVersionId])).rows[0];
    for (const [index, question] of questions.entries()) {
      const created = await author('/api/v1/questions', {
        schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH', taxonomyVersionId: template.taxonomyVersionId,
        domainId: template.domainId, skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
        content: question.content, stimulusVersionId: null, interaction: question.interaction, answerKey: question.answerKey,
        explanation: text('Synthetic private explanation.'), evidenceRefs: [rights.decision_id], origin: 'MANUAL',
        provenance: [{ sourceVersionId, span: null, transformation: 'synthetic correction fixture' }] },
      `correction-fixture-create-${index}`);
      await author(`/api/v1/question-versions/${created.versionId}/submit-review`, { expectedRevision: 1 }, `correction-fixture-submit-${index}`);
      versions.push(created.versionId);
    }
  } finally { await runtime.close(); }
  const database = await startPersistentPostgres(dataDirectory);
  try {
    for (const id of versions) {
      await ownerConfirmSingleton(database.ownerPool, id, { reviewerId: '00000000-0000-4000-8000-000000000202' });
      await ownerApprove(database.ownerPool, id);
    }
  } finally { await database.stop(); }
  return versions;
}

