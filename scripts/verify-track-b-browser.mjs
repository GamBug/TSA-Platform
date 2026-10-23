// Browser acceptance for the local PostgreSQL staff workspace. All DB data and
// browser profile files live in temporary directories owned by this run.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPrototypeServer } from '../apps/practice-prototype/server.mjs';
import { createTrackBRuntime } from '../src/local/track-b.mjs';

const artifacts = path.resolve(process.env.TRACK_B_ARTIFACT_DIR ?? path.join(tmpdir(), 'tsa-track-b-browser-evidence'));
const browserExecutable = process.env.TRACK_B_BROWSER ?? '/snap/bin/chromium';
const timeoutMs = 120_000;
const scratch = await mkdtemp(path.join(tmpdir(), 'tsa-track-b-browser-'));
await chmod(scratch, 0o700);
const profile = await mkdtemp(path.join(tmpdir(), 'tsa-track-b-chromium-'));
await chmod(profile, 0o700);
let runtime;
let mockServer;
let browser;
let socket;
let timedOut = false;
let browserLog = '';
let browserError = null;
let sequence = 0;
const pending = new Map();
const errors = [];
const requests = [];
const report = { browser: null, screenshots: [], checks: [] };
const deadline = setTimeout(() => {
  timedOut = true;
  browser?.kill('SIGKILL');
  socket?.close();
}, timeoutMs);
deadline.unref?.();

