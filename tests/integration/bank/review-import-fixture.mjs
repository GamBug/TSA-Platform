import { buildSyntheticFactoryPackageV2 } from '../../../packages/contracts/test/fixtures/factory-package-v2.ts';
import { computeQuestionIdentity, createReferenceHash } from '../../../packages/contracts/dist/internal.js';

/** Original engineering transport; no source rights are approved by this fixture. */
export async function inspectionImportPackage(pool, authorId) {
  const pkg=buildSyntheticFactoryPackageV2({withDistinctStimulusProvenance:true,withDistinctParentProvenance:true});
  const tax=(await pool.query(`SELECT tv.*,jsonb_agg(jsonb_build_object('id',n.id,'code',n.code,'kind',n.kind,'parentId',n.parent_id,'metadata',n.metadata) ORDER BY n.code) AS nodes
    FROM tsa.taxonomy_versions tv JOIN tsa.taxonomy_nodes n ON n.taxonomy_version_id=tv.id
    WHERE tv.id='10000000-0000-4000-8000-000000000001' GROUP BY tv.id`)).rows[0];
  const taxonomy=pkg.references.find((node)=>node.kind==='taxonomy');
  const oldId=taxonomy.id;
  taxonomy.id=tax.id;
  taxonomy.payload={schemaVersion:'taxonomy/1',taxonomyVersionId:tax.id,name:tax.name,versionNo:tax.version_no,definitionHash:tax.definition_hash,nodes:tax.nodes};
  for(const question of [...pkg.candidates.map((candidate)=>candidate.question),...pkg.references.filter((node)=>node.kind==='question').map((node)=>node.payload)]){
    question.taxonomyVersionId=tax.id;question.domainId='MATH';question.skillIds=['ALGEBRA'];question.subskillIds=[];question.createdBy=authorId;
  }
  for(const node of pkg.references) for(const ref of node.references) if(ref.kind==='taxonomy'&&ref.id===oldId) ref.id=tax.id;
  const byKey=new Map(pkg.references.map((node)=>[`${node.kind}:${node.id}`,node]));
  const cache=new Map();
  function hash(node){
    const key=`${node.kind}:${node.id}`;if(cache.has(key))return cache.get(key);
    const value=createReferenceHash({kind:node.kind,id:node.id,payload:node.payload,references:node.references.map((ref)=>({...ref,contentHash:hash(byKey.get(`${ref.kind}:${ref.id}`))}))});
    cache.set(key,value);node.contentHash=value;return value;
  }
  pkg.references.forEach(hash);
  for(const candidate of pkg.candidates){
    const found=new Map();
    const visit=(ref)=>{const key=`${ref.kind}:${ref.id}`;if(found.has(key))return;const node=byKey.get(key);if(!node)throw new Error('Missing original fixture reference');found.set(key,node);node.references.forEach(visit);};
    const question=candidate.question;
    const roots=[{kind:'taxonomy',id:question.taxonomyVersionId},...question.provenanceIds.map((id)=>({kind:'provenance',id})),...question.private.evidenceRefs.map((id)=>({kind:'evidence',id}))];
    if(question.parentVersionId)roots.push({kind:'question',id:question.parentVersionId});
    if(question.stimulusVersionId)roots.push({kind:'stimulus',id:question.stimulusVersionId});
    roots.forEach(visit);
    const contentHash=computeQuestionIdentity(question,[...found.values()]).contentHash;
    question.contentHash=contentHash;candidate.contentHash=contentHash;
    for(const validation of candidate.validations)validation.inputHash=contentHash;
  }
  return pkg;
}
