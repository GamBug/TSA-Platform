import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before,after,test } from 'node:test';
import { mkdtemp,cp,readdir,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bankRequest,createBankHarness,loginActor } from './harness.mjs';
import { LOCAL_TAXONOMY,ensureLocalTaxonomy,createPrivateTemplate } from '../../../src/local/seed.mjs';
import { privateQuestionFixture } from '../../../apps/practice-prototype/src/private-question-fixture.mjs';
import { createEquivalenceService } from '../../../src/modules/bank/equivalence.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { startDisposablePostgres } from '../database/foundation/postgres.mjs';
import { createForm,createAttempt } from '../database/foundation/exam-fixtures.mjs';

const hash=`sha256:${'3'.repeat(64)}`;
let harness,authorBrowser,reviewerBrowser,author,reviewer,student,source,service,workflow,sequence=0;
async function post(actor,url,body) {
  const response=await bankRequest(harness,actor,url,{method:'POST',key:randomUUID(),body});
  assert.equal(response.status,201,await response.clone().text());return response.json();
}
async function principal(browser) {
  return harness.identity.authenticate(new Request(harness.origin,{headers:{cookie:browser.cookies.join('; ')}}));
}
async function newQuestion() {
  const template=createPrivateTemplate(source);
  const content=[{type:'text',text:`Synthetic immutable-history item ${++sequence}`}];
  const result=await post(authorBrowser,'/api/v1/questions',{
    schemaVersion:'question/1',language:'vi-VN',section:'MATH',taxonomyVersionId:template.taxonomyVersionId,
    domainId:template.domainId,skillIds:template.skillIds,subskillIds:[],cognitiveLevel:null,targetDifficulty:'EASY',
    content,interaction:privateQuestionFixture.interaction,answerKey:privateQuestionFixture.private.answerKey,
    explanation:privateQuestionFixture.private.explanation,stimulusVersionId:null,evidenceRefs:template.evidenceRefs,
    origin:'MANUAL',provenance:template.provenance,
  });
  await workflow.submitReview(author,result.versionId,randomUUID(),{expectedRevision:1});
  return {...result,content,expectedRevision:2};
}
async function bankRevision() {
  return (await harness.database.pool.query('SELECT eligibility_revision::text AS revision FROM tsa.bank_state WHERE id=1')).rows[0].revision;
}
function pair(left,right,expectedBankRevision) {
  const pin=(q)=>({versionId:q.versionId,contentHash:q.contentHash,expectedRevision:q.expectedRevision});
  return {left:pin(left),right:pin(right),kind:'NEAR_DUPLICATE',decision:'CONFIRMED',expectedBankRevision,reason:'Synthetic exact-hash equivalence evidence.'};
}
async function seedBlueprint(q,count=1) {
  const blueprintId=randomUUID(),blueprintVersionId=randomUUID();
  const config={schemaVersion:'blueprint/1',name:'Synthetic one-slot preservation fixture',taxonomyVersionId:LOCAL_TAXONOMY.taxonomyVersionId,
    profileKind:'INDEPENDENT_PRACTICE',evidenceIds:['synthetic-evidence'],sections:[{id:'math-main',section:'MATH',count,durationSeconds:600}],
    allowedTypes:['SINGLE_CHOICE'],quotas:[],maxPerSource:null,excludedQuestionIds:[],bundlePolicy:'ALL_OR_NONE',scoringPolicy:'practice-binary-v1',releasePolicy:'after-grade-v1'};
  await harness.database.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)',[blueprintId,`Synthetic preservation blueprint ${blueprintId}`]);
  await harness.database.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4::jsonb,$5)`,[blueprintVersionId,blueprintId,LOCAL_TAXONOMY.taxonomyVersionId,JSON.stringify(config),hash]);
  return {blueprintVersionId,questionId:q.questionId,questionVersionId:q.versionId,prompt:q.content,
    interaction:privateQuestionFixture.interaction,answerKey:privateQuestionFixture.private.answerKey,
    explanation:privateQuestionFixture.private.explanation,stimulusId:null,stimulusContent:[]};
}
async function preservedRows() {
  const result=await harness.database.pool.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM tsa.question_versions q) AS versions,
    (SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM tsa.forms f) AS forms,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM tsa.assembly_runs r) AS manifests,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY form_id,slot_id) FROM tsa.form_slots s) AS slots,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY form_id,slot_id) FROM tsa_private.form_slot_secrets s) AS secrets,
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM tsa.attempts a) AS attempts,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY user_id,question_id) FROM tsa.student_question_history h) AS history`);
  return result.rows[0];
}
before(async()=>{
  harness=await createBankHarness();await ensureLocalTaxonomy(harness.database.pool);
  authorBrowser=await loginActor(harness,'author');reviewerBrowser=await loginActor(harness,'reviewer');
  const managerBrowser=await loginActor(harness,'bankManager');
  author=await principal(authorBrowser);reviewer=await principal(reviewerBrowser);
  student=(await principal(await loginActor(harness,'studentA'))).userId;
  const {sourceId}=await post(authorBrowser,'/api/v1/sources',{title:'Synthetic equivalence history',canonicalUri:null,origin:'OWNED'});
  const {sourceVersionId}=await post(authorBrowser,`/api/v1/sources/${sourceId}/versions`,{contentHash:hash,evidenceUri:'manual://synthetic-history',metadata:{}});
  const {decisionId}=await post(managerBrowser,`/api/v1/source-versions/${sourceVersionId}/rights`,{
    status:'OWNED',allowedUses:['DISPLAY'],territory:['VN'],validFrom:'2026-10-19T00:00:00Z',validTo:null,evidence:'Synthetic test-only rights.',expectedRevision:0,
  });source={sourceVersionId,decisionId};
  workflow=await createPublicationService({bankPool:harness.bankPool,identityService:harness.identity});
  service=await createEquivalenceService({bankPool:harness.bankPool,identityService:harness.identity});
});
after(async()=>{await harness?.close();});

