import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const rate = { capacity: 100, refillPerSecond: 0.000001 };
function service(f, pool = f.examPool) {
  return createAttemptService({ examPool: pool, identityService: f.identityService,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
}
async function setup(t, { short = false } = {}) {
  const f = await createAllocationFixture({ questionCount: 4 });
  t.after(() => f.close());
  let versionId = f.blueprint.versionId;
  if (short) {
    const config = structuredClone(f.blueprint.config);
    config.sections[0].durationSeconds = 1;
    const id = randomUUID(); versionId = randomUUID();
    const hash = `sha256:${createHash('sha256').update(canonicalize(config)).digest('hex')}`;
    await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, `Synthetic save boundary ${id}`]);
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
  const body = { expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: slot.interaction.options[0].id } };
  return { f, s, p, attempt, slot, body };
}
async function counts(f, attempt) {
  return (await f.pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.answers WHERE attempt_id=$1) AS answers,
    (SELECT count(*)::int FROM tsa.idempotency_records WHERE related_attempt_id=$1 AND route_scope LIKE 'PUT %') AS receipts,
    (SELECT count(*)::int FROM tsa.audit_events WHERE entity_id=$1::text AND action='ANSWER_SAVED') AS audits,
    (SELECT count(*)::int FROM tsa.jobs WHERE attempt_id=$1) AS jobs`, [attempt])).rows[0];
}
function pauseAfter(pool, pattern) {
  let reached, release;
  const entered = new Promise((resolve) => { reached = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let paused = false;
  return { entered, release, pool: {
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
async function waiting(f, applicationName) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if ((await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [applicationName])).rows[0].n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Expected a real PostgreSQL lock waiter');
}
function revoke(f, pool = f.bankPool) {
  return createSourceService({ bankPool: pool, identityService: f.identityService }).then((s) =>
    s.registerRightsDecision(f.principals.bankManager, f.source.sourceVersionId, randomUUID(), {
      status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'],
      validFrom: '2000-01-01T00:00:00Z', validTo: null,
      evidence: 'Synthetic save race; not human rights review.', expectedRevision: 1,
    }));
}

test('deadline crossing inside the answer trigger rolls back the value and commits expiry/job while preserving charged budgets', async (t) => {
  const { f, s, p, attempt, slot, body } = await setup(t, { short: true });
  await f.pool.query(`CREATE FUNCTION tsa.test_delay_answer() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_sleep(1.05); RETURN NEW; END $$;
    CREATE TRIGGER aaa_test_delay_answer BEFORE INSERT ON tsa.answers FOR EACH ROW EXECUTE FUNCTION tsa.test_delay_answer()`);
  await assert.rejects(s.save(p, attempt, slot.slotId, randomUUID(), body), { status: 409, code: 'ATTEMPT_CLOSED' });
  assert.deepEqual(await counts(f, attempt), { answers: 0, receipts: 0, audits: 0, jobs: 1 });
  assert.equal((await s.read(p, attempt)).state, 'EXPIRED');
  const budgets = await f.pool.query("SELECT tokens::text FROM tsa.rate_limit_buckets WHERE scope IN ('USER_SAVE','ATTEMPT_SAVE')");
  assert.deepEqual(budgets.rows.map((r) => r.tokens), ['99.000000', '99.000000']);
});

test('deferred receipt COMMIT failure rolls back answer/receipt/audit, retains budget charge and permits an exact retry', async (t) => {
  const { f, s, p, attempt, slot, body } = await setup(t);
  await f.pool.query(`CREATE FUNCTION tsa.test_fail_save_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.route_scope LIKE 'PUT %' THEN RAISE EXCEPTION 'Synthetic deferred save fault'; END IF; RETURN NULL; END $$;
    CREATE CONSTRAINT TRIGGER test_save_commit AFTER INSERT ON tsa.idempotency_records
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tsa.test_fail_save_commit()`);
  const key = randomUUID();
  await assert.rejects(s.save(p, attempt, slot.slotId, key, body), { status: 503, code: 'TEMPORARILY_UNAVAILABLE' });
  assert.deepEqual(await counts(f, attempt), { answers: 0, receipts: 0, audits: 0, jobs: 0 });
  assert.equal((await f.pool.query("SELECT tokens::text FROM tsa.rate_limit_buckets WHERE scope='USER_SAVE'")).rows[0].tokens, '99.000000');
  await f.pool.query('DROP TRIGGER test_save_commit ON tsa.idempotency_records');
  assert.equal((await s.save(p, attempt, slot.slotId, key, body)).body.revision, 1);
  assert.deepEqual(await counts(f, attempt), { answers: 1, receipts: 1, audits: 1, jobs: 0 });
});

for (const rightsFirst of [false, true]) test(`real rights/save lock ordering: ${rightsFirst ? 'rights' : 'save'} commits first`, async (t) => {
  const { f, s, p, attempt, slot, body } = await setup(t);
  const barrier = pauseAfter(rightsFirst ? f.bankPool : f.examPool,
    rightsFirst ? 'tsa.bank_apply_delivery_hold' : 'tsa.exam_answer_save');
  const writer = rightsFirst ? s : service(f, barrier.pool);
  let save, rights;
  try {
    if (rightsFirst) rights = revoke(f, barrier.pool);
    else save = writer.save(p, attempt, slot.slotId, randomUUID(), body);
    await Promise.race([barrier.entered, new Promise((_, reject) => setTimeout(() => reject(new Error('Barrier timeout')), 5000).unref())]);
    if (rightsFirst) save = writer.save(p, attempt, slot.slotId, randomUUID(), body);
    else rights = revoke(f);
    // Attach a handler while observing the real server-side waiter.
    const observed = save.catch((error) => error);
    await waiting(f, rightsFirst ? 'tsa-allocation-exam-test' : 'tsa-bank-api-test');
    barrier.release();
    await rights;
    const result = await observed;
    if (rightsFirst) { assert.equal(result.code, 'CONTENT_WITHDRAWN'); assert.equal(result.status, 410); }
    else assert.equal(result.status, 200);
  } finally {
    barrier.release();
    await Promise.allSettled([save, rights].filter(Boolean));
  }
  const view = await s.read(p, attempt);
  assert.equal(view.state, 'INVALIDATED');
  assert.deepEqual(view.slots, []);
  assert.deepEqual(view.answers, []);
  const actual = await counts(f, attempt);
  assert.equal(actual.answers, rightsFirst ? 0 : 1);
  assert.equal(actual.receipts, rightsFirst ? 0 : 1);
});

test('save waiting on the attempt lock uses fresh time; closed replay returns original ACK without rewriting frozen answers', async (t) => {
  const { f, s, p, attempt, slot, body } = await setup(t, { short: true });
  const key = randomUUID();
  const ack = await s.save(p, attempt, slot.slotId, key, body);
  const locker = await f.pool.connect();
  let late;
  try {
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM tsa.attempts WHERE id=$1 FOR UPDATE', [attempt]);
    late = s.save(p, attempt, slot.slotId, randomUUID(), { ...body, expectedRevision: 1 });
    const result = late.catch((e) => e);
    await waiting(f, 'tsa-allocation-exam-test');
    await locker.query('SELECT pg_sleep(1.05)');
    await locker.query('COMMIT');
    const error = await result;
    assert.equal(error.code, 'ATTEMPT_CLOSED');
    assert.equal(error.status, 409);
  } finally {
    await locker.query('ROLLBACK'); locker.release();
    if (late) await late.catch(() => {});
  }
  const replay = await s.save(p, attempt, slot.slotId, key, body);
  assert.deepEqual(replay.body, ack.body);
  assert.deepEqual(await counts(f, attempt), { answers: 1, receipts: 1, audits: 1, jobs: 1 });
});
