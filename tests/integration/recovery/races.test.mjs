import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createDatabasePool, withTransaction } from '../../../src/modules/database/pool.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const RATE = { capacity: 100, refillPerSecond: 1 };
async function setup(t, { ttl = false, two = false, createdSecond = false, naturalRights = false } = {}) {
  const rightsUntil = naturalRights ? new Date(Date.now() + 6000).toISOString() : null;
  const f = await createAllocationFixture({ questionCount: 4,
    ...(naturalRights ? { sourceOptions: { validTo: rightsUntil } } : {}) });
  let workerPool;
  t.after(async () => { if (workerPool) await workerPool.end(); await f.close(); });
  await f.pool.query('CREATE ROLE sweep_runtime LOGIN');
  await f.pool.query('GRANT tsa_exam_worker TO sweep_runtime');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'sweep_runtime' },
    { applicationName: 'tsa-sweep-races', max: 4 });
  const service = createAttemptService({ examPool: f.examPool, identityService: f.identityService,
    createRate: RATE, saveRate: { user: RATE, attempt: RATE } });
  const config = structuredClone(f.blueprint.config);
  config.sections[0].durationSeconds = ttl ? 600 : 1;
  const blueprintId = randomUUID(), blueprint = randomUUID();
  const hash = `sha256:${createHash('sha256').update(canonicalize(config)).digest('hex')}`;
  await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [blueprintId, 'Synthetic sweep races']);
  await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`, [blueprint, blueprintId, config.taxonomyVersionId, config, hash]);
  await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+$2::interval,600)`,
  [blueprint, ttl || naturalRights ? '2 seconds' : '1 hour']);
  const principals = two ? [f.principals.studentA, f.principals.studentB] : [f.principals.studentA];
  const attempts = [];
  for (const principal of principals) {
    const receipt = (await service.create(principal, randomUUID(), { blueprintVersionId: blueprint })).body;
    if (!ttl && !(createdSecond && attempts.length === 1)) await service.start(principal, receipt.attemptId, randomUUID());
    attempts.push({ principal, ...receipt });
  }
  const sweep = (batch = 10) => withTransaction(workerPool, async (client) =>
    (await client.query("SELECT tsa.exam_worker_sweep('race-sweep',$1) AS result", [batch])).rows[0].result);
  return { f, workerPool, service, attempts, sweep, rightsUntil };
}
async function waitDue(f, id, ttl = false) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const due = await f.pool.query(`SELECT clock_timestamp()>=${ttl ? 'start_before_at' : 'deadline_at'} AS due FROM tsa.attempts WHERE id=$1`, [id]);
    if (due.rows[0].due) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('The original immutable attempt deadline did not elapse');
}
async function artifacts(f, id) {
  return (await f.pool.query(`SELECT state,started_at,deadline_at,closed_at,
    (SELECT count(*)::int FROM tsa.jobs WHERE attempt_id=a.id) AS jobs,
    (SELECT count(*)::int FROM tsa.answers WHERE attempt_id=a.id) AS answers,
    (SELECT count(*)::int FROM tsa.student_question_history WHERE first_attempt_id=a.id) AS history,
    (SELECT count(*)::int FROM tsa.audit_events WHERE entity_id=a.id::text AND service_actor='EXAM:race-sweep') AS audits
    FROM tsa.attempts a WHERE id=$1`, [id])).rows[0];
}
async function seal(f, form) {
  return (await f.pool.query(`SELECT f.content_hash,
    (SELECT to_jsonb(r) FROM tsa.assembly_runs r WHERE r.id=f.assembly_run_id) AS assembly,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY ordinal) FROM tsa.form_slots s WHERE form_id=f.id) AS slots,
    (SELECT jsonb_agg(to_jsonb(k) ORDER BY slot_id) FROM tsa_private.form_slot_secrets k WHERE form_id=f.id) AS secrets
    FROM tsa.forms f WHERE id=$1`, [form])).rows[0];
}
async function waitLock(f, name) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const row = await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [name]);
    if (row.rows[0].n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Expected a real PostgreSQL lock waiter');
}
async function beginSweep(workerPool, batch = 10) {
  const client = await workerPool.connect();
  try {
    await client.query('BEGIN');
    const result = (await client.query("SELECT tsa.exam_worker_sweep('race-sweep',$1) AS result", [batch])).rows[0].result;
    return { client, result };
  } catch (error) { await client.query('ROLLBACK'); client.release(); throw error; }
}

