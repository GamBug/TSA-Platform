// Chromium rehearsal of the university demo run of show. It starts the real
// one-command launcher in rehearsal mode, walks the student and staff journeys,
// saves screenshots, then stops the launcher the way Ctrl+C does and checks that
// nothing it started is left behind.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.resolve(process.env.UNI_DEMO_ARTIFACT_DIR ?? '/tmp/tsa-uni-demo-evidence');
const port = process.env.UNI_DEMO_VERIFY_PORT ?? '4181';
const OWNED_PROCESS = /tsa-uni-demo|tsa-bank-core-|tsa-track-b-socket/;
const report = { engine: 'chromium', mode: 'REHEARSAL', checks: [], screenshots: [] };
const query = (id) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ownedProcesses() {
  const listing = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).stdout ?? '';
  return new Map(listing.split('\n').map((line) => line.trim()).filter((line) => OWNED_PROCESS.test(line))
    .map((line) => [line.slice(0, line.indexOf(' ')), line]));
}
async function demoDirectories() {
  return new Set((await readdir(tmpdir())).filter((name) => name.startsWith('tsa-uni-demo-')));
}
async function stop(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill(signal);
  const done = await Promise.race([once(child, 'close').then(() => true), delay(5_000).then(() => false)]);
  if (!done) { child.kill('SIGKILL'); await once(child, 'close'); }
}

await mkdir(artifacts, { recursive: true });
const baselineProcesses = ownedProcesses();
const baselineDirectories = await demoDirectories();
let launcher, browser, socket, profile, launcherLog = '', browserLog = '', sequence = 0;
const pending = new Map();

function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15_000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const value = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
  return value.result.value;
}
async function waitFor(expression, label, timeout = 20_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await evaluate(expression)) return; }
    catch (error) { if (!/context|document unloaded|Cannot find/i.test(error.message)) throw error; }
    await delay(40);
  }
  throw new Error(`Timed out: ${label}`);
}
/** Click the element an expression returns; inputs are clicked through their label. */
async function clickElement(expression, label) {
  await waitFor(`(()=>{const e=${expression};return Boolean(e&&!e.disabled)})()`, label);
  const point = await evaluate(`(()=>{const e=${expression};const t=e.matches('input')?e.closest('label'):e;t.scrollIntoView({block:'center'});const r=t.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
const click = (id) => clickElement(query(id), id);
async function capture(name) {
  const data = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const target = path.join(artifacts, `${name}.png`);
  await writeFile(target, Buffer.from(data.data, 'base64'));
  report.screenshots.push(target);
}
async function navigate(url, ready, label) {
  await command('Page.navigate', { url });
  await waitFor(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'&&(${ready})`, label);
}
/** The visible notice block with its asynchronously added content-source line. */
async function readNotice(label) {
  await waitFor(`Boolean(${query('demo-notice-source')})`, `${label}: content-source notice`);
  const notice = await evaluate(`(()=>{const n=${query('demo-notice')};n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();const s=getComputedStyle(n);
    return{text:n.innerText,visible:r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none',inViewport:r.top>=0&&r.bottom<=innerHeight,rehearsal:n.classList.contains('demo-notice--rehearsal')}})()`);
  assert.equal(notice.visible && notice.inViewport, true, `${label}: notice is visible`);
  assert.equal(notice.rehearsal, true, `${label}: rehearsal content is labelled`);
  return notice.text;
}
const answerLabel = (slot) => {
  const label = slot.content.map((block) => block.text ?? '').join(' ').match(/nêu nhãn ([ABC])\./)?.[1];
  assert.ok(label, 'rehearsal item states its label');
  return label.toLowerCase();
};
const activeAttempt = (version) => evaluate(`fetch('/api/${version}/attempts?limit=100').then(r=>r.json())
  .then(p=>fetch('/api/${version}/attempts/'+p.items.find(x=>x.state==='IN_PROGRESS').attemptId)).then(r=>r.json())`);

