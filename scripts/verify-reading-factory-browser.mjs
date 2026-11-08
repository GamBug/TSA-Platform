// Browser acceptance of the disposable 20-question Reading Factory website path.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const browserExecutable = process.env.READING_FACTORY_BROWSER || 'chromium';
const browserProfile = await mkdtemp(join(tmpdir(), 'tsa-reading-factory-chromium-'));
const artifacts=process.env.READING_FACTORY_ARTIFACT_DIR??'/tmp/tsa-reading-factory-browser-evidence';
await mkdir(artifacts,{recursive:true,mode:0o700});
const screenshots=[];
const server = spawn(process.execPath, ['scripts/start-reading-factory-demo.mjs'], {
  env: { ...process.env, NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', STUDENT_FIXTURE_DEMO: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverExited = once(server, 'close');
let serverOutput = '';
let serverErrors = '';
server.stdout.setEncoding('utf8');
server.stderr.setEncoding('utf8');
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverErrors += chunk; });
let browser;
let socket;
let stopping;
const close = () => {
  stopping ??= (async () => {
    socket?.close();
    if (browser && browser.exitCode === null && browser.signalCode === null) browser.kill('SIGTERM');
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
    await Promise.race([serverExited, delay(12_000)]);
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    await rm(browserProfile, { recursive: true, force: true }).catch(() => {});
  })();
  return stopping;
};
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });

async function waitForServerReady(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const line = serverOutput.split('\n').find((entry) => entry.startsWith('{"event":"ready"'));
    if (line) return JSON.parse(line);
    if (server.exitCode !== null || server.signalCode !== null) break;
    await delay(30);
  }
  throw new Error(`Reading Factory demo failed before ready. stderr: ${serverErrors}`);
}

const portProbe = createServer();
await new Promise((resolve, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolve);
});
const debugPort = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const debugOrigin = `http://127.0.0.1:${debugPort}`;
let sequence = 0;
const pending = new Map();

function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10_000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}
async function capture(name){
  const result=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const path=join(artifacts,`${name}.png`);await writeFile(path,Buffer.from(result.data,'base64'),{mode:0o600});screenshots.push(path);
}

async function waitFor(expression, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await evaluate(expression)) return; }
    catch (error) {
      if (!/context.*(destroyed|not found)|Cannot find context/i.test(error.message)) throw error;
    }
    await delay(50);
  }
  throw new Error(`Timed out: ${label}`);
}

