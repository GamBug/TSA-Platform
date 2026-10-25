import { randomUUID } from 'node:crypto';
import { StaffFixedRehearsalBlueprintListSchema, StaffFixedRehearsalRequestSchema, StaffFixedRehearsalReceiptSchema,
  StaffFixedRehearsalListSchema, StaffFixedRehearsalDiagnosticSchema } from '../../../packages/contracts/dist/staff.js';
import { BlueprintConfigSchema, canonicalize, parseFixedAssemblyManifest, runFixedAssemblyReference } from '../../../packages/contracts/dist/internal.js';
import { assertBankConnection, reject, requireActor, UUID_PATTERN, jsonDigest, withIdempotency } from './common.mjs';
import { withTransaction } from '../database/pool.mjs';

const fail = () => reject(503, 'TEMPORARILY_UNAVAILABLE');
const same = (a,b) => Buffer.from(canonicalize(a)).equals(Buffer.from(canonicalize(b)));
const capped = (schema,value) => {
  const result=schema.parse(value);
  if(Buffer.byteLength(JSON.stringify(result))>1024*1024) fail();
  return result;
};
async function sql(client,text,values) {
  try { return await client.query(text,values); }
  catch(error) {
    if(error?.code==='42501') reject(403,'FORBIDDEN');
    if(error?.code==='40001') reject(409,'CONCURRENT_MODIFICATION');
    if(error?.code==='22023') reject(422,'VALIDATION_ERROR');
    throw error;
  }
}
const metadata = (observedAt,accessBasis) => ({environment:'LOCAL_SYNTHETIC_ONLY',accessBasis,observedAt});
function receipt(row,manifest,result) {
  const section=manifest.blueprint.sections[0];
  // Only a provable cardinality lower bound is disclosed, never a quota guess.
  const capacity=new Set(manifest.units.flatMap(unit=>unit.members.map(member=>member.groupId))).size;
  const sectionDeficits=result.status==='FAILURE'&&result.code==='INSUFFICIENT_ELIGIBLE_INVENTORY'&&capacity<section.count
    ? [{section:section.section,missingCount:section.count-capacity}] : [];
  return capped(StaffFixedRehearsalReceiptSchema,{rehearsalId:row.rehearsalId,blueprintVersionId:manifest.blueprintVersionId,
    blueprintHash:manifest.blueprintHash,windowMinutes:row.windowMinutes,capturedAt:row.capturedAt,
    availableUntil:row.availableUntil,requiredThrough:row.requiredThrough,outcome:result.status,
    failureCode:result.status==='FAILURE'?result.code:null,sectionDeficits,createsForm:false,currentEligibility:'NOT_REVALIDATED'});
}

