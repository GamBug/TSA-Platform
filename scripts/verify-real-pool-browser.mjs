// Chromium journey on the REAL published pool: one guest takes the whole 40/20/40 test through the student app and
// every question screen is inspected for display defects. Starts the public-mode demo on the owner's retained Bank
// (read through the launcher's own backup and disposable copy; nothing in the Bank changes) behind a throwaway TLS proxy.
// Usage: DEMO_UNI_SOURCE_CREDIT=... npm run test:real-pool:browser   (STUDENT_BROWSER overrides the Chromium path)
// Answers are arbitrary (first option; every statement true), so the score is not a check; display and saving are.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(ROOT, 'apps/candidate-web/package.json'))('playwright-core');
const upstreamPort = process.env.REAL_POOL_VERIFY_PORT ?? '4184';
const proxyPort = process.env.REAL_POOL_VERIFY_PROXY_PORT ?? '4444';
const origin = `https://127.0.0.1:${proxyPort}`;
const artifacts = path.join(ROOT, '.local', 'public-launch-qa', 'real-pool');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGINT');
  const done = await Promise.race([once(child, 'close').then(() => true), delay(30_000).then(() => false)]);
  if (!done) { child.kill('SIGKILL'); await once(child, 'close'); }
}

async function startTlsProxy(directory) {
  const privateKey = path.join(directory, 'proxy-private.pem');
  const certificate = path.join(directory, 'proxy-public.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=127.0.0.1', '-days', '1',
    '-keyout', privateKey, '-out', certificate], { stdio: 'ignore' });
  const server = https.createServer({ key: readFileSync(privateKey), cert: readFileSync(certificate) }, (req, res) => {
    const headers = { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress };
    const upstream = http.request({ host: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url, headers }, (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  await new Promise((resolve) => server.listen(Number(proxyPort), '127.0.0.1', resolve));
  return server;
}

/** Everything wrong with the question currently on screen. */
function inspectScreen() {
  const root = document.querySelector('[data-testid="attempt-workspace"]');
  const text = root.innerText;
  const images = [...root.querySelectorAll('img')].map((image) => ({ ok: image.complete && image.naturalWidth > 0, alt: image.alt }));
  return {
    title: (document.querySelector('#question-title')?.innerText ?? '').slice(0, 90),
    katex: root.querySelectorAll('.katex').length,
    katexErrors: root.querySelectorAll('.katex-error').length,
    // TeX that stayed as text: a command, or an unmatched dollar sign outside a number.
    rawTex: /\\(?:frac|sqrt|cdot|times|text|left|right|begin|end|mathbb|mathrm|overrightarrow|rightleftharpoons|alpha|beta|Delta|circ|le|ge|lt|gt)\b|\$\$|(?<![\d])\$(?![\d])/.test(text),
    images: images.length,
    brokenImages: images.filter((image) => !image.ok).length,
    imagesWithoutAlt: images.filter((image) => !image.alt).length,
    overflowPx: document.documentElement.scrollWidth - window.innerWidth,
    passageClipped: [...root.querySelectorAll('section[aria-label="Đoạn văn"]')].some((passage) => {
      const { left, right } = passage.getBoundingClientRect();
      return left < -1 || right > window.innerWidth + 1;
    }),
    // The elements that stick out past the right edge of the screen, for fixing the layout.
    overflowing: [...root.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`),
    emptyQuestion: text.trim().length < 20,
    options: root.querySelectorAll('[data-testid^="option-"]').length,
    statements: root.querySelectorAll('[data-testid^="tf-"][data-testid$="-true"]').length,
  };
}

/** Answer whatever the question asks for; returns its kind. */
async function answer(page) {
  const saved = () => page.waitForFunction(() => /^Đã lưu/.test(document.querySelector('[data-testid="save-status"]')?.textContent ?? ''), null, { timeout: 10_000 });
  const truths = page.locator('[data-testid^="tf-"][data-testid$="-true"]');
  const statementCount = await truths.count();
  if (statementCount > 0) {
    for (let at = 0; at < statementCount; at += 1) await truths.nth(at).click();
    await saved();
    return 'TRUE_FALSE_GROUP';
  }
  const labels = page.locator('[data-testid="option-list"] label');
  const optionCount = await labels.count();
  assert.ok(optionCount > 0, 'a choice question has options');
  const multiple = (await page.locator('[data-testid="option-list"] input[type="checkbox"]').count()) > 0;
  for (let at = 0; at < (multiple ? Math.min(optionCount, 4) : 1); at += 1) {
    await labels.nth(at).click();
    const invalid = await page.locator('[data-testid="answer-invalid"]').count();
    if (!multiple || !invalid) { try { await saved(); break; } catch { /* needs another selection */ } }
  }
  await saved();
  return multiple ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE';
}

async function journey(browser, viewport, label) {
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console error: ${message.text().slice(0, 200)}`); });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/result')) problems.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) problems.push(`third-party request: ${url.origin}`);
  });
  const byId = (id) => page.locator(`[data-testid="${id}"]`).first();
  const snap = async (name) => page.screenshot({ path: path.join(artifacts, `${label}-${name}.png`) });

  await page.goto(`${origin}/student/`);
  await byId('guest-start').click();
  await byId('full-test-card').waitFor();
  await byId('full-test-start').click();
  await byId('simulation-home').waitFor();
  await byId('simulation-create').click();
  await byId('demo-start').click();
  await page.locator('#question-title').waitFor({ timeout: 60_000 });

  const questions = [];
  const sections = [['math', 40], ['reading', 20], ['science', 40]];
  let imagesShot = 0;
  for (const [section, expected] of sections) {
    if (section !== 'math') {
      await byId(`section-${section}`).click();
      await page.waitForFunction((id) => document.querySelector(`[data-testid="section-${id}"]`)?.getAttribute('aria-selected') === 'true', section);
    }
    await page.locator('#question-title').waitFor();
    // The simulation screen has Next/Previous only: walk the section until Next is disabled.
    let position = 0;
    for (;;) {
      position += 1;
      await page.locator('#question-title').waitFor();
      // Images load lazily: bring each into view so a small screen is judged on loaded images.
      for (const image of await page.locator('[data-testid="attempt-workspace"] img').all()) await image.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="attempt-workspace"] img')].every((image) => image.complete), null, { timeout: 15_000 }).catch(() => {});
      await page.evaluate(() => window.scrollTo(0, 0));
      const info = await page.evaluate(inspectScreen);
      if (position === 1) await snap(`${section}-first`);
      if (info.images > 0 && imagesShot < 4) { imagesShot += 1; await snap(`${section}-${position}-image`); }
      if (info.overflowPx > 0) await snap(`${section}-${position}-overflow`);
      info.kind = await answer(page);
      questions.push({ section, position, ...info });
      if (await byId('question-next').isDisabled()) break;
      await byId('question-next').click();
    }
    assert.equal(position, expected, `${section} delivers ${expected} questions`);
  }
  await byId('section-math').click();
  await byId('submit-open').click();
  await byId('submit-confirm').click();
  await byId('result').waitFor({ timeout: 60_000 });
  const score = (await byId('result-score').innerText()).replace(/\s+/g, '');
  assert.match(score, /\/100$/, `the result is out of 100 (${score})`);
  for (const [section, total] of sections) assert.match(await byId(`result-${section}`).innerText(), new RegExp(`/${total}$`));
  await snap('result');

  const defects = questions.flatMap((q) => [
    q.katexErrors && `${q.section} ${q.position}: ${q.katexErrors} KaTeX error(s)`,
    q.brokenImages && `${q.section} ${q.position}: ${q.brokenImages} broken image(s)`,
    q.emptyQuestion && `${q.section} ${q.position}: nearly empty question`,
    q.overflowPx > 0 && `${q.section} ${q.position}: page scrolls sideways by ${q.overflowPx}px (${q.overflowing.join('; ')})`,
    q.passageClipped && `${q.section} ${q.position}: the passage extends outside the viewport`,
    q.options === 0 && q.statements === 0 && `${q.section} ${q.position}: nothing to answer`,
  ]).filter(Boolean);
  const warnings = questions.flatMap((q) => [
    q.rawTex && `${q.section} ${q.position}: possible raw TeX in text — ${q.title}`,
    q.imagesWithoutAlt && `${q.section} ${q.position}: ${q.imagesWithoutAlt} image(s) without alt text`,
  ]).filter(Boolean);
  const summary = {
    label, viewport, score, questions: questions.length,
    kinds: Object.fromEntries(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'].map((kind) => [kind, questions.filter((q) => q.kind === kind).length])),
    withMath: questions.filter((q) => q.katex > 0).length, withImages: questions.filter((q) => q.images > 0).length,
    defects, warnings, problems: [...new Set(problems)],
  };
  await writeFile(path.join(artifacts, `${label}.json`), JSON.stringify({ summary, questions }, null, 2));
  await context.close();
  return summary;
}

