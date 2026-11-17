import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createFactoryImportService } from '../../../src/modules/bank/factory-import.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { exportGenericFixturePackage } from '../../../tools/question-factory/generic-fixture.mjs';
import { makeGenericFixtureInput } from '../../ai/fixtures/generic-generation.mjs';
import { createBankHarness, loginActor } from '../bank/harness.mjs';

async function applicationSnapshot(pool) {
  const tables = (await pool.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_schema IN('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY table_schema,table_name`)).rows;
  const result = {};
  for (const table of tables) {
    result[`${table.table_schema}.${table.table_name}`] = (await pool.query(`SELECT
      COALESCE(jsonb_agg(row_value ORDER BY row_value::text),'[]'::jsonb) AS rows
      FROM (SELECT to_jsonb(t) AS row_value FROM "${table.table_schema}"."${table.table_name}" t) entries`)).rows[0].rows;
  }
  return result;
}

test('generic fixture exports persist private DRAFTs across all domains/types, replay exactly and roll back a late whole-unit fault', { timeout: 90_000 }, async (t) => {
  const h = await createBankHarness();
  t.after(() => h.close());
  const browser = await loginActor(h, 'author');
  const principal = await h.identity.authenticate(new Request(h.origin, { headers: { cookie: browser.cookies.join('; ') } }));
  const capability = Object.freeze({ purpose: 'generic-fixture-import-proof' });
  const service = await createFactoryImportService({ bankPool: h.bankPool, identityService: h.identity, internalCapability: capability });
  const fixture = (options = {}) => makeGenericFixtureInput({ ...options, operatorId: principal.userId });
  const tax = fixture().context.references.find((ref) => ref.kind === 'taxonomy').payload;
  await withTransaction(h.database.pool, async (client) => {
    await client.query(`INSERT INTO tsa.taxonomy_versions(id,name,version_no,definition_hash) VALUES($1,$2,$3,$4)`,
      [tax.taxonomyVersionId, tax.name, tax.versionNo, tax.definitionHash]);
    for (const node of [...tax.nodes.filter((n) => n.kind === 'DOMAIN'), ...tax.nodes.filter((n) => n.kind !== 'DOMAIN')]) {
      await client.query(`INSERT INTO tsa.taxonomy_nodes(id,taxonomy_version_id,code,kind,parent_id,metadata)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [node.id, tax.taxonomyVersionId, node.code, node.kind, node.parentId, JSON.stringify(node.metadata)]);
    }
  });

  const receipts = [];
  for (const section of ['MATH', 'READING', 'SCIENCE']) for (const interactionType of ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP']) {
    const input = fixture({ section, interactionType });
    const generated = await exportGenericFixturePackage(input);
    const first = await service.importFactoryPackageV2(principal, generated.package, capability);
    assert.equal(first.replayed, false); assert.equal(first.receipts.length, 1);
    const replay = await service.importFactoryPackageV2(principal, JSON.parse(generated.packageBytes), capability);
    assert.equal(replay.replayed, true); assert.deepEqual(replay.receipts, first.receipts);
    assert.equal(first.receipts[0].workflowState, 'DRAFT'); receipts.push(...first.receipts);
    const stored = (await h.database.pool.query(`SELECT v.section::text AS section,v.created_by,w.state::text AS state
      FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id=v.id WHERE v.id=$1`,
    [first.receipts[0].questionVersionId])).rows[0];
    assert.deepEqual(stored, { section, created_by: principal.userId, state: 'DRAFT' });
    const before = await applicationSnapshot(h.database.pool);
    input.calls[0].fixtureResult.candidates[0].content[0].text += ' Nội dung đã sửa.';
    const changed = await exportGenericFixturePackage(input);
    await assert.rejects(service.importFactoryPackageV2(principal, changed.package, capability), (error) => error.code === 'IMPORT_CONFLICT');
    assert.deepEqual(await applicationSnapshot(h.database.pool), before);
  }

  const shared = await exportGenericFixturePackage(fixture({ section: 'READING', count: 2, withStimulus: true }));
  const sharedImport = await service.importFactoryPackageV2(principal, shared.package, capability);
  receipts.push(...sharedImport.receipts);
  const grouped = await h.database.pool.query(`SELECT count(DISTINCT stimulus_version_id)::integer AS stimuli,
    count(*)::integer AS questions FROM tsa.question_versions WHERE id=ANY($1::uuid[])`,
  [sharedImport.receipts.map((row) => row.questionVersionId)]);
  assert.deepEqual(grouped.rows[0], { stimuli: 1, questions: 2 });

  const fault = await exportGenericFixturePackage(fixture({ section: 'READING', count: 2, withStimulus: true, identitySeed: 'late-fault' }));
  const secondId = fault.package.candidates[1].question.id;
  const suffix = randomUUID().replaceAll('-', '');
  const routine = `generic_late_fault_${suffix}`;
  const beforeFault = await applicationSnapshot(h.database.pool);
  await h.database.pool.query(`CREATE FUNCTION public.${routine}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id='${secondId}'::uuid THEN RAISE EXCEPTION 'synthetic late import fault' USING ERRCODE='23505'; END IF; RETURN NEW; END $$`);
  await h.database.pool.query(`CREATE TRIGGER ${routine} BEFORE INSERT ON tsa.question_versions FOR EACH ROW EXECUTE FUNCTION public.${routine}()`);
  try {
    await assert.rejects(service.importFactoryPackageV2(principal, fault.package, capability), (error) => error.code === '23505');
  } finally {
    await h.database.pool.query(`DROP TRIGGER IF EXISTS ${routine} ON tsa.question_versions`);
    await h.database.pool.query(`DROP FUNCTION IF EXISTS public.${routine}()`);
  }
  assert.deepEqual(await applicationSnapshot(h.database.pool), beforeFault, 'late second-member failure preserves every application row');
  const recovered = await service.importFactoryPackageV2(principal, fault.package, capability);
  assert.equal(recovered.receipts.length, 2); receipts.push(...recovered.receipts);

  const selection = await h.database.pool.query(`SELECT count(*)::integer AS versions,
    count(*) FILTER(WHERE tsa.bank_question_selection_allowed(v.id))::integer AS selectable
    FROM tsa.question_versions v WHERE id=ANY($1::uuid[])`, [receipts.map((row) => row.questionVersionId)]);
  assert.deepEqual(selection.rows[0], { versions: 13, selectable: 0 });
  assert.equal((await h.database.pool.query('SELECT count(*)::integer AS count FROM tsa.questions WHERE eligible_version_id IS NOT NULL')).rows[0].count, 0);
  assert.equal((await h.database.pool.query('SELECT count(*)::integer AS count FROM tsa.source_rights')).rows[0].count, 0,
    'transported fixture rights evidence does not create actual rights decisions');
});