test('late merge preserves sealed forms, private keys and CREATED assignment history while current exclusions expand',async()=>{
  const left=await newQuestion(),right=await newQuestion();
  for(const q of [left,right]) await workflow.confirmSingleton(reviewer,q.versionId,randomUUID(),{expectedRevision:2,contentHash:q.contentHash,reason:'Synthetic singleton before late evidence.'});
  const seeded=await seedBlueprint(left);
  const forms=[];
  const secondStudent=(await principal(await loginActor(harness,'studentB'))).userId;
  for(const q of [left,right]) {
    const form=await createForm(harness.database.pool,{...seeded,questionId:q.questionId,questionVersionId:q.versionId,prompt:q.content},
      {publicSnapshotMutator:(snapshot)=>({...snapshot,stimulus:null})});
    const attemptId=await createAttempt(harness.database.pool,form,student);
    await harness.database.pool.query('INSERT INTO tsa.student_question_history(user_id,question_id,first_attempt_id) VALUES($1,$2,$3)',[student,q.questionId,attemptId]);
    if(q===left) {
      const created=await createAttempt(harness.database.pool,form,secondStudent);
      await harness.database.pool.query('INSERT INTO tsa.student_question_history(user_id,question_id,first_attempt_id) VALUES($1,$2,$3)',[secondStudent,q.questionId,created]);
    }
    await harness.database.pool.query("UPDATE tsa.form_availability SET withdrawn_at=clock_timestamp(),withdrawal_reason='Synthetic history fixture withdrawal',revision=revision+1 WHERE form_id=$1",[form.formId]);
    await harness.database.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1",[attemptId]);
    forms.push(form.formId);
  }
  const currentExclusions=async()=>harness.database.pool.query(`SELECT DISTINCT seen.question_id FROM tsa.student_question_history h
    JOIN tsa.duplicate_group_members assigned ON assigned.question_id=h.question_id
    JOIN tsa.duplicate_group_members seen ON seen.group_id=assigned.group_id WHERE h.user_id=$1`,[secondStudent]);
  assert.deepEqual((await currentExclusions()).rows.map((row)=>row.question_id),[left.questionId]);
  const before=await preservedRows();
  const input=pair(left,right,await bankRevision()),key=randomUUID();
  const merged=await service.adjudicate(reviewer,key,input);
  assert.equal(merged.body.incidentRecorded,true);
  assert.deepEqual(await preservedRows(),before,'historical assignments and snapshots remain byte-for-byte equivalent');
  const incident=await harness.database.pool.query('SELECT * FROM tsa_private.equivalence_merge_incidents');
  assert.equal(incident.rowCount,1);
  assert.equal(incident.rows[0].affected_form_count,'2');
  assert.equal(incident.rows[0].within_form_collision_count,'0');
  assert.equal(incident.rows[0].cross_group_student_count,'1');
  assert.equal(JSON.stringify(merged.body).includes(student),false);
  for(const formId of forms) assert.equal(JSON.stringify(merged.body).includes(formId),false);
  const exclusions=await currentExclusions();
  assert.deepEqual(exclusions.rows.map((row)=>row.question_id).sort(),[left.questionId,right.questionId].sort());
  assert.deepEqual((await service.adjudicate(reviewer,key,input)).body,merged.body);
  assert.equal((await harness.database.pool.query('SELECT * FROM tsa_private.equivalence_merge_incidents')).rowCount,1);
  await assert.rejects(harness.database.pool.query("UPDATE tsa_private.equivalence_merge_incidents SET affected_form_count=0"),{code:'23514'});
});

