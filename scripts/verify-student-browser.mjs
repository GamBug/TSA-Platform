// Real PostgreSQL/browser journey using only disposable postmaster-scoped fixtures.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runNewOnlyJourney } from './student-new-only-journey.mjs';
import { runAllocationRaceJourney } from './student-allocation-race-journey.mjs';
import { runAdmissionJourney } from './student-admission-journey.mjs';
import { runWarningResumeJourney } from './student-warning-resume-journey.mjs';
import { runReservationJourney } from './student-reservation-journey.mjs';
import { runRateLimitExpiryJourney } from './student-rate-limit-expiry-journey.mjs';
import { runRateLimitJourney } from './student-rate-limit-journey.mjs';
import { runReadingJourney } from './student-reading-journey.mjs';
import { createSharedReadingFixture } from '../tests/integration/student-runtime/shared-reading-fixture.mjs';
import { runDomainJourney } from './student-domain-journey.mjs';
import { createDomainStudentFixture } from '../tests/integration/student-runtime/domain-fixture.mjs';
import { createMixedStudentFixture } from '../tests/integration/student-runtime/mixed-fixture.mjs';
import { createStudentRuntime } from '../src/local/student.mjs';
import { createDatabasePool } from '../src/modules/database/pool.mjs';
import { createSourceService } from '../src/modules/sources/service.mjs';

const newOnlyTest = process.env.STUDENT_NEW_ONLY_TEST === 'true';
const allocationRaceTest = process.env.STUDENT_ALLOCATION_RACE_TEST === 'true';
const admissionTest = process.env.STUDENT_ADMISSION_TEST === 'true';
const warningResumeTest = process.env.STUDENT_WARNING_RESUME_TEST === 'true';
const reservationLateTest = process.env.STUDENT_RESERVATION_LATE_TEST === 'true';
const reservationTest = process.env.STUDENT_RESERVATION_TEST === 'true' || reservationLateTest;
const expiryTest = process.env.STUDENT_EXPIRY_TEST === 'true';
const accessibilityTest = process.env.STUDENT_ACCESSIBILITY_TEST === 'true';
const closedSaveTest = process.env.STUDENT_CLOSED_SAVE_TEST === 'true';
const rateLimitExpiryTest = process.env.STUDENT_RATE_LIMIT_EXPIRY_TEST === 'true';
const rateLimitTest = process.env.STUDENT_RATE_LIMIT_TEST === 'true' || rateLimitExpiryTest;
const rateScope = process.env.STUDENT_RATE_LIMIT_SCOPE ?? 'USER_SAVE';
if (rateLimitTest) assert.ok(['USER_SAVE', 'ATTEMPT_SAVE'].includes(rateScope), 'explicit supported rate scope');
const readingTest = process.env.STUDENT_READING_TEST === 'true';
const domainsTest = process.env.STUDENT_DOMAINS_TEST === 'true';
assert.ok([newOnlyTest, allocationRaceTest, admissionTest, warningResumeTest, reservationTest, expiryTest, accessibilityTest, closedSaveTest, domainsTest, readingTest, rateLimitTest].filter(Boolean).length <= 1, 'browser scenario modes run separately');
const defaultArtifacts = newOnlyTest ? '/tmp/tsa-student-browser-evidence/new-only' : allocationRaceTest ? '/tmp/tsa-student-browser-evidence/allocation-race' : admissionTest ? '/tmp/tsa-student-browser-evidence/admission' : warningResumeTest ? '/tmp/tsa-student-browser-evidence/warning-resume' : reservationTest ? `/tmp/tsa-student-browser-evidence/reservation${reservationLateTest ? '-late' : ''}` : rateLimitTest ? `/tmp/tsa-student-browser-evidence/rate-limit-${rateLimitExpiryTest ? 'expiry-' : ''}${rateScope.toLowerCase()}` : readingTest ? '/tmp/tsa-student-browser-evidence/reading' : domainsTest ? '/tmp/tsa-student-browser-evidence/domains' : closedSaveTest ? '/tmp/tsa-student-browser-evidence/closed-save' : accessibilityTest
  ? '/tmp/tsa-student-browser-evidence/accessibility'
  : expiryTest ? '/tmp/tsa-student-browser-evidence/expiry' : '/tmp/tsa-student-browser-evidence';
