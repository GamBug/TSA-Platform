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
import { createReviewBrowserFixture } from '../tests/integration/bank/review-browser-fixture.mjs';

const artifacts = path.resolve(process.env.TRACK_B_ARTIFACT_DIR ?? path.join(tmpdir(), 'tsa-track-b-browser-evidence'));
const browserExecutable = process.env.TRACK_B_BROWSER ?? '/snap/bin/chromium';
const timeoutMs = 120_000;
const scratch = await mkdtemp(path.join(tmpdir(), 'tsa-track-b-browser-'));
await chmod(scratch, 0o700);
const profile = await mkdtemp(path.join(tmpdir(), 'tsa-track-b-chromium-'));
await chmod(profile, 0o700);
let runtime;
let reviewFixture;
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
const networkOperations = [];
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
    if (data.method === 'Network.requestWillBeSent') {
      requests.push(data.params.request.url);
      networkOperations.push({ url: data.params.request.url, method: data.params.request.method, hasPostData: data.params.request.hasPostData ?? false });
    }
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
  assert.match(await evaluate('document.body.innerText'), /LOCAL_SYNTHETIC_ONLY/);

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
  const createdVersionId = listAfterRetry[0].versionId;
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

  const reviewButtonSelector = `[data-testid="staff-review-inspect"][data-version-id="${createdVersionId}"]`;
  const reviewButton = `document.querySelector(${JSON.stringify(reviewButtonSelector)})`;
  const reviewPath = `/api/v1/question-versions/${encodeURIComponent(createdVersionId)}/review-context`;
  const reviewUrl = `${runtime.origin}${reviewPath}`;
  async function ensureCreatedReviewButton() {
    if (await evaluate(`Boolean(${reviewButton})`)) return;
    const canLoadMore = await evaluate(`Boolean(${query('staff-load-more')} && !${query('staff-load-more')}.hidden)`);
    if (!canLoadMore) throw new Error('The AUTHOR draft inspection button is not present on the current metadata pages');
    await click('staff-load-more');
    await waitFor(`Boolean(${reviewButton})`, 'AUTHOR draft inspection button on the next metadata page');
  }
  assert.equal(await evaluate(`Boolean(${reviewButton})`), true, 'each metadata row has an explicit inspection button for its exact version');
  const reviewRequestsBeforeHover = requests.filter((url) => url === reviewUrl).length;
  await evaluate(`${reviewButton}.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}))`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(requests.filter((url) => url === reviewUrl).length, reviewRequestsBeforeHover, 'hovering a metadata row does not prefetch private context');
  await evaluate(`${reviewButton}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor(`Boolean(${query('staff-review-context')}?.innerText.includes('Chỉ hiển thị metadata'))`, 'blocked retained-draft private context');
  assert.equal(await evaluate(`document.activeElement.id`), 'staff-review-title', 'inspection moves keyboard focus to the private-context heading');
  assert.equal(requests.filter((url) => url === reviewUrl).length, reviewRequestsBeforeHover + 1, 'explicit selection makes one exact-version GET');
  const blockedContext = await evaluate(`fetch(${JSON.stringify(reviewPath)},{cache:'no-store'}).then(async response=>({status:response.status,body:await response.json()}))`);
  assert.equal(blockedContext.status, 200);
  assert.equal(blockedContext.body.version.versionId, createdVersionId);
  assert.equal(blockedContext.body.workflow.state, 'DRAFT');
  assert.equal(blockedContext.body.preview.status, 'BLOCKED');
  assert.equal(blockedContext.body.preview.reason, 'RIGHTS_BLOCKED');
  assert.equal(Object.hasOwn(blockedContext.body.preview, 'question'), false, 'blocked retained source returns no question, key or explanation object');
  assert.equal(blockedContext.body.sources.some((source) => source.currentRights?.status === 'UNKNOWN'), true, 'retained source keeps its actual UNKNOWN rights decision');
  const blockedPanelText = await evaluate(`${query('staff-review-context')}.innerText`);
  assert.equal(blockedPanelText.includes('LOCAL_SYNTHETIC_ONLY'), true, 'private context discloses the synthetic-only environment');
  assert.equal(blockedPanelText.includes(blockedContext.body.version.contentHash), true, 'private context shows the exact immutable content hash');
  assert.equal(blockedPanelText.includes(`revision ${blockedContext.body.workflow.revision}`), true, 'private context shows the workflow revision');
  assert.equal(blockedPanelText.includes('UNKNOWN'), true, 'private context shows the retained UNKNOWN status without promoting it');
  assert.equal(blockedPanelText.includes('Synthetic browser verification fixture.'), false, 'blocked panel does not render the draft explanation');
  assert.equal(blockedPanelText.includes('Nội dung câu hỏi riêng'), false, 'blocked panel does not render the question body');
  await evaluate(`${query('staff-review-close')}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor(`!${query('staff-review-context')}`, 'keyboard close of private context');
  assert.equal(await evaluate(`document.activeElement===${reviewButton}`), true, 'closing returns focus to the exact version button');
  assert.equal(await evaluate(`${reviewButton}.getAttribute('aria-expanded')`), 'false');
  await evaluate(`(()=>{
    window.__trackBFailNextReviewContext=true;
    const original=window.fetch;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.pathname===${JSON.stringify(reviewPath)}&&window.__trackBFailNextReviewContext){
        window.__trackBFailNextReviewContext=false;
        return new Response(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE'}}),{status:503,headers:{'content-type':'application/json'}});
      }
      return original(input,init);
    };
  })()`);
  await evaluate(`${reviewButton}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor(`Boolean(${query('staff-review-context')}?.innerText.includes('chưa thể hoàn tất'))`, 'review-context temporary error');
  assert.equal(await evaluate(`Boolean(${query('staff-review-retry')})`), true, 'private-context error exposes an explicit retry control');
  assert.equal(await evaluate(`${query('staff-review-context')}.innerText.includes('Synthetic browser verification fixture.')`), false, 'error panel contains no stale private content');
  await click('staff-review-retry');
  await waitFor(`Boolean(${query('staff-review-context')}?.innerText.includes('Chỉ hiển thị metadata'))`, 'review-context retry after temporary failure');
  assert.equal(await evaluate(`${query('staff-review-context')}.innerText.includes('Synthetic browser verification fixture.')`), false);
  await pressKey('Escape', 'Escape', 27, String.fromCharCode(27));
  await waitFor(`!${query('staff-review-context')}`, 'Escape close of private context');
  assert.equal(await evaluate(`document.activeElement===${reviewButton}`), true, 'Escape returns keyboard focus to the triggering version');
  report.checks.push('retained UNKNOWN-rights draft is blocked metadata-only; exact version, workflow revision and source rights display without private content; inspection is explicit, retryable, and keyboard closable');

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
  assert.equal(await evaluate(`Boolean(${query('staff-review-inspect')})`), false, 'candidate has no private inspection control');
  assert.equal(requests.filter((url) =>
    url === `${runtime.origin}/local/workspace/template` || url.startsWith(`${runtime.origin}/api/v1/questions?`)).length,
  staffDataRequestsBeforeCandidate, 'candidate opening triggers neither template nor list queries');
  report.checks.push('candidate sees explicit denial without a Bank list request or template');

  const deniedList = await evaluate(`fetch('/api/v1/questions?state=DRAFT&limit=20').then(async response=>({status:response.status,body:await response.json()}))`);
  assert.equal(deniedList.status, 403, 'student list access is denied by the server');
  assert.equal(deniedList.body.error.code, 'FORBIDDEN');
  report.checks.push('candidate direct metadata API access is denied with 403 FORBIDDEN');

  const deniedReviewContext = await evaluate(`fetch(${JSON.stringify(reviewPath)},{cache:'no-store'}).then(async response=>({status:response.status,body:await response.json()}))`);
  assert.equal(deniedReviewContext.status, 403, 'candidate direct private-context API access is denied with 403');
  assert.equal(deniedReviewContext.body.error.code, 'FORBIDDEN');
  report.checks.push('candidate direct exact-version review-context access is denied with 403 FORBIDDEN');

  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login after candidate logout');
  await evaluate(`${query('actor-select')}.value='reviewer'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===20)`, 'synthetic reviewer metadata access');
  assert.equal(await evaluate(`document.body.innerText.includes('không đại diện cho người rà soát độc lập đủ điều kiện')`), true, 'synthetic reviewer is not represented as a qualified human');
  assert.equal(await evaluate(`Boolean(${query('draft-create')})`), false, 'reviewer role does not receive author creation controls');
  assert.equal(await evaluate(`document.body.innerText.includes('nội dung riêng chỉ được yêu cầu khi bạn chọn đúng phiên bản')`), true, 'staff notice explains that private context is fetched only after explicit selection');
  report.checks.push('synthetic REVIEWER sees safe metadata and explicit per-version access, without author actions or qualified-human claims');

  reviewFixture = await createReviewBrowserFixture();
  await command('Page.navigate', { url: reviewFixture.origin });
  await waitFor(`document.readyState==='complete'&&document.documentElement.lang==='vi'`, 'disposable AVAILABLE review fixture');
  await click('staff-open');
  await waitFor(`Boolean(${query('staff-login')})`, 'disposable fixture staff login');
  await evaluate(`${query('actor-select')}.value='author'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===${reviewFixture.questions.length})`, 'AVAILABLE fixture draft metadata');
  assert.equal(await evaluate(`Boolean(${query('staff-review-evidence-open')})`), false, 'AUTHOR alone receives no recorded-evidence action');
  const expectedQuestionTexts = [
    'Bản xem trước tổng hợp 1; không phải nội dung kỳ thi.',
    'Bản xem trước tổng hợp 2; không phải nội dung kỳ thi.',
    'Bản xem trước tổng hợp 3; không phải nội dung kỳ thi.',
  ];
  assert.equal(reviewFixture.questions.length >= 3, true, 'disposable fixture provides all three interaction types');
  const availableReviewUrls = reviewFixture.questions.map((item) =>
    `${reviewFixture.origin}/api/v1/question-versions/${encodeURIComponent(item.versionId)}/review-context`);
  assert.equal(requests.some((url) => availableReviewUrls.includes(url)), false, 'AVAILABLE review-context is not prefetched while opening the staff workspace');
  const interactionTypes = new Set();
  for (const [index, fixtureQuestion] of reviewFixture.questions.slice(0, 3).entries()) {
    const buttonSelector = `[data-testid="staff-review-inspect"][data-version-id="${fixtureQuestion.versionId}"]`;
    const inspectButton = `document.querySelector(${JSON.stringify(buttonSelector)})`;
    const path = `/api/v1/question-versions/${encodeURIComponent(fixtureQuestion.versionId)}/review-context`;
    const url = `${reviewFixture.origin}${path}`;
    assert.equal(await evaluate(`Boolean(${inspectButton})`), true, 'AVAILABLE fixture row exposes exact-version inspection');
    await evaluate(`${inspectButton}.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}))`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(requests.includes(url), false, 'hover does not request AVAILABLE private context');
    await evaluate(`${inspectButton}.focus()`);
    await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
    await waitFor(`${query('staff-review-context')}?.innerText.includes(${JSON.stringify(expectedQuestionTexts[index])})`, `AVAILABLE question ${index + 1} preview`);
    assert.equal(await evaluate(`document.activeElement.id`), 'staff-review-title', 'AVAILABLE context receives keyboard focus');
    assert.equal(requests.filter((requestUrl) => requestUrl === url).length, 1, 'one explicit selection makes one exact-version GET');
    const response = await evaluate(`fetch(${JSON.stringify(path)},{cache:'no-store'}).then(async response=>({status:response.status,body:await response.json()}))`);
    assert.equal(response.status, 200);
    assert.equal(response.body.version.versionId, fixtureQuestion.versionId);
    assert.equal(response.body.preview.status, 'AVAILABLE');
    assert.equal(response.body.environment, 'LOCAL_SYNTHETIC_ONLY');
    assert.equal(response.body.publicationEligibility, 'NOT_EVALUATED');
    assert.equal(response.body.rightsEvidenceIncluded, false);
    const question = response.body.preview.question;
    interactionTypes.add(question.interaction.type);
    const panelText = await evaluate(`${query('staff-review-context')}.innerText`);
    assert.equal(panelText.includes(response.body.version.contentHash), true, 'AVAILABLE view shows exact content hash');
    assert.equal(panelText.includes(`revision ${response.body.workflow.revision}`), true, 'AVAILABLE view shows workflow revision');
    assert.equal(panelText.includes(response.body.sources[0].currentRights.status), true, 'AVAILABLE view shows current rights status');
    assert.equal(panelText.includes(response.body.sources[0].currentRights.decisionId), true, 'AVAILABLE view shows exact current rights decision metadata');
    assert.equal(panelText.includes('không xác nhận quyền sử dụng hợp pháp'), true, 'AVAILABLE view discloses limits on legal qualification');
    const expectedAnswer = question.answerKey.type === 'SINGLE_CHOICE' ? question.answerKey.optionId
      : question.answerKey.type === 'MULTIPLE_CHOICE' ? question.answerKey.optionIds.join(', ')
        : question.interaction.statements.map((statement) => `${statement.id}: ${question.answerKey.values[statement.id] ? 'Đúng' : 'Sai'}`).join(' · ');
    assert.equal(panelText.includes(expectedAnswer), true, 'AVAILABLE view renders the answer key for this exact version');
    assert.equal(panelText.includes('Lời giải tổng hợp riêng để kiểm thử giao diện'), true, 'AVAILABLE view renders the private explanation');
    assert.equal(await evaluate(`${query('staff-review-context')}.querySelectorAll('img,iframe,script,object,embed').length`), 0, 'safe preview creates no active media or HTML nodes');
    if (index === 0) {
      assert.equal(await evaluate(`${query('staff-review-context')}.querySelectorAll('.content-math').length`), 1, 'local math renderer handles the explicit math block');
      await waitFor(`Boolean(${query('staff-review-context')}?.querySelector('.content-math[data-math-state="rendered"] math msup'))`, 'staff native MathML superscript');
      assert.equal(await evaluate(`${query('staff-review-context')}.querySelector('table.content-table caption')?.textContent`), 'Bảng tổng hợp riêng');
      assert.equal(await evaluate(`${query('staff-review-context')}.querySelectorAll('table.content-table th[scope="col"]').length`), 2, 'table uses semantic column headings');
      assert.equal(await evaluate(`Boolean(${query('staff-review-context')}.querySelector('.content-table-scroll[role="region"][tabindex="0"]'))`), true, 'table overflow has a keyboard-focusable labeled region');
      await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
      await evaluate(`document.querySelector('.staff-review-preview').scrollIntoView({block:'start'})`);
      report.privatePreviewMobile = await evaluate(`({innerWidth,documentWidth:document.documentElement.scrollWidth,visualScale:visualViewport.scale})`);
      assert.equal(report.privatePreviewMobile.innerWidth,375,'private metadata must not expand the mobile layout viewport');
      await noHorizontalOverflow();
      await screenshot('staff-private-preview-mobile');
      await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate(`document.querySelector('.staff-review-preview').scrollIntoView({block:'start'})`);
      await screenshot('staff-private-preview-desktop');
    }
    await pressKey('Escape', 'Escape', 27, String.fromCharCode(27));
    await waitFor(`!${query('staff-review-context')}`, `keyboard close of AVAILABLE question ${index + 1}`);
    assert.equal(await evaluate(`document.activeElement===${inspectButton}`), true, 'closing the AVAILABLE view restores focus to its exact row button');
  }
  assert.deepEqual([...interactionTypes].sort(), ['MULTIPLE_CHOICE', 'SINGLE_CHOICE', 'TRUE_FALSE_GROUP']);
  report.checks.push('separate disposable rights-valid fixture renders all three interaction types, local math, accessible table, exact rights metadata and private keys/explanations without unsafe DOM or external loads');

  if (reviewFixture.questions.length > 3) {
    const unsupportedQuestion = reviewFixture.questions[3];
    const unsupportedButtonSelector = `[data-testid="staff-review-inspect"][data-version-id="${unsupportedQuestion.versionId}"]`;
    const unsupportedButton = `document.querySelector(${JSON.stringify(unsupportedButtonSelector)})`;
    const unsupportedPath = `/api/v1/question-versions/${encodeURIComponent(unsupportedQuestion.versionId)}/review-context`;
    await evaluate(`${unsupportedButton}.focus()`);
    await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
    await waitFor(`Boolean(${query('staff-review-context')}?.innerText.includes('Chỉ hiển thị metadata'))`, 'unsafe-content metadata-only response');
    const unsupportedResponse = await evaluate(`fetch(${JSON.stringify(unsupportedPath)},{cache:'no-store'}).then(async response=>({status:response.status,body:await response.json()}))`);
    assert.equal(unsupportedResponse.status, 200);
    assert.equal(unsupportedResponse.body.preview.status, 'BLOCKED');
    assert.equal(unsupportedResponse.body.preview.reason, 'CONTENT_UNSUPPORTED');
    assert.equal(Object.hasOwn(unsupportedResponse.body.preview, 'question'), false, 'unsupported-content response omits the full question graph');
    assert.equal(await evaluate(`${query('staff-review-context')}.querySelectorAll('img,iframe,script,object,embed').length`), 0, 'unsafe blocked content creates no active DOM nodes');
    await pressKey('Escape', 'Escape', 27, String.fromCharCode(27));
    await waitFor(`!${query('staff-review-context')}`, 'close unsupported-content inspection');
    report.checks.push('real unsafe-content fixture returns CONTENT_UNSUPPORTED metadata-only with no active or external media');
  }

  const availableQuestion = reviewFixture.questions[0];
  const availablePath = `/api/v1/question-versions/${encodeURIComponent(availableQuestion.versionId)}/review-context`;
  const availableButtonSelector = `[data-testid="staff-review-inspect"][data-version-id="${availableQuestion.versionId}"]`;
  const availableButton = `document.querySelector(${JSON.stringify(availableButtonSelector)})`;
  await evaluate(`(()=>{
    window.__trackBHoldNextReviewResponse=true;
    window.__trackBReviewResponseHeld=false;
    window.__trackBHeldReviewStatus=null;
    window.__trackBReleaseReviewResponse=null;
    window.__trackBHoldNextLogoutResponse=true;
    window.__trackBLogoutResponseHeld=false;
    window.__trackBReleaseLogoutResponse=null;
    const original=window.fetch;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      const response=await original(input,init);
      if(url.pathname===${JSON.stringify(availablePath)}&&window.__trackBHoldNextReviewResponse){
        window.__trackBHoldNextReviewResponse=false;
        const payload=await response.clone().json();
        window.__trackBHeldReviewStatus=payload.preview.status;
        window.__trackBReviewResponseHeld=true;
        await new Promise(resolve=>window.__trackBReleaseReviewResponse=resolve);
        return new Response(JSON.stringify(payload),{status:response.status,headers:{'content-type':'application/json'}});
      }
      if(url.pathname==='/local-auth/logout'&&window.__trackBHoldNextLogoutResponse){
        window.__trackBHoldNextLogoutResponse=false;
        window.__trackBLogoutResponseHeld=true;
        await new Promise(resolve=>window.__trackBReleaseLogoutResponse=resolve);
      }
      return response;
    };
  })()`);
  await evaluate(`${availableButton}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor('window.__trackBReviewResponseHeld===true', 'AVAILABLE private response held before logout');
  assert.equal(await evaluate('window.__trackBHeldReviewStatus'), 'AVAILABLE', 'late-response case holds a real AVAILABLE server response');
  await click('staff-logout');
  await waitFor('window.__trackBLogoutResponseHeld===true', 'logout response held after the private view cleared');
  assert.equal(await evaluate(`Boolean(${query('staff-review-context')})`), false, 'logout clears the private view before its network response');
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(expectedQuestionTexts[0])})`), false, 'logout removes the question text immediately');
  await evaluate('window.__trackBReleaseLogoutResponse()');
  await waitFor(`Boolean(${query('staff-login')})`, 'login after clearing AVAILABLE private view on logout');
  await evaluate(`${query('actor-select')}.value='reviewer'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===${reviewFixture.questions.length})`, 'reviewer identity after logout');
  await evaluate('window.__trackBReleaseReviewResponse()');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await evaluate(`Boolean(${query('staff-review-context')})`), false, 'late AUTHOR response cannot reinsert private content after logout and reviewer login');
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(expectedQuestionTexts[0])})`), false, 'late AVAILABLE response remains absent after identity change');
  report.checks.push('a real AVAILABLE response arriving after logout and AUTHOR-to-REVIEWER identity change cannot restore private content');

  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login before return/reopen response test');
  await evaluate(`${query('actor-select')}.value='author'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===${reviewFixture.questions.length})`, 'AUTHOR identity before return/reopen response test');
  await evaluate(`(()=>{
    window.__trackBHoldNextReturnReview=true;
    window.__trackBReturnReviewHeld=false;
    window.__trackBHeldReturnReviewStatus=null;
    window.__trackBReleaseReturnReview=null;
    const original=window.fetch;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      const response=await original(input,init);
      if(url.pathname===${JSON.stringify(availablePath)}&&window.__trackBHoldNextReturnReview){
        window.__trackBHoldNextReturnReview=false;
        const payload=await response.clone().json();
        window.__trackBHeldReturnReviewStatus=payload.preview.status;
        window.__trackBReturnReviewHeld=true;
        await new Promise(resolve=>window.__trackBReleaseReturnReview=resolve);
        return new Response(JSON.stringify(payload),{status:response.status,headers:{'content-type':'application/json'}});
      }
      return response;
    };
  })()`);
  await evaluate(`${availableButton}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor('window.__trackBReturnReviewHeld===true', 'AVAILABLE private response held before return');
  assert.equal(await evaluate('window.__trackBHeldReturnReviewStatus'), 'AVAILABLE');
  await click('staff-return');
  await waitFor(`Boolean(${query('staff-open')})`, 'landing after return clears the private view');
  await click('staff-open');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===${reviewFixture.questions.length})`, 'reopened AUTHOR workspace');
  await evaluate('window.__trackBReleaseReturnReview()');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await evaluate(`Boolean(${query('staff-review-context')})`), false, 'late response from the exited workspace cannot restore private content after reopen');
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(expectedQuestionTexts[0])})`), false, 'reopened workspace contains metadata only until another explicit inspection');
  await evaluate(`${availableButton}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor(`${query('staff-review-context')}?.innerText.includes(${JSON.stringify(expectedQuestionTexts[0])})`, 'explicit reinspection after workspace reopen');
  await pressKey('Escape', 'Escape', 27, String.fromCharCode(27));
  await waitFor(`!${query('staff-review-context')}`, 'close of reopened private inspection');
  report.checks.push('return/reopen invalidates a pending real AVAILABLE response and a later explicit inspection works');

  const evidenceQuestion = reviewFixture.questions[0];
  const evidencePath = `/api/v1/question-versions/${encodeURIComponent(evidenceQuestion.versionId)}/review-evidence`;
  const evidenceUrl = `${reviewFixture.origin}${evidencePath}`;
  const evidenceButtonSelector = `[data-testid="staff-review-evidence-open"][data-version-id="${evidenceQuestion.versionId}"]`;
  const evidenceButton = `document.querySelector(${JSON.stringify(evidenceButtonSelector)})`;
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login before synthetic Bank Manager evidence view');
  await evaluate(`${query('actor-select')}.value='bankManager'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===${reviewFixture.questions.length})`, 'synthetic Bank Manager metadata workspace');
  await waitFor(`document.querySelectorAll('[data-testid="staff-review-evidence-open"]').length===${reviewFixture.questions.length}`, 'Bank Manager evidence actions');
  assert.equal(requests.includes(evidenceUrl), false, 'evidence is not prefetched while metadata is loaded');
  await evaluate(`${evidenceButton}.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}))`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(requests.includes(evidenceUrl), false, 'hover does not fetch recorded rights evidence');

  await evaluate(`(()=>{
    const original=window.fetch;
    window.__trackBEvidenceFailOnce=true;
    window.__trackBLastEvidenceResponse=null;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.pathname===${JSON.stringify(evidencePath)}&&window.__trackBEvidenceFailOnce){
        window.__trackBEvidenceFailOnce=false;
        return new Response(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE'}}),{status:503,headers:{'content-type':'application/json'}});
      }
      const response=await original(input,init);
      if(url.pathname===${JSON.stringify(evidencePath)}) window.__trackBLastEvidenceResponse={status:response.status,body:await response.clone().json()};
      return response;
    };
  })()`);
  await evaluate(`${evidenceButton}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor(`Boolean(${query('staff-review-evidence')}?.innerText.includes('Không thể tải bằng chứng quyền'))`, 'safe temporary evidence error');
  assert.equal(await evaluate(`Boolean(${query('staff-recorded-evidence-text')})`), false, 'error view has no evidence text');
  assert.equal(await evaluate(`document.activeElement.id`), 'staff-review-evidence-title', 'evidence error view receives keyboard focus');
  await click('staff-review-evidence-retry');
  await waitFor(`Boolean(${query('staff-review-evidence')}?.querySelector('[data-testid="staff-recorded-evidence-text"]')?.textContent===${JSON.stringify(reviewFixture.evidenceText)})`, 'retry returns the exact recorded evidence text');
  const evidenceResponse = await evaluate('window.__trackBLastEvidenceResponse');
  assert.equal(evidenceResponse.status, 200);
  const evidence = evidenceResponse.body;
  assert.deepEqual(Object.keys(evidence).sort(), [
    'accessBasis', 'environment', 'observedAt', 'publicationEligibility', 'qualification', 'schemaVersion', 'sources', 'version',
  ]);
  assert.equal(evidence.schemaVersion, 'staff-review-evidence/1');
  assert.equal(evidence.accessBasis, 'BANK_MANAGER');
  assert.equal(evidence.environment, 'LOCAL_SYNTHETIC_ONLY');
  assert.deepEqual(Object.keys(evidence.version).sort(), ['contentHash', 'versionId', 'workflowRevision']);
  assert.equal(evidence.version.versionId, evidenceQuestion.versionId);
  assert.equal(evidence.version.contentHash, evidenceQuestion.contentHash);
  assert.ok(Number.isSafeInteger(evidence.version.workflowRevision) && evidence.version.workflowRevision > 0);
  assert.equal(evidence.qualification, 'NOT_ATTESTED_BY_PLATFORM');
  assert.equal(evidence.publicationEligibility, 'NOT_EVALUATED');
  assert.equal(Object.hasOwn(evidence, 'question'), false);
  assert.equal(Object.hasOwn(evidence, 'answerKey'), false);
  assert.equal(Object.hasOwn(evidence, 'explanation'), false);
  assert.equal(evidence.sources.length, 1);
  const currentDecision = evidence.sources[0].currentDecision;
  assert.equal(typeof currentDecision.decisionId, 'string');
  assert.ok(Number.isSafeInteger(currentDecision.revision) && currentDecision.revision > 0);
  assert.equal(currentDecision.recordedEvidence.state, 'TEXT_AVAILABLE');
  assert.equal(currentDecision.recordedEvidence.text, reviewFixture.evidenceText);
  assert.equal(requests.filter((requestUrl) => requestUrl === evidenceUrl).length, 1, 'retry performs one actual explicit evidence GET');
  assert.deepEqual(networkOperations.filter(({ url }) => url === evidenceUrl).map(({ method, hasPostData }) => ({ method, hasPostData })),
    [{ method: 'GET', hasPostData: false }], 'evidence action is a bodyless GET');
  const evidencePanelText = await evaluate(`${query('staff-review-evidence')}.innerText`);
  for (const expected of [evidence.version.versionId, evidence.version.contentHash, 'Revision quy trình tại thời điểm quan sát', String(evidence.version.workflowRevision),
    evidence.observedAt, currentDecision.decisionId, 'Revision quyết định', String(currentDecision.revision), currentDecision.status,
    'NOT_ATTESTED_BY_PLATFORM', 'NOT_EVALUATED', 'chưa được nền tảng xác minh']) {
    assert.equal(evidencePanelText.includes(expected), true, `evidence panel shows ${expected}`);
  }
  assert.equal(await evaluate(`${query('staff-recorded-evidence-text')}.textContent`), reviewFixture.evidenceText, 'recorded text is rendered verbatim as inert text');
  assert.equal(await evaluate(`${query('staff-review-evidence')}.querySelectorAll('img,iframe,script,object,embed,a').length`), 0,
    'hostile markup and URI text create no active content or links');
  assert.equal(requests.includes('https://invalid.example/evidence.png'), false, 'recorded image URI causes no request');
  assert.equal(requests.includes('https://invalid.example/recorded-claim'), false, 'recorded URL remains inert text');
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await noHorizontalOverflow();
  assert.equal(await evaluate(`${query('staff-recorded-evidence-text')}.getBoundingClientRect().width <= innerWidth`), true,
    'recorded evidence fits the 375px layout');
  report.staffEvidenceMobile = await evaluate(`({innerWidth,documentWidth:document.documentElement.scrollWidth,visualScale:visualViewport.scale})`);
  await evaluate(`${query('staff-review-evidence')}.scrollIntoView({block:'start',inline:'nearest'})`);
  await screenshot('staff-rights-evidence-mobile');
  await evaluate(`${query('staff-recorded-evidence-text')}.scrollIntoView({block:'center',inline:'nearest'})`);
  await screenshot('staff-rights-evidence-text-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate(`${query('staff-recorded-evidence-text')}.scrollIntoView({block:'center',inline:'nearest'})`);
  await screenshot('staff-rights-evidence-text-desktop');
  await click('staff-review-evidence-close');
  await waitFor(`!${query('staff-review-evidence')}`, 'evidence close button clears private text');
  assert.equal(await evaluate(`document.activeElement===${evidenceButton}`), true, 'evidence close restores focus to the exact row action');
  await evaluate(`${evidenceButton}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor(`${query('staff-review-evidence')}?.innerText.includes(${JSON.stringify(reviewFixture.evidenceText.slice(0, 38))})`, 'reopened evidence view');
  await pressKey('Escape', 'Escape', 27, String.fromCharCode(27));
  await waitFor(`!${query('staff-review-evidence')}`, 'Escape clears recorded evidence');
  assert.equal(await evaluate(`document.activeElement===${evidenceButton}`), true, 'Escape restores focus to the exact row action');
  report.checks.push('BANK_MANAGER explicitly loads exact current rights evidence; hostile HTML and URLs stay inert, error/retry/focus/Escape/close/mobile work, with no private structured question fields');

  await evaluate(`(()=>{
    const original=window.fetch;
    window.__trackBHoldNextEvidence=true;
    window.__trackBEvidenceHeld=false;
    window.__trackBReleaseEvidence=null;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      const response=await original(input,init);
      if(url.pathname===${JSON.stringify(evidencePath)}&&window.__trackBHoldNextEvidence){
        window.__trackBHoldNextEvidence=false;
        const payload=await response.clone().json();
        window.__trackBEvidenceHeld=true;
        await new Promise(resolve=>window.__trackBReleaseEvidence=resolve);
        return new Response(JSON.stringify(payload),{status:response.status,headers:{'content-type':'application/json'}});
      }
      return response;
    };
  })()`);
  await evaluate(`${evidenceButton}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor('window.__trackBEvidenceHeld===true', 'actual evidence response held before identity switch');
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login after clearing evidence');
  assert.equal(await evaluate(`Boolean(${query('staff-review-evidence')})`), false, 'logout clears the evidence panel before its response arrives');
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(reviewFixture.evidenceText)})`), false, 'logout removes the recorded evidence text immediately');
  await evaluate(`${query('actor-select')}.value='author'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')})`, 'AUTHOR identity after evidence logout');
  assert.equal(await evaluate(`Boolean(${query('staff-review-evidence-open')})`), false, 'AUTHOR identity has no recorded-evidence action');
  await evaluate('window.__trackBReleaseEvidence()');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await evaluate(`Boolean(${query('staff-review-evidence')})`), false, 'late BANK_MANAGER response cannot restore evidence after AUTHOR login');
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(reviewFixture.evidenceText)})`), false, 'late evidence remains absent after identity change');
  report.checks.push('logout and BANK_MANAGER-to-AUTHOR identity change clear the evidence view and discard a held real response');

  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login before evidence return/reopen race');
  await evaluate(`${query('actor-select')}.value='bankManager'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===${reviewFixture.questions.length})`, 'Bank Manager before evidence return/reopen race');
  await evaluate(`(()=>{
    const original=window.fetch;
    window.__trackBHoldNextEvidenceReturn=true;
    window.__trackBEvidenceReturnHeld=false;
    window.__trackBReleaseEvidenceReturn=null;
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      const response=await original(input,init);
      if(url.pathname===${JSON.stringify(evidencePath)}&&window.__trackBHoldNextEvidenceReturn){
        window.__trackBHoldNextEvidenceReturn=false;
        const payload=await response.clone().json();
        window.__trackBEvidenceReturnHeld=true;
        await new Promise(resolve=>window.__trackBReleaseEvidenceReturn=resolve);
        return new Response(JSON.stringify(payload),{status:response.status,headers:{'content-type':'application/json'}});
      }
      return response;
    };
  })()`);
  await evaluate(`${evidenceButton}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor('window.__trackBEvidenceReturnHeld===true', 'actual evidence response held before workspace return');
  await click('staff-return');
  await waitFor(`Boolean(${query('staff-open')})`, 'landing after evidence close on navigation');
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(reviewFixture.evidenceText)})`), false, 'return to practice removes evidence text');
  await click('staff-open');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===${reviewFixture.questions.length})`, 'reopened Bank Manager workspace');
  await evaluate('window.__trackBReleaseEvidenceReturn()');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await evaluate(`Boolean(${query('staff-review-evidence')})`), false, 'late response from returned workspace cannot reinsert evidence after reopen');
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(reviewFixture.evidenceText)})`), false, 'reopened workspace remains metadata-only without explicit evidence request');
  await evaluate(`${evidenceButton}.focus()`);
  await pressKey('Enter', 'Enter', 13, String.fromCharCode(13));
  await waitFor(`${query('staff-review-evidence')}?.innerText.includes(${JSON.stringify(reviewFixture.evidenceText.slice(0, 38))})`, 'explicit evidence request after reopen');
  await pressKey('Escape', 'Escape', 27, String.fromCharCode(27));
  await waitFor(`!${query('staff-review-evidence')}`, 'close explicit evidence request after reopen');
  report.checks.push('return/reopen clears a pending evidence response and requires a new explicit evidence request');

  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login for candidate evidence denial');
  await evaluate(`${query('actor-select')}.value='studentA'`);
  await click('staff-login');
  await waitFor(`Boolean(document.querySelector('.staff-denied'))`, 'candidate denial in evidence fixture');
  assert.equal(await evaluate(`Boolean(${query('staff-review-evidence-open')})`), false, 'candidate UI has no recorded-evidence action');
  const candidateEvidence = await evaluate(`fetch(${JSON.stringify(evidencePath)},{cache:'no-store'}).then(async response=>({status:response.status,body:await response.json()}))`);
  assert.equal(candidateEvidence.status, 403);
  assert.equal(candidateEvidence.body.error.code, 'FORBIDDEN');
  assert.equal(networkOperations.filter(({ url }) => url === evidenceUrl).every(({ method, hasPostData }) => method === 'GET' && !hasPostData), true,
    'all B2 UI evidence requests are bodyless GETs');
  report.checks.push('candidate has no evidence action and direct exact-version evidence access is denied with 403 FORBIDDEN');

  const mockOrigin = await serveMockOnly();
  await command('Page.navigate', { url: mockOrigin });
  await waitFor(`Boolean(${query('staff-open')})`, 'mock-only landing');
  await click('staff-open');
  await waitFor(`document.body.innerText.includes('PostgreSQL cục bộ chưa được khởi chạy')`, 'mock-only unavailable state');
  assert.equal(await evaluate(`Boolean(${query('staff-login')})`), false);
  report.checks.push('mock-only B0 link reports workspace unavailable instead of a fake login');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.deepEqual(requests.filter((url) => /^https?:/.test(url) && !url.startsWith(`${runtime.origin}/`)
    && !url.startsWith(`${reviewFixture.origin}/`) && !url.startsWith(`${mockOrigin}/`)), []);
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
  if (reviewFixture) await reviewFixture.close().catch((error) => { console.error(error); process.exitCode = 1; });
  if (runtime) await runtime.close().catch((error) => { console.error(error); process.exitCode = 1; });
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await rm(scratch, { recursive: true, force: true }).catch((error) => { console.error(error); process.exitCode = 1; });
  if (timedOut) process.exitCode = 1;
}