test('SQL rejects alias reset, cycles, source-member leftovers, splits and detector evidence rewrites',async()=>{
  const a=await newQuestion(),b=await newQuestion();
  const result=await service.adjudicate(reviewer,randomUUID(),pair(a,b,await bankRevision()));
  const canonical=result.body.canonicalGroupId,retired=result.body.retiredGroupId;
  await assert.rejects(harness.database.pool.query('UPDATE tsa.duplicate_groups SET merged_into_id=NULL WHERE id=$1',[retired]),{code:'23514'});
  await assert.rejects(harness.database.pool.query('UPDATE tsa.duplicate_groups SET merged_into_id=$1 WHERE id=$2',[retired,canonical]),{code:'23514'});
  const fresh=randomUUID();
  await harness.database.pool.query("INSERT INTO tsa.duplicate_groups(id,reason,confirmed_by) VALUES($1,'Synthetic no-split target',$2)",[fresh,reviewer.userId]);
  await assert.rejects(harness.database.pool.query('UPDATE tsa.duplicate_group_members SET group_id=$1 WHERE question_id=$2',[fresh,a.questionId]),{code:'23514'});
  await assert.rejects(harness.database.pool.query('DELETE FROM tsa.duplicate_group_members WHERE question_id=$1',[a.questionId]),{code:'23514'});
  await assert.rejects(harness.database.pool.query("UPDATE tsa.duplicate_relations SET resolution='DISMISSED' WHERE left_version_id=$1 OR right_version_id=$1",[a.versionId]),{code:'23514'});
  await assert.rejects(harness.database.pool.query("UPDATE tsa.duplicate_relations SET evidence='{}' WHERE left_version_id=$1 OR right_version_id=$1",[a.versionId]),{code:'23514'});
  await assert.rejects(withTransaction(harness.database.pool,async(client)=>{
    await client.query('UPDATE tsa.duplicate_groups SET merged_into_id=$1 WHERE id=$2',[fresh,canonical]);
  }),{code:'23514'});
  const c=await newQuestion(),d=await newQuestion();
  const [low,high]=[c.versionId,d.versionId].sort();
  await assert.rejects(harness.database.pool.query(`INSERT INTO tsa.duplicate_relations
    (id,left_version_id,right_version_id,kind,evidence,detector_version,resolution,resolved_by,resolution_evidence)
    VALUES($1,$2,$3,'EXACT','{}','synthetic-illegal-final/1','CONFIRMED',$4,'{}')`,[randomUUID(),low,high,reviewer.userId]),{code:'23514'});

});

