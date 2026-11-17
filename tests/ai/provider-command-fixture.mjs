// Local subprocess protocol test double. No network, credentials or LLM inference.
import { fixtureOutput } from '../../tools/question-factory/reading.mjs';
let bytes='';for await(const chunk of process.stdin)bytes+=chunk;
const request=JSON.parse(bytes),mode=process.argv[2];
if(mode==='check-env'&&(process.env.TSA_SELECTED_KEY!=='synthetic-selected'||process.env.TSA_UNRELATED_KEY!==undefined))process.exit(2);
if(mode==='timeout'){setTimeout(()=>process.exit(0),5000);}
else if(mode==='malformed'){process.stdout.write('not-json');}
else if(mode==='invalid-utf8'){
  const bytes=Buffer.from(JSON.stringify({candidates:[],providerRunRef:'X',modelRevision:'TEST_DOUBLE',usage:{inputTokens:0,outputTokens:0,costMicros:0},finishReason:'COMPLETE'}));
  bytes[bytes.indexOf(88)]=255;process.stdout.write(bytes);
}
else{
  const source={text:request.prompt.sourceData,skillId:request.prompt.skillId??'READING_REASONING'};
  const draft=fixtureOutput(source);
  const candidates=request.kind==='GENERATE'?draft.questions:draft.questions.map(q=>({id:q.id,answerKey:q.answerKey,
    unambiguous:mode!=='disagree',reason:'Synthetic local test double agreement.',evidenceQuote:q.evidence.quote}));
  process.stdout.write(JSON.stringify({candidates,providerRunRef:'test-double-reference',modelRevision:'TEST_DOUBLE',
    usage:{inputTokens:11,outputTokens:22,costMicros:mode==='over-budget'?1:mode==='check-env'?null:0},finishReason:mode==='refuse'?'REFUSED':'COMPLETE'}));
}
