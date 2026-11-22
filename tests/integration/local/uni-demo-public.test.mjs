import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { buildRehearsalSource } from '../../../scripts/uni-demo-rehearsal-source.mjs';
import { formatDemoSummary, parsePublicDemoEnvironment } from '../../../scripts/start-uni-demo.mjs';
import { mapPublicRequest, PUBLIC_SECURITY_HEADERS } from '../../../apps/practice-prototype/server.mjs';
import { resolveClientIp } from '../../../src/http/client-ip.mjs';
import { createSlidingWindowLimiter } from '../../../src/http/guest-rate-limit.mjs';
import { GUEST_POOL_EXHAUSTED_MESSAGE } from '../../../src/http/local-auth.mjs';
import { startUniDemo } from '../../../src/local/uni-demo.mjs';

const PUBLIC_ORIGIN = 'https://demo.example';
const run = promisify(execFile);

/** One HTTP call to the demo's loopback listener, as the reverse proxy would make it. */
function call(demo, pathname, { method = 'GET', host = 'demo.example', origin, headers = {}, body, jar } = {}) {
  const send = { host, ...headers };
  if (origin !== undefined) send.origin = origin;
  else if (method !== 'GET') send.origin = PUBLIC_ORIGIN;
  if (jar) {
    send.cookie = jar.cookies.join('; ');
    if (method !== 'GET') send['x-csrf-token'] = jar.csrf ?? '';
  }
  if (body !== undefined) send['content-type'] = 'application/json';
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port: demo.port, path: pathname, method, headers: send }, (incoming) => {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: incoming.statusCode, headers: incoming.headers, text,
          json: () => JSON.parse(text), setCookies: incoming.headers['set-cookie'] ?? [] });
      });
    });
    outgoing.on('error', reject);
    outgoing.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

function jarFrom(response) {
  const pair = (name) => response.setCookies.find((cookie) => cookie.startsWith(`${name}=`)).split(';', 1)[0];
  const cookies = [pair('tsa_local_session'), pair('tsa_local_csrf')];
  return { cookies, csrf: cookies[1].slice('tsa_local_csrf='.length) };
}

async function newGuest(demo, options = {}) {
  const response = await call(demo, '/local-auth/guest', { method: 'POST', body: {}, ...options });
  return { response, jar: response.status === 201 ? jarFrom(response) : null };
}

const processesOf = async (pattern) => {
  try { return (await run('pgrep', ['-f', pattern])).stdout.split('\n').filter(Boolean); }
  catch (error) { if (error.code === 1) return []; throw error; }
};

test('public settings need DEMO_PUBLIC=true and a canonical https origin', () => {
  assert.equal(parsePublicDemoEnvironment({}), null);
  assert.equal(parsePublicDemoEnvironment({ DEMO_PUBLIC: 'false' }), null);
  assert.throws(() => parsePublicDemoEnvironment({ DEMO_PUBLIC: 'yes' }), /true or false/);
  assert.throws(() => parsePublicDemoEnvironment({ DEMO_PUBLIC: 'true' }), /https origin/);
  for (const origin of ['http://demo.example', 'https://demo.example/', 'https://demo.example/app', 'https://user@demo.example', 'demo.example', 'https://']) {
    assert.throws(() => parsePublicDemoEnvironment({ DEMO_PUBLIC: 'true', DEMO_PUBLIC_ORIGIN: origin }), /https origin/, origin);
  }
  assert.throws(() => parsePublicDemoEnvironment({ DEMO_PUBLIC_ORIGIN: PUBLIC_ORIGIN }), /only valid with DEMO_PUBLIC=true/);
  assert.deepEqual(parsePublicDemoEnvironment({ DEMO_PUBLIC: 'true', DEMO_PUBLIC_ORIGIN: PUBLIC_ORIGIN }),
    { origin: PUBLIC_ORIGIN, guestPool: 1000, guestsPerHour: 10 });
  assert.deepEqual(parsePublicDemoEnvironment({ DEMO_PUBLIC: 'true', DEMO_PUBLIC_ORIGIN: 'https://demo.example:8443', DEMO_GUEST_POOL: '25', DEMO_GUESTS_PER_HOUR: '3' }),
    { origin: 'https://demo.example:8443', guestPool: 25, guestsPerHour: 3 });
  for (const pool of ['0', '10000', '-1', 'x', '1.5']) {
    assert.throws(() => parsePublicDemoEnvironment({ DEMO_PUBLIC: 'true', DEMO_PUBLIC_ORIGIN: PUBLIC_ORIGIN, DEMO_GUEST_POOL: pool }), /DEMO_GUEST_POOL/, pool);
  }
});

