import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bankRequest, loginActor } from './harness.mjs';
import { SYNTHETIC_REVIEW_EVIDENCE } from './review-browser-fixture.mjs';

const script = new URL('../../../scripts/start-staff-review-fixture.mjs', import.meta.url);

function launch(overrides = {}, detached = false) {
  const child = spawn(process.execPath, [fileURLToPath(script)], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LOCAL_SYNTHETIC_ONLY: 'true',
      STAFF_REVIEW_FIXTURE_DEMO: 'true',
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached,
  });
  let output = '';
  let errors = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const exited = once(child, 'close');
  return { child, exited, get output() { return output; }, get errors() { return errors; } };
}

async function stopChild(processHandle) {
  if (processHandle.child.exitCode !== null || processHandle.child.signalCode !== null) return;
  processHandle.child.kill('SIGTERM');
  let timer;
  try {
    await Promise.race([processHandle.exited, new Promise((resolve) => { timer = setTimeout(resolve, 10_000); })]);
  } finally {
    clearTimeout(timer);
  }
  if (processHandle.child.exitCode === null && processHandle.child.signalCode === null) {
    processHandle.child.kill('SIGKILL');
    await processHandle.exited;
  }
}

async function waitForReady(processHandle, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const line = processHandle.output.split('\n').find((entry) => entry.startsWith('{"event":"ready"'));
    if (line) return JSON.parse(line);
    if (processHandle.child.exitCode !== null || processHandle.child.signalCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Staff demo did not become ready before timeout. stderr: ${processHandle.errors}`);
}

test('disposable staff demo refuses production and missing opt-in before emitting ready or starting a fixture', { timeout: 15_000 }, async (t) => {
  for (const overrides of [
    { NODE_ENV: 'production' },
    { NODE_ENV: '' },
    { LOCAL_SYNTHETIC_ONLY: '' },
    { STAFF_REVIEW_FIXTURE_DEMO: '' },
  ]) {
    const processHandle = launch(overrides);
    t.after(() => stopChild(processHandle));
    const [code] = await processHandle.exited;
    assert.equal(code, 1);
    assert.equal(processHandle.output, '');
    assert.match(processHandle.errors, /requires NODE_ENV=test/);
  }
});

test('staff review demo serves the real synthetic AUTHOR private GETs and closes its owned listener on terminal-group SIGINT', { timeout: 150_000 }, async (t) => {
  const processHandle = launch({}, true);
  t.after(() => stopChild(processHandle));
  const ready = await waitForReady(processHandle);
  assert.equal(ready.event, 'ready');
  assert.equal(ready.mode, 'LOCAL_SYNTHETIC_ONLY');
  assert.equal(ready.fixtureProfile, 'MIXED_REVIEW');
  assert.equal(ready.questionCount, 4);
  assert.deepEqual(Object.keys(ready).sort(), ['event', 'fixtureProfile', 'mode', 'note', 'questionCount', 'url'].sort());
  assert.match(processHandle.output, /synthetic AUTHOR “Tác giả tổng hợp”/);
  assert.match(processHandle.output, /not a qualified reviewer/i);
  for (const privateValue of ['Lời giải tổng hợp riêng', 'Bản xem trước tổng hợp', '<img src=', 'tsa_local_session=']) {
    assert.equal(processHandle.output.includes(privateValue), false, `stdout must not expose ${privateValue}`);
  }

  const url = new URL(ready.url);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.search, '', 'staff landing must expose its workspace instead of selecting the student-only client');
  const pageResponse = await fetch(url);
  assert.equal(pageResponse.status, 200);
  const page = await pageResponse.text();
  assert.match(page, /id="app"/);
  const main = await (await fetch(new URL('/app/main.js', url))).text();
  assert.match(main, /openStaffWorkspace/);
  assert.match(main, /staff-open/);
  const staff = await (await fetch(new URL('/app/staff.js', url))).text();
  assert.match(staff, /review-context/);

  const harness = { origin: url.origin };
  const session = await fetch(new URL('/local-auth/session', url));
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, false);
  const author = await loginActor(harness, 'author');
  const listResponse = await bankRequest(harness, author, '/api/v1/questions', { query: 'state=DRAFT&limit=20' });
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.items.length, 4);

  const contextResponses = await Promise.all(list.items.map(async ({ versionId }) => {
    const response = await bankRequest(harness, author, `/api/v1/question-versions/${encodeURIComponent(versionId)}/review-context`);
    return { response, context: await response.json() };
  }));
  assert.ok(contextResponses.every(({ response }) => response.status === 200));
  const available = contextResponses.filter(({ context }) => context.preview.status === 'AVAILABLE');
  const blocked = contextResponses.filter(({ context }) => context.preview.status === 'BLOCKED');
  assert.equal(available.length, 3);
  assert.equal(blocked.length, 1);
  assert.deepEqual(new Set(available.map(({ context }) => context.preview.question.interaction.type)),
    new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP']));
  assert.equal(blocked[0].context.preview.reason, 'CONTENT_UNSUPPORTED');
  assert.equal(Object.hasOwn(blocked[0].context.preview, 'question'), false);
  const blockedText = JSON.stringify(blocked[0].context);
  assert.equal(blockedText.includes('Bản xem trước tổng hợp'), false);
  assert.equal(blockedText.includes('Lời giải tổng hợp riêng'), false);
  assert.equal(blockedText.includes('<img src='), false);

  const evidencePath = `/api/v1/question-versions/${encodeURIComponent(list.items[0].versionId)}/review-evidence`;
  assert.equal((await bankRequest(harness,author,evidencePath)).status,403);
  const manager=await loginActor(harness,'bankManager');
  const evidenceResponse=await bankRequest(harness,manager,evidencePath);
  assert.equal(evidenceResponse.status,200);
  const evidence=await evidenceResponse.json();
  assert.equal(evidence.accessBasis,'BANK_MANAGER');
  assert.equal(evidence.sources[0].currentDecision.recordedEvidence.text,SYNTHETIC_REVIEW_EVIDENCE);
  assert.equal(processHandle.output.includes(SYNTHETIC_REVIEW_EVIDENCE),false,'launcher never prints recorded evidence');
  assert.match(processHandle.output,/synthetic BANK_MANAGER/);
  const candidate = await loginActor(harness, 'studentA');
  assert.equal((await bankRequest(harness,candidate,evidencePath)).status,403);
  const candidateResponse = await bankRequest(harness, candidate,
    `/api/v1/question-versions/${encodeURIComponent(list.items[0].versionId)}/review-context`);
  assert.equal(candidateResponse.status, 403);
  assert.equal((await candidateResponse.json()).error.code, 'FORBIDDEN');

  process.kill(-processHandle.child.pid, 'SIGINT');
  const [code, signal] = await processHandle.exited;
  assert.equal(code, 0, processHandle.errors);
  assert.equal(signal, null);
  await assert.rejects(fetch(url), 'SIGINT cleanup must close the disposable HTTP listener');
});
