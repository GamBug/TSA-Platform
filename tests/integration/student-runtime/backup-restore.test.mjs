import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, stat, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { scoreAttempt } from '../../../src/modules/scoring/binary.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createLocalSyntheticIdentityService } from '../../../src/modules/identity/local-synthetic.mjs';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { createPersistentApi } from '../../../apps/practice-prototype/public/app/persistent-api.js';
import { bankRequest } from '../bank/harness.mjs';
import { createSharedReadingFixture } from './shared-reading-fixture.mjs';
import { closeRestoredRuntime, restoreSyntheticFixture } from './restore-fixture.mjs';

const env = { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' };
const rate = { capacity: 100, refillPerSecond: 10 };
const absent = (path) => assert.rejects(access(path), (error) => error.code === 'ENOENT');
async function rows(pool) {
  const tables = (await pool.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_type='BASE TABLE' AND table_schema IN('tsa','tsa_private','tsa_meta') ORDER BY table_schema,table_name`)).rows;
  const result = {};
  for (const { table_schema: schema, table_name: table } of tables) {
    // Schema/table identifiers come only from this fixed schema catalog query.
    const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
    result[`${schema}.${table}`] = (await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS value
      FROM (SELECT to_jsonb(t) AS value FROM ${quote(schema)}.${quote(table)} t) data`)).rows[0].value;
  }
  return result;
}
async function security(pool) {
  const acl = (value, kind, owner) => `(SELECT COALESCE(jsonb_agg(jsonb_build_array(
    pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    a.privilege_type,a.is_grantable) ORDER BY pg_get_userbyid(a.grantor),a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable),'[]'::jsonb)
    FROM aclexplode(COALESCE(${value},acldefault(${kind},${owner}))) a)`;
  const queries = {
    roles: `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil::text,rolconfig FROM pg_roles ORDER BY rolname`,
    memberships: `SELECT pg_get_userbyid(roleid) AS parent,pg_get_userbyid(member) AS member,pg_get_userbyid(grantor) AS grantor,
      admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY parent,member,grantor`,
    schemas: `SELECT nspname,pg_get_userbyid(nspowner) AS owner,${acl('nspacl', "'n'", 'nspowner')} AS acl
      FROM pg_namespace WHERE nspname IN('tsa','tsa_private','tsa_meta') ORDER BY nspname`,
    relations: `SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner,
      ${acl('c.relacl', `CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END`, 'c.relowner')} AS acl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN('tsa','tsa_private','tsa_meta') AND c.relkind IN('r','p','v','m','S') ORDER BY n.nspname,c.relname`,
    policies: `SELECT n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,
      ARRAY(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY pg_get_userbyid(r)) AS roles,
      pg_get_expr(p.polqual,p.polrelid) AS using_expr,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN('tsa','tsa_private','tsa_meta') ORDER BY n.nspname,c.relname,p.polname`,
    functions: `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,
      pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,${acl('p.proacl', "'f'", 'p.proowner')} AS acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN('tsa','tsa_private','tsa_meta') ORDER BY n.nspname,p.proname,args`,
  };
  const result = {};
  for (const [name, query] of Object.entries(queries)) result[name] = (await pool.query(query)).rows;
  return result;
}
const cluster = async (pool) => (await pool.query(`SELECT pg_postmaster_start_time()::text AS started,
  (pg_control_system()).system_identifier::text AS system_id,
  (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner`)).rows[0];
