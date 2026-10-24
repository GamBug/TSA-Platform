import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { request as httpRequest } from 'node:http';
import { createReviewBrowserFixture } from './review-browser-fixture.mjs';
import { bankRequest, loginActor, createBankHarness } from './harness.mjs';
import { createReviewContextService } from '../../../src/modules/bank/review-context.mjs';
import { createBankHandler } from '../../../src/http/bank.mjs';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createDatabasePool, withTransaction } from '../../../src/modules/database/pool.mjs';
import { inspectionImportPackage } from './review-import-fixture.mjs';
import { createFactoryImportService } from '../../../src/modules/bank/factory-import.mjs';
import { createDatasetPreflightService } from '../../../src/modules/bank/dataset-preflight-service.mjs';
import { createStaffDatasetPreflightService } from '../../../src/modules/bank/staff-dataset-preflight.mjs';
import { createReviewHistoryService } from '../../../src/modules/bank/review-history.mjs';
import { createReviewEvidenceService } from '../../../src/modules/bank/review-evidence.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { createEquivalenceService } from '../../../src/modules/bank/equivalence.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createSharedReadingFixture } from '../student-runtime/shared-reading-fixture.mjs';
import { StaffRejectReviewResponseSchema, StaffQuarantineResponseSchema, StaffSubmitReviewResponseSchema, StaffDatasetPreflightSchema, StaffReviewHistorySchema, StaffReviewEvidenceSchema, StaffReviewContextSchema } from '../../../packages/contracts/dist/staff.js';