/** Local diagnostic only: no form, attempt, history, eligibility or publication writes. */
export async function createFixedStockRehearsalService({bankPool,identityService}) {
  await assertBankConnection(bankPool);
  function actor(principal,role) {
    requireActor(identityService,principal,role==='EXAM_MANAGER'?'exam.assembly.write':'bank.diagnostics.read');
    if(!principal.roles?.includes(role)) reject(403,'FORBIDDEN');
  }
  async function blueprints(principal) {
    actor(principal,'EXAM_MANAGER');
    return withTransaction(bankPool,async client=>{
      const value=(await sql(client,'SELECT tsa.fixed_stock_blueprints($1) AS value',[principal.userId])).rows[0].value;
      try {return capped(StaffFixedRehearsalBlueprintListSchema,{...metadata(value.observedAt,'EXAM_MANAGER'),
        schemaVersion:'staff-fixed-rehearsal-blueprints/1',limit:20,truncated:value.truncated,items:value.items});}catch{fail();}
    },{role:'tsa_bank'});
  }
  async function create(principal,input,key) {
    actor(principal,'EXAM_MANAGER');
    const validated=StaffFixedRehearsalRequestSchema.safeParse(input);
    if(!validated.success) reject(422,'VALIDATION_ERROR');
    // SQL current-role verification also precedes historical idempotent replay.
    const enabled=await withTransaction(bankPool,async client=>(await sql(client,'SELECT tsa.fixed_stock_exam_actor($1) AS allowed',[principal.userId])).rows[0].allowed,{role:'tsa_bank'});
    if(!enabled) reject(403,'FORBIDDEN');
    const response=await withIdempotency(bankPool,principal,key,'POST /api/v1/fixed-rehearsals',validated.data,async client=>{
      const request=validated.data;
      const captured=(await sql(client,'SELECT tsa.fixed_stock_capture($1,$2,$3,$4) AS value',
        [principal.userId,request.blueprintVersionId,request.blueprintHash,request.windowMinutes])).rows[0].value;
      if(!captured) reject(404,'NOT_FOUND');
      const stock=captured.stock;
      if(stock.overflow) fail();
      let parsed,result;
      try {
        const blueprint=BlueprintConfigSchema.parse(stock.blueprint);
        parsed=parseFixedAssemblyManifest({schemaVersion:'fixed-assembly-manifest/1',algorithmVersion:'assembly/1',
          formMode:'PUBLISHED_FIXED',reuseMode:'FIXED_AS_PUBLISHED',blueprintVersionId:request.blueprintVersionId,
          blueprintHash:stock.blueprintHash,blueprint,seed:request.seed??42,bankRevision:stock.bankRevision,
          rightsVersions:stock.rightsVersions.map(({sourceId,versionId,decision})=>({sourceId,versionId,contentHash:jsonDigest(decision)})),
          units:stock.units,conflicts:stock.conflicts,limits:{maxNodes:50000,maxUnits:2000}});
        result=runFixedAssemblyReference(parsed.manifest);
      } catch {fail();}
      const rehearsalId=randomUUID();
      const body=receipt({...captured,rehearsalId,windowMinutes:request.windowMinutes},parsed.manifest,result);
      await client.query('SELECT tsa.fixed_stock_store($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
        [principal.userId,rehearsalId,request.windowMinutes,captured.capturedAt,captured.availableUntil,captured.requiredThrough,
          Buffer.from(parsed.bytes).toString('utf8'),parsed.manifestHash,JSON.stringify(result)]);
      return {status:201,body,resourceId:rehearsalId};
    });
    return {...response,body:capped(StaffFixedRehearsalReceiptSchema,response.body)};
  }
  async function read(principal,id=null) {
    actor(principal,'BANK_MANAGER');
    if(id!==null&&!UUID_PATTERN.test(id)) reject(404,'NOT_FOUND');
    return withTransaction(bankPool,async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const value=(await sql(client,'SELECT tsa.fixed_stock_snapshot($1,$2) AS value',[principal.userId,id])).rows[0].value;
      if(!value) reject(404,'NOT_FOUND');
      try {
        if(id===null) return capped(StaffFixedRehearsalListSchema,{...metadata(value.observedAt,'BANK_MANAGER'),
          schemaVersion:'staff-fixed-rehearsals/1',limit:20,truncated:value.truncated,items:value.items});
        const row=value.rehearsal,parsed=parseFixedAssemblyManifest(row.manifest),manifest=parsed.manifest;
        if(row.rehearsalId!==id||row.blueprintVersionId!==manifest.blueprintVersionId||parsed.manifestHash!==row.manifestHash||!same(row.manifest,manifest)) fail();
        const result=runFixedAssemblyReference(manifest);
        if(!same(result,row.result)) fail();
        const section=manifest.blueprint.sections[0];
        const micros=value=>BigInt(Date.parse(value.slice(0,19)+'Z'))*1000n+BigInt(value.slice(20,26));
        if(micros(row.requiredThrough)-micros(row.availableUntil)!==BigInt(600+section.durationSeconds)*1000000n) fail();
        return capped(StaffFixedRehearsalDiagnosticSchema,{...metadata(value.observedAt,'BANK_MANAGER'),
          schemaVersion:'staff-fixed-rehearsal-diagnostic/1',captureOrigin:'BANK_ELIGIBLE_AT_CAPTURE',currentEligibility:'NOT_REVALIDATED',
          qualification:'NOT_ATTESTED_BY_PLATFORM',publicationEligibility:'NOT_EVALUATED',rehearsal:receipt(row,manifest,result),
          replayVerified:true,createsForm:false,capturedUnitCount:manifest.units.length,
          capturedCandidateCount:manifest.units.reduce((sum,unit)=>sum+unit.members.length,0),selectedCount:result.slots.length,
          visitedNodes:result.visitedNodes,nodeLimit:manifest.limits.maxNodes,unitLimit:manifest.limits.maxUnits,
          section:{section:section.section,requiredCount:section.count,selectedCount:result.slots.length}});
      } catch {fail();}
    },{role:'tsa_bank'});
  }
  return Object.freeze({blueprints,create,list:principal=>read(principal),read});
}
