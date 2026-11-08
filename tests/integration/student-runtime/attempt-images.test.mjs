import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chmod, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createAttemptAssetService } from '../../../src/modules/attempts/asset-service.mjs';
import { createAttemptHandler } from '../../../src/http/attempts.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createImageFixture } from './image-fixture.mjs';

const rate = { capacity: 100, refillPerSecond: 10 };
const denied = (error) => error?.status === 404 && error?.code === 'NOT_FOUND';
function service(f, imageStore = f.imageStore) { return createAttemptAssetService({ examPool: f.examPool, identityService: f.identityService, imageStore }); }
function attempts(f) { return createAttemptService({ examPool: f.examPool, identityService: f.identityService,
  createRate: rate, saveRate: { user: rate, attempt: rate } }); }
async function allocate(f) {
  const commands = attempts(f);
  const result = await commands.create(f.principals.studentA, randomUUID(), { blueprintVersionId: f.blueprint.versionId });
  return { commands, id: result.body.attemptId, formId: result.body.formId };
}

test('real image admission is default-denied, immutable, sealed and privately delivered through HTTP and released review', { timeout: 30000 }, async (t) => {
  const f = await createImageFixture(t);
  await assert.rejects(f.workflow.submitReview(f.principals.author, f.imageQuestion.versionId, randomUUID(), { expectedRevision: 1 }),
    (error) => error?.code === 'ASSET_SANITIZATION_REQUIRED');
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa_private.question_delivery_checks')).rows[0].n, 0);
  await f.approveImage();
  const checks = (await f.pool.query('SELECT profile FROM tsa_private.question_delivery_checks')).rows;
  assert.deepEqual(checks, Array.from({ length: 4 }, () => ({ profile: 'text-math-table-inspected-image/2' })));
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa_private.asset_inspections')).rows[0].n, 2);
  await assert.rejects(f.pool.query('UPDATE tsa_private.asset_inspections SET width=1'), { code: '23514' });
  const a = await allocate(f), assets = service(f);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.form_assets WHERE form_id=$1', [a.formId])).rows[0].n, 2);
  await assert.rejects(assets.read(f.principals.studentA, a.id, f.assets.QUESTION.id, 'question'), denied);
  await a.commands.start(f.principals.studentA, a.id, randomUUID());
  const view = await a.commands.read(f.principals.studentA, a.id);
  assert.equal(view.slots[0].content[1].assetVersionId, f.assets.QUESTION.id);
  assert.doesNotMatch(JSON.stringify(view), new RegExp(f.assets.EXPLANATION.id+'|answerKey|Lời giải'));
  for (const [principal, asset, purpose] of [
    [f.principals.studentB, f.assets.QUESTION.id, 'question'],
    [f.principals.studentA, f.assets.EXPLANATION.id, 'question'],
    [f.principals.studentA, f.assets.QUESTION.id, 'explanation'],
    [f.principals.studentA, f.assets.EXPLANATION.id, 'explanation'],
    [f.principals.studentA, randomUUID(), 'question'],
  ]) await assert.rejects(assets.read(principal, a.id, asset, purpose), denied);
  await assert.rejects(service(f, null).read(f.principals.studentA, a.id, f.assets.QUESTION.id, 'question'), denied);

  let handler;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const response = await handler(new Request(`http://${incoming.headers.host}${incoming.url}`, { headers: incoming.headers }));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(500); outgoing.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  handler = createAttemptHandler({ examPool: f.examPool, identityService: f.identityService, trustedOrigin: origin,
    createRate: rate, saveRate: { user: rate, attempt: rate }, imageStore: f.imageStore });
  const url = `${origin}/api/v1/attempts/${a.id}/assets/${f.assets.QUESTION.id}?purpose=question`;
  const headers = { cookie: f.browsers.studentA.cookies.join('; ') };
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('content-length'), String(f.assets.QUESTION.bytes.length));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.assets.QUESTION.bytes);
  assert.equal((await fetch(url)).status, 401);
  const other = await fetch(url, { headers: { cookie: f.browsers.studentB.cookies.join('; ') } });
  assert.equal(other.status, 404); assert.doesNotMatch(await other.text(), /sha256|object_key|source_version|Lời giải/);
  for (const query of ['?purpose=question&purpose=explanation', '?purpose=question&path=/tmp/private', '?purpose=https://example.com/a.png']) {
    assert.equal((await fetch(url.split('?')[0]+query, { headers })).status, 422);
  }
  await a.commands.save(f.principals.studentA, a.id, view.slots[0].slotId, randomUUID(), {
    expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: 'a' } });
  await a.commands.submit(f.principals.studentA, a.id, randomUUID());
  await assert.rejects(assets.read(f.principals.studentA, a.id, f.assets.QUESTION.id, 'question'), denied);
  await assert.rejects(assets.read(f.principals.studentA, a.id, f.assets.EXPLANATION.id, 'explanation'), denied);
  await f.pool.query('CREATE ROLE image_grader LOGIN'); await f.pool.query('GRANT tsa_exam_worker TO image_grader');
  const workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'image_grader' });
  try {
    const worker = createExamWorker({ workerPool, executorId: 'image-test', leaseSeconds: 30, retrySeconds: 1 });
    assert.equal((await worker.runOnce()).status, 'GRADED');
  } finally { await workerPool.end(); }
  for (const [purpose, name] of [['question', 'QUESTION'], ['explanation', 'EXPLANATION']]) {
    assert.deepEqual((await assets.read(f.principals.studentA, a.id, f.assets[name].id, purpose)).bytes, f.assets[name].bytes);
  }
  await f.imageWorkflow.quarantine(f.principals.bankManager, f.imageQuestion.versionId, randomUUID(), { expectedRevision: 3, reason: 'Synthetic image quarantine after release' });
  await assert.rejects(assets.read(f.principals.studentA, a.id, f.assets.EXPLANATION.id, 'explanation'), denied);
});

test('tampered local bytes, bounded reads and current form withdrawal fail closed', { timeout: 30000 }, async (t) => {
  const f = await createImageFixture(t); await f.approveImage(); const a = await allocate(f);
  await a.commands.start(f.principals.studentA, a.id, randomUUID());
  const assets = service(f), image = f.assets.QUESTION;
  await chmod(image.path, 0o600); await writeFile(image.path, Buffer.from('malformed'));
  await assert.rejects(assets.read(f.principals.studentA, a.id, image.id, 'question'), denied);
  await writeFile(image.path, image.bytes); await chmod(image.path, 0o400);
  assert.deepEqual((await assets.read(f.principals.studentA, a.id, image.id, 'question')).bytes, image.bytes);
  const never = service(f, { status: () => ({ enabled: true }), read: () => new Promise(() => {}) });
  const begin = Date.now(); await assert.rejects(never.read(f.principals.studentA, a.id, image.id, 'question'), denied);
  assert.ok(Date.now() - begin < 2500);
  await f.pool.query("UPDATE tsa.form_availability SET withdrawn_at=clock_timestamp(),withdrawal_reason='Synthetic withdrawal',revision=revision+1 WHERE form_id=$1", [a.formId]);
  await assert.rejects(assets.read(f.principals.studentA, a.id, image.id, 'question'), denied);
});