function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP command timed out: ${method}`));
    }, 8_000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const out = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (out.exceptionDetails) throw new Error(`${out.exceptionDetails.text}: ${out.exceptionDetails.exception?.description ?? ''}`);
  return out.result.value;
}

async function waitFor(expression, label) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try { if (await evaluate(expression)) return; }
    catch (error) {
      if (!/context.*(destroyed|not found)|Cannot find context/i.test(error.message)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const selector = (id) => `[data-testid="${id}"]`;
const query = (id) => `document.querySelector(${JSON.stringify(selector(id))})`;

async function click(id) {
  await waitFor(`Boolean(${query(id)} && !${query(id)}.disabled && ${query(id)}.getBoundingClientRect().height)`, id);
  await evaluate(`${query(id)}.scrollIntoView({block:'center'})`);
  const point = await evaluate(`(()=>{const r=${query(id)}.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}

async function pressKey(key, code, windowsVirtualKeyCode, text) {
  const params = { key, code, windowsVirtualKeyCode };
  await command('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(text ? { text } : {}) });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}

async function screenshot(name) {
  const data = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const filename = path.join(artifacts, `${name}.png`);
  await writeFile(filename, Buffer.from(data.data, 'base64'));
  report.screenshots.push(filename);
}

async function noHorizontalOverflow() {
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'horizontal page overflow');
}

async function serveMockOnly() {
  mockServer = createPrototypeServer({ port: 0 });
  await new Promise((resolve, reject) => {
    mockServer.once('error', reject);
    mockServer.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${mockServer.address().port}`;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const closed = await Promise.race([
    once(child, 'close').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
  ]);
  if (!closed) {
    child.kill('SIGKILL');
    const killed = await Promise.race([
      once(child, 'close').then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
    if (!killed) throw new Error('Could not confirm Chromium process shutdown');
  }
}

try {
  await mkdir(artifacts, { recursive: true });
  runtime = await createTrackBRuntime({
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' },
    dataDirectory: path.join(scratch, 'cluster'),
    port: 0,
  });

  browser = spawn(browserExecutable, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], shell: false });
  browser.stderr.setEncoding('utf8');
  browser.stderr.on('data', (chunk) => { browserLog = (browserLog + chunk).slice(-64 * 1024); });
  browser.once('error', (error) => { browserError = error; });

  let websocketUrl;
  for (let attempt = 0; attempt < 200 && !websocketUrl; attempt += 1) {
    if (browserError) throw new Error(`Could not start ${browserExecutable}: ${browserError.message}`);
    websocketUrl = browserLog.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (!websocketUrl) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(websocketUrl, `Could not start ${browserExecutable}: ${browserLog}`);
  const debugOrigin = websocketUrl.replace(/^ws:/, 'http:').split('/devtools/')[0];
  report.browser = await (await fetch(`${debugOrigin}/json/version`)).json();
  const targets = await (await fetch(`${debugOrigin}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const task = pending.get(data.id);
      if (task) {
        pending.delete(data.id);
        data.error ? task.reject(new Error(JSON.stringify(data.error))) : task.resolve(data.result);
      }
    }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
    if (data.method === 'Network.requestWillBeSent') requests.push(data.params.request.url);
  });
  await once(socket, 'open');
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: runtime.origin });
  await waitFor(`document.readyState === 'complete' && document.documentElement.lang === 'vi'`, 'Vietnamese landing page');
  await click('staff-open');
  await waitFor(`Boolean(${query('staff-login')})`, 'synthetic staff login');
  await screenshot('staff-login-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await noHorizontalOverflow();
  await screenshot('staff-login-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('staff-login');
  await waitFor(`Boolean(${query('draft-create')} && ${query('staff-question-list')})`, 'AUTHOR draft workspace');
  assert.match(await evaluate('document.body.innerText'), /UNKNOWN/);

  await evaluate(`(()=>{
    window.__trackBOriginalFetch=window.fetch.bind(window);
    window.__trackBCreateKeys=[];
    window.__trackBDropNextCreate=true;
    window.fetch=async (input, init={})=>{
      const response=await window.__trackBOriginalFetch(input,init);
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.pathname==='/api/v1/questions' && init.method==='POST'){
        window.__trackBCreateKeys.push(new Headers(init.headers).get('idempotency-key'));
        if(window.__trackBDropNextCreate){window.__trackBDropNextCreate=false;throw new TypeError('simulated lost success response');}
      }
      return response;
    };
  })()`);
  await click('draft-create');
  await waitFor(`document.body.innerText.includes('Không thể kết nối với máy chủ cục bộ')`, 'lost response notice');
  assert.equal(await evaluate('window.__trackBCreateKeys.length'), 1);
  await click('draft-create');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===1)`, 'single idempotent draft after retry');
  const idempotencyKeys = await evaluate('window.__trackBCreateKeys');
  assert.equal(idempotencyKeys.length, 2);
  assert.equal(idempotencyKeys[0], idempotencyKeys[1], 'unchanged retry reuses the original Idempotency-Key');
  const listAfterRetry = await evaluate(`fetch('/api/v1/questions?state=DRAFT&limit=100').then(r=>r.json()).then(r=>r.items)`);
  assert.equal(listAfterRetry.length, 1, 'lost-response retry creates only one committed draft');
  assert.deepEqual(Object.keys(listAfterRetry[0]).sort(), [
    'contentHash', 'interactionType', 'questionId', 'section', 'state', 'versionId',
  ], 'staff list exposes only safe question metadata');
  report.checks.push('AUTHOR login; lost-success-response retry reused one idempotency key and produced one draft');
  await noHorizontalOverflow();
  await screenshot('staff-workspace-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await noHorizontalOverflow();
  await screenshot('staff-workspace-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const seededCount = await evaluate(`(async()=>{
    const {template}=await window.__trackBOriginalFetch('/local/workspace/template',{cache:'no-store'}).then(r=>r.json());
    const csrf=document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('tsa_local_csrf='))?.split('=').slice(1).join('=');
    if(!csrf) throw new Error('Missing test CSRF cookie');
    for(let index=0;index<20;index++){
      const draft={
        schemaVersion:'question/1',language:'vi-VN',section:'MATH',taxonomyVersionId:template.taxonomyVersionId,
        domainId:template.domainId,skillIds:template.skillIds,subskillIds:[],cognitiveLevel:null,targetDifficulty:'EASY',
        content:[{type:'text',text:'Synthetic browser pagination fixture '+index+' '+crypto.randomUUID()}],stimulusVersionId:null,
        interaction:{type:'SINGLE_CHOICE',options:[
          {id:'a',content:[{type:'text',text:'Synthetic option A'}]},
          {id:'b',content:[{type:'text',text:'Synthetic option B'}]},
        ]},answerKey:{type:'SINGLE_CHOICE',optionId:'a'},
        explanation:[{type:'text',text:'Synthetic browser verification fixture.'}],evidenceRefs:template.evidenceRefs,
        origin:'MANUAL',provenance:template.provenance,
      };
      const response=await window.__trackBOriginalFetch('/api/v1/questions',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf,'idempotency-key':crypto.randomUUID()},
        body:JSON.stringify(draft),cache:'no-store',
      });
      if(response.status!==201) throw new Error('Could not seed synthetic metadata fixture '+response.status);
      const receipt=await response.json();
      if(Object.keys(receipt).some(key=>!['questionId','versionId','state','contentHash'].includes(key)))
        throw new Error('Unexpected synthetic fixture receipt fields');
    }
    return 20;
  })()`);
  assert.equal(seededCount, 20);
  await click('staff-refresh');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===20)`, 'first 20 metadata summaries');
  await waitFor(`Boolean(${query('staff-load-more')})`, 'cursor load-more control');
  assert.equal(await evaluate(`${query('staff-list-status')}.textContent.includes('20')`), true, 'list status reports the current metadata count');
  assert.equal(await evaluate(`(()=>{const a=document.querySelector('label[for="staff-state-filter"]');const b=document.querySelector('#staff-state-filter');const c=document.querySelector('label[for="staff-section-filter"]');const d=document.querySelector('#staff-section-filter');return Boolean(a&&b&&a.textContent.trim()&&b.labels[0]===a&&c&&d&&d.labels[0]===c)})()`), true, 'filter selects have visible associated labels');

  await evaluate(`${query('staff-load-more')}.focus()`);
  assert.deepEqual(await evaluate(`(()=>{const button=${query('staff-load-more')};return {hidden:button.hidden,disabled:button.disabled,focused:document.activeElement===button}})()`), {
    hidden: false, disabled: false, focused: true,
  }, 'load-more is visible, enabled and keyboard focused');
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===21)`, 'cursor page after keyboard activation');
  const paginatedListRequests = requests.filter((url) => url.startsWith(`${runtime.origin}/api/v1/questions?`));
  assert.equal(new URL(paginatedListRequests.at(-1)).searchParams.has('cursor'), true, 'load-more follows the server cursor');
  assert.equal(await evaluate(`document.body.innerText.includes('Phiên bản') && document.body.innerText.includes('sha256:')`), true, 'each row displays the exact version and content hash');
  report.checks.push('PostgreSQL metadata list paginates 21 drafts with the server cursor and keyboard-accessible load-more');

  await evaluate(`(()=>{
    const state=document.querySelector('#staff-state-filter');
    state.value='IN_REVIEW';state.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await waitFor(`${query('staff-list-status')}?.textContent.includes('Không có bản ghi')`, 'empty state filter feedback');
  assert.equal(await evaluate(`${query('staff-question-list')}.querySelectorAll('li.staff-question-item').length`), 0);
  await evaluate(`(()=>{
    const section=document.querySelector('#staff-section-filter');
    section.value='READING';section.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await waitFor(`${query('staff-list-status')}?.textContent.includes('Không có bản ghi')`, 'empty section filter feedback');
  assert.equal(await evaluate(`${query('staff-question-list')}.querySelectorAll('li.staff-question-item').length`), 0);
  const metadataFilterRequests = requests.filter((url) => url.startsWith(`${runtime.origin}/api/v1/questions?`)).map((url) => new URL(url).searchParams);
  assert.equal(metadataFilterRequests.some((params) => params.get('state') === 'IN_REVIEW'), true, 'state filter reaches the API');
  assert.equal(metadataFilterRequests.some((params) => params.get('section') === 'READING'), true, 'section filter reaches the API');
  report.checks.push('state and section filters return truthful empty feedback from the existing metadata endpoint');

  await evaluate(`(()=>{
    const state=document.querySelector('#staff-state-filter');
    const section=document.querySelector('#staff-section-filter');
    state.value='DRAFT';state.dispatchEvent(new Event('change',{bubbles:true}));
    section.value='';section.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===20)`, 'restored draft metadata filter');

  await evaluate(`(()=>{
    window.__trackBOriginalFetch=window.__trackBOriginalFetch||window.fetch.bind(window);
    window.__trackBHoldNextDraftList=true;
    window.__trackBDelayedDraftList=false;
    window.__trackBReleaseDraftList=null;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      const response=await window.__trackBOriginalFetch(input,init);
      if(url.pathname==='/api/v1/questions'&&url.searchParams.get('state')==='DRAFT'&&window.__trackBHoldNextDraftList){
        window.__trackBHoldNextDraftList=false;window.__trackBDelayedDraftList=true;
        await new Promise(resolve=>window.__trackBReleaseDraftList=resolve);
      }
      return response;
    };
  })()`);
  await click('staff-refresh');
  await waitFor('window.__trackBDelayedDraftList===true', 'delayed older filter response');
  assert.equal(await evaluate(`${query('staff-list-status')}.textContent.includes('Đang tải')`), true, 'loading feedback is announced');
  await evaluate(`(()=>{
    const state=document.querySelector('#staff-state-filter');
    state.value='APPROVED';state.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await waitFor(`${query('staff-list-status')}?.textContent.includes('Không có bản ghi')`, 'newer filter result');
  await evaluate('window.__trackBReleaseDraftList()');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await evaluate(`${query('staff-question-list')}.querySelectorAll('li.staff-question-item').length`), 0, 'older response cannot replace newer filter results');
  assert.equal(await evaluate(`${query('staff-state-filter')}.value`), 'APPROVED');
  report.checks.push('out-of-order database responses cannot replace the latest filter results');

  await evaluate(`(()=>{
    const state=document.querySelector('#staff-state-filter');
    state.value='DRAFT';state.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===20)`, 'draft list before error injection');
  await evaluate(`(()=>{
    window.__trackBFailNextQuestionList=true;
    const original=window.fetch;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.pathname==='/api/v1/questions'&&window.__trackBFailNextQuestionList){
        window.__trackBFailNextQuestionList=false;
        return new Response(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE'}}),{status:503,headers:{'content-type':'application/json'}});
      }
      return original(input,init);
    };
  })()`);
  await click('staff-refresh');
  await waitFor(`${query('staff-list-status')}?.textContent.includes('chưa thể hoàn tất')`, 'list error feedback');
  await click('staff-refresh');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===20)`, 'list retry after error');
  report.checks.push('list errors are announced and a refresh recovers from the existing endpoint');

  await evaluate(`(()=>{
    window.__trackBHoldNextIdentityList=true;
    window.__trackBIdentityListHeld=false;
    window.__trackBReleaseIdentityList=null;
    const original=window.fetch;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      const response=await original(input,init);
      if(url.pathname==='/api/v1/questions'&&url.searchParams.get('state')==='DRAFT'&&window.__trackBHoldNextIdentityList){
        window.__trackBHoldNextIdentityList=false;
        const payload=await response.json();
        window.__trackBIdentityListHeld=true;
        await new Promise(resolve=>window.__trackBReleaseIdentityList=resolve);
        return new Response(JSON.stringify({...payload,items:payload.items.slice(0,1)}),{
          status:response.status,headers:{'content-type':'application/json'},
        });
      }
      return response;
    };
  })()`);
  await click('staff-refresh');
  await waitFor('window.__trackBIdentityListHeld===true', 'AUTHOR list response held across logout');
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login after AUTHOR identity switch');
  await evaluate(`${query('actor-select')}.value='reviewer'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===20)`, 'new REVIEWER identity list');
  await evaluate('window.__trackBReleaseIdentityList()');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await evaluate(`${query('staff-question-list')}.querySelectorAll('li.staff-question-item').length`), 20, 'old AUTHOR response cannot replace the new REVIEWER list');
  assert.equal(await evaluate(`document.body.innerText.includes('Vai trò hiện tại: REVIEWER')`), true);
  report.checks.push('a pending AUTHOR response cannot replace the list after identity changes to REVIEWER');

  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login after REVIEWER identity race');
  await evaluate(`${query('actor-select')}.value='author'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===20)`, 'restored AUTHOR identity');

  await evaluate(`(()=>{
    window.__trackBHoldNextReturnList=true;
    window.__trackBReturnListHeld=false;
    window.__trackBReleaseReturnList=null;
    const original=window.fetch;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      const response=await original(input,init);
      if(url.pathname==='/api/v1/questions'&&url.searchParams.get('state')==='DRAFT'&&window.__trackBHoldNextReturnList){
        window.__trackBHoldNextReturnList=false;
        const payload=await response.json();
        window.__trackBReturnListHeld=true;
        await new Promise(resolve=>window.__trackBReleaseReturnList=resolve);
        return new Response(JSON.stringify({...payload,items:payload.items.slice(0,1),nextCursor:null}),{
          status:response.status,headers:{'content-type':'application/json'},
        });
      }
      return response;
    };
  })()`);
  await click('staff-refresh');
  await waitFor('window.__trackBReturnListHeld===true', 'old workspace list response held before return');
  await click('staff-return');
  await waitFor(`Boolean(${query('staff-open')})`, 'practice landing after staff return');
  await click('staff-open');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===20)`, 'reopened staff metadata list');
  await evaluate('window.__trackBReleaseReturnList()');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await evaluate(`${query('staff-question-list')}.querySelectorAll('li.staff-question-item').length`), 20, 'exited workspace response cannot replace reopened rows');
  assert.equal(await evaluate(`${query('staff-list-status')}.textContent.includes('20')`), true, 'exited workspace cannot overwrite reopened status');
  assert.equal(await evaluate(`${query('staff-load-more')}.hidden`), false, 'exited workspace cannot overwrite reopened cursor');
  report.checks.push('return/reopen invalidates old workspace list, status and cursor completions');

  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await noHorizontalOverflow();
  await screenshot('staff-metadata-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await command('Page.reload', { ignoreCache: true });
  await waitFor(`Boolean(${query('staff-open')})`, 'landing after reload');
  await click('staff-open');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===20)`, 'persistent drafts after reload');
  assert.equal(await evaluate(`document.body.innerText.includes('Vai trò hiện tại: AUTHOR')`), true);
  report.checks.push('draft metadata reloads from persistent PostgreSQL');

  const staffDataRequestsBeforeCandidate = requests.filter((url) =>
    url === `${runtime.origin}/local/workspace/template` || url.startsWith(`${runtime.origin}/api/v1/questions?`)).length;
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login after logout');
  await evaluate(`${query('actor-select')}.value='studentA'`);
  await click('staff-login');
  await waitFor(`document.body.innerText.includes('không có quyền xem bản nháp')`, 'candidate-specific denial');
  assert.equal(await evaluate(`Boolean(${query('staff-question-list')})`), false);
  assert.equal(await evaluate(`Boolean(${query('staff-refresh')})`), false);
  assert.equal(requests.filter((url) =>
    url === `${runtime.origin}/local/workspace/template` || url.startsWith(`${runtime.origin}/api/v1/questions?`)).length,
  staffDataRequestsBeforeCandidate, 'candidate opening triggers neither template nor list queries');
  report.checks.push('candidate sees explicit denial without a Bank list request or template');

  const deniedList = await evaluate(`fetch('/api/v1/questions?state=DRAFT&limit=20').then(async response=>({status:response.status,body:await response.json()}))`);
  assert.equal(deniedList.status, 403, 'student list access is denied by the server');
  assert.equal(deniedList.body.error.code, 'FORBIDDEN');
  report.checks.push('candidate direct metadata API access is denied with 403 FORBIDDEN');

  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login after candidate logout');
  await evaluate(`${query('actor-select')}.value='reviewer'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===20)`, 'synthetic reviewer metadata access');
  assert.equal(await evaluate(`document.body.innerText.includes('không đại diện cho người rà soát độc lập đủ điều kiện')`), true, 'synthetic reviewer is not represented as a qualified human');
  assert.equal(await evaluate(`Boolean(${query('draft-create')})`), false, 'reviewer role does not receive author creation controls');
  assert.equal(await evaluate(`document.body.innerText.includes('không có nội dung câu hỏi, đáp án, lời giải riêng hoặc bằng chứng rà soát')`), true, 'staff metadata notice discloses unavailable private preview and review evidence');
  report.checks.push('synthetic REVIEWER sees safe metadata only, without author actions or qualified-human claims');

  const mockOrigin = await serveMockOnly();
  await command('Page.navigate', { url: mockOrigin });
  await waitFor(`Boolean(${query('staff-open')})`, 'mock-only landing');
  await click('staff-open');
  await waitFor(`document.body.innerText.includes('PostgreSQL cục bộ chưa được khởi chạy')`, 'mock-only unavailable state');
  assert.equal(await evaluate(`Boolean(${query('staff-login')})`), false);
  report.checks.push('mock-only B0 link reports workspace unavailable instead of a fake login');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.deepEqual(requests.filter((url) => /^https?:/.test(url) && !url.startsWith(`${runtime.origin}/`) && !url.startsWith(`${mockOrigin}/`)), []);
  report.checks.push('no uncaught browser errors or external page requests');
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: 'PASS', ...report }, null, 2));
} catch (error) {
  console.error(error);
  console.error(browserLog);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  for (const [, task] of pending) task.reject(new Error('Browser verifier is shutting down'));
  pending.clear();
  socket?.close();
  await stopChild(browser).catch((error) => { console.error(error); process.exitCode = 1; });
  if (mockServer?.listening) await new Promise((resolve) => mockServer.close(resolve));
  if (runtime) await runtime.close().catch((error) => { console.error(error); process.exitCode = 1; });
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await rm(scratch, { recursive: true, force: true }).catch((error) => { console.error(error); process.exitCode = 1; });
  if (timedOut) process.exitCode = 1;
}
