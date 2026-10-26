// Browser acceptance for the local PostgreSQL staff workspace. All DB data and
// browser profile files live in temporary directories owned by this run.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPrototypeServer } from '../apps/practice-prototype/server.mjs';
import { createTrackBRuntime } from '../src/local/track-b.mjs';
import { createReviewBrowserFixture } from '../tests/integration/bank/review-browser-fixture.mjs';
import { inspectionImportPackage } from '../tests/integration/bank/review-import-fixture.mjs';
import { createFactoryImportService } from '../src/modules/bank/factory-import.mjs';

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

const pinForBrowser = (version) => ({versionId:version.versionId,contentHash:version.contentHash});
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
  assert.equal(await evaluate(`${query('staff-publication-status')}?.dataset.evaluation`), 'NOT_EVALUATED', 'blocked private access never implies a publication assessment');
  assert.equal(await evaluate(`${query('staff-publication-status')}?.innerText.includes('Not evaluated by this inspection.')`), true, 'publication status is understandable without interpreting an enum');
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
  assert.equal(await evaluate(`document.body.innerText.includes('chỉ được yêu cầu khi bạn chọn đúng phiên bản')`), true, 'staff notice explains that private context is fetched only after explicit selection');
  report.checks.push('synthetic REVIEWER sees safe metadata and explicit per-version access, without author actions or qualified-human claims');

  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'retained manager fixed diagnostics login');
  await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-fixed-open')})`,'retained fixed diagnostic action');
  await click('staff-fixed-open');await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='list-empty'`,'truthful retained fixed list empty');
  await pressKey('Escape','Escape',27,String.fromCharCode(27));assert.equal(await evaluate(`document.activeElement===${query('staff-fixed-open')}`),true);
  report.checks.push('B7 retained mode has an explicit manager fixed-reference action and truthful empty state, with Escape focus restoration and no invented run');

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
    assert.equal(await evaluate(`${query('staff-publication-status')}?.dataset.evaluation`), response.body.publicationEligibility, 'AVAILABLE preview preserves the unevaluated server publication status');
    assert.equal(await evaluate(`${query('staff-publication-status')}?.innerText.includes('does not establish qualified human review, lawful content rights, or permission to publish.')`), true, 'preview/workflow state is distinguished from permission to publish');
    assert.equal(await evaluate(`${query('staff-publication-status')}?.querySelectorAll('button,a,input').length`), 0, 'publication status grants no action or navigation');
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

  // B3 command UI uses actual PostgreSQL; interceptions model only response loss,
  // delayed delivery and unavailable follow-up reads around real accepted POSTs.
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'author login for explicit draft handoff');
  await evaluate(`${query('actor-select')}.value='author'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('draft-create')})`, 'author creation before handoff');
  await evaluate(`(()=>{
    const original=window.fetch;
    window.__b3={posts:[],created:[],dropNext:false,failReads:false,holdNext:false,held:false,release:null};
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      const method=(init.method??'GET').toUpperCase();
      if(window.__b3.failReads&&method==='GET'&&(url.pathname==='/api/v1/questions'||url.pathname.endsWith('/review-context')))
        return new Response(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE'}}),{status:503,headers:{'content-type':'application/json'}});
      const response=await original(input,init);
      if(method==='POST'&&url.pathname==='/api/v1/questions'&&response.status===201)window.__b3.created.push(await response.clone().json());
      if(method==='POST'&&url.pathname.endsWith('/submit-review')){
        const headers=new Headers(init.headers);
        window.__b3.posts.push({path:url.pathname,key:headers.get('idempotency-key'),csrfPresent:Boolean(headers.get('x-csrf-token')),body:JSON.parse(init.body),status:response.status});
        if(response.status===200&&window.__b3.dropNext){window.__b3.dropNext=false;throw new TypeError('Synthetic lost handoff success response');}
        if(response.status===200&&window.__b3.holdNext){window.__b3.holdNext=false;window.__b3.held=true;await new Promise(resolve=>window.__b3.release=resolve);}
      }
      return response;
    };
  })()`);
  await evaluate(`${query('draft-prompt')}.value='Bản nháp B3 tổng hợp do tác giả tạo qua giao diện; không phải nội dung kỳ thi.'`);
  await click('draft-create');
  await waitFor('window.__b3.created.length===1', 'real author form draft receipt');
  const queuedVersion=await evaluate('window.__b3.created[0]');
  async function inspectHandoffVersion(version) {
    await click('staff-refresh');
    const selector=`[data-testid="staff-review-inspect"][data-version-id="${version.versionId}"]`;
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, 'handoff version metadata row');
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await pressKey('Enter','Enter',13,String.fromCharCode(13));
    await waitFor(`Boolean(${query('handoff-open')})`, 'fresh AUTHOR_OWN DRAFT handoff action');
  }
  async function openHandoffDialog() {
    await click('handoff-open');
    await waitFor(`${query('handoff-dialog')}?.open===true`, 'explicit handoff confirmation');
  }
  const receiptTarget=reviewFixture.questions[0];
  await inspectHandoffVersion(receiptTarget);
  await openHandoffDialog();
  const confirmationText=await evaluate(`${query('handoff-dialog')}.textContent`);
  assert.equal(confirmationText.includes(receiptTarget.versionId),true);
  assert.equal(confirmationText.includes(receiptTarget.contentHash),true);
  assert.equal(await evaluate(`${query('handoff-dialog-revision')}.textContent`),'1');
  assert.equal(await evaluate(`document.activeElement===${query('handoff-cancel')}`),true,'confirmation initially focuses Cancel');
  assert.equal((await evaluate('window.__b3.posts')).length,0,'opening confirmation sends no POST');
  await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
  await noHorizontalOverflow();
  await screenshot('staff-handoff-confirm-mobile');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await click('handoff-cancel');
  await waitFor(`!${query('handoff-dialog')}?.open`, 'explicit confirmation cancellation');
  assert.equal(await evaluate(`document.activeElement===${query('handoff-open')}`),true);
  await openHandoffDialog();
  await pressKey('Escape','Escape',27,String.fromCharCode(27));
  await waitFor(`!${query('handoff-dialog')}?.open`, 'native confirmation Escape');
  assert.equal((await evaluate('window.__b3.posts')).length,0,'Cancel/Escape have no command side effects');
  await openHandoffDialog();
  await evaluate('window.__b3.dropNext=true');
  await click('handoff-confirm');
  await waitFor(`${query('handoff-status')}?.dataset.stage==='uncertain'`, 'uncertain lost success response');
  assert.equal(await evaluate(`Boolean(${query('handoff-retry')})`),true);
  assert.equal((await evaluate('window.__b3.posts')).length,1);
  await reviewFixture.fixture.workflow.quarantine(reviewFixture.fixture.principals.bankManager,
    receiptTarget.versionId,randomUUID(),{expectedRevision:2,reason:'Synthetic receipt replay after a newer hold, not UI approval.'});
  await evaluate('window.__b3.failReads=true');
  await click('handoff-retry');
  await waitFor(`${query('handoff-status')}?.dataset.stage==='acknowledged' && ${query('handoff-status')}?.textContent.includes('chưa khả dụng')`, 'receipt acknowledged while current reads unavailable');
  const retriedPosts=await evaluate('window.__b3.posts');
  assert.equal(retriedPosts.length,2);assert.equal(retriedPosts[0].key,retriedPosts[1].key);
  assert.deepEqual(retriedPosts[0].body,retriedPosts[1].body);
  assert.deepEqual(retriedPosts[0].body,{expectedRevision:1});
  assert.equal(retriedPosts.every(post=>post.csrfPresent&&post.status===200),true);
  assert.equal(await evaluate(`Boolean(${query('handoff-retry')})`),false,'acknowledged operation is not automatically retried');
  await evaluate('window.__b3.failReads=false');
  await click('handoff-reload');
  await waitFor(`${query('handoff-status')}?.dataset.stage==='acknowledged' && ${query('handoff-status')}?.textContent.includes('QUARANTINED')`, 'new current state is distinct from replayed IN_REVIEW receipt');
  assert.equal((await evaluate('window.__b3.posts')).length,2,'authoritative reload uses reads only');
  report.checks.push('B3 confirmation cancel/Escape sends no command; lost real success retries the same body/key, and replayed receipt is kept separate from unavailable or newer QUARANTINED state');

  const staleVersion=reviewFixture.questions[1];
  await inspectHandoffVersion(staleVersion);
  await openHandoffDialog();
  await reviewFixture.fixture.workflow.submitReview(reviewFixture.fixture.principals.author,
    staleVersion.versionId,randomUUID(),{expectedRevision:1});
  await click('handoff-confirm');
  await waitFor(`${query('handoff-status')}?.dataset.stage==='rejected'`, 'actual stale-revision rejection');
  assert.equal(await evaluate(`Boolean(${query('handoff-retry')})`),false,'known conflict cannot retry old intent');
  await click('handoff-reload');
  await waitFor(`${query('handoff-status')}?.dataset.stage==='reloaded' && ${query('handoff-status')}?.textContent.includes('IN_REVIEW')`, 'fresh state after real conflict');
  report.checks.push('B3 actual stale revision returns a truthful rejection and authoritative read; it never silently resubmits a new revision');

  await inspectHandoffVersion(queuedVersion);
  await openHandoffDialog();
  await click('handoff-confirm');
  await waitFor(`${query('handoff-status')}?.dataset.stage==='acknowledged' && ${query('handoff-status')}?.textContent.includes('Trạng thái hiện tại được máy chủ ghi nhận')`, 'normal author form→handoff acknowledgement and current read');
  assert.equal(await evaluate(`${query('handoff-status')}.textContent.includes('IN_REVIEW')`),true);
  const postCountBeforeReload=networkOperations.filter(({url,method})=>method==='POST'&&url.endsWith('/submit-review')).length;
  await command('Page.reload',{});
  await waitFor(`Boolean(${query('staff-open')})`, 'landing after handoff page reload');
  await click('staff-open');
  await waitFor(`Boolean(${query('draft-create')})`, 'persistent author identity after reload');
  assert.equal(networkOperations.filter(({url,method})=>method==='POST'&&url.endsWith('/submit-review')).length,postCountBeforeReload,'page reload never creates another handoff');
  assert.equal(await evaluate(`Boolean(${query('handoff-status')})`),false,'reload does not fabricate an old intent');
  report.checks.push('B3 real author form creation→inspection→explicit handoff observes IN_REVIEW; page reload performs reads without another POST');

  // A real accepted command can finish after logout; only its UI completion is discarded.
  await evaluate(`(()=>{const original=window.fetch;window.__b3LateHeld=false;window.__b3LateRelease=null;window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if((init.method??'GET').toUpperCase()==='POST'&&url.pathname.endsWith('/submit-review')&&response.status===200){window.__b3LateHeld=true;await new Promise(resolve=>window.__b3LateRelease=resolve);}return response;};})()`);
  await inspectHandoffVersion(reviewFixture.questions[2]);
  await openHandoffDialog();
  await click('handoff-confirm');
  await waitFor('window.__b3LateHeld===true','real accepted handoff held before logout');
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'login after handoff logout');
  await evaluate(`${query('actor-select')}.value='reviewer'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-review-queue')})`, 'reviewer identity while old command response is held');
  await evaluate('window.__b3LateRelease()');
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await evaluate(`Boolean(${query('handoff-status')})`),false,'late author completion cannot restore a status panel under reviewer identity');
  assert.equal(await evaluate(`Boolean(${query('handoff-open')})`),false,'reviewer has no author handoff control');
  report.checks.push('B3 accepted handoff survives on the server while logout/identity fencing discards its late author UI completion');

  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'review queue synthetic reviewer login');
  await evaluate(`${query('actor-select')}.value='reviewer'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-review-queue')})`, 'review queue shortcut');
  await evaluate(`${query('staff-review-queue')}.focus()`);
  await pressKey('Enter','Enter',13,String.fromCharCode(13));
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===3 && ${query('staff-question-list')}?.innerText.includes(${JSON.stringify(queuedVersion.versionId)}))`, 'exact queued version through approved metadata filter');
  assert.equal(await evaluate(`${query('staff-state-filter')}.value`),'IN_REVIEW');
  assert.equal(await evaluate(`${query('staff-section-filter')}.value`),'');
  const queuedEvidence = `[data-testid="staff-review-evidence-open"][data-version-id="${queuedVersion.versionId}"]`;
  await evaluate(`document.querySelector(${JSON.stringify(queuedEvidence)}).focus()`);
  await pressKey('Enter','Enter',13,String.fromCharCode(13));
  await waitFor(`${query('staff-review-evidence')}?.innerText.includes('REVIEW_QUEUE')`, 'independent reviewer evidence on actual queued version');
  assert.equal(await evaluate(`${query('staff-recorded-evidence-text')}.textContent`),reviewFixture.evidenceText);
  await evaluate(`${query('staff-review-queue')}.focus()`);
  await pressKey('Enter','Enter',13,String.fromCharCode(13));
  await waitFor(`!${query('staff-review-evidence')}`, 'queue refresh clears private evidence');
  await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
  await noHorizontalOverflow();
  await evaluate(`${query('staff-question-list')}.scrollIntoView({block:'center'})`);
  await screenshot('staff-review-queue-mobile');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  const queueCalls=networkOperations.filter(({url})=>url.startsWith(`${reviewFixture.origin}/api/v1/questions?`)&&new URL(url).searchParams.get('state')==='IN_REVIEW');
  assert.ok(queueCalls.length>=2);
  assert.equal(queueCalls.every(({method,hasPostData})=>method==='GET'&&!hasPostData),true,'queue shortcut is metadata-only GET');
  assert.equal(await evaluate(`Boolean(${query('draft-create')})`),false);
  report.checks.push('keyboard review-queue shortcut uses the existing IN_REVIEW metadata GET, clears private evidence and enables server-authorized independent queued-reviewer evidence on mobile');

  // Negative-only B4 actions use real commands; responses are intercepted only
  // to model loss/uncertainty after commit, never to invent an accepted write.
  await evaluate(`(()=>{const original=window.fetch;window.__b4={posts:[],loseReject:true,failQuarantine:true,holdQuarantine:true,held:false,release:null};window.fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href),method=(init.method??'GET').toUpperCase();
    const response=await original(input,init);
    if(method==='POST'&&(url.pathname.endsWith('/reviews')||url.pathname.endsWith('/quarantine'))){
      window.__b4.posts.push({path:url.pathname,body:JSON.parse(init.body),key:new Headers(init.headers).get('idempotency-key'),status:response.status});
      if(url.pathname.endsWith('/reviews')&&response.status===201&&window.__b4.loseReject){window.__b4.loseReject=false;throw new TypeError('Synthetic lost rejection acknowledgement');}
      if(url.pathname.endsWith('/quarantine')&&response.status===200){
        if(window.__b4.failQuarantine){window.__b4.failQuarantine=false;return new Response(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE'}}),{status:503,headers:{'content-type':'application/json'}});}
        if(window.__b4.holdQuarantine){window.__b4.holdQuarantine=false;window.__b4.held=true;await new Promise(resolve=>window.__b4.release=resolve);}
      }
    }
    return response;
  };})()`);
  async function inspectDisposition(version,kind) {
    await evaluate(`(()=>{const select=${query('staff-state-filter')};select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(`${query('staff-list-status')}?.textContent.startsWith('Đang hiển thị')`,'complete metadata filter before disposition');
    const selector=`[data-testid="staff-review-inspect"][data-version-id="${version.versionId}"]`;
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`,'exact disposition target row');
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await pressKey('Enter','Enter',13,String.fromCharCode(13));
    await waitFor(`Boolean(${query('disposition-'+kind+'-open')})`,'fresh eligible private inspection before disposition');
  }
  const rubricKeys=['correctness','unambiguous','relevant','language','explanation','rights'];
  async function fillDisposition(reason,withRubric=false) {
    if(withRubric) await evaluate(`(()=>{for(const key of ${JSON.stringify(rubricKeys)}){const select=document.querySelector('[data-testid="disposition-rubric-'+key+'"]');select.value=key==='correctness'?'FAIL':'PASS';select.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
    await evaluate(`(()=>{const input=${query('disposition-form-reason')};input.value=${JSON.stringify(reason)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  }
  await inspectDisposition(queuedVersion,'reject');
  assert.equal(await evaluate(`Boolean(${query('disposition-quarantine-open')})`),false,'reviewer has no quarantine override');
  await click('disposition-reject-open');
  await waitFor(`${query('disposition-dialog')}?.open===true`,'explicit rejection dialog');
  assert.equal(await evaluate(`document.activeElement===${query('disposition-cancel')}`),true);
  assert.equal(await evaluate(`(()=>{const dialog=${query('disposition-dialog')};return dialog.getAttribute('aria-describedby').split(' ').filter(Boolean).every(id=>Boolean(document.getElementById(id)));})()`),true,'all dialog description references exist');
  assert.equal(await evaluate(`Array.from(${query('disposition-dialog')}.querySelectorAll('select')).every(select=>select.value===''&&select.required)`),true,'all six rubric findings start unset');
  await click('disposition-confirm');
  assert.equal((await evaluate('window.__b4.posts')).length,0,'incomplete form cannot fabricate a rubric or send rejection');
  const privateSentinel='Synthetic private cancellation reason '+randomUUID();
  await fillDisposition(privateSentinel,true);
  assert.equal(await evaluate('document.body.textContent.includes('+JSON.stringify(privateSentinel)+')'),true,'typed summary exists while confirmation is open');
  await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
  await noHorizontalOverflow();
  await evaluate(`${query('disposition-dialog')}.scrollTop=0`);
  await screenshot('staff-reject-confirm-mobile');
  await evaluate(`${query('disposition-form-reason')}.scrollIntoView({block:'center'})`);
  await screenshot('staff-reject-confirm-fields-mobile');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await click('disposition-cancel');
  await waitFor(`!${query('disposition-dialog')}?.open`,'rejection cancel closes native dialog');
  assert.equal(await evaluate('document.body.textContent.includes('+JSON.stringify(privateSentinel)+')'),false,'Cancel clears copied private reason/rubric from hidden DOM');
  assert.equal(await evaluate(`${query('disposition-form-reason')}.value`),'');
  assert.equal(await evaluate(`document.activeElement===${query('disposition-reject-open')}`),true);
  await click('disposition-reject-open');
  await fillDisposition(privateSentinel,true);
  await pressKey('Escape','Escape',27,String.fromCharCode(27));
  await waitFor(`!${query('disposition-dialog')}?.open`,'rejection Escape cancellation');
  assert.equal(await evaluate('document.body.textContent.includes('+JSON.stringify(privateSentinel)+')'),false,'Escape clears hidden private summary');
  assert.equal((await evaluate('window.__b4.posts')).length,0,'cancel paths send no mutation');
  await click('disposition-reject-open');
  const historyReason='Kiểm thử từ chối tổng hợp; không phải đánh giá người đủ điều kiện. <img src="https://invalid.example/history.png" onerror="alert(1)"> https://invalid.example/reason';
  await fillDisposition(historyReason,true);
  await click('disposition-confirm');
  await waitFor(`${query('disposition-status')}?.dataset.stage==='uncertain'`,'lost actual rejection response is uncertain');
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-review-preview'))`),false,'pending/uncertain command clears old private preview');
  await click('disposition-retry');
  await waitFor(`${query('disposition-status')}?.dataset.stage==='acknowledged' && ${query('disposition-status')}?.dataset.currentState==='unobserved'`,'rejection receipt is separate from lost queued private access');
  const rejectionPosts=await evaluate('window.__b4.posts.filter(post=>post.path.endsWith("/reviews"))');
  assert.equal(rejectionPosts.length,2);assert.equal(rejectionPosts[0].key,rejectionPosts[1].key);
  assert.deepEqual(rejectionPosts[0].body,rejectionPosts[1].body);
  assert.equal(rejectionPosts[0].body.decision,'REJECT');assert.equal(rejectionPosts[0].body.contentHash,queuedVersion.contentHash);
  assert.equal(rejectionPosts[0].body.reason.startsWith('Local synthetic disposition: '),true);
  assert.equal(rejectionPosts.every(post=>post.status===201),true);
  assert.equal(await evaluate(`${query('disposition-status')}.dataset.receiptState`),'REJECTED');
  assert.equal(await evaluate(`Boolean(${query('staff-review-context')}?.querySelector('.staff-review-preview'))`),false);
  assert.equal(await evaluate(`Boolean(${query('disposition-retry')})`),false,'acknowledged rejection does not issue another intent');
  report.checks.push('B4 six explicit rubric choices/reason and native cancel/Escape privacy; lost real rejection receipt retries same key/body, and after queued private access disappears current state stays unobserved');

  await inspectDisposition(staleVersion,'reject');
  await click('disposition-reject-open');
  await fillDisposition('Kiểm thử xung đột tổng hợp, không tự thay revision.',true);
  await reviewFixture.fixture.workflow.quarantine(reviewFixture.fixture.principals.bankManager,
    staleVersion.versionId,randomUUID(),{expectedRevision:2,reason:'Synthetic external hold before stale UI rejection.'});
  await click('disposition-confirm');
  await waitFor(`${query('disposition-status')}?.dataset.stage==='rejected'`,'real stale rejection conflict');
  assert.equal(await evaluate(`Boolean(${query('disposition-retry')})`),false);
  await click('disposition-reload');
  await waitFor(`${query('disposition-status')}?.dataset.stage==='reload-failed'`,'reviewer authoritative reload unavailable after hold');
  assert.equal(await evaluate(`${query('disposition-status')}.dataset.currentState`),'unobserved');
  report.checks.push('B4 actual rejection conflict offers reads without replacing the captured revision; loss of reviewer private access is truthful');

  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'manager login for hold');
  await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');
  await waitFor(`Boolean(${query('staff-state-filter')})`,'manager metadata');
  await inspectDisposition(reviewFixture.questions[2],'quarantine');
  assert.equal(await evaluate(`Boolean(${query('disposition-reject-open')})`),false,'manager basis has no rejection form');
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-review-preview'))`),true);
  await click('disposition-quarantine-open');
  await waitFor(`${query('disposition-dialog')}?.open===true`,'quarantine explicit confirmation');
  assert.equal(await evaluate(`${query('disposition-warning')}.textContent.includes('lượt thi')&&${query('disposition-warning')}.textContent.includes('kết quả')`),true,'hold confirmation discloses related student impact');
  await fillDisposition('Kiểm thử cách ly tổng hợp và phản hồi sau commit.');
  await click('disposition-confirm');
  await waitFor(`${query('disposition-status')}?.dataset.stage==='uncertain'`,'503 after real committed quarantine is uncertain');
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-review-preview'))`),false,'uncertain hold never retains stale question/key/explanation');
  await click('disposition-retry');
  await waitFor('window.__b4.held===true','real quarantine replay held before logout');
  const holdPosts=await evaluate('window.__b4.posts.filter(post=>post.path.endsWith("/quarantine"))');
  assert.equal(holdPosts.length,2);assert.equal(holdPosts[0].key,holdPosts[1].key);assert.deepEqual(holdPosts[0].body,holdPosts[1].body);
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'logout while hold replay pending');
  await evaluate(`${query('actor-select')}.value='studentA'`);await click('staff-login');
  await waitFor('Boolean(document.querySelector(".staff-denied"))','candidate after manager mutation');
  await evaluate('window.__b4.release()');await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await evaluate(`Boolean(${query('disposition-status')})`),false,'late manager completion cannot restore private disposition status under candidate');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'manager authoritative inspection after hold');
  await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');
  await waitFor(`Boolean(${query('staff-state-filter')})`,'manager metadata after hold');
  await evaluate(`(()=>{const select=${query('staff-state-filter')};select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`${query('staff-list-status')}?.textContent.startsWith('Đang hiển thị')`,'held version metadata');
  const heldSelector=`[data-testid="staff-review-inspect"][data-version-id="${reviewFixture.questions[2].versionId}"]`;
  await evaluate(`document.querySelector(${JSON.stringify(heldSelector)}).focus()`);await pressKey('Enter','Enter',13,String.fromCharCode(13));
  await waitFor(`${query('staff-review-context')}?.textContent.includes('QUARANTINED')`,'current manager hold metadata');
  assert.equal(await evaluate(`${query('staff-publication-status')}?.dataset.evaluation`), 'NOT_EVALUATED', 'held workflow remains separate from publication assessment');
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-review-preview'))`),false);
  assert.equal(await evaluate(`Boolean(${query('disposition-quarantine-open')})`),false,'already-held version cannot create another hold intent');
  report.checks.push('B4 manager quarantine discloses related impact, treats post-commit error as uncertain and retries same intent; logout fences late receipt and fresh held view contains no private question');

  await inspectDisposition(reviewFixture.questions[3],'quarantine');
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-review-preview'))`),false,'unsupported preview still permits an explicit metadata-based manager hold');

  const importCapability=Object.freeze({});
  const importService=await createFactoryImportService({bankPool:reviewFixture.fixture.bankPool,identityService:reviewFixture.identity,internalCapability:importCapability});
  const imported=await inspectionImportPackage(reviewFixture.fixture.pool,reviewFixture.fixture.principals.studentB.userId);
  await importService.importFactoryPackageV2(reviewFixture.fixture.principals.author,imported,importCapability);
  const importedAncestor=imported.candidates[0].question.parentVersionId;
  await reviewFixture.fixture.pool.query("UPDATE tsa.question_workflow SET state='IN_REVIEW',revision=2 WHERE question_version_id=$1",[importedAncestor]);
  await reviewFixture.fixture.pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'REVIEWER')",[reviewFixture.fixture.principals.author.userId]);
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'original importer login for queue independence');
  await evaluate(`${query('actor-select')}.value='author'`);await click('staff-login');
  await waitFor(`Boolean(${query('staff-review-queue')})`,'combined author/reviewer synthetic role');
  await click('staff-review-queue');
  const ancestorSelector=`[data-testid="staff-review-inspect"][data-version-id="${importedAncestor}"]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(ancestorSelector)}))`,'receipt-less imported ancestor safe metadata');
  await evaluate(`document.querySelector(${JSON.stringify(ancestorSelector)}).focus()`);await pressKey('Enter','Enter',13,String.fromCharCode(13));
  await waitFor(`${query('staff-review-context')}?.textContent.includes('không còn sẵn có')`,'original import operator denied exact private ancestor inspection');
  assert.equal(await evaluate(`Boolean(${query('disposition-reject-open')})`),false,'original import operator never receives a rejection form');
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-review-preview'))`),false);
  report.checks.push('B4 genuine imported ancestor without candidate receipt remains unavailable to its original operator even with current REVIEWER role; UI exposes no review mutation');

  // Existing-contract author form: create real typed drafts, then reload/read
  // their private preview. The transport observer never fabricates responses.
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'typed author login');
  await evaluate(`${query('actor-select')}.value='author'`);await click('staff-login');
  await waitFor(`Boolean(${query('draft-interaction-type')})`,'three-type author editor');
  async function observeAuthorEditor() {
    await evaluate(`(()=>{const original=window.fetch;window.__authorEditor={posts:[],reads:[]};window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);const response=await original(input,init);
      if(url.pathname==='/api/v1/questions'&&init.method==='POST')window.__authorEditor.posts.push({body:JSON.parse(init.body),status:response.status,receipt:await response.clone().json()});
      if(url.pathname.endsWith('/review-context'))window.__authorEditor.reads.push({path:url.pathname,status:response.status,body:await response.clone().json()});
      return response;};})()`);
  }
  async function chooseDraftType(type) {
    await evaluate(`(()=>{const select=${query('draft-interaction-type')};select.value=${JSON.stringify(type)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function setDraftText(id,value) {
    await evaluate(`(()=>{const input=${query(id)};input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  }
  await observeAuthorEditor();
  for(const type of ['MULTIPLE_CHOICE','TRUE_FALSE_GROUP']) {
    await chooseDraftType(type);
    const prompt=`Bản nháp tổng hợp ${type}; chỉ kiểm thử trình biên soạn, không phải đề thi.`;
    const texts=type==='MULTIPLE_CHOICE'?['Phương án tổng hợp A','Phương án tổng hợp B']:['Mệnh đề tổng hợp đúng','Mệnh đề tổng hợp sai'];
    await setDraftText('draft-prompt',prompt);
    await setDraftText('draft-option-a',texts[0]);await setDraftText('draft-option-b',texts[1]);
    await setDraftText('draft-explanation','Lời giải riêng tổng hợp cho trình biên soạn.');
    if(type==='MULTIPLE_CHOICE') {
      assert.equal(await evaluate(`${query('draft-answer-multiple-a')}.checked||${query('draft-answer-multiple-b')}.checked`),false);
    } else {
      assert.equal(await evaluate(`${query('draft-answer-true-false-a')}.value+${query('draft-answer-true-false-b')}.value`),'');
    }
    const before=await evaluate('window.__authorEditor.posts.length');
    await click('draft-create');
    await evaluate('new Promise(resolve=>setTimeout(resolve,80))');
    assert.equal(await evaluate('window.__authorEditor.posts.length'),before,'incomplete key never sends create POST');
    if(type==='MULTIPLE_CHOICE') {
      await evaluate(`${query('draft-answer-multiple-a')}.focus()`);await pressKey(' ','Space',32,' ');
      assert.equal(await evaluate(`${query('draft-answer-multiple-a')}.checked`),true,'checkbox supports keyboard Space');
      await evaluate(`${query('draft-answer-multiple-b')}.focus()`);await pressKey(' ','Space',32,' ');
    } else {
      await setDraftText('draft-answer-true-false-a','true');await click('draft-create');
      await evaluate('new Promise(resolve=>setTimeout(resolve,80))');
      assert.equal(await evaluate('window.__authorEditor.posts.length'),before,'one unset TF statement never sends create POST');
      await setDraftText('draft-answer-true-false-b','false');
    }
    await setDraftText('draft-option-a','   ');await click('draft-create');
    await evaluate('new Promise(resolve=>setTimeout(resolve,80))');
    assert.equal(await evaluate('window.__authorEditor.posts.length'),before,'whitespace-only entry never sends create POST');
    await setDraftText('draft-option-a',texts[0]);
    await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
    await noHorizontalOverflow();await evaluate(`${query('draft-interaction-type')}.scrollIntoView({block:'start'})`);
    await screenshot(`staff-author-${type.toLowerCase()}-mobile`);
    await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await click('draft-create');await waitFor(`window.__authorEditor.posts.length===${before+1}`,'typed draft real receipt');
    const posted=await evaluate('window.__authorEditor.posts.at(-1)');assert.equal(posted.status,201);
    const expectedInteraction=type==='MULTIPLE_CHOICE'?{type,options:[{id:'a',content:[{type:'text',text:texts[0]}]},{id:'b',content:[{type:'text',text:texts[1]}]}],minSelections:1,maxSelections:2}:{type,statements:[{id:'a',content:[{type:'text',text:texts[0]}]},{id:'b',content:[{type:'text',text:texts[1]}]}]};
    const expectedKey=type==='MULTIPLE_CHOICE'?{type,optionIds:['a','b']}:{type,values:{a:true,b:false}};
    assert.deepEqual(posted.body.interaction,expectedInteraction);assert.deepEqual(posted.body.answerKey,expectedKey);
    const postsBeforeReload=networkOperations.filter(op=>op.method==='POST'&&new URL(op.url).pathname==='/api/v1/questions').length;
    await command('Page.reload');await waitFor(`Boolean(${query('staff-open')})`,'landing after typed draft reload');
    await click('staff-open');await waitFor(`Boolean(${query('draft-interaction-type')}&&${query('staff-question-list')})`,'typed draft survives author reopen');
    assert.equal(networkOperations.filter(op=>op.method==='POST'&&new URL(op.url).pathname==='/api/v1/questions').length,postsBeforeReload,'reload creates no draft');
    await observeAuthorEditor();
    const typedSelector=`[data-testid="staff-review-inspect"][data-version-id="${posted.receipt.versionId}"]`;
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(typedSelector)}))`,'persisted typed draft metadata');
    await evaluate(`document.querySelector(${JSON.stringify(typedSelector)}).focus()`);await pressKey('Enter','Enter',13,String.fromCharCode(13));
    await waitFor(`Boolean(document.querySelector('.staff-review-preview')&&${query('handoff-open')})`,'typed private inspection with separate explicit handoff');
    const persisted=await evaluate('window.__authorEditor.reads.at(-1)');assert.equal(persisted.status,200);
    assert.equal(persisted.body.workflow.state,'DRAFT');assert.equal(persisted.body.version.versionId,posted.receipt.versionId);
    assert.deepEqual(persisted.body.preview.question.interaction,expectedInteraction);assert.deepEqual(persisted.body.preview.question.answerKey,expectedKey);
    assert.equal(persisted.body.preview.question.content[0].text,prompt);
    const privateText=await evaluate(`document.querySelector('.staff-review-preview').textContent`);
    assert.equal(texts.every(text=>privateText.includes(text)),true);
    assert.equal(privateText.includes(type==='MULTIPLE_CHOICE'?'a, b':'a: Đúng · b: Sai'),true);
    await pressKey('Escape','Escape',27,String.fromCharCode(27));
  }
  await chooseDraftType('MULTIPLE_CHOICE');
  await evaluate(`${query('draft-answer-multiple-a')}.click()`);
  await chooseDraftType('TRUE_FALSE_GROUP');await setDraftText('draft-answer-true-false-a','true');
  await chooseDraftType('MULTIPLE_CHOICE');
  assert.equal(await evaluate(`${query('draft-answer-multiple-a')}.checked||${query('draft-answer-multiple-b')}.checked`),false,'returning to a type clears prior private key choice');
  await chooseDraftType('SINGLE_CHOICE');assert.equal(await evaluate(`${query('draft-answer')}.value`),'','returning to single choice requires an explicit key');
  const beforeSwitchInvalid=await evaluate('window.__authorEditor.posts.length');await click('draft-create');
  await evaluate('new Promise(resolve=>setTimeout(resolve,80))');assert.equal(await evaluate('window.__authorEditor.posts.length'),beforeSwitchInvalid);
  await setDraftText('draft-answer','b');
  assert.equal(await evaluate(`${query('draft-create')}.form.checkValidity()`),true,'removed invalid MC/TF controls cannot block valid SC');
  assert.equal(await evaluate('window.__authorEditor.posts.length'),beforeSwitchInvalid,'type/key changes do not auto-create');
  report.checks.push('Existing-contract author editor validates unset keys with zero POST, keyboard-selects MC, creates actual MC/TF drafts and reads exact persisted private previews after reload; switching types clears answer choices and never auto-handoffs');

  assert.equal(networkOperations.filter(op=>new URL(op.url).pathname.endsWith('/review-history')).length,0,'history is never prefetched for other workflows');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'manager login for recorded history');
  await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');
  await waitFor(`Boolean(${query('staff-review-history-open')})`,'manager history actions');
  await evaluate(`(()=>{const select=${query('staff-state-filter')};select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`${query('staff-list-status')}?.textContent.startsWith('Đang hiển thị')`,'manager all-state history list');
  await evaluate(`(()=>{const original=window.fetch;window.__b5={calls:[],hold:false,held:false,release:null,wrong:false};window.fetch=async(input,init={})=>{
    const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.pathname.endsWith('/review-history')){const body=await response.clone().json();window.__b5.calls.push({path:url.pathname,status:response.status,body});
      if(window.__b5.hold){window.__b5.hold=false;window.__b5.held=true;await new Promise(resolve=>window.__b5.release=resolve);}
      if(window.__b5.wrong&&response.status===200){window.__b5.wrong=false;body.version.versionId=crypto.randomUUID();return new Response(JSON.stringify(body),{status:200,headers:response.headers});}}
    return response;};})()`);
  async function openHistory(version) {
    const row=`[data-testid="staff-review-history-open"][data-version-id="${version.versionId}"]`;
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(row)}))`,'exact history metadata action');
    await evaluate(`document.querySelector(${JSON.stringify(row)}).focus()`);await pressKey('Enter','Enter',13,String.fromCharCode(13));
  }
  const emptyHistoryVersion=reviewFixture.questions[0];
  await openHistory(emptyHistoryVersion);await waitFor(`${query('staff-review-history-status')}?.dataset.stage==='empty'`,'truthful empty history');
  assert.equal(await evaluate(`${query('staff-review-history')}.dataset.versionId`),emptyHistoryVersion.versionId);
  assert.equal(await evaluate(`${query('staff-review-history')}.dataset.contentHash`),emptyHistoryVersion.contentHash);
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-review-preview'))`),false);
  await pressKey('Escape','Escape',27,String.fromCharCode(27));
  assert.equal(await evaluate(`document.activeElement?.dataset.versionId`),emptyHistoryVersion.versionId);
  await openHistory(queuedVersion);await waitFor(`${query('staff-review-history-status')}?.dataset.stage==='loaded'`,'real UI rejection history');
  assert.equal(await evaluate(`${query('staff-review-history')}.dataset.workflowState`),'REJECTED');
  assert.equal(await evaluate(`${query('staff-review-history')}.dataset.workflowRevision`),'3');
  assert.equal(await evaluate(`${query('staff-review-history-reason')}.textContent`),'Local synthetic disposition: '+historyReason);
  assert.equal(await evaluate(`${query('staff-review-history')}.querySelectorAll('img,a,script,iframe,object,embed').length`),0,'arbitrary recorded reason is inert');
  assert.equal(await evaluate(`${query('staff-review-history')}.textContent.includes('NOT_ATTESTED_BY_PLATFORM')&&${query('staff-review-history')}.textContent.includes('NOT_EVALUATED')`),true);
  await evaluate(`${query('staff-review-history')}.scrollIntoView({block:'start'})`);await screenshot('staff-review-history-desktop');
  await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await noHorizontalOverflow();
  await evaluate(`${query('staff-review-history-reason')}.scrollIntoView({block:'center'})`);await screenshot('staff-review-history-reason-mobile');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await click('staff-review-history-close');assert.equal(await evaluate('document.body.textContent.includes('+JSON.stringify(historyReason)+')'),false);
  report.checks.push('B5 explicit manager-only GET shows exact empty/real UI REJECT history separately from current workflow, qualification and eligibility; hostile stored reason stays inert on desktop/mobile and clears on close/Escape');

  await evaluate('window.__b5.wrong=true');await openHistory(queuedVersion);
  await waitFor(`${query('staff-review-history-status')}?.dataset.stage==='error'`,'mismatched history response rejected');
  assert.equal(await evaluate(`Boolean(${query('staff-review-history-reason')})`),false);
  await click('staff-review-history-reload');await waitFor(`${query('staff-review-history-status')}?.dataset.stage==='loaded'`,'explicit history read recovery');
  await click('staff-review-history-close');
  await evaluate('window.__b5.hold=true;window.__b5.held=false');await openHistory(queuedVersion);
  await waitFor('window.__b5.held','history response held after real read');
  await openHistory(emptyHistoryVersion);await waitFor(`${query('staff-review-history-status')}?.dataset.stage==='empty'`,'new history target supersedes held request');
  await evaluate('window.__b5.release()');await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(await evaluate(`${query('staff-review-history')}.dataset.versionId`),emptyHistoryVersion.versionId);
  assert.equal(await evaluate('document.body.textContent.includes('+JSON.stringify(historyReason)+')'),false);
  await evaluate('window.__b5.hold=true;window.__b5.held=false');await openHistory(queuedVersion);await waitFor('window.__b5.held','history held before return');
  await click('staff-return');await waitFor(`Boolean(${query('staff-open')})`,'landing clears private history');
  await click('staff-open');await waitFor(`Boolean(${query('staff-review-history-open')})`,'same principal new workspace');
  await evaluate('window.__b5.release()');await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(await evaluate(`Boolean(${query('staff-review-history')})`),false,'old workspace response cannot reopen private history');
  assert.equal(await evaluate('document.body.textContent.includes('+JSON.stringify(historyReason)+')'),false);
  report.checks.push('B5 wrong-version read fails without private text; explicit retry recovers, target and return/reopen generations discard held real history responses');

  await evaluate(`(()=>{const select=${query('staff-state-filter')};select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`${query('staff-list-status')}?.textContent.startsWith('Đang hiển thị')`,'all-state history after workspace reopen');
  // Trusted history rows exercise the bounded UI; no approval workflow or human
  // qualification is synthesized by these administrative display fixtures.
  for(let index=0;index<21;index++)await reviewFixture.fixture.pool.query(`INSERT INTO tsa.reviews
    (id,question_version_id,content_hash,reviewer_id,decision,rubric,reason,created_at)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'2001-01-01T00:00:00Z')`,[
      randomUUID(),emptyHistoryVersion.versionId,emptyHistoryVersion.contentHash,reviewFixture.fixture.principals.reviewer.userId,
      index%2?'APPROVE':'REJECT',JSON.stringify({correctness:true,unambiguous:true,relevant:true,language:true,explanation:true,rights:true}),
      'Synthetic recorded display fixture; not qualified human review.',
    ]);
  await openHistory(emptyHistoryVersion);await waitFor(`${query('staff-review-history-status')}?.dataset.stage==='truncated'`,'latest20 explicitly truncated history');
  assert.equal(await evaluate(`document.querySelectorAll('.staff-review-history-entry').length`),20);
  assert.equal(await evaluate(`${query('staff-review-history')}.textContent.includes('APPROVE')&&${query('staff-review-history')}.textContent.includes('NOT_ATTESTED_BY_PLATFORM')`),true);
  await click('staff-review-history-close');
  report.checks.push('B5 trusted administrative display fixture shows exactly20 latest decisions and explicit truncation; recorded APPROVE is labelled historical without qualification or a new approval command');

  await evaluate('window.__b5.hold=true;window.__b5.held=false');await openHistory(queuedVersion);await waitFor('window.__b5.held','history held before identity change');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'history logout clears private DOM');
  await evaluate(`${query('actor-select')}.value='studentA'`);await click('staff-login');await waitFor(`Boolean(document.querySelector('.staff-denied'))`,'candidate history denial');
  await evaluate('window.__b5.release()');await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(await evaluate(`Boolean(${query('staff-review-history')})||Boolean(${query('staff-review-history-open')})`),false);
  assert.equal(await evaluate('document.body.textContent.includes('+JSON.stringify(historyReason)+')'),false);
  for(const actor of ['studentA','reviewer']) {
    if(actor==='reviewer'){await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'reviewer history denial login');await evaluate(`${query('actor-select')}.value='reviewer'`);await click('staff-login');await waitFor(`Boolean(${query('staff-question-list')})`,'reviewer metadata only');}
    const denial=await evaluate(`fetch(${JSON.stringify('/api/v1/question-versions/'+queuedVersion.versionId+'/review-history')}).then(async response=>({status:response.status,body:await response.json()}))`);
    assert.equal(denial.status,403);assert.equal(denial.body.error.code,'FORBIDDEN');
    assert.equal(await evaluate(`Boolean(${query('staff-review-history-open')})`),false);
  }
  assert.equal(networkOperations.filter(op=>new URL(op.url).pathname.endsWith('/review-history')).every(op=>op.method==='GET'&&!op.hasPostData),true);
  report.checks.push('B5 logout/identity fencing clears late private history; candidate/reviewer have no history action and exact direct endpoint returns403; all history calls are bodyless GET');

  assert.equal(await evaluate(`Boolean(${query('staff-preflight-run')})`),false,'reviewer cannot run canonical dataset diagnostic');
  const reviewerPreflight=await evaluate(`fetch('/api/v1/datasets/preflight',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({versions:${JSON.stringify([pinForBrowser(queuedVersion)])}})}).then(async response=>({status:response.status,body:await response.json()}))`);
  assert.equal(reviewerPreflight.status,403);assert.equal(reviewerPreflight.body.error.code,'FORBIDDEN');
  assert.equal(networkOperations.filter(op=>new URL(op.url).pathname==='/api/v1/datasets/preflight').length,1,'no preflight is automatic');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'manager preflight login');
  await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-preflight-run')})`,'manager preflight controls');
  async function allPreflightStates(){await evaluate(`(()=>{const select=${query('staff-state-filter')};select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await waitFor(`${query('staff-list-status')}?.textContent.startsWith('Đang hiển thị')`,'all-state preflight list');}
  async function selectPreflight(version){const input=`[data-testid="staff-preflight-select"][data-version-id="${version.versionId}"]`;await waitFor(`Boolean(document.querySelector(${JSON.stringify(input)}))`,'exact preflight pin checkbox');await evaluate(`document.querySelector(${JSON.stringify(input)}).focus()`);await pressKey(' ','Space',32,' ');}
  await allPreflightStates();
  await evaluate(`(()=>{const original=window.fetch;window.__b6={calls:[],mode:'normal',held:false,release:null};window.fetch=async(input,init={})=>{
    const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.pathname==='/api/v1/datasets/preflight'){const body=await response.clone().json();window.__b6.calls.push({status:response.status,body,request:JSON.parse(init.body),csrf:Boolean(new Headers(init.headers).get('x-csrf-token')),key:new Headers(init.headers).get('idempotency-key')});
      const mode=window.__b6.mode;window.__b6.mode='normal';if(mode==='hold'){window.__b6.held=true;await new Promise(resolve=>window.__b6.release=resolve);}
      if(mode==='drop')throw new TypeError('Synthetic lost canonical report');
      if(mode==='wrong'&&response.status===200){body.versions[0].contentHash='sha256:'+'0'.repeat(64);return new Response(JSON.stringify(body),{status:200,headers:response.headers});}}
    return response;};})()`);
  assert.equal(await evaluate(`${query('staff-preflight-run')}.disabled`),true);
  assert.equal(await evaluate('document.querySelectorAll("[data-testid=staff-preflight-select]:checked").length'),0);
  const preflightA=reviewFixture.questions[0],preflightB=reviewFixture.questions[1];
  await selectPreflight(preflightA);await selectPreflight(preflightB);
  assert.equal(await evaluate('window.__b6.calls.length'),0,'selection alone never POSTs');
  await evaluate(`${query('staff-preflight-run')}.focus()`);await pressKey('Enter','Enter',13,String.fromCharCode(13));
  await waitFor(`${query('staff-preflight-status')}?.dataset.stage==='loaded'`,'actual explicit canonical report');
  const canonical=await evaluate('window.__b6.calls[0]');assert.equal(canonical.status,200);assert.equal(canonical.csrf,true);assert.equal(canonical.key,null);
  assert.deepEqual(canonical.request.versions.toSorted((a,b)=>a.versionId.localeCompare(b.versionId)),[pinForBrowser(preflightA),pinForBrowser(preflightB)].sort((a,b)=>a.versionId.localeCompare(b.versionId)));
  assert.equal(canonical.body.counts.total,2);assert.deepEqual(canonical.body.shortfalls,{MATH:10,READING:6,SCIENCE:12});
  assert.equal(canonical.body.publishing,false);assert.equal(canonical.body.publicationEligibility,'NOT_EVALUATED');
  assert.equal(await evaluate(`${query('staff-preflight-report')}.dataset.versionCount`),'2');
  assert.equal(await evaluate(`${query('staff-preflight-report')}.dataset.scope`),'CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION');
  const reportText=await evaluate(`${query('staff-preflight-report')}.textContent`);assert.equal(canonical.body.blockerCodes.every(code=>reportText.includes(code)),true);
  await evaluate(`${query('staff-preflight-report')}.scrollIntoView({block:'start'})`);await screenshot('staff-canonical-preflight-desktop');
  await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await noHorizontalOverflow();
  await evaluate(`${query('staff-preflight-version-pins')}.scrollIntoView({block:'center'})`);await screenshot('staff-canonical-preflight-pins-mobile');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await pressKey('Escape','Escape',27,String.fromCharCode(27));
  assert.equal(await evaluate(`Boolean(${query('staff-preflight-report')})`),false);assert.equal(await evaluate(`${query('staff-preflight-run')}.disabled`),true);
  assert.equal(await evaluate(`document.activeElement===${query('staff-preflight-selected-count')}`),true,'Escape retains a logical keyboard focus target after selection clears');
  report.checks.push('B6 explicit manager keyboard pin selection sends CSRF-only read POST and shows exact canonical counts/shortfalls and mandatory human/rights blockers; no accepted inventory/publication inference; Escape clears report/selection');

  await selectPreflight(preflightA);await evaluate("window.__b6.mode='hold';window.__b6.held=false");await click('staff-preflight-run');await waitFor('window.__b6.held','held canonical report');
  const heldCount=await evaluate('window.__b6.calls.length');await evaluate(`${query('staff-preflight-run')}.click()`);assert.equal(await evaluate('window.__b6.calls.length'),heldCount,'pending duplicate activation is disabled');
  await selectPreflight(preflightB);await evaluate('window.__b6.release()');await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(await evaluate(`Boolean(${query('staff-preflight-report')})`),false,'changed selection discards old report');
  await evaluate("window.__b6.mode='drop'");await click('staff-preflight-run');await waitFor(`${query('staff-preflight-status')}?.dataset.stage==='error'`,'lost report is a truthful error');
  const afterLost=await evaluate('window.__b6.calls.length');await evaluate('new Promise(resolve=>setTimeout(resolve,100))');assert.equal(await evaluate('window.__b6.calls.length'),afterLost,'no automatic report retry');
  assert.equal(await evaluate(`Boolean(${query('staff-preflight-report')})`),false);await click('staff-preflight-run');await waitFor(`${query('staff-preflight-status')}?.dataset.stage==='loaded'`,'explicit new canonical check recovers');
  await evaluate("window.__b6.mode='wrong'");await click('staff-preflight-run');await waitFor(`${query('staff-preflight-status')}?.dataset.stage==='error'`,'wrong pinned hash rejected without stale report');
  assert.equal(await evaluate(`Boolean(${query('staff-preflight-report')})`),false);
  await click('staff-preflight-run');await waitFor(`${query('staff-preflight-status')}?.dataset.stage==='loaded'`,'new matching canonical report');
  await click('staff-refresh');await waitFor(`${query('staff-list-status')}?.textContent.startsWith('Đang hiển thị')`,'metadata refresh clears canonical selection');
  assert.equal(await evaluate(`${query('staff-preflight-run')}.disabled`),true);assert.equal(await evaluate(`Boolean(${query('staff-preflight-report')})`),false);
  report.checks.push('B6 pending duplicate activation is blocked; selection changes fence delayed reports, lost/wrong-hash responses clear stale output and require an explicit new check; metadata refresh resets selection');

  await selectPreflight(preflightA);await evaluate("window.__b6.mode='hold';window.__b6.held=false");await click('staff-preflight-run');await waitFor('window.__b6.held','canonical report held before workspace return');
  await click('staff-return');await waitFor(`Boolean(${query('staff-open')})`,'canonical return clears private view');await click('staff-open');await waitFor(`Boolean(${query('staff-preflight-run')})`,'manager new canonical workspace');
  await evaluate('window.__b6.release()');await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(await evaluate(`Boolean(${query('staff-preflight-report')})`),false);assert.equal(await evaluate(`${query('staff-preflight-run')}.disabled`),true);
  await allPreflightStates();await selectPreflight(preflightA);await evaluate("window.__b6.mode='hold';window.__b6.held=false");await click('staff-preflight-run');await waitFor('window.__b6.held','canonical report held before logout');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'canonical logout');await evaluate(`${query('actor-select')}.value='studentA'`);await click('staff-login');await waitFor(`Boolean(document.querySelector('.staff-denied'))`,'candidate canonical denial');
  await evaluate('window.__b6.release()');await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(await evaluate(`Boolean(${query('staff-preflight-report')})||Boolean(${query('staff-preflight-run')})`),false);
  const candidatePreflight=await evaluate(`fetch('/api/v1/datasets/preflight',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({versions:${JSON.stringify([pinForBrowser(preflightA)])}})}).then(async response=>({status:response.status,body:await response.json()}))`);
  assert.equal(candidatePreflight.status,403);assert.equal(candidatePreflight.body.error.code,'FORBIDDEN');
  report.checks.push('B6 return/reopen and logout/identity fences discard pending canonical reports; candidate/reviewer have no selection controls and direct POST403; no student contract/clock/policy change');

  assert.equal(await evaluate(`Boolean(${query('staff-fixed-open')})`),false,'candidate has no fixed-reference action');
  const deniedFixed=await evaluate(`fetch('/api/v1/assembly-runs').then(async response=>({status:response.status,body:await response.json()}))`);
  assert.equal(deniedFixed.status,403);assert.equal(deniedFixed.body.error.code,'FORBIDDEN');
  assert.equal(networkOperations.filter(op=>op.url.startsWith(reviewFixture.origin)&&new URL(op.url).pathname.startsWith('/api/v1/assembly-runs')).length,1,'no fixed list/detail prefetch in prior journeys');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'manager stored fixed reference login');await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-fixed-open')})`,'fixed manager control');
  await evaluate(`(()=>{const original=window.fetch;window.__fixed={calls:[],mode:'normal',held:false,release:null};window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname.startsWith('/api/v1/assembly-runs')){
    const body=await response.clone().json();window.__fixed.calls.push({path:url.pathname,status:response.status,body});const mode=window.__fixed.mode;window.__fixed.mode='normal';
    if(mode==='hold'){window.__fixed.held=true;await new Promise(resolve=>window.__fixed.release=resolve);}
    if(mode==='wrong'&&response.status===200&&body.run){body.run.assemblyRunId=crypto.randomUUID();return new Response(JSON.stringify(body),{status:200,headers:response.headers});}}
    return response;};})()`);
  await evaluate(`${query('staff-fixed-open')}.focus()`);await pressKey('Enter','Enter',13,String.fromCharCode(13));await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='list-loaded'`,'actual fixed reference metadata list');
  assert.equal(await evaluate('window.__fixed.calls.length'),1);assert.equal(await evaluate('document.querySelectorAll("[data-testid=staff-fixed-run-open]").length'),3);
  async function openFixed(run){const control=`[data-testid="staff-fixed-run-open"][data-run-id="${run.assemblyRunId}"]`;await waitFor(`Boolean(document.querySelector(${JSON.stringify(control)}))`,'exact fixed run control');await evaluate(`document.querySelector(${JSON.stringify(control)}).focus()`);await pressKey('Enter','Enter',13,String.fromCharCode(13));}
  for(const [key,run] of Object.entries(reviewFixture.fixedRuns)){
    await openFixed(run);await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='detail-loaded'`,'replay-verified stored fixed diagnostic');
    assert.equal(await evaluate(`${query('staff-fixed-detail')}.dataset.runId`),run.assemblyRunId);
    assert.equal(await evaluate(`${query('staff-fixed-detail')}.dataset.outcome`),run.result.status);
    assert.equal(await evaluate(`${query('staff-fixed-detail')}.dataset.selectedCount`),String(key==='success'?4:0));
    assert.equal(await evaluate(`${query('staff-fixed-detail')}.dataset.failureCode`),run.result.status==='FAILURE'?run.result.code:'null');
    const text=await evaluate(`${query('staff-fixed-detail')}.textContent`);assert.equal(text.includes('NOT_ATTESTED_BY_PLATFORM')&&text.includes('NOT_EVALUATED'),true);
    for(const member of run.manifest.units.flatMap(unit=>unit.members))assert.equal(text.includes(member.versionId)||text.includes(member.questionId)||text.includes(member.groupId),false,'no fixed candidate identifiers in private aggregate view');
    if(key==='success'){await evaluate(`${query('staff-fixed-detail')}.scrollIntoView({block:'start'})`);await screenshot('staff-fixed-success-desktop');}
    if(key==='exhausted'){
      assert.equal(text.includes('chưa rõ'),true,'exhaustion explicitly keeps feasibility unknown');
      await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await noHorizontalOverflow();await evaluate(`document.querySelector('.staff-fixed-reference-result').scrollIntoView({block:'center'})`);await screenshot('staff-fixed-exhausted-mobile');
      await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    }
    const beforeBack=await evaluate('window.__fixed.calls.length');await click('staff-fixed-back');await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='list-loaded'`,'cached fixed list on back');
    assert.equal(await evaluate('window.__fixed.calls.length'),beforeBack,'back does not refetch or pretend list is a fresh observation');
  }
  report.checks.push('B7 manager explicitly reads real stored fixed SUCCESS/infeasible/exhausted reference reports, no raw candidate IDs or created-form/rights claims; exhaustion feasibility stays unknown, back uses captured list');

  await evaluate("window.__fixed.mode='wrong'");await openFixed(reviewFixture.fixedRuns.success);await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='detail-error'`,'wrong fixed run identity rejected');
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-fixed-reference-result'))`),false);await click('staff-fixed-retry');await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='detail-loaded'`,'explicit matching fixed read recovery');
  await click('staff-fixed-close');assert.equal(await evaluate(`document.activeElement===${query('staff-fixed-open')}`),true);
  await click('staff-fixed-open');await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='list-loaded'`,'fixed list before held target');
  await evaluate("window.__fixed.mode='hold';window.__fixed.held=false");await openFixed(reviewFixture.fixedRuns.success);await waitFor('window.__fixed.held','held real fixed diagnostic');
  await click('staff-fixed-open');await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='list-loaded'`,'new list replaces pending fixed detail');await evaluate('window.__fixed.release()');await evaluate('new Promise(resolve=>setTimeout(resolve,100))');assert.equal(await evaluate(`Boolean(${query('staff-fixed-detail')})`),false);
  await evaluate("window.__fixed.mode='hold';window.__fixed.held=false");await openFixed(reviewFixture.fixedRuns.success);await waitFor('window.__fixed.held','fixed held before return');
  await click('staff-return');await waitFor(`Boolean(${query('staff-open')})`,'fixed private state cleared on return');await click('staff-open');await waitFor(`Boolean(${query('staff-fixed-open')})`,'fixed new workspace');await evaluate('window.__fixed.release()');await evaluate('new Promise(resolve=>setTimeout(resolve,100))');assert.equal(await evaluate(`Boolean(${query('staff-fixed-detail')})||Boolean(${query('staff-fixed-list')})`),false);
  await click('staff-fixed-open');await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='list-loaded'`,'fixed list before logout');await evaluate("window.__fixed.mode='hold';window.__fixed.held=false");await openFixed(reviewFixture.fixedRuns.success);await waitFor('window.__fixed.held','fixed held before identity change');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'fixed logout');await evaluate(`${query('actor-select')}.value='reviewer'`);await click('staff-login');await waitFor(`Boolean(${query('staff-question-list')})`,'reviewer fixed denial');await evaluate('window.__fixed.release()');await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(await evaluate(`Boolean(${query('staff-fixed-open')})||Boolean(${query('staff-fixed-detail')})||Boolean(${query('staff-fixed-list')})`),false);
  const reviewerFixed=await evaluate(`fetch(${JSON.stringify('/api/v1/assembly-runs/'+reviewFixture.fixedRuns.success.assemblyRunId+'/diagnostics')}).then(async response=>({status:response.status,body:await response.json()}))`);assert.equal(reviewerFixed.status,403);assert.equal(reviewerFixed.body.error.code,'FORBIDDEN');
  assert.equal(networkOperations.filter(op=>new URL(op.url).pathname.startsWith('/api/v1/assembly-runs')).every(op=>op.method==='GET'&&!op.hasPostData),true);
  report.checks.push('B7 wrong-run response clears output and explicit retry recovers; target/return-reopen/logout identity fences discard held fixed reads, close restores focus and candidate/reviewer direct reads403; GET only');

  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'manager fixed truncation login');await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-fixed-open')})`,'manager bounded fixed discovery');
  // Repeated owned reference problems exercise the real latest20 UI; no form,
  // Bank eligible content or qualified review is created by this display setup.
  await reviewFixture.fixture.pool.query(`INSERT INTO tsa.assembly_runs(id,blueprint_version_id,user_id,form_mode,reuse_mode,history_revision,bank_revision,request_hash,seed,algorithm_version,limits,manifest,manifest_hash,outcome,diagnostics,created_at)
    SELECT gen_random_uuid(),ar.blueprint_version_id,NULL,ar.form_mode,ar.reuse_mode,NULL,ar.bank_revision,ar.request_hash,ar.seed,ar.algorithm_version,ar.limits,ar.manifest,ar.manifest_hash,ar.outcome,ar.diagnostics,'2001-01-01T00:00:00Z'
    FROM tsa.assembly_runs ar CROSS JOIN generate_series(1,21) WHERE ar.id=$1`,[reviewFixture.fixedRuns.success.assemblyRunId]);
  await click('staff-fixed-open');await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='list-loaded'`,'actual bounded fixed discovery list');
  assert.equal(await evaluate('document.querySelectorAll("[data-testid=staff-fixed-run-open]").length'),20);
  assert.equal(await evaluate('window.__fixed.calls.at(-1).body.truncated'),true);
  assert.equal(await evaluate(`${query('staff-fixed-list')}.textContent.includes('còn các lần chạy cũ hơn')`),true);
  await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await noHorizontalOverflow();await evaluate(`${query('staff-fixed-list')}.scrollIntoView({block:'start'})`);await screenshot('staff-fixed-truncated-list-mobile');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await click('staff-fixed-close');
  report.checks.push('B7 actual supported fixed list caps at20 and visibly reports older omitted records on mobile; synthetic display rows do not create forms or qualified content');

  // Real eligible Bank stock is seeded through the disposable publication fixture;
  // no qualified human review or publication permission is inferred.
  const stockSource=await reviewFixture.fixture.registerSource(),stockQuestions=[];
  for(let index=0;index<4;index++)stockQuestions.push(await reviewFixture.fixture.createQuestion(stockSource,`browser-fixed-stock-${index}`));
  const rehearsalBefore=(await reviewFixture.fixture.pool.query('SELECT count(*)::integer AS n FROM tsa_private.fixed_stock_rehearsals')).rows[0].n;
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'B8 exam login');await evaluate(`${query('actor-select')}.value='examManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprints-open')})`,'B8 EXAM tools');
  assert.equal(await evaluate(`Boolean(${query('staff-question-list')})||Boolean(${query('staff-fixed-open')})||Boolean(${query('staff-bank-rehearsals-open')})`),false);
  await evaluate(`(()=>{const original=window.fetch;window.__rehearsals={calls:[],lose:false};window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);const response=await original(input,init);if(url.pathname.startsWith('/api/v1/fixed-rehearsal')){const call={path:url.pathname,method:init.method??'GET',body:init.body??null,key:new Headers(init.headers).get('idempotency-key'),status:response.status,response:await response.clone().json()};window.__rehearsals.calls.push(call);if(window.__rehearsals.lose&&call.method==='POST'){window.__rehearsals.lose=false;throw new TypeError('Synthetic lost acknowledgement after server commit');}}return response;};return true})()`);
  assert.equal(await evaluate('window.__rehearsals.calls.length'),0);
  await click('staff-fixed-rehearsal-blueprints-open');await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprint-select')})`,'B8 blueprint metadata');
  const stockBlueprint=reviewFixture.fixture.blueprint;
  await evaluate(`${query('staff-fixed-rehearsal-blueprint-select')}.value=${JSON.stringify(stockBlueprint.versionId)};${query('staff-fixed-rehearsal-blueprint-select')}.dispatchEvent(new Event('change',{bubbles:true}));${query('staff-fixed-rehearsal-window-minutes')}.value='0';${query('staff-fixed-rehearsal-window-minutes')}.dispatchEvent(new Event('input',{bubbles:true}))`);
  await click('staff-fixed-rehearsal-open');assert.equal(await evaluate('window.__rehearsals.calls.filter(c=>c.method===\'POST\').length'),0);assert.equal(await evaluate(`${query('staff-fixed-rehearsal-dialog')}.open`),false);
  await evaluate(`${query('staff-fixed-rehearsal-window-minutes')}.value='6e1';${query('staff-fixed-rehearsal-window-minutes')}.dispatchEvent(new Event('input',{bubbles:true}))`);
  await click('staff-fixed-rehearsal-open');await waitFor(`${query('staff-fixed-rehearsal-dialog')}.open`,'B8 exact pinned confirmation');
  assert.equal(await evaluate(`document.activeElement===${query('staff-fixed-rehearsal-cancel')}`),true);
  assert.equal(await evaluate(`${query('staff-fixed-rehearsal-dialog')}.textContent.includes(${JSON.stringify(stockBlueprint.contentHash)})`),true);
  await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await noHorizontalOverflow();await screenshot('staff-stock-confirmation-mobile');
  await evaluate('window.__rehearsals.lose=true');await click('staff-fixed-rehearsal-confirm');await waitFor(`${query('staff-fixed-rehearsal-status')}?.dataset.stage==='uncertain'`,'B8 lost acknowledgement truthful');
  assert.equal(await evaluate(`${query('staff-fixed-rehearsal-blueprint-select')}.disabled&&${query('staff-fixed-rehearsal-window-minutes')}.disabled`),true);
  assert.equal((await reviewFixture.fixture.pool.query('SELECT count(*)::integer AS n FROM tsa_private.fixed_stock_rehearsals')).rows[0].n,rehearsalBefore+1);
  await screenshot('staff-stock-uncertain-mobile');await click('staff-fixed-rehearsal-retry');await waitFor(`${query('staff-fixed-rehearsal-status')}?.dataset.stage==='acknowledged'`,'B8 same intent retry');
  const stockCalls=await evaluate('window.__rehearsals.calls.filter(c=>c.method===\'POST\')');assert.equal(stockCalls.length,2);assert.equal(stockCalls[0].body,stockCalls[1].body);assert.equal(stockCalls[0].key,stockCalls[1].key);assert.deepEqual(stockCalls[0].response,stockCalls[1].response);
  const stockReceipt=stockCalls[1].response;assert.equal(stockReceipt.outcome,'SUCCESS');assert.equal(stockReceipt.currentEligibility,'NOT_REVALIDATED');assert.equal(stockReceipt.createsForm,false);
  assert.equal((await reviewFixture.fixture.pool.query('SELECT count(*)::integer AS n FROM tsa_private.fixed_stock_rehearsals')).rows[0].n,rehearsalBefore+1);
  await noHorizontalOverflow();await screenshot('staff-stock-success-mobile');
  report.checks.push('B8 actual EXAM_MANAGER explicit blueprint metadata, invalid window0POST, pinned accessible confirmation, actual committed lost acknowledgement with truthful uncertainty and exact same-body/key receipt replay; 375px mobile');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'B8 manager login');await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-bank-rehearsals-open')})`,'B8 manager historical tools');
  await click('staff-bank-rehearsals-open');await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='list-loaded'`,'B8 real captured history');
  await evaluate(`document.querySelector('[data-testid="staff-bank-rehearsal-open"][data-rehearsal-id="${stockReceipt.rehearsalId}"]').click()`);await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='detail-loaded'`,'B8 real replay detail');
  assert.equal(await evaluate(`${query('staff-bank-rehearsal-detail')}.dataset.rehearsalId`),stockReceipt.rehearsalId);
  const historicalText=await evaluate(`${query('staff-bank-rehearsal-detail')}.textContent`);assert.equal(historicalText.includes('NOT_REVALIDATED'),true);assert.equal(historicalText.includes('BANK_ELIGIBLE_AT_CAPTURE'),true);
  for(const question of stockQuestions)assert.equal(historicalText.includes(question.versionId),false);
  await screenshot('staff-stock-replayed-desktop');await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await noHorizontalOverflow();await screenshot('staff-stock-replayed-mobile');
  await click('staff-bank-rehearsal-back');await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='list-loaded'`,'B8 cached history back');assert.equal(await evaluate('document.activeElement.dataset.rehearsalId'),stockReceipt.rehearsalId);
  await reviewFixture.fixture.workflow.quarantine(reviewFixture.fixture.principals.bankManager,stockQuestions[0].versionId,randomUUID(),{expectedRevision:3,reason:'Synthetic browser stock removal; not human content acceptance.'});
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'B8 new check login');await evaluate(`${query('actor-select')}.value='examManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprints-open')})`,'B8 new check tools');await click('staff-fixed-rehearsal-blueprints-open');await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprint-select')})`,'B8 new check config');
  await evaluate(`${query('staff-fixed-rehearsal-blueprint-select')}.value=${JSON.stringify(stockBlueprint.versionId)};${query('staff-fixed-rehearsal-blueprint-select')}.dispatchEvent(new Event('change',{bubbles:true}))`);await click('staff-fixed-rehearsal-open');await click('staff-fixed-rehearsal-confirm');await waitFor(`${query('staff-fixed-rehearsal-status')}?.dataset.stage==='acknowledged'`,'B8 captured shortage');
  const shortageCalls=await evaluate('window.__rehearsals.calls.filter(c=>c.method===\'POST\')'),shortage=shortageCalls.at(-1).response;assert.equal(shortage.outcome,'FAILURE');assert.equal(shortage.failureCode,'INSUFFICIENT_ELIGIBLE_INVENTORY');assert.deepEqual(shortage.sectionDeficits,[{section:'MATH',missingCount:1}]);await noHorizontalOverflow();await screenshot('staff-stock-shortage-mobile');
  const beforeReload=(await reviewFixture.fixture.pool.query('SELECT count(*)::integer AS n FROM tsa_private.fixed_stock_rehearsals')).rows[0].n;
  await evaluate('window.__b8ReloadFence=true');await command('Page.reload');await waitFor(`window.__b8ReloadFence!==true&&Boolean(${query('staff-open')})`,'B8 fresh document landing');await click('staff-open');await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprints-open')})`,'B8 reload EXAM role');assert.equal(await evaluate(`Boolean(${query('staff-fixed-rehearsal-status')})`),false);assert.equal((await reviewFixture.fixture.pool.query('SELECT count(*)::integer AS n FROM tsa_private.fixed_stock_rehearsals')).rows[0].n,beforeReload);
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'B8 historical check login');await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-bank-rehearsals-open')})`,'B8 historical check tools');await click('staff-bank-rehearsals-open');await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='list-loaded'`,'B8 both historical rows');await evaluate(`document.querySelector('[data-testid="staff-bank-rehearsal-open"][data-rehearsal-id="${stockReceipt.rehearsalId}"]').click()`);await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='detail-loaded'`,'B8 historical success after quarantine');assert.equal(await evaluate(`${query('staff-bank-rehearsal-detail')}.textContent.includes('SUCCESS')&&${query('staff-bank-rehearsal-detail')}.textContent.includes('NOT_REVALIDATED')`),true);
  report.checks.push('B8 BANK_MANAGER actual history and private aggregate replay, cached back focus, no candidate IDs, desktop/mobile; quarantine yields new proven shortage while old success stays historical, reload creates no attempt/capture');

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