const artifacts = path.resolve(process.env.STUDENT_ARTIFACT_DIR ?? defaultArtifacts);
const profile = await mkdtemp(path.join(tmpdir(), 'tsa-student-browser-'));
let fixture, workerPool, runtime, browser, socket, browserSocket, secondSocket, secondTargetId, browserError, expiryAttemptId;
let sequence = 0, browserLog = '';
const pending = new Map(), errors = [], requests = [], requestRecords = [], responseRecords = [], responseChecks = [];
let checkedResponses = 0;
let browserCommand, secondCommand, secondEvaluate, secondWaitFor, secondClick;
const report = { checks: [], screenshots: [] };
const keyboardTrace = [], focusFailures = [];
const workerState = { available: true };
const timeout = setTimeout(() => { browser?.kill('SIGKILL'); socket?.close(); }, 120000);
timeout.unref();
function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
function commandChannel(targetSocket) {
  let channelSequence = 0;
  const channelPending = new Map();
  targetSocket.addEventListener('message', ({ data: raw }) => {
    const data = JSON.parse(raw);
    if (!data.id) return;
    const task = channelPending.get(data.id);
    if (!task) return;
    channelPending.delete(data.id);
    data.error ? task.reject(new Error(data.error.message)) : task.resolve(data.result);
  });
  return (method, params = {}) => {
    const id = ++channelSequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { channelPending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
      channelPending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      targetSocket.send(JSON.stringify({ id, method, params }));
    });
  };
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, label) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    try { if (await evaluate(expression)) return; }
    catch (error) { if (!/context.*(destroyed|not found)|Cannot find context/i.test(error.message)) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out: ${label}`);
}
const query = (id) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
function observePage(targetSocket, sendCommand) {
  const network = new Map();
  targetSocket.addEventListener('message', ({ data: raw }) => {
    const data = JSON.parse(raw);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (data.method === 'Network.requestWillBeSent') {
      requests.push(data.params.request.url);
      requestRecords.push({ url: data.params.request.url, method: data.params.request.method });
    }
    if (data.method === 'Network.responseReceived') {
      responseRecords.push({ url: data.params.response.url, status: data.params.response.status });
    }
    if (data.method === 'Network.responseReceived' && /\/api\/v1\//.test(data.params.response.url)) {
      network.set(data.params.requestId, data.params.response);
    }
    if (data.method === 'Network.loadingFinished' && network.has(data.params.requestId)) {
      const response = network.get(data.params.requestId); network.delete(data.params.requestId);
      responseChecks.push(sendCommand('Network.getResponseBody', { requestId: data.params.requestId }).then((body) => {
        const value = JSON.parse(body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body);
        if (!response.url.endsWith('/result') || response.status !== 200) checkPrivate(value);
        checkedResponses += 1;
      }).catch((error) => { errors.push(`Response verification: ${error.message}`); }));
    }
  });
}
async function click(id) {
  await waitFor(`Boolean(${query(id)} && !${query(id)}.disabled && ${query(id)}.getBoundingClientRect().height)`, id);
  const point = await evaluate(`(()=>{const e=${query(id)};const t=e.matches('input')?e.closest('label')??e:e;t.scrollIntoView({block:'center'});const r=t.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
async function capture(name) {
  await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'no horizontal overflow');
  const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const filename = path.join(artifacts, `${name}.png`);
  await writeFile(filename, Buffer.from(result.data, 'base64')); report.screenshots.push(filename);
}
function checkPrivate(value) {
  const forbidden = new Set(['answerKey', 'correctAnswer', 'explanation', 'provenance', 'reviewNotes', 'keySnapshot', 'privateHash']);
  function visit(item) {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) { assert.equal(forbidden.has(key), false, `private field before authorized result: ${key}`); visit(child); }
  }
  visit(value);
}
async function pressKey(key, { shift = false } = {}) {
  const keys = {
    Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
    Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: String.fromCharCode(13) },
    ' ': { code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
    Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
    ArrowDown: { code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  };
  const definition = keys[key];
  assert.ok(definition, `supported keyboard key ${key}`);
  const modifiers = shift ? 8 : 0;
  const { text, ...physical } = definition;
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers, ...physical, ...(text ? { text } : {}) });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers, ...physical });
}
async function focusSnapshot() {
  return evaluate(`(()=>{
    const element=document.activeElement;
    const visual=element.matches('input')?element.closest('label')||element:element;
    const rect=visual.getBoundingClientRect(), style=getComputedStyle(visual), elementStyle=getComputedStyle(element);
    const testId=element.dataset?.testid||null;
    return {testId,id:element.id||null,tag:element.tagName,role:element.getAttribute('role'),
      name:element.getAttribute('aria-label')||element.innerText?.slice(0,80)||element.value||'',
      dialog:element.closest('dialog')?.id||null,
      visible:element.isConnected&&style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0
        &&rect.right>0&&rect.left<innerWidth&&rect.bottom>0&&rect.top<innerHeight,
      horizontallyVisible:rect.left>=-1&&rect.right<=innerWidth+1,
      ringOnElement:elementStyle.outlineStyle!=='none'&&parseFloat(elementStyle.outlineWidth)>0,
      ringOnVisibleLabel:visual!==element&&style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>0,
      viewportWidth:innerWidth};
  })()`);
}
async function recordFocus(label, expected = null) {
  const actual = await focusSnapshot();
  keyboardTrace.push({ label, ...actual });
  assert.equal(actual.visible, true, `${label}: focused control is visible in the 640 CSS px reflow view`);
  assert.equal(actual.horizontallyVisible, true, `${label}: focused control is not horizontally clipped`);
  if (expected) {
    const matches = actual.testId === expected || actual.id === expected;
    if (!matches) focusFailures.push({ label, expected, actual: actual.testId ?? actual.id ?? actual.tag });
  }
  return actual;
}
async function tabTo(testId, label = testId, maxTabs = 100, reverse = false) {
  for (let index = 0; index < maxTabs; index++) {
    await pressKey('Tab', { shift: reverse });
    const focus = await recordFocus(`Tab ${label}`);
    if (focus.testId === testId) return focus;
  }
  throw new Error(`Tab could not reach ${testId} (${label})`);
}
async function assertAx(role, namePart, label = `${role} named ${namePart}`) {
  const { nodes } = await command('Accessibility.getFullAXTree');
  const matches = nodes.filter((node) => !node.ignored && node.name?.value?.includes(namePart));
  const found = matches.some((node) => node.role?.value === role);
  report.axChecks ??= [];
  report.axChecks.push({ role, namePart, passed: found, label, observed: matches.map((node) => ({ role: node.role?.value, name: node.name?.value })) });
  assert.ok(found, `Chromium accessibility tree exposes ${label}; matching nodes: ${JSON.stringify(matches.map((node) => ({ role: node.role?.value, name: node.name?.value })))}`);
}
async function assertReflow(label) {
  const layout = await evaluate(`(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,
    bodyWidth:document.body.scrollWidth,appWidth:document.querySelector('#app').scrollWidth,
    rootWidth:document.querySelector('#app').clientWidth}))()`);
  assert.equal(layout.width, 640, `${label}: CSS viewport uses the 640 px half-width reflow view`);
  assert.ok(layout.documentWidth <= layout.width && layout.bodyWidth <= layout.width
    && layout.appWidth <= layout.rootWidth + 1, `${label}: no horizontal page/app overflow (${JSON.stringify(layout)})`);
  return layout;
}
async function runAccessibilityJourney() {
  report.accessibilityScope = 'Supplementary Chromium accessibility-tree smoke checks; no screen-reader or WCAG conformance claim.';
  const initialWidth = await evaluate('innerWidth');
  assert.equal(initialWidth, 1280, 'the baseline is a 1280 CSS px desktop viewport');
  const loginFocus = await recordFocus('initial login screen');
  assert.equal(loginFocus.tag, 'H1', 'the login screen initially focuses its heading');
  await assertAx('button', 'Đăng nhập hồ sơ tổng hợp A', 'synthetic candidate A login button');
  await assertAx('button', 'Đăng nhập hồ sơ tổng hợp B', 'synthetic candidate B login button');
  await evaluate(`(()=>{window.__accessibilityKeyEvents=[];for(const type of ['keydown','keyup','click'])document.addEventListener(type,event=>window.__accessibilityKeyEvents.push({type,key:event.key,trusted:event.isTrusted,testId:event.target?.dataset?.testid||null}),true)})()`);
  await tabTo('persistent-login-studentA', 'candidate login');
  await pressKey('Enter');
  await waitFor(`Boolean(${query('catalog-panel')})`, 'keyboard login reaches the real PostgreSQL catalog');
  await recordFocus('candidate login asynchronous catalog redraw', 'catalog-title');
  await assertAx('heading', 'Chọn một bài luyện tập', 'catalog heading');
  await assertAx('button', 'Bắt đầu bài luyện tập', 'available catalog start button');

  await command('Emulation.setDeviceMetricsOverride', { width: 640, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor('innerWidth===640', '640 CSS px half-width reflow-equivalent viewport');
  const catalogLayout = await assertReflow('catalog');
  report.reflow = { method: '640 CSS px viewport at deviceScaleFactor 1 after a 1280 CSS px baseline; half-width reflow-equivalent, not browser page zoom', catalogLayout };
  await capture('keyboard-reflow-catalog');
  await tabTo('demo-start', 'catalog start');
  await pressKey('Enter');
  await waitFor(`Boolean(document.getElementById('question-title'))`, 'keyboard start opens a persisted attempt');
  await recordFocus('start asynchronous exam redraw', 'question-title');
  const view = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json())`);
  assert.equal(view.state, 'IN_PROGRESS');
  assert.equal(view.slots.length, 4);
  checkPrivate(view);
  const attemptId = view.attemptId;
  const slots = view.slots;
  await assertReflow('exam');
  assert.equal(await evaluate('document.body.innerText.includes("Bảng dữ liệu tổng hợp") && document.body.innerText.includes("x bình phương cộng một")'), true,
    'the 640 px view retains the semantic table caption and math alternative');
  await assertAx('table', 'Bảng dữ liệu tổng hợp', 'semantic table with caption');
  await assertAx('columnheader', 'x', 'table column header');
  await assertAx('StaticText', 'x bình phương cộng một', 'math accessible alternative');
  await capture('keyboard-reflow-exam');
  await tabTo('exam-catalog', 'exam navigation to catalog');
  await recordFocus('catalog exit is keyboard reachable');
  await tabTo('submit-open', 'submit navigation');
  await pressKey('Enter');
  await waitFor("document.getElementById('submit-dialog')?.open", 'keyboard opens native submit confirmation dialog');
  let focus = await recordFocus('submit dialog opens');
  assert.equal(focus.dialog, 'submit-dialog', 'opening the dialog places focus inside it');
  await assertAx('dialog', 'Nộp bài luyện tập', 'named native submit dialog');
  await assertAx('button', 'Xác nhận nộp', 'submit confirmation button');
  for (let index = 0; index < 6; index++) {
    await pressKey('Tab');
    focus = await recordFocus(`submit dialog Tab containment ${index + 1}`);
    assert.equal(focus.dialog, 'submit-dialog', 'Tab focus remains contained by the modal dialog');
  }
  for (let index = 0; index < 6; index++) {
    await pressKey('Tab', { shift: true });
    focus = await recordFocus(`submit dialog Shift+Tab containment ${index + 1}`);
    assert.equal(focus.dialog, 'submit-dialog', 'Shift+Tab focus remains contained by the modal dialog');
  }
  await pressKey('Escape');
  await waitFor("!document.getElementById('submit-dialog')?.open", 'Escape closes submit dialog');
  await recordFocus('submit dialog Escape restoration', 'submit-open');

  async function advanceQuestion(index) {
    await tabTo('question-next', `navigation to question ${index + 1}`);
    await pressKey('Enter');
    await waitFor(`${query('question-counter')}.textContent.includes('Câu ${index + 1} /')`, `keyboard navigation to question ${index + 1}`);
    await recordFocus(`question ${index + 1} navigation redraw`, 'question-title');
  }
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (index > 0) await advanceQuestion(index);
    if (slot.interaction.type === 'SINGLE_CHOICE') {
      await assertAx('radio', 'Phương án tổng hợp a', 'single-choice radio with its label');
      await tabTo('option-a', `single-choice radio group at slot ${index + 1}`);
      await pressKey('ArrowDown');
      await waitFor(`Boolean(${query('option-b')}.checked && ${query('save-status')}.classList.contains('saved'))`, 'keyboard SC save acknowledgement');
      await recordFocus(`single-choice slot ${index + 1} acknowledged asynchronous redraw`, 'option-b');
      const saved = await fixture.pool.query('SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId]);
      assert.equal(saved.rowCount, 1); assert.equal(saved.rows[0].value.optionId, 'b'); assert.equal(saved.rows[0].revision, '1');
    } else if (slot.interaction.type === 'MULTIPLE_CHOICE') {
      assert.equal(slot.interaction.minSelections, 2);
      await assertAx('checkbox', 'Phương án tổng hợp a', 'multiple-choice checkbox with its label');
      await tabTo('option-a', 'multiple-choice first checkbox');
      await pressKey(' ');
      await waitFor(`Boolean(${query('multiple-choice-unsaved')})`, 'one keyboard MC choice stays visibly unsaved');
      assert.equal(await evaluate(`Boolean(${query('multiple-choice-unsaved')}) && ${query('submit-open')}.disabled && ${query('question-next')}.disabled`), true,
        'an incomplete MC draft is visibly unsaved and blocks navigation/submission');
      assert.equal((await fixture.pool.query('SELECT 1 FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId])).rowCount, 0,
        'a below-minimum MC draft is not persisted');
      await recordFocus('multiple-choice local draft redraw', 'option-a');
      await tabTo('option-c', 'multiple-choice second checkbox');
      await pressKey(' ');
      await waitFor(`Boolean(${query('option-c')}.checked && ${query('save-status')}.classList.contains('saved') && !${query('multiple-choice-unsaved')})`,
        'keyboard MC selection reaches minimum and is acknowledged');
      await recordFocus('multiple-choice acknowledged asynchronous redraw', 'option-c');
      const saved = await fixture.pool.query('SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId]);
      assert.equal(saved.rowCount, 1); assert.deepEqual(saved.rows[0].value.optionIds, ['a', 'c']);
    } else if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
      await assertAx('radio', 'Mệnh đề tổng hợp một: Đúng', 'true/false radio with its accessible label');
      await tabTo('tf-s1-true', 'first true/false radio');
      await pressKey(' ');
      await waitFor(`Boolean(${query('tf-s1-true')}.checked && ${query('save-status')}.classList.contains('saved'))`, 'keyboard true/false first statement save');
      await recordFocus('first true/false acknowledged asynchronous redraw', 'tf-s1-true');
      await tabTo('tf-s2-true', 'second true/false radio group entry');
      await pressKey('ArrowDown');
      await waitFor(`Boolean(${query('tf-s2-false')}.checked && ${query('save-status')}.classList.contains('saved'))`, 'ArrowDown selects and saves the second true/false value');
      await recordFocus('second true/false acknowledged asynchronous redraw', 'tf-s2-false');
      const saved = await fixture.pool.query('SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId]);
      assert.equal(saved.rowCount, 1);
      assert.deepEqual(saved.rows[0].value, { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false } });
    } else {
      assert.fail(`Unexpected mixed-fixture interaction ${slot.interaction.type}`);
    }
  }
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.answers WHERE attempt_id=$1', [attemptId])).rows[0].n, 4,
    'all four question slots have acknowledged PostgreSQL answers');
  await assertReflow('all native input types');

  await tabTo('submit-open', 'keyboard submit action', 100, true);
  await pressKey('Enter');
  await waitFor("document.getElementById('submit-dialog')?.open", 'keyboard reopens submit confirmation dialog');
  focus = await recordFocus('submit dialog reopened');
  assert.equal(focus.dialog, 'submit-dialog');
  if (focus.testId !== 'submit-confirm') await tabTo('submit-confirm', 'explicit keyboard submission confirmation');
  await pressKey('Enter');
  await waitFor(`Boolean(${query('grading-pending')})`, 'keyboard confirmation submits persisted answers');
  await recordFocus('submitted pending-grade asynchronous redraw', 'pending-grade-title');
  await assertReflow('pending grade');
  await capture('keyboard-reflow-pending');
  workerState.available = true;
  await waitFor(`Boolean(${query('result')})`, 'background grader releases keyboard-submitted result');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /100/);
  await recordFocus('released result asynchronous redraw', 'result-title');
  await assertAx('image', '4 trên 4 câu', 'released score summary image label');
  await assertReflow('released result');
  await capture('keyboard-reflow-result');

  await tabTo('review-open', 'result-to-review navigation');
  await pressKey('Enter');
  await waitFor(`Boolean(${query('review')})`, 'keyboard opens released review');
  await recordFocus('review asynchronous redraw', 'review-title');
  await assertAx('heading', 'Ôn tập', 'released review heading');
  await assertAx('table', 'Bảng dữ liệu tổng hợp', 'released-review semantic table and caption');
  await assertAx('columnheader', 'x', 'released-review column header');
  await assertAx('StaticText', 'x bình phương cộng một', 'released-review math alternative');
  await tabTo('review-explanation-toggle', 'review explanation disclosure');
  await pressKey(' ');
  await waitFor(`${query('explanation')}.open && !${query('review-explanation-pane')}.hidden`, 'keyboard opens released explanation pane');
  await assertReflow('released review explanation');
  await capture('keyboard-reflow-review');
  await tabTo('back-score', 'review-to-result navigation');
  await pressKey('Enter');
  await waitFor(`Boolean(${query('result')})`, 'keyboard returns from review to released result');
  await recordFocus('result redraw after returning from review', 'result-title');

  report.keyboardTrace = keyboardTrace;
  report.focusFailures = focusFailures;
  report.reflow.layout = await assertReflow('final review/result flow');
  report.checks = [
    'Actual candidate login, catalog selection and attempt start use CDP-dispatched Tab/Enter only',
    'Single-choice, minimum-staged multiple-choice and true/false native controls use Space/Arrow keys; PostgreSQL acknowledgements and revisions are verified',
    'Catalog, exam navigation, submit, review and return navigation are reachable by Tab; native modal traps Tab, closes on Escape and restores submit-trigger focus',
    'Released result and review are navigated by keyboard; asynchronous redraw focus is recorded and checked against intended headings/controls',
    '640 CSS px half-width reflow-equivalent viewport has no document/app horizontal overflow or horizontally clipped focused control',
    'Chromium AX tree smoke checks inspect accessible names/roles, table caption/column header and math alternative; this is not screen-reader/WCAG conformance evidence',
  ];
}
try {
  await mkdir(artifacts, { recursive: true });
  fixture = newOnlyTest || allocationRaceTest || admissionTest || warningResumeTest || reservationTest || readingTest || rateLimitTest ? await createSharedReadingFixture({ durationSeconds: warningResumeTest ? 45 : rateLimitExpiryTest ? 8 : 180, bundleCount: newOnlyTest ? 2 : 1 }) : domainsTest ? await createDomainStudentFixture() : await createMixedStudentFixture(expiryTest ? { durationSeconds: 8 } : {});
  assert.equal(fixture.blueprint.config.sections[0].durationSeconds, warningResumeTest ? 45 : (expiryTest || rateLimitExpiryTest) ? 8 : (newOnlyTest || allocationRaceTest || admissionTest || reservationTest || readingTest || rateLimitTest) ? 180 : domainsTest ? 360 : 600,
    'scenario-specific duration is explicit; ordinary mixed fixture retains its default');
  const login = `browser_worker_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${login} LOGIN`); await fixture.pool.query(`GRANT tsa_exam_worker TO ${login}`);
  workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: login });
  const workerProxy = { async connect() {
    if (!workerState.available) throw new Error('Synthetic background worker outage');
    return workerPool.connect();
  } };
  const rate = { capacity: 100, refillPerSecond: 10 };
  const options = { identityPool: fixture.harness.authPool, examPool: fixture.examPool, workerPool: workerProxy,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0, pollMilliseconds: 30,
    sweepBatchSize: 10, executorId: 'student-browser', leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rateLimitTest && rateScope === 'USER_SAVE' ? { capacity: 1, refillPerSecond: rateLimitExpiryTest ? 0.01 : 0.1 } : rate,
      attempt: rateLimitTest && rateScope === 'ATTEMPT_SAVE' ? { capacity: 1, refillPerSecond: rateLimitExpiryTest ? 0.01 : 0.1 } : rate } };
  runtime = await createStudentRuntime(options); workerState.available = false;
  browser = spawn(process.env.STUDENT_BROWSER ?? '/snap/bin/chromium', ['--headless', '--disable-gpu',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.setEncoding('utf8'); browser.stderr.on('data', (chunk) => { browserLog = (browserLog + chunk).slice(-64000); });
  browser.once('error', (error) => { browserError = error; });
  let ws;
  for (let i = 0; i < 200 && !ws; i++) {
    if (browserError) throw browserError;
    ws = browserLog.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (!ws) await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.ok(ws, 'Chromium starts');
  const debug = ws.replace(/^ws:/, 'http:').split('/devtools/')[0];
  report.browser = (await (await fetch(`${debug}/json/version`)).json()).Browser;
  const targets = await (await fetch(`${debug}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  socket.addEventListener('message', ({ data: raw }) => {
    const data = JSON.parse(raw);
    if (data.id) { const task = pending.get(data.id); if (task) { pending.delete(data.id); data.error ? task.reject(new Error(data.error.message)) : task.resolve(data.result); } }
  });
  await once(socket, 'open');
  observePage(socket, command);
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
  browserSocket = new WebSocket(ws);
  await once(browserSocket, 'open');
  browserCommand = commandChannel(browserSocket);
  async function openSecondTab({ expectCatalog = false } = {}) {
    const created = await browserCommand('Target.createTarget', { url: 'about:blank' });
    secondTargetId = created.targetId;
    let target;
    for (let i = 0; i < 100 && !target; i++) {
      target = (await (await fetch(`${debug}/json/list`)).json()).find((item) => item.id === secondTargetId);
      if (!target) await new Promise((resolve) => setTimeout(resolve, 40));
    }
    assert.ok(target, 'second browser tab is discoverable');
    secondSocket = new WebSocket(target.webSocketDebuggerUrl);
    await once(secondSocket, 'open');
    secondCommand = commandChannel(secondSocket);
    observePage(secondSocket, secondCommand);
    secondEvaluate = async (expression) => {
      const result = await secondCommand('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    secondWaitFor = async (expression, label) => {
      const end = Date.now() + 10000;
      while (Date.now() < end) {
        try { if (await secondEvaluate(expression)) return; }
        catch (error) { if (!/context.*(destroyed|not found)|Cannot find context/i.test(error.message)) throw error; }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      throw new Error(`Timed out in second tab: ${label}`);
    };
    secondClick = async (id) => {
      await secondWaitFor(`Boolean(${query(id)} && !${query(id)}.disabled && ${query(id)}.getBoundingClientRect().height)`, id);
      const point = await secondEvaluate(`(()=>{const e=${query(id)};const t=e.matches('input')?e.closest('label')??e:e;t.scrollIntoView({block:'center'});const r=t.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await secondCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await secondCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    };
    await secondCommand('Page.enable'); await secondCommand('Runtime.enable'); await secondCommand('Network.enable');
    await secondCommand('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await secondCommand('Page.navigate', { url: `${runtime.origin}/?student=postgres` });
    await secondWaitFor(expectCatalog ? `Boolean(${query('catalog-grid')})` : "Boolean(document.getElementById('question-title'))", expectCatalog ? 'same candidate opens empty catalog in second tab' : 'same candidate resumes attempt in second tab');
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: `${runtime.origin}/?student=postgres` });
  await waitFor(`Boolean(${query('persistent-login')})`, 'explicit candidate login');
  await capture('candidate-login');
  if (accessibilityTest) {
    await runAccessibilityJourney();
  } else {
    await click('persistent-login-studentA');
    await waitFor(`Boolean(${query('demo-start')})`, 'real catalog');
    if (newOnlyTest) {
      workerState.available = true;
      await runNewOnlyJourney({ evaluate, click, query, waitFor, fixture, capture, report });
    } else if (allocationRaceTest) {
      workerState.available = true;
      await runAllocationRaceJourney({ evaluate, command, click, query, waitFor, fixture, capture, report,
        openSecondTab, second: () => ({ evaluate: secondEvaluate, waitFor: secondWaitFor, click: secondClick, command: secondCommand }) });
    } else if (admissionTest) {
      workerState.available = true;
      await runAdmissionJourney({ evaluate, command, click, query, waitFor, fixture, capture, report, requestRecords });
    } else if (warningResumeTest) {
      workerState.available = true;
      await runWarningResumeJourney({ evaluate, command, click, query, waitFor, fixture, capture, report });
    } else if (reservationTest) {
      await runReservationJourney({ evaluate, command, click, query, waitFor, fixture, capture, report, workerState, requestRecords, late: reservationLateTest });
    } else if (rateLimitTest) {
      workerState.available = !rateLimitExpiryTest;
      const journey = rateLimitExpiryTest ? runRateLimitExpiryJourney : runRateLimitJourney;
      await journey({ evaluate, command, click, query, waitFor, fixture, capture, report, scope: rateScope, workerState });
    } else if (readingTest) {
      workerState.available = true;
      await runReadingJourney({ evaluate, command, click, query, waitFor, fixture, capture, report });
    } else if (domainsTest) {
      workerState.available = true;
      await runDomainJourney({ evaluate, command, click, query, waitFor, fixture, capture, report });
    } else if (closedSaveTest) {
      await click('demo-start');
      await waitFor(`Boolean(document.getElementById('question-title'))`, 'active attempt before another tab submits');
      const view = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json())`);
      checkPrivate(view);
      const index = view.slots.findIndex((slot) => slot.interaction.type === 'SINGLE_CHOICE');
      assert.ok(index >= 0);
      for (let step = 0; step < index; step++) await click('question-next');
      await click('option-b');
      await waitFor(`Boolean(${query('option-b')}.checked && ${query('save-status')}.classList.contains('saved'))`, 'one acknowledged answer before closure');
      const attemptId = view.attemptId, slotId = view.slots[index].slotId;
      const answer = async () => (await fixture.pool.query('SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slotId])).rows[0];
      const before = await answer();
      await openSecondTab();
      workerState.available = false;
      await secondClick('submit-open'); await secondClick('submit-confirm');
      await secondWaitFor(`Boolean(${query('grading-pending')})`, 'another tab closes the exam');
      assert.equal((await fixture.pool.query('SELECT state FROM tsa.attempts WHERE id=$1', [attemptId])).rows[0].state, 'SUBMITTED');
      await command('Page.bringToFront');
      await click('option-c');
      await waitFor(`Boolean(${query('save-error')}) && ${query('save-error')}.textContent.includes('đã đóng')`, 'closed save offers authoritative read');
      assert.match(await evaluate(`${query('save-error-action')}.textContent`), /Tải lại trạng thái/);
      assert.equal(await evaluate(`${query('option-c')}.checked && Boolean(${query('answer-unsaved')}) && ${query('submit-open')}.disabled`), true);
      assert.deepEqual(await answer(), before, 'rejected write cannot mutate closed answers');
      await capture('closed-save-unacknowledged');
      await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none' });
      await click('save-error-action');
      await waitFor(`Boolean(${query('save-error')}) && ${query('save-error')}.textContent.includes('Chưa tải lại')`, 'failed state read keeps pending edit');
      assert.equal(await evaluate(`${query('option-c')}.checked && Boolean(${query('answer-unsaved')})`), true);
      assert.match(await evaluate(`${query('save-error-action')}.textContent`), /Tải lại trạng thái/);
      await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 10000000, uploadThroughput: 10000000, connectionType: 'wifi' });
      await click('save-error-action');
      await waitFor(`Boolean(${query('grading-pending')})`, 'explicit read reaches the authoritative submitted state');
      assert.equal(await evaluate('document.body.innerText.includes("máy chủ đã ghi nhận trước khi đóng bài")'), true);
      assert.equal(await evaluate(`Boolean(${query('option-c')} || ${query('answer-unsaved')})`), false);
      assert.deepEqual(await answer(), before);
      await capture('closed-save-reconciled-pending');
      workerState.available = true;
      await waitFor(`Boolean(${query('result')})`, 'the original frozen answer is graded');
      assert.equal((await fixture.pool.query(`SELECT s.percentage::text AS percentage FROM tsa.attempts a JOIN tsa.score_runs s ON s.id=a.latest_score_id WHERE a.id=$1`, [attemptId])).rows[0].percentage, '25.00');
      assert.deepEqual(await answer(), before);
      const rejected = responseRecords.filter((item) => item.status === 409 && item.url.includes(`/answers/${slotId}`));
      assert.ok(rejected.length >= 1, 'actual PostgreSQL ATTEMPT_CLOSED response observed');
      await browserCommand('Target.closeTarget', { targetId: secondTargetId });
      secondSocket.close(); secondSocket = null; secondTargetId = null;
      await click('persistent-logout'); await click('persistent-login-studentB');
      await waitFor(`Boolean(${query('demo-start')})`, 'second candidate for lost-acknowledgement case');
      await click('demo-start');
      await waitFor(`Boolean(document.getElementById('question-title'))`, 'second independently allocated attempt');
      const nextView = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json())`);
      const nextIndex = nextView.slots.findIndex((slot) => slot.interaction.type === 'SINGLE_CHOICE');
      assert.ok(nextIndex >= 0);
      for (let step = 0; step < nextIndex; step++) await click('question-next');
      await evaluate(`(()=>{const original=window.fetch.bind(window);window.__lostCommittedClosedAck=false;window.fetch=async(input,init={})=>{const response=await original(input,init);if(init.method==='PUT'&&response.ok&&!window.__lostCommittedClosedAck){window.__lostCommittedClosedAck=true;await response.arrayBuffer();throw new TypeError('Synthetic committed save acknowledgement loss');}return response;};})()`);
      await click('option-b');
      await waitFor(`Boolean(${query('save-error')}) && Boolean(${query('answer-unsaved')})`, 'server save commits while this tab loses acknowledgement');
      assert.equal(await evaluate('window.__lostCommittedClosedAck'), true);
      const committed = await fixture.pool.query('SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [nextView.attemptId, nextView.slots[nextIndex].slotId]);
      assert.equal(committed.rows[0].value.optionId, 'b'); assert.equal(committed.rows[0].revision, '1');
      await openSecondTab(); workerState.available = false;
      await secondClick('submit-open'); await secondClick('submit-confirm');
      await secondWaitFor(`Boolean(${query('grading-pending')})`, 'second tab submits the committed but unacknowledged answer');
      await command('Page.bringToFront');
      await click('multiple-choice-discard');
      await waitFor(`Boolean(${query('grading-pending')})`, 'uncertain save reconciliation reaches terminal state');
      assert.equal(await evaluate('document.body.innerText.includes("máy chủ đã ghi nhận trước khi đóng bài")'), true);
      assert.equal(await evaluate('document.body.innerText.includes("không được tính vào kết quả")'), false);
      workerState.available = true;
      await waitFor(`Boolean(${query('result')})`, 'committed unacknowledged answer is scored');
      assert.equal((await fixture.pool.query(`SELECT s.percentage::text AS percentage FROM tsa.attempts a JOIN tsa.score_runs s ON s.id=a.latest_score_id WHERE a.id=$1`, [nextView.attemptId])).rows[0].percentage, '25.00');
      await capture('closed-save-lost-acknowledgement-result');
      report.attemptId = attemptId;
      report.lostAcknowledgementAttemptId = nextView.attemptId;
      report.checks = [
        'A second real browser tab submits; stale first-tab save receives409 and offers authoritative read instead of write retry',
        'A failed offline read preserves unacknowledged choice and offers another read; no closed answer mutation',
        'Successful read reaches submitted/pending state and explains scoring uses server-recorded answers',
        'A committed save with a lost acknowledgement is graded after other-tab submission without a false exclusion claim',
        'Recovery grades the original frozen saved answer25.00%, without accepting the rejected change',
      ];
    } else if (expiryTest) {
    await click('demo-start');
    await waitFor(`Boolean(document.getElementById('question-title'))`, 'persisted short-duration attempt');
    const view = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json())`);
    assert.equal(view.state, 'IN_PROGRESS');
    assert.equal(view.slots.length, 4);
    checkPrivate(view);
    const attemptId = view.attemptId;
    expiryAttemptId = attemptId;
    const singleChoiceIndex = view.slots.findIndex((slot) => slot.interaction.type === 'SINGLE_CHOICE');
    assert.notEqual(singleChoiceIndex, -1, 'mixed fixture contains an SC slot');
    for (let index = 0; index < singleChoiceIndex; index++) {
      await click('question-next');
      await waitFor(`${query('question-counter')}.textContent.includes('Câu ${index + 2} /')`, 'navigate to an SC slot before saving');
    }
    assert.equal(await evaluate(`document.querySelector('.question-instruction')?.textContent.includes('Chọn một phương án')`), true,
      'the saved response is a single-choice answer');
    await click('option-b');
    await waitFor(`${query('option-b')}.checked && ${query('save-status')}.classList.contains('saved')`, 'SC answer acknowledged before expiry');

    const captureDurableState = async () => {
      const [attempt, form, history, answers, digest, jobs] = await Promise.all([
        fixture.pool.query(`SELECT id,form_id,user_id,created_at::text AS created_at,start_before_at::text AS start_before_at,
            started_at::text AS started_at,deadline_at::text AS deadline_at,
            extract(epoch FROM (deadline_at-started_at))*1000 AS duration_ms
          FROM tsa.attempts WHERE id=$1`, [attemptId]),
        fixture.pool.query(`SELECT f.id,f.blueprint_version_id,f.content_hash,f.policy_versions,f.sealed_at::text AS sealed_at,
            ar.manifest_hash,
            (SELECT jsonb_agg(jsonb_build_object('slotId',fs.slot_id,'ordinal',fs.ordinal,'snapshotHash',fs.snapshot_hash)
              ORDER BY fs.ordinal) FROM tsa.form_slots fs WHERE fs.form_id=f.id) AS slots,
            (SELECT jsonb_agg(jsonb_build_object('sectionId',s.section_id,'durationSeconds',s.duration_seconds,'questionCount',s.question_count)
              ORDER BY s.ordinal) FROM tsa.form_sections s WHERE s.form_id=f.id) AS sections
          FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id
          JOIN tsa.assembly_runs ar ON ar.id=f.assembly_run_id WHERE a.id=$1`, [attemptId]),
        fixture.pool.query(`SELECT question_id,first_attempt_id,assigned_at::text AS assigned_at FROM tsa.student_question_history
          WHERE first_attempt_id=$1 ORDER BY question_id`, [attemptId]),
        fixture.pool.query(`SELECT ans.slot_id,ans.value,ans.revision,ans.saved_at::text AS saved_at,
            ans.saved_at<a.deadline_at AS before_deadline
          FROM tsa.answers ans JOIN tsa.attempts a ON a.id=ans.attempt_id WHERE ans.attempt_id=$1 ORDER BY ans.slot_id`, [attemptId]),
        fixture.pool.query('SELECT tsa.exam_grading_input_hash($1) AS input_hash', [attemptId]),
        fixture.pool.query(`SELECT id,kind,dedup_key,payload_ref,attempt_id,state,attempts FROM tsa.jobs
          WHERE attempt_id=$1 AND kind='exam_grade_attempt' ORDER BY id`, [attemptId]),
      ]);
      return { attempt: attempt.rows[0], form: form.rows[0], history: history.rows, answers: answers.rows,
        inputHash: digest.rows[0].input_hash, jobs: jobs.rows };
    };

    const beforeExpiry = await captureDurableState();
    assert.equal(Number(beforeExpiry.attempt.duration_ms), 8_000);
    assert.equal(beforeExpiry.form.sections[0].durationSeconds, 8);
    assert.equal(beforeExpiry.form.slots.length, 4);
    assert.equal(beforeExpiry.history.length, 4, 'all original question-history assignments are present');
    assert.equal(beforeExpiry.answers.length, 1, 'exactly one answer was saved');
    assert.equal(beforeExpiry.answers[0].value.optionId, 'b');
    assert.equal(beforeExpiry.answers[0].revision, '1');
    assert.equal(beforeExpiry.answers[0].before_deadline, true, 'answer acknowledgement precedes the persisted deadline');
    assert.equal(beforeExpiry.jobs.length, 0, 'no grading job exists before deadline reconciliation');

    await command('Page.navigate', { url: 'about:blank' });
    await waitFor(`location.href === 'about:blank'`, 'leave the attempt before its persisted deadline');
    const departure = await fixture.pool.query(`SELECT state,clock_timestamp()<deadline_at AS before_deadline
      FROM tsa.attempts WHERE id=$1`, [attemptId]);
    assert.deepEqual(departure.rows[0], { state: 'IN_PROGRESS', before_deadline: true },
      'the real database clock is still before the original deadline when the page departs');
    const deadlineLimit = Date.now() + 20_000;
    let deadlineReached = false;
    while (!deadlineReached && Date.now() < deadlineLimit) {
      deadlineReached = (await fixture.pool.query(
        'SELECT clock_timestamp() >= $1::timestamptz AS reached', [beforeExpiry.attempt.deadline_at])).rows[0].reached;
      if (!deadlineReached) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(deadlineReached, true, 'the real database clock crossed the persisted deadline while the worker was unavailable');
    const beforeOwnedRead = await fixture.pool.query(`SELECT state FROM tsa.attempts WHERE id=$1`, [attemptId]);
    assert.equal(beforeOwnedRead.rows[0].state, 'IN_PROGRESS', 'no background worker closed the attempt while unavailable');
    assert.equal((await fixture.pool.query(
      "SELECT count(*)::int AS n FROM tsa.jobs WHERE attempt_id=$1 AND kind='exam_grade_attempt'", [attemptId])).rows[0].n, 0,
    'no grading job exists until the candidate performs an owned read');

    const requestCountBeforeReload = requestRecords.length;
    await command('Page.navigate', { url: `${runtime.origin}/?student=postgres` });
    await waitFor(`Boolean(${query('grading-pending')})`, 'same browser session reloads into pending expiry grading');
    const reloadRequests = requestRecords.slice(requestCountBeforeReload);
    assert.ok(reloadRequests.some(({ url, method }) => method === 'GET' && new URL(url).pathname === '/api/v1/attempts'
      && new URL(url).searchParams.has('limit')), 'reload reads candidate-owned attempt history');
    assert.ok(reloadRequests.some(({ url, method }) => method === 'GET' && new URL(url).pathname === `/api/v1/attempts/${attemptId}`),
      'reload reads the candidate-owned attempt after history');
    const afterOwnedRead = await captureDurableState();
    assert.equal(afterOwnedRead.attempt.started_at, beforeExpiry.attempt.started_at);
    assert.equal(afterOwnedRead.attempt.deadline_at, beforeExpiry.attempt.deadline_at);
    assert.deepEqual(afterOwnedRead.form, beforeExpiry.form, 'sealed form and slot snapshot hashes remain unchanged');
    assert.deepEqual(afterOwnedRead.history, beforeExpiry.history, 'original assigned question history remains unchanged');
    assert.deepEqual(afterOwnedRead.answers, beforeExpiry.answers, 'the one acknowledged answer remains frozen');
    assert.equal(afterOwnedRead.inputHash, beforeExpiry.inputHash, 'expiry preserves the original grading-input digest');
    assert.equal(afterOwnedRead.jobs.length, 1, 'owned reconciliation creates exactly one grading job');
    assert.equal(afterOwnedRead.jobs[0].dedup_key,
      `${attemptId}:${afterOwnedRead.form.policy_versions.scoring}:${beforeExpiry.inputHash}`,
    'the queued job is bound to the original attempt digest');
    assert.equal(afterOwnedRead.jobs[0].payload_ref, `attempt:${attemptId}`);
    assert.equal(afterOwnedRead.jobs[0].state, 'QUEUED', 'worker outage leaves the job durably queued');
    const closed = await fixture.pool.query(`SELECT state,closed_at::text AS closed_at,closed_at=deadline_at AS closed_at_is_deadline,
        terminal_reason,grading_status
      FROM tsa.attempts WHERE id=$1`, [attemptId]);
    assert.deepEqual(closed.rows[0], {
      state: 'EXPIRED', closed_at: beforeExpiry.attempt.deadline_at, closed_at_is_deadline: true,
      terminal_reason: 'DEADLINE', grading_status: 'PENDING',
    });

    const pendingDocument = await evaluate('performance.timeOrigin');
    await command('Page.reload', { ignoreCache: true });
    await waitFor(`performance.timeOrigin!==${pendingDocument} && document.readyState==='complete' && Boolean(${query('grading-pending')})`,
      'repeated reload preserves pending expiry state');
    const afterRepeatedRead = await captureDurableState();
    assert.equal(afterRepeatedRead.attempt.started_at, beforeExpiry.attempt.started_at);
    assert.equal(afterRepeatedRead.attempt.deadline_at, beforeExpiry.attempt.deadline_at);
    assert.deepEqual(afterRepeatedRead.form, beforeExpiry.form);
    assert.deepEqual(afterRepeatedRead.history, beforeExpiry.history);
    assert.deepEqual(afterRepeatedRead.answers, beforeExpiry.answers);
    assert.equal(afterRepeatedRead.inputHash, beforeExpiry.inputHash);
    assert.equal(afterRepeatedRead.jobs.length, 1, 'repeat GET/reload does not duplicate expiry work');
    assert.equal(afterRepeatedRead.jobs[0].id, afterOwnedRead.jobs[0].id);
    assert.equal(afterRepeatedRead.jobs[0].dedup_key, afterOwnedRead.jobs[0].dedup_key);

    await capture('expired-pending');
    workerState.available = true;
    await waitFor(`Boolean(${query('result')})`, 'restored real grader releases expiry result');
    assert.match(await evaluate(`${query('result-score')}.textContent`), /25/);
    const graded = await fixture.pool.query(`SELECT a.state,a.grading_status,a.closed_at=a.deadline_at AS closed_at_is_deadline,a.terminal_reason,
        j.id AS job_id,j.state AS job_state,j.dedup_key,s.input_hash,s.correct_count,s.total_count,s.percentage::text AS percentage,
        (SELECT count(*)::int FROM tsa.score_items i WHERE i.score_run_id=s.id) AS score_items,
        (SELECT count(*)::int FROM tsa.result_releases r WHERE r.attempt_id=a.id AND r.revoked_at IS NULL) AS releases
      FROM tsa.attempts a JOIN tsa.jobs j ON j.attempt_id=a.id AND j.kind='exam_grade_attempt'
      JOIN tsa.score_runs s ON s.attempt_id=a.id AND s.id=a.latest_score_id WHERE a.id=$1`, [attemptId]);
    assert.equal(graded.rowCount, 1, 'one grading job and one released score exist');
    assert.deepEqual(graded.rows[0], {
      state: 'GRADED', grading_status: 'SUCCEEDED', closed_at_is_deadline: true,
      terminal_reason: 'DEADLINE', job_id: afterOwnedRead.jobs[0].id, job_state: 'SUCCEEDED',
      dedup_key: afterOwnedRead.jobs[0].dedup_key, input_hash: beforeExpiry.inputHash,
      correct_count: 1, total_count: 4, percentage: '25.00', score_items: 4, releases: 1,
    });
    const afterGrade = await captureDurableState();
    assert.equal(afterGrade.attempt.started_at, beforeExpiry.attempt.started_at);
    assert.equal(afterGrade.attempt.deadline_at, beforeExpiry.attempt.deadline_at);
    assert.deepEqual(afterGrade.form, beforeExpiry.form);
    assert.deepEqual(afterGrade.history, beforeExpiry.history);
    assert.deepEqual(afterGrade.answers, beforeExpiry.answers);
    assert.equal(afterGrade.inputHash, beforeExpiry.inputHash);
    assert.equal(afterGrade.jobs.length, 1, 'worker recovery completes the original job without duplication');
    report.checks = [
      'Opt-in 8-second real blueprint is started and one SC answer is acknowledged before its PostgreSQL deadline',
      'Page departure is verified before deadline; database time crosses it while worker/sweeper access is unavailable',
      'Candidate-owned history/attempt reads during reload reconcile EXPIRED and resume pending status, preserving clocks, sealed form, assignment history, answer and original digest',
      'Repeated reload leaves one queued digest-bound job and does not submit the attempt',
      'Restored grader releases the original 25.00% result with one completed job and unchanged answer/history',
    ];
  } else {
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__holdHistoryNext=false;window.__historyHeld=false;window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname.endsWith('/start')&&init.method==='POST'&&response.ok)window.__holdHistoryNext=true;if(window.__holdHistoryNext&&url.pathname==='/api/v1/attempts'&&(!init.method||init.method==='GET')){window.__holdHistoryNext=false;window.__historyHeld=true;return new Promise(resolve=>{window.__releaseHeldHistory=()=>resolve(response);});}return response;};})()`);
  await click('demo-start');
  await waitFor(`Boolean(document.getElementById('question-title'))`, 'persisted active attempt');
  const view = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json())`);
  assert.equal(view.state, 'IN_PROGRESS'); assert.equal(view.slots.length, 4); checkPrivate(view);
  const attemptId = view.attemptId;
  const clockBefore = await fixture.pool.query('SELECT started_at,deadline_at FROM tsa.attempts WHERE id=$1', [attemptId]);
  assert.equal(await evaluate('document.body.innerText.includes("Bảng dữ liệu tổng hợp")'), true);
  assert.equal(await evaluate('document.body.innerText.includes("x^2 + 1")'), true);
  let dropped = false, offlineSaveVerified = false, conflictVerified = false;
  for (const [index, slot] of view.slots.entries()) {
    if (index) await click('question-next');
    if (slot.interaction.type === 'MULTIPLE_CHOICE') {
      await click('option-a');
      await waitFor(`Boolean(${query('multiple-choice-unsaved')})`, 'visibly unacknowledged multiple-choice draft');
      assert.equal(await evaluate(`${query('submit-open')}.disabled`), true);
      assert.equal(await evaluate(`${query('question-next')}.disabled`), true);
      await click('option-c');
    } else if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
      await click('tf-s1-true'); await waitFor(`Boolean(${query('tf-s1-true')}?.checked && !${query('tf-s2-false')}.disabled)`, 'partial true/false acknowledgement');
      await click('tf-s2-false');
    } else {
      if (!offlineSaveVerified) {
        await evaluate(`(()=>{const original=window.fetch.bind(window);window.__offlineSaveKeys=[];window.fetch=async(input,init={})=>{if(init.method==='PUT')window.__offlineSaveKeys.push(new Headers(init.headers).get('idempotency-key'));return original(input,init);};})()`);
        await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none' });
        await click('option-a');
        await waitFor(`Boolean(${query('save-error')})`, 'offline save remains visibly unconfirmed');
        assert.equal(await evaluate(`${query('option-a')}.checked`), true, 'offline choice remains selected as a draft');
        assert.equal(await evaluate(`Boolean(${query('answer-unsaved')}) && ${query('question-next')}.disabled && ${query('submit-open')}.disabled && ${query('exam-catalog')}.disabled`), true,
          'offline draft blocks navigation, submission and catalog exit');
        const absent = await fixture.pool.query('SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId]);
        assert.equal(absent.rowCount, 0, 'offline save does not claim a server write');
        await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 10000000, uploadThroughput: 10000000, connectionType: 'wifi' });
        await click('save-error-action');
        await waitFor(`!${query('save-error')} && ${query('save-status')}.classList.contains('saved') && ${query('option-a')}.checked`, 'explicit retry is acknowledged after reconnect');
        const offlineKeys = await evaluate('window.__offlineSaveKeys');
        assert.equal(offlineKeys.length, 2); assert.equal(offlineKeys[0], offlineKeys[1], 'offline retry reuses its idempotency key');
        const saved = await fixture.pool.query('SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId]);
        assert.equal(saved.rows[0].value.optionId, 'a'); assert.equal(saved.rows[0].revision, '1');
        offlineSaveVerified = true;
      }
      if (!conflictVerified) {
        await openSecondTab();
        for (let step = 0; step < index; step++) await secondClick('question-next');
        await secondClick('option-c');
        await secondWaitFor(`Boolean(${query('option-c')}.checked && ${query('save-status')}.classList.contains('saved'))`,
          'second tab saves a newer answer revision');
        const secondTabSave = await fixture.pool.query('SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId]);
        assert.equal(secondTabSave.rows[0].value.optionId, 'c'); assert.equal(secondTabSave.rows[0].revision, '2');
        await click('option-b');
        await waitFor(`Boolean(${query('save-error')}) && ${query('save-error')}.textContent.includes('thay đổi ở nơi khác')`,
          'stale first tab presents revision conflict');
        assert.equal(await evaluate(`${query('option-b')}.checked && ${query('question-next')}.disabled && ${query('submit-open')}.disabled && ${query('exam-catalog')}.disabled`), true,
          'conflicted draft remains visible and blocks navigation');
        assert.match(await evaluate(`${query('save-error-action')}.textContent`), /Tải lại/,
          'revision conflict offers explicit reload instead of stale retry');
        const unchanged = await fixture.pool.query('SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId]);
        assert.equal(unchanged.rows[0].value.optionId, 'c'); assert.equal(unchanged.rows[0].revision, '2',
          'conflicting write does not overwrite the second tab answer');
        await click('save-error-action');
        await waitFor(`!${query('save-error')} && !${query('answer-unsaved')} && ${query('option-c')}.checked && !${query('option-b')}.checked`,
          'explicit reload reconciles the preserved server answer');
        const reconciled = await fixture.pool.query('SELECT value,revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId]);
        assert.equal(reconciled.rows[0].value.optionId, 'c'); assert.equal(reconciled.rows[0].revision, '2');
        await browserCommand('Target.closeTarget', { targetId: secondTargetId });
        secondSocket.close(); secondSocket = null; secondTargetId = null;
        conflictVerified = true;
      }
      if (!dropped) {
        const beforeDropped = await fixture.pool.query('SELECT revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId]);
        await evaluate(`(()=>{const original=window.fetch.bind(window);window.__saveKeys=[];window.__dropSave=true;window.fetch=async(input,init={})=>{const r=await original(input,init);if(init.method==='PUT'){window.__saveKeys.push(new Headers(init.headers).get('idempotency-key'));if(window.__dropSave&&r.ok){window.__dropSave=false;throw new TypeError('Synthetic lost successful save response');}}return r;};})()`);
        await click('option-b'); await waitFor(`Boolean(${query('save-error')})`, 'unacknowledged save error');
        const committed = await fixture.pool.query('SELECT revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attemptId, slot.slotId]);
        assert.equal(Number(committed.rows[0].revision), Number(beforeDropped.rows[0]?.revision ?? 0) + 1,
          'lost successful response leaves the committed revision available for exact-key replay');
        await click('save-error-action');
        dropped = true;
      } else {
        await click('option-b');
      }
    }
    await waitFor(`!${query('question-next')}.disabled || Boolean(${query('question-prev')} && !${query('question-prev')}.disabled)`, 'save completes');
    await waitFor(`!${query('multiple-choice-unsaved')} && !${query('save-error')} && ${query('submit-open')} && !${query('submit-open')}.disabled`, 'acknowledged saved state');
  }
  assert.equal(offlineSaveVerified, true, 'offline save failure recovered through explicit retry');
  assert.equal(conflictVerified, true, 'second-tab revision conflict reconciled to the server answer');
  const keys = await evaluate('window.__saveKeys'); assert.ok(keys.length >= 2); assert.equal(keys[0], keys[1]);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.answers WHERE attempt_id=$1', [attemptId])).rows[0].n, 4);
  const savedCount = await evaluate(`${query('answered-count')}.textContent`); assert.match(savedCount, /4\/4/);
  assert.equal(await evaluate('window.__historyHeld'), true);
  await click('exam-catalog'); await click('persistent-logout');
  await click('persistent-login-studentB'); await waitFor(`Boolean(${query('persistent-history')})`, 'candidate B own empty history');
  assert.equal(await evaluate('document.querySelectorAll(".persistent-history-item").length'), 0);
  await evaluate('window.__releaseHeldHistory();new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(await evaluate('document.querySelectorAll(".persistent-history-item").length'), 0,
    'late candidate A history cannot overwrite candidate B after account switch');
  assert.equal(await evaluate(`Boolean(${query('persistent-login')})`), false,
    'stale authentication errors cannot clear the new candidate screen');
  await click('persistent-logout'); await click('persistent-login-studentA');
  await waitFor(`Boolean(document.getElementById('question-title'))`, 'original candidate resumes durable answers');
  const previousDocument = await evaluate('performance.timeOrigin');
  await command('Page.reload', { ignoreCache: true });
  await waitFor(`performance.timeOrigin!==${previousDocument} && document.readyState==='complete' && Boolean(document.getElementById('question-title'))`, 'fresh document resumes durable attempt');
  assert.deepEqual((await fixture.pool.query('SELECT started_at,deadline_at FROM tsa.attempts WHERE id=$1', [attemptId])).rows, clockBefore.rows);
  const timerSeconds = () => evaluate(`(()=>{const parts=${query('timer')}.textContent.split(':').map(Number);return parts.reduce((total,value)=>total*60+value,0)})()`);
  const originalRemaining = await timerSeconds();
  await evaluate('window.__originalDateNow=Date.now;Date.now=()=>window.__originalDateNow()+86400000');
  await command('Emulation.setTimezoneOverride', { timezoneId: 'Pacific/Honolulu' });
  await evaluate('new Promise(resolve=>setTimeout(resolve,1200))');
  const forwardRemaining = await timerSeconds();
  assert.ok(forwardRemaining < originalRemaining && forwardRemaining >= originalRemaining - 4,
    'wall clock forward/timezone change neither extends nor skips countdown');
  await evaluate('Date.now=()=>window.__originalDateNow()-86400000');
  await command('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Bangkok' });
  await evaluate('new Promise(resolve=>setTimeout(resolve,1200))');
  const backwardRemaining = await timerSeconds();
  assert.ok(backwardRemaining < forwardRemaining && backwardRemaining >= forwardRemaining - 4,
    'wall clock backward does not extend countdown');
  await evaluate('Date.now=window.__originalDateNow;delete window.__originalDateNow');
  await capture('persisted-exam-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await capture('persisted-exam-mobile');
  await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('grading-pending')})`, 'persisted submission waits for unavailable worker');
  await capture('grading-pending-mobile');
  workerState.available = true;
  await waitFor(`Boolean(${query('result')})`, 'background grading releases result');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /100/);
  const port = runtime.port; await runtime.close(); runtime = await createStudentRuntime({ ...options, port });
  const previousResultDocument = await evaluate('performance.timeOrigin');
  await command('Page.reload', { ignoreCache: true });
  await waitFor(`performance.timeOrigin!==${previousResultDocument} && document.readyState==='complete' && Boolean(${query('result')})`, 'fresh document retrieves result after HTTP restart');
  await capture('released-result-mobile');
  await click('review-open'); await waitFor(`Boolean(${query('back-score')})`, 'owner released review');
  await capture('released-review-mobile');
  await click('back-score');
  const sources = await createSourceService({ bankPool: fixture.bankPool, identityService: fixture.identityService });
  await sources.registerRightsDecision(fixture.principals.bankManager, fixture.source.sourceVersionId, randomUUID(), {
    status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Disposable browser rights restriction, not human inventory evidence.', expectedRevision: 1,
  });
  await click('review-open'); await waitFor(`Boolean(${query('persistent-blocked')})`, 'fresh revoked review clears content');
  assert.equal(await evaluate('document.body.innerText.includes("Câu hỏi tổng hợp")'), false);
  await click('persistent-logout'); await click('persistent-login-studentB');
  await waitFor(`Boolean(${query('demo-start')})`, 'different candidate catalog');
  const foreign = await evaluate(`fetch('/api/v1/attempts/${attemptId}/result').then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(foreign.status, 404); checkPrivate(foreign.body);
  await click('demo-start'); await waitFor(`Boolean(${query('screen-message')})`, 'honest rights-constrained shortage');
  assert.match(await evaluate(`${query('screen-message')}.textContent`), /Chưa đủ/);
  assert.equal(errors.length, 0, 'no uncaught browser exceptions');
  assert.ok(requests.every((url) => url.startsWith(runtime.origin) || url === 'about:blank'), 'no external requests');
  assert.ok(requests.every((url) => !url.includes('/mock/')), 'PostgreSQL mode never calls mock routes');
  report.checks = ['Explicit candidate login/CSRF rotation; no mock fallback', 'Real mixed-type Bank allocation and safe text/math/table delivery',
    'Offline save remains unsaved and blocked until explicit same-key retry after reconnect',
    'Second-tab revision conflict reload preserves the newer PostgreSQL answer',
    'Lost committed save acknowledgement replays one key; all typed revisions persist', 'MC minimum staging remains unsaved and blocks submit/navigation',
    'Delayed old-account history cannot overwrite a newly authenticated candidate',
    'Reload preserves original PostgreSQL clocks/answers; wall-clock/timezone changes do not extend countdown', 'Unavailable worker leaves durable pending submission; recovery releases 100.00%',
    'HTTP restart preserves session/result; owner review rechecks current rights', 'Revocation clears content; foreign candidate denied; shortage stays explicit',
    'No private fields before authorized result; desktop/mobile no horizontal overflow; no external requests'];
    }
  }
  await Promise.all(responseChecks);
  if (!expiryTest && !accessibilityTest) assert.ok(checkedResponses >= 10, 'actual API response bodies were inspected');
  if (expiryTest) assert.ok(checkedResponses >= 5, 'expiry run inspected multiple actual API response bodies');
  if (accessibilityTest) assert.ok(checkedResponses >= 10, 'accessibility run inspected multiple actual API response bodies');
  assert.equal(errors.length, 0, 'no uncaught browser exceptions');
  assert.ok(requests.every((url) => url.startsWith(runtime.origin) || url === 'about:blank'), 'no external requests');
  assert.ok(requests.every((url) => !url.includes('/mock/')), 'PostgreSQL mode never calls mock routes');
  if (expiryTest) {
    const submitPath = `/api/v1/attempts/${expiryAttemptId}/submit`;
    assert.equal(requestRecords.filter(({ url, method }) => method === 'POST' && new URL(url).pathname === submitPath).length, 0,
      'deadline expiry was reconciled without a POST submit request');
  }
  if (closedSaveTest || domainsTest || readingTest || rateLimitTest || reservationTest || warningResumeTest || admissionTest || allocationRaceTest || newOnlyTest) report.checkedApiResponses = checkedResponses;
  if (accessibilityTest) {
    report.checkedApiResponses = checkedResponses;
    report.keyboardTrace = keyboardTrace;
    report.focusFailures = focusFailures;
    report.requests = requestRecords;
    report.responses = responseRecords;
    assert.deepEqual(focusFailures, [], 'every asynchronous screen redraw preserves focus on its intended heading/control');
  }
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  if (accessibilityTest) {
    report.keyboardTrace = keyboardTrace;
    report.focusFailures = focusFailures;
    report.requests = requestRecords;
    report.responses = responseRecords;
    try {
      report.keyboardEvents = await evaluate('window.__accessibilityKeyEvents');
      report.loginButtonState = await evaluate(`(()=>({activeId:document.activeElement?.dataset?.testid||document.activeElement?.id||document.activeElement?.tagName,
        buttonDisabled:${query('persistent-login-studentA')}?.disabled??null,
        notice:${query('persistent-login-message')}?.textContent??null}))()`);
    } catch {}
    report.error = error.message;
    try { await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2)); } catch {}
  }
  let visible = '';
  try { visible = await evaluate('document.body.innerText.slice(0,2400)'); } catch {}
  process.stderr.write(`${JSON.stringify({ error: error.message, scenarioStage: report.allocationRaceStage, visible, errors }, null, 2)}\n`);
  throw error;
} finally {
  clearTimeout(timeout); secondSocket?.close(); browserSocket?.close(); socket?.close();
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    browser.kill('SIGTERM');
    const exited = await Promise.race([once(browser, 'close').then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 3000))]);
    if (!exited) { browser.kill('SIGKILL'); await once(browser, 'close'); }
  }
  if (runtime) await runtime.close(); if (workerPool) await workerPool.end(); if (fixture) await fixture.close();
  await rm(profile, { recursive: true, force: true });
}
