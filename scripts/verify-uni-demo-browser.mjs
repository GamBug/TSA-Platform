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

// A per-run password replaces the owner's for this check; the account name is the real one.
const ADMIN_CHECK_PASSWORD = `rehearsal-${process.pid}-${Date.now()}`;
// React-controlled inputs need the native value setter plus an input event.
const typeInto = (testId, value) => evaluate(`(()=>{const el=${query(testId)};const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return el.value.length})()`);
const chooseOption = (testId, value) => evaluate(`(()=>{const el=${query(testId)};const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('change',{bubbles:true}));return el.value})()`);

try {
  // 1. One command starts the database, the server and the staff and student URLs.
  launcher = spawn(process.execPath, ['scripts/start-uni-demo.mjs', '--rehearsal'], {
    cwd: ROOT, env: { ...process.env, DEMO_UNI_PORT: port, DEMO_ADMIN_PASSWORD: ADMIN_CHECK_PASSWORD }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  assert.equal(ready.fullSimulationsWithoutRepeats, 2, "the rehearsal stock holds two full tests without repeats since 9f21e78");
  Object.assign(report, { urls: ready.urls, published: ready.published, fullSimulationsWithoutRepeats: ready.fullSimulationsWithoutRepeats });
  assert.match(launcherLog, /Content mode: REHEARSAL/);
  report.checks.push('One command printed the stock report and the student, full-simulation and admin URLs');

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

  // 2. Student catalog in the React student app with the three notices.
  const answerOnScreen = async (label) => {
    const option = await evaluate(`(document.querySelector('#question-title')?.innerText.match(/nêu nhãn ([ABC])\./)||[])[1]?.toLowerCase()??''`);
    assert.ok(option, `${label}: rehearsal item states its label`);
    await click(`option-${option}`);
    await waitFor(`/^Đã lưu/.test(${query('save-status')}?.textContent??'')`, `${label} saved`);
  };
  await navigate(ready.urls.student, `Boolean(${query('guest-start')})`, 'student start screen');
  assert.equal(await evaluate(`Boolean(${query('login-studentA')})`), false, 'the synthetic A/B accounts are not offered');
  await click('guest-start');
  await waitFor(`document.querySelectorAll('[data-testid="catalog-item"]').length===3`, 'student catalog');
  const catalogNotice = await readNotice('catalog');
  assert.match(catalogNotice, /Luyện tập không chính thức — không liên kết với Đại học Bách khoa Hà Nội \(HUST\)\./);
  assert.match(catalogNotice, /Dự án phi lợi nhuận: không quảng cáo, không thu phí\./);
  assert.match(catalogNotice, /Nguồn nội dung: Câu hỏi tổng hợp do dự án tự biên soạn để diễn tập/);
  assert.match(catalogNotice, /DIỄN TẬP · NỘI DUNG TỔNG HỢP/);
  await capture('01-student-catalog-notices');
  report.checks.push('React student app catalog shows three section profiles and the unofficial/not-affiliated, non-profit and content-source notices with the rehearsal label');

  // 3. Section practice (topic practice is paused), answered correctly, to a released result.
  await click('start-MATH');
  await waitFor(`Boolean(${query('attempt-workspace')})&&Boolean(document.querySelector('#question-title'))`, 'practice attempt started');
  const practiceAttempt = await activeAttempt('v1');
  for (const [position] of practiceAttempt.slots.entries()) {
    if (position) await click('question-next');
    await answerOnScreen(`practice answer ${position + 1}`);
  }
  await click('submit-open');
  await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'practice result released', 30_000);
  const practiceResult = await evaluate(`fetch('/api/v1/attempts/${practiceAttempt.attemptId}/result').then(r=>r.json())`);
  assert.equal(practiceResult.correctCount, practiceResult.totalCount);
  assert.equal(await evaluate(`Boolean(${query('result')}.querySelector('[data-testid="demo-notice"]'))`), true, 'notice sits on the result page');
  await readNotice('practice result');
  await capture('03-section-practice-result');
  report.checks.push(`Section practice: ${practiceResult.totalCount} published Mathematics items answered, submitted and graded ${practiceResult.correctCount}/${practiceResult.totalCount}; notices visible on the result page`);

  // 4. Full simulation: three sections, return navigation, per-section and total correct counts.
  await navigate(ready.urls.simulation, `Boolean(${query('simulation-create')})`, 'full-simulation offering');
  await readNotice('simulation offering');
  await capture('04-full-simulation-offering');
  await click('simulation-create');
  await click('demo-start');
  await waitFor(`Boolean(${query('section-math')})&&Boolean(document.querySelector('#question-title'))`, 'mathematics opened');
  const plan = [['math', 3, 40], ['reading', 2, 20], ['science', 1, 40]];
  let simulationId;
  for (const [sectionId, answers, total] of plan) {
    if (sectionId !== 'math') {
      await click(`section-${sectionId}`);
      await waitFor(`${query(`section-${sectionId}`)}?.getAttribute('aria-selected')==='true'&&Boolean(document.querySelector('#question-title'))`, `${sectionId} opened`);
    }
    const view = await activeAttempt('v3');
    simulationId = view.attemptId;
    assert.equal(view.slots.filter((slot) => slot.sectionId === sectionId).length, total);
    for (let position = 0; position < answers; position++) {
      if (position) await click('question-next');
      await answerOnScreen(`${sectionId} answer ${position + 1}`);
    }
  }
  await click('section-math');
  await waitFor(`/Đang tính giờ/.test(${query('section-math')}?.innerText??'')`, 'returned to mathematics with time remaining');
  await capture('05-full-simulation-in-progress');
  await click('submit-open');
  await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'simulation result released', 30_000);
  assert.equal((await evaluate(`${query('result-score')}.innerText`)).replace(/\s+/g, ''), '6/100');
  for (const [sectionId, answers, total] of plan) {
    assert.match(await evaluate(`${query(`result-${sectionId}`)}.innerText`), new RegExp(`${answers}/${total}$`));
  }
  await readNotice('simulation result');
  await capture('06-full-simulation-result');
  report.simulationAttemptId = simulationId;
  report.checks.push('Full simulation: 100 questions, three section clocks, return to Mathematics, result 6/100 with Mathematics 3/40, Reading 2/20, Science 1/40; notices visible');

  // 5. Admin page: the whole Bank, including the unpublished versions students never see.
  await click('logout');
  await waitFor(`Boolean(${query('guest-start')})`, 'student signed out');
  assert.equal(await evaluate(`Boolean(${query('admin-link')})`), true, 'the local start screen links to the admin page');
  await navigate(ready.urls.admin, `Boolean(${query('admin-login')})`, 'admin sign-in');
  await typeInto('admin-username', 'AdminBao');
  await typeInto('admin-password', 'not-the-password');
  await click('admin-submit');
  await waitFor(`/Wrong username or password/.test(${query('admin-login-message')}?.innerText??'')`, 'wrong password refused');
  await typeInto('admin-password', ADMIN_CHECK_PASSWORD);
  await click('admin-submit');
  await waitFor(`Boolean(${query('admin-question-list')})&&${query('admin-question-list')}.querySelectorAll('[data-testid="admin-question-item"]').length>0`, 'admin question list');
  await chooseOption('admin-filter-state', 'DRAFT');
  await waitFor(`${query('admin-question-list')}.querySelectorAll('[data-testid="admin-question-item"]').length===5`, 'five unpublished versions (drafts and versions in review)');
  const listedId = await evaluate(`${query('admin-question-id')}?.innerText??''`);
  assert.match(listedId, /^(Q-[0-9A-F]{8}|[A-Z]+-[A-Z0-9]+-\d{6})$/, 'each listed question shows its id');
  await click('admin-question-item');
  await waitFor(`Boolean(${query('admin-answer')}?.querySelector('[data-correct="true"]'))`, 'question with its marked answer key');
  assert.equal(await evaluate(`${query('admin-detail-id')}?.innerText??''`), listedId, 'the open question shows the same id');
  await typeInto('admin-search', listedId);
  await waitFor(`${query('admin-question-list')}.querySelectorAll('[data-testid="admin-question-item"]').length>=1`, 'search by question id');
  await capture('07-admin-unpublished-question');
  await click('admin-tab-inbox');
  await waitFor(`Boolean(${query('admin-no-bank')})`, 'rehearsal has no real Bank to import into');
  await click('admin-tab-ai');
  await waitFor(`Boolean(${query('admin-ai-steps')})||Boolean(${query('admin-ai')})`, 'AI questions tab');
  report.checks.push('Admin page: AdminBao signs in (a wrong password is refused), sees all versions in three states (the 3 in review count as DRAFT) with ids, finds one by its id and sees the marked answer key; rehearsal blocks imports');
  await click('admin-logout');
  await waitFor(`Boolean(${query('admin-login')})`, 'admin signed out');
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
