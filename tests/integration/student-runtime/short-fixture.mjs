import {randomUUID} from 'node:crypto';
import {jsonDigest} from '../../../src/modules/bank/common.mjs';

/** Owner-only setup of immutable original synthetic profiles, never a student request. */
export async function seedShortStudentProfiles(fixture) {
 const profiles=[];
 for(const [domain,parent] of Object.entries(fixture.domainBlueprints??{MATH:fixture.blueprint})){
  if(!['MATH','SCIENCE'].includes(domain))continue;
  const config=structuredClone(parent.config);
  config.name=domain==='MATH'?'Bài Toán ngắn':'Bài Khoa học ngắn';
  config.sections=[{...config.sections[0],count:2,durationSeconds:180}];
  config.quotas=config.quotas.map(quota=>({...quota,min:Math.min(quota.min,2),max:Math.min(quota.max,2)}));
  const id=randomUUID(),versionId=randomUUID(),contentHash=jsonDigest(config);
  await fixture.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)',[id,config.name]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`,[versionId,id,config.taxonomyVersionId,config,contentHash]);
  await fixture.pool.query(`INSERT INTO tsa_private.short_practice_profiles(blueprint_version_id,parent_blueprint_version_id,blueprint_hash,parent_hash)
    VALUES($1,$2,$3,$4)`,[versionId,parent.versionId,contentHash,parent.contentHash]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`,[versionId]);
  profiles.push({id,versionId,contentHash,config,domain,parentBlueprintVersionId:parent.versionId});
 }
 return profiles;
}