test('concurrent sweepers skip a locked student and commit another expired attempt independently', async (t) => {
  const { f, workerPool, attempts, sweep } = await setup(t, { two: true });
  for (const a of attempts) await waitDue(f, a.attemptId);
  const first = await beginSweep(workerPool, 1);
  try {
    assert.equal(first.result.expired, 1);
    const second = await sweep(1);
    assert.equal(second.expired, 1, 'a second student commits while the first sweep stays uncommitted');
    const visible = await Promise.all(attempts.map((a) => artifacts(f, a.attemptId)));
    assert.equal(visible.filter((a) => a.state === 'EXPIRED').length, 1);
    await first.client.query('COMMIT');
  } finally { await first.client.query('ROLLBACK'); first.client.release(); }
  for (const a of attempts) {
    const actual = await artifacts(f, a.attemptId);
    assert.equal(actual.state, 'EXPIRED'); assert.equal(actual.jobs, 1); assert.equal(actual.history, 4);
  }
  assert.equal((await sweep()).reconciled, 0);
});

for (const command of ['submit', 'save']) test(`sweep-first ${command} waits for expiry and cannot create a late answer or duplicate job`, async (t) => {
  const { f, workerPool, attempts: [a], service } = await setup(t);
  const slot = (await service.read(a.principal, a.attemptId)).slots[0];
  await waitDue(f, a.attemptId);
  const first = await beginSweep(workerPool);
  let pending;
  try {
    pending = (command === 'submit'
      ? service.submit(a.principal, a.attemptId, randomUUID())
      : service.save(a.principal, a.attemptId, slot.slotId, randomUUID(), {
        expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: slot.interaction.options[0].id },
      })).catch((error) => error);
    await waitLock(f, 'tsa-allocation-exam-test');
    await first.client.query('COMMIT');
    const result = await pending;
    if (command === 'submit') assert.equal(result.body.state, 'EXPIRED');
    else assert.equal(result.code, 'ATTEMPT_CLOSED');
  } finally {
    await first.client.query('ROLLBACK'); first.client.release();
    if (pending) await pending;
  }
  const actual = await artifacts(f, a.attemptId);
  assert.equal(actual.state, 'EXPIRED'); assert.equal(actual.jobs, 1); assert.equal(actual.answers, 0);
});

test('a start holding its attempt lock is skipped at the original TTL and keeps its immutable started clock', async (t) => {
  const { f, attempts: [a], sweep } = await setup(t, { ttl: true });
  const client = await f.examPool.connect();
  try {
    await client.query('BEGIN'); await client.query('SET LOCAL ROLE tsa_exam');
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [a.principal.userId]);
    const started = (await client.query('SELECT tsa.exam_attempt_start($1,$2,$3) AS result',
      [a.attemptId, randomUUID(), `sha256:${'1'.repeat(64)}`])).rows[0].result;
    assert.equal(started.status, 'STARTED');
    await waitDue(f, a.attemptId, true);
    assert.equal((await sweep()).reconciled, 0, 'SKIP LOCKED never waits for or cancels an in-flight valid start');
    await client.query('COMMIT');
    const actual = await artifacts(f, a.attemptId);
    assert.equal(actual.state, 'IN_PROGRESS'); assert.equal(actual.jobs, 0);
    assert.equal((await sweep()).reconciled, 0);
  } finally { await client.query('ROLLBACK'); client.release(); }
});

test('TTL sweep commits cancellation before a concurrent first start returns unavailable', async (t) => {
  const { f, workerPool, attempts: [a], service } = await setup(t, { ttl: true });
  await waitDue(f, a.attemptId, true);
  const first = await beginSweep(workerPool);
  let pending;
  try {
    assert.equal(first.result.cancelled, 1);
    pending = service.start(a.principal, a.attemptId, randomUUID()).catch((error) => error);
    await waitLock(f, 'tsa-allocation-exam-test');
    await first.client.query('COMMIT');
    assert.equal((await pending).code, 'FORM_UNAVAILABLE');
  } finally { await first.client.query('ROLLBACK'); first.client.release(); if (pending) await pending; }
  const actual = await artifacts(f, a.attemptId);
  assert.equal(actual.state, 'CANCELLED'); assert.equal(actual.started_at, null); assert.equal(actual.deadline_at, null);
  assert.equal(actual.jobs, 0); assert.equal(actual.history, 4);
});

