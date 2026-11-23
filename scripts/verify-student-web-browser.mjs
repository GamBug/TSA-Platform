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
  page.on('console', (message) => {
    if (message.type() === 'error' && /content security policy/i.test(message.text())) problems.push(message.text());
  });
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
async function answerByNote(page, byId, keyboard = false) {
  const text = await page.locator('#question-title').innerText();
  const option = /nhãn ([A-D])/.exec(text)?.[1]?.toLowerCase();
  assert.ok(option, 'rehearsal question names its label');
  const input = byId(`option-${option}`);
  if (keyboard) {
    await input.focus();
    await page.keyboard.press('Space');
  } else {
    await page.locator(`label:has(input[data-testid="option-${option}"])`).click();
  }
  await page.waitForFunction(() => /^Đã lưu/.test(document.querySelector('[data-testid="save-status"]')?.textContent ?? ''), null, { timeout: 10_000 });
  assert.ok(await input.isChecked(), 'the saved option is checked');
  return input;
}

// The local demo starts one-click guests like the public one; each journey page is its own browser context.
async function login(byId) {
  await byId('guest-start').click();
}

async function assertSubmitFits(button) {
  const lines = await button.evaluate((element) => {
    const label = document.createRange();
    label.selectNodeContents(element);
    return label.getClientRects().length;
  });
  assert.equal(lines, 1, 'the submit label fits on one line');
}

async function assertTapTargets(page) {
  const undersized = await page.locator('button:visible, header a:visible').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const { width, height } = element.getBoundingClientRect();
      return width < 44 || height < 44 ? [{ label: element.textContent.trim(), width, height }] : [];
    }));
  assert.deepEqual(undersized, [], 'visible buttons and header links have 44 × 44 px targets');
}

async function sectionPractice(browser, viewport, label, layoutOnly = false) {
  const { page, problems, byId, snap } = await journeyPage(browser, viewport);
  await page.goto(`${origin}/student/`);
  await byId('guest-start').waitFor();
  await login(byId);
  await page.locator('[data-testid="catalog-item"]').first().waitFor();
  assert.match(await byId('demo-notice').innerText(), /không liên kết với Đại học Bách khoa Hà Nội \(HUST\)/);
  assert.match(await byId('demo-notice').innerText(), /DIỄN TẬP · NỘI DUNG TỔNG HỢP/);
  await assertTapTargets(page);
  await snap(`${label}-catalog`);
  assert.deepEqual(await page.locator('[data-testid^="start-"]').evaluateAll((items) => items.map((item) => item.dataset.testid)),
    ['start-MATH', 'start-READING', 'start-SCIENCE'], 'the catalog offers exactly the three section tests');
  assert.equal(await page.locator('[data-testid^="mode-"]').count(), 2, 'only section tests and the full test are offered');
  if (viewport.width < 640) {
    await byId('start-MATH').evaluate((button) => button.scrollIntoView({ block: 'center' }));
    assert.ok(await page.evaluate(() => window.scrollY > 0), 'the phone catalog scrolls to its Math card');
  }
  await byId('start-MATH').click();
  await byId('attempt-workspace').waitFor();
  await assertSubmitFits(byId('submit-open'));
  await assertTapTargets(page);
  if (viewport.width < 640) {
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'practice opens at the top of the question');
    const title = await page.locator('#question-title').boundingBox();
    assert.ok(title && title.y >= 0 && title.y + title.height <= viewport.height, 'the first question is on screen');
  }
  await snap(`${label}-practice-first`);
  await byId('flag-toggle').focus();
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.activeElement?.matches('[data-testid="option-list"] input[type="radio"]')),
    'Tab moves from the flag control to the answers');
  await answerByNote(page, byId, true);
  if (layoutOnly) {
    assert.deepEqual(problems, []);
    await page.close();
    return;
  }
  const count = await page.locator('[data-testid^="question-jump-"]').count();
  assert.equal(count, 40, 'the Math section test has the real length');
  if (viewport.width >= 1024) {
    const grid = page.locator('aside[aria-label="Bảng câu hỏi"]');
    const area = page.locator('main.question-oly-surface');
    const before = (await area.boundingBox()).width;
    await byId('panel-toggle').click();
    assert.equal(await grid.isVisible(), false, 'hiding the grid removes it');
    assert.ok((await area.boundingBox()).width > before + 200, 'the question area takes the freed width');
    await byId('panel-toggle').click();
    assert.equal(await grid.isVisible(), true, 'the grid comes back');
  }
  for (let position = 1; position < count; position += 1) {
    await byId('question-next').click();
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
  await assertTapTargets(page);
  await snap(`${label}-review`);
  assert.deepEqual(problems, []);
  report.checks.push(`${label}: section practice answered ${count}/${count} correct, released review shown`);
  await page.close();
}

async function fullSimulation(browser, viewport, label, layoutOnly = false) {
  const { page, problems, byId, snap } = await journeyPage(browser, viewport);
  await page.goto(`${origin}/student/?mode=simulation`);
  await login(byId);
  await byId('simulation-home').waitFor();
  await byId('simulation-create').click();
  await byId('demo-start').click();
  await page.locator('#question-title').waitFor();
  await assertSubmitFits(byId('submit-open'));
  await assertTapTargets(page);
  for (const [section, name, status] of [
    ['math', 'Tư duy Toán học', 'Đang tính giờ'],
    ['reading', 'Tư duy Đọc hiểu', 'Chưa mở'],
    ['science', 'Tư duy Khoa học', 'Chưa mở'],
  ]) {
    const clock = byId(`section-${section}`);
    assert.match(await clock.innerText(), new RegExp(`${name}\\s+\\d{2}:\\d{2}\\s+${status}`));
    assert.ok(await clock.locator('span').evaluateAll((parts) =>
      parts.every((part) => part.scrollWidth <= part.clientWidth)), `${section} clock text fits its tab`);
  }
  await snap(`${label}-simulation-first`);
  if (layoutOnly) {
    await byId('section-reading').click();
    await page.waitForFunction(() => /Đang tính giờ/.test(document.querySelector('[data-testid="section-reading"]')?.textContent ?? ''));
    assert.match(await byId('section-math').innerText(), /Tạm dừng/);
    await snap(`${label}-simulation-paused-clock`);
    assert.deepEqual(problems, []);
    await page.close();
    return;
  }
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

await mkdir(artifacts, { recursive: true });
let launcher;
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
  const phone = { width: 360, height: 800 };
  const layoutOnly = process.env.STUDENT_WEB_LAYOUT_ONLY === 'true';
  await sectionPractice(browser, phone, 'phone-360', true);
  await fullSimulation(browser, phone, 'phone-360', true);
  await sectionPractice(browser, desktop, 'desktop', layoutOnly);
  await fullSimulation(browser, desktop, 'desktop', layoutOnly);
  await sectionPractice(browser, mobile, 'mobile', layoutOnly);
  await fullSimulation(browser, mobile, 'mobile', layoutOnly);

  console.log(JSON.stringify({ status: 'PASS', ...report }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stop(launcher);
}