test('private incidents and student/form probes remain unavailable to non-Bank service roles',async()=>{
  for(const role of ['tsa_web','tsa_factory','tsa_exam','tsa_identity']) {
    await assert.rejects(withTransaction(harness.database.pool,(client)=>client.query('SELECT * FROM tsa_private.equivalence_merge_incidents'),{role}),{code:'42501'});
    await assert.rejects(withTransaction(harness.database.pool,(client)=>client.query('SELECT * FROM tsa.bank_equivalence_impact($1,$2)',[randomUUID(),randomUUID()]),{role}),{code:'42501'});
  }
  await assert.rejects(withTransaction(harness.bankPool,(client)=>client.query('SELECT * FROM tsa.student_question_history'),{role:'tsa_bank'}),{code:'42501'});
  await assert.rejects(withTransaction(harness.bankPool,(client)=>client.query('SELECT * FROM tsa.form_slots'),{role:'tsa_bank'}),{code:'42501'});
});

test('populated006 to009 retains evidence and installs empty private delivery state',async()=>{
  const database=await startDisposablePostgres();const directory=await mkdtemp(path.join(os.tmpdir(),'tsa-equivalence-upgrade-'));
  try {
    const sourceDirectory=new URL('../../../db/migrations/',import.meta.url);
    for(const file of await readdir(sourceDirectory)) if(/^00[1-6]_.*\.sql$/.test(file)) await cp(new URL(file,sourceDirectory),path.join(directory,file));
    await migrate(database.pool,{directory});
    const userId=randomUUID(),groupId=randomUUID();
    await database.pool.query("INSERT INTO tsa.users(id,issuer,subject) VALUES($1,'synthetic','equivalence-upgrade')",[userId]);
    await database.pool.query("INSERT INTO tsa.duplicate_groups(id,reason,confirmed_by) VALUES($1,'Synthetic preserved group',$2)",[groupId,userId]);
    const before=(await database.pool.query('SELECT * FROM tsa.duplicate_groups')).rows;
    assert.deepEqual((await migrate(database.pool)).applied,['007_bank_equivalence.sql','008_bank_delivery_safety.sql','009_assembly_stock.sql','010_atomic_allocation.sql','011_attempt_delivery.sql','012_answer_saves.sql','013_attempt_submission.sql','014_exam_grading.sql','015_released_results.sql','016_exam_expiry_sweep.sql']);
    assert.deepEqual((await database.pool.query('SELECT * FROM tsa.duplicate_groups')).rows,before);
    assert.equal((await database.pool.query('SELECT * FROM tsa_private.equivalence_merge_incidents')).rowCount,0);
    assert.equal((await database.pool.query('SELECT * FROM tsa_private.question_delivery_checks')).rowCount,0);
    assert.equal((await database.pool.query('SELECT * FROM tsa_private.form_delivery_holds')).rowCount,0);
  }finally{await database.stop();await rm(directory,{recursive:true,force:true});}
});

