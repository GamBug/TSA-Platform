import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSimulationFixture} from '../tests/integration/student-runtime/simulation-fixture.mjs';
import {createDatabasePool} from '../src/modules/database/pool.mjs';
import {createStudentRuntime} from '../src/local/student.mjs';
import {runSimulationJourney} from './student-simulation-journey.mjs';
const engine=process.argv[2]??'chromium';assert.ok(['chromium','firefox'].includes(engine));
const artifacts=path.resolve(process.env.SIMULATION_ARTIFACT_DIR??`/tmp/tsa-simulation-${engine}-evidence`);
await mkdir(artifacts,{recursive:true});
let fixture,workerPool,runtime,browser,driver,socket,sessionId,endpoint,profile;
let log='',sequence=0;const pending=new Map(),report={engine,checks:[],screenshots:[]};
const query=id=>`document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wd(method,route,body){const response=await fetch(`${endpoint}${sessionId?`/session/${sessionId}`:''}${route}`,{method,headers:{'content-type':'application/json'},signal:AbortSignal.timeout(20000),...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();if(!response.ok||value.value?.error)throw new Error(value.value?.message??`WebDriver ${response.status}`);return value.value;}
function command(method,params={},sessionId){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},10000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
let evaluate,viewport,reload,key,capture,click,changeIdentityInOtherTab;
const changeIdentityScript=`(async()=>{const nonce=()=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('tsa_local_csrf='))?.slice(15)??'';
 const post=(path,body)=>fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':nonce()},body:JSON.stringify(body)});
 await post('/local-auth/logout',{});await post('/local-auth/bootstrap',{});const login=await post('/local-auth/login',{actorKey:'studentB'});if(login.status!==200)throw new Error('Second-tab login failed');return true;})()`;

async function waitFor(expression,label){const until=Date.now()+15000;while(Date.now()<until){try{if(await evaluate(expression))return;}catch(e){if(!/context|document unloaded|browsing context|Cannot find context/i.test(e.message))throw e;}await delay(30);}throw new Error(`Timed out: ${label}`);}
async function stop(child){if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');const done=await Promise.race([once(child,'close').then(()=>true),delay(3000).then(()=>false)]);if(!done){child.kill('SIGKILL');await once(child,'close');}}}
try{
 fixture=await createSimulationFixture();const login='simulation_browser_'+randomUUID().replaceAll('-','');await fixture.pool.query(`CREATE ROLE ${login} LOGIN`);await fixture.pool.query(`GRANT tsa_exam_worker TO ${login}`);
 workerPool=createDatabasePool({...fixture.harness.database.connectionConfig,user:login});const rate={capacity:1000,refillPerSecond:100};
 runtime=await createStudentRuntime({identityPool:fixture.harness.authPool,examPool:fixture.examPool,workerPool,enableFullSimulation:true,imageStore:fixture.imageStore,
 env:{NODE_ENV:'test',LOCAL_SYNTHETIC_ONLY:'true'},port:0,pollMilliseconds:30,sweepBatchSize:10,executorId:`simulation-${engine}`,leaseSeconds:30,retrySeconds:1,createRate:rate,saveRate:{user:rate,attempt:rate}});
 if(engine==='chromium'){
  profile=await mkdtemp(path.join(tmpdir(),'tsa-simulation-chromium-'));
  browser=spawn(process.env.STUDENT_BROWSER??'/snap/bin/chromium',['--headless','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  browser.stderr.setEncoding('utf8');browser.stderr.on('data',c=>{log=(log+c).slice(-32000);});browser.on('error',e=>{log+=e.message;});
  for(let i=0;i<200&&!log.includes('DevTools listening on');i++){if(browser.exitCode!==null)throw new Error(log);await delay(50);}
  const ws=log.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];assert.ok(ws,log);
  const base=ws.replace('ws:','http:').split('/devtools/')[0],targets=await(await fetch(base+'/json/list')).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);socket.addEventListener('message',({data})=>{const value=JSON.parse(data);if(value.id){const task=pending.get(value.id);if(task){pending.delete(value.id);value.error?task.reject(new Error(value.error.message)):task.resolve(value.result);}}});await once(socket,'open');
  await command('Page.enable');await command('Runtime.enable');
  evaluate=async expression=>{const value=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw new Error(value.exceptionDetails.exception?.description??value.exceptionDetails.text);return value.result.value;};
  viewport=(width,height)=>command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});reload=()=>command('Page.reload',{ignoreCache:true});
  key=async value=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value,windowsVirtualKeyCode:value==='Escape'?27:0});await command('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value,windowsVirtualKeyCode:value==='Escape'?27:0});};
  capture=async name=>{const data=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});const target=path.join(artifacts,name+'.png');await writeFile(target,Buffer.from(data.data,'base64'));report.screenshots.push(target);};
  click=async id=>{await waitFor(`Boolean(${query(id)}&&!${query(id)}.disabled)`,id);const point=await evaluate(`(()=>{const e=${query(id)};const t=e.matches('input')?e.closest('label'):e;t.scrollIntoView({block:'center'});const r=t.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});};
  changeIdentityInOtherTab=async()=>{
    const {targetId}=await command('Target.createTarget',{url:runtime.origin+'/?student=postgres-v3'});
    try {
      const {sessionId:child}=await command('Target.attachToTarget',{targetId,flatten:true});
      await command('Runtime.enable',{},child);
      for(let i=0;i<100;i++){const ready=await command('Runtime.evaluate',{expression:`location.origin===${JSON.stringify(runtime.origin)}&&document.readyState==='complete'`,returnByValue:true},child);if(ready.result.value)break;await delay(50);}
      const result=await command('Runtime.evaluate',{expression:changeIdentityScript,awaitPromise:true,returnByValue:true},child);
      if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
      assert.equal(result.result.value,true);
    } finally {await command('Target.closeTarget',{targetId});}
  };
  await viewport(1280,900);await command('Page.navigate',{url:runtime.origin+'/?student=postgres-v3'});
 }else{
  const parent=process.env.STUDENT_FIREFOX_PROFILE_ROOT??path.join(homedir(),'snap','firefox','common');await mkdir(parent,{recursive:true});profile=await mkdtemp(path.join(parent,'tsa-simulation-firefox-'));
  driver=spawn(process.env.STUDENT_GECKODRIVER??'/snap/bin/geckodriver',['--host','127.0.0.1','--port','0','--profile-root',profile],{stdio:['ignore','pipe','pipe']});
  for(const stream of [driver.stdout,driver.stderr]){stream.setEncoding('utf8');stream.on('data',c=>{log=(log+c).slice(-32000);});}
  driver.on('error',e=>{log+=e.message;});for(let i=0;i<200&&!endpoint;i++){const port=log.match(/Listening on 127\.0\.0\.1:(\d+)/)?.[1];if(port)endpoint=`http://127.0.0.1:${port}`;else await delay(50);}assert.ok(endpoint,log);
  const session=await wd('POST','/session',{capabilities:{alwaysMatch:{browserName:'firefox','moz:firefoxOptions':{args:['-headless']}}}});sessionId=session.sessionId;report.browser=session.capabilities.browserVersion;
  evaluate=expression=>wd('POST','/execute/sync',{script:`return (${expression});`,args:[]});viewport=(width,height)=>wd('POST','/window/rect',{width,height});reload=()=>wd('POST','/refresh',{});
  key=async value=>{if(value==='Escape'){await wd('POST','/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'\uE00C'},{type:'keyUp',value:'\uE00C'}]}]});}};
  capture=async name=>{const data=await wd('GET','/screenshot');const target=path.join(artifacts,name+'.png');await writeFile(target,Buffer.from(data,'base64'));report.screenshots.push(target);};
  click=async id=>{await waitFor(`Boolean(${query(id)}&&!${query(id)}.disabled)`,id);const input=await evaluate(`${query(id)}.matches('input')`);const element=await wd('POST','/element',{using:'css selector',value:input?`label:has([data-testid="${id}"])`:`[data-testid="${id}"]`});await wd('POST',`/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`,{});};
  changeIdentityInOtherTab=async()=>{
    const original=await wd('GET','/window');const child=await wd('POST','/window/new',{type:'tab'});
    try {
      await wd('POST','/window',{handle:child.handle});await wd('POST','/url',{url:runtime.origin+'/?student=postgres-v3'});
      const result=await wd('POST','/execute/async',{script:`const done=arguments[arguments.length-1];${changeIdentityScript}.then(value=>done({value}),error=>done({error:String(error)}));`,args:[]});
      assert.equal(result.value,true,JSON.stringify(result));
    } finally {await wd('DELETE','/window');await wd('POST','/window',{handle:original});}
  };
  await viewport(1280,900);await wd('POST','/url',{url:runtime.origin+'/?student=postgres-v3'});
 }
 await waitFor(`Boolean(${query('persistent-login-studentA')})`,'simulation login');await capture('simulation-login');
 await runSimulationJourney({evaluate,click,query,waitFor,capture,viewport,reload,key,fixture,report,changeIdentityInOtherTab,narrowWidth:engine==='firefox'?500:375});
 await writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));process.stdout.write(JSON.stringify(report,null,2)+'\n');
}catch(error){process.stderr.write(`${error.stack}\n${log.slice(-1500)}\n`);throw error;}
finally{
 const errors=[];const clean=async(fn)=>{try{await fn();}catch(e){errors.push(e);}};
 if(sessionId)await clean(()=>wd('DELETE',''));socket?.close();await clean(()=>stop(browser));await clean(()=>stop(driver));
 await clean(()=>runtime?.close());await clean(()=>workerPool?.end());await clean(()=>fixture?.close());if(profile)await clean(()=>rm(profile,{recursive:true,force:true}));
 if(errors.length)throw new AggregateError(errors,'Simulation browser cleanup failed');
}