test('the runtime refuses to start in public mode without an https origin', async () => {
  const unusedArchive = { archive: '/nonexistent/archive', roles: '/nonexistent/roles' };
  for (const publicOrigin of ['http://demo.example', 'demo.example', 42]) {
    await assert.rejects(startUniDemo({ mode: 'REHEARSAL', port: 0, sourceArchive: unusedArchive, publicOrigin }), /https origin/);
  }
});

test('the public edge accepts only the public Host and Origin and maps them to loopback', () => {
  const headers = (entries) => new Headers(entries);
  const mapped = mapPublicRequest({ headers: headers({ host: 'Demo.Example', origin: PUBLIC_ORIGIN, cookie: 'a=b' }), port: 4180, publicOrigin: PUBLIC_ORIGIN });
  assert.equal(mapped.internalOrigin, 'http://127.0.0.1:4180');
  assert.equal(mapped.headers.get('host'), '127.0.0.1:4180');
  assert.equal(mapped.headers.get('origin'), 'http://127.0.0.1:4180');
  assert.equal(mapped.headers.get('cookie'), 'a=b');
  assert.equal(mapPublicRequest({ headers: headers({ host: 'demo.example' }), port: 4180, publicOrigin: PUBLIC_ORIGIN }).headers.get('origin'), null);
  for (const rejected of [{}, { host: 'evil.example' }, { host: '127.0.0.1:4180' }, { host: 'demo.example', origin: 'https://evil.example' },
    { host: 'demo.example', origin: 'http://demo.example' }, { host: 'demo.example', origin: 'null' }, { host: 'demo.example', origin: 'http://127.0.0.1:4180' }]) {
    assert.equal(mapPublicRequest({ headers: headers(rejected), port: 4180, publicOrigin: PUBLIC_ORIGIN }), null, JSON.stringify(rejected));
  }
});

test('forwarded addresses count only from the local proxy, and only its own entry', () => {
  assert.equal(resolveClientIp({ remoteAddress: '127.0.0.1' }), '127.0.0.1');
  assert.equal(resolveClientIp({ remoteAddress: '127.0.0.1', forwardedFor: '203.0.113.7' }), '203.0.113.7');
  assert.equal(resolveClientIp({ remoteAddress: '::ffff:127.0.0.1', forwardedFor: '198.51.100.1, 203.0.113.7' }), '203.0.113.7');
  // IPv6 clients share one key per /64; IPv4-mapped forms equal the IPv4 address.
  assert.equal(resolveClientIp({ remoteAddress: '::1', forwardedFor: '2001:DB8::1' }), '2001:db8:0:0::/64');
  assert.equal(resolveClientIp({ remoteAddress: '::1', forwardedFor: '2001:db8:1:2:aaaa:bbbb:cccc:dddd' }), '2001:db8:1:2::/64');
  assert.equal(resolveClientIp({ remoteAddress: '::1', forwardedFor: '2001:db8:1:2::9' }), resolveClientIp({ remoteAddress: '::1', forwardedFor: '2001:db8:1:2:ffff::1' }));
  assert.equal(resolveClientIp({ remoteAddress: '::1', forwardedFor: '::ffff:203.0.113.7' }), '203.0.113.7');
  assert.equal(resolveClientIp({ remoteAddress: '127.0.0.1', forwardedFor: 'not-an-address' }), '127.0.0.1');
  assert.equal(resolveClientIp({ remoteAddress: '127.0.0.1', forwardedFor: '' }), '127.0.0.1');
  // A peer that is not this machine cannot choose its own address.
  assert.equal(resolveClientIp({ remoteAddress: '192.0.2.50', forwardedFor: '203.0.113.7' }), '192.0.2.50');
  assert.equal(resolveClientIp({ forwardedFor: '203.0.113.7' }), 'unknown');
});