test('two identities already sealed together produce a collision incident without rewriting that form',async()=>{
  const left=await newQuestion(),right=await newQuestion();
  const seeded=await seedBlueprint(left,2);
  const formId=randomUUID(),runId=randomUUID();
  await withTransaction(harness.database.pool,async(client)=>{
    await client.query(`INSERT INTO tsa.assembly_runs(id,blueprint_version_id,user_id,form_mode,reuse_mode,history_revision,bank_revision,
      request_hash,seed,algorithm_version,limits,manifest,manifest_hash,outcome)
      VALUES($1,$2,NULL,'PUBLISHED_FIXED','FIXED_AS_PUBLISHED',0,'synthetic-bank/1',$3,1,'assembly/1','{}',$4::jsonb,$3,'SUCCESS')`,
      [runId,seeded.blueprintVersionId,hash,JSON.stringify({schemaVersion:'assembly/1',syntheticMembershipEvidence:'preserve original pre-merge snapshot'})]);
    await client.query(`INSERT INTO tsa.forms(id,assembly_run_id,blueprint_version_id,mode,owner_user_id,content_hash,policy_versions,sealed_at)
      VALUES($1,$2,$3,'PUBLISHED_FIXED',NULL,$4,'{"scoring":"practice-binary-v1"}',clock_timestamp())`,[formId,runId,seeded.blueprintVersionId,hash]);
    await client.query("INSERT INTO tsa.form_sections(form_id,section_id,section,ordinal,duration_seconds,question_count) VALUES($1,'math-main','MATH',0,600,2)",[formId]);
    for(const [index,q] of [left,right].entries()) {
      const slotId=randomUUID();
      const snapshot={slotId,sectionId:'math-main',ordinal:index+1,stimulus:null,content:q.content,interaction:privateQuestionFixture.interaction};
      await client.query(`INSERT INTO tsa.form_slots(form_id,slot_id,section_id,ordinal,question_id,question_version_id,public_snapshot,snapshot_hash)
        VALUES($1,$2,'math-main',$3,$4,$5,$6::jsonb,$7)`,[formId,slotId,index+1,q.questionId,q.versionId,JSON.stringify(snapshot),hash]);
      await client.query(`INSERT INTO tsa_private.form_slot_secrets(form_id,slot_id,key_snapshot,explanation_snapshot,policy_version,secret_hash)
        VALUES($1,$2,$3::jsonb,$4::jsonb,'practice-binary-v1',$5)`,[formId,slotId,JSON.stringify(privateQuestionFixture.private.answerKey),JSON.stringify(privateQuestionFixture.private.explanation),hash]);
    }
  });
  const before=await preservedRows();
  const merged=await service.adjudicate(reviewer,randomUUID(),pair(left,right,await bankRevision()));
  assert.equal(merged.body.incidentRecorded,true);
  assert.deepEqual(await preservedRows(),before);
  const impact=(await harness.database.pool.query('SELECT affected_form_count,within_form_collision_count,cross_group_student_count FROM tsa_private.equivalence_merge_incidents WHERE retired_group_id=$1',[merged.body.retiredGroupId])).rows[0];
  assert.deepEqual(impact,{affected_form_count:'1',within_form_collision_count:'1',cross_group_student_count:'0'});
});

test('a late merge fault rolls back incident, memberships, resolutions, workflow, audit and receipt together',async()=>{
  const left=await newQuestion(),right=await newQuestion();
  const seeded=await seedBlueprint(left);
  await createForm(harness.database.pool,seeded,{publicSnapshotMutator:(snapshot)=>({...snapshot,stimulus:null})});
  const snapshot=async()=>{
    const result=await harness.database.pool.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM tsa.duplicate_relations r) AS relations,
      (SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM tsa.duplicate_groups g) AS groups,
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY question_id) FROM tsa.duplicate_group_members m) AS members,
      (SELECT jsonb_agg(to_jsonb(w) ORDER BY question_version_id) FROM tsa.question_workflow w) AS workflow,
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM tsa_private.equivalence_merge_incidents i) AS incidents,
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM tsa.audit_events a) AS audits,
      (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM tsa.idempotency_records r) AS receipts,
      (SELECT eligibility_revision::text FROM tsa.bank_state WHERE id=1) AS revision`);
    return result.rows[0];
  };
  const before=await snapshot(),historic=await preservedRows();
  const incidentCount=(before.incidents??[]).length;
  let observed=false;
  const pool={
    query:(...args)=>harness.bankPool.query(...args),
    async connect(){
      const client=await harness.bankPool.connect();
      return {release:(...args)=>client.release(...args),async query(sql,values){
        if(sql.includes('INSERT INTO tsa.audit_events') && values?.[2]==='BANK_EQUIVALENCE_CONFIRMED'){
          const visible=await client.query('SELECT count(*)::int AS count FROM tsa_private.equivalence_merge_incidents');
          assert.equal(visible.rows[0].count,incidentCount+1,'new incident exists inside losing transaction');
          observed=true;throw new Error('Injected late equivalence commit failure');
        }
        return client.query(sql,values);
      }};
    },
  };
  const failing=await createEquivalenceService({bankPool:pool,identityService:harness.identity});
  await assert.rejects(failing.adjudicate(reviewer,randomUUID(),pair(left,right,await bankRevision())),/Injected late equivalence commit failure/);
  assert.equal(observed,true);
  assert.deepEqual(await snapshot(),before);
  assert.deepEqual(await preservedRows(),historic);
});