for (const fault of ['attempt', 'job', 'audit', 'commit']) test(`sweep ${fault} failure rolls back closure, jobs and service audit together`, async (t) => {
  const { f, attempts: [a], sweep } = await setup(t);
  const frozen = await seal(f, a.formId);
  await waitDue(f, a.attemptId);
  const before = await artifacts(f, a.attemptId);
  const table = { attempt: 'attempts', job: 'jobs', audit: 'audit_events', commit: 'jobs' }[fault];
  const event = fault === 'attempt' ? 'UPDATE' : 'INSERT';
  await f.pool.query(`CREATE FUNCTION tsa.test_sweep_fault() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Synthetic sweep persistence fault'; END $$`);
  await f.pool.query(fault === 'commit'
    ? `CREATE CONSTRAINT TRIGGER test_sweep_fault AFTER INSERT ON tsa.${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tsa.test_sweep_fault()`
    : `CREATE TRIGGER test_sweep_fault BEFORE ${event} ON tsa.${table} FOR EACH ROW EXECUTE FUNCTION tsa.test_sweep_fault()`);
  await assert.rejects(sweep(), /Synthetic sweep persistence fault/);
  assert.deepEqual(await artifacts(f, a.attemptId), before);
  assert.deepEqual(await seal(f, a.formId), frozen);
  await f.pool.query(`DROP TRIGGER test_sweep_fault ON tsa.${table}`);
  assert.equal((await sweep()).expired, 1);
  const actual = await artifacts(f, a.attemptId);
  assert.equal(actual.jobs, 1); assert.equal(actual.audits, 1); assert.equal(actual.history, 4);
  assert.deepEqual(await seal(f, a.formId), frozen);
});

test('failure on the second attempt rolls back the entire bounded sweep batch', async (t) => {
  const { f, attempts, sweep } = await setup(t, { two: true });
  for (const a of attempts) await waitDue(f, a.attemptId);
  const before = await Promise.all(attempts.map((a) => artifacts(f, a.attemptId)));
  await f.pool.query(`CREATE FUNCTION tsa.test_sweep_second_fault() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS(SELECT 1 FROM tsa.jobs WHERE kind='exam_grade_attempt') THEN
        RAISE EXCEPTION 'Synthetic second-attempt persistence fault';
      END IF;
      RETURN NEW;
    END $$`);
  await f.pool.query(`CREATE TRIGGER test_sweep_second_fault BEFORE INSERT ON tsa.jobs
    FOR EACH ROW EXECUTE FUNCTION tsa.test_sweep_second_fault()`);
  await assert.rejects(sweep(2), /Synthetic second-attempt persistence fault/);
  assert.deepEqual(await Promise.all(attempts.map((a) => artifacts(f, a.attemptId))), before);
  await f.pool.query('DROP TRIGGER test_sweep_second_fault ON tsa.jobs');
  assert.equal((await sweep(2)).expired, 2);
  for (const a of attempts) {
    const actual = await artifacts(f, a.attemptId);
    assert.equal(actual.jobs, 1); assert.equal(actual.audits, 1); assert.equal(actual.history, 4);
  }
});

