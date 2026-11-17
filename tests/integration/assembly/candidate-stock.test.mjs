import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { test } from 'node:test';
import { createBankHarness, loginActor, bankRequest } from '../bank/harness.mjs';
import { ensureLocalTaxonomy, createPrivateTemplate, LOCAL_TAXONOMY } from '../../../src/local/seed.mjs';
import { privateQuestionFixture } from '../../../apps/practice-prototype/src/private-question-fixture.mjs';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { captureStandaloneManifest } from '../../../src/modules/assembly/candidate-stock.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';

const hash=`sha256:${'4'.repeat(64)}`;
const rubric=Object.fromEntries(['correctness','unambiguous','relevant','language','explanation','rights'].map(k=>[k,true]));
test('PostgreSQL eligible standalone stock feeds frozen assembly/1 without allocating or authorizing production inventory',async()=>{
  const h=await createBankHarness();
  try {
    await ensureLocalTaxonomy(h.database.pool);
    const browsers=Object.fromEntries(await Promise.all(['author','reviewer','bankManager','studentA','studentB'].map(async key=>[key,await loginActor(h,key)])));
    const actors=Object.fromEntries(await Promise.all(Object.entries(browsers).map(async([key,b])=>[key,await h.identity.authenticate(new Request(h.origin,{headers:{cookie:b.cookies.join('; ')}}))])));
    const post=async(key,path,body)=>{
      const response=await bankRequest(h,browsers[key],path,{method:'POST',key:randomUUID(),body});
      assert.equal(response.status,201,await response.clone().text());return response.json();
    };
    const {sourceId}=await post('author','/api/v1/sources',{title:'Synthetic assembly stock only',canonicalUri:null,origin:'OWNED'});
    const {sourceVersionId}=await post('author',`/api/v1/sources/${sourceId}/versions`,{contentHash:hash,evidenceUri:'manual://synthetic',metadata:{}});
    const {decisionId}=await post('bankManager',`/api/v1/source-versions/${sourceVersionId}/rights`,{status:'OWNED',allowedUses:['DISPLAY'],territory:['VN'],validFrom:'2000-01-01T00:00:00Z',validTo:null,evidence:'Synthetic attestation, not real review.',expectedRevision:0});
    const fixtureScopeId=randomUUID();
    await h.database.pool.query(`INSERT INTO tsa_private.bank_workflow_fixture_scope(scope_id,database_oid,postmaster_started_at)
      SELECT $1,oid,pg_postmaster_start_time() FROM pg_database WHERE datname=current_database()`,[fixtureScopeId]);
    const workflow=await createPublicationService({bankPool:h.bankPool,identityService:h.identity,fixtureScopeId});
    const template=createPrivateTemplate({sourceVersionId,decisionId});
    const draft=await post('author','/api/v1/questions',{
      schemaVersion:'question/1',language:'vi-VN',section:'MATH',taxonomyVersionId:template.taxonomyVersionId,
      domainId:template.domainId,skillIds:template.skillIds,subskillIds:[],cognitiveLevel:null,targetDifficulty:'EASY',
      content:[{type:'text',text:'Synthetic assembly question'}],interaction:privateQuestionFixture.interaction,
      answerKey:privateQuestionFixture.private.answerKey,explanation:privateQuestionFixture.private.explanation,
      stimulusVersionId:null,evidenceRefs:template.evidenceRefs,origin:'MANUAL',provenance:template.provenance,
    });
    const blueprintVersionId=randomUUID(),blueprintId=randomUUID();
    const blueprint={schemaVersion:'blueprint/1',name:'Synthetic stock adapter fixture',taxonomyVersionId:LOCAL_TAXONOMY.taxonomyVersionId,
      profileKind:'INDEPENDENT_PRACTICE',evidenceIds:['synthetic'],sections:[{id:'math',section:'MATH',count:1,durationSeconds:600}],allowedTypes:['SINGLE_CHOICE'],quotas:[{sectionId:'math',dimension:'SKILL',value:LOCAL_TAXONOMY.skillId,min:1,max:1}],maxPerSource:null,excludedQuestionIds:[],bundlePolicy:'ALL_OR_NONE',scoringPolicy:'practice-binary-v1',releasePolicy:'after-grade-v1'};
    const blueprintHash=`sha256:${createHash('sha256').update(canonicalize(blueprint)).digest('hex')}`;
    await h.database.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)',[blueprintId,blueprint.name]);
    await h.database.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
      VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`,[blueprintVersionId,blueprintId,LOCAL_TAXONOMY.taxonomyVersionId,blueprint,blueprintHash]);
    await h.database.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
      VALUES($1,true,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',600)`,[blueprintVersionId]);
    const capture=(principal=actors.studentA)=>captureStandaloneManifest({examPool:h.database.pool,identityService:h.identity,principal,blueprintVersionId,seed:17,limits:{maxNodes:100,maxUnits:100}});
    await assert.rejects(capture(actors.author),e=>e.code==='FORBIDDEN');
    assert.equal((await capture()).manifest.units.length,0,'drafts are never stock');
    await workflow.submitReview(actors.author,draft.versionId,randomUUID(),{expectedRevision:1});
    await workflow.confirmSingleton(actors.reviewer,draft.versionId,randomUUID(),{expectedRevision:2,contentHash:draft.contentHash,reason:'Synthetic singleton.'});
    assert.equal((await capture()).manifest.units.length,0,'review pending is never stock');
    await workflow.review(actors.reviewer,draft.versionId,randomUUID(),{expectedRevision:2,contentHash:draft.contentHash,decision:'APPROVE',rubric,reason:'Isolated synthetic review simulation.'});
    const first=await capture();
    assert.equal(first.result.status,'SUCCESS');
    assert.deepEqual(first.manifest.units[0].members[0].skillIds,[LOCAL_TAXONOMY.skillId]);
    assert.equal(first.result.slots[0].questionVersionId,draft.versionId);
    assert.equal(first.manifestHash,(await capture()).manifestHash);
    assert.equal(JSON.stringify(first).includes('answerKey'),false);
    assert.equal(JSON.stringify(first).includes('explanation'),false);
    assert.equal(first.manifest.rightsVersions[0].versionId,decisionId);
    await h.database.pool.query('INSERT INTO tsa.student_question_history(user_id,question_id) VALUES($1,$2)',[actors.studentA.userId,draft.questionId]);
    const seen=await capture();
    assert.equal(seen.result.code,'INSUFFICIENT_UNSEEN_INVENTORY');
    assert.equal((await capture(actors.studentB)).result.status,'SUCCESS');
    assert.equal((await h.database.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n,0);
    assert.equal((await h.database.pool.query('SELECT count(*)::int AS n FROM tsa.forms')).rows[0].n,0);
    await post('bankManager',`/api/v1/source-versions/${sourceVersionId}/rights`,{status:'OWNED',allowedUses:['DISPLAY'],territory:['VN'],validFrom:'2000-01-01T00:00:00Z',validTo:new Date(Date.now()+3600000).toISOString(),evidence:'Synthetic short permission.',expectedRevision:1});
    assert.equal((await capture(actors.studentB)).manifest.units.length,0,'rights must cover admission plus duration');
    for (const role of ['tsa_web','tsa_bank','tsa_identity','tsa_factory']) await assert.rejects(
      withTransaction(h.database.pool,c=>c.query('SELECT tsa.assembly_standalone_stock($1)',[blueprintVersionId]),{role}),{code:'42501'});
    await assert.rejects(withTransaction(h.database.pool,c=>c.query('SELECT tsa.assembly_standalone_stock($1)',[blueprintVersionId]),{role:'tsa_exam'}),{code:'42501'});
  } finally {await h.close();}
});