test('the guest limiter slides, isolates addresses and fails closed when full', () => {
  let clock = 1_000_000;
  const limiter = createSlidingWindowLimiter({ limit: 2, windowMilliseconds: 60_000, maxKeys: 2, now: () => clock });
  assert.equal(limiter.take('a').allowed, true);
  assert.equal(limiter.take('a').allowed, true);
  const denied = limiter.take('a');
  assert.deepEqual([denied.allowed, denied.retryAfterSeconds], [false, 60]);
  assert.equal(limiter.take('b').allowed, true);
  assert.equal(limiter.take('c').allowed, false, 'a full table denies new addresses');
  clock += 60_001;
  assert.equal(limiter.take('a').allowed, true, 'the window slides');
  assert.equal(limiter.take('c').allowed, true, 'expired entries make room');
});

test('public mode serves the student app only, to one guest per browser', { timeout: 180_000 }, async (t) => {
  const source = await buildRehearsalSource({ counts: { MATH: 6, READING: 3, SCIENCE: 5 } });
  t.after(() => source.close());
  const demo = await startUniDemo({ mode: 'REHEARSAL', port: 0, sourceArchive: source,
    publicOrigin: PUBLIC_ORIGIN, guestPool: 3, guestsPerHour: 100 });
  let closed = false;
  t.after(async () => { if (!closed) await demo.close(); });

  assert.equal(demo.publicOrigin, PUBLIC_ORIGIN);
  assert.deepEqual([demo.urls.student, demo.urls.staff], [`${PUBLIC_ORIGIN}/student/`, null]);
  assert.match(formatDemoSummary(demo), /PUBLIC MODE: student app and candidate APIs only/);
  assert.doesNotMatch(formatDemoSummary(demo), /Staff workspace/);

  await t.test('health, notice flag and security headers', async () => {
    const health = await call(demo, '/healthz');
    assert.equal(health.status, 200);
    assert.deepEqual(health.json(), { ok: true });
    assert.deepEqual(health.setCookies, []);
    assert.equal((await call(demo, '/healthz', { host: `127.0.0.1:${demo.port}` })).status, 200, 'a local probe needs no public Host');
    assert.equal((await call(demo, '/healthz', { method: 'POST' })).status, 404);

    const notice = await call(demo, '/local/demo-notice');
    assert.equal(notice.status, 200);
    assert.deepEqual(notice.json().publicDemo, { enabled: true, guestPath: '/local-auth/guest' });
    assert.equal(notice.json().contentMode, 'REHEARSAL');

    for (const response of [health, notice, await call(demo, '/student/'), await call(demo, '/'),
      await call(demo, '/local-auth/guest', { method: 'POST', body: {}, origin: 'https://evil.example' }),
      await call(demo, '/api/v1/questions'), await call(demo, '/student/assets/missing.js')]) {
      for (const [name, value] of Object.entries(PUBLIC_SECURITY_HEADERS)) {
        assert.equal(response.headers[name.toLowerCase()], value, `${name} on a ${response.status} response`);
      }
    }
    assert.match(health.headers['content-security-policy'], /script-src 'self'(;|$)/);
    assert.doesNotMatch(health.headers['content-security-policy'], /script-src[^;]*unsafe-inline/);
  });

  await t.test('staff paths, the old student UI and the mock API answer 404', async () => {
    // This guest is the first of three; the next test takes the other two.
    const guest = (await newGuest(demo)).jar;
    for (const [method, pathname] of [
      ['GET', '/'], ['GET', '/index.html'], ['GET', '/?student=postgres'], ['GET', '/styles.css'], ['GET', '/app/main.js'],
      ['GET', '/app/staff.js'], ['GET', '/vendor/katex.mjs'], ['GET', '/fonts.css'], ['GET', '/mock/api'], ['POST', '/mock/api'],
      ['POST', '/'], ['GET', '/local/workspace/template'], ['GET', '/local/anything'],
      ['POST', '/local-auth/bootstrap'], ['POST', '/local-auth/login'], ['POST', '/local-auth/logout'],
      // The admin page exists only on the loopback demo.
      ['GET', '/local/admin/session'], ['POST', '/local/admin/login'], ['GET', '/local/admin/questions'], ['GET', '/local/admin/overview'],
      ['GET', '/api/v1/questions'], ['GET', '/api/v1/sources'], ['GET', '/api/v1/bank'], ['POST', '/api/v1/questions'],
      ['GET', '/api/v2/questions'], ['GET', '/api/v4/questions'], ['GET', '/api/v1'], ['GET', '/api/v5/anything'],
    ]) {
      const response = await call(demo, pathname, { method, jar: guest, ...(method === 'POST' ? { body: {} } : {}) });
      assert.equal(response.status, 404, `${method} ${pathname}`);
      const text = response.text;
      assert.ok(text === 'Not found.' || ['NOT_FOUND'].includes(response.json().error?.code ?? response.json().error), `${method} ${pathname}: ${text}`);
      assert.doesNotMatch(text, /staff|author|reviewer|bank|question/i, `${method} ${pathname} reveals nothing`);
    }
    const student = await call(demo, '/student/');
    assert.notEqual(student.status, 404, '/student/ is served (or reports that the app is not built)');
    assert.equal((await call(demo, '/student')).status, 308);
    assert.equal((await call(demo, '/student/../package.json')).status, 404);
  });

  await t.test('a wrong Host or Origin is rejected', async () => {
    for (const host of ['evil.example', `127.0.0.1:${demo.port}`, 'demo.example.evil.example']) {
      assert.equal((await call(demo, '/student/', { host })).status, 403, host);
      assert.equal((await call(demo, '/api/v1/catalog', { host })).status, 403, host);
    }
    for (const origin of ['https://evil.example', 'http://demo.example', 'null', `http://127.0.0.1:${demo.port}`]) {
      assert.equal((await call(demo, '/local-auth/guest', { method: 'POST', body: {}, origin })).status, 403, origin);
    }
    // Public mode requires the Origin header on a session start, like the local handler does.
    const noOrigin = await new Promise((resolve, reject) => {
      const outgoing = httpRequest({ host: '127.0.0.1', port: demo.port, path: '/local-auth/guest', method: 'POST',
        headers: { host: 'demo.example', 'content-type': 'application/json' } }, (incoming) => { incoming.resume(); resolve(incoming.statusCode); });
      outgoing.on('error', reject);
      outgoing.end('{}');
    });
    assert.equal(noOrigin, 403);
  });

  await t.test('each browser gets its own guest and cannot reach another visitor\'s attempt', async () => {
    const first = await newGuest(demo);
    assert.equal(first.response.status, 201, first.response.text);
    const firstBody = first.response.json();
    assert.equal(firstBody.authenticated, true);
    assert.deepEqual(firstBody.principal.roles, ['CANDIDATE']);
    assert.equal(firstBody.principal.actorKey, 'guest');
    assert.equal(firstBody.csrfToken, first.jar.csrf);
    const [sessionCookie, csrfCookie] = first.response.setCookies;
    for (const cookie of [sessionCookie, csrfCookie]) assert.match(cookie, /; Secure/, cookie.split('=')[0]);
    for (const cookie of [sessionCookie, csrfCookie]) assert.match(cookie, /; SameSite=Lax/);
    assert.match(sessionCookie, /; HttpOnly/);
    assert.doesNotMatch(csrfCookie, /HttpOnly/, 'the client reads the CSRF cookie');

    const session = await call(demo, '/local-auth/session', { jar: first.jar });
    assert.equal(session.json().principal.userId, firstBody.principal.userId);

    // The same cookie keeps the same guest and consumes nothing.
    const resumed = await call(demo, '/local-auth/guest', { method: 'POST', body: {}, jar: first.jar });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.json().principal.userId, firstBody.principal.userId);
    assert.deepEqual(resumed.setCookies, []);
    assert.equal((await call(demo, '/local-auth/guest', { method: 'POST', body: {}, jar: { ...first.jar, csrf: '' } })).status, 403,
      'resuming needs the CSRF header');

    const second = await newGuest(demo);
    assert.equal(second.response.status, 201);
    assert.notEqual(second.response.json().principal.userId, firstBody.principal.userId);

    const exhausted = await newGuest(demo);
    assert.equal(exhausted.response.status, 503);
    assert.deepEqual(exhausted.response.json(), { error: 'GUEST_POOL_EXHAUSTED', message: GUEST_POOL_EXHAUSTED_MESSAGE });
    assert.equal(GUEST_POOL_EXHAUSTED_MESSAGE, 'Bản demo đã đủ lượt truy cập, vui lòng thử lại sau.');
    assert.equal((await call(demo, '/local-auth/guest', { method: 'POST', body: {}, jar: first.jar })).status, 200, 'holders keep working');

    const catalog = await call(demo, '/api/v1/catalog?limit=100', { jar: first.jar });
    assert.equal(catalog.status, 200, catalog.text);
    assert.equal((await call(demo, '/api/v3/catalog?limit=100', { jar: first.jar })).status, 200);
    assert.equal((await call(demo, '/api/v1/catalog?limit=100')).status, 401, 'no cookie, no catalog');
    const math = demo.report.offerings.find((offering) => offering.section === 'MATH');
    const created = await call(demo, '/api/v1/attempts', { method: 'POST', jar: first.jar, headers: { 'idempotency-key': randomUUID() },
      body: { blueprintVersionId: math.blueprintVersionId } });
    assert.equal(created.status, 201, created.text);
    const { attemptId } = created.json();
    assert.equal((await call(demo, `/api/v1/attempts/${attemptId}/start`, { method: 'POST', jar: first.jar,
      headers: { 'idempotency-key': randomUUID() }, body: {} })).status, 200);
    assert.equal((await call(demo, `/api/v1/attempts/${attemptId}`, { jar: first.jar })).status, 200);
    const foreign = await call(demo, `/api/v1/attempts/${attemptId}`, { jar: second.jar });
    assert.ok([403, 404].includes(foreign.status), `another guest reads nothing (got ${foreign.status})`);
    assert.doesNotMatch(foreign.text, /slots|Câu diễn tập/);
    const foreignStart = await call(demo, `/api/v1/attempts/${attemptId}/start`, { method: 'POST', jar: second.jar,
      headers: { 'idempotency-key': randomUUID() }, body: {} });
    assert.ok([403, 404].includes(foreignStart.status), `another guest cannot act on it (got ${foreignStart.status})`);
  });

  const before = await processesOf(demo.demoDirectory);
  assert.ok(before.length > 0, 'the demo database is running before close');
  await demo.close();
  closed = true;
  assert.deepEqual(await processesOf(demo.demoDirectory), [], 'no postgres process of this demo survives close');
});

