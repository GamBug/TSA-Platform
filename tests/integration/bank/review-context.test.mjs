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
import { createReviewEvidenceService } from '../../../src/modules/bank/review-evidence.mjs';
import { StaffSubmitReviewResponseSchema, StaffReviewEvidenceSchema, StaffReviewContextSchema } from '../../../packages/contracts/dist/staff.js';

let f, pool, author, reviewer, manager, candidate, examManager;
const evidencePath = (id) => `/api/v1/question-versions/${id}/review-evidence`;
const pathFor = (id) => `/api/v1/question-versions/${id}/review-context`;
const principal = (browser) => f.identity.authenticate(new Request(f.origin, { headers: { cookie: browser.cookies.join('; ') } }));
async function success(response, status = 200) {
  assert.equal(response.status, status, `Expected status ${status}, got ${response.status}`);
  const payload = await response.json();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  if (status === 200) return (payload.schemaVersion === 'staff-review-evidence/1' ? StaffReviewEvidenceSchema : StaffReviewContextSchema).parse(payload);
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
