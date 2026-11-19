// Browser journeys for the public demo mode of the React student app (apps/candidate-web).
// The public server trusts only its https origin, so a throwaway TLS proxy stands in for the real reverse proxy.
// Usage: npm run test:student-web:public   (STUDENT_BROWSER overrides the Chromium executable)
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(ROOT, 'apps/candidate-web/package.json'))('playwright-core');
const upstreamPort = process.env.STUDENT_WEB_VERIFY_PUBLIC_PORT ?? '4183';
const proxyPort = process.env.STUDENT_WEB_VERIFY_PROXY_PORT ?? '4443';
const origin = `https://127.0.0.1:${proxyPort}`;
const artifacts = path.join(ROOT, '.local', 'public-launch-qa', 'cp3');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { checks: [], screenshots: [] };

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGINT');
  const done = await Promise.race([once(child, 'close').then(() => true), delay(20_000).then(() => false)]);
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

async function visitor(browser, viewport) {
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) problems.push(`third-party request: ${url.origin}`);
  });
  const byId = (id) => page.locator(`[data-testid="${id}"]`).first();
  const snap = async (name) => {
    const target = path.join(artifacts, `${name}.png`);
    await page.screenshot({ path: target });
    report.screenshots.push(target);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${name}: no horizontal page scroll (overflow ${overflow}px)`);
  };
  const guestId = () => page.evaluate(async () => (await (await fetch('/local-auth/session', { credentials: 'same-origin' })).json()).principal?.userId);
  return { context, page, problems, byId, snap, guestId };
}

/** Rehearsal questions name their key in the text ("nêu nhãn B"), so grading is predictable. */
async function answerByNote({ page }) {
  const text = await page.locator('#question-title').innerText();
  const option = /nhãn ([A-D])/.exec(text)?.[1]?.toLowerCase();
  assert.ok(option, 'rehearsal question names its label');
  await page.locator(`label:has(input[data-testid="option-${option}"])`).click();
  await page.waitForFunction(() => /^Đã lưu/.test(document.querySelector('[data-testid="save-status"]')?.textContent ?? ''), null, { timeout: 10_000 });
}

async function journey(browser, viewport, label) {
  const a = await visitor(browser, viewport);
  await a.page.goto(`${origin}/student/`);
  await a.byId('guest-start').waitFor();
  assert.equal(await a.byId('login-studentA').count(), 0, 'local student logins are hidden in public mode');
  assert.match(await a.byId('landing-intro').innerText(), /không chính thức/);
  await a.snap(`${label}-landing`);
  await a.byId('guest-start').click();
  await a.page.locator('[data-testid="catalog-item"]').first().waitFor();
  assert.equal(await a.byId('logout').count(), 0, 'public guests have no logout');
  await a.byId('full-test-card').waitFor();
  assert.match(await a.byId('full-test-card').innerText(), /100 câu, 150 phút/);
  assert.match(await a.byId('demo-notice').innerText(), /không liên kết với Đại học Bách khoa Hà Nội \(HUST\)/);
  await a.snap(`${label}-catalog`);

  // A reload keeps the same guest and goes straight to the catalog.
  const guestA = await a.guestId();
  await a.page.reload();
  await a.page.locator('[data-testid="catalog-item"]').first().waitFor();
  assert.equal(await a.guestId(), guestA, 'reload keeps the guest');

  await a.byId('start-MATH').click();
  await a.byId('attempt-workspace').waitFor();
  const count = await a.page.locator('[data-testid^="question-jump-"]').count();
  for (let position = 0; position < count; position += 1) {
    if (position) await a.byId('question-next').click();
    await answerByNote(a);
  }
  await a.byId('submit-open').click();
  await a.byId('submit-confirm').click();
  await a.byId('result').waitFor({ timeout: 30_000 });
  assert.equal((await a.byId('result-score').innerText()).replace(/\s+/g, ''), `${count}/${count}`);
  assert.match(await a.byId('demo-notice').innerText(), /Dự án phi lợi nhuận/);
  await a.snap(`${label}-result`);

  // A second browser is a different guest and cannot see the first guest's attempts.
  const b = await visitor(browser, viewport);
  await b.page.goto(`${origin}/student/`);
  await b.byId('guest-start').click();
  await b.page.locator('[data-testid="catalog-item"]').first().waitFor();
  assert.notEqual(await b.guestId(), guestA, 'a second browser gets a different guest');
  const attempts = await b.page.evaluate(async () => (await (await fetch('/api/v1/attempts?limit=100', { credentials: 'same-origin' })).json()).items.length);
  assert.equal(attempts, 0, 'the second guest sees no attempts of the first');

  // The full test through the headline card: three sections, return to Mathematics, binary counts.
  await b.byId('full-test-start').click();
  await b.byId('simulation-home').waitFor();
  await b.byId('simulation-create').click();
  await b.byId('demo-start').click();
  await b.page.locator('#question-title').waitFor();
  const plan = [['math', 3, 40], ['reading', 2, 20], ['science', 1, 40]];
  for (const [section, answers] of plan) {
    if (section !== 'math') {
      await b.byId(`section-${section}`).click();
      await b.page.waitForFunction((id) => document.querySelector(`[data-testid="section-${id}"]`)?.getAttribute('aria-selected') === 'true', section);
    }
    for (let position = 0; position < answers; position += 1) {
      if (position) await b.byId('question-next').click();
      await answerByNote(b);
    }
  }
  await b.byId('section-math').click();
  await b.snap(`${label}-simulation`);
  await b.byId('submit-open').click();
  await b.byId('submit-confirm').click();
  await b.byId('result').waitFor({ timeout: 30_000 });
  assert.equal((await b.byId('result-score').innerText()).replace(/\s+/g, ''), '6/100');
  for (const [section, answers, total] of plan) {
    assert.match(await b.byId(`result-${section}`).innerText(), new RegExp(`${answers}/${total}$`));
  }

  // About page from the footer; unknown query values fall back to the catalog; the root is closed.
  await b.page.goto(`${origin}/student/`);
  await b.byId('about-link').click();
  await b.byId('about').waitFor();
  assert.match(await b.byId('about').innerText(), /không liên kết với Đại học Bách khoa Hà Nội \(HUST\)/);
  await b.snap(`${label}-about`);
  const unknown = await b.page.goto(`${origin}/student/?mode=nope&page=nope`);
  assert.equal(unknown?.status(), 200);
  await b.page.locator('[data-testid="catalog-item"]').first().waitFor();
  assert.equal((await b.page.request.get(`${origin}/student/does-not-exist`)).status(), 404, 'unknown paths are 404; the app routes by query only');
  assert.equal((await b.page.request.get(`${origin}/`)).status(), 404, 'the root of the public server is 404');

  assert.deepEqual([...a.problems, ...b.problems], []);
  report.checks.push(`${label}: one-click guest, reload keeps the guest, second browser isolated, section practice ${count}/${count}, full test 6/100 via the headline card, About page, root 404`);
  await Promise.all([a.context.close(), b.context.close()]);
}

await mkdir(artifacts, { recursive: true });
const certDirectory = await mkdtemp(path.join(os.tmpdir(), 'tsa-public-proxy-'));
let launcher;
let proxy;
let browser;
let log = '';
try {
  launcher = spawn(process.execPath, ['scripts/start-uni-demo.mjs', '--rehearsal'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DEMO_PUBLIC: 'true', DEMO_PUBLIC_ORIGIN: origin, DEMO_GUEST_POOL: '20', DEMO_UNI_PORT: upstreamPort } });
  for (const stream of [launcher.stdout, launcher.stderr]) stream.on('data', (chunk) => { log += chunk; });
  for (let waited = 0; waited < 180_000 && !log.includes('{"event":"ready"'); waited += 100) {
    if (launcher.exitCode !== null) throw new Error(`Public demo exited before it was ready:\n${log}`);
    await delay(100);
  }
  assert.ok(log.includes('{"event":"ready"'), `Public demo did not become ready:\n${log}`);
  proxy = await startTlsProxy(certDirectory);
  browser = await chromium.launch({ executablePath: process.env.STUDENT_BROWSER ?? '/snap/bin/chromium' });
  await journey(browser, { width: 1280, height: 800 }, 'desktop-1280');
  await journey(browser, { width: 768, height: 1024 }, 'tablet-768');
  await journey(browser, { width: 360, height: 740 }, 'phone-360');
  console.log(JSON.stringify({ status: 'PASS', ...report }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  proxy?.close();
  await stop(launcher);
  await rm(certDirectory, { recursive: true, force: true });
}