test('withdrawal cancels unstarted attempts and invalidates active attempts without changing sealed content', async (t) => {
  const { f, attempts, sweep } = await setup(t, { two: true, createdSecond: true });
  const frozen = await Promise.all(attempts.map((a) => seal(f, a.formId)));
  // Model an authorized operator withdrawal, not a schedule edit or publication.
  await withTransaction(f.pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(1414742321,1)');
    for (const a of attempts) await client.query(`UPDATE tsa.form_availability SET
      withdrawn_at=clock_timestamp(),withdrawal_reason='Synthetic security withdrawal',revision=revision+1 WHERE form_id=$1`, [a.formId]);
  });
  assert.deepEqual(await sweep(), { status: 'SWEPT', reconciled: 2, cancelled: 1, expired: 0, invalidated: 1 });
  assert.equal((await artifacts(f, attempts[0].attemptId)).state, 'INVALIDATED');
  const created = await artifacts(f, attempts[1].attemptId);
  assert.equal(created.state, 'CANCELLED'); assert.equal(created.started_at, null); assert.equal(created.deadline_at, null);
  assert.equal((await f.pool.query('SELECT cancellation_reason FROM tsa.attempts WHERE id=$1',
    [attempts[1].attemptId])).rows[0].cancellation_reason, 'FORM_WITHDRAWN');
  for (const a of attempts) {
    const actual = await artifacts(f, a.attemptId);
    assert.equal(actual.jobs, 0); assert.equal(actual.history, 4); assert.equal(actual.audits, 1);
  }
  assert.deepEqual(await Promise.all(attempts.map((a) => seal(f, a.formId))), frozen);
  assert.equal((await sweep()).reconciled, 0);
});

test('natural rights expiry takes precedence over elapsed grading without a fanout request', async (t) => {
  const { f, attempts: [a], sweep, rightsUntil } = await setup(t, { naturalRights: true });
  const frozen = await seal(f, a.formId);
  const end = Date.now() + 8000;
  while (!(await f.pool.query('SELECT clock_timestamp()>=$1::timestamptz AS elapsed', [rightsUntil])).rows[0].elapsed) {
    assert.ok(Date.now() < end, 'the original rights validity boundary elapses');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(await sweep(), { status: 'SWEPT', reconciled: 1, cancelled: 0, expired: 0, invalidated: 1 });
  const actual = await artifacts(f, a.attemptId);
  assert.equal(actual.state, 'INVALIDATED'); assert.equal(actual.jobs, 0); assert.equal(actual.history, 4);
  assert.deepEqual(await seal(f, a.formId), frozen);
});

function pauseAfter(pool, pattern) {
  let release, entered, timer, paused = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { entered = resolve; });
  return { release, entered: () => Promise.race([reached, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Barrier timeout')), 5000);
  })]).finally(() => clearTimeout(timer)), pool: {
    query: (...args) => pool.query(...args),
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, { get(target, prop) {
        if (prop === 'query') return async (...args) => {
          const result = await target.query(...args);
          if (!paused && typeof args[0] === 'string' && args[0].includes(pattern)) {
            paused = true; entered(); await gate;
          }
          return result;
        };
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    },
  } };
}
async function revoke(f, pool) {
  const sources = await createSourceService({ bankPool: pool, identityService: f.identityService });
  return sources.registerRightsDecision(f.principals.bankManager, f.source.sourceVersionId, randomUUID(), {
    status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Synthetic sweep race only; not a real rights attestation.', expectedRevision: 1,
  });
}
for (const rightsFirst of [true, false]) test(`rights/sweep ordering: ${rightsFirst ? 'rights' : 'sweep'} commits first`, async (t) => {
  const { f, workerPool, attempts: [a], sweep } = await setup(t);
  const frozen = await seal(f, a.formId);
  await waitDue(f, a.attemptId);
  if (rightsFirst) {
    const barrier = pauseAfter(f.bankPool, 'tsa.bank_apply_delivery_hold');
    let rights, pending;
    try {
      rights = revoke(f, barrier.pool); await barrier.entered();
      pending = sweep();
      await waitLock(f, 'tsa-sweep-races');
      barrier.release(); await rights; await pending;
    } finally { barrier.release(); await Promise.allSettled([rights, pending].filter(Boolean)); }
  } else {
    const first = await beginSweep(workerPool);
    let rights;
    try {
      assert.equal(first.result.expired, 1);
      rights = revoke(f, f.bankPool);
      await waitLock(f, 'tsa-bank-api-test');
      await first.client.query('COMMIT'); await rights;
    } finally { await first.client.query('ROLLBACK'); first.client.release(); if (rights) await rights; }
  }
  const actual = await artifacts(f, a.attemptId);
  assert.equal(actual.state, 'INVALIDATED'); assert.equal(actual.jobs, rightsFirst ? 0 : 1);
  assert.deepEqual(await seal(f, a.formId), frozen);
  assert.equal((await sweep()).reconciled, 0);
});
