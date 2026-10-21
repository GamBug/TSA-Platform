import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { mkdtemp, cp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBankHarness, loginActor, bankRequest } from './harness.mjs';
import { ensureLocalTaxonomy, createPrivateTemplate } from '../../../src/local/seed.mjs';
import { privateQuestionFixture } from '../../../apps/practice-prototype/src/private-question-fixture.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { startDisposablePostgres } from '../database/foundation/postgres.mjs';
import { loadWorkflowTarget, validateWorkflowTarget } from '../../../src/modules/bank/publication-gates.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';

let harness, author, reviewer, manager, candidate, source, draftNo = 0;
const hash = `sha256:${'2'.repeat(64)}`;
const rubric = Object.fromEntries(['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'].map((key) => [key, true]));
async function post(browser, route, body, status = 201, key = randomUUID()) {
  const response = await bankRequest(harness, browser, route, { method: 'POST', body, key });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return result;
}
async function principal(browser) {
  return harness.identity.authenticate(new Request(harness.origin, { headers: { cookie: browser.cookies.join('; ') } }));
}
async function draft(sourceContext = source) {
  const template = createPrivateTemplate(sourceContext);
  return post(author, '/api/v1/questions', {
    schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH',
    taxonomyVersionId: template.taxonomyVersionId, domainId: template.domainId,
    skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
    content: [{ type: 'text', text: `Boundary synthetic item ${++draftNo}` }],
    interaction: privateQuestionFixture.interaction,
    answerKey: privateQuestionFixture.private.answerKey, explanation: privateQuestionFixture.private.explanation,
    stimulusVersionId: null, evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
  });
}
before(async () => {
  harness = await createBankHarness();
  await ensureLocalTaxonomy(harness.database.pool);
  author = await loginActor(harness, 'author');
  reviewer = await loginActor(harness, 'reviewer');
  manager = await loginActor(harness, 'bankManager');
  candidate = await loginActor(harness, 'studentA');
  const { sourceId } = await post(author, '/api/v1/sources', { title: 'Synthetic workflow boundary', canonicalUri: null, origin: 'OWNED' });
  const { sourceVersionId } = await post(author, `/api/v1/sources/${sourceId}/versions`,
    { contentHash: hash, evidenceUri: 'manual://synthetic-only', metadata: {} });
  const { decisionId } = await post(manager, `/api/v1/source-versions/${sourceVersionId}/rights`, {
    status: 'OWNED', allowedUses: ['DISPLAY', 'ADAPT', 'GENERATE'], territory: ['VN'],
    validFrom: '2026-10-19T00:00:00Z', validTo: null, evidence: 'Synthetic test attestation only.', expectedRevision: 0,
  });
  source = { sourceVersionId, decisionId };
});
after(async () => { await harness?.close(); });

test('documented HTTP submission/rejection uses exact hashes, revisions, private receipts and audit', async () => {
  const q = await draft();
  const base = `/api/v1/question-versions/${q.versionId}`;
  const submissionKey = randomUUID();
  const submitted = await post(author, `${base}/submit-review`, { expectedRevision: 1 }, 200, submissionKey);
  assert.deepEqual(submitted, { versionId: q.versionId, state: 'IN_REVIEW', revision: 2 });
  assert.deepEqual(await post(author, `${base}/submit-review`, { expectedRevision: 1 }, 200, submissionKey), submitted);
  const decision = { expectedRevision: 2, contentHash: q.contentHash, decision: 'REJECT', rubric, reason: 'Synthetic alternate answer rejected.' };
  const rejected = await post(reviewer, `${base}/reviews`, decision);
  assert.equal(rejected.state, 'REJECTED');
  assert.equal(rejected.revision, 3);
  const row = (await harness.database.pool.query(`SELECT q.eligible_version_id,
    (SELECT count(*)::int FROM tsa.reviews WHERE question_version_id=$1) AS reviews,
    (SELECT count(*)::int FROM tsa.audit_events WHERE entity_id=$1::text AND action IN ('BANK_SUBMIT_REVIEW','BANK_REVIEW_REJECT')) AS audits
    FROM tsa.questions q WHERE q.id=$2`, [q.versionId, q.questionId])).rows[0];
  assert.deepEqual(row, { eligible_version_id: null, reviews: 1, audits: 2 });
  const failed = await post(author, `${base}/submit-review`, { expectedRevision: 3 }, 409);
  assert.deepEqual(failed.error.details, {});
  assert.equal(JSON.stringify(failed).includes('answerKey'), false);
});

