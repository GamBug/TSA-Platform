import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { canonicalize, createHttpBoundaryHandler } from '../../../packages/contracts/dist/internal.js';
import { createHash } from 'node:crypto';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const rate = { capacity: 100, refillPerSecond: 10 };
function service(f) { return createAttemptService({ examPool: f.examPool, identityService: f.identityService, createRate: rate }); }

test('actual trigger-generated start deadline must remain rights-covered; failed start rolls back its section and receipt', async (t) => {
  const f = await createAllocationFixture({ questionCount: 4 });
  t.after(() => f.close());
  const s = service(f);
  const created = await s.create(f.principals.studentA, randomUUID(), { blueprintVersionId: f.blueprint.versionId });
  const before = await f.pool.query('SELECT content_hash FROM tsa.forms WHERE id=$1', [created.body.formId]);
  const sources = await createSourceService({ bankPool: f.bankPool, identityService: f.identityService });
  await sources.registerRightsDecision(f.principals.bankManager, f.source.sourceVersionId, randomUUID(), {
    status: 'OWNED', allowedUses: ['DISPLAY', 'ADAPT'], territory: ['VN'],
    validFrom: '2000-01-01T00:00:00Z', validTo: new Date(Date.now() + 602_000).toISOString(),
    evidence: 'Synthetic rights boundary; not human approval.', expectedRevision: 1,
  });
  // A disposable owner-only trigger delays the existing authoritative clock.
  // No immutable attempt/form data or production function is rewritten.
  await f.pool.query(`CREATE FUNCTION tsa.test_delay_first_start() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE wait_until timestamptz;
    BEGIN
      IF OLD.state='CREATED' AND NEW.state='IN_PROGRESS' THEN
        SELECT rd.valid_to-interval '600 seconds'+interval '50 milliseconds' INTO wait_until
          FROM tsa.rights_decisions rd JOIN tsa.source_rights sr ON sr.decision_id=rd.id LIMIT 1;
        PERFORM pg_sleep(greatest(0,extract(epoch FROM wait_until-clock_timestamp())));
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER aaa_test_delay_start BEFORE UPDATE ON tsa.attempts
      FOR EACH ROW EXECUTE FUNCTION tsa.test_delay_first_start()`);
  assert.equal((await f.pool.query('SELECT tsa.exam_form_rights_cover($1,clock_timestamp()+interval \'600 seconds\') AS covered', [created.body.formId])).rows[0].covered, true);
  await assert.rejects(s.start(f.principals.studentA, created.body.attemptId, randomUUID()), { code: 'FORM_UNAVAILABLE', status: 410 });
  const actual = (await f.pool.query(`SELECT state,started_at,deadline_at,cancellation_reason,
    (SELECT count(*)::int FROM tsa.attempt_sections WHERE attempt_id=a.id) AS windows,
    (SELECT count(*)::int FROM tsa.idempotency_records WHERE related_attempt_id=a.id AND route_scope LIKE '%/start') AS receipts,
    (SELECT count(*)::int FROM tsa.student_question_history WHERE first_attempt_id=a.id) AS history
    FROM tsa.attempts a WHERE id=$1`, [created.body.attemptId])).rows[0];
  assert.deepEqual(actual, { state: 'CANCELLED', started_at: null, deadline_at: null, cancellation_reason: 'RIGHTS_BLOCKED', windows: 0, receipts: 0, history: 4 });
  assert.deepEqual((await f.pool.query('SELECT content_hash FROM tsa.forms WHERE id=$1', [created.body.formId])).rows, before.rows);
});

test('fresh final GET guard closes deadline crossings and queues exactly one grade job without exposing stale slots', async (t) => {
  const f = await createAllocationFixture({ questionCount: 4 });
  t.after(() => f.close());
  // Create a distinct immutable short-duration blueprint before allocation.
  const config = structuredClone(f.blueprint.config);
  config.sections[0].durationSeconds = 1;
  const blueprintId = randomUUID(), versionId = randomUUID();
  const hash = `sha256:${createHash('sha256').update(canonicalize(config)).digest('hex')}`;
  await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [blueprintId, 'Synthetic one-second boundary']);
  await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`, [versionId, blueprintId, config.taxonomyVersionId, config, hash]);
  await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',600)`, [versionId]);
  const s = service(f), principal = f.principals.studentA;
  const created = await s.create(principal, randomUUID(), { blueprintVersionId: versionId });
  await s.start(principal, created.body.attemptId, randomUUID());
  const response = await s.withReadBoundary(principal, async (ports) => {
    const boundary = createHttpBoundaryHandler({ authenticate: async () => principal, ...ports,
      loadAttemptView: async (input) => {
        const view = await ports.loadAttemptView(input);
        assert.equal(view.slots.length, 4);
        await f.pool.query('SELECT pg_sleep(1.05)');
        return view;
      },
    });
    return boundary(new Request(`http://127.0.0.1/api/v1/attempts/${created.body.attemptId}`));
  });
  assert.equal(response.status, 503, 'changed final guard discards the loaded active payload');
  assert.equal(JSON.stringify(await response.json()).includes('Synthetic'), false);
  assert.equal((await s.read(principal, created.body.attemptId)).state, 'EXPIRED');
  assert.equal((await s.read(principal, created.body.attemptId)).slots.length, 0);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.jobs WHERE attempt_id=$1', [created.body.attemptId])).rows[0].n, 1);
});

test('ordinary schedule shortening and extension preserve already committed admission deadlines at first start', async (t) => {
  const f = await createAllocationFixture({ questionCount: 4 });
  t.after(() => f.close());
  const s = service(f);
  const createdA = await s.create(f.principals.studentA, randomUUID(), { blueprintVersionId: f.blueprint.versionId });
  const createdB = await s.create(f.principals.studentB, randomUUID(), { blueprintVersionId: f.blueprint.versionId });
  await f.pool.query(`UPDATE tsa.form_availability SET available_from=clock_timestamp()-interval '2 hours',
    available_until=clock_timestamp()-interval '1 hour',revision=revision+1 WHERE form_id=$1`, [createdA.body.formId]);
  await f.pool.query(`UPDATE tsa.blueprint_offerings SET available_from=clock_timestamp()-interval '2 hours',
    available_until=clock_timestamp()-interval '1 hour',revision=revision+1 WHERE blueprint_version_id=$1`, [f.blueprint.versionId]);
  assert.equal((await s.read(f.principals.studentA, createdA.body.attemptId)).startBefore, createdA.body.startBefore);
  assert.equal((await s.start(f.principals.studentA, createdA.body.attemptId, randomUUID())).status, 200);
  await f.pool.query(`UPDATE tsa.form_availability SET available_until=clock_timestamp()+interval '2 days',
    revision=revision+1 WHERE form_id=$1`, [createdB.body.formId]);
  await f.pool.query(`UPDATE tsa.blueprint_offerings SET available_until=clock_timestamp()+interval '2 days',
    revision=revision+1 WHERE blueprint_version_id=$1`, [f.blueprint.versionId]);
  assert.equal((await s.read(f.principals.studentB, createdB.body.attemptId)).startBefore, createdB.body.startBefore);
  assert.equal((await s.start(f.principals.studentB, createdB.body.attemptId, randomUUID())).status, 200);
});
