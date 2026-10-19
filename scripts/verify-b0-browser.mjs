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
  for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
const selector = id => `[data-testid="${id}"]`;
const query = id => `document.querySelector(${JSON.stringify(selector(id))})`;
async function click(id) {
  await waitFor(`Boolean(${query(id)} && !${query(id)}.disabled && ${query(id)}.getBoundingClientRect().height)`, id);
  await evaluate(`${query(id)}.scrollIntoView({block:'center'})`);
  const box = await evaluate(`(()=>{const b=${query(id)}.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box });
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
  server = spawn(process.execPath, ['apps/practice-prototype/server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: origin });
  await waitFor('document.readyState === "complete" && document.documentElement.lang === "vi"', 'Vietnamese landing page');
  await waitFor(`Boolean(${query('catalog-open')})`, 'landing controls');
  await noOverflow(); await screenshot('landing-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await noOverflow(); await screenshot('landing-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('catalog-open');
  await click('demo-start');
  await waitFor(`Boolean(${query('timer')})`, 'running exam');
  assert.match(await evaluate('document.body.innerText'), /kiểm thử|lặp lại/i);
  const readTimer = async () => { const text = await evaluate(`${query('timer')}.textContent`); const m = text.match(/(\d+):(\d+)/); assert.ok(m, text); return Number(m[1])*60+Number(m[2]); };
  const timeBefore = await readTimer();
  // Hold a save in the browser to verify submit/navigation cannot race its acknowledgement.
  await evaluate(`window.__b0Fetch = window.fetch; window.fetch = (...args) => String(args[0]).includes('/answers/') ? new Promise(resolve => { window.__b0ReleaseSave = () => resolve(window.__b0Fetch(...args)); }) : window.__b0Fetch(...args)`);
  await click('option-b');
  await waitFor(`${query('save-status')}?.textContent.includes('Đang')`, 'pending save');
  assert.equal(await evaluate(`${query('submit-open')}.disabled`), true, 'submit blocked during pending save');
  assert.equal(await evaluate(`${query('question-next')}.disabled`), true, 'navigation blocked during pending save');
  await evaluate('window.fetch = window.__b0Fetch; window.__b0ReleaseSave()');
  await waitFor(`${query('save-status')}?.textContent.includes('Đã')`, 'mock save acknowledgement');
  await click('question-next');
  await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('option-a');
  await waitFor(`${query('save-status')}?.classList.contains('error')`, 'visible failed save');
  assert.equal(await evaluate(`${query('option-a')}.checked`), false, 'failed save not acknowledged');
  await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click('option-a');
  await waitFor(`${query('save-status')}?.textContent.includes('Đã')`, 'second mock save');
  await click('question-nav-1');
  assert.equal(await evaluate(`${query('option-b')}.checked`), true, 'answer preserved through navigation');
  await delay(1100);
  assert.ok(await readTimer() < timeBefore, 'countdown decreases and navigation does not reset it');
  await noOverflow(); await screenshot('exam-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await noOverflow(); await screenshot('exam-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  // Check an actual keyboard interaction on the first question without changing its selected answer.
  await evaluate(`${query('option-b')}.focus()`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  assert.equal(await evaluate(`${query('option-b')}.checked`), true);
  // Inspect every completed pre-submit mock body. Keys/explanations must not be delivered.
  await delay(100);
  for (const response of responses) {
    const body = await command('Network.getResponseBody', { requestId: response.requestId });
    assert.doesNotMatch(body.body, /"answerKey"|"explanation"|Subtract 2 from each side/);
  }
  report.checks.push('Vietnamese landing/catalog; answer selection/save/navigation; decreasing countdown; desktop/mobile no overflow; radio keyboard operation; pre-submit response privacy');
  await click('submit-open'); await click('submit-cancel');
  assert.ok(await evaluate(`Boolean(${query('timer')})`));
  await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'demonstration result');
  assert.match(await evaluate(`${query('result')}.textContent`), /25[,.]00|25\s*%/);
  await screenshot('result-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await noOverflow(); await screenshot('result-mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('return-catalog'); await waitFor(`Boolean(${query('demo-start')})`, 'return to catalog');
  await click('demo-start'); await waitFor(`Boolean(${query('timer')})`, 'explicit new demo after completed result');
  assert.equal(await evaluate(`${query('option-b')}.checked`), false, 'fresh demo does not inherit prior answers');
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