test('guest creation is limited per address, using the proxy-appended forwarded address only', { timeout: 180_000 }, async (t) => {
  const source = await buildRehearsalSource({ counts: { MATH: 6, READING: 3, SCIENCE: 5 } });
  t.after(() => source.close());
  const demo = await startUniDemo({ mode: 'REHEARSAL', port: 0, sourceArchive: source,
    publicOrigin: PUBLIC_ORIGIN, guestPool: 10, guestsPerHour: 2 });
  t.after(() => demo.close());
  const from = (address) => ({ headers: { 'x-forwarded-for': address } });

  const one = await newGuest(demo, from('203.0.113.7'));
  assert.equal(one.response.status, 201);
  assert.equal((await newGuest(demo, from('203.0.113.7'))).response.status, 201);
  const limited = await newGuest(demo, from('203.0.113.7'));
  assert.equal(limited.response.status, 429);
  assert.deepEqual(limited.response.json(), { error: 'GUEST_RATE_LIMITED' });
  assert.ok(Number(limited.response.headers['retry-after']) >= 1);
  // A client cannot dodge the limit by prepending addresses; the proxy's own entry is the last one.
  assert.equal((await newGuest(demo, from('198.51.100.9, 203.0.113.7'))).response.status, 429);
  assert.equal((await newGuest(demo, from('198.51.100.20'))).response.status, 201, 'another address has its own allowance');
  // Resuming a guest does not use the allowance.
  assert.equal((await call(demo, '/local-auth/guest', { method: 'POST', body: {}, jar: one.jar, ...from('203.0.113.7') })).status, 200);
});

