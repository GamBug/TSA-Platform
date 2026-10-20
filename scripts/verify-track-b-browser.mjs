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
  report.checks.push('AUTHOR login; lost-success-response retry reused one idempotency key and produced one draft');
  await noHorizontalOverflow();
  await screenshot('staff-workspace-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await noHorizontalOverflow();
  await screenshot('staff-workspace-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await command('Page.reload', { ignoreCache: true });
  await waitFor(`Boolean(${query('staff-open')})`, 'landing after reload');
  await click('staff-open');
  await waitFor(`Boolean(${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===1)`, 'persistent draft after reload');
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