test('normal HTTP runtime cannot publish even a correctly reviewed synthetic draft', async () => {
  const q = await draft();
  await post(author, `/api/v1/question-versions/${q.versionId}/submit-review`, { expectedRevision: 1 }, 200);
  const result = await post(reviewer, `/api/v1/question-versions/${q.versionId}/reviews`, {
    expectedRevision: 2, contentHash: q.contentHash, decision: 'APPROVE', rubric, reason: 'Synthetic simulation must not publish here.',
  }, 403);
  assert.equal(result.error.code, 'FORBIDDEN');
  assert.deepEqual(result.error.details, {});
  const row = (await harness.database.pool.query(`SELECT q.eligible_version_id,w.state,
    (SELECT count(*)::int FROM tsa.reviews WHERE question_version_id=$1) AS reviews
    FROM tsa.questions q JOIN tsa.question_workflow w ON w.question_version_id=$1 WHERE q.id=$2`, [q.versionId,q.questionId])).rows[0];
  assert.deepEqual(row, { eligible_version_id: null, state: 'IN_REVIEW', reviews: 0 });
});

test('review HTTP denies author, manager, candidate, client approver fields and missing CSRF', async () => {
  const q = await draft();
  await post(author, `/api/v1/question-versions/${q.versionId}/submit-review`, { expectedRevision: 1 }, 200);
  const route = `/api/v1/question-versions/${q.versionId}/reviews`;
  const input = { expectedRevision: 2, contentHash: q.contentHash, decision: 'REJECT', rubric, reason: 'Synthetic decision.' };
  for (const actor of [author, manager, candidate]) {
    const error = await post(actor, route, input, 403);
    assert.equal(error.error.code, 'FORBIDDEN');
  }
  await post(candidate, `/api/v1/question-versions/${randomUUID()}/reviews`, input, 403);
  await post(reviewer, route, { ...input, reviewerId: randomUUID() }, 422);
  const response = await fetch(`${harness.origin}${route}`, { method: 'POST', headers: {
    cookie: reviewer.cookies.join('; '), origin: harness.origin, 'content-type': 'application/json', 'idempotency-key': randomUUID(),
  }, body: JSON.stringify(input) });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'CSRF_FAILED');
});

test('SQL runtime publication guard and fixture marker are unavailable to ordinary application credentials', async () => {
  const q = await draft();
  await assert.rejects(withTransaction(harness.bankPool, (client) => client.query(
    'UPDATE tsa.questions SET eligible_version_id=$1 WHERE id=$2', [q.versionId,q.questionId]), { role: 'tsa_bank' }), { code: '42501' });
  await assert.rejects(withTransaction(harness.bankPool, (client) => client.query(`INSERT INTO tsa_private.bank_workflow_fixture_scope
    (scope_id,database_oid,postmaster_started_at) SELECT $1,oid,pg_postmaster_start_time() FROM pg_database WHERE datname=current_database()`, [randomUUID()]),
  { role: 'tsa_bank' }), { code: '42501' });
  for (const role of ['tsa_web', 'tsa_factory', 'tsa_exam', 'tsa_identity']) {
    await assert.rejects(withTransaction(harness.database.pool, (client) => client.query('SELECT * FROM tsa_private.bank_workflow_fixture_scope'), { role }), { code: '42501' });
  }
});

test('production process cannot be overridden by a fixtureScopeId', async () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    await assert.rejects(createPublicationService({ bankPool: harness.bankPool, identityService: harness.identity, fixtureScopeId: randomUUID() }), /production/);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original;
  }
});