let f, pool, author, reviewer, manager, candidate, examManager;
const historyPath = (id) => `/api/v1/question-versions/${id}/review-history`;
const evidencePath = (id) => `/api/v1/question-versions/${id}/review-evidence`;
const pathFor = (id) => `/api/v1/question-versions/${id}/review-context`;
const principal = (browser) => f.identity.authenticate(new Request(f.origin, { headers: { cookie: browser.cookies.join('; ') } }));
async function success(response, status = 200) {
  assert.equal(response.status, status, `Expected status ${status}, got ${response.status}`);
  const payload = await response.json();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  if (status === 200) return (payload.schemaVersion === 'staff-dataset-preflight/1' ? StaffDatasetPreflightSchema : payload.schemaVersion === 'staff-review-history/1' ? StaffReviewHistorySchema : payload.schemaVersion === 'staff-review-evidence/1' ? StaffReviewEvidenceSchema : StaffReviewContextSchema).parse(payload);
  assert.deepEqual(Object.keys(payload), ['error']);
  assert.deepEqual(Object.keys(payload.error).sort(), ['code','details','message','requestId']);
  assert.deepEqual(payload.error.details, {});
  assert.equal(response.headers.get('x-request-id'), payload.error.requestId);
  return payload;
}
async function createDraft({ source = f.fixture.source, ...overrides } = {}) {
  const body = { ...f.template, content: [{ type: 'text', text: `Câu hỏi tổng hợp riêng ${randomUUID()}` }],
    evidenceRefs: [source.decisionId], provenance: [{ sourceVersionId: source.sourceVersionId, span: null, transformation: 'Original isolated inspection fixture' }],
    ...overrides };
  const response = await bankRequest(f, author, '/api/v1/questions', { method: 'POST', key: randomUUID(), body });
  assert.equal(response.status, 201);
  return response.json();
}
async function grant(source, { status = 'OWNED', allowedUses = ['DISPLAY','ADAPT'], territory = ['VN'], validFrom = '2000-01-01T00:00:00Z', validTo = null, evidence = 'Isolated synthetic inspection fixture, not qualified legal evidence.' } = {}) {
  const current = (await pool.query('SELECT revision FROM tsa.source_rights WHERE source_version_id=$1', [source.sourceVersionId])).rows[0];
  const response = await bankRequest(f, manager, `/api/v1/source-versions/${source.sourceVersionId}/rights`, {
    method: 'POST', key: randomUUID(), body: { status, allowedUses, territory, validFrom, validTo,
      evidence, expectedRevision: Number(current?.revision ?? 0) },
  });
  assert.equal(response.status, 201);
  return response.json();
}
async function databaseSnapshot() {
  const tables = await pool.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_schema IN ('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY table_schema,table_name`);
  const result = {};
  for (const row of tables.rows) {
    assert.match(row.table_name, /^[a-z_]+$/);
    const data = (await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS rows
      FROM (SELECT to_jsonb(t) AS value FROM "${row.table_schema}"."${row.table_name}" t) s`)).rows[0].rows;
    result[`${row.table_schema}.${row.table_name}`] = { count: data.length, hash: createHash('sha256').update(JSON.stringify(data)).digest('hex') };
  }
  return result;
}

before(async () => {
  f = await createReviewBrowserFixture(); pool = f.fixture.pool;
  [author,reviewer,manager,candidate,examManager] = await Promise.all(['author','reviewer','bankManager','studentA','examManager'].map((actor) => loginActor(f,actor)));
}, { timeout: 30_000 });
after(async () => { await f?.close(); });

test('B1 real HTTP returns exact private typed previews, blocks unsafe content and performs zero application writes', async () => {
  const before = await databaseSnapshot();
  for (const [index, draft] of f.questions.entries()) {
    const response = await bankRequest(f, author, pathFor(draft.versionId));
    const value = await success(response);
    assert.equal(value.accessBasis, 'AUTHOR_OWN');
    assert.equal(value.version.versionId, draft.versionId);
    assert.equal(value.version.contentHash, draft.contentHash);
    assert.equal(value.workflow.revision, 1);
    assert.equal(value.rightsEvidenceIncluded, false);
    assert.equal(value.publicationEligibility, 'NOT_EVALUATED');
    assert.equal(value.sources.length, 1);
    if (index < 3) {
      assert.equal(value.preview.status, 'AVAILABLE');
      assert.equal(value.preview.question.interaction.type, ['SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP'][index]);
      assert.ok(value.preview.question.explanation.length > 0);
    } else {
      assert.deepEqual(value.preview, { status: 'BLOCKED', reason: 'CONTENT_UNSUPPORTED' });
    }
    assert.doesNotMatch(JSON.stringify(value), /reference_namespace|producer_namespace|onerror|object_key|decided_by|Synthetic local fixture/);
  }
  const own = await success(await bankRequest(f, manager, pathFor(f.questions[0].versionId)));
  assert.equal(own.accessBasis, 'BANK_MANAGER');
  const denied = await success(await bankRequest(f, candidate, pathFor(f.questions[0].versionId)),403);
  assert.equal(denied.error.code,'FORBIDDEN');
  assert.deepEqual(await databaseSnapshot(),before);
});

test('B1 HTTP auth/role/object/Origin validation rejects before private data and preserves error request IDs', async () => {
  const id = f.questions[0].versionId;
  assert.equal((await success(await fetch(f.origin+pathFor(id)),401)).error.code,'UNAUTHENTICATED');
  for (const browser of [candidate,examManager]) {
    for (const version of [id,randomUUID(),'not-a-uuid']) {
      assert.equal((await success(await bankRequest(f,browser,pathFor(version)),403)).error.code,'FORBIDDEN');
    }
  }
  for (const version of [id,randomUUID(),'not-a-uuid']) {
    assert.equal((await success(await bankRequest(f,reviewer,pathFor(version)),404)).error.code,'NOT_FOUND');
  }
  assert.equal((await success(await bankRequest(f,author,pathFor(id)+'?actorId='+randomUUID()),422)).error.code,'VALIDATION_ERROR');
  const origin = await fetch(f.origin+pathFor(id), { headers: { origin:'https://invalid.example',cookie:author.cookies.join('; ') } });
  assert.equal((await success(origin,403)).error.code,'FORBIDDEN');
  const withBody=await new Promise((resolve,reject)=>{
    const request=httpRequest(f.origin+pathFor(id),{method:'GET',headers:{origin:f.origin,cookie:author.cookies.join('; '),'content-length':'2'}},(response)=>{
      let text='';response.setEncoding('utf8');response.on('data',(chunk)=>{text+=chunk;});
      response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(text),headers:response.headers}));
    });request.on('error',reject);request.end('{}');
  });
  assert.equal(withBody.status,422);assert.equal(withBody.body.error.code,'VALIDATION_ERROR');
  assert.equal(withBody.headers['x-request-id'],withBody.body.error.requestId);
  assert.equal((await success(await bankRequest(f,author,pathFor(id),{method:'POST',body:{},key:randomUUID()}),404)).error.code,'NOT_FOUND');
});

test('B1 current independent queue access and current-role precedence never infer ownership from historical roles', async () => {
  const draft = await createDraft();
  const authorPrincipal = await principal(author), reviewerPrincipal = await principal(reviewer);
  await f.fixture.workflow.submitReview(authorPrincipal,draft.versionId,randomUUID(),{expectedRevision:1});
  const queued = await success(await bankRequest(f,reviewer,pathFor(draft.versionId)));
  assert.equal(queued.accessBasis,'REVIEW_QUEUE');
  assert.equal(queued.workflow.state,'IN_REVIEW');
  await pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'REVIEWER'),($1,'BANK_MANAGER')",[authorPrincipal.userId]);
  try {
    assert.equal((await success(await bankRequest(f,author,pathFor(draft.versionId)))).accessBasis,'BANK_MANAGER');
    await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role IN ('AUTHOR','BANK_MANAGER')",[authorPrincipal.userId]);
    assert.equal((await success(await bankRequest(f,author,pathFor(draft.versionId)),404)).error.code,'NOT_FOUND');
  } finally {
    await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role IN ('REVIEWER','BANK_MANAGER')",[authorPrincipal.userId]);
    await pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'AUTHOR') ON CONFLICT DO NOTHING",[authorPrincipal.userId]);
  }
  await f.fixture.workflow.review(reviewerPrincipal,draft.versionId,randomUUID(),{ expectedRevision:2,contentHash:draft.contentHash,
    decision:'REJECT',rubric:{correctness:false,unambiguous:true,relevant:true,language:true,explanation:true,rights:true},reason:'Synthetic review queue transition, not qualified human review.' });
  assert.equal((await success(await bankRequest(f,reviewer,pathFor(draft.versionId)),404)).error.code,'NOT_FOUND');
});

test('B1 source rights unknown/revoked/future/expired/territory/uses/attestor changes gate every staff role and preserve authored hash', async () => {
  const source = await f.fixture.registerSource();
  const draft = await createDraft({source});
  for (const change of [
    {status:'UNKNOWN'}, {status:'REVOKED'}, {allowedUses:['ADAPT']}, {territory:['US']},
    {validFrom:'2999-01-01T00:00:00Z'}, {validTo:'2001-01-01T00:00:00Z'},
  ]) {
    await grant(source,change);
    for (const browser of [author,manager]) {
      const value=await success(await bankRequest(f,browser,pathFor(draft.versionId)));
      assert.deepEqual(value.preview,{status:'BLOCKED',reason:'RIGHTS_BLOCKED'});
      assert.equal(value.version.contentHash,draft.contentHash);
      assert.equal(Object.hasOwn(value.preview,'question'),false);
    }
  }
  await grant(source);
  const managerId=f.fixture.principals.bankManager.userId;
  await pool.query('UPDATE tsa.users SET disabled_at=clock_timestamp() WHERE id=$1',[managerId]);
  try {
    assert.deepEqual((await success(await bankRequest(f,author,pathFor(draft.versionId)))).preview,{status:'BLOCKED',reason:'RIGHTS_BLOCKED'});
  } finally { await pool.query('UPDATE tsa.users SET disabled_at=NULL WHERE id=$1',[managerId]); }
  assert.equal((await success(await bankRequest(f,author,pathFor(draft.versionId)))).preview.status,'AVAILABLE');
  await pool.query('DELETE FROM tsa.source_rights WHERE source_version_id=$1',[source.sourceVersionId]);
  const missing=await success(await bankRequest(f,author,pathFor(draft.versionId)));
  assert.equal(missing.sources[0].currentRights,null);
  assert.deepEqual(missing.preview,{status:'BLOCKED',reason:'RIGHTS_BLOCKED'});
});

test('B1 held workflow blocks precede adverse rights without rewriting immutable content', async () => {
  const source=await f.fixture.registerSource(),draft=await createDraft({source});
  await f.fixture.workflow.quarantine(await principal(manager),draft.versionId,randomUUID(),{expectedRevision:1,reason:'Synthetic inspection hold.'});
  await grant(source,{status:'REVOKED'});
  const value=await success(await bankRequest(f,author,pathFor(draft.versionId)));
  assert.equal(value.workflow.state,'QUARANTINED');
  assert.deepEqual(value.preview,{status:'BLOCKED',reason:'WORKFLOW_HELD'});
  assert.equal(value.version.contentHash,draft.contentHash);
});

test('B1 snapshot remains consistent across a barrier-controlled rights revocation; next HTTP read applies it', async () => {
  const source=await f.fixture.registerSource(),draft=await createDraft({source});
  let reached,release;
  const barrier=new Promise((resolve)=>{reached=resolve;});
  const gate=new Promise((resolve)=>{release=resolve;});
  const bankPool={query:(...args)=>f.fixture.bankPool.query(...args),async connect(){
    const client=await f.fixture.bankPool.connect();
    return {release:(...args)=>client.release(...args),async query(sql,params){
      const result=await client.query(sql,params);
      if(sql.includes('SELECT qv.*, w.state')){reached();await gate;}
      return result;
    }};
  }};
  const service=await createReviewContextService({bankPool,identityService:f.identity});
  const pending=service.read(await principal(author),draft.versionId);
  try {
    await Promise.race([barrier,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Snapshot barrier not reached')),5000))]);
    await grant(source,{status:'REVOKED'});
  } finally {release();}
  assert.equal((await pending).preview.status,'AVAILABLE');
  assert.deepEqual((await success(await bankRequest(f,author,pathFor(draft.versionId)))).preview,{status:'BLOCKED',reason:'RIGHTS_BLOCKED'});
});

test('B1 private route is disabled by default and absent from mock-only serving', async () => {
  const harness=await createBankHarness();
  try {
    const browser=await loginActor(harness,'author');
    assert.equal((await success(await bankRequest(harness,browser,pathFor(f.questions[0].versionId)),404)).error.code,'NOT_FOUND');
    const handler=await createBankHandler({bankPool:harness.bankPool,identityService:harness.identity,trustedOrigin:harness.origin});
    assert.equal((await handler(new Request(harness.origin+pathFor(randomUUID()),{headers:{cookie:browser.cookies.join('; ')}}))).status,404);
  } finally {await harness.close();}
});

test('B1 corrupted immutable reference storage produces only a safe503 without private content or query details', async () => {
  const draft=await createDraft();
  const row=(await pool.query('SELECT reference_namespace FROM tsa.question_versions WHERE id=$1',[draft.versionId])).rows[0];
  await pool.query('ALTER TABLE tsa_private.reference_nodes DISABLE TRIGGER reference_nodes_immutable');
  try {
    await pool.query("UPDATE tsa_private.reference_nodes SET content_hash=$1 WHERE reference_namespace=$2 AND kind='question' AND id=$3",['sha256:'+'0'.repeat(64),row.reference_namespace,draft.versionId]);
  } finally {await pool.query('ALTER TABLE tsa_private.reference_nodes ENABLE TRIGGER reference_nodes_immutable');}
  const before=await databaseSnapshot();
  const value=await success(await bankRequest(f,author,pathFor(draft.versionId)),503);
  assert.equal(value.error.code,'TEMPORARILY_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(value),/reference_nodes|reference_namespace|SELECT|answerKey|explanation|contentHash/);
  assert.deepEqual(await databaseSnapshot(),before);
});

test('B1 authorship Boolean probe has null/missing/foreign/ambiguity guards and no raw audit access', async () => {
  const draft=await createDraft(),authorId=f.fixture.principals.author.userId,otherId=f.fixture.principals.reviewer.userId;
  await withTransaction(f.fixture.bankPool,async(client)=>{
    for(const [id,actor,expected] of [[draft.versionId,authorId,true],[draft.versionId,otherId,false],[randomUUID(),authorId,false],[null,authorId,false],[draft.versionId,null,false]]){
      assert.equal((await client.query('SELECT tsa.bank_local_version_authored_by($1,$2) AS allowed',[id,actor])).rows[0].allowed,expected);
    }
  },{role:'tsa_bank'});
  await assert.rejects(withTransaction(f.fixture.bankPool,(client)=>client.query('SELECT * FROM tsa.audit_events LIMIT 0'),{role:'tsa_bank'}),{code:'42501'});
  for(const role of ['tsa_web','tsa_exam','tsa_exam_worker','tsa_identity','tsa_factory']){
    const row=(await pool.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,'tsa.bank_local_version_authored_by(uuid,uuid)'])).rows[0];
    assert.equal(row.allowed,false,role);
  }
  const settings=(await pool.query("SELECT p.provolatile,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid='tsa.bank_local_version_authored_by(uuid,uuid)'::regprocedure")).rows[0];
  assert.equal(settings.provolatile,'s');assert.equal(settings.prosecdef,true);assert.deepEqual(settings.proconfig,['search_path=pg_catalog, tsa']);
  await pool.query("INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id) VALUES($1,$2,'QUESTION_DRAFT_CREATED','question_version',$3)",[randomUUID(),otherId,draft.versionId]);
  assert.equal((await f.fixture.bankPool.query('SELECT tsa.bank_local_version_authored_by($1,$2) AS allowed',[draft.versionId,authorId])).rows[0].allowed,false);
  assert.equal((await success(await bankRequest(f,author,pathFor(draft.versionId)),404)).error.code,'NOT_FOUND');
});


test('B1 opaque Factory source/stimulus/parent closure is verified without granting imported creator ownership', async (t) => {
  const capability=Object.freeze({});
  const service=await createFactoryImportService({bankPool:f.fixture.bankPool,identityService:f.identity,internalCapability:capability});
  const creatorId=f.fixture.principals.studentB.userId;
  const operatorId=f.fixture.principals.author.userId;
  const pkg=await inspectionImportPackage(pool,creatorId);
  const receipt=await service.importFactoryPackageV2(await principal(author),pkg,capability);
  assert.equal(receipt.receipts.length,1);
  const versionId=pkg.candidates[0].question.id;
  assert.equal((await success(await bankRequest(f,author,pathFor(versionId)),404)).error.code,'NOT_FOUND');
  await pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'AUTHOR')",[creatorId]);
  t.after(async()=>{
    await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='AUTHOR'",[creatorId]);
    await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='REVIEWER'",[operatorId]);
  });
  const claimedCreator=await loginActor(f,'studentB');
  assert.equal((await success(await bankRequest(f,claimedCreator,pathFor(versionId)),404)).error.code,'NOT_FOUND','imported creator UUID plus current AUTHOR does not establish trusted local creation');
  const blocked=await success(await bankRequest(f,manager,pathFor(versionId)));
  assert.equal(blocked.accessBasis,'BANK_MANAGER');
  assert.equal(blocked.sources.length,3,'parent-only and stimulus-only provenance participate');
  assert.equal(blocked.sources.every((source)=>source.currentRights===null),true,'imported rights claims never become current grants');
  const initialEvidence=await success(await bankRequest(f,manager,evidencePath(versionId)));
  assert.deepEqual(initialEvidence.sources.map((source)=>source.sourceVersionId),blocked.sources.map((source)=>source.sourceVersionId));
  assert.equal(initialEvidence.sources.every((source)=>source.currentDecision===null),true);
  assert.deepEqual(blocked.preview,{status:'BLOCKED',reason:'RIGHTS_BLOCKED'});
  for(const source of blocked.sources)await grant(source,{allowedUses:['DISPLAY']});
  assert.deepEqual((await success(await bankRequest(f,manager,pathFor(versionId)))).preview,{status:'BLOCKED',reason:'RIGHTS_BLOCKED'},'GENERATED requires GENERATE in addition to DISPLAY');
  for(const source of blocked.sources)await grant(source,{allowedUses:['DISPLAY','GENERATE']});
  const before=await databaseSnapshot();
  const available=await success(await bankRequest(f,manager,pathFor(versionId)));
  assert.equal(available.preview.status,'AVAILABLE');
  assert.equal(available.version.contentHash,pkg.candidates[0].question.contentHash);
  assert.equal(available.preview.question.stimulus.content[0].text,'Synthetic shared context.');
  assert.notEqual(available.preview.question.stimulus.versionId,pkg.candidates[0].question.stimulusVersionId,'opaque stimulus uses exact local mapping');
  assert.deepEqual(await databaseSnapshot(),before);
  await f.fixture.workflow.submitReview(await principal(claimedCreator),versionId,randomUUID(),{expectedRevision:1});
  await pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'REVIEWER')",[operatorId]);
  assert.equal((await success(await bankRequest(f,author,pathFor(versionId)),404)).error.code,'NOT_FOUND','a queued imported candidate remains unavailable to its import operator through REVIEW_QUEUE');
  const childResponse=await bankRequest(f,author,`/api/v1/questions/${pkg.candidates[0].question.questionId}/versions`,{
    method:'POST',key:randomUUID(),body:{parentVersionId:versionId,draft:{...f.template,content:[{type:'text',text:'Bản sửa tổng hợp từ bản nhập; không phải rà soát người thật.'}]}}
  });
  assert.equal(childResponse.status,201);
  const child=await childResponse.json();
  const childView=await success(await bankRequest(f,author,pathFor(child.versionId)));
  const childEvidence=await success(await bankRequest(f,manager,evidencePath(child.versionId)));
  assert.equal(childEvidence.sources.length,4);
  await success(await bankRequest(f,author,evidencePath(versionId)),404);
  assert.equal(childView.accessBasis,'AUTHOR_OWN');
  assert.equal(childView.preview.status,'AVAILABLE');
  assert.equal(childView.preview.question.stimulus,null);
  assert.equal(childView.sources.length,4,'manual source plus all imported ancestor/stimulus sources remain rights dependencies');
  await grant(blocked.sources[1],{status:'REVOKED',allowedUses:['DISPLAY','GENERATE']});
  assert.deepEqual((await success(await bankRequest(f,manager,pathFor(versionId)))).preview,{status:'BLOCKED',reason:'RIGHTS_BLOCKED'});
  assert.deepEqual((await success(await bankRequest(f,author,pathFor(child.versionId)))).preview,{status:'BLOCKED',reason:'RIGHTS_BLOCKED'});
});


test('B1 source-count and serialized-response bounds fail closed through actual HTTP without partial preview', {timeout:30000}, async () => {
  const sources=[];
  for(let index=0;index<101;index++)sources.push(await f.fixture.registerSource());
  const oversized=await createDraft({evidenceRefs:sources.map((source)=>source.decisionId),
    provenance:sources.map((source)=>({sourceVersionId:source.sourceVersionId,span:null,transformation:'Original synthetic source bound fixture'}))});
  const countError=await success(await bankRequest(f,author,pathFor(oversized.versionId)),503);
  assert.equal(countError.error.code,'TEMPORARILY_UNAVAILABLE');
  await success(await bankRequest(f,manager,evidencePath(oversized.versionId)),503);
  const two=await createDraft({evidenceRefs:sources.slice(0,2).map((source)=>source.decisionId),
    provenance:sources.slice(0,2).map((source)=>({sourceVersionId:source.sourceVersionId,span:null,transformation:'Original synthetic response byte bound'}))});
  for(const source of sources.slice(0,2))await grant(source,{territory:['VN','r'.repeat(600000)]});
  const bytesError=await success(await bankRequest(f,author,pathFor(two.versionId)),503);
  assert.equal(bytesError.error.code,'TEMPORARILY_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(bytesError),/answerKey|explanation|sourceVersionId|rrrrrrrr/);
});

test('B1 private staff inspection is not composed into the ordinary student runtime', async () => {
  const login='inspection_worker_'+randomUUID().replaceAll('-','');
  await pool.query(`CREATE ROLE ${login} LOGIN`);await pool.query(`GRANT tsa_exam_worker TO ${login}`);
  const workerPool=createDatabasePool({...f.fixture.harness.database.connectionConfig,user:login});
  let runtime;
  try {
    const rate={capacity:100,refillPerSecond:10};
    runtime=await createStudentRuntime({identityPool:f.fixture.harness.authPool,examPool:f.fixture.examPool,workerPool,
      env:{NODE_ENV:'test',LOCAL_SYNTHETIC_ONLY:'true'},port:0,pollMilliseconds:100,sweepBatchSize:10,executorId:'b1-student-exclusion',leaseSeconds:30,retrySeconds:1,createRate:rate,saveRate:{user:rate,attempt:rate}});
    for(const browser of [author,candidate]) for (const targetPath of [pathFor, evidencePath]) {
      const response=await fetch(runtime.origin+targetPath(f.questions[0].versionId),{headers:{cookie:browser.cookies.join('; '),origin:runtime.origin}});
      assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/answerKey|explanation|contentHash/);
    }
  } finally {
    const errors=[];
    for(const stop of [()=>runtime?.close(),()=>workerPool.end()]){try{await stop();}catch(error){errors.push(error);}}
    if(errors.length)throw new AggregateError(errors,'Student exclusion cleanup failed');
  }
});


test('B2 exact current evidence is verbatim, strictly projected and read-only while B1 never includes it', async () => {
  const before = await databaseSnapshot();
  const value = await success(await bankRequest(f,manager,evidencePath(f.questions[0].versionId)));
  assert.equal(value.accessBasis,'BANK_MANAGER');
  assert.deepEqual(value.version,{versionId:f.questions[0].versionId,contentHash:f.questions[0].contentHash,workflowRevision:1});
  assert.equal(value.sources.length,1);
  assert.equal(value.sources[0].currentDecision.revision,2);
  assert.deepEqual(value.sources[0].currentDecision.recordedEvidence,{state:'TEXT_AVAILABLE',text:f.evidenceText});
  assert.equal(value.qualification,'NOT_ATTESTED_BY_PLATFORM');
  assert.equal(value.publicationEligibility,'NOT_EVALUATED');
  const b1=await success(await bankRequest(f,manager,pathFor(f.questions[0].versionId)));
  assert.equal(b1.rightsEvidenceIncluded,false);
  assert.equal(JSON.stringify(b1).includes(f.evidenceText),false);
  assert.doesNotMatch(JSON.stringify(value),/answerKey|explanation|provenanceIds|decided_by|producer_namespace|reference_namespace/);
  assert.deepEqual(await databaseSnapshot(),before);
});

test('B2 real HTTP denies authors/students before lookup and enforces Origin, GET-only, body/query, fixed errors and default opt-in', async () => {
  const id=f.questions[0].versionId;
  await success(await fetch(f.origin+evidencePath(id)),401);
  for(const browser of [author,candidate,examManager]) for(const target of [id,randomUUID(),'invalid']) {
    const value=await success(await bankRequest(f,browser,evidencePath(target)),403);
    assert.equal(value.error.code,'FORBIDDEN');
  }
  await success(await bankRequest(f,author,evidencePath(id)+'?unexpected=1'),403);
  for(const target of [randomUUID(),'invalid']) await success(await bankRequest(f,manager,evidencePath(target)),404);
  await success(await bankRequest(f,manager,evidencePath(id)+'?unexpected=1'),422);
  await success(await bankRequest(f,manager,evidencePath(id),{method:'POST',body:{},key:randomUUID()}),404);
  await success(await fetch(f.origin+evidencePath(id),{headers:{cookie:manager.cookies.join('; '),origin:'https://invalid.example'}}),403);
  const bodyResult=await new Promise((resolve,reject)=>{
    const request=httpRequest(f.origin+evidencePath(id),{method:'GET',headers:{origin:f.origin,cookie:manager.cookies.join('; '),'content-length':'2'}},(response)=>{
      let data='';response.setEncoding('utf8');response.on('data',(chunk)=>{data+=chunk;});
      response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(data),headers:response.headers}));
    }); request.on('error',reject);request.end('{}');
  });
  assert.equal(bodyResult.status,422);assert.deepEqual(bodyResult.body.error.details,{});
  assert.equal(bodyResult.headers['x-request-id'],bodyResult.body.error.requestId);
  const defaultHandler=await createBankHandler({bankPool:f.fixture.bankPool,identityService:f.identity,trustedOrigin:f.origin,enableReviewContext:true});
  assert.equal((await defaultHandler(new Request(f.origin+evidencePath(id),{headers:{cookie:manager.cookies.join('; ')}}))).status,404);
  const service=await createReviewEvidenceService({bankPool:f.fixture.bankPool,identityService:f.identity});
  await assert.rejects(service.read({...await principal(manager)},id),{status:403,code:'FORBIDDEN'});
});

test('B2 independent current REVIEWER only sees queued versions and mixed roles never grant author bypass', async () => {
  const draft=await createDraft();
  await success(await bankRequest(f,reviewer,evidencePath(draft.versionId)),404);
  await f.fixture.workflow.submitReview(await principal(author),draft.versionId,randomUUID(),{expectedRevision:1});
  assert.equal((await success(await bankRequest(f,reviewer,evidencePath(draft.versionId)))).accessBasis,'REVIEW_QUEUE');
  const authorId=f.fixture.principals.author.userId, reviewerId=f.fixture.principals.reviewer.userId;
  await pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'REVIEWER'),($1,'BANK_MANAGER')",[authorId]);
  try {
    assert.equal((await success(await bankRequest(f,author,evidencePath(draft.versionId)))).accessBasis,'BANK_MANAGER');
    await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='BANK_MANAGER'",[authorId]);
    await success(await bankRequest(f,author,evidencePath(draft.versionId)),404);
    await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='REVIEWER'",[reviewerId]);
    await success(await bankRequest(f,reviewer,evidencePath(draft.versionId)),403);
  } finally {
    await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role IN ('REVIEWER','BANK_MANAGER')",[authorId]);
    await pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'REVIEWER') ON CONFLICT DO NOTHING",[reviewerId]);
  }
  await f.fixture.workflow.quarantine(await principal(manager),draft.versionId,randomUUID(),{expectedRevision:2,reason:'Synthetic evidence queue hold.'});
  await success(await bankRequest(f,reviewer,evidencePath(draft.versionId)),404);
  assert.equal((await success(await bankRequest(f,manager,evidencePath(draft.versionId)))).version.workflowRevision,3);
});

test('B2 current revoked/unknown/held evidence remains investigable; legacy/missing pointers never fall back to old decisions', async () => {
  const source=await f.fixture.registerSource(),draft=await createDraft({source});
  let latest;
  for(const status of ['UNKNOWN','REVOKED']) {
    latest=await grant(source,{status,evidence:'  Synthetic current '+status+' claim https://invalid.example/current  '});
    const value=await success(await bankRequest(f,manager,evidencePath(draft.versionId)));
    assert.equal(value.sources[0].currentDecision.decisionId,latest.decisionId);
    assert.equal(value.sources[0].currentDecision.status,status);
    assert.equal(value.sources[0].currentDecision.recordedEvidence.text,'  Synthetic current '+status+' claim https://invalid.example/current  ');
    assert.equal((await success(await bankRequest(f,manager,pathFor(draft.versionId)))).preview.status,'BLOCKED');
  }
  await f.fixture.workflow.quarantine(await principal(manager),draft.versionId,randomUUID(),{expectedRevision:1,reason:'Synthetic evidence inspection hold.'});
  assert.equal((await success(await bankRequest(f,manager,evidencePath(draft.versionId)))).sources[0].currentDecision.decisionId,latest.decisionId);
  // Simulate valid legacy records with absent/non-string/blank text. No command
  // or read endpoint is given permission to rewrite immutable historical rows.
  await pool.query('ALTER TABLE tsa.rights_decisions DISABLE TRIGGER immutable_record');
  try {
    for(const evidence of [{},{text:42},{text:'   '}]) {
      await pool.query('UPDATE tsa.rights_decisions SET evidence=$1 WHERE id=$2',[JSON.stringify(evidence),latest.decisionId]);
      assert.deepEqual((await success(await bankRequest(f,manager,evidencePath(draft.versionId)))).sources[0].currentDecision.recordedEvidence,{state:'NOT_RECORDED'});
    }
  } finally {await pool.query('ALTER TABLE tsa.rights_decisions ENABLE TRIGGER immutable_record');}
  await pool.query('DELETE FROM tsa.source_rights WHERE source_version_id=$1',[source.sourceVersionId]);
  assert.equal((await success(await bankRequest(f,manager,evidencePath(draft.versionId)))).sources[0].currentDecision,null);
});

test('B2 observed decision/revision snapshot survives a concurrent revocation; next read returns current evidence', async () => {
  const source=await f.fixture.registerSource(),draft=await createDraft({source});
  let reached,release;
  const barrier=new Promise((resolve)=>{reached=resolve;}),gate=new Promise((resolve)=>{release=resolve;});
  const bankPool={query:(...args)=>f.fixture.bankPool.query(...args),async connect(){
    const client=await f.fixture.bankPool.connect();
    return {release:(...args)=>client.release(...args),async query(sql,params){
      const result=await client.query(sql,params);
      if(sql.includes('SELECT qv.*, w.state')){reached();await gate;}
      return result;
    }};
  }};
  const service=await createReviewEvidenceService({bankPool,identityService:f.identity});
  const before=await success(await bankRequest(f,manager,evidencePath(draft.versionId)));
  const pending=service.read(await principal(manager),draft.versionId);
  let latest;
  try {
    await Promise.race([barrier,new Promise((_,reject)=>setTimeout(()=>reject(new Error('B2 snapshot barrier not reached')),5000))]);
    latest=await grant(source,{status:'REVOKED',evidence:'New synthetic revocation text'});
  } finally {release();}
  const snapshot=await pending;
  assert.deepEqual(snapshot.sources,before.sources);
  const next=await success(await bankRequest(f,manager,evidencePath(draft.versionId)));
  assert.equal(next.sources[0].currentDecision.decisionId,latest.decisionId);
  assert.equal(next.sources[0].currentDecision.revision,before.sources[0].currentDecision.revision+1);
  assert.equal(next.sources[0].currentDecision.recordedEvidence.text,'New synthetic revocation text');
});

test('B2 actual READ ONLY transaction and corruption failure preserve all rows with private-safe errors', async () => {
  const draft=await createDraft();
  const guarded={query:(...args)=>f.fixture.bankPool.query(...args),async connect(){
    const client=await f.fixture.bankPool.connect();let checked=false;
    return {release:(...args)=>client.release(...args),async query(sql,params){
      const result=await client.query(sql,params);
      if(sql.includes('SELECT qv.*, w.state')&&!checked){checked=true;assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');}
      return result;
    }};
  }};
  const service=await createReviewEvidenceService({bankPool:guarded,identityService:f.identity});
  const before=await databaseSnapshot();
  await service.read(await principal(manager),draft.versionId);
  assert.deepEqual(await databaseSnapshot(),before);
  const row=(await pool.query('SELECT reference_namespace FROM tsa.question_versions WHERE id=$1',[draft.versionId])).rows[0];
  await pool.query('ALTER TABLE tsa_private.reference_nodes DISABLE TRIGGER reference_nodes_immutable');
  try {await pool.query("UPDATE tsa_private.reference_nodes SET content_hash=$1 WHERE reference_namespace=$2 AND kind='question' AND id=$3",['sha256:'+'0'.repeat(64),row.reference_namespace,draft.versionId]);}
  finally {await pool.query('ALTER TABLE tsa_private.reference_nodes ENABLE TRIGGER reference_nodes_immutable');}
  const corrupted=await databaseSnapshot();
  const error=await success(await bankRequest(f,manager,evidencePath(draft.versionId)),503);
  assert.doesNotMatch(JSON.stringify(error),/answerKey|explanation|reference_nodes|SELECT|sourceVersionId/);
  assert.deepEqual(await databaseSnapshot(),corrupted);
});


test('B2 JSON-escaped per-evidence and total serialized response bounds fail closed without truncation', {timeout:30000}, async () => {
  const sources=[];
  for(let index=0;index<18;index++) sources.push(await f.fixture.registerSource());
  const draft=await createDraft({evidenceRefs:sources.map((source)=>source.decisionId),
    provenance:sources.map((source)=>({sourceVersionId:source.sourceVersionId,span:null,transformation:'Original synthetic evidence byte bound fixture'}))});
  const one=await createDraft({source:sources[0]});
  await grant(sources[0],{evidence:'"'.repeat(35000)});
  const escapedError=await success(await bankRequest(f,manager,evidencePath(one.versionId)),503);
  assert.doesNotMatch(JSON.stringify(escapedError),/recordedEvidence|sourceVersionId/);
  for(const source of sources) await grant(source,{evidence:'e'.repeat(60000)});
  const totalError=await success(await bankRequest(f,manager,evidencePath(draft.versionId)),503);
  assert.doesNotMatch(JSON.stringify(totalError),/recordedEvidence|sourceVersionId|eeeeeee/);
});


const handoffPath = (id) => `/api/v1/question-versions/${id}/submit-review`;
async function handoff(browser, id, { expectedRevision = 1, key = randomUUID(), omitKey = false, ...options } = {}, status = 200) {
  const response=await bankRequest(f,browser,handoffPath(id),{method:'POST',key:omitKey?undefined:key,body:{expectedRevision},...options});
  if(status!==200) return success(response,status);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  return StaffSubmitReviewResponseSchema.parse(await response.json());
}

test('B3 HTTP handoff writes only expected workflow/validation/delivery/audit/receipt rows, same-key concurrency is exactly once, replay is historical', async () => {
  const draft=await createDraft();
  const inspected=await success(await bankRequest(f,author,pathFor(draft.versionId)));
  assert.equal(inspected.accessBasis,'AUTHOR_OWN');assert.equal(inspected.workflow.state,'DRAFT');
  const before=await databaseSnapshot(),key=randomUUID();
  const [first,second]=await Promise.all([handoff(author,draft.versionId,{key}),handoff(author,draft.versionId,{key})]);
  assert.deepEqual(first,{versionId:draft.versionId,state:'IN_REVIEW',revision:2});assert.deepEqual(second,first);
  const after=await databaseSnapshot();
  const changed=Object.keys(before).filter((table)=>before[table].hash!==after[table].hash).sort();
  assert.deepEqual(changed,[
    'tsa.audit_events','tsa.idempotency_records','tsa.question_workflow','tsa.validation_runs',
    'tsa_private.question_delivery_checks','tsa_private.question_source_dependencies',
  ].sort());
  for(const table of changed) assert.equal(after[table].count-before[table].count,table==='tsa.question_workflow'?0:1,table);
  await handoff(author,draft.versionId,{key,expectedRevision:2},409);
  assert.deepEqual(await databaseSnapshot(),after,'changed-key-body failure cannot mutate any application row');
  assert.equal((await success(await bankRequest(f,reviewer,evidencePath(draft.versionId)))).accessBasis,'REVIEW_QUEUE');
  await f.fixture.workflow.quarantine(await principal(manager),draft.versionId,randomUUID(),{expectedRevision:2,reason:'Synthetic B3 receipt/current-state distinction.'});
  const held=await databaseSnapshot();
  assert.deepEqual(await handoff(author,draft.versionId,{key}),first,'replay is the operation receipt even after workflow advances');
  assert.deepEqual(await databaseSnapshot(),held,'replayed receipt appends no extra validation/audit/cache/receipt rows');
  const current=await success(await bankRequest(f,author,pathFor(draft.versionId)));
  assert.equal(current.workflow.state,'QUARANTINED');assert.equal(current.workflow.revision,3);
  assert.equal(current.version.contentHash,draft.contentHash);
});

test('B3 real mutation boundary preserves Origin/CSRF/current roles and existing foreign-creator policy', async () => {
  const draft=await createDraft();
  const url=f.origin+handoffPath(draft.versionId);
  await success(await fetch(url,{method:'POST',headers:{origin:f.origin,'content-type':'application/json'},body:'{"expectedRevision":1}'}),401);
  await success(await fetch(url,{method:'POST',headers:{origin:f.origin,cookie:author.cookies.join('; '),'content-type':'application/json','idempotency-key':randomUUID()},body:'{"expectedRevision":1}'}),403);
  await success(await fetch(url,{method:'POST',headers:{origin:'https://invalid.example',cookie:author.cookies.join('; '),'x-csrf-token':author.csrf,'content-type':'application/json','idempotency-key':randomUUID()},body:'{"expectedRevision":1}'}),403);
  for(const browser of [candidate,reviewer,manager,examManager]) await handoff(browser,draft.versionId,{},403);
  const foreignAuthor=await loginActor(f,'authorReviewer');
  await handoff(foreignAuthor,draft.versionId,{},403);
  const authorId=f.fixture.principals.author.userId;
  await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='AUTHOR'",[authorId]);
  try {await handoff(author,draft.versionId,{},403);}
  finally {await pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'AUTHOR')",[authorId]);}
  const current=await success(await bankRequest(f,author,pathFor(draft.versionId)));
  assert.equal(current.workflow.state,'DRAFT');assert.equal(current.workflow.revision,1);
});

test('B3 actual HTTP malformed paths/query/body/keys and stale state remain private-safe and do not silently refresh revisions', async () => {
  const draft=await createDraft();
  await handoff(author,randomUUID(),{},404);
  await handoff(author,'not-a-uuid',{},404);
  const cases=[
    {omitKey:true}, {key:'contains space'}, {key:'k'.repeat(129)},
    {body:{expectedRevision:0}}, {body:{expectedRevision:1,actorId:randomUUID()}},
    {rawBody:'{',body:undefined}, {query:'unexpected=1'},
  ];
  for(const options of cases) await handoff(author,draft.versionId,options,options.rawBody?400:422);
  await handoff(author,draft.versionId,{expectedRevision:2},409);
  await handoff(author,draft.versionId);
  const conflict=await handoff(author,draft.versionId,{},409);
  assert.equal(conflict.error.code,'REVISION_CONFLICT');
  const stateConflict=await handoff(author,draft.versionId,{expectedRevision:2},409);
  assert.equal(stateConflict.error.code,'CONCURRENT_MODIFICATION');
  assert.doesNotMatch(JSON.stringify(stateConflict),/answerKey|explanation|provenance|SELECT|reference_namespace/);
});

test('B3 unsafe-content validation rolls back the entire command with no receipt, rights or publication mutation', async () => {
  const draft=f.questions[3],before=await databaseSnapshot();
  const error=await handoff(author,draft.versionId,{},422);
  assert.equal(error.error.code,'VALIDATION_ERROR');
  assert.deepEqual(await databaseSnapshot(),before);
  assert.equal((await success(await bankRequest(f,author,pathFor(draft.versionId)))).workflow.state,'DRAFT');
});

test('B3 UNKNOWN-rights author draft can enter queue without approving rights or exposing blocked content', async () => {
  const source=await f.fixture.registerSource();
  const draft=await createDraft({source});
  await grant(source,{status:'UNKNOWN',evidence:'Unverified synthetic B3 administrative claim.'});
  assert.equal((await success(await bankRequest(f,author,pathFor(draft.versionId)))).preview.reason,'RIGHTS_BLOCKED');
  const before=await databaseSnapshot();
  await handoff(author,draft.versionId);
  const after=await databaseSnapshot();
  for(const table of ['tsa.sources','tsa.source_versions','tsa.source_rights','tsa.rights_decisions','tsa.questions','tsa.reviews']) {
    assert.ok(before[table],table); assert.deepEqual(after[table],before[table],table);
  }
  const current=await success(await bankRequest(f,reviewer,pathFor(draft.versionId)));
  assert.equal(current.accessBasis,'REVIEW_QUEUE');assert.equal(current.workflow.state,'IN_REVIEW');
  assert.deepEqual(current.preview,{status:'BLOCKED',reason:'RIGHTS_BLOCKED'});
  const evidence=await success(await bankRequest(f,reviewer,evidencePath(draft.versionId)));
  assert.equal(evidence.sources[0].currentDecision.status,'UNKNOWN');
  assert.equal(evidence.sources[0].currentDecision.recordedEvidence.text,'Unverified synthetic B3 administrative claim.');
});


test('B4 direct reviewer commands deny the original operator of a receipt-less imported ancestor and preserve independent access', async (t) => {
  const capability=Object.freeze({});
  const importer=await createFactoryImportService({bankPool:f.fixture.bankPool,identityService:f.identity,internalCapability:capability});
  const operatorId=f.fixture.principals.author.userId,creatorId=f.fixture.principals.studentB.userId;
  const pkg=await inspectionImportPackage(pool,creatorId);
  await importer.importFactoryPackageV2(await principal(author),pkg,capability);
  const parentId=pkg.candidates[0].question.parentVersionId,candidateId=pkg.candidates[0].question.id;
  const parent=(await pool.query('SELECT content_hash FROM tsa.question_versions WHERE id=$1',[parentId])).rows[0];
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM tsa_private.factory_import_receipts WHERE question_version_id=$1',[parentId])).rows[0].count,0);
  // Isolate independence from submission/normalization: trusted fixture setup
  // queues the genuine imported ancestor, without creating any human review.
  await pool.query("UPDATE tsa.question_workflow SET state='IN_REVIEW',revision=revision+1 WHERE question_version_id=$1",[parentId]);
  await pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'REVIEWER')",[operatorId]);
  t.after(()=>pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='REVIEWER'",[operatorId]));
  const input={expectedRevision:2,contentHash:parent.content_hash,decision:'REJECT',
    rubric:{correctness:false,unambiguous:false,relevant:false,language:false,explanation:false,rights:false},
    reason:'Local synthetic disposition: independent access regression fixture.'};
  const before=await databaseSnapshot();
  const denied=await bankRequest(f,author,`/api/v1/question-versions/${parentId}/reviews`,{method:'POST',key:randomUUID(),body:input});
  assert.equal(denied.status,403,'original import operator must not gain reviewer authority from missing candidate receipt');
  assert.equal((await denied.json()).error.code,'FORBIDDEN');
  await success(await bankRequest(f,author,pathFor(parentId)),404);
  await success(await bankRequest(f,author,evidencePath(parentId)),404);
  await assert.rejects(f.fixture.workflow.confirmSingleton(await principal(author),parentId,randomUUID(),{
    expectedRevision:2,contentHash:parent.content_hash,reason:'Local synthetic singleton independence probe.'}),{status:403,code:'FORBIDDEN'});
  await success(await bankRequest(f,author,`/api/v1/question-versions/${candidateId}/reviews`,{method:'POST',key:randomUUID(),body:{...input,expectedRevision:1,contentHash:pkg.candidates[0].question.contentHash}}),403);
  assert.deepEqual(await databaseSnapshot(),before,'denied operator probes write no application state');
  const accepted=await bankRequest(f,reviewer,`/api/v1/question-versions/${parentId}/reviews`,{method:'POST',key:randomUUID(),body:input});
  assert.equal(accepted.status,201,'genuine independent reviewer remains permitted');
  const receipt=await accepted.json();assert.equal(receipt.state,'REJECTED');
  const replayKey='synthetic-legacy-operator-'+randomUUID();
  // A deliberately forged legacy receipt fixture is not authorization evidence.
  // A direct operator command must be rejected before consulting this cache.
  await pool.query(`INSERT INTO tsa.idempotency_records(id,actor_id,route_scope,idempotency_key,request_hash,response_status,safe_response,resource_id)
    VALUES($1,$2,$3,$4,$5,201,$6,$7)`,[randomUUID(),operatorId,`POST /api/v1/question-versions/${parentId}/reviews`,replayKey,jsonDigest(input),JSON.stringify(receipt),receipt.reviewId]);
  const beforeReplay=await databaseSnapshot();
  await success(await bankRequest(f,author,`/api/v1/question-versions/${parentId}/reviews`,{method:'POST',key:replayKey,body:input}),403);
  assert.deepEqual(await databaseSnapshot(),beforeReplay);
  await pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'AUTHOR')",[creatorId]);
  t.after(()=>pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='AUTHOR'",[creatorId]));
  const creator=await loginActor(f,'studentB');
  const otherResponse=await bankRequest(f,creator,'/api/v1/questions',{method:'POST',key:randomUUID(),body:{...f.template,content:[{type:'text',text:'Bản nháp tổng hợp để kiểm tra độc lập của cặp phiên bản.'}]}});
  assert.equal(otherResponse.status,201);const other=await otherResponse.json();
  const equivalence=await createEquivalenceService({bankPool:f.fixture.bankPool,identityService:f.identity});
  const bankRevision=(await pool.query('SELECT eligibility_revision::text AS revision FROM tsa.bank_state WHERE id=1')).rows[0].revision;
  await assert.rejects(equivalence.adjudicate(await principal(author),randomUUID(),{
    left:{versionId:parentId,contentHash:parent.content_hash,expectedRevision:3},
    right:{versionId:other.versionId,contentHash:other.contentHash,expectedRevision:1},
    kind:'NEAR_DUPLICATE',decision:'DISMISSED',expectedBankRevision:bankRevision,reason:'Synthetic original operator pair-independence probe.',
  }),{status:403,code:'FORBIDDEN'});
});


const negativeReason='Local synthetic disposition: explicit technical demonstration only.';
const negativeRubric={correctness:false,unambiguous:false,relevant:false,language:false,explanation:false,rights:false};
async function negativeCommand(browser,id,kind,body,{key=randomUUID(),status=kind==='reject'?201:200}={}) {
  const response=await bankRequest(f,browser,`/api/v1/question-versions/${id}/${kind==='reject'?'reviews':'quarantine'}`,{method:'POST',key,body});
  if(status!==200&&status!==201) return success(response,status);
  assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  return (kind==='reject'?StaffRejectReviewResponseSchema:StaffQuarantineResponseSchema).parse(await response.json());
}

test('B4 rejection appends exactly the allowed rows, replays without writes and removes queued private access', async () => {
  const draft=await createDraft();await handoff(author,draft.versionId);
  const body={expectedRevision:2,contentHash:draft.contentHash,decision:'REJECT',rubric:negativeRubric,reason:negativeReason};
  for(const browser of [author,candidate,manager,examManager])await negativeCommand(browser,draft.versionId,'reject',body,{status:403});
  await negativeCommand(reviewer,draft.versionId,'reject',{...body,contentHash:'sha256:'+'0'.repeat(64)},{status:409});
  const before=await databaseSnapshot(),key=randomUUID();
  const [first,second]=await Promise.all([negativeCommand(reviewer,draft.versionId,'reject',body,{key}),negativeCommand(reviewer,draft.versionId,'reject',body,{key})]);
  assert.deepEqual(second,first);assert.equal(first.state,'REJECTED');assert.equal(first.revision,3);
  const after=await databaseSnapshot();
  assert.deepEqual(Object.keys(before).filter(table=>before[table].hash!==after[table].hash).sort(),
    ['tsa.audit_events','tsa.idempotency_records','tsa.question_workflow','tsa.reviews'].sort());
  for(const table of ['tsa.audit_events','tsa.idempotency_records','tsa.reviews'])assert.equal(after[table].count,before[table].count+1);
  await success(await bankRequest(f,reviewer,pathFor(draft.versionId)),404);
  await success(await bankRequest(f,reviewer,evidencePath(draft.versionId)),404);
  assert.deepEqual(await negativeCommand(reviewer,draft.versionId,'reject',body,{key}),first);
  await negativeCommand(reviewer,draft.versionId,'reject',{...body,reason:negativeReason+' changed'},{key,status:409});
  assert.deepEqual(await databaseSnapshot(),after);
});

test('B4 negative command inputs/CSRF/current roles and validation failures never create a disposition', async () => {
  const draft=await createDraft();await handoff(author,draft.versionId);
  const body={expectedRevision:2,contentHash:draft.contentHash,decision:'REJECT',rubric:negativeRubric,reason:negativeReason};
  const before=await databaseSnapshot();
  for(const bad of [{...body,reason:'   '},{...body,reason:'x'.repeat(4097)},{...body,rubric:{}},{...body,reviewerId:randomUUID()}])
    await negativeCommand(reviewer,draft.versionId,'reject',bad,{status:422});
  const url=f.origin+`/api/v1/question-versions/${draft.versionId}/reviews`;
  await success(await fetch(url,{method:'POST',headers:{origin:f.origin,cookie:reviewer.cookies.join('; '),'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(body)}),403);
  const reviewerId=f.fixture.principals.reviewer.userId;
  const assignedAt=(await pool.query("SELECT assigned_at::text AS assigned_at FROM tsa.user_roles WHERE user_id=$1 AND role='REVIEWER'",[reviewerId])).rows[0].assigned_at;
  await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='REVIEWER'",[reviewerId]);
  try {await negativeCommand(reviewer,draft.versionId,'reject',body,{status:403});}
  finally {await pool.query("INSERT INTO tsa.user_roles(user_id,role,assigned_at) VALUES($1,'REVIEWER',$2)",[reviewerId,assignedAt]);}
  // Compare after restoring the role fixture; rejected operations append nothing.
  assert.deepEqual(await databaseSnapshot(),before);
  for(const browser of [author,reviewer,candidate,examManager])await negativeCommand(browser,draft.versionId,'quarantine',{expectedRevision:2,reason:negativeReason},{status:403});
  await negativeCommand(manager,draft.versionId,'quarantine',{expectedRevision:1,reason:negativeReason},{status:409});
  assert.deepEqual(await databaseSnapshot(),before);
});

test('B4 quarantine postcommit drain failure is an uncertain503; same-key retry reuses receipt and drains without reapplying workflow', async () => {
  const draft=await createDraft(),key=randomUUID(),body={expectedRevision:1,reason:negativeReason};
  let failDrain=true,drainCalls=0;
  const bankPool={query:(...args)=>f.fixture.bankPool.query(...args),async connect(){
    const client=await f.fixture.bankPool.connect();return {release:(...args)=>client.release(...args),async query(sql,params){
      if(sql.includes('SELECT tsa.bank_drain_delivery_holds()')){drainCalls++;if(failDrain){failDrain=false;throw new Error('Controlled synthetic postcommit drain failure');}}
      return client.query(sql,params);
    }};
  }};
  const handler=await createBankHandler({bankPool,identityService:f.identity,trustedOrigin:f.origin});
  const request=()=>new Request(f.origin+`/api/v1/question-versions/${draft.versionId}/quarantine`,{
    method:'POST',headers:{origin:f.origin,cookie:manager.cookies.join('; '),'x-csrf-token':manager.csrf,'idempotency-key':key,'content-type':'application/json'},body:JSON.stringify(body),
  });
  const before=await databaseSnapshot();
  const failed=await success(await handler(request()),503);
  assert.equal(failed.error.code,'TEMPORARILY_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(failed),/drain|SELECT|sourceVersionId|answerKey/);
  const committed=await databaseSnapshot();
  assert.equal(committed['tsa.idempotency_records'].count,before['tsa.idempotency_records'].count+1);
  const current=await success(await bankRequest(f,manager,pathFor(draft.versionId)));
  assert.deepEqual(current.workflow,{state:'QUARANTINED',revision:2});
  assert.deepEqual(current.preview,{status:'BLOCKED',reason:'WORKFLOW_HELD'});
  const retried=await handler(request());assert.equal(retried.status,200);
  assert.deepEqual(StaffQuarantineResponseSchema.parse(await retried.json()),{state:'QUARANTINED',revision:2});
  assert.equal(drainCalls,2);assert.deepEqual(await databaseSnapshot(),committed);
  for(const table of ['tsa.question_versions','tsa_private.question_secrets','tsa.source_rights','tsa.rights_decisions','tsa.student_question_history']) {
    assert.deepEqual(committed[table],before[table],table);
  }
});

test('B4 missing original attribution fails closed for review but does not prevent manager quarantine', async () => {
  const capability=Object.freeze({});
  const importer=await createFactoryImportService({bankPool:f.fixture.bankPool,identityService:f.identity,internalCapability:capability});
  const pkg=await inspectionImportPackage(pool,f.fixture.principals.studentB.userId);
  await importer.importFactoryPackageV2(await principal(author),pkg,capability);
  const id=pkg.candidates[0].question.parentVersionId;
  await pool.query("UPDATE tsa.question_workflow SET state='IN_REVIEW',revision=2 WHERE question_version_id=$1",[id]);
  const hash=(await pool.query('SELECT content_hash FROM tsa.question_versions WHERE id=$1',[id])).rows[0].content_hash;
  const bankPool={query:(...args)=>f.fixture.bankPool.query(...args),async connect(){
    const client=await f.fixture.bankPool.connect();return {release:(...args)=>client.release(...args),async query(sql,params){
      if(sql.includes('FROM tsa_private.factory_import_manifests WHERE'))return {rows:[],rowCount:0};
      return client.query(sql,params);
    }};
  }};
  const service=await createPublicationService({bankPool,identityService:f.identity});
  await assert.rejects(service.review(await principal(reviewer),id,randomUUID(),{expectedRevision:2,contentHash:hash,decision:'REJECT',rubric:negativeRubric,reason:negativeReason}),{status:503,code:'TEMPORARILY_UNAVAILABLE'});
  const held=await service.quarantine(await principal(manager),id,randomUUID(),{expectedRevision:2,reason:negativeReason});
  assert.deepEqual(held.body,{state:'QUARANTINED',revision:3});
});

test('B4 attribution extraction preserves valid manual shared-stimulus B1/B2 projections', async () => {
  const bundleFixture=await createSharedReadingFixture({bundleCount:1});
  try {
    const draft=bundleFixture.questions[0];
    const context=await createReviewContextService({bankPool:bundleFixture.bankPool,identityService:bundleFixture.harness.identity});
    const value=await context.read(bundleFixture.principals.author,draft.versionId);
    assert.equal(value.preview.status,'AVAILABLE');
    assert.equal(value.preview.question.stimulus.versionId,bundleFixture.bundles[0].stimulusVersionId);
    assert.deepEqual(value.preview.question.stimulus.content,bundleFixture.bundles[0].content);
    const evidence=await createReviewEvidenceService({bankPool:bundleFixture.bankPool,identityService:bundleFixture.harness.identity});
    assert.equal((await evidence.read(bundleFixture.principals.bankManager,draft.versionId)).sources.length,2);
  } finally {await bundleFixture.close();}
});


test('B5 manager history reads real rejection separately from current held workflow without any application write', async () => {
  const draft=await createDraft();
  await f.fixture.workflow.submitReview(await principal(author),draft.versionId,randomUUID(),{expectedRevision:1});
  const reason='Local synthetic disposition: <img src="https://invalid.example/history" onerror="alert(1)"> Recorded text only.';
  const rubric={correctness:false,unambiguous:true,relevant:true,language:true,explanation:false,rights:true};
  const decision=await f.fixture.workflow.review(await principal(reviewer),draft.versionId,randomUUID(),{
    expectedRevision:2,contentHash:draft.contentHash,decision:'REJECT',rubric,reason});
  const before=await databaseSnapshot();
  const history=await success(await bankRequest(f,manager,historyPath(draft.versionId)));
  assert.equal(history.reviews.length,1);assert.equal(history.reviews[0].reviewId,decision.body.reviewId);
  assert.equal(history.reviews[0].reason,reason);assert.deepEqual(history.reviews[0].rubric,rubric);
  assert.equal(history.workflowState,'REJECTED');assert.equal(history.version.workflowRevision,3);
  assert.equal(history.version.contentHash,draft.contentHash);assert.equal(history.truncated,false);assert.equal(history.limit,20);
  assert.equal(history.qualification,'NOT_ATTESTED_BY_PLATFORM');assert.equal(history.publicationEligibility,'NOT_EVALUATED');
  assert.doesNotMatch(JSON.stringify(history),/reviewer_id|authorId|operator|answerKey|explanation":\[|sourceVersionId|reference_namespace/);
  assert.deepEqual(await databaseSnapshot(),before);
  // Manager holds may target DRAFT/IN_REVIEW/APPROVED, not REJECTED. A separate
  // genuine IN_REVIEW target shows its administrative history survives a hold.
  const held=await createDraft();await f.fixture.workflow.submitReview(await principal(author),held.versionId,randomUUID(),{expectedRevision:1});
  await f.fixture.workflow.quarantine(await principal(manager),held.versionId,randomUUID(),{expectedRevision:2,reason:'Synthetic hold, no qualified review.'});
  const heldBefore=await databaseSnapshot();const heldRead=await success(await bankRequest(f,manager,historyPath(held.versionId)));
  assert.equal(heldRead.workflowState,'QUARANTINED');assert.equal(heldRead.version.workflowRevision,3);
  assert.deepEqual(heldRead.reviews,[]);assert.deepEqual(await databaseSnapshot(),heldBefore);
});

test('B5 history enforces opt-in/current manager auth, role-before-object, Origin/method/query/body and safe errors', async () => {
  const id=f.questions[0].versionId,before=await databaseSnapshot();
  assert.equal((await success(await fetch(f.origin+historyPath(id)),401)).error.code,'UNAUTHENTICATED');
  for(const browser of [author,reviewer,candidate,examManager])for(const target of [id,randomUUID(),'bad'])
    assert.equal((await success(await bankRequest(f,browser,historyPath(target)),403)).error.code,'FORBIDDEN');
  for(const target of [randomUUID(),'bad'])assert.equal((await success(await bankRequest(f,manager,historyPath(target)),404)).error.code,'NOT_FOUND');
  assert.equal((await success(await bankRequest(f,manager,historyPath(id)+'?limit=1'),422)).error.code,'VALIDATION_ERROR');
  const foreign=await fetch(f.origin+historyPath(id),{headers:{origin:'https://invalid.example',cookie:manager.cookies.join('; ')}});
  assert.equal((await success(foreign,403)).error.code,'FORBIDDEN');
  assert.equal((await success(await bankRequest(f,manager,historyPath(id),{method:'POST',key:randomUUID(),body:{}}),404)).error.code,'NOT_FOUND');
  const body=await new Promise((resolve,reject)=>{const req=httpRequest(f.origin+historyPath(id),{method:'GET',headers:{cookie:manager.cookies.join('; '),'content-length':'2'}},res=>{
    let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text),headers:res.headers}));
  });req.on('error',reject);req.end('{}');});assert.equal(body.status,422);assert.equal(body.headers['x-request-id'],body.body.error.requestId);
  const defaultHandler=await createBankHandler({bankPool:f.fixture.bankPool,identityService:f.identity,trustedOrigin:f.origin});
  const request=()=>new Request(f.origin+historyPath(id),{headers:{cookie:manager.cookies.join('; ')}});
  assert.equal((await success(await defaultHandler(request()),404)).error.code,'NOT_FOUND');
  await assert.rejects(createBankHandler({bankPool:f.fixture.bankPool,identityService:f.identity,trustedOrigin:f.origin,enableReviewHistory:'true'}),TypeError);
  assert.deepEqual(await databaseSnapshot(),before);
  const managerId=(await principal(manager)).userId;
  const assigned=(await pool.query("SELECT assigned_at::text AS at FROM tsa.user_roles WHERE user_id=$1 AND role='BANK_MANAGER'",[managerId])).rows[0].at;
  await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='BANK_MANAGER'",[managerId]);
  try {assert.equal((await success(await bankRequest(f,manager,historyPath(id)),403)).error.code,'FORBIDDEN');}
  finally {await pool.query("INSERT INTO tsa.user_roles(user_id,role,assigned_at) VALUES($1,'BANK_MANAGER',$2)",[managerId,assigned]);}
  assert.deepEqual(await databaseSnapshot(),before);
});

test('B5 latest20 is stable on timestamp ties, truthful about truncation, and includes no human identity', async () => {
  const draft=await createDraft(),reviewerId=(await principal(reviewer)).userId;
  const rubric={correctness:true,unambiguous:true,relevant:true,language:true,explanation:true,rights:true};
  const ids=Array.from({length:22},()=>randomUUID());
  // Trusted synthetic history rows isolate ordering/truncation; these do not
  // represent qualified review or drive workflow/publication eligibility.
  for(const [index,id] of ids.entries())await pool.query(`INSERT INTO tsa.reviews(id,question_version_id,content_hash,reviewer_id,decision,rubric,reason,created_at)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'2001-01-01T00:00:00Z')`,[id,draft.versionId,draft.contentHash,reviewerId,index%2?'APPROVE':'REJECT',JSON.stringify(rubric),'Synthetic administrative history ordering fixture.']);
  const before=await databaseSnapshot();
  const value=await success(await bankRequest(f,manager,historyPath(draft.versionId)));
  assert.equal(value.truncated,true);assert.equal(value.reviews.length,20);
  assert.deepEqual(value.reviews.map(r=>r.reviewId),ids.sort().reverse().slice(0,20));
  assert.equal(value.workflowState,'DRAFT');assert.equal(value.qualification,'NOT_ATTESTED_BY_PLATFORM');
  const again=await success(await bankRequest(f,manager,historyPath(draft.versionId)));
  assert.deepEqual(again.reviews,value.reviews);assert.deepEqual(await databaseSnapshot(),before);
});

test('B5 malformed stored review is safe503 rather than empty/partial history, and database state stays immutable', async () => {
  for(const malformed of [{rubric:{},reason:'Malformed synthetic rubric.'},{rubric:{correctness:true,unambiguous:true,relevant:true,language:true,explanation:true,rights:true},reason:'x'.repeat(4097)}]) {
    const draft=await createDraft();
    await pool.query(`INSERT INTO tsa.reviews(id,question_version_id,content_hash,reviewer_id,decision,rubric,reason)
      VALUES($1,$2,$3,$4,'REJECT',$5::jsonb,$6)`,[randomUUID(),draft.versionId,draft.contentHash,(await principal(reviewer)).userId,JSON.stringify(malformed.rubric),malformed.reason]);
    const before=await databaseSnapshot();const value=await success(await bankRequest(f,manager,historyPath(draft.versionId)),503);
    assert.equal(value.error.code,'TEMPORARILY_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(value),/rubric|SELECT|Malformed|4097/);
    assert.deepEqual(await databaseSnapshot(),before);
  }
  const bankPool={query:(...args)=>f.fixture.bankPool.query(...args),async connect(){const client=await f.fixture.bankPool.connect();return {release:(...args)=>client.release(...args),async query(sql,params){
    const value=await client.query(sql,params);if(sql.includes('FROM tsa.reviews WHERE'))return {...value,rows:[{id:randomUUID(),content_hash:'sha256:'+'0'.repeat(64),decision:'REJECT',rubric:{},reason:'Untrusted diagnostic sentinel.',recorded_at:'2001-01-01T00:00:00.000000Z'}]};return value;
  }};}};
  const service=await createReviewHistoryService({bankPool,identityService:f.identity});
  await assert.rejects(service.read(await principal(manager),f.questions[0].versionId),error=>error.status===503&&error.code==='TEMPORARILY_UNAVAILABLE');
});


const preflightPath='/api/v1/datasets/preflight';
const pinFor=(draft)=>({versionId:draft.versionId,contentHash:draft.contentHash});
async function requestPreflight(browser,body,options={}) {
  return bankRequest(f,browser,preflightPath,{method:'POST',body,...options});
}

test('B6 exact canonical projection agrees with existing service without manifest/packet leakage or application writes', async () => {
  const input={versions:f.questions.slice(0,3).map(pinFor).reverse()};
  const before=await databaseSnapshot(),actor=await principal(manager);
  const legacy=await createDatasetPreflightService({bankPool:f.fixture.bankPool,identityService:f.identity});
  const original=await legacy.preflight(actor,input);
  const value=await success(await requestPreflight(manager,input));
  assert.equal(value.scope,'CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION');
  assert.equal(value.publishing,false);assert.equal(value.publicationEligibility,'NOT_EVALUATED');
  assert.deepEqual(value.counts,{total:3,bySection:original.report.counts.bySection,byInteractionType:original.report.counts.byInteractionType});
  assert.deepEqual(value.targets,{MATH:12,READING:6,SCIENCE:12});assert.deepEqual(value.shortfalls,{MATH:9,READING:6,SCIENCE:12});
  assert.deepEqual(value.blockerCodes,original.report.blockerCodes);
  assert.equal(value.duplicateFingerprintGroupCount,original.report.duplicateFingerprintGroups.length);
  assert.equal(value.eligibilityRevision,original.databaseSnapshot.eligibilityRevision);
  assert.deepEqual(value.versions.map(v=>({versionId:v.versionId,contentHash:v.contentHash})),input.versions.toSorted((a,b)=>a.versionId.localeCompare(b.versionId)));
  assert.doesNotMatch(JSON.stringify(value),/answerKey|manifestDigest|reviewPacket|referenceClosure|fingerprint":|sourceVersionId|reviewer_id|historyQuestionIds/);
  assert.deepEqual(await databaseSnapshot(),before);
});

test('B6 manager role/CSRF/Origin/opt-in/body/query/pin failures are safe and never create diagnostic state', async () => {
  const input={versions:[pinFor(f.questions[0])]},before=await databaseSnapshot();
  assert.equal((await success(await fetch(f.origin+preflightPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),401)).error.code,'UNAUTHENTICATED');
  for(const browser of [author,reviewer,candidate,examManager])assert.equal((await success(await requestPreflight(browser,input),403)).error.code,'FORBIDDEN');
  const raw=(headers={},body=JSON.stringify(input),query='')=>fetch(f.origin+preflightPath+query,{method:'POST',headers:{origin:f.origin,cookie:manager.cookies.join('; '),'x-csrf-token':manager.csrf,'content-type':'application/json',...headers},body});
  assert.equal((await success(await raw({'x-csrf-token':'wrong'}),403)).error.code,'CSRF_FAILED');
  assert.equal((await success(await raw({origin:'https://invalid.example'}),403)).error.code,'FORBIDDEN');
  assert.equal((await success(await raw({},JSON.stringify(input),'?limit=1'),422)).error.code,'VALIDATION_ERROR');
  assert.equal((await success(await raw({},'{'),400)).error.code,'MALFORMED_JSON');
  assert.equal((await success(await raw({'content-type':'text/plain'}),422)).error.code,'VALIDATION_ERROR');
  for(const body of [{versions:[]},{versions:[input.versions[0],input.versions[0]]},{versions:[{...input.versions[0],extra:true}]},{versions:[{versionId:'bad',contentHash:input.versions[0].contentHash}]},{versions:input.versions,extra:true}])
    assert.equal((await success(await requestPreflight(manager,body),422)).error.code,'VALIDATION_ERROR');
  assert.equal((await success(await requestPreflight(manager,{versions:[{...input.versions[0],versionId:randomUUID()}]}),404)).error.code,'NOT_FOUND');
  assert.equal((await success(await requestPreflight(manager,{versions:[{...input.versions[0],contentHash:'sha256:'+'0'.repeat(64)}]}),409)).error.code,'CONCURRENT_MODIFICATION');
  assert.equal((await success(await bankRequest(f,manager,preflightPath),404)).error.code,'NOT_FOUND');
  const disabled=await createBankHandler({bankPool:f.fixture.bankPool,identityService:f.identity,trustedOrigin:f.origin});
  const request=()=>new Request(f.origin+preflightPath,{method:'POST',headers:{origin:f.origin,cookie:manager.cookies.join('; '),'x-csrf-token':manager.csrf,'content-type':'application/json'},body:JSON.stringify(input)});
  assert.equal((await success(await disabled(request()),404)).error.code,'NOT_FOUND');
  await assert.rejects(createBankHandler({bankPool:f.fixture.bankPool,identityService:f.identity,trustedOrigin:f.origin,enableDatasetPreflight:'true'}),TypeError);
  assert.deepEqual(await databaseSnapshot(),before);
});

test('B6 multiple versions of one logical question reject without partial report or workflow/publication writes', async () => {
  const draft=await createDraft();
  const versionResponse=await bankRequest(f,author,`/api/v1/questions/${draft.questionId}/versions`,{method:'POST',key:randomUUID(),body:{parentVersionId:draft.versionId,draft:{...f.template,content:[{type:'text',text:'Synthetic preflight revised version '+randomUUID()}]}}});
  assert.equal(versionResponse.status,201);const version=await versionResponse.json();
  const before=await databaseSnapshot();
  assert.equal((await success(await requestPreflight(manager,{versions:[pinFor(draft),pinFor(version)]}),422)).error.code,'VALIDATION_ERROR');
  assert.deepEqual(await databaseSnapshot(),before);
});

test('B6 unexpected canonical read failure is private503 and a later explicit check succeeds without writes', async () => {
  let failRead=true;
  const bankPool={query:(...args)=>f.fixture.bankPool.query(...args),async connect(){const client=await f.fixture.bankPool.connect();return {release:(...args)=>client.release(...args),async query(sql,params){
    if(failRead&&sql.includes('SELECT eligibility_revision::text')){failRead=false;throw new Error('Synthetic private diagnostic SQL/secret sentinel.');}
    return client.query(sql,params);
  }};}};
  const handler=await createBankHandler({bankPool,identityService:f.identity,trustedOrigin:f.origin,enableDatasetPreflight:true});
  const input={versions:[pinFor(f.questions[0])]},before=await databaseSnapshot();
  const request=()=>new Request(f.origin+preflightPath,{method:'POST',headers:{origin:f.origin,cookie:manager.cookies.join('; '),'x-csrf-token':manager.csrf,'content-type':'application/json'},body:JSON.stringify(input)});
  const failed=await success(await handler(request()),503);assert.equal(failed.error.code,'TEMPORARILY_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(failed),/sentinel|SQL|secret|eligibility_revision/);
  assert.equal((await success(await handler(request()))).counts.total,1);
  assert.deepEqual(await databaseSnapshot(),before);
});
