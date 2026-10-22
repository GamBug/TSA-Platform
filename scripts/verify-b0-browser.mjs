// Local browser acceptance for the isolated B0 demo; no third-party test dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const artifacts = resolve(process.env.B0_ARTIFACT_DIR || join(tmpdir(), 'tsa-b0-browser-evidence'));
const browserExecutable = process.env.B0_BROWSER || 'chromium';
const profile = await mkdtemp(join(tmpdir(), 'tsa-b0-chromium-'));
const deadline = setTimeout(() => { console.error('B0 browser verification exceeded 60 seconds'); cleanup(); process.exitCode = 1; }, 60_000);
const portProbe = createServer();
await new Promise((resolve, reject) => { portProbe.once('error', reject); portProbe.listen(0, '127.0.0.1', resolve); });
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
let server, browser, socket;
let serverLog = '', browserLog = '';
function cleanup() { socket?.close(); server?.kill(); browser?.kill(); }
const shutdown = async () => { clearTimeout(deadline); cleanup(); await rm(profile, { recursive: true, force: true }).catch(() => {}); };
let sequence = 0;
const pending = new Map();
const errors = [];
const requests = [];
const responses = [];
const report = { origin, browser: null, screenshots: [], checks: [] };
function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const out = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (out.exceptionDetails) throw new Error(out.exceptionDetails.text + ': ' + out.exceptionDetails.exception?.description);
  return out.result.value;
}
async function waitFor(expression, label) {
  for (let i = 0; i < 80; i++) {
    try { if (await evaluate(expression)) return; } catch (error) {
      if (!/context.*(destroyed|not found)|Cannot find context/i.test(error.message)) throw error;
    }
    await delay(50);
  }
  throw new Error(`Timed out: ${label}`);
}
const selector = id => `[data-testid="${id}"]`;
const query = id => `document.querySelector(${JSON.stringify(selector(id))})`;
async function click(id) {
  await waitFor(`Boolean(${query(id)} && !${query(id)}.disabled && ${query(id)}.getBoundingClientRect().height)`, id);
  await evaluate(`(()=>{const e=${query(id)};const target=e.matches('input[type=radio]') ? e.closest('label') ?? e : e;target.scrollIntoView({block:'center'});})()`);
  const box = await evaluate(`(()=>{const e=${query(id)};const target=e.matches('input[type=radio]') ? e.closest('label') ?? e : e;const b=target.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
}
async function jumpTo(ordinal) {
  if (!await evaluate(`Boolean(${query('navigator-dialog')}?.open)`)) await click('question-counter');
  await click('navigator-filter-all');
  await click(`navigator-question-${ordinal}`);
}
async function recordExamLayout(name) {
  const layout = await evaluate(`(()=>{
    const out={viewport:{width:innerWidth,height:innerHeight},fontReady:document.fonts.check('16px "Be Vietnam Pro"')};
    for(const id of ['exam-header','exam-body','exam-content','question-toolbar','exam-footer','timer','submit-open','question-counter']){
      const e=document.querySelector('[data-testid="'+id+'"]');
      if(!e){out[id]=null;continue;}
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      out[id]={x:r.x,y:r.y,width:r.width,height:r.height,color:s.color,background:s.backgroundColor,fontFamily:s.fontFamily,fontSize:s.fontSize,position:s.position,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};
    }
    return out;
  })()`);
  assert.ok(layout['exam-header'], 'measurable examination header');
  assert.ok(Math.abs(layout['exam-header'].height - 60) <= 5, 'compact exam header');
  assert.ok(Math.abs(layout['exam-footer'].height - 64) <= 5, 'persistent 64px exam footer');
  assert.ok(Math.abs(layout['exam-footer'].y + layout['exam-footer'].height - layout.viewport.height) <= 2, 'footer reaches viewport bottom');
  assert.ok(layout['exam-content'].width <= 768, 'bounded question column');
  if(layout.viewport.width>=768) assert.ok(Math.abs(layout['question-toolbar'].width-688)<=2,'measured 688px question content');
  assert.ok(Math.abs(layout['question-toolbar'].x+layout['question-toolbar'].width/2-layout.viewport.width/2)<=9,'question column centered');
  assert.ok(layout['exam-body'].scrollWidth <= layout['exam-body'].clientWidth + 1, 'no horizontal question overflow');
  assert.ok(layout['timer'].y >= 0 && layout['timer'].y + layout['timer'].height <= layout['exam-header'].height + 1, 'timer contained in compact header');
  assert.equal(layout['submit-open'].background, 'rgb(212, 48, 42)', 'measured exam submit accent');
  assert.equal(layout.fontReady, true, 'local examination font ready');
  report.layouts ??= {};
  report.layouts[name] = layout;
  await writeFile(join(artifacts, `${name}-layout.json`), JSON.stringify(layout,null,2));
}
async function recordBrowseLayout(name, kind) {
  await evaluate('document.fonts.ready.then(()=>true)');
  await delay(200); // Capture settled filter colors after their short CSS transition.
  assert.equal(await evaluate('document.querySelectorAll("main").length'),1,'browse screens retain one main landmark');
  const layout=await evaluate(`(()=>{
    const out={viewport:{width:innerWidth,height:innerHeight}};
    for(const id of ['catalog-panel','catalog-grid','catalog-count','intro','intro-content','intro-structure']){
      const e=document.querySelector('[data-testid="'+id+'"]');if(!e)continue;
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      out[id]={x:r.x,y:r.y,width:r.width,height:r.height,columns:s.gridTemplateColumns,padding:s.padding,radius:s.borderRadius,fontFamily:s.fontFamily,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};
    }
    return out;
  })()`);
  if(kind==='catalog'){
    assert.ok(layout['catalog-panel'],'grouped catalog panel exists');
    if(layout.viewport.width>=1024) assert.ok(Math.abs(layout['catalog-panel'].width-1024)<=1,'loaded reference1024px catalog panel');
    const grid=layout['catalog-grid'];
    const columns=grid.columns.split(' ').filter(Boolean).length;
    assert.equal(columns,layout.viewport.width>=1024?3:layout.viewport.width>=768?2:1,'catalog follows measured3/2/1 grid');
    assert.ok(grid.scrollWidth<=grid.clientWidth+1,'catalog grid has no horizontal overflow');
    assert.equal(await evaluate(`${query('catalog-grid')}.children.length`),3,'only three actual domain cards');
    assert.ok(await evaluate(`${query('catalog-card-READING')}.querySelector('button:disabled')!==null && ${query('catalog-card-SCIENCE')}.querySelector('button:disabled')!==null`),'unavailable domains remain disabled');
  }else{
    assert.equal(await evaluate('window.scrollY'),0,'detail opens at page top with breadcrumbs visible');
    assert.ok(await evaluate(`${query('intro-breadcrumb-catalog')}.getBoundingClientRect().y>=0`),'detail breadcrumb remains in view');
    const intro=layout['intro-content'];
    assert.ok(intro && intro.width<=768,'detail content uses bounded768px column');
    assert.ok(intro.scrollWidth<=intro.clientWidth+1,'detail content has no horizontal overflow');
    assert.ok(Math.abs(intro.x+intro.width/2-layout.viewport.width/2)<=9,'detail column is centered');
    assert.equal(await evaluate(`${query('intro-sc-count')}.textContent.trim()`),'3','exactly three single-choice slots');
    assert.equal(await evaluate(`${query('intro-tf-count')}.textContent.trim()`),'1','exactly one true/false group');
    assert.match(await evaluate(`${query('intro-structure-single-choice')}.textContent`),/Trắc nghiệm/i,'single-choice row is semantically labeled');
    assert.match(await evaluate(`${query('intro-structure-true-false')}.textContent`),/đúng\/sai/i,'true/false row is semantically labeled');
    assert.doesNotMatch(await evaluate(`${query('intro-structure')}.textContent`),/40|20/,'demo structure does not inherit reference counts');
  }
  report.layouts ??= {};
  report.layouts[name]=layout;
  await writeFile(join(artifacts,`${name}-layout.json`),JSON.stringify(layout,null,2));
}
async function recordResultLayout(name) {
  const layout=await evaluate(`(()=>{const out={viewport:{width:innerWidth,height:innerHeight}};for(const id of ['result','result-hero','result-score']){const e=document.querySelector('[data-testid="'+id+'"]');if(!e){out[id]=null;continue;}const r=e.getBoundingClientRect(),s=getComputedStyle(e);out[id]={x:r.x,y:r.y,width:r.width,height:r.height,borderRadius:s.borderRadius,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};}return out;})()`);
  assert.ok(layout['result-hero'],'result ticket exists');
  assert.ok(Math.abs(layout['result-score'].width-layout['result-score'].height)<=2,'raw result uses circular summary');
  assert.ok(layout['result-hero'].scrollWidth<=layout['result-hero'].clientWidth+1,'result ticket has no horizontal overflow');
  assert.ok(layout['result'].width<=1024,'result column stays bounded');
  report.layouts ??= {};
  report.layouts[name]=layout;
  await writeFile(join(artifacts,`${name}-layout.json`),JSON.stringify(layout,null,2));
}
async function recordReviewLayout(name, expanded) {
  const layout = await evaluate(`(()=>{
    const out={viewport:{width:innerWidth,height:innerHeight}};
    for(const id of ['review-header','review-toolbar','review-workspace','review-question-pane','review-explanation-pane','review-footer']){
      const e=document.querySelector('[data-testid="'+id+'"]');
      if(!e){out[id]=null;continue;}
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      out[id]={x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,overflowY:s.overflowY,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};
    }
    return out;
  })()`);
  assert.ok(layout['review-header'], 'focused review header exists');
  assert.ok(Math.abs(layout['review-header'].height - 57) <= 5, 'compact review header');
  assert.ok(Math.abs(layout['review-footer'].y + layout['review-footer'].height - layout.viewport.height) <= 2, 'review navigation reaches viewport bottom');
  const question=layout['review-question-pane'];
  assert.ok(question.scrollWidth<=question.clientWidth+1, 'review question has no horizontal overflow');
  if(expanded){
    const guide=layout['review-explanation-pane'];
    assert.ok(guide && guide.width>0 && guide.height>0, 'expanded explanation is visible');
    assert.equal(question.overflowY,'auto','question scrolls independently');
    assert.ok(guide.scrollWidth<=guide.clientWidth+1,'explanation has no horizontal overflow');
    if(layout.viewport.width>=768){
      assert.ok(Math.abs(question.y-guide.y)<=2,'desktop review panes align');
      assert.ok(guide.x>=question.x+question.width,'desktop explanation is beside question');
    }else{
      assert.ok(guide.y>=question.y+question.height-2,'mobile explanation stacks below question');
      assert.ok(guide.height>=120 && question.height>=120,'both mobile panes remain usable');
    }
  }
  report.layouts ??= {};
  report.layouts[name]=layout;
  await writeFile(join(artifacts, `${name}-layout.json`), JSON.stringify(layout,null,2));
}
async function verifyReviewScrolling() {
  const result=await evaluate(`(()=>{
    const question=document.querySelector('[data-testid="review-question-pane"]');
    const scroll=document.querySelector('[data-testid="review-explanation-scroll"]');
    const close=document.querySelector('[data-testid="review-explanation-close"]');
    const headerY=close.getBoundingClientRect().y;
    const make=()=>{const p=document.createElement('p');p.textContent=Array(120).fill('Synthetic scroll verification.').join('\\n');p.style.whiteSpace='pre-line';return p;};
    const q=make(),g=make();question.append(q);scroll.append(g);
    question.scrollTop=80;scroll.scrollTop=100;
    const result={question:question.scrollTop,guide:scroll.scrollTop,headerDelta:close.getBoundingClientRect().y-headerY};
    q.remove();g.remove();question.scrollTop=0;scroll.scrollTop=0;return result;
  })()`);
  assert.ok(result.question>=70 && result.guide>=90,'both review panes scroll independently');
  assert.ok(Math.abs(result.headerDelta)<=1,'solution heading stays visible while explanation scrolls');
}
async function screenshot(name) {
  const out = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const path = join(artifacts, `${name}.png`);
  await writeFile(path, Buffer.from(out.data, 'base64'));
  report.screenshots.push(path);
}
async function noOverflow() {
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'horizontal overflow');
}
try {
  await mkdir(artifacts, { recursive: true });
  // Inject the existing mock clock through the server factory in this test process.
  // IPC is private to the harness; the application gets no time-control route/flag.
  const serverSource = `
    import { createPrototypeServer } from './apps/practice-prototype/server.mjs';
    import { createMockApiService } from './apps/practice-prototype/src/mock-api.mjs';
    let offset = 0;
    const server = createPrototypeServer({mockService:createMockApiService({now:()=>Date.now()+offset})});
    process.on('message', message => {
      if (Number.isSafeInteger(message.advanceSeconds) && message.advanceSeconds > 0) {
        offset += message.advanceSeconds * 1000;
        process.send({advanced:true});
      }
    });
    server.listen(Number(process.env.PORT), '127.0.0.1');
    process.once('SIGTERM', () => server.close(() => process.exit(0)));
  `;
  server = spawn(process.execPath, ['--input-type=module', '-e', serverSource], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  server.stdout.on('data', b => { serverLog += b; }); server.stderr.on('data', b => { serverLog += b; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (i === 99) throw new Error(`Local demo server did not start: ${serverLog}`);
    await delay(50);
  }
  browser = spawn(browserExecutable, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  browser.on('error', error => { browserLog += String(error); });
  browser.stderr.on('data', b => { browserLog += b; });
  for (let i = 0; i < 100 && !browserLog.includes('DevTools listening on'); i++) await delay(50);
  const match = browserLog.match(/DevTools listening on (ws:\/\/[^\s]+)/);
  assert.ok(match, `Could not launch ${browserExecutable}: ${browserLog}`);
  const debugOrigin = match[1].replace(/^ws:/, 'http:').split('/devtools/')[0];
  report.browser = await (await fetch(`${debugOrigin}/json/version`)).json();
  const targets = await (await fetch(`${debugOrigin}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) { const p = pending.get(data.id); if (p) { pending.delete(data.id); data.error ? p.reject(new Error(JSON.stringify(data.error))) : p.resolve(data.result); } }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
    if (data.method === 'Network.requestWillBeSent') requests.push(data.params.request.url);
    if (data.method === 'Network.responseReceived' && data.params.response.url.startsWith(`${origin}/mock/`)) responses.push(data.params);
  });
  await once(socket, 'open');
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: origin });
  await waitFor('document.readyState === "complete" && document.documentElement.lang === "vi"', 'Vietnamese landing page');
  await waitFor(`Boolean(${query('catalog-open')})`, 'landing controls');
  await noOverflow(); await screenshot('landing-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await noOverflow(); await screenshot('landing-mobile');
  await click('menu-toggle');
  assert.equal(await evaluate(`${query('menu-toggle')}.getAttribute('aria-expanded')`), 'true');
  await click('nav-catalog');
  await waitFor(`Boolean(${query('catalog-filter-all')})`, 'mobile catalog menu route');
  await click('menu-toggle'); await click('nav-home');
  await waitFor(`Boolean(${query('catalog-open')})`, 'mobile home menu route');
  report.checks.push('functional mobile navigation disclosure and home/catalog routes');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('catalog-open');
  await click('catalog-filter-unavailable');
  assert.equal(await evaluate(`Boolean(${query('demo-start')})`), false);
  assert.match(await evaluate(`${query('catalog-count')}.textContent`), /2/);
  await click('catalog-filter-available');
  assert.match(await evaluate(`${query('catalog-count')}.textContent`), /1/);
  await click('catalog-filter-all');
  assert.match(await evaluate(`${query('catalog-count')}.textContent`), /3/);
  await recordBrowseLayout('catalog-desktop','catalog');
  await noOverflow(); await screenshot('catalog-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
  await recordBrowseLayout('catalog-tablet','catalog');
  await noOverflow(); await screenshot('catalog-tablet');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await recordBrowseLayout('catalog-mobile','catalog');
  await noOverflow(); await screenshot('catalog-mobile');
  await click('exam-intro');
  await recordBrowseLayout('intro-mobile','intro');
  await noOverflow(); await screenshot('instructions-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
  await recordBrowseLayout('intro-tablet','intro');
  await noOverflow(); await screenshot('instructions-tablet');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await recordBrowseLayout('intro-desktop','intro');
  await noOverflow(); await screenshot('instructions-desktop');
  await click('intro-breadcrumb-home');
  await waitFor(`Boolean(${query('catalog-open')})`, 'detail breadcrumb returns home');
  assert.equal(await evaluate('document.activeElement.tagName'),'H1','breadcrumb home restores heading focus');
  await click('catalog-open'); await click('exam-intro');
  await click('intro-breadcrumb-catalog');
  await waitFor(`Boolean(${query('catalog-grid')})`, 'detail breadcrumb returns catalog');
  assert.equal(await evaluate('document.activeElement.tagName'),'H1','breadcrumb catalog restores heading focus');
  await click('exam-intro'); await click('intro-back');
  await waitFor(`Boolean(${query('catalog-grid')})`, 'existing detail back action');
  await click('staff-open');
  await waitFor(`document.body.innerText.includes('PostgreSQL cục bộ chưa được khởi chạy')`, 'catalog staff link reports unavailable in mock mode');
  assert.equal(await evaluate('document.querySelector("#app").classList.contains("catalog-mode") || document.querySelector("#app").classList.contains("intro-mode")'),false,'catalog styles clear before staff workspace');
  await click('staff-return');
  await waitFor(`Boolean(${query('catalog-open')})`, 'staff returns to original landing');
  assert.equal(await evaluate('document.querySelector("#app").classList.contains("catalog-mode") || document.querySelector("#app").classList.contains("intro-mode")'),false,'browse styles stay cleared on landing');
  await click('catalog-open'); await click('exam-intro');
  report.checks.push('catalog actual counts/disabled domains, measured3/2/1 grid, detail768px bounds and genuine3SC+1TF structure, breadcrumb/back focus and start');
  await click('intro-start');
  await waitFor(`Boolean(${query('timer')})`, 'running exam');
  await click('mark-for-review');
  assert.equal(await evaluate(`${query('mark-for-review')}.getAttribute('aria-pressed')`), 'true');
  await click('question-counter');
  await click('navigator-filter-marked');
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid^="navigator-question-"]').length`), 1);
  await click('navigator-question-1');
  await click('question-counter');
  assert.equal(await evaluate(`${query('navigator-dialog')}.open`), true);
  assert.equal(await evaluate(`${query('question-counter')}.getAttribute('aria-expanded')`), 'true');
  await click('question-counter');
  assert.equal(await evaluate(`${query('navigator-dialog')}.open`), false, 'counter closes upward drawer');
  await click('question-counter');
  await command('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await command('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor(`!${query('navigator-dialog')}.open`, 'Escape closes upward drawer');
  assert.equal(await evaluate(`document.activeElement===${query('question-counter')}`), true, 'drawer returns keyboard focus');
  report.checks.push('catalog availability filters; pre-exam instructions; bookmark and marked navigator');
  assert.match(await evaluate('document.body.innerText'), /kiểm thử|lặp lại/i);
  const readTimer = async () => { const text = await evaluate(`${query('timer')}.textContent`); const m = text.match(/(\d+):(\d+)/); assert.ok(m, text); return Number(m[1])*60+Number(m[2]); };
  const timeBefore = await readTimer();
  // Hold a save in the browser to verify submit/navigation cannot race its acknowledgement.
  await evaluate(`window.__b0Fetch = window.fetch; window.fetch = (...args) => String(args[0]).includes('/answers/') ? new Promise(resolve => { window.__b0ReleaseSave = () => resolve(window.__b0Fetch(...args)); }) : window.__b0Fetch(...args)`);
  await click('option-b');
  await waitFor(`${query('save-status')}?.textContent.includes('Đang')`, 'pending save');
  assert.equal(await evaluate(`${query('submit-open')}.disabled`), true, 'submit blocked during pending save');
  assert.equal(await evaluate(`${query('question-next')}.disabled`), true, 'navigation blocked during pending save');
  assert.equal(await evaluate(`${query('question-counter')}.disabled`), true, 'navigator disabled during pending save');
  assert.equal(await evaluate(`${query('mark-for-review')}.disabled`), true, 'bookmark disabled during pending save');
  await evaluate('window.fetch = window.__b0Fetch; window.__b0ReleaseSave()');
  await waitFor(`${query('save-status')}?.textContent.includes('Đã')`, 'mock save acknowledgement');
  await click('clear-answer');
  await waitFor(`${query('answered-count')}?.textContent.includes('0/4')`, 'clear acknowledged and answered count reset');
  assert.equal(await evaluate(`${query('option-b')}.checked`), false, 'cleared answer is unselected');
  await click('option-b');
  await waitFor(`${query('save-status')}?.textContent.includes('Đã')`, 'answer restored before resume');
  const sessionBefore = await evaluate(`fetch('/mock/session', {method:'POST'}).then(r=>r.json())`);
  const attemptId = sessionBefore.attempt.attemptId;
  const activeReview = await evaluate(`fetch('/mock/attempts/${attemptId}/review').then(async r=>({status:r.status,body:await r.text()}))`);
  assert.equal(activeReview.status, 409, 'review denied before closure');
  assert.doesNotMatch(activeReview.body, /"answerKey"|"correctOptionId"|"correctStatementValues"|"explanation"|Subtract 2 from each side/);
  await delay(100);
  for (const response of responses.splice(0)) {
    const body = await command('Network.getResponseBody', { requestId: response.requestId });
    assert.doesNotMatch(body.body, /"answerKey"|"correctOptionId"|"correctStatementValues"|"explanation"|Subtract 2 from each side/);
  }
  await command('Page.reload', {ignoreCache:true});
  await waitFor(`Boolean(${query('resume-notice')} && ${query('timer')})`, 'explicit resumed-session notice');
  assert.equal(await evaluate(`${query('option-b')}.checked`), true, 'acknowledged answer survives reload');
  assert.equal(await evaluate(`${query('mark-for-review')}.getAttribute('aria-pressed')`), 'true', 'bookmark survives reload');
  await click('question-counter');
  await click('navigator-filter-unanswered');
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid^="navigator-question-"]').length`), 3);
  await click('navigator-question-2');
  await jumpTo(1);
  const sessionAfter = await evaluate(`fetch('/mock/session', {method:'POST'}).then(r=>r.json())`);
  assert.equal(sessionAfter.attempt.attemptId, attemptId);
  assert.equal(sessionAfter.attempt.deadlineAt, sessionBefore.attempt.deadlineAt, 'reload does not extend deadline');
  await click('question-next');
  await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('option-a');
  await waitFor(`${query('save-status')}?.classList.contains('error')`, 'visible failed save');
  assert.equal(await evaluate(`${query('option-a')}.checked`), false, 'failed save not acknowledged');
  await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('option-a');
  await waitFor(`${query('save-status')}?.textContent.includes('Đã')`, 'second mock save');
  await jumpTo(4);
  await waitFor(`Boolean(${query('true-false-group')})`, 'statement group renderer');
  await evaluate(`window.__b0Fetch = window.fetch; window.fetch = (...args) => String(args[0]).includes('/answers/') ? new Promise(resolve => { window.__b0ReleaseSave = () => resolve(window.__b0Fetch(...args)); }) : window.__b0Fetch(...args)`);
  await click('tf-s1-true');
  assert.equal(await evaluate(`${query('tf-s2-false')}.disabled`), true, 'statement choices disabled during pending save');
  await evaluate('window.fetch = window.__b0Fetch; window.__b0ReleaseSave()');
  await waitFor(`${query('save-status')}?.textContent.includes('Đã')`, 'partial statement save');
  assert.match(await evaluate(`${query('answered-count')}.textContent`), /2\/4/, 'partial group is unfinished');
  // Read response bodies before reload discards their CDP resource identifiers.
  await delay(100);
  for (const response of responses.splice(0)) {
    const body = await command('Network.getResponseBody', { requestId: response.requestId });
    assert.doesNotMatch(body.body, /"answerKey"|"correctOptionId"|"correctStatementValues"|"explanation"|Solving 2y/);
  }

  await command('Page.reload', {ignoreCache:true});
  await waitFor(`Boolean(${query('resume-notice')} && ${query('timer')})`, 'partial group resume');
  await jumpTo(4);
  assert.equal(await evaluate(`${query('tf-s1-true')}.checked`), true, 'partial statement survives reload');
  assert.equal(await evaluate(`${query('tf-s2-false')}.checked`), false);
  await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('tf-s2-false');
  await waitFor(`${query('save-status')}?.classList.contains('error')`, 'failed statement save');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.match(await evaluate(`${query('save-error')}.textContent`), /Thử lại thao tác/);
  assert.ok(await evaluate(`(()=>{const e=${query('save-error')};return e.scrollWidth<=e.clientWidth && getComputedStyle(e).whiteSpace!=='nowrap';})()`), 'full save error wraps on mobile');
  await noOverflow(); await screenshot('save-error-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate(`${query('tf-s2-false')}.checked`), false, 'failed statement remains unacknowledged');
  assert.equal(await evaluate(`${query('tf-s1-true')}.checked`), true, 'earlier acknowledged statement preserved');
  await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate(`${query('tf-s2-false')}.focus()`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await waitFor(`${query('answered-count')}?.textContent.includes('3/4')`, 'complete group via keyboard');
  await noOverflow(); await recordExamLayout('desktop'); await screenshot('true-false-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await noOverflow(); await recordExamLayout('mobile'); await screenshot('true-false-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('clear-answer');
  await waitFor(`${query('answered-count')}?.textContent.includes('2/4')`, 'cleared group unfinished');
  assert.equal(await evaluate(`${query('tf-s1-true')}.checked`), false);
  report.checks.push('true/false partial and complete saves, pending-save guards, reload, offline rollback, keyboard retry, clearing and mobile layout');

  await jumpTo(1);
  assert.equal(await evaluate(`${query('option-b')}.checked`), true, 'answer preserved through navigation');
  await delay(1100);
  assert.ok(await readTimer() < timeBefore, 'countdown decreases and navigation does not reset it');
  await noOverflow(); await screenshot('exam-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: true });
  await noOverflow(); await recordExamLayout('tablet'); await screenshot('exam-tablet');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await noOverflow(); await screenshot('exam-mobile');
  await click('question-counter');
  await click('navigator-filter-all');
  await noOverflow(); await screenshot('navigator-mobile');
  await click('navigator-question-1');
  await evaluate(`(()=>{const body=${query('exam-body')};body.scrollTop=body.scrollHeight;})()`);
  assert.equal(await evaluate(`${query('timer')}.getBoundingClientRect().top >= 0`), true, 'timer remains visible on mobile scroll');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  // Check an actual keyboard interaction on the first question without changing its selected answer.
  await evaluate(`${query('option-b')}.focus()`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  assert.equal(await evaluate(`${query('option-b')}.checked`), true);
  // Inspect every completed pre-submit mock body. Keys/explanations must not be delivered.
  await delay(100);
  for (const response of responses) {
    const body = await command('Network.getResponseBody', { requestId: response.requestId });
    assert.doesNotMatch(body.body, /"answerKey"|"correctStatementValues"|"explanation"|Subtract 2 from each side/);
  }
  report.checks.push('Vietnamese landing/catalog; answer selection/save/navigation; decreasing countdown; desktop/mobile no overflow; radio keyboard operation; pre-submit response privacy');
  await click('submit-open');
  assert.match(await evaluate(`${query('submit-answered-count')}.textContent`), /2/);
  assert.match(await evaluate(`${query('submit-unanswered-count')}.textContent`), /2/);
  assert.match(await evaluate(`${query('submit-marked-count')}.textContent`), /1/);
  await click('submit-cancel');
  assert.ok(await evaluate(`Boolean(${query('timer')})`));
  await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'demonstration result');
  assert.match(await evaluate(`${query('result')}.textContent`), /25[,.]00|25\s*%/);
  assert.match(await evaluate(`${query('result-stats')}.textContent`), /Chưa hoàn tất2/);
  await recordResultLayout('result-desktop');
  await click('result-details-open');
  await waitFor(`Boolean(${query('result-details')})`, 'explicit released inline details');
  assert.equal(await evaluate(`${query('result-details')}.querySelectorAll('details').length`), 4);
  await click('result-filter-incorrect');
  assert.equal(await evaluate(`${query('result-details')}.querySelectorAll('details').length`), 3);
  await click('result-filter-all');

  assert.equal(await evaluate(`${query('result-details')}.querySelector('details').open`), false);
  await evaluate(`${query('result-details')}.querySelector('summary').click()`);
  assert.equal(await evaluate(`${query('result-details')}.querySelector('details').open`), true);
  await screenshot('result-details-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await noOverflow(); await screenshot('result-details-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('review-open');
  await waitFor(`Boolean(${query('review')})`, 'explicit post-closure review');
  assert.match(await evaluate(`${query('review')}.textContent`), /Subtract 2 from each side\./);
  assert.equal(await evaluate(`${query('explanation')}.open`), false, 'explanation initially collapsed');
  await recordReviewLayout('review-desktop-closed', false);
  await screenshot('review-desktop-closed');
  await click('review-explanation-toggle');
  await waitFor(`${query('explanation')}.open && ${query('review-explanation-toggle')}.getAttribute('aria-expanded')==='true'`, 'toolbar opens solution pane');
  assert.equal(await evaluate(`document.getElementById(${query('review-explanation-toggle')}.getAttribute('aria-controls'))===${query('review-explanation-pane')}`), true, 'solution toggle names its controlled pane');
  assert.equal(await evaluate(`${query('review-explanation-toggle')}.getAttribute('aria-expanded')`), 'true');
  await click('review-explanation-close');
  assert.equal(await evaluate(`${query('explanation')}.open`), false);
  assert.equal(await evaluate(`document.activeElement===${query('review-explanation-toggle')}`), true, 'solution close returns toolbar focus');
  await evaluate(`${query('review-explanation-toggle')}.focus()`);
  await command('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:String.fromCharCode(13)});
  await command('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await waitFor(`${query('explanation')}.open && !${query('review-explanation-pane')}.hidden`, 'keyboard opens solution pane');
  await click('review-next');
  assert.match(await evaluate(`${query('review-question')}.textContent`), /VỊ TRÍ 2/);
  assert.equal(await evaluate(`${query('explanation')}.open`), false, 'next question starts collapsed');
  await click('review-filter-incorrect');
  assert.match(await evaluate(`${query('review-question')}.textContent`), /VỊ TRÍ 2/);
  await click('review-filter-all');
  await click('review-next'); await click('review-next'); await click('review-next');
  assert.match(await evaluate(`${query('review-question')}.textContent`), /VỊ TRÍ 4/);
  assert.ok(await evaluate(`Boolean(document.querySelector('[data-testid="review-statement-s1"]'))`), 'released statement review');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await noOverflow(); await screenshot('true-false-review-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('review-prev'); await click('review-prev'); await click('review-prev');
  await click('review-explanation-toggle');
  await waitFor(`${query('explanation')}.open && !${query('review-explanation-pane')}.hidden`, 'reopen first explanation');
  await recordReviewLayout('review-desktop', true);
  await verifyReviewScrolling();
  await noOverflow(); await screenshot('review-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
  await recordReviewLayout('review-tablet', true);
  await noOverflow(); await screenshot('review-tablet');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await recordReviewLayout('review-mobile', true);
  await verifyReviewScrolling();
  await noOverflow(); await screenshot('review-mobile');
  await click('review-explanation-close');
  assert.equal(await evaluate(`${query('explanation')}.open`), false, 'mobile closes solution pane');
  await recordReviewLayout('review-mobile-closed', false);
  await screenshot('review-mobile-closed');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('back-score');
  await waitFor(`Boolean(${query('result')})`, 'return from review to separate score');
  report.checks.push('1440/768/390 responsive layouts; sticky mobile timer; bookmark reload; filtered navigation; live submit counts; result statistics; review filters, paging and explanation expand/collapse');
  report.checks.push('clear answer; immutable reload/resume; active review denied; post-closure explanation on separate review screen');
  await screenshot('result-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await recordResultLayout('result-mobile');
  await noOverflow(); await screenshot('result-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
  await recordResultLayout('result-tablet');
  await noOverflow(); await screenshot('result-tablet');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('return-catalog'); await waitFor(`Boolean(${query('demo-start')})`, 'return to catalog');
  await click('demo-start'); await waitFor(`Boolean(${query('timer')})`, 'explicit new demo after completed result');
  assert.equal(await evaluate(`${query('option-b')}.checked`), false, 'fresh demo does not inherit prior answers');
  const freshSession = await evaluate(`fetch('/mock/session', {method:'POST'}).then(r=>r.json())`);
  const advanced = once(server, 'message');
  server.send({advanceSeconds:359});
  await advanced;
  await command('Page.reload', {ignoreCache:true});
  await waitFor(`Boolean(${query('result')})`, 'authoritative time expiry transitions automatically to result');
  assert.match(await evaluate(`${query('result')}.textContent`), /Hết thời gian demo/);
  const expired = await evaluate(`fetch('/mock/session', {method:'POST'}).then(r=>r.json())`);
  assert.equal(expired.attempt.closureReason, 'DEADLINE');
  assert.equal(expired.attempt.deadlineAt, freshSession.attempt.deadlineAt);
  const lateSave = await evaluate(`fetch('/mock/attempts/${freshSession.attempt.attemptId}/answers/${freshSession.attempt.slots[0].slotId}', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({optionId:'b'})}).then(r=>r.status)`);
  assert.equal(lateSave, 409, 'expired attempt rejects late answer');
  report.checks.push('controlled server clock: resume near deadline, automatic expiry result, unchanged deadline, late save rejected');

  report.checks.push('pending save blocks submit/navigation; offline save remains unacknowledged; retry succeeds');
  report.checks.push('submission cancel/confirm; one-correct-of-four demo result; explicit catalog return and new demo');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.deepEqual(requests.filter(url => /^https?:/.test(url) && !url.startsWith(`${origin}/`)), [], 'external page requests');
  report.checks.push('no uncaught browser exceptions; no external page network requests');
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: 'PASS', ...report }, null, 2));
} catch (error) {
  console.error(error);
  console.error(serverLog);
  process.exitCode = 1;
} finally { await shutdown(); }