test('public mode proves its test-creation speedups and still builds a complete 40/20/40 test', { timeout: 240_000 }, async (t) => {
  const source = await buildRehearsalSource();
  t.after(() => source.close());
  const demo = await startUniDemo({ mode: 'REHEARSAL', port: 0, sourceArchive: source,
    publicOrigin: PUBLIC_ORIGIN, guestPool: 4, guestsPerHour: 100 });
  t.after(() => demo.close());

  // The start itself compared the cached source function with the original for every version, checked the
  // fallback and the execute rights, and would have refused to start on any difference.
  const { speedups } = demo.report;
  assert.ok(speedups.sourceCache.versions >= 130, `cached ${speedups.sourceCache.versions} versions`);
  assert.ok(speedups.sourceCache.rows >= 130);
  assert.deepEqual(speedups.nestedLoopsOffFor, ['tsa.assembly_standalone_stock(uuid)',
    'tsa.assembly_commit_simulation(text,text,jsonb)', 'tsa.assembly_commit_personal(text,text,jsonb)']);
  assert.equal(demo.report.fullSimulation.offered, true);

  const guest = (await newGuest(demo)).jar;
  const offers = (await call(demo, '/api/v3/catalog?limit=100', { jar: guest })).json().items;
  const started = Date.now();
  const created = await call(demo, '/api/v3/attempts', { method: 'POST', jar: guest,
    headers: { 'idempotency-key': randomUUID() }, body: { blueprintVersionId: offers[0].blueprintVersionId } });
  assert.equal(created.status, 201, created.text);
  assert.ok(Date.now() - started < 30_000, 'creation finishes in a bounded time');
  const attempt = created.json();
  assert.equal(attempt.questionCount, 100);
  await call(demo, `/api/v3/attempts/${attempt.attemptId}/start`, { method: 'POST', jar: guest, headers: { 'idempotency-key': randomUUID() }, body: {} });
  const view = (await call(demo, `/api/v3/attempts/${attempt.attemptId}`, { jar: guest })).json();
  assert.equal(view.slots.length, 40, 'the first section delivers its 40 questions');
  assert.ok(view.slots.every((slot) => slot.sectionId === view.slots[0].sectionId));
});

