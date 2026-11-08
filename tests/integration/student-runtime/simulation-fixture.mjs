import sharp from 'sharp';
import { createLocalImageStore } from '../../../src/modules/media/local-image-store.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { bankRequest } from '../bank/harness.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { backupLocalDatabase } from '../../../src/local/database-backup.mjs';
import { FULL_SIMULATION_SECTIONS } from '../../../packages/contracts/src/simulation.ts';

/** Disposable original inventory; fixture approvals confer no human corpus approval. */
export async function createSimulationFixture() {
  const f = await createAllocationFixture({questionCount:0});
  const root = await mkdtemp(path.join(tmpdir(),'tsa-simulation-fixture-'));
  const close = f.close;
  f.close = async () => { try { await close(); } finally { await rm(root,{recursive:true,force:true}); } };
  try {
    await backupLocalDatabase({connectionConfig:f.harness.database.connectionConfig,directory:path.join(root,'before-synthetic-inventory')});
    f.imageStore=await createLocalImageStore({rootDirectory:path.join(root,'images'),enabled:true,env:{NODE_ENV:'test',LOCAL_SYNTHETIC_ONLY:'true'}});
    f.assets={};
    for(const section of FULL_SIMULATION_SECTIONS) {
      f.assets[section.id]={};
      for(const purpose of ['QUESTION','EXPLANATION']) {
        const bytes=await sharp({create:{width:120,height:80,channels:3,background:purpose==='QUESTION'?'#96221e':'#254e62'}}).png().toBuffer();
        const contentHash='sha256:'+createHash('sha256').update(bytes).digest('hex'),id=randomUUID();
        await f.imageStore.inspectAndStore({bytes,contentHash,mediaType:'image/png'});
        await f.pool.query(`INSERT INTO tsa.asset_versions(id,source_version_id,object_key,content_hash,mime,byte_size,alt_metadata,security_class)
          VALUES($1,$2,$3,$4,'image/png',$5,'{"syntheticOnly":true}',$6)`,[id,f.source.sourceVersionId,'synthetic:'+id,contentHash,bytes.length,purpose]);
        f.assets[section.id][purpose]={id,bytes};
      }
    }
    f.workflow=await createPublicationService({bankPool:f.bankPool,identityService:f.identityService,fixtureScopeId:f.fixtureScopeId,imageStore:f.imageStore});
    const taxonomyVersionId=randomUUID();
    const domains=FULL_SIMULATION_SECTIONS.map(s=>({...s,domainId:randomUUID(),skillId:randomUUID()}));
    const definition={schemaVersion:'taxonomy/1',taxonomyVersionId,name:'Synthetic simulation taxonomy',versionNo:1,
      nodes:domains.flatMap(s=>[{id:s.domainId,code:s.section,kind:'DOMAIN',parentId:null,metadata:{}},
        {id:s.skillId,code:s.section+'_REASONING',kind:'SKILL',parentId:s.domainId,metadata:{}}])};
    await withTransaction(f.pool, async client => {
    await client.query('INSERT INTO tsa.taxonomy_versions(id,name,version_no,definition_hash) VALUES($1,$2,1,$3)',[taxonomyVersionId,definition.name,jsonDigest(definition)]);
    for(const s of domains) await client.query(`INSERT INTO tsa.taxonomy_nodes(id,taxonomy_version_id,code,kind,parent_id,metadata)
      VALUES($1,$3,$4,'DOMAIN',NULL,'{}'),($2,$3,$5,'SKILL',$1,'{}')`,[s.domainId,s.skillId,taxonomyVersionId,s.section,s.section+'_REASONING']);
    });
    const template=createPrivateTemplate(f.source), questions=[];
    for(const s of domains) for(let index=0;index<s.count;index++) {
      const text=value=>[{type:'text',text:value}];
      const response=await bankRequest(f.harness,f.browsers.author,'/api/v1/questions',{method:'POST',key:randomUUID(),body:{
        schemaVersion:'question/1',language:'vi-VN',section:s.section,taxonomyVersionId,domainId:s.domainId,skillIds:[s.skillId],subskillIds:[],
        cognitiveLevel:null,targetDifficulty:'EASY',content:[...text(`SYNTHETIC_${s.section}_${index+1}: Select the label B. Original engineering fixture; unofficial practice.`),...(index===0?[{type:'image',assetVersionId:f.assets[s.id].QUESTION.id,alt:'Original synthetic red rectangle.'}]:[])],
        interaction:{type:'SINGLE_CHOICE',options:['a','b','c'].map(id=>({id,content:text(id.toUpperCase())}))},
        answerKey:{type:'SINGLE_CHOICE',optionId:'b'},explanation:[...text(`SIMULATION_PRIVATE_${s.section}_${index+1}: B is the stated label.`),...(index===0?[{type:'image',assetVersionId:f.assets[s.id].EXPLANATION.id,alt:'Original synthetic explanation rectangle.'}]:[])],
        stimulusVersionId:null,evidenceRefs:template.evidenceRefs,origin:'MANUAL',provenance:template.provenance}});
      const q=await response.json(); if(response.status!==201)throw new Error(`Simulation draft failed: ${q.error?.code}`);
      await f.workflow.submitReview(f.principals.author,q.versionId,randomUUID(),{expectedRevision:1});
      await f.workflow.confirmSingleton(f.principals.reviewer,q.versionId,randomUUID(),{expectedRevision:2,contentHash:q.contentHash,reason:'Original disposable simulation fixture.'});
      await f.workflow.review(f.principals.reviewer,q.versionId,randomUUID(),{expectedRevision:2,contentHash:q.contentHash,decision:'APPROVE',
        rubric:Object.fromEntries(['correctness','unambiguous','relevant','language','explanation','rights'].map(k=>[k,true])),reason:'Synthetic technical fixture only; no human corpus approval.'});
      questions.push(q);
    }
    const config={...structuredClone(f.blueprint.config),schemaVersion:'blueprint/3',profileKind:'FULL_SIMULATION',
      name:'Full simulation — original synthetic inventory',taxonomyVersionId,sections:FULL_SIMULATION_SECTIONS.map(s=>({...s})),quotas:[]};
    const id=randomUUID(),versionId=randomUUID(),contentHash=jsonDigest(config);
    await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)',[id,config.name]);
    await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
      VALUES($1,$2,$3,1,'blueprint/3',$4,$5)`,[versionId,id,taxonomyVersionId,config,contentHash]);
    await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
      VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`,[versionId]);
    await f.pool.query('UPDATE tsa.blueprint_offerings SET enabled=false,revision=revision+1 WHERE blueprint_version_id=$1',[f.blueprint.versionId]);
    f.blueprint={id,versionId,config,contentHash};f.questions=questions;
    f.expireSection=async(attemptId,sectionId)=>{
      await backupLocalDatabase({connectionConfig:f.harness.database.connectionConfig,directory:path.join(root,randomUUID())});
      await f.pool.query(`UPDATE tsa_private.simulation_section_clocks SET elapsed_seconds=budget_seconds-1,
        opened_at=clock_timestamp()-interval '2 seconds' WHERE attempt_id=$1 AND section_id=$2 AND opened_at IS NOT NULL`,[attemptId,sectionId]);
    };
    return f;
  } catch(error) {await f.close();throw error;}
}
