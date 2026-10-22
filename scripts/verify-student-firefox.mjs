// Actual second-engine journey; disposable synthetic PostgreSQL inventory only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createMixedStudentFixture } from '../tests/integration/student-runtime/mixed-fixture.mjs';
import { createStudentRuntime } from '../src/local/student.mjs';
import { createDatabasePool } from '../src/modules/database/pool.mjs';

const artifacts = path.resolve(process.env.STUDENT_FIREFOX_ARTIFACT_DIR ?? '/tmp/tsa-student-firefox-evidence');
await mkdir('.local', { recursive: true });
const profileRoot = await mkdtemp(path.resolve('.local/student-firefox-'));
let fixture, workerPool, runtime, driver, sessionId, endpoint, driverError;
let driverLog = '';
const workerState = { available: true };
const report = { checks: [], screenshots: [] };
async function wd(method, route, body) {
  const response = await fetch(`${endpoint}${sessionId ? `/session/${sessionId}` : ''}${route}`, {
    method, headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (!response.ok || payload.value?.error) throw new Error(`WebDriver ${route}: ${payload.value?.message ?? response.status}`);
  return payload.value;
}
const evaluate = (script) => wd('POST', '/execute/sync', { script: `return (${script});`, args: [] });
async function waitFor(expression, label) {
  const end = Date.now() + 12_000;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${label}`);
}
const query = (id) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
async function click(id) {
  await waitFor(`Boolean(${query(id)} && !${query(id)}.disabled)`, id);
  const selector = `[data-testid="${id}"]`;
  const isInput = await evaluate(`${query(id)}.matches('input')`);
  const element = await wd('POST', '/element', { using: 'css selector',
    value: isInput ? `label:has(${selector})` : selector });
  await wd('POST', `/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
}
async function capture(name) {
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'no horizontal overflow');
  const data = await wd('GET', '/screenshot');
  const filename = path.join(artifacts, `${name}.png`);
  await writeFile(filename, Buffer.from(data, 'base64')); report.screenshots.push(filename);
}
function checkPrivate(value) {
  const privateFields = new Set(['answerKey', 'correctAnswer', 'explanation', 'provenance', 'reviewNotes', 'keySnapshot', 'privateHash']);
  if (Array.isArray(value)) { value.forEach(checkPrivate); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(privateFields.has(key), false, `unexpected private field: ${key}`); checkPrivate(child);
  }
}
try {
  await mkdir(artifacts, { recursive: true });
  fixture = await createMixedStudentFixture();
  const login = `firefox_worker_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${login} LOGIN`); await fixture.pool.query(`GRANT tsa_exam_worker TO ${login}`);
  workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: login });
  const workerProxy = { async connect() {
    if (!workerState.available) throw new Error('Synthetic worker outage');
    return workerPool.connect();
  } };
  const rate = { capacity: 100, refillPerSecond: 10 };
  runtime = await createStudentRuntime({ identityPool: fixture.harness.authPool, examPool: fixture.examPool,
    workerPool: workerProxy, env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0,
    pollMilliseconds: 30, sweepBatchSize: 10, executorId: 'firefox-browser', leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  workerState.available = false;
  driver = spawn(process.env.STUDENT_GECKODRIVER ?? '/snap/bin/geckodriver',
    ['--host', '127.0.0.1', '--port', '0', '--profile-root', profileRoot], { stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [driver.stdout, driver.stderr]) {
    stream.setEncoding('utf8'); stream.on('data', (chunk) => { driverLog = (driverLog + chunk).slice(-32_000); });
  }
  driver.once('error', (error) => { driverError = error; });
  for (let index = 0; index < 200 && !endpoint; index++) {
    if (driverError) throw driverError;
    const port = driverLog.match(/Listening on 127\.0\.0\.1:(\d+)/)?.[1];
    if (port) endpoint = `http://127.0.0.1:${port}`;
    else await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(endpoint, 'geckodriver listens on an ephemeral loopback port');
  const session = await wd('POST', '/session', { capabilities: { alwaysMatch: {
    browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] },
  } } });
  sessionId = session.sessionId; report.browser = `${session.capabilities.browserName}/${session.capabilities.browserVersion}`;
  assert.equal(session.capabilities.browserName, 'firefox');
  await wd('POST', '/window/rect', { width: 1280, height: 900 });
  await wd('POST', '/url', { url: `${runtime.origin}/?student=postgres` });
  await waitFor(`Boolean(${query('persistent-login-studentA')})`, 'explicit candidate login');
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__responses=[];window.fetch=async(...args)=>{const response=await original(...args);const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);if(url.pathname.startsWith('/api/v1/'))window.__responses.push({path:url.pathname,status:response.status,body:await response.clone().json()});return response;};return true})()`);
  await capture('login'); await click('persistent-login-studentA'); await click('demo-start');
  await waitFor('Boolean(document.getElementById("question-title"))', 'persisted question delivery');
  const view = await wd('POST', '/execute/async', { args: [], script: `const done=arguments[arguments.length-1];fetch('/api/v1/attempts?limit=100').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json()).then(done,e=>done({error:String(e)}));` });
  assert.equal(view.state, 'IN_PROGRESS'); assert.equal(view.slots.length, 4); checkPrivate(view);
  const clocks = (await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows;
  assert.equal(await evaluate('document.body.innerText.includes("x^2 + 1") && document.body.innerText.includes("Bảng dữ liệu tổng hợp")'), true);
  for (const [index, slot] of view.slots.entries()) {
    if (index) await click('question-next');
    if (slot.interaction.type === 'MULTIPLE_CHOICE') {
      await click('option-a');
      assert.equal(await evaluate(`${query('submit-open')}.disabled`), true, 'partial MC stays unsaved');
      await click('option-c');
    } else if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
      await click('tf-s1-true');
      await waitFor(`!${query('tf-s2-false')}.disabled`, 'first TF save acknowledged');
      await click('tf-s2-false');
    } else await click('option-b');
    await waitFor(`Boolean(${query('save-status')}.classList.contains('saved') && !${query('submit-open')}.disabled)`, 'acknowledged typed answer');
  }
  assert.match(await evaluate(`${query('answered-count')}.textContent`), /4\/4/);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.answers WHERE attempt_id=$1', [view.attemptId])).rows[0].n, 4);
  const responses = await evaluate('window.__responses'); assert.ok(responses.length >= 7);
  responses.forEach(({ body }) => checkPrivate(body));
  const priorDocument = await evaluate('performance.timeOrigin');
  await wd('POST', '/refresh', {});
  await waitFor(`performance.timeOrigin!==${priorDocument} && Boolean(document.getElementById('question-title'))`, 'fresh document resumes');
  assert.match(await evaluate(`${query('answered-count')}.textContent`), /4\/4/);
  assert.deepEqual((await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows, clocks);
  await capture('saved-exam');
  await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('grading-pending')})`, 'durable pending submission');
  workerState.available = true;
  await waitFor(`Boolean(${query('result')})`, 'released result');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /100/);
  await capture('released-result'); await click('review-open');
  await waitFor(`Boolean(${query('back-score')})`, 'released owner review');
  await capture('released-review');
  assert.equal(await evaluate(`performance.getEntriesByType('resource').every(item=>new URL(item.name).origin===location.origin)`), true);
  report.checks = ['Actual Firefox candidate login and mixed-type PostgreSQL allocation/delivery',
    'SC/MC/TF acknowledged saves and partial MC guard; actual pre-release response privacy',
    'Fresh reload preserves saved answers and exact PostgreSQL clock text',
    'Pending worker outage, recovered 100% release and explicit owner review'];
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n${driverLog.slice(-3000)}\n`); throw error;
} finally {
  if (sessionId) { try { await wd('DELETE', ''); } catch {} }
  if (driver && driver.exitCode === null && driver.signalCode === null) {
    driver.kill('SIGTERM');
    const closed = await Promise.race([once(driver, 'close').then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 3000))]);
    if (!closed) { driver.kill('SIGKILL'); await once(driver, 'close'); }
  }
  if (runtime) await runtime.close(); if (workerPool) await workerPool.end(); if (fixture) await fixture.close();
  await rm(profileRoot, { recursive: true, force: true });
}
