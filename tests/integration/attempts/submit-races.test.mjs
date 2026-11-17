import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const rate = { capacity: 100, refillPerSecond: 0.000001 };
function service(f, pool = f.examPool) {
  return createAttemptService({ examPool: pool, identityService: f.identityService,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
}
async function setup(t, short = false) {
  const f = await createAllocationFixture({ questionCount: 4 });
  t.after(() => f.close());
  let versionId = f.blueprint.versionId;
  if (short) {
    const config = structuredClone(f.blueprint.config); config.sections[0].durationSeconds = 1;
    const id = randomUUID(); versionId = randomUUID();
    const hash = `sha256:${createHash('sha256').update(canonicalize(config)).digest('hex')}`;
    await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, `Synthetic submit boundary ${id}`]);
    await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
      VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`, [versionId, id, config.taxonomyVersionId, config, hash]);
    await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
      VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',600)`, [versionId]);
  }
  const s = service(f), p = f.principals.studentA;
  const created = await s.create(p, randomUUID(), { blueprintVersionId: versionId });
  const attempt = created.body.attemptId;
  await s.start(p, attempt, randomUUID());
  const slot = (await s.read(p, attempt)).slots[0];
  return { f, s, p, attempt, slot,
    body: { expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: slot.interaction.options[0].id } } };
}
async function counts(f, attempt) {
  return (await f.pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.jobs WHERE attempt_id=$1) AS jobs,
    (SELECT count(*)::int FROM tsa.idempotency_records WHERE related_attempt_id=$1 AND route_scope LIKE '%/submit') AS receipts,
    (SELECT count(*)::int FROM tsa.audit_events WHERE entity_id=$1::text AND action='ATTEMPT_SUBMITTED') AS audits,
    (SELECT count(*)::int FROM tsa.answers WHERE attempt_id=$1) AS answers`, [attempt])).rows[0];
}
function pauseAfter(pool, pattern) {
  let reached, release, timer;
  const entered = new Promise((resolve) => { reached = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let paused = false;
  return { entered: () => Promise.race([entered, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Barrier timeout')), 5000);
  })]).finally(() => clearTimeout(timer)), release, pool: {
    query: (...args) => pool.query(...args),
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, { get(target, prop) {
        if (prop === 'query') return async (...args) => {
          const result = await target.query(...args);
          if (!paused && typeof args[0] === 'string' && args[0].includes(pattern)) {
            paused = true; reached(); await gate;
          }
          return result;
        };
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    },
  } };
}
async function waiting(f, name) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if ((await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [name])).rows[0].n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Expected a real PostgreSQL lock waiter');
}
async function assertDigest(f, attempt) {
  const result = await f.pool.query(`SELECT j.dedup_key=a.id::text||':'||k.policy_version||':'||tsa.exam_grading_input_hash(a.id) AS matches
    FROM tsa.jobs j JOIN tsa.attempts a ON a.id=j.attempt_id
    JOIN LATERAL(SELECT policy_version FROM tsa_private.form_slot_secrets WHERE form_id=a.form_id LIMIT 1) k ON true
    WHERE a.id=$1`, [attempt]);
  assert.deepEqual(result.rows, [{ matches: true }]);
}

for (const submitFirst of [false, true]) test(`save/submit transactions: ${submitFirst ? 'submit' : 'save'} wins the attempt lock`, async (t) => {
  const { f, s, p, attempt, slot, body } = await setup(t);
  const barrier = pauseAfter(f.examPool, submitFirst ? 'tsa.exam_attempt_submit' : 'tsa.exam_answer_save');
  const first = service(f, barrier.pool);
  let save, submit;
  try {
    if (submitFirst) submit = first.submit(p, attempt, randomUUID());
    else save = first.save(p, attempt, slot.slotId, randomUUID(), body);
    await barrier.entered();
    if (submitFirst) save = s.save(p, attempt, slot.slotId, randomUUID(), body);
    else submit = s.submit(p, attempt, randomUUID());
    const saveResult = save.catch((e) => e);
    await waiting(f, 'tsa-allocation-exam-test');
    barrier.release();
    assert.equal((await submit).body.state, 'SUBMITTED');
    const actualSave = await saveResult;
    if (submitFirst) { assert.equal(actualSave.status, 409); assert.equal(actualSave.code, 'ATTEMPT_CLOSED'); }
    else assert.equal(actualSave.status, 200);
  } finally { barrier.release(); await Promise.allSettled([save, submit].filter(Boolean)); }
  assert.deepEqual(await counts(f, attempt), { jobs: 1, receipts: 1, audits: 1, answers: submitFirst ? 0 : 1 });
  await assertDigest(f, attempt);
});

function revoke(f, pool) {
  return createSourceService({ bankPool: pool, identityService: f.identityService }).then((s) =>
    s.registerRightsDecision(f.principals.bankManager, f.source.sourceVersionId, randomUUID(), {
      status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'],
      validFrom: '2000-01-01T00:00:00Z', validTo: null,
      evidence: 'Synthetic submit race; not human rights review.', expectedRevision: 1,
    }));
}
for (const rightsFirst of [false, true]) test(`rights/submit transactions: ${rightsFirst ? 'rights' : 'submit'} commits first`, async (t) => {
  const { f, s, p, attempt } = await setup(t);
  const barrier = pauseAfter(rightsFirst ? f.bankPool : f.examPool,
    rightsFirst ? 'tsa.bank_apply_delivery_hold' : 'tsa.exam_attempt_submit');
  let submit, rights;
  const key = randomUUID();
  try {
    if (rightsFirst) rights = revoke(f, barrier.pool);
    else submit = service(f, barrier.pool).submit(p, attempt, key);
    await barrier.entered();
    if (rightsFirst) submit = s.submit(p, attempt, key);
    else rights = revoke(f, f.bankPool);
    const submitted = submit.catch((e) => e);
    await waiting(f, rightsFirst ? 'tsa-allocation-exam-test' : 'tsa-bank-api-test');
    barrier.release(); await rights;
    const result = await submitted;
    if (rightsFirst) { assert.equal(result.status, 410); assert.equal(result.code, 'CONTENT_WITHDRAWN'); }
    else assert.equal(result.body.state, 'SUBMITTED');
  } finally { barrier.release(); await Promise.allSettled([submit, rights].filter(Boolean)); }
  assert.equal((await s.read(p, attempt)).state, 'INVALIDATED');
  await assert.rejects(s.submit(p, attempt, key), { status: 410, code: 'CONTENT_WITHDRAWN' });
  const actual = await counts(f, attempt);
  assert.equal(actual.jobs, rightsFirst ? 0 : 1);
  assert.equal(actual.receipts, rightsFirst ? 0 : 1);
});

for (const mode of ['trigger', 'lock']) test(`submission crossing deadline at ${mode} returns committed EXPIRED closure and one job`, async (t) => {
  const { f, s, p, attempt } = await setup(t, true);
  const key = randomUUID();
  let result;
  if (mode === 'trigger') {
    await f.pool.query(`CREATE FUNCTION tsa.test_delay_submit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF OLD.state='IN_PROGRESS' AND NEW.state='SUBMITTED' THEN PERFORM pg_sleep(1.05); END IF; RETURN NEW; END $$;
      CREATE TRIGGER aaa_test_delay_submit BEFORE UPDATE ON tsa.attempts FOR EACH ROW EXECUTE FUNCTION tsa.test_delay_submit()`);
    result = await s.submit(p, attempt, key);
  } else {
    const locker = await f.pool.connect(); let pending;
    try {
      await locker.query('BEGIN');
      await locker.query('SELECT id FROM tsa.attempts WHERE id=$1 FOR UPDATE', [attempt]);
      pending = s.submit(p, attempt, key);
      await waiting(f, 'tsa-allocation-exam-test');
      await locker.query('SELECT pg_sleep(1.05)');
      await locker.query('COMMIT');
      result = await pending;
    } finally { await locker.query('ROLLBACK'); locker.release(); if (pending) await pending.catch(() => {}); }
  }
  assert.equal(result.status, 200); assert.equal(result.body.state, 'EXPIRED');
  assert.equal(result.body.terminalReason, 'DEADLINE');
  assert.deepEqual(await counts(f, attempt), { jobs: 1, receipts: 1, audits: 0, answers: 0 });
  assert.deepEqual((await s.submit(p, attempt, key)).body, result.body);
  assert.equal((await s.submit(p, attempt, randomUUID())).body.state, 'EXPIRED');
  assert.equal((await counts(f, attempt)).jobs, 1);
  await assertDigest(f, attempt);
});

for (const fault of ['job', 'audit', 'receipt', 'commit']) test(`required ${fault} persistence failure rolls back closure, dispatch, receipt and audit`, async (t) => {
  const { f, s, p, attempt } = await setup(t);
  const table = fault === 'job' ? 'jobs' : fault === 'audit' ? 'audit_events' : 'idempotency_records';
  const predicate = fault === 'job' ? "NEW.kind='exam_grade_attempt'"
    : fault === 'audit' ? "NEW.action='ATTEMPT_SUBMITTED'" : "NEW.route_scope LIKE '%/submit'";
  await f.pool.query(`CREATE FUNCTION tsa.test_fail_submit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF ${predicate} THEN RAISE EXCEPTION 'Synthetic submit persistence fault'; END IF; RETURN NEW; END $$`);
  await f.pool.query(fault === 'commit'
    ? `CREATE CONSTRAINT TRIGGER test_submit_fault AFTER INSERT ON tsa.${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tsa.test_fail_submit()`
    : `CREATE TRIGGER test_submit_fault BEFORE INSERT ON tsa.${table} FOR EACH ROW EXECUTE FUNCTION tsa.test_fail_submit()`);
  const key = randomUUID();
  await assert.rejects(s.submit(p, attempt, key), { status: 503, code: 'TEMPORARILY_UNAVAILABLE' });
  assert.equal((await s.read(p, attempt)).state, 'IN_PROGRESS');
  assert.deepEqual(await counts(f, attempt), { jobs: 0, receipts: 0, audits: 0, answers: 0 });
  await f.pool.query(`DROP TRIGGER test_submit_fault ON tsa.${table}`);
  assert.equal((await s.submit(p, attempt, key)).body.state, 'SUBMITTED');
  assert.deepEqual(await counts(f, attempt), { jobs: 1, receipts: 1, audits: 1, answers: 0 });
});

test('exact submit key/hash conflict does not mutate closure and Factory role cannot execute the command', async (t) => {
  const { f, s, p, attempt } = await setup(t);
  const key = randomUUID(), receipt = await s.submit(p, attempt, key);
  // Empty public commands have one canonical hash. Probe the SQL protection
  // directly with a different digest without inventing a public request shape.
  const changed = await withTransaction(f.examPool, async (client) => {
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [p.userId]);
    return (await client.query('SELECT tsa.exam_attempt_submit($1,$2,$3) AS result',
      [attempt, key, `sha256:${'0'.repeat(64)}`])).rows[0].result;
  }, { role: 'tsa_exam' });
  assert.deepEqual(changed, { status: 'ERROR', code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(withTransaction(f.pool, (client) => client.query(
    'SELECT tsa.exam_attempt_submit($1,$2,$3)', [attempt, randomUUID(), `sha256:${'0'.repeat(64)}`]),
  { role: 'tsa_factory' }), { code: '42501' });
  assert.deepEqual((await s.submit(p, attempt, key)).body, receipt.body);
  assert.deepEqual(await counts(f, attempt), { jobs: 1, receipts: 1, audits: 1, answers: 0 });
});
