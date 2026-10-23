// Actual second-engine journey; disposable synthetic PostgreSQL inventory only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createMixedStudentFixture } from '../tests/integration/student-runtime/mixed-fixture.mjs';
import { createStudentRuntime } from '../src/local/student.mjs';
import { createDatabasePool } from '../src/modules/database/pool.mjs';
import { createReviewBrowserFixture } from '../tests/integration/bank/review-browser-fixture.mjs';

const artifacts = path.resolve(process.env.STUDENT_FIREFOX_ARTIFACT_DIR ?? '/tmp/tsa-student-firefox-evidence');
// Snap Firefox cannot use the host's /tmp checkout as a profile root.
// A new owned profile in its common directory also works from a clean /tmp clone.
const profileParent = path.resolve(process.env.STUDENT_FIREFOX_PROFILE_ROOT
  ?? path.join(homedir(), 'snap', 'firefox', 'common'));
await mkdir(profileParent, { recursive: true });
const profileRoot = await mkdtemp(path.join(profileParent, 'tsa-student-test-'));
let fixture, staffFixture, workerPool, runtime, driver, sessionId, endpoint, driverError;
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
async function setViewport(width, height, label) {
  const requested = await wd('POST', '/window/rect', { width, height });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const measured = await evaluate(`({innerWidth,outerWidth,scrollWidth:document.documentElement.scrollWidth,scale:window.visualViewport?.scale ?? null})`);
  assert.equal(measured.innerWidth, width, `${label} viewport innerWidth matches requested ${width}px`);
  assert.equal(measured.scrollWidth <= measured.innerWidth, true, `${label} has no horizontal overflow`);
  if (measured.scale !== null) assert.equal(measured.scale, 1, `${label} visual viewport is not auto-zoomed`);
  return { requestedOuterWidth: width, returnedOuterWidth: requested.width, ...measured };
}
async function runStaffReviewJourney() {
  // Clear the completed student fixture's same-origin cookies before opening a
  // fresh isolated staff database and authenticating its synthetic AUTHOR.
  await wd('DELETE', '/cookie');
  assert.deepEqual(await wd('GET', '/cookie'), [], 'student fixture cookies cleared before staff auth');

  staffFixture = await createReviewBrowserFixture();
  await wd('POST', '/url', { url: `${staffFixture.origin}/` });
  await waitFor(`location.href===${JSON.stringify(`${staffFixture.origin}/`)} && Boolean(${query('staff-open')})`, 'staff launcher at fixture root URL');
  assert.equal(await evaluate('new URL(location.href).searchParams.has("student")'), false, 'staff root has no student mode query');
  // The launcher can initialize its mock demo session while the module loads.
  // Clear that host-scoped cookie after load and directly before staff auth.
  await wd('DELETE', '/cookie');
  assert.deepEqual(await wd('GET', '/cookie'), [], 'new staff fixture starts without browser cookies');
  await setViewport(1280, 900, 'staff desktop');
  await capture('staff-launcher');

  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__staffReviewCalls=[];window.fetch=async(...args)=>{const response=await original(...args);const requestUrl=typeof args[0]==='string'?args[0]:args[0].url;const url=new URL(requestUrl,location.href);if(url.pathname.startsWith('/api/v1/question-versions/')&&url.pathname.endsWith('/review-context'))window.__staffReviewCalls.push({path:url.pathname,status:response.status,body:await response.clone().json()});return response;};return true})()`);
  await click('staff-open');
  await waitFor(`Boolean(${query('actor-select')} && ${query('staff-login')})`, 'synthetic staff login form');
  assert.equal(await evaluate(`${query('actor-select')}.value='author'`), 'author', 'select synthetic AUTHOR actor');
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')} && ${query('staff-list-status')}.textContent.includes('bản ghi metadata'))`, 'staff metadata list loaded');

  const selected = staffFixture.questions[0];
  assert.match(selected.versionId, /^[0-9a-f-]{36}$/i, 'fixture version 0 has an exact UUID');
  const versionSelector = `[data-testid="staff-review-inspect"][data-version-id="${selected.versionId}"]`;
  assert.deepEqual(await evaluate('window.__staffReviewCalls'), [], 'metadata browsing does not prefetch private review context');
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(versionSelector)}))`, 'exact version 0 inspect control');
  const inspect = await wd('POST', '/element', { using: 'css selector', value: versionSelector });
  await wd('POST', `/element/${inspect['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
  await waitFor(`Boolean(${query('staff-review-context')} && document.querySelector('.staff-review-preview .review-item'))`, 'AVAILABLE staff preview rendered');

  const calls = await evaluate('window.__staffReviewCalls');
  assert.equal(calls.length, 1, 'one explicit private request after exact-version selection');
  assert.equal(calls[0].path, `/api/v1/question-versions/${selected.versionId}/review-context`);
  assert.equal(calls[0].status, 200);
  assert.equal(calls[0].body.version.versionId, selected.versionId);
  assert.equal(calls[0].body.version.contentHash, selected.contentHash);
  assert.equal(calls[0].body.preview.status, 'AVAILABLE');
  assert.equal(calls[0].body.preview.question.interaction.type, 'SINGLE_CHOICE');
  await waitFor(`Boolean(document.querySelector('.staff-review-preview .content-math[data-math-state="rendered"] math msup'))`, 'Firefox native MathML superscript in staff preview');
  const rendered = await evaluate(`(()=>{const panel=${query('staff-review-context')};const pair=(label)=>{const term=[...panel.querySelectorAll('.staff-review-metadata dt')].find(node=>node.textContent===label);return term?.nextElementSibling?.textContent??null;};const answer=[...panel.querySelectorAll('.review-item h4')].find(node=>node.textContent==='Đáp án trong phiên bản này')?.nextElementSibling?.textContent??null;const explanation=[...panel.querySelectorAll('.review-item h4')].find(node=>node.textContent==='Lời giải riêng')?.nextElementSibling?.innerText??null;return {question:panel.querySelector('.staff-review-preview .review-item .content-text')?.textContent??null,math:Boolean(panel.querySelector('.staff-review-preview .content-math[data-math-state="rendered"] math msup')),table:panel.querySelector('.staff-review-preview table caption')?.textContent??null,options:[...panel.querySelectorAll('.staff-review-preview .review-options .option-letter')].map(node=>node.textContent.toLowerCase()),answer,explanation,version:pair('Phiên bản'),hash:pair('Hash phiên bản'),viewport:{innerWidth,outerWidth,scale:window.visualViewport?.scale??null}}})()`);
  assert.equal(rendered.question, 'Bản xem trước tổng hợp 1; không phải nội dung kỳ thi.');
  assert.equal(rendered.math, true, 'native MathML rendered');
  assert.equal(rendered.table, 'Bảng tổng hợp riêng');
  assert.deepEqual(rendered.options, ['a', 'b'], 'single-choice options rendered');
  assert.equal(rendered.answer, 'b');
  assert.match(rendered.explanation, /Lời giải tổng hợp riêng để kiểm thử giao diện/);
  assert.equal(rendered.version, `1 · ${selected.versionId}`);
  assert.equal(rendered.hash, selected.contentHash);

  const desktopViewport = await setViewport(1280, 900, 'staff desktop review');
  await evaluate(`(()=>{${query('staff-review-context')}.scrollIntoView({block:'start',inline:'nearest'});return true})()`);
  await capture('staff-review-desktop');
  await evaluate(`(()=>{document.querySelector('.staff-review-preview').scrollIntoView({block:'start',inline:'nearest'});return true})()`);
  await capture('staff-review-preview-desktop');
  let narrowViewport = await wd('POST', '/window/rect', { width: 375, height: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 150));
  let narrowMeasured = await evaluate(`({innerWidth,outerWidth,scrollWidth:document.documentElement.scrollWidth,scale:window.visualViewport?.scale??null})`);
  let narrowRequested = 375;
  if (narrowMeasured.innerWidth !== 375) {
    narrowRequested = 450;
    narrowViewport = await wd('POST', '/window/rect', { width: narrowRequested, height: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    narrowMeasured = await evaluate(`({innerWidth,outerWidth,scrollWidth:document.documentElement.scrollWidth,scale:window.visualViewport?.scale??null})`);
  }
  const narrowWidthHonored = narrowMeasured.innerWidth === narrowRequested;
  if (!narrowWidthHonored) {
    assert.equal(narrowRequested, 450, 'Firefox could not honor 375px; the documented 450px fallback was requested');
    assert.equal(narrowMeasured.innerWidth, narrowMeasured.outerWidth, 'record Firefox’s actual minimum narrow viewport');
  }
  assert.equal(narrowMeasured.scrollWidth <= narrowMeasured.innerWidth, true, 'staff narrow review has no horizontal overflow');
  if (narrowMeasured.scale !== null) assert.equal(narrowMeasured.scale, 1, 'staff narrow viewport is not auto-zoomed');
  await evaluate(`(()=>{${query('staff-review-context')}.scrollIntoView({block:'start',inline:'nearest'});return true})()`);
  await capture(`staff-review-narrow-${narrowMeasured.innerWidth}`);
  await evaluate(`(()=>{document.querySelector('.staff-review-preview').scrollIntoView({block:'start',inline:'nearest'});return true})()`);
  await capture(`staff-review-preview-narrow-${narrowMeasured.innerWidth}`);

  const escape = '\uE00C';
  await wd('POST', '/actions', { actions: [{ type: 'key', id: 'staff-keyboard', actions: [
    { type: 'keyDown', value: escape }, { type: 'keyUp', value: escape },
  ] }] });
  await waitFor(`Boolean(${query('staff-review-host')}.hidden && ${query('staff-review-host')}.children.length===0)`, 'Escape removes private review panel');
  const restoredFocus = await evaluate(`document.activeElement?.getAttribute('data-version-id')`);
  assert.equal(restoredFocus, selected.versionId, 'W3C Escape closes and restores focus to exact row control');

  await wd('POST', `/element/${inspect['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
  await waitFor(`Boolean(document.querySelector('.staff-review-preview') && document.querySelector('.staff-review-preview').innerText.includes('Lời giải tổng hợp riêng'))`, 'reopen private preview before logout');
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'staff synthetic logout returns to login');
  const privateDomCleared = await evaluate(`!document.body.innerText.includes('Bản xem trước tổng hợp 1; không phải nội dung kỳ thi.')&&!document.body.innerText.includes('Lời giải tổng hợp riêng để kiểm thử giao diện')&&!document.querySelector('[data-testid="staff-review-context"]')`);
  assert.equal(privateDomCleared, true, 'logout clears private review DOM');
  await capture('staff-logout-cleared');

  await evaluate(`${query('actor-select')}.value='bankManager'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-review-evidence-open')})`, 'Bank Manager evidence actions');
  assert.equal(await evaluate(`Boolean(${query('staff-review-evidence')})`),false,'no automatic evidence panel');
  await evaluate(`(()=>{const original=window.fetch;window.__staffEvidenceCalls=[];window.fetch=async(...args)=>{const response=await original(...args);const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);if(url.pathname.endsWith('/review-evidence'))window.__staffEvidenceCalls.push({status:response.status,body:await response.clone().json()});return response;};return true})()`);
  const evidenceSelector = `[data-testid="staff-review-evidence-open"][data-version-id="${selected.versionId}"]`;
  const evidenceElement=await wd('POST','/element',{using:'css selector',value:evidenceSelector});
  assert.equal(await evaluate('window.__staffEvidenceCalls.length'),0,'no evidence prefetch');
  await wd('POST',`/element/${evidenceElement['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  await waitFor(`Boolean(${query('staff-recorded-evidence-text')})`,'current recorded evidence text');
  const evidence=await evaluate('window.__staffEvidenceCalls[0]');
  assert.equal(evidence.status,200);assert.equal(evidence.body.accessBasis,'BANK_MANAGER');
  assert.equal(evidence.body.version.versionId,selected.versionId);
  assert.equal(evidence.body.version.contentHash,selected.contentHash);
  assert.equal(evidence.body.qualification,'NOT_ATTESTED_BY_PLATFORM');
  assert.equal(await evaluate(`${query('staff-recorded-evidence-text')}.textContent`),staffFixture.evidenceText);
  assert.equal(await evaluate(`${query('staff-review-evidence')}.querySelectorAll('img,a,script,iframe,object,embed').length`),0,'recorded HTML/URIs remain inert');
  await evaluate(`${query('staff-recorded-evidence-text')}.scrollIntoView({block:'center'})`);
  await capture(`staff-evidence-text-narrow-${narrowMeasured.innerWidth}`);
  await setViewport(1280,900,'evidence desktop');
  await evaluate(`${query('staff-recorded-evidence-text')}.scrollIntoView({block:'center'})`);
  await capture('staff-evidence-text-desktop');
  await evaluate(`document.getElementById('staff-review-evidence-title').focus()`);
  await wd('POST','/actions',{actions:[{type:'key',id:'staff-evidence-keyboard',actions:[{type:'keyDown',value:escape},{type:'keyUp',value:escape}]}]});
  await waitFor(`!${query('staff-review-evidence')}`,'Escape clears evidence');
  assert.equal(await evaluate(`document.activeElement.matches(${JSON.stringify(evidenceSelector)})`),true,'evidence Escape restores focus');
  await wd('POST',`/element/${evidenceElement['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  await waitFor(`Boolean(${query('staff-recorded-evidence-text')})`,'evidence reopened for logout');
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`,'evidence logout');
  assert.equal(await evaluate(`Boolean(${query('staff-review-evidence')})`),false);
  assert.equal(await evaluate(`document.body.textContent.includes(${JSON.stringify(staffFixture.evidenceText)})`),false,'logout clears evidence text');
  report.checks.push('B2 BANK_MANAGER explicit exact-version current evidence is inert verbatim text, actual narrow/desktop readable, W3C Escape restores focus and logout clears it');

  report.viewports = { staffDesktop: desktopViewport, staffNarrow: {
    requestedOuterWidth: narrowRequested, returnedOuterWidth: narrowViewport.width,
    widthRequestHonored: narrowWidthHonored, ...narrowMeasured,
  } };
  report.checks.push('Staff B1 synthetic AUTHOR opens only exact version 0 on explicit activation; AVAILABLE SC, native MathML, table, key, explanation, version and hash verified');
  report.checks.push('Staff 1280px desktop and best-supported narrow Firefox viewport screenshots; W3C Escape restores exact row focus; logout clears private DOM');
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
  await waitFor('Boolean(document.querySelector(".content-math[data-math-state=rendered] math msup"))', 'Firefox native MathML superscript');
  assert.equal(await evaluate('document.body.innerText.includes("Bảng dữ liệu tổng hợp")'), true);
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
  if (process.env.STAFF_REVIEW_FIREFOX === 'true') await runStaffReviewJourney();
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n${driverLog.slice(-3000)}\n`); throw error;
} finally {
  const cleanupErrors = [];
  const cleanup = async (name, action) => {
    try { await action(); } catch (error) { cleanupErrors.push(new Error(`${name}: ${error.message}`, { cause: error })); }
  };
  if (sessionId) await cleanup('Firefox session', async () => { await wd('DELETE', ''); });
  if (driver && driver.exitCode === null && driver.signalCode === null) await cleanup('geckodriver', async () => {
    driver.kill('SIGTERM');
    const closed = await Promise.race([once(driver, 'close').then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 3000))]);
    if (!closed && driver.exitCode === null && driver.signalCode === null) {
      driver.kill('SIGKILL');
      await once(driver, 'close');
    }
  });
  if (staffFixture) await cleanup('staff browser fixture', () => staffFixture.close());
  if (runtime) await cleanup('student runtime', () => runtime.close());
  if (workerPool) await cleanup('student worker pool', () => workerPool.end());
  if (fixture) await cleanup('student fixture', () => fixture.close());
  await cleanup('Firefox profile', () => rm(profileRoot, { recursive: true, force: true }));
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Firefox verification cleanup failed');
}