await mkdir(artifacts, { recursive: true });
const certDirectory = await mkdtemp(path.join(os.tmpdir(), 'tsa-realpool-proxy-'));
let launcher, proxy, browser, log = '', failed = false;
try {
  launcher = spawn(process.execPath, ['scripts/start-uni-demo.mjs'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DEMO_PUBLIC: 'true', DEMO_PUBLIC_ORIGIN: origin, DEMO_GUEST_POOL: '20', DEMO_UNI_PORT: upstreamPort,
      DEMO_OFFERING_DAYS: '2', PG_BIN: process.env.PG_BIN ?? '/usr/lib/postgresql/18/bin',
      DEMO_UNI_SOURCE_CREDIT: process.env.DEMO_UNI_SOURCE_CREDIT ?? 'Local verification run.' } });
  for (const stream of [launcher.stdout, launcher.stderr]) stream.on('data', (chunk) => { log += chunk; });
  for (let waited = 0; waited < 180_000 && !log.includes('{"event":"ready"'); waited += 100) {
    if (launcher.exitCode !== null) throw new Error(`Public demo exited before it was ready:\n${log}`);
    await delay(100);
  }
  assert.ok(log.includes('{"event":"ready"'), `Public demo did not become ready:\n${log}`);
  assert.match(log, /Full simulation: offered\./, 'the real pool offers the full simulation');
  proxy = await startTlsProxy(certDirectory);
  browser = await chromium.launch({ executablePath: process.env.STUDENT_BROWSER ?? '/snap/bin/chromium' });
  const results = [];
  const only = process.env.REAL_POOL_VIEWPORT; // 'desktop' or 'phone' to run one of the two
  for (const [viewport, label] of [[{ width: 1280, height: 800 }, 'desktop-1280'], [{ width: 360, height: 740 }, 'phone-360']]) {
    if (only && !label.startsWith(only)) continue;
    const summary = await journey(browser, viewport, label);
    results.push(summary);
    console.log(JSON.stringify({ ...summary, warnings: summary.warnings.length, warningSample: summary.warnings.slice(0, 8) }, null, 2));
    if (summary.defects.length || summary.problems.length) failed = true;
  }
  console.log(failed ? 'FAIL: defects or page problems found (see the JSON files)' : 'PASS: no defects or page problems');
} catch (error) {
  console.error(error);
  failed = true;
} finally {
  await browser?.close();
  proxy?.close();
  await stop(launcher);
  await rm(certDirectory, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
}