const selector = (id) => `[data-testid="${id}"]`;
const query = (id) => `document.querySelector(${JSON.stringify(selector(id))})`;
async function click(id) {
  await waitFor(`Boolean(${query(id)} && !${query(id)}.disabled && ${query(id)}.getBoundingClientRect().height)`, id);
  const box = await evaluate(`(()=>{
    const e=${query(id)};const target=e.matches('input[type=radio]')?(e.closest('label')??e):e;
    target.scrollIntoView({block:'center'});const r=target.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
}

function currentQuestionExpression() {
  return `(()=>{const t=${query('question-counter')}?.textContent??'';return Number(t.match(/Câu\\s+(\\d+)/)?.[1]??0)})()`;
}

async function answerCurrentQuestion() {
  if (await evaluate(`Boolean(${query('true-false-group')})`)) {
    for (const choice of ['tf-a-true', 'tf-b-false']) {
      await click(choice);
      await waitFor(`${query('save-status')}.classList.contains('saved')`, `${choice} saved`);
    }
  } else {
    await click('option-a');
    await waitFor(`${query('save-status')}.classList.contains('saved')`, 'answer saved');
  }
}

let browserLogs = '';
try {
  const ready = await waitForServerReady();
  assert.equal(ready.mode, 'DISPOSABLE_SYNTHETIC_ONLY');
  assert.equal(ready.fixture, true);
  assert.equal(ready.liveLlmCalled, false);
  assert.equal(ready.questionCount, 20);
  assert.equal(ready.passageCount, 2);

  browser = spawn(browserExecutable, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${browserProfile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.setEncoding('utf8');
  browser.stderr.on('data', (chunk) => { browserLogs += chunk; });

  let version;
  const debugDeadline = Date.now() + 20_000;
  while (Date.now() < debugDeadline) {
    try {
      const response = await fetch(`${debugOrigin}/json/version`);
      if (response.ok) { version = await response.json(); break; }
    } catch {}
    await delay(100);
  }
  if (!version) throw new Error(`Chromium DevTools did not become ready: ${browserLogs}`);
  const targetResponse = await fetch(`${debugOrigin}/json/new?about%3Ablank`, { method: 'PUT' });
  assert.equal(targetResponse.status, 200);
  const target = await targetResponse.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const value = JSON.parse(data);
    if (!value.id) return;
    const task = pending.get(value.id);
    if (!task) return;
    pending.delete(value.id);
    if (value.error) task.reject(new Error(value.error.message));
    else task.resolve(value.result);
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate', { url: ready.url });

  await waitFor(`Boolean(${query('persistent-login-studentA')})`, 'explicit synthetic candidate login');
  await click('persistent-login-studentA');
  await waitFor(`Boolean(${query('catalog-card-READING')} && ${query('demo-start')})`, 'registered READING20 catalog');
  assert.equal(await evaluate(`${query('catalog-card-READING')}.textContent.includes('20 câu')`), true);
  await capture('catalog');
  await click('demo-start');
  await waitFor("Boolean(document.getElementById('question-title'))", '20-question attempt started');
  assert.equal(await evaluate(`${query('question-counter')}.textContent.includes('/ 20')`), true);
  assert.equal(await evaluate(`${query('practice-profile-label')}.textContent.includes('20 câu')`),true);
  await capture('exam');

  for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    assert.equal(await evaluate(currentQuestionExpression()), ordinal);
    await answerCurrentQuestion();
    if (ordinal < 5) {
      await click('question-next');
      await waitFor(`${currentQuestionExpression()}===${ordinal + 1}`, `question ${ordinal + 1}`);
    }
  }
  const previousDocument=await evaluate('performance.timeOrigin');
  await command('Page.reload', { ignoreCache: true });
  await waitFor(`performance.timeOrigin!==${previousDocument} && Boolean(document.getElementById('question-title')) && Boolean(${query('practice-profile-label')})`, 'same active attempt restored in a new document after reload');
  assert.equal(await evaluate(`${query('practice-profile-label')}.textContent.includes('20 câu')`),true);
  await click('question-counter');
  await click('navigator-filter-unanswered');
  await waitFor(`Boolean(${query('navigator-question-6')})`, 'unanswered navigation restores the remaining questions');
  await click('navigator-question-6');
  await waitFor(`${currentQuestionExpression()}===6`, 'resume at first unanswered question');

  for (let ordinal = 6; ordinal <= 20; ordinal += 1) {
    assert.equal(await evaluate(currentQuestionExpression()), ordinal);
    await answerCurrentQuestion();
    if(ordinal===10){
      await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await capture('exam-narrow');
      await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    }
    if (ordinal < 20) {
      await click('question-next');
      await waitFor(`${currentQuestionExpression()}===${ordinal + 1}`, `question ${ordinal + 1}`);
    }
  }
  assert.equal(await evaluate(`${query('save-status')}.classList.contains('saved')`), true);
  await click('submit-open');
  await click('submit-confirm');
  await waitFor(`Boolean(${query('result-score')})`, 'graded result released', 30_000);
  const resultText=await evaluate(`${query('result-score')}.textContent`);
  assert.match(resultText, /100/);
  await capture('result');
  await click('review-open');
  await waitFor(`Boolean(${query('review')})`, 'released explanations visible');
  const reviewOrdinals = [];
  const explanationLengths = [];
  for (let ordinal = 1; ordinal <= 20; ordinal += 1) {
    assert.equal(await evaluate(`${query('review-counter')}.textContent.trim()`), `${ordinal} / 20`);
    assert.ok(await evaluate(`${query('review-question')}.textContent.trim().length > 0`));
    if(!(await evaluate(`${query('explanation')}.open`)))await click('review-explanation-toggle');
    await waitFor(`${query('explanation')}.open && !${query('review-explanation-pane')}.hidden`,'released explanation expanded');
    const explanationLength = await evaluate(`${query('review-explanation-scroll')}.textContent.trim().length`);
    assert.ok(explanationLength > 0, `released explanation ${ordinal} is visible`);
    reviewOrdinals.push(ordinal);
    explanationLengths.push(explanationLength);
    if (ordinal < 20) {
      await click('review-next');
      await waitFor(`${query('review-counter')}.textContent.trim()===${JSON.stringify(`${ordinal + 1} / 20`)}`,
        `released review question ${ordinal + 1}`);
    }
  }
  await capture('review');
  const report={
    event: 'verified', browser: version.Browser, fixture: true, liveLlmCalled: false,
    journey: ['explicit synthetic login', 'READING20 catalog', 'save five answers', 'reload and resume',
      'save remaining fifteen', 'submit', 'released score and twenty explanations'],
    result:resultText,reviewOrdinals, explanationLengths,screenshots,
  };
  await writeFile(join(artifacts,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  if(socket?.readyState===WebSocket.OPEN){
    try{await capture('failure');await writeFile(join(artifacts,'failure.txt'),String(await evaluate('document.body.innerText')),{mode:0o600});}catch{}
  }
  process.stderr.write(`${error.stack ?? error.message}\n${browserLogs}\n${serverErrors}`);
  process.exitCode = 1;
} finally {
  await close();
}
