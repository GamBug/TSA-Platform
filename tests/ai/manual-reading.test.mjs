import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,writeFile,rm,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {makeFixtureInput,fixtureOutput,validateReadingInput} from '../../tools/question-factory/reading.mjs';
import {exportManualRequest,intakeManualOutput} from '../../tools/question-factory/manual.mjs';

async function setup(t){
  const root=await mkdtemp(join(tmpdir(),'tsa-manual-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const input=makeFixtureInput();input.sources=input.sources.slice(0,1);
  const prepared=await exportManualRequest({input,sourceProvenance:{kind:'AI_AUTHORED_EXPERIMENTAL',authorizationEvidence:'UNIT TEST ONLY; no actual content rights or model call.'},outputDirectory:join(root,'request')});
  const output=fixtureOutput(input.sources[0]),outputPath=join(root,'output.json'),declarationPath=join(root,'declaration.json');
  const declaration={schemaVersion:'manual-llm-declaration/1',operatorId:input.operatorId,model:'UNIT_TEST_ONLY',exactModelRevision:null,generatedAt:new Date().toISOString(),interface:'Test double, never an actual LLM',promptHash:prepared.request.promptHash,usage:null,usageVerification:'UNVERIFIED',evidenceNote:'Unit test fixture only; excluded from all actual LLM quality counts.'};
  const save=async()=>{await writeFile(outputPath,JSON.stringify(output));await writeFile(declarationPath,JSON.stringify(declaration));};await save();
  const intake=(name='review',extra={})=>intakeManualOutput({requestDirectory:prepared.directory,outputPath,declarationPath,outputDirectory:join(root,name),...extra});
  return {root,input,prepared,output,outputPath,declaration,declarationPath,save,intake};
}
test('single passage is explicit and default two-passage validator remains strict',async t=>{
  const f=await setup(t);assert.throws(()=>validateReadingInput(f.input));
  assert.equal(validateReadingInput(f.input,{sourceCount:1}).sources.length,1);
});
test('export contains complete schema, exact source and offset inventory without a model call',async t=>{
  const f=await setup(t),schema=JSON.parse(await readFile(join(f.prepared.directory,'schema.json'),'utf8'));
  assert.equal(schema.properties.questions.minItems,10);assert.equal(schema.additionalProperties,false);
  assert.equal(await readFile(join(f.prepared.directory,'source.txt'),'utf8'),f.input.sources[0].text);
  assert.ok((await readFile(join(f.prepared.directory,'prompt.md'),'utf8')).includes('outputJsonSchema'));
  for(const span of f.prepared.request.prompt.evidenceSpans)assert.equal(f.input.sources[0].text.slice(span.start,span.end),span.quote);
  assert.equal(f.prepared.request.providerCalled,false);
});
test('manual usage stays null, operator declarations stay declarations, no fake canonical package',async t=>{
  const f=await setup(t),result=await f.intake();
  assert.equal(result.report.questionsPassingDeterministicValidation,10);
  assert.equal(result.report.provenance.kind,'MANUAL_LLM_OUTPUT');assert.equal(result.report.provenance.usage,null);
  assert.equal(result.report.provenance.generationRunId,null);assert.equal(result.report.providerCalled,false);
  assert.equal(result.report.criticFlaggedQuestionCount,null);assert.equal(result.report.humanApprovedQuestions,0);
  assert.equal(result.report.canonicalImport.status,'BLOCKED_CONTRACT');
  assert.equal((await readdir(result.directory)).includes('package.json'),false);
  assert.equal((await stat(result.directory)).mode&0o077,0);
  assert.equal((await stat(join(result.directory,'review.html'))).mode&0o077,0);
});
test('internal experiment permission is retained without upgrading it to copyright ownership or publication approval',async t=>{
  const f=await setup(t),input=structuredClone(f.input);
  input.sources[0].rights={state:'INTERNAL_EXPERIMENT_AUTHORIZED',allowedUses:['DISPLAY','GENERATE'],territories:['VN'],validFrom:'2020-01-01T00:00:00Z',validUntil:null,evidence:'Unit-test internal permission only.',copyrightVerification:'UNVERIFIED',publicationPermission:false};
  const result=await exportManualRequest({input,sourceProvenance:{kind:'AI_AUTHORED_EXPERIMENTAL',authorizationEvidence:'Unit test only'},outputDirectory:join(f.root,'internal-request')});
  assert.equal(result.request.input.sources[0].rights.state,'INTERNAL_EXPERIMENT_AUTHORIZED');
  assert.equal(result.request.input.sources[0].rights.publicationPermission,false);
  assert.equal(result.request.sourceLength.whitespaceSegments,input.sources[0].text.split(/\s+/u).length);
});
test('bad evidence, wrong quota, repeated IDs and wrong keys cannot qualify the ten-question bundle',async t=>{
  const f=await setup(t),original=structuredClone(f.output);
  for(const [i,mutate] of [o=>o.questions[0].evidence.quote='Invented quote',o=>o.questions[0].cognitiveLevel='M3',o=>o.questions[1].id=o.questions[0].id,o=>o.questions[2].answerKey.optionId='unknown'].entries()){
    const output=structuredClone(original);mutate(output);await writeFile(f.outputPath,JSON.stringify(output));
    const result=await f.intake(`bad-${i}`);assert.equal(result.report.deterministicValidation.status,'FAIL');assert.equal(result.report.questionsPassingDeterministicValidation,0);
    assert.ok((await readFile(join(result.directory,'review.html'),'utf8')).includes('DRAFT'));
  }
});
test('invalid raw JSON is preserved and reviewed as failure, and untrusted HTML is escaped',async t=>{
  const f=await setup(t);await writeFile(f.outputPath,Buffer.from([123,255,125]));
  const invalid=await f.intake('encoding');assert.equal(invalid.report.deterministicValidation.status,'FAIL');
  assert.deepEqual(await readFile(join(invalid.directory,'generation.raw.json')),Buffer.from([123,255,125]));
  f.output.questions[0].content=[{type:'text',text:'<script>alert("do not execute")</script>'}];await f.save();
  const result=await f.intake('escaped'),html=await readFile(join(result.directory,'review.html'),'utf8');
  assert.equal(html.includes('<script>'),false);assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes("default-src 'none'"));
});
test('mismatched declarations and invented usage fail without importing',async t=>{
  const f=await setup(t);f.declaration.promptHash=`sha256:${'0'.repeat(64)}`;await f.save();
  await assert.rejects(f.intake('wrong-hash'),/DECLARATION_REQUEST_MISMATCH/);
  f.declaration.promptHash=f.prepared.request.promptHash;f.declaration.usage={inputTokens:0,outputTokens:0,costMicros:0};await f.save();
  await assert.rejects(f.intake('invented-usage'));
});
test('blinded critic omits keys and explanations; key/cognition/evidence flags and quality notes stay pending human review',async t=>{
  const f=await setup(t),first=await f.intake('before-critic');
  const prompt=await readFile(join(first.directory,'critic-prompt.md'),'utf8');
  assert.equal(prompt.includes('distractorReasons'),false);
  const criticRequest=JSON.parse(prompt.split('```json\n')[1].split('\n```')[0]);
  assert.ok(criticRequest.questions.every(q=>!Object.hasOwn(q,'answerKey')&&!Object.hasOwn(q,'explanation')));
  const declaration={...f.declaration,promptHash:first.report.criticPromptHash};
  const checks=f.output.questions.map(q=>({id:q.id,answerKey:q.answerKey,unambiguous:true,cognitiveLevelAppropriate:true,entailmentSupported:true,reason:'Unit test critique only.',evidenceQuote:q.evidence.quote}));
  checks[0].unambiguous=false;checks[1].cognitiveLevelAppropriate=false;checks[2].evidenceQuote='Invented critic quote';
  const criticPath=join(f.root,'critic.json'),criticDeclarationPath=join(f.root,'critic-declaration.json'),criticNotesPath=join(f.root,'notes.json');
  await writeFile(criticPath,JSON.stringify({checks}));await writeFile(criticDeclarationPath,JSON.stringify(declaration));
  await writeFile(criticNotesPath,JSON.stringify({provenance:'TRANSCRIBED_FROM_RECORDED_CRITIC_MESSAGE',notes:[{questionId:checks[3].id,code:'WEAK_DISTRACTORS',reason:'Unit test caution.'}]}));
  const result=await f.intake('after-critic',{criticPath,criticDeclarationPath,criticNotesPath});
  assert.equal(result.report.criticHardFlaggedQuestionCount,3);assert.equal(result.report.criticFlaggedQuestionCount,4);assert.equal(result.report.humanApprovedQuestions,0);
  assert.ok(result.report.criticFlags.some(f=>f.codes.includes('CRITIC_EVIDENCE_MISMATCH')));
});
test('private staging cannot be exported through the existing public asset tree',async t=>{
  const f=await setup(t);
  await assert.rejects(exportManualRequest({input:f.input,sourceProvenance:{kind:'AI_AUTHORED_EXPERIMENTAL',authorizationEvidence:'Unit test only'},outputDirectory:resolve('apps/practice-prototype/public/manual-stage-test')}),/OUTSIDE_PUBLIC_ROOT/);
});