try {
  // 1. One command starts the database, the server and the staff and student URLs.
  launcher = spawn(process.execPath, ['scripts/start-uni-demo.mjs', '--rehearsal'], {
    cwd: ROOT, env: { ...process.env, DEMO_UNI_PORT: port }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [launcher.stdout, launcher.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => { launcherLog += chunk; });
  }
  let ready;
  for (let waited = 0; waited < 180_000 && !ready; waited += 100) {
    if (launcher.exitCode !== null) throw new Error(`Launcher exited before it was ready:\n${launcherLog}`);
    const line = launcherLog.split('\n').find((entry) => entry.startsWith('{"event":"ready"'));
    if (line) ready = JSON.parse(line); else await delay(100);
  }
  assert.ok(ready, `Launcher did not become ready:\n${launcherLog}`);
  assert.equal(ready.mode, 'REHEARSAL');
  assert.equal(ready.fullSimulationsWithoutRepeats, 1);
  Object.assign(report, { urls: ready.urls, published: ready.published, fullSimulationsWithoutRepeats: ready.fullSimulationsWithoutRepeats });
  assert.match(launcherLog, /Content mode: REHEARSAL/);
  report.checks.push('One command printed the stock report and the student, full-simulation and staff URLs');

  profile = await mkdtemp(path.join(tmpdir(), 'tsa-uni-demo-chromium-'));
  browser = spawn(process.env.STUDENT_BROWSER ?? '/snap/bin/chromium', ['--headless', '--disable-gpu', '--disable-background-networking',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    ...(process.env.STUDENT_BROWSER_NO_SANDBOX === 'true' ? ['--no-sandbox'] : []),
    `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.setEncoding('utf8');
  browser.stderr.on('data', (chunk) => { browserLog = (browserLog + chunk).slice(-32_000); });
  browser.on('error', (error) => { browserLog += error.message; });
  for (let i = 0; i < 200 && !browserLog.includes('DevTools listening on'); i++) {
    if (browser.exitCode !== null) throw new Error(browserLog);
    await delay(50);
  }
  const endpoint = browserLog.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
  assert.ok(endpoint, browserLog);
  const targets = await (await fetch(`${endpoint.replace('ws:', 'http:').split('/devtools/')[0]}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  socket.addEventListener('message', ({ data }) => {
    const value = JSON.parse(data);
    const task = value.id ? pending.get(value.id) : null;
    if (!task) return;
    pending.delete(value.id);
    if (value.error) task.reject(new Error(value.error.message)); else task.resolve(value.result);
  });
  await once(socket, 'open');
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  // 2. Student catalog with the three notices.
  await navigate(ready.urls.student, `Boolean(${query('persistent-login')})`, 'student login screen');
  await click('persistent-login-studentA');
  await waitFor(`Boolean(${query('catalog-grid')})&&Boolean(${query('demo-start')})`, 'student catalog');
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid="demo-start"]').length`), 3, 'three section profiles from published stock');
  const catalogNotice = await readNotice('catalog');
  assert.match(catalogNotice, /Luyện tập không chính thức — không liên kết với Đại học Bách khoa Hà Nội \(HUST\)\./);
  assert.match(catalogNotice, /Dự án phi lợi nhuận: không quảng cáo, không thu phí\./);
  assert.match(catalogNotice, /Nguồn nội dung: Câu hỏi tổng hợp do dự án tự biên soạn để diễn tập/);
  assert.match(catalogNotice, /DIỄN TẬP · NỘI DUNG TỔNG HỢP/);
  await capture('01-student-catalog-notices');
  report.checks.push('Catalog shows the unofficial/not-affiliated, non-profit and content-source notices with the rehearsal label');

  // 3. Topic practice on one published topic, answered correctly, to a released result.
  const geometry = `[...document.querySelectorAll('[data-testid="topic-select"]')].find(i=>i.closest('label').innerText.includes('Hình học'))`;
  await click('topic-practice-open');
  await clickElement(geometry, 'published geometry topic');
  await evaluate(`(()=>{const c=${query('topic-question-count')};c.value='3';c.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await waitFor(`(()=>{const e=${geometry};return Boolean(e&&e.checked&&!${query('topic-start')}.disabled)})()`, 'topic selection ready');
  await capture('02-topic-practice-selection');
  await click('topic-start');
  await click('created-start');
  await waitFor('Boolean(document.querySelector("#question-title"))', 'topic attempt started');
  const topicAttempt = await activeAttempt('v1');
  assert.equal(topicAttempt.slots.length, 3);
  for (const [position, slot] of topicAttempt.slots.entries()) {
    if (position) await click('question-next');
    await click(`option-${answerLabel(slot)}`);
    await waitFor(`${query('save-status')}.classList.contains('saved')`, `topic answer ${position + 1} saved`);
  }
  await click('submit-open');
  await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'topic result released');
  const topicResult = await evaluate(`fetch('/api/v1/attempts/${topicAttempt.attemptId}/result').then(r=>r.json())`);
  assert.deepEqual([topicResult.correctCount, topicResult.totalCount], [3, 3]);
  assert.equal(await evaluate(`Boolean(${query('result')}.querySelector('[data-testid="demo-notice"]'))`), true, 'notice sits on the result card');
  await readNotice('topic result');
  await capture('03-topic-practice-result');
  report.checks.push('Topic practice: 3 published geometry items answered, submitted and graded 3/3; notices visible on the result page');

  // 4. Full simulation: three sections, return navigation, per-section and total correct counts.
  await navigate(ready.urls.simulation, `Boolean(${query('demo-start')})`, 'full-simulation offering');
  const offerNotice = await readNotice('simulation offering');
  assert.match(offerNotice, /Unofficial practice — not affiliated with HUST\./);
  assert.match(offerNotice, /Non-profit project: no ads, no fees\./);
  assert.match(offerNotice, /Content source: Original synthetic questions written by the project for rehearsal/);
  assert.match(offerNotice, /REHEARSAL · SYNTHETIC CONTENT/);
  await capture('04-full-simulation-offering');
  await click('demo-start');
  await waitFor(`Boolean(${query('section-math')})&&Boolean(${query('option-a')})`, 'mathematics opened');
  const plan = [['math', 'Mathematics', 3], ['reading', 'Reading', 2], ['science', 'Science', 1]];
  let simulationId;
  for (const [sectionId, name, answers] of plan) {
    if (sectionId !== 'math') {
      await click(`section-${sectionId}`);
      await waitFor(`document.querySelector('[role="tabpanel"]')?.getAttribute('aria-label')===${JSON.stringify(name)}&&Boolean(${query('option-a')})`, `${name} opened`);
    }
    const view = await activeAttempt('v3');
    simulationId = view.attemptId;
    const slots = view.slots.filter((slot) => slot.sectionId === sectionId);
    assert.equal(slots.length, sectionId === 'reading' ? 20 : 40);
    for (let position = 0; position < answers; position++) {
      if (position) await click('question-next');
      await click(`option-${answerLabel(slots[position])}`);
      await waitFor(`${query('save-status')}.classList.contains('saved')`, `${name} answer ${position + 1} saved`);
    }
  }
  await click('section-math');
  await waitFor(`document.querySelector('[role="tabpanel"]')?.getAttribute('aria-label')==='Mathematics'&&${query('section-math')}.innerText.includes('Clock running')`, 'returned to mathematics with time remaining');
  await capture('05-full-simulation-in-progress');
  await click('submit-open');
  await waitFor('Boolean(document.querySelector("dialog[open]"))', 'submit-all confirmation');
  await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'simulation result released', 30_000);
  assert.equal(await evaluate(`${query('result')}.querySelector('h2').textContent`), '6 / 100 correct');
  for (const [sectionId, name, answers] of plan) {
    assert.equal(await evaluate(`[...${query(`result-${sectionId}`)}.cells].map(c=>c.textContent).join('|')`),
      `${name}|${answers}|${sectionId === 'reading' ? 20 : 40}`);
  }
  await readNotice('simulation result');
  await capture('06-full-simulation-result');
  report.simulationAttemptId = simulationId;
  report.checks.push('Full simulation: 100 questions, three section clocks, return to Mathematics, result 6/100 with Mathematics 3/40, Reading 2/20, Science 1/40; notices visible');

  // 5. Staff review queue: unpublished items stay with staff.
  await click('simulation-home');
  await click('simulation-logout');
  await waitFor(`Boolean(${query('persistent-login')})`, 'student signed out');
  await navigate(ready.urls.staff, `Boolean(${query('staff-open')})`, 'landing with staff entry');
  await click('staff-open');
  await waitFor(`Boolean(${query('staff-login')})`, 'staff login');
  await evaluate(`(()=>{const s=${query('actor-select')};s.value='reviewer';s.dispatchEvent(new Event('change',{bubbles:true}));return s.value})()`);
  await click('staff-login');
  await click('staff-review-queue');
  await waitFor(`${query('staff-state-filter')}?.value==='IN_REVIEW'&&${query('staff-question-list')}?.querySelectorAll('li.staff-question-item').length===3`, 'three queued versions');
  await capture('07-staff-review-queue');
  report.checks.push('Staff reviewer queue lists the 3 unpublished IN_REVIEW versions; every delivered student item was a published rehearsal item');
  await click('staff-logout');
} catch (error) {
  process.stderr.write(`${error.stack}\n--- launcher\n${launcherLog.slice(-3000)}\n--- browser\n${browserLog.slice(-1500)}\n`);
  process.exitCode = 1;
} finally {
  socket?.close();
  await stop(browser);
  if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
  // 6. Ctrl+C: the launcher must exit by itself and leave no process, port or folder behind.
  if (launcher && launcher.exitCode === null && launcher.signalCode === null) {
    launcher.kill('SIGINT');
    const exited = await Promise.race([once(launcher, 'close').then(() => true), delay(30_000).then(() => false)]);
    if (!exited) { await stop(launcher, 'SIGKILL'); process.exitCode = 1; process.stderr.write('Launcher ignored Ctrl+C\n'); }
  }
  report.launcherExitCode = launcher?.exitCode ?? null;
  const orphans = [...ownedProcesses()].filter(([pid]) => !baselineProcesses.has(pid)).map(([, line]) => line);
  const leftovers = [...await demoDirectories()].filter((name) => !baselineDirectories.has(name));
  const listening = await fetch(`http://127.0.0.1:${port}/local/demo-notice`, { signal: AbortSignal.timeout(2_000) }).then(() => true, () => false);
  report.cleanup = { orphans, leftovers, listening };
  if (report.launcherExitCode !== 0 || orphans.length || leftovers.length || listening) {
    process.exitCode = 1;
    process.stderr.write(`Cleanup check failed: ${JSON.stringify(report.cleanup)} exit=${report.launcherExitCode}\n`);
  } else if (process.exitCode !== 1) {
    report.checks.push('Ctrl+C stopped the launcher with exit code 0; no owned process, listening port or demo folder remained');
  }
  report.status = process.exitCode === 1 ? 'FAIL' : 'PASS';
  await writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