async function source(t) {
  const f = await createSharedReadingFixture(); t.after(() => f.close());
  await f.pool.query('CREATE ROLE restore_worker LOGIN'); await f.pool.query('GRANT tsa_exam_worker TO restore_worker');
  const attempts = createAttemptService({ examPool: f.examPool, identityService: f.identityService,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  const created = await attempts.create(f.principals.studentA, randomUUID(), { blueprintVersionId: f.blueprint.versionId });
  const attemptId = created.body.attemptId; await attempts.start(f.principals.studentA, attemptId, randomUUID());
  const view = await attempts.read(f.principals.studentA, attemptId);
  for (const [index, slot] of view.slots.entries()) await attempts.save(f.principals.studentA, attemptId, slot.slotId, randomUUID(), {
    expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: f.expectedOptions[index] },
  });
  await attempts.submit(f.principals.studentA, attemptId, randomUUID());
  // Ready for an exact-hash independent review, so stale-scope denial cannot be a state/revision shortcut.
  const template = createPrivateTemplate(f.source);
  const response = await bankRequest(f.harness, f.browsers.author, '/api/v1/questions', { method: 'POST', key: randomUUID(), body: {
    schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH', taxonomyVersionId: template.taxonomyVersionId,
    domainId: template.domainId, skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
    content: [{ type: 'text', text: 'Câu hỏi tổng hợp chưa được phê duyệt để kiểm thử phục hồi.' }],
    stimulusVersionId: null, interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b', 'c'].map((id) => ({ id, content: [{ type: 'text', text: id }] })) },
    answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' }, explanation: [{ type: 'text', text: 'Lời giải tổng hợp chưa được phát hành.' }],
    evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
  } });
  assert.equal(response.status, 201); const draft = await response.json();
  await f.workflow.submitReview(f.principals.author, draft.versionId, randomUUID(), { expectedRevision: 1 });
  await f.workflow.confirmSingleton(f.principals.reviewer, draft.versionId, randomUUID(), {
    expectedRevision: 2, contentHash: draft.contentHash, reason: 'Isolated pre-restore singleton fixture; no human review claim.',
  });
  return { f, attemptId, draft };
}
function client(origin) {
  const jar = new Map();
  const fetchImpl = async (path, options = {}) => {
    const headers = new Headers(options.headers); headers.set('origin', origin);
    if (jar.size) headers.set('cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await fetch(`${origin}${path}`, { ...options, headers, signal: AbortSignal.timeout(5000) });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0], at = pair.indexOf('=');
      if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1)); else jar.delete(pair.slice(0, at));
    }
    return response;
  };
  return { api: createPersistentApi({ fetchImpl, readCookie: (key) => jar.get(key) }), fetchImpl };
}

