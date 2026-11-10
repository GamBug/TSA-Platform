import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { backupLocalDatabase } from '../../../src/local/database-backup.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createQuestionService } from '../../../src/modules/bank/questions.mjs';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';

const migration = '031_cloze_matching.sql';
async function snapshot(pool) {
  const rows = {};
  const tables = (await pool.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY 1,2")).rows;
  for (const { table_schema: schema, table_name: table } of tables) {
    assert.match(schema, /^tsa(?:_private)?$/); assert.match(table, /^[a-z_]+$/);
    rows[`${schema}.${table}`] = jsonDigest((await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS rows FROM (SELECT to_jsonb(t) AS value FROM "${schema}"."${table}" t) s`)).rows[0].rows);
  }
  return { rows,
    relations: (await pool.query("SELECT n.nspname,c.relname,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('tsa','tsa_private') ORDER BY 1,2")).rows,
    policies: (await pool.query("SELECT * FROM pg_policies WHERE schemaname IN('tsa','tsa_private') ORDER BY schemaname,tablename,policyname")).rows,
    functions: (await pool.query("SELECT p.oid::regprocedure::text AS signature,p.proowner,p.proacl::text,p.proconfig,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('tsa','tsa_private') ORDER BY p.oid")).rows,
  };
}
function assertPreserved(before, after) {
  for (const [name, hash] of Object.entries(before.rows)) assert.equal(after.rows[name], hash, name);
  for (const kind of ['relations','policies','functions']) {
    const key = kind === 'relations' ? row => `${row.nspname}.${row.relname}` : kind === 'policies' ? row => `${row.schemaname}.${row.tablename}.${row.policyname}` : row => row.signature;
    const map = new Map(after[kind].map(row => [key(row), row]));
    for (const row of before[kind]) assert.deepEqual(map.get(key(row)), row, key(row));
  }
}

async function assertSqlProtocols(pool, legacyAttemptId) {
  const cloze = {
    type: 'CLOZE',
    fields: [{ id: 'accented', label: 'Accented word' }, { id: 'dotted-i', label: 'Dotted capital I' }, { id: 'greek', label: 'Greek word' }],
    maxLength: 16,
    normalization: { unicode: 'NFC', trim: 'OUTER', caseSensitive: true, diacritics: 'PRESERVE' },
  };
  const clozeKey = { type: 'CLOZE', acceptedValues: { accented: ['café'], 'dotted-i': ['İ'], greek: ['ΟΣ'] } };
  const clozeResponse = (values) => ({ type: 'CLOZE', values });
  const responseValid = async (interaction, response) => (await pool.query(
    'SELECT tsa.exam_response_valid($1::jsonb,$2::jsonb) AS valid', [JSON.stringify(interaction), JSON.stringify(response)],
  )).rows[0].valid;
  const earned = async (interaction, key, response) => (await pool.query(
    'SELECT tsa.exam_binary_earned($1::jsonb,$2::jsonb,$3::jsonb) AS earned',
    [JSON.stringify(interaction), JSON.stringify(key), response === null ? null : JSON.stringify(response)],
  )).rows[0].earned;

  assert.equal(await responseValid(cloze, clozeResponse({ accented: 'cafe\u0301', 'dotted-i': 'İ', greek: 'ΟΣ' })), true);
  assert.equal(await earned(cloze, clozeKey, clozeResponse({ accented: 'cafe\u0301', 'dotted-i': 'İ', greek: 'ΟΣ' })), 1);
  assert.equal(await earned(cloze, clozeKey, clozeResponse({ accented: 'cafe\u0301', 'dotted-i': 'i', greek: 'ΟΣ' })), 0);
  assert.equal(await earned(cloze, clozeKey, clozeResponse({ accented: 'cafe\u0301', 'dotted-i': 'İ', greek: 'ος' })), 0);
  assert.equal(await responseValid(cloze, clozeResponse({ accented: 'cafe\u0301' })), true, 'partial cloze values remain saveable');
  assert.equal(await earned(cloze, clozeKey, clozeResponse({ accented: 'cafe\u0301' })), 0);
  assert.equal(await responseValid(cloze, clozeResponse({ unknown: 'x' })), false);
  assert.equal(await responseValid(cloze, clozeResponse({ accented: 'x'.repeat(17) })), false);

  const scalar = { ...cloze, fields: [{ id: 'symbol', label: 'Symbol' }], maxLength: 1 };
  const scalarKey = { type: 'CLOZE', acceptedValues: { symbol: ['😀'] } };
  assert.equal(await responseValid(scalar, clozeResponse({ symbol: '😀' })), true, 'maxLength counts Unicode scalar values');
  assert.equal(await earned(scalar, scalarKey, clozeResponse({ symbol: '😀' })), 1);

  const matching = {
    type: 'MATCHING',
    rows: [{ id: 'r1', label: 'First row' }, { id: 'r2', label: 'Second row' }, { id: 'r3', label: 'Third row' }],
    targets: [{ id: 't1', label: 'First target', maxUses: 2 }, { id: 't2', label: 'Second target', maxUses: 1 }],
  };
  const matchingKey = { type: 'MATCHING', answers: { r1: 't1', r2: 't1', r3: 't2' } };
  const matchingResponse = (assignments) => ({ type: 'MATCHING', assignments });
  assert.equal(await responseValid(matching, matchingResponse({ r1: 't1' })), true, 'partial matching rows remain saveable');
  assert.equal(await earned(matching, matchingKey, matchingResponse({ r1: 't1' })), 0);
  assert.equal(await earned(matching, matchingKey, matchingResponse({ r1: 't1', r2: 't1', r3: 't2' })), 1);
  assert.equal(await earned(matching, matchingKey, matchingResponse({ r1: 't2', r2: 't1', r3: 't1' })), 0);
  assert.equal(await responseValid(matching, matchingResponse({ unknown: 't1' })), false);
  assert.equal(await responseValid(matching, matchingResponse({ r1: 'unknown' })), false);
  assert.equal(await responseValid(matching, matchingResponse({ r1: 't1', r2: 't1', r3: 't1' })), false);
  await assert.rejects(earned(matching, { type: 'MATCHING', answers: { r1: 't1', r2: 't1', r3: 't1' } }, matchingResponse({})), { code: '22023' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = (await client.query('SELECT user_id::text AS id FROM tsa.attempts WHERE id=$1', [legacyAttemptId])).rows[0].id;
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [userId]);
    await client.query("SELECT set_config('tsa.enable_cloze_matching','true',true)");
    assert.equal((await client.query('SELECT tsa_private.attempt_protocol_allowed($1) AS allowed', [legacyAttemptId])).rows[0].allowed, false,
      'v4 context does not admit an existing v1 attempt');
    await client.query("SELECT set_config('tsa.enable_cloze_matching','false',true)");
    assert.equal((await client.query('SELECT tsa_private.attempt_protocol_allowed($1) AS allowed', [legacyAttemptId])).rows[0].allowed, true,
      'legacy context retains v1 attempt access');
    assert.equal((await client.query('SELECT tsa_private.attempt_api_root() AS root')).rows[0].root, '/api/v1/attempts');
    await client.query("SELECT set_config('tsa.enable_numeric_practice','true',true)");
    assert.equal((await client.query('SELECT tsa_private.attempt_api_root() AS root')).rows[0].root, '/api/v2/attempts');
    await client.query("SELECT set_config('tsa.enable_cloze_matching','true',true)");
    assert.equal((await client.query('SELECT tsa_private.attempt_api_root() AS root')).rows[0].root, '/api/v4/attempts');
    await client.query("SELECT set_config('tsa.enable_full_simulation','true',true)");
    assert.equal((await client.query('SELECT tsa_private.attempt_api_root() AS root')).rows[0].root, '/api/v3/attempts',
      'simulation route precedence is preserved');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

test('cloze/matching upgrade preserves populated v1 rows, security and saved answers; rollback and replay are inert', { timeout: 60000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'tsa-cloze-matching-upgrade-')); let f;
  t.after(async () => { try { await f?.close(); } finally { await rm(root, { recursive: true, force: true }); } });
  const old = path.join(root,'old'), failed = path.join(root,'failed'), target = path.join(root,'target');
  const source = fileURLToPath(new URL('../../../db/migrations/',import.meta.url));
  for (const directory of [old,failed,target]) await mkdir(directory);
  for (const name of await readdir(source)) if (/^\d{3}_.+\.sql$/.test(name) && name <= migration) {
    await copyFile(path.join(source,name),path.join(target,name));
    if (name !== migration) for (const directory of [old,failed]) await copyFile(path.join(source,name),path.join(directory,name));
  }
  f = await createAllocationFixture({ questionCount: 4, migrationDirectory: old });
  const rate = { capacity:100, refillPerSecond:10 }, principal = f.principals.studentA;
  const attempts = createAttemptService({ examPool:f.examPool,identityService:f.identityService,createRate:rate,saveRate:{user:rate,attempt:rate} });
  const key = randomUUID(), input = { blueprintVersionId:f.blueprint.versionId };
  const created = await attempts.create(principal,key,input), id=created.body.attemptId;
  await attempts.start(principal,id,randomUUID());
  const view = await attempts.read(principal,id);
  await attempts.save(principal,id,view.slots[0].slotId,randomUUID(),{expectedRevision:0,value:{type:'SINGLE_CHOICE',optionId:'a'}});
  const numericQuestions=await createQuestionService({bankPool:f.bankPool,identityService:f.identityService,enableNumericQuestions:true});
  const numericTemplate=createPrivateTemplate(f.source);
  const numericDraft=(await numericQuestions.createQuestionDraft(f.principals.author,randomUUID(),{
    schemaVersion:'question/2',language:'vi-VN',section:'READING',taxonomyVersionId:numericTemplate.taxonomyVersionId,
    domainId:numericTemplate.domainId,skillIds:numericTemplate.skillIds,subskillIds:[],cognitiveLevel:null,targetDifficulty:'EASY',
    content:[{type:'text',text:`Synthetic q2 preservation item ${randomUUID()}`}],
    interaction:{type:'NUMERIC_RESPONSE',label:'Numeric preservation input',format:'DECIMAL'},
    answerKey:{type:'NUMERIC_RESPONSE',value:'12.34'},explanation:[{type:'text',text:'Synthetic private explanation.'}],
    stimulusVersionId:null,evidenceRefs:numericTemplate.evidenceRefs,origin:'MANUAL',provenance:numericTemplate.provenance,
  })).body;
  const q2Before=(await f.pool.query(`SELECT qv.schema_version,qv.content_hash,qs.scoring_policy_version,qs.answer_key
    FROM tsa.question_versions qv JOIN tsa_private.question_secrets qs ON qs.question_version_id=qv.id WHERE qv.id=$1`,[numericDraft.versionId])).rows[0];
  assert.deepEqual(q2Before,{schema_version:'question/2',content_hash:numericDraft.contentHash,
    scoring_policy_version:'practice-binary-v2',answer_key:{type:'NUMERIC_RESPONSE',value:'12.34'}});
  const before = await snapshot(f.pool), saved = await attempts.read(principal,id);
  const sql = await readFile(path.join(source,migration),'utf8');
  await writeFile(path.join(failed,migration),sql+'\nSELECT 1/0;\n');
  const connectionConfig = f.harness.database.connectionConfig;
  await backupLocalDatabase({connectionConfig,directory:path.join(root,'before-rollback')});
  await assert.rejects(migrate(f.pool,{directory:failed}),/division by zero/);
  assert.deepEqual(await snapshot(f.pool),before);
  await backupLocalDatabase({connectionConfig,directory:path.join(root,'before-upgrade')});
  assert.deepEqual((await migrate(f.pool,{directory:target})).applied,[migration]);
  await assertSqlProtocols(f.pool,id);
  const after=await snapshot(f.pool); assertPreserved(before,after);
  assert.deepEqual((await f.pool.query(`SELECT qv.schema_version,qv.content_hash,qs.scoring_policy_version,qs.answer_key
    FROM tsa.question_versions qv JOIN tsa_private.question_secrets qs ON qs.question_version_id=qv.id WHERE qv.id=$1`,[numericDraft.versionId])).rows[0],q2Before);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa_private.cloze_matching_profiles')).rows[0].n,0);
  const resumed=await attempts.read(principal,id);
  for (const field of ['startedAt','deadlineAt','answers','slots']) assert.deepEqual(resumed[field],saved[field]);
  assert.equal((await attempts.create(principal,key,input)).body.attemptId,id);
  assert.deepEqual((await migrate(f.pool,{directory:target})).applied,[]);
  assert.deepEqual(await snapshot(f.pool),after);
  for (const role of ['tsa_exam','tsa_bank','tsa_exam_worker','tsa_web','tsa_identity','tsa_factory']) {
    const access=(await f.pool.query("SELECT has_table_privilege($1,'tsa_private.cloze_matching_profiles','SELECT,INSERT,UPDATE,DELETE') AS raw, has_function_privilege($1,'tsa.exam_cloze_matching_catalog_page(integer,uuid)','EXECUTE') AS catalog, has_function_privilege($1,'tsa_private.cloze_answer_key_valid(jsonb,jsonb)','EXECUTE') AS private_key_validator",[role])).rows[0];
    assert.deepEqual(access,{raw:false,catalog:role==='tsa_exam',private_key_validator:role==='tsa_exam_worker'},role);
  }
});
