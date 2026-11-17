// Browser journeys for the React student app (apps/candidate-web) against a disposable rehearsal demo.
// Usage: npm run test:student-web:browser   (STUDENT_BROWSER overrides the Chromium executable)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(ROOT, 'apps/candidate-web/package.json'))('playwright-core');
const port = process.env.STUDENT_WEB_VERIFY_PORT ?? '4182';
const origin = `http://127.0.0.1:${port}`;
const artifacts = path.join(ROOT, 'tmp', 'student-web-browser');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { checks: [], screenshots: [] };

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGINT');
  const done = await Promise.race([once(child, 'close').then(() => true), delay(20_000).then(() => false)]);
  if (!done) { child.kill('SIGKILL'); await once(child, 'close'); }
}

async function journeyPage(browser, viewport, base = origin) {
  const page = await browser.newPage({ viewport });
  const problems = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== base) problems.push(`third-party request: ${url.origin}`);
  });
  const byId = (id) => page.locator(`[data-testid="${id}"]`).first();
  const snap = async (name) => {
    const target = path.join(artifacts, `${name}.png`);
    await page.screenshot({ path: target });
    report.screenshots.push(target);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${name}: no horizontal page scroll (overflow ${overflow}px)`);
  };
  return { page, problems, byId, snap };
}

/** Rehearsal questions name their key in the text ("nêu nhãn B"); choose it so grading is predictable. */
async function answerByNote(page, byId) {
  const text = await page.locator('#question-title').innerText();
  const option = /nhãn ([A-D])/.exec(text)?.[1]?.toLowerCase();
  assert.ok(option, 'rehearsal question names its label');
  await page.locator(`label:has(input[data-testid="option-${option}"])`).click();
  await page.waitForFunction(() => /^Đã lưu/.test(document.querySelector('[data-testid="save-status"]')?.textContent ?? ''), null, { timeout: 10_000 });
}

async function login(byId, actor) {
  await byId(`login-${actor}`).click();
}

async function sectionPractice(browser, viewport, actor, label) {
  const { page, problems, byId, snap } = await journeyPage(browser, viewport);
  await page.goto(`${origin}/student/`);
  await byId(`login-${actor}`).waitFor();
  await login(byId, actor);
  await page.locator('[data-testid="catalog-item"]').first().waitFor();
  assert.match(await byId('demo-notice').innerText(), /không liên kết với Đại học Bách khoa Hà Nội \(HUST\)/);
  assert.match(await byId('demo-notice').innerText(), /DIỄN TẬP · NỘI DUNG TỔNG HỢP/);
  await snap(`${label}-catalog`);
  await byId('start-MATH').click();
  await byId('attempt-workspace').waitFor();
  const count = await page.locator('[data-testid^="question-jump-"]').count();
  for (let position = 0; position < count; position += 1) {
    if (position) await byId('question-next').click();
    await answerByNote(page, byId);
  }
  await snap(`${label}-question`);
  await byId('submit-open').click();
  await byId('submit-confirm').click();
  await byId('result').waitFor({ timeout: 30_000 });
  assert.equal((await byId('result-score').innerText()).replace(/\s+/g, ''), `${count}/${count}`, 'every question graded correct');
  assert.match(await byId('demo-notice').innerText(), /Dự án phi lợi nhuận/);
  await byId('review-open').click();
  await byId('review').waitFor();
  await snap(`${label}-review`);
  assert.deepEqual(problems, []);
  report.checks.push(`${label}: section practice answered ${count}/${count} correct, released review shown`);
  await page.close();
}

async function numericPractice(browser, viewport, actor, label) {
  const { page, problems, byId, snap } = await journeyPage(browser, viewport);
  await page.goto(`${origin}/student/?mode=numeric`);
  await login(byId, actor);
  await byId('start-MATH').click();
  await byId('attempt-workspace').waitFor();
  const count = await page.locator('[data-testid^="question-jump-"]').count();
  for (let position = 0; position < count; position += 1) {
    if (position) await byId('question-next').click();
    const text = await page.locator('#question-title').innerText();
    const value = /nêu số (-?[0-9]+(?:[.,][0-9]+)?)/.exec(text)?.[1];
    assert.ok(value, 'rehearsal numeric question names its number');
    await byId('numeric-answer-input').fill(value);
    await byId('answer-save').click();
    await page.waitForFunction(() => /^Đã lưu/.test(document.querySelector('[data-testid="save-status"]')?.textContent ?? ''), null, { timeout: 10_000 });
  }
  await byId('submit-open').click();
  await byId('submit-confirm').click();
  await byId('result').waitFor({ timeout: 30_000 });
  assert.equal((await byId('result-score').innerText()).replace(/\s+/g, ''), `${count}/${count}`);
  await snap(`${label}-numeric-result`);
  assert.deepEqual(problems, []);
  report.checks.push(`${label}: numeric practice answered ${count}/${count} correct`);
  await page.close();
}

async function fullSimulation(browser, viewport, actor, label) {
  const { page, problems, byId, snap } = await journeyPage(browser, viewport);
  await page.goto(`${origin}/student/?mode=simulation`);
  await login(byId, actor);
  await byId('simulation-home').waitFor();
  await byId('simulation-create').click();
  await byId('demo-start').click();
  await page.locator('#question-title').waitFor();
  const plan = [['math', 3, 40], ['reading', 2, 20], ['science', 1, 40]];
  for (const [section, answers] of plan) {
    if (section !== 'math') {
      await byId(`section-${section}`).click();
      await page.waitForFunction((id) => document.querySelector(`[data-testid="section-${id}"]`)?.getAttribute('aria-selected') === 'true', section);
    }
    for (let position = 0; position < answers; position += 1) {
      if (position) await byId('question-next').click();
      await answerByNote(page, byId);
    }
  }
  await byId('section-math').click();
  await page.waitForFunction(() => /Đang tính giờ/.test(document.querySelector('[data-testid="section-math"]')?.textContent ?? ''));
  await snap(`${label}-simulation`);
  await byId('submit-open').click();
  await byId('submit-confirm').click();
  await byId('result').waitFor({ timeout: 30_000 });
  assert.equal((await byId('result-score').innerText()).replace(/\s+/g, ''), '6/100');
  for (const [section, answers, total] of plan) {
    assert.match(await byId(`result-${section}`).innerText(), new RegExp(`${answers}/${total}$`));
  }
  await snap(`${label}-simulation-result`);
  assert.deepEqual(problems, []);
  report.checks.push(`${label}: full simulation returned to Mathematics with time left; 6/100 with 3/40, 2/20, 1/40`);
  await page.close();
}

/** Synthetic cloze/matching fixture with known keys: every answer correct, matching by drag, tap and list. */
async function clozeMatching(browser, viewport, base, label) {
  const { page, problems, byId, snap } = await journeyPage(browser, viewport, base);
  await page.goto(`${base}/student/?mode=interactions`);
  await login(byId, 'studentA');
  await page.locator('[data-testid^="start-"]').first().click();
  await byId('attempt-workspace').waitFor();
  const count = await page.locator('[data-testid^="question-jump-"]').count();
  const kinds = [];
  for (let position = 0; position < count; position += 1) {
    if (position) await byId('question-next').click();
    await page.locator('#question-title').waitFor();
    if (await byId('cloze-response-control').count()) {
      kinds.push('cloze');
      await byId('cloze-answer-city').fill('Ha Noi');
      await byId('cloze-answer-ratio').fill('3:2');
      // Leaving with unsaved typing asks for confirmation first.
      if (position < count - 1) {
        await byId('question-next').click();
        assert.match(await byId('screen-message').innerText(), /chưa lưu/);
      }
      await byId('answer-save').click();
    } else if (await byId('matching-response-control').count()) {
      kinds.push('matching');
      await byId('matching-card-target-red').dragTo(byId('matching-drop-row-a'));
      await byId('matching-card-target-blue').click();
      await byId('matching-drop-row-b').click();
      await byId('matching-answer-row-c').selectOption('target-green');
      assert.equal(await byId('matching-card-target-red').isDisabled(), true, 'a used card cannot be placed twice');
      await snap(`${label}-matching`);
      await byId('answer-save').click();
    } else if (await byId('numeric-answer-input').count()) {
      kinds.push('numeric');
      await byId('numeric-answer-input').fill('1.5');
      await byId('answer-save').click();
    } else if (await byId('true-false-group').count()) {
      kinds.push('true-false');
      await page.locator('label:has(input[data-testid="tf-statement-a-true"])').click();
      await page.waitForFunction(() => !document.querySelector('input[data-testid="tf-statement-b-false"]')?.disabled);
      await page.locator('label:has(input[data-testid="tf-statement-b-false"])').click();
    } else {
      kinds.push('choice');
      await page.locator('label:has(input[data-testid="option-b"])').click();
    }
    await page.waitForFunction(() => /^Đã lưu/.test(document.querySelector('[data-testid="save-status"]')?.textContent ?? ''), null, { timeout: 10_000 });
  }
  assert.ok(kinds.includes('cloze') && kinds.includes('matching'), `fixture delivered cloze and matching (${kinds})`);
  await byId('submit-open').click();
  await byId('submit-confirm').click();
  await byId('result').waitFor({ timeout: 30_000 });
  assert.equal((await byId('result-score').innerText()).replace(/\s+/g, ''), `${count}/${count}`, 'every answer graded correct');
  assert.deepEqual(problems, []);
  report.checks.push(`${label}: cloze/matching practice ${count}/${count} correct (${kinds.join(', ')}); matching by drag, tap and list; unsaved-change warning shown`);
  await page.close();
}

await mkdir(artifacts, { recursive: true });
let launcher;
let fixture;
let browser;
let log = '';
try {
  launcher = spawn(process.execPath, ['scripts/start-uni-demo.mjs', '--rehearsal'], {
    cwd: ROOT, env: { ...process.env, DEMO_UNI_PORT: port }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [launcher.stdout, launcher.stderr]) stream.on('data', (chunk) => { log += chunk; });
  for (let waited = 0; waited < 180_000 && !log.includes('{"event":"ready"'); waited += 100) {
    if (launcher.exitCode !== null) throw new Error(`Demo exited before it was ready:\n${log}`);
    await delay(100);
  }
  assert.ok(log.includes('{"event":"ready"'), `Demo did not become ready:\n${log}`);
  const index = await fetch(`${origin}/student/`);
  assert.equal(index.status, 200, 'student app is built (run npm run build:student)');

  browser = await chromium.launch({ executablePath: process.env.STUDENT_BROWSER ?? '/snap/bin/chromium' });
  const desktop = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };
  await sectionPractice(browser, desktop, 'studentA', 'desktop');
  await numericPractice(browser, desktop, 'studentA', 'desktop');
  await fullSimulation(browser, desktop, 'studentA', 'desktop');
  await sectionPractice(browser, mobile, 'studentB', 'mobile');
  await fullSimulation(browser, mobile, 'studentB', 'mobile');

  let fixtureLog = '';
  fixture = spawn(process.execPath, ['scripts/start-student-fixture.mjs'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', STUDENT_FIXTURE_DEMO: 'true', STUDENT_FIXTURE_CLOZE_MATCHING: 'true' } });
  for (const stream of [fixture.stdout, fixture.stderr]) stream.on('data', (chunk) => { fixtureLog += chunk; });
  let ready = null;
  for (let waited = 0; waited < 180_000 && !ready; waited += 100) {
    if (fixture.exitCode !== null) throw new Error(`Cloze/matching fixture exited:\n${fixtureLog}`);
    const line = fixtureLog.split('\n').find((entry) => entry.startsWith('{"event":"ready"'));
    if (line) ready = JSON.parse(line); else await delay(100);
  }
  assert.ok(ready, `Cloze/matching fixture did not become ready:\n${fixtureLog}`);
  await clozeMatching(browser, desktop, new URL(ready.url).origin, 'desktop');
  console.log(JSON.stringify({ status: 'PASS', ...report }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stop(fixture);
  await stop(launcher);
}
