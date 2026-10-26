import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = new URL('../../../scripts/start-student-fixture.mjs', import.meta.url);
function launch(overrides, detached = false) {
  const child = spawn(process.execPath, [fileURLToPath(script)], {
    env: { ...process.env, NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', STUDENT_FIXTURE_DEMO: 'true', STUDENT_FIXTURE_DOMAINS: 'false', STUDENT_FIXTURE_READING: 'false', STUDENT_FIXTURE_FIXED: 'false', ...overrides },
    stdio: ['ignore', 'pipe', 'pipe'], detached,
  });
  let output = '', errors = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (text) => { output += text; });
  child.stderr.on('data', (text) => { errors += text; });
  const exited = once(child, 'close');
  return { child, exited, get output() { return output; }, get errors() { return errors; } };
}

async function stopChild(p) {
  if (p.child.exitCode !== null || p.child.signalCode !== null) return;
  p.child.kill('SIGTERM');
  let timer;
  try { await Promise.race([p.exited, new Promise((resolve) => { timer = setTimeout(resolve, 3000); })]); }
  finally { clearTimeout(timer); }
  if (p.child.exitCode === null && p.child.signalCode === null) { p.child.kill('SIGKILL'); await p.exited; }
}

test('disposable demo refuses production and missing explicit fixture opt-in', { timeout: 15_000 }, async (t) => {
  for (const env of [{ NODE_ENV: 'production' }, { STUDENT_FIXTURE_DEMO: '' }, { LOCAL_SYNTHETIC_ONLY: '' }]) {
    const p = launch(env); t.after(() => stopChild(p));
    const [code] = await p.exited;
    assert.equal(code, 1); assert.equal(p.output, '');
    assert.match(p.errors, /requires NODE_ENV=test/);
  }
});

for (const profile of ['MIXED_MATH', 'THREE_DOMAINS', 'SHARED_READING', 'THREE_DOMAINS_FIXED']) test(`disposable ${profile} demo serves the integrated student client and releases its owned runtime when SIGINT reaches its terminal process group`, { timeout: 30_000 }, async (t) => {
  const fixed = profile === 'THREE_DOMAINS_FIXED', domains = profile === 'THREE_DOMAINS' || fixed, reading = profile === 'SHARED_READING';
  const p = launch({ STUDENT_FIXTURE_DOMAINS: String(domains), STUDENT_FIXTURE_READING: String(reading), STUDENT_FIXTURE_FIXED: String(fixed) }, true);
  t.after(() => stopChild(p));
  const end = Date.now() + 15_000; let ready;
  while (Date.now() < end && !ready) {
    const line = p.output.split('\n').find((text) => text.startsWith('{'));
    if (line) ready = JSON.parse(line);
    else {
      assert.equal(p.child.exitCode, null, p.errors);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
  assert.ok(ready, p.errors || 'demo did not become ready');
  assert.equal(ready.event, 'ready'); assert.equal(ready.mode, 'DISPOSABLE_SYNTHETIC_ONLY');
  assert.equal(ready.fixtureProfile, fixed ? 'THREE_DOMAINS' : profile);
  const url = new URL(ready.url); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.search, '?student=postgres');
  const page = await fetch(url); assert.equal(page.status, 200);
  const main = await (await fetch(new URL('/app/main.js', url))).text();
  assert.match(main, /createPersistentApi/);
  const session = await fetch(new URL('/local-auth/session', url));
  assert.equal(session.status, 200); assert.equal((await session.json()).authenticated, false);
  if (domains || reading) {
    const origin = url.origin;
    const bootstrap = await fetch(`${origin}/local-auth/bootstrap`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(bootstrap.status, 201);
    const pairs = bootstrap.headers.getSetCookie().map((cookie) => cookie.split(';', 1)[0]);
    const csrf = pairs.find((cookie) => cookie.startsWith('tsa_local_csrf=')).slice('tsa_local_csrf='.length);
    const login = await fetch(`${origin}/local-auth/login`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json', cookie: pairs.join('; '), 'x-csrf-token': csrf },
      body: JSON.stringify({ actorKey: 'studentA' }) });
    assert.equal(login.status, 200);
    const catalog = await fetch(`${origin}/api/v1/catalog`, { headers: {
      origin, cookie: login.headers.getSetCookie().map((cookie) => cookie.split(';', 1)[0]).join('; '),
    } });
    assert.equal(catalog.status, 200);
    const page = await catalog.json();
    const personal = page.items.filter(entry => entry.mode === 'PERSONALIZED_PRACTICE');
    const forms = page.items.filter(entry => entry.mode === 'PUBLISHED_FIXED');
    assert.equal(forms.length, fixed ? 3 : 0);
    if (fixed) assert.deepEqual(forms.map(entry=>entry.domain).sort(), ['MATH','READING','SCIENCE']);
    assert.deepEqual(personal.map((entry) => entry.domain).sort(), reading ? ['READING'] : ['MATH', 'READING', 'SCIENCE']);
    assert.deepEqual(personal.map((entry) => entry.questionCount).sort(), reading ? [2] : [2, 4, 4]);
  }
  process.kill(-p.child.pid, 'SIGINT'); const [code, signal] = await p.exited;
  assert.equal(code, 0, p.errors); assert.equal(signal, null);
  await assert.rejects(fetch(url), 'the stopped loopback listener must be unavailable');
});


test('disposable demo rejects malformed domain opt-in before creating a fixture', { timeout: 10_000 }, async (t) => {
  const p = launch({ STUDENT_FIXTURE_DOMAINS: 'yes' }); t.after(() => stopChild(p));
  const [code] = await p.exited;
  assert.equal(code, 1); assert.equal(p.output, '');
  assert.match(p.errors, /STUDENT_FIXTURE_DOMAINS must be true or false/);
});

for (const flags of [{ STUDENT_FIXTURE_READING: 'yes' }, { STUDENT_FIXTURE_READING: 'true', STUDENT_FIXTURE_DOMAINS: 'true' }]) {
  test('disposable demo rejects malformed or ambiguous reading opt-in before creating a fixture', { timeout: 10_000 }, async (t) => {
    const p = launch(flags); t.after(() => stopChild(p));
    const [code] = await p.exited;
    assert.equal(code, 1); assert.equal(p.output, '');
    assert.match(p.errors, /STUDENT_FIXTURE_READING must be true or false|Choose one disposable fixture profile/);
  });
}

for (const flags of [{ STUDENT_FIXTURE_FIXED: 'yes' }, { STUDENT_FIXTURE_FIXED: 'true' }]) test('fixed demo validates opt-in and requires supported domain profile', async t=>{
 const p=launch(flags);t.after(()=>stopChild(p));const [code]=await p.exited;assert.equal(code,1);assert.equal(p.output,'');assert.match(p.errors,/STUDENT_FIXTURE_FIXED must be true or false|requires the three-domain fixture/);
});