test('SIGTERM stops the public launcher and leaves no database process behind', { timeout: 180_000 }, async (t) => {
  const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => resolve(free)); });
  });
  const known = new Set(await processesOf('tsa-uni-demo-'));
  const launcher = spawn(process.execPath, ['scripts/start-uni-demo.mjs', '--rehearsal'], {
    env: { ...process.env, DEMO_PUBLIC: 'true', DEMO_PUBLIC_ORIGIN: PUBLIC_ORIGIN, DEMO_GUEST_POOL: '5', DEMO_UNI_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (launcher.exitCode === null) launcher.kill('SIGKILL'); });
  let output = '', errors = '';
  launcher.stdout.setEncoding('utf8'); launcher.stderr.setEncoding('utf8');
  launcher.stderr.on('data', (text) => { errors += text; });
  const ready = new Promise((resolve, reject) => {
    launcher.stdout.on('data', (text) => { output += text; if (output.includes('"event":"ready"')) resolve(); });
    launcher.once('close', () => reject(new Error(`the launcher stopped before it was ready: ${errors}`)));
  });
  await ready;
  const readyEvent = JSON.parse(output.split('\n').find((line) => line.includes('"event":"ready"')));
  assert.equal(readyEvent.urls.student, `${PUBLIC_ORIGIN}/student/`);
  assert.equal(readyEvent.urls.staff, null);
  assert.equal((await call({ port }, '/healthz')).status, 200);
  assert.equal((await call({ port }, '/')).status, 404);
  assert.ok((await processesOf('tsa-uni-demo-')).some((pid) => !known.has(pid)), 'the launcher owns a database process while running');

  launcher.kill('SIGTERM');
  const [code] = await once(launcher, 'close');
  assert.equal(code, 0, errors);
  assert.deepEqual((await processesOf('tsa-uni-demo-')).filter((pid) => !known.has(pid)), [], 'no new postgres process remains');
  await assert.rejects(call({ port }, '/healthz'), 'the listener is closed');
});

test('the launcher refuses public mode without a valid origin before any database work', async () => {
  const result = await run(process.execPath, ['scripts/start-uni-demo.mjs', '--rehearsal'], {
    env: { ...process.env, DEMO_PUBLIC: 'true', DEMO_UNI_PORT: '1' }, timeout: 60_000,
  }).then(() => null, (error) => error);
  assert.ok(result, 'the launcher exits with a failure');
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /DEMO_PUBLIC=true requires DEMO_PUBLIC_ORIGIN/);
});