for (const mode of ['QUEUED', 'RUNNING']) for (const revoked of [false, true]) test(`private logical restore of ${mode} work into an independent PostgreSQL cluster preserves all rows and ${revoked ? 'blocks revoked' : 'recovers eligible'} pending student grading`, { timeout: 40_000 }, async (t) => {
  const { f, attemptId, draft } = await source(t);
  let oldLease, computed;
  if (mode === 'RUNNING') {
    const sourceWorkerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'restore_worker' });
    try {
      const worker = createExamWorker({ workerPool: sourceWorkerPool, executorId: 'source-restore-worker', leaseSeconds: 10, retrySeconds: 1 });
      oldLease = await worker.claim(); assert.equal(oldLease.status, 'CLAIMED');
      computed = scoreAttempt(await worker.load(oldLease));
    } finally { await sourceWorkerPool.end(); }
  }
  if (revoked) {
    const sources = await createSourceService({ bankPool: f.bankPool, identityService: f.identityService });
    await sources.registerRightsDecision(f.principals.bankManager, f.bundles[0].source.sourceVersionId, randomUUID(), {
      status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
      evidence: 'Original isolated restore fixture; no real rights attestation.', expectedRevision: 1,
    });
  }
  const before = await rows(f.pool), originalCluster = await cluster(f.pool), originalSecurity = await security(f.pool);
  const backup = await restoreSyntheticFixture(f.harness.database, { syntheticOnly: true });
  let runtime; const pools = [];
  t.after(() => closeRestoredRuntime(runtime, pools.splice(0), backup));
  assert.notEqual(backup.target.connectionConfig.host, f.harness.database.connectionConfig.host);
  const restoredCluster = await cluster(backup.target.pool);
  assert.notEqual(restoredCluster.started, originalCluster.started); assert.notEqual(restoredCluster.system_id, originalCluster.system_id);
  assert.equal(restoredCluster.owner, originalCluster.owner);
  assert.deepEqual(await security(backup.target.pool), originalSecurity, 'role attributes/memberships, owners, security-definer settings and effective ACLs match');
  assert.deepEqual(await rows(backup.target.pool), before, 'all application rows, private inputs, rights, jobs, receipts and migration history are exact');
  assert.deepEqual((await migrate(backup.target.pool)).applied, [], 'restored migration checksums match pinned files');
  for (const [path, mode] of [[backup.directory, 0o700], [backup.archive, 0o600], [backup.roles, 0o600], [backup.roleImport, 0o600]]) assert.equal((await stat(path)).mode & 0o777, mode);
  const pool = (user) => { const p = createDatabasePool({ ...backup.target.connectionConfig, user }); pools.push(p); return p; };
  const identityPool = pool('auth_runtime'), examPool = pool('exam_runtime'), workerPool = pool('restore_worker'), bankPool = pool('bank_runtime');
  assert.deepEqual((await examPool.query('SELECT * FROM tsa_private.form_slot_secrets')).rows, [], 'restored RLS hides sealed keys from ordinary exam credentials');
  await assert.rejects(identityPool.query('SELECT * FROM tsa_private.form_slot_secrets'), (error) => error.code === '42501');
  await assert.rejects(examPool.query("SELECT tsa.exam_worker_claim('student-spoof',10)"), (error) => error.code === '42501');
  const identity = await createLocalSyntheticIdentityService(identityPool, { env: { ...env, LOCAL_AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:1' } });
  const reviewer = await identity.authenticate(new Request('http://127.0.0.1:1', { headers: { cookie: f.browsers.reviewer.cookies.join('; ') } }));
  assert.ok(reviewer);
  const workflow = await createPublicationService({ bankPool, identityService: identity, fixtureScopeId: f.fixtureScopeId });
  await assert.rejects(workflow.review(reviewer, draft.versionId, randomUUID(), {
    expectedRevision: 2, contentHash: draft.contentHash, decision: 'APPROVE',
    rubric: { correctness: true, unambiguous: true, relevant: true, language: true, explanation: true, rights: true },
    reason: 'Attempt original stale fixture scope after restoration; must fail.',
  }), { status: 403, code: 'PUBLICATION_DISABLED' });
  assert.deepEqual(await rows(backup.target.pool), before, 'stale-scope approval attempt cannot mutate restored records');
  runtime = await createStudentRuntime({ identityPool, examPool, workerPool, env, port: 0,
    pollMilliseconds: 20, sweepBatchSize: 10, executorId: 'restored-student-runtime', leaseSeconds: 10, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  const owner = client(runtime.origin); await owner.api.loginCandidate('studentA');
  if (mode === 'RUNNING') {
    const live = (await backup.target.pool.query('SELECT clock_timestamp()<lease_until AS value FROM tsa.jobs WHERE attempt_id=$1', [attemptId])).rows[0].value;
    assert.equal(live, true, 'observe restored lease while it is still actually live');
    assert.equal((await backup.target.pool.query('SELECT lease_token::text FROM tsa.jobs WHERE attempt_id=$1', [attemptId])).rows[0].lease_token, oldLease.leaseToken);
    assert.equal((await backup.target.pool.query('SELECT count(*)::int AS n FROM tsa.score_runs')).rows[0].n, 0);
  }
  const until = Date.now() + 15_000; let jobState;
  do {
    jobState = (await backup.target.pool.query('SELECT state FROM tsa.jobs WHERE attempt_id=$1', [attemptId])).rows[0].state;
    if (jobState === (revoked ? 'CANCELLED' : 'SUCCEEDED')) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < until);
  assert.equal(jobState, revoked ? 'CANCELLED' : 'SUCCEEDED');
  for (const suffix of ['', '/result']) {
    const response = await owner.fetchImpl(`/api/v1/attempts/${attemptId}${suffix}`); assert.equal(response.status, revoked ? 410 : 200);
    const value = await response.json();
    if (revoked || suffix === '') {
      const body = JSON.stringify(value);
      if (revoked) assert.equal(body.includes(f.bundles[0].content[0].text), false);
      for (const field of ['answerKey', 'correctAnswer', 'explanation', 'provenance', 'questionVersionId']) assert.equal(body.includes(`"${field}"`), false);
    }
  }
  if (!revoked) {
    const { attempt } = await owner.api.readAttempt(attemptId); assert.equal(attempt.state, 'GRADED');
    assert.equal(attempt.result.percentage, '100.00'); assert.equal(attempt.result.correctCount, 2);
    for (const slot of attempt.slots) assert.deepEqual(slot.stimulus, { id: f.bundles[0].stimulusId, content: f.bundles[0].content });
  }
  const foreign = client(runtime.origin); await foreign.api.loginCandidate('studentB');
  for (const suffix of ['', '/result']) assert.equal((await foreign.fetchImpl(`/api/v1/attempts/${attemptId}${suffix}`)).status, 404);
  if (mode === 'RUNNING') {
    const stale = createExamWorker({ workerPool, executorId: 'source-restore-worker', leaseSeconds: 10, retrySeconds: 1 });
    assert.deepEqual(await stale.load(oldLease), { status: 'LOST_LEASE' });
    assert.deepEqual(await stale.finish(oldLease, computed), { status: 'LOST_LEASE' });
  }
  const after = await rows(backup.target.pool);
  for (const table of ['tsa.assembly_runs', 'tsa.forms', 'tsa.form_slots', 'tsa_private.form_slot_secrets', 'tsa.answers', 'tsa.student_question_history', 'tsa.question_versions', 'tsa.stimulus_versions']) assert.deepEqual(after[table], before[table]);
  assert.equal(after['tsa.score_runs'].length, revoked ? 0 : 1); assert.equal(after['tsa.result_releases'].length, revoked ? 0 : 1);
  assert.equal(after['tsa.jobs'].length, 1); assert.equal(after['tsa.jobs'][0].lease_token, mode === 'RUNNING' ? 2 : 1); assert.equal(after['tsa.student_question_history'].length, 2);
  for (const field of ['id', 'kind', 'dedup_key', 'payload_ref', 'attempt_id', 'created_at']) assert.deepEqual(after['tsa.jobs'][0][field], before['tsa.jobs'][0][field]);
  if (!revoked) assert.equal(after['tsa.jobs'][0].dedup_key, `${attemptId}:${after['tsa.score_runs'][0].policy_version}:${after['tsa.score_runs'][0].input_hash}`);
  assert.deepEqual(await rows(f.pool), before, 'source remains untouched by independent target recovery');
  assert.deepEqual(await cluster(f.pool), originalCluster);
  assert.deepEqual(await security(f.pool), originalSecurity);
  await closeRestoredRuntime(runtime, pools.splice(0), backup); runtime = null;
  await absent(backup.directory); await absent(backup.target.temporaryDirectory);
  t.diagnostic(`${mode}/${revoked ? 'revoked' : 'eligible'}: ${Object.keys(before).length} application tables, ${originalSecurity.functions.length} function owners/ACLs and ${originalSecurity.policies.length} RLS policies preserved; private artifacts removed`);
});

test('failed real archive restoration removes owned private artifacts and target cluster without touching source', { timeout: 30_000 }, async (t) => {
  const { f } = await source(t); const before = await rows(f.pool); let owned;
  await assert.rejects(restoreSyntheticFixture(f.harness.database, { syntheticOnly: true, beforeRestore: async (artifacts) => {
    owned = artifacts; await writeFile(artifacts.archive, 'deliberately invalid original test archive', { mode: 0o600 });
  } }), /Owned pg_restore failed/);
  assert.ok(owned); await absent(owned.directory); await absent(owned.targetDirectory);
  assert.deepEqual(await rows(f.pool), before);
});

test('restore helper rejects absent explicit synthetic opt-in before opening any source', async () => {
  await assert.rejects(restoreSyntheticFixture(null), /Owned isolated synthetic restore source required/);
});

test('runtime and pool shutdown errors still terminate the real restored cluster and remove private archives', { timeout: 30_000 }, async (t) => {
  const { f } = await source(t), before = await rows(f.pool);
  const backup = await restoreSyntheticFixture(f.harness.database, { syntheticOnly: true }); t.after(() => backup.close());
  const pool = createDatabasePool({ ...backup.target.connectionConfig, user: 'auth_runtime' });
  await pool.query('SELECT 1');
  await assert.rejects(closeRestoredRuntime({ close: async () => { throw new Error('Injected runtime shutdown error'); } },
    [{ end: async () => { await pool.end(); throw new Error('Injected pool shutdown error'); } }], backup),
    (error) => error instanceof AggregateError && error.errors.length === 2);
  await absent(backup.directory); await absent(backup.target.temporaryDirectory);
  assert.deepEqual(await rows(f.pool), before);
});
