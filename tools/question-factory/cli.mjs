import { mkdir, open, readFile, rename, lstat, realpath } from 'node:fs/promises';
import { resolve, join, dirname, basename, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROMPT_VERSION, VALIDATOR_VERSION, digest, generateDryRun, makeFixtureInput, validateReadingInput } from './reading.mjs';
import { parseFactoryPackageV2 } from '../../packages/contracts/dist/internal.js';
import { configuredProvider, generateWithProvider } from './providers.mjs';

async function privateWrite(path,value) {
  const handle=await open(path,'wx',0o600);
  try{await handle.writeFile(`${JSON.stringify(value,null,2)}\n`);await handle.sync();}finally{await handle.close();}
}
async function jsonFile(path){
  const stat=await lstat(path);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>16*1024*1024)throw new Error('INVALID_OR_OVERSIZED_INPUT_FILE');
  return JSON.parse(await readFile(path,'utf8'));
}
/** Directory checkpoints are private evidence only, never a second question bank. */
export async function runOffline({input,outputDirectory,providerConfig,env=process.env}={}) {
  input=validateReadingInput(input);
  const directory=resolve(outputDirectory);
  const actualTarget=join(await realpath(dirname(directory)),basename(directory));
  const publicRoot=await realpath(fileURLToPath(new URL('../../apps/practice-prototype/public/',import.meta.url)));
  const fromPublic=relative(publicRoot,actualTarget);
  if(fromPublic==='' || (!fromPublic.startsWith(`..${sep}`)&&fromPublic!=='..'&&!isAbsolute(fromPublic)))throw new Error('RUN_ARTIFACTS_MUST_STAY_OUTSIDE_WEBSITE_PUBLIC_ROOT');
  const plan={schemaVersion:'reading-run-plan/1',toolVersion:'reading-experiment/1',promptVersion:PROMPT_VERSION,validatorVersion:VALIDATOR_VERSION,
    inputHash:digest(input),providerConfigHash:providerConfig?digest(providerConfig):null,
    mode:providerConfig?'OPERATOR_PROVIDER':'DRY_RUN_FIXTURE'};
  try{await mkdir(directory,{mode:0o700});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const stat=await lstat(directory);
    if(!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode&0o077)!==0)throw new Error('PRIVATE_RUN_DIRECTORY_REQUIRED');
    const saved=await jsonFile(join(directory,'plan.json'));
    if(digest(saved)!==digest(plan))throw new Error('RUN_IDENTITY_CONFLICT');
    try{
      const result=await jsonFile(join(directory,'completed.json'));
      const pkg=await jsonFile(join(directory,'package.json')),report=await jsonFile(join(directory,'report.json'));
      if(result.packageHash!==digest(pkg)||result.reportHash!==digest(report))throw new Error('RUN_INTEGRITY_CONFLICT');
      return {package:parseFactoryPackageV2(pkg),report,replayed:true};
    }catch(error){if(error.code!=='ENOENT')throw error;throw new Error('INCOMPLETE_RUN_REQUIRES_OPERATOR_RECONCILIATION_NO_AUTOMATIC_REDISPATCH');}
  }
  await privateWrite(join(directory,'plan.json'),plan);
  await privateWrite(join(directory,'input.json'),input);
  try{
    const result=providerConfig?await generateWithProvider(input,configuredProvider(providerConfig,{env}),{
      checkpoint:(name,value)=>privateWrite(join(directory,`${name}.json`),value),
    }):await generateDryRun(input);
    await privateWrite(join(directory,'package.json'),result.package);
    await privateWrite(join(directory,'report.json'),result.report);
    await privateWrite(join(directory,'completed.pending'),{packageHash:digest(result.package),reportHash:digest(result.report)});
    await rename(join(directory,'completed.pending'),join(directory,'completed.json'));
    return {...result,replayed:false};
  }catch(error){
    // Do not serialize exception messages or provider stderr into public output.
    const code=error.code??(/^[A-Z_]+$/.test(error.message??'')?error.message:'INVALID_SCHEMA_OR_CONTENT');
    await privateWrite(join(directory,'failure.json'),{status:'FAILED_REQUIRES_OPERATOR_RECONCILIATION',code,
      schemaIssues:error.issues?.map(issue=>({code:issue.code,path:issue.path})),at:new Date().toISOString()});
    throw error;
  }
}
export async function main(args=process.argv.slice(2)) {
  const [command,...rest]=args;
  if(command==='fixture-input'&&rest.length===1){await privateWrite(resolve(rest[0]),makeFixtureInput());return;}
  if(!['dry-run','run'].includes(command)||![2,3].includes(rest.length)||(command==='run'&&rest.length!==3)||(command==='dry-run'&&rest.length!==2)){
    throw new Error('Usage: fixture-input FILE | dry-run INPUT_JSON PRIVATE_NEW_RUN_DIR | run INPUT_JSON PRIVATE_NEW_RUN_DIR PROVIDER_CONFIG_JSON');
  }
  const result=await runOffline({input:await jsonFile(resolve(rest[0])),outputDirectory:rest[1],
    providerConfig:command==='run'?await jsonFile(resolve(rest[2])):undefined});
  process.stdout.write(`${JSON.stringify({mode:result.report.fixture?'DRY_RUN_FIXTURE':'OPERATOR_PROVIDER',questions:result.package.candidates.length,
    deterministicValidation:result.report.deterministicValidation,humanReview:result.report.humanReview,publication:result.report.publication,
    replayed:result.replayed,outputDirectory:resolve(rest[1])})}\n`);
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{await main();}catch(error){process.stderr.write(`Offline Factory failed: ${error.code??'INVALID_INPUT_OR_RUN'}. Inspect private run evidence; no automatic retry.\n`);process.exitCode=1;}
}