test('migration005 to009 preserves populated source records and installs empty private gates', async () => {
  const database = await startDisposablePostgres();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-review-upgrade-'));
  try {
    const sourceDirectory = new URL('../../../db/migrations/', import.meta.url);
    for (const file of await readdir(sourceDirectory)) {
      if (/^00[1-5]_.*\.sql$/.test(file)) await cp(new URL(file,sourceDirectory), path.join(directory,file));
    }
    await migrate(database.pool, { directory });
    const id = randomUUID();
    await database.pool.query("INSERT INTO tsa.sources (id,title,origin) VALUES ($1,'Preserved synthetic upgrade fixture','OWNED')", [id]);
    const previous = (await database.pool.query('SELECT * FROM tsa.sources WHERE id=$1', [id])).rows;
    const upgraded = await migrate(database.pool);
    assert.deepEqual(upgraded.applied, ['006_bank_review_workflow.sql', '007_bank_equivalence.sql', '008_bank_delivery_safety.sql', '009_assembly_stock.sql','010_atomic_allocation.sql','011_attempt_delivery.sql','012_answer_saves.sql']);
    assert.deepEqual((await database.pool.query('SELECT * FROM tsa.sources WHERE id=$1', [id])).rows, previous);
    assert.equal((await database.pool.query('SELECT * FROM tsa_private.bank_workflow_fixture_scope')).rowCount, 0);
    assert.equal((await database.pool.query('SELECT * FROM tsa_private.question_delivery_checks')).rowCount, 0);
    assert.equal((await database.pool.query('SELECT * FROM tsa_private.form_delivery_holds')).rowCount, 0);
  } finally {
    await database.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


function bankLockBarrier() {
  let enter, release;
  const entered = new Promise((resolve) => { enter=resolve; });
  const released = new Promise((resolve) => { release=resolve; });
  let paused=false;
  return {
    entered,release,
    pool:{
      query:(...args)=>harness.bankPool.query(...args),
      async connect() {
        const client=await harness.bankPool.connect();
        return {
          release:(...args)=>client.release(...args),
          async query(sql,values) {
            const result=await client.query(sql,values);
            if (!paused && sql==='SELECT id FROM tsa.bank_state WHERE id = 1 FOR UPDATE') {
              paused=true;enter();await released;
            }
            return result;
          },
        };
      },
    },
  };
}
async function observeBankWaiter() {
  const deadline=Date.now()+5000;
  while (Date.now()<deadline) {
    const result=await harness.database.pool.query(`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE application_name='tsa-bank-api-test' AND wait_event_type='Lock'
        AND (query ILIKE '%bank_state%' OR query ILIKE '%1414742321%')`);
    if (result.rows[0].count>0) return;
    await new Promise((resolve)=>setTimeout(resolve,10));
  }
  throw new Error('No observed PostgreSQL Bank lock waiter');
}

test('approval and rights withdrawal serialize in both real PostgreSQL winner orders', async () => {
  const fixtureScopeId=randomUUID();
  await harness.database.pool.query(`INSERT INTO tsa_private.bank_workflow_fixture_scope
    (scope_id,database_oid,postmaster_started_at) SELECT $1,oid,pg_postmaster_start_time()
    FROM pg_database WHERE datname=current_database()`,[fixtureScopeId]);
  const authorPrincipal=await principal(author), reviewerPrincipal=await principal(reviewer), managerPrincipal=await principal(manager);
  for (const winner of ['APPROVE','WITHDRAW']) {
    const {sourceId}=await post(author,'/api/v1/sources',{title:`Synthetic rights race ${winner}`,canonicalUri:null,origin:'OWNED'});
    const {sourceVersionId}=await post(author,`/api/v1/sources/${sourceId}/versions`,{contentHash:hash,evidenceUri:'manual://synthetic-race',metadata:{}});
    const rightsBody={status:'OWNED',allowedUses:['DISPLAY'],territory:['VN'],validFrom:'2026-10-19T00:00:00Z',validTo:null,evidence:'Synthetic rights race only.',expectedRevision:0};
    const {decisionId}=await post(manager,`/api/v1/source-versions/${sourceVersionId}/rights`,rightsBody);
    const q=await draft({sourceVersionId,decisionId});
    const normalWorkflow=await createPublicationService({bankPool:harness.bankPool,identityService:harness.identity,fixtureScopeId});
    const normalSources=await createSourceService({bankPool:harness.bankPool,identityService:harness.identity});
    await normalWorkflow.submitReview(authorPrincipal,q.versionId,randomUUID(),{expectedRevision:1});
    await normalWorkflow.confirmSingleton(reviewerPrincipal,q.versionId,randomUUID(),{expectedRevision:2,contentHash:q.contentHash,reason:'Synthetic race singleton.'});
    const approval={expectedRevision:2,contentHash:q.contentHash,decision:'APPROVE',rubric,reason:'Synthetic race approval.'};
    const withdrawal={...rightsBody,status:'REVOKED',expectedRevision:1};
    const barrier=bankLockBarrier();
    const firstWorkflow=await createPublicationService({bankPool:barrier.pool,identityService:harness.identity,fixtureScopeId});
    const firstSources=await createSourceService({bankPool:barrier.pool,identityService:harness.identity});
    let first,second;
    try {
      first=winner==='APPROVE'
        ? firstWorkflow.review(reviewerPrincipal,q.versionId,randomUUID(),approval)
        : firstSources.registerRightsDecision(managerPrincipal,sourceVersionId,randomUUID(),withdrawal);
      // Observe rejection immediately without allowing an unhandled promise.
      first=first.then((value)=>({value}),(error)=>({error}));
      await Promise.race([barrier.entered,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Winner did not acquire Bank lock')),5000);timer.unref();})]);
      second=(winner==='APPROVE'
        ? normalSources.registerRightsDecision(managerPrincipal,sourceVersionId,randomUUID(),withdrawal)
        : normalWorkflow.review(reviewerPrincipal,q.versionId,randomUUID(),approval))
        .then((value)=>({value}),(error)=>({error}));
      await observeBankWaiter();
    } finally {barrier.release();}
    const [a,b]=await Promise.all([first,second]);
    assert.ok(a.value, a.error?.stack);
    if (winner==='APPROVE') assert.ok(b.value, b.error?.stack);
    else assert.equal(b.error?.code,'RIGHTS_BLOCKED');
    const state=(await harness.database.pool.query(`SELECT q.eligible_version_id,w.state,rd.status
      FROM tsa.questions q JOIN tsa.question_workflow w ON w.question_version_id=$1
      JOIN tsa.source_rights sr ON sr.source_version_id=$2 JOIN tsa.rights_decisions rd ON rd.id=sr.decision_id
      WHERE q.id=$3`,[q.versionId,sourceVersionId,q.questionId])).rows[0];
    assert.deepEqual(state,winner==='APPROVE'
      ?{eligible_version_id:null,state:'APPROVED',status:'REVOKED'}
      :{eligible_version_id:null,state:'IN_REVIEW',status:'REVOKED'});
  }
});


test('empty rights evidence and mismatched normalized content fail closed', async () => {
  const scope=(await harness.database.pool.query('SELECT scope_id FROM tsa_private.bank_workflow_fixture_scope')).rows[0].scope_id;
  const workflow=await createPublicationService({bankPool:harness.bankPool,identityService:harness.identity,fixtureScopeId:scope});
  const q=await draft();
  await assert.rejects(withTransaction(harness.bankPool,async (client)=>{
    const target=await loadWorkflowTarget(client,q.versionId);
    await validateWorkflowTarget(client,{...target,content:[{type:'text',text:'Corrupt normalized copy'}]});
  },{role:'tsa_bank'}),{code:'VALIDATION_ERROR'});
  await workflow.submitReview(await principal(author),q.versionId,randomUUID(),{expectedRevision:1});
  await workflow.confirmSingleton(await principal(reviewer),q.versionId,randomUUID(),{expectedRevision:2,contentHash:q.contentHash,reason:'Synthetic fixture equivalence.'});
  const decisionId=randomUUID();
  const original=(await harness.database.pool.query('SELECT * FROM tsa.source_rights WHERE source_version_id=$1',[source.sourceVersionId])).rows[0];
  try {
    await harness.database.pool.query(`INSERT INTO tsa.rights_decisions
      (id,source_version_id,status,allowed_uses,territory,valid_from,evidence,decided_by)
      VALUES ($1,$2,'OWNED',ARRAY['DISPLAY']::tsa.rights_use[],ARRAY['VN'],'2026-10-19T00:00:00Z','{}', $3)`,
      [decisionId,source.sourceVersionId,(await principal(manager)).userId]);
    await harness.database.pool.query('UPDATE tsa.source_rights SET decision_id=$1 WHERE source_version_id=$2',[decisionId,source.sourceVersionId]);
    await assert.rejects(workflow.review(await principal(reviewer),q.versionId,randomUUID(),{
      expectedRevision:2,contentHash:q.contentHash,decision:'APPROVE',rubric,reason:'Synthetic missing evidence denial.',
    }),{code:'RIGHTS_BLOCKED'});
    assert.equal((await harness.database.pool.query('SELECT eligible_version_id FROM tsa.questions WHERE id=$1',[q.questionId])).rows[0].eligible_version_id,null);
  } finally {
    await harness.database.pool.query('UPDATE tsa.source_rights SET decision_id=$1 WHERE source_version_id=$2',[original.decision_id,source.sourceVersionId]);
  }
});
