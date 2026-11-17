import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createBankHarness, loginActor, bankRequest } from './harness.mjs';

// Rights intervals keep PostgreSQL microsecond precision and must fail validation
// before an unsupported timestamp can turn a client error into an outage response.
test('rights timestamps reject unsupported PostgreSQL representations without writes', async t => {
  const f = await createBankHarness();
  t.after(() => f.close());
  const author = await loginActor(f, 'author'), manager = await loginActor(f, 'bankManager');
  const create = await bankRequest(f, author, '/api/v1/sources', { method: 'POST', key: randomUUID(),
    body: { title: 'Synthetic rights timestamp source', canonicalUri: null, origin: 'EXTERNAL' } });
  assert.equal(create.status, 201);
  const { sourceId } = await create.json();
  const version = await bankRequest(f, author, `/api/v1/sources/${sourceId}/versions`, { method: 'POST', key: randomUUID(),
    body: { contentHash: `sha256:${'e'.repeat(64)}`, evidenceUri: 'synthetic:timestamp-source', metadata: {} } });
  assert.equal(version.status, 201);
  const { sourceVersionId } = await version.json();
  const path = `/api/v1/source-versions/${sourceVersionId}/rights`;
  const body = { status: 'LICENSED', allowedUses: ['DISPLAY'], territory: ['VN'],
    validFrom: '2020-01-01T00:00:00Z', validTo: null, evidence: 'Synthetic test only.', expectedRevision: 0 };
  const before = (await f.database.pool.query('SELECT count(*)::int AS n FROM tsa.rights_decisions')).rows[0].n;
  for (const field of ['validFrom', 'validTo']) {
    for (const instant of ['0000-01-01T00:00:00Z', '2020-01-01T00:00:00+16:00', '2020-01-01T00:00:00-16:00']) {
      const response = await bankRequest(f, manager, path, { method: 'POST', key: randomUUID(), body: { ...body, [field]: instant } });
      assert.equal(response.status, 422, `${field}: ${instant}`);
      assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    }
  }
  assert.equal((await f.database.pool.query('SELECT count(*)::int AS n FROM tsa.rights_decisions')).rows[0].n, before);
  assert.equal((await f.database.pool.query('SELECT count(*)::int AS n FROM tsa.source_rights WHERE source_version_id=$1',
    [sourceVersionId])).rows[0].n, 0);

  for (const [revision, offset] of ['+07:00', '+15:59', '-15:59'].entries()) {
    const saved = await bankRequest(f, manager, path, { method: 'POST', key: randomUUID(), body: { ...body,
      expectedRevision: revision,
      validFrom: `2020-01-01T00:00:00.000001${offset}`, validTo: `2020-01-01T00:00:00.000002${offset}` } });
    assert.equal(saved.status, 201, offset);
  }
  const intervals = (await f.database.pool.query(`SELECT extract(epoch FROM valid_to-valid_from)::text AS seconds
    FROM tsa.rights_decisions WHERE source_version_id=$1`, [sourceVersionId])).rows;
  assert.deepEqual(intervals.map(row => row.seconds), ['0.000001', '0.000001', '0.000001']);
});
