// The local admin page: one AdminBao account on the loopback demo, the whole Bank, inbox import and publication
// through the owner commands, and AI questions through OpenAI when a key is set (owner decision 2026-11-22).
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { ADMIN_USERNAME, createAdminAuth, hashPassword, verifyPassword } from '../../../src/local/admin/admin-auth.mjs';
import { blocksText } from '../../../src/local/admin/admin-bank.mjs';
import { confirmationFromOutput, createAdminJobs, inboxFileName } from '../../../src/local/admin/admin-jobs.mjs';
import { batchDate, createMessage, generateQuestions, nextBatchLetter } from '../../../src/local/admin/admin-generate.mjs';
import { startUniDemo } from '../../../src/local/uni-demo.mjs';
import { buildRehearsalSource } from '../../../scripts/uni-demo-rehearsal-source.mjs';

const ORIGIN = 'http://127.0.0.1:4180';
const post = (url, headers = {}) => new Request(url, { method: 'POST', headers: { origin: ORIGIN, ...headers } });

test('the admin account checks the password, origin, session and CSRF, and locks after repeated failures', () => {
  let clock = 1_000_000;
  const auth = createAdminAuth({ trustedOrigin: ORIGIN, env: { DEMO_ADMIN_PASSWORD: 'test-secret' }, now: () => clock });
  assert.throws(() => createAdminAuth({ trustedOrigin: 'https://tsa.example' }), /loopback/);
  assert.equal(auth.login(post(`${ORIGIN}/local/admin/login`), { username: ADMIN_USERNAME, password: 'nope' }).code, 'INVALID_CREDENTIALS');
  assert.equal(auth.login(post(`${ORIGIN}/local/admin/login`), { username: 'adminbao', password: 'test-secret' }).ok, false, 'the name is exact');
  assert.equal(auth.login(new Request(`${ORIGIN}/x`, { method: 'POST', headers: { origin: 'http://evil.example' } }),
    { username: ADMIN_USERNAME, password: 'test-secret' }).code, 'ORIGIN_REJECTED');
  assert.equal(auth.login(post('http://127.0.0.1:9999/local/admin/login'), { username: ADMIN_USERNAME, password: 'test-secret' }).code,
    'ORIGIN_REJECTED', 'another Host is refused');

  const ok = auth.login(post(`${ORIGIN}/local/admin/login`), { username: ADMIN_USERNAME, password: 'test-secret' });
  assert.equal(ok.ok, true);
  const cookie = auth.cookie(ok.token, ok.expiresAt);
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\/local\/admin\//);
  const jar = { cookie: cookie.split(';')[0] };
  assert.equal(auth.session(new Request(`${ORIGIN}/local/admin/overview`, { headers: jar }))?.username, ADMIN_USERNAME);
  assert.equal(auth.mutation(post(`${ORIGIN}/local/admin/inbox/run`, jar)), null, 'no CSRF header');
  assert.equal(auth.mutation(post(`${ORIGIN}/local/admin/inbox/run`, { ...jar, 'x-admin-csrf': 'x'.repeat(43) })), null, 'wrong CSRF');
  assert.ok(auth.mutation(post(`${ORIGIN}/local/admin/inbox/run`, { ...jar, 'x-admin-csrf': ok.csrf })));
  assert.equal(auth.mutation(new Request(`${ORIGIN}/local/admin/inbox/run`, { method: 'POST', headers: { ...jar, 'x-admin-csrf': ok.csrf } })),
    null, 'a state change needs the Origin header');
  clock += 9 * 60 * 60 * 1000;
  assert.equal(auth.session(new Request(`${ORIGIN}/local/admin/overview`, { headers: jar })), null, 'sessions expire after 8 hours');

  for (let attempt = 0; attempt < 5; attempt++) auth.login(post(`${ORIGIN}/local/admin/login`), { username: ADMIN_USERNAME, password: 'bad' });
  assert.equal(auth.login(post(`${ORIGIN}/local/admin/login`), { username: ADMIN_USERNAME, password: 'test-secret' }).code, 'LOCKED');
  clock += 16 * 60 * 1000;
  assert.equal(auth.login(post(`${ORIGIN}/local/admin/login`), { username: ADMIN_USERNAME, password: 'test-secret' }).ok, true, 'the lock ends');

  const stored = hashPassword('another');
  assert.equal(verifyPassword('another', stored), true);
  assert.equal(verifyPassword('Another', stored), false);
  assert.doesNotMatch(stored, /another/);
});

test('job helpers read the printed confirmation and keep inbox file names safe', async () => {
  assert.equal(confirmationFromOutput('Dry run only. To import 3 file(s)...\n  npm run questions:inbox -- --confirm "IMPORT 20"'), 'IMPORT 20');
  assert.equal(confirmationFromOutput('a --confirm "PUBLISH 1 ALL"\nb --confirm "PUBLISH 4 ALL"'), 'PUBLISH 4 ALL');
  assert.equal(confirmationFromOutput('nothing to do'), null);
  assert.equal(inboxFileName('../../etc/passwd', '20261122-1200'), '20261122-1200-passwd.json');
  assert.equal(inboxFileName('GPT Math (1).md', 'S'), 'S-GPT-Math-1-.md');
  assert.equal(inboxFileName('', 'S'), 'S-pasted.json');
  assert.equal(blocksText([{ type: 'text', text: 'Cho' }, { type: 'math', tex: 'x^2' }, { type: 'table', headers: ['a'], rows: [['1']] }]), 'Cho x^2 a 1');

  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-admin-jobs-'));
  try {
    const calls = [];
    let changed = 0;
    const jobs = createAdminJobs({ dataDirectory: path.join(root, 'bank'), inboxDirectory: path.join(root, 'inbox'),
      runCommand: async (args, env) => { calls.push({ args, env }); return { exitCode: 0, output: 'run with --confirm "IMPORT 2"' }; },
      onBankChanged: async () => { changed += 1; } });
    const saved = await jobs.saveInboxFile({ section: 'SCIENCE', fileName: 'set.json', text: '{"questions":[]}' });
    assert.equal(saved.ok, true);
    assert.deepEqual(await readdir(path.join(root, 'inbox', 'science')), [saved.name]);
    assert.equal((await jobs.saveInboxFile({ section: 'ART', fileName: 'a.json', text: '{}' })).code, 'INVALID_SECTION');
    assert.equal((await jobs.saveInboxFile({ section: 'MATH', fileName: 'a.json', text: '  ' })).code, 'EMPTY_FILE');
    assert.equal((await jobs.saveInboxFile({ section: 'MATH', fileName: 'a.json', text: 'x'.repeat(1024 * 1024) })).code, 'FILE_TOO_LARGE');
    assert.equal((await jobs.listInbox()).SCIENCE.pending.count, 1);

    const dry = await jobs.inbox();
    assert.equal(dry.confirmation, 'IMPORT 2');
    assert.equal(changed, 0, 'a dry run changes nothing');
    await jobs.inbox({ confirm: 'IMPORT 2' });
    assert.equal(changed, 1, 'a confirmed import re-reads the Bank');
    assert.deepEqual(calls[1].args.slice(1), ['--confirm', 'IMPORT 2']);
    assert.equal(calls[1].env.TRACK_B_DATA_DIRECTORY, path.join(root, 'bank'));
    assert.equal((await jobs.publish({ taxonomyVersionId: null })).code, 'POOL_NOT_REGISTERED');
    const pool = '11111111-1111-4111-8111-111111111111';
    await jobs.publish({ taxonomyVersionId: pool, section: 'MATH', keepOneOfTwins: true });
    assert.deepEqual(calls.at(-1).args.slice(1), ['--taxonomy-version', pool, '--section', 'MATH', '--keep-one-of-twins']);
    assert.match(calls.at(-1).args[0], /owner-publish\.mjs$/);

    const rehearsal = createAdminJobs({ dataDirectory: null, runCommand: async () => assert.fail('no job may run without a retained Bank') });
    assert.equal((await rehearsal.inbox()).code, 'NO_RETAINED_BANK');
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Figures for image requests are saved under the inbox naming rule, a rejected file can go back to the inbox, and one
// question's status or section is changed through the owner command with a dry run first.
test('admin jobs save figures, return rejected files to the inbox and change one question', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-admin-figures-'));
  try {
    const calls = [];
    let changed = 0;
    const jobs = createAdminJobs({ dataDirectory: path.join(root, 'bank'), inboxDirectory: path.join(root, 'inbox'),
      runCommand: async (args) => { calls.push(args); return { exitCode: 0, output: 'Dry run only. To apply, run again with --confirm "MOVE 11111111 TO SCIENCE".' }; },
      onBankChanged: async () => { changed += 1; } });
    const png = (await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).png().toBuffer()).toString('base64');
    const saved = await jobs.saveFigure({ section: 'MATH', fileName: 'MATH-S261122A-000031_NEW-IMG-001.png', base64: png });
    assert.deepEqual(saved, { ok: true, section: 'MATH', name: 'MATH-S261122A-000031_NEW-IMG-001.png' });
    assert.equal((await jobs.saveFigure({ section: 'MATH', fileName: 'figure.png', base64: png })).code, 'FIGURE_NAME_INVALID');
    assert.equal((await jobs.saveFigure({ section: 'MATH', fileName: '../MATH-S1-000001_NEW-IMG-001.png', base64: png })).ok, true, 'only the base name is used');
    assert.equal((await jobs.saveFigure({ section: 'MATH', fileName: 'MATH-S1-000002_NEW-IMG-001.png', base64: Buffer.from('<svg/>').toString('base64') })).code, 'FIGURE_NOT_IMAGE');
    assert.equal((await jobs.saveFigure({ section: 'MATH', fileName: 'MATH-S1-000002_NEW-IMG-001.png', base64: 'not base64!' })).code, 'EMPTY_FILE');

    // A rejected answer lists the figures its image requests need, read from its JSON, and goes back without its message.
    const rejected = path.join(root, 'inbox', 'math', 'rejected');
    await mkdir(rejected, { recursive: true });
    const answer = { format: 'tsa-question-set/1', batch_id: 'SRC-MATH-261122-A-P4', passages: [], questions: [{ question_id: 'MATH-S261122A-000031',
      content_blocks: [{ type: 'image_request', request_id: 'NEW-IMG-001', description: 'graph', alt: 'graph' }] }] };
    await writeFile(path.join(rejected, '20261122-152008-20261122-151944-P4.json'), JSON.stringify(answer));
    await writeFile(path.join(rejected, '20261122-152008-20261122-151944-P4.json.errors.txt'), '- MATH-S261122A-000031: [ASSET_REQUIRED] ...');
    const listing = (await jobs.listInbox()).MATH;
    assert.equal(listing.rejected.count, 1, 'the .errors.txt message is not listed as a file of its own');
    assert.deepEqual(listing.rejected.items[0].figures, ['MATH-S261122A-000031_NEW-IMG-001.png']);
    assert.equal(listing.figures.count, 2);
    assert.deepEqual(await jobs.retryRejected({ section: 'MATH', name: '20261122-152008-20261122-151944-P4.json' }),
      { ok: true, section: 'MATH', name: '20261122-151944-P4.json' });
    assert.deepEqual(await readdir(rejected), []);
    assert.deepEqual((await jobs.listInbox()).MATH.pending.items.map((item) => [item.name, item.figures]), [['20261122-151944-P4.json', ['MATH-S261122A-000031_NEW-IMG-001.png']]]);
    assert.equal((await jobs.retryRejected({ section: 'MATH', name: '../../secret.json' })).code, 'NOT_FOUND');

    const version = '11111111-1111-4111-8111-111111111111';
    assert.equal((await jobs.change({ versionId: 'x', action: 'PUBLISH' })).code, 'INVALID_VERSION');
    assert.equal((await jobs.change({ versionId: version, action: 'WITHHOLD', reason: 'no' })).code, 'REASON_REQUIRED');
    assert.equal((await jobs.change({ versionId: version, action: 'MOVE', section: 'ART' })).code, 'INVALID_SECTION');
    const dry = await jobs.change({ versionId: version, action: 'MOVE', section: 'SCIENCE' });
    assert.equal(dry.confirmation, 'MOVE 11111111 TO SCIENCE');
    assert.equal(changed, 0);
    await jobs.change({ versionId: version, action: 'WITHHOLD', reason: 'key to check', confirm: 'WITHHOLD 11111111' });
    assert.match(calls.at(-1)[0], /question-change\.mjs$/);
    assert.deepEqual(calls.at(-1).slice(1), ['--version', version, '--withhold', '--reason', 'key to check', '--confirm', 'WITHHOLD 11111111']);
    assert.equal(changed, 1, 'a confirmed change re-reads the Bank');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('AI generation needs a key, sends the Project instructions and saves the reply into the inbox', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-admin-generate-'));
  try {
    const inboxDirectory = path.join(root, 'inbox');
    assert.equal((await generateQuestions({ section: 'MATH', inboxDirectory, env: {} })).code, 'NO_API_KEY');
    const now = new Date('2026-11-22T10:00:00Z');
    const yymmdd = batchDate(now);
    assert.equal(yymmdd, '261122');
    await mkdir(path.join(inboxDirectory, 'math', 'imported'), { recursive: true });
    await writeFile(path.join(inboxDirectory, 'math', 'imported', 'old.json'), `{"batch_id":"GPT-MATH-${yymmdd}-A"}`);
    assert.equal(nextBatchLetter([`GPT-MATH-${yymmdd}-A`, `GPT-MATH-${yymmdd}-B`, `GPT-READING-${yymmdd}-C`], 'MATH', yymmdd), 'C');
    assert.match(createMessage({ topic: 'CALCULUS', count: 4, letter: 'B', yymmdd }), /^CREATE · topic CALCULUS · 4 questions · default 4\/3\/3 mix · batch letter B/);

    const document = { schema_version: 'tsa-question-set/1', batch_id: `GPT-MATH-${yymmdd}-B`, questions: [] };
    let sent;
    const fetchImpl = async (url, init) => {
      sent = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: `Report: 0 questions.\n\n\`\`\`json\n${JSON.stringify(document)}\n\`\`\`` } }] }), { status: 200 });
    };
    const result = await generateQuestions({ section: 'MATH', topic: 'CALCULUS', count: 4, inboxDirectory, now, fetchImpl,
      env: { OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'test-model' } });
    assert.equal(result.ok, true);
    assert.equal(sent.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(sent.init.headers.authorization, 'Bearer sk-test');
    assert.equal(sent.body.model, 'test-model');
    assert.match(sent.body.messages[0].content, /TSA MATH question agent/, 'the Project instructions are the system prompt');
    assert.match(sent.body.messages[0].content, /===== AGENT\.md =====/);
    assert.match(sent.body.messages[1].content, /batch letter B/, 'letter A was already used today');
    assert.equal(result.file, `math/GPT-MATH-${yymmdd}-B-openai.json`);
    assert.deepEqual(JSON.parse(await readFile(path.join(inboxDirectory, result.file), 'utf8')), document);
    assert.ok(result.problems.length > 0, 'an empty set is reported by the validator, not hidden');
    assert.equal(result.report, 'Report: 0 questions.');

    const refused = await generateQuestions({ section: 'MATH', inboxDirectory, now, env: { OPENAI_API_KEY: 'sk-bad' },
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided.' } }), { status: 401 }) });
    assert.deepEqual([refused.ok, refused.code, refused.status, refused.message], [false, 'PROVIDER_ERROR', 401, 'Incorrect API key provided.']);
    assert.equal((await generateQuestions({ section: 'ART', inboxDirectory, env: { OPENAI_API_KEY: 'k' } })).code, 'INVALID_SECTION');
    assert.equal((await generateQuestions({ section: 'MATH', count: 11, inboxDirectory, env: { OPENAI_API_KEY: 'k' } })).code, 'INVALID_COUNT');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the local demo starts guests, hides the old staff home and serves the whole Bank to AdminBao only', { timeout: 240_000 }, async (t) => {
  const source = await buildRehearsalSource({});
  t.after(() => source.close());
  const demo = await startUniDemo({ mode: 'REHEARSAL', port: 0, sourceArchive: source, adminEnv: { DEMO_ADMIN_PASSWORD: 'rehearsal-secret' } });
  t.after(() => demo.close());
  const origin = demo.origin;
  assert.equal(demo.urls.staff, null);
  assert.equal(demo.urls.admin, `${origin}/student/?page=admin`);

  const home = await fetch(`${origin}/`, { redirect: 'manual' });
  assert.deepEqual([home.status, home.headers.get('location')], [303, '/student/']);
  const notice = await (await fetch(`${origin}/local/demo-notice`)).json();
  assert.deepEqual(notice.localGuests, { guestPath: '/local-auth/guest', adminPath: '/student/?page=admin' });
  assert.equal(notice.publicDemo, undefined);

  const started = await fetch(`${origin}/local-auth/guest`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(started.status, 201);
  const guestCookies = started.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.doesNotMatch(started.headers.getSetCookie().join('\n'), /Secure/, 'loopback http keeps cookies without Secure');
  const catalog = await fetch(`${origin}/api/v1/catalog?limit=100`, { headers: { cookie: guestCookies } });
  assert.equal(catalog.status, 200);
  assert.equal((await catalog.json()).items.length, 3);
  const other = await fetch(`${origin}/local-auth/guest`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
  assert.notEqual((await other.json()).principal.userId, (await (await fetch(`${origin}/local-auth/session`, { headers: { cookie: guestCookies } })).json()).principal.userId,
    'every browser gets its own guest');

  assert.equal((await fetch(`${origin}/local/admin/questions`)).status, 401);
  assert.equal((await fetch(`${origin}/local/admin/questions`, { headers: { cookie: guestCookies } })).status, 401, 'a student session is not an admin session');
  const login = (password) => fetch(`${origin}/local/admin/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'AdminBao', password }) });
  assert.equal((await login('wrong')).status, 401);
  const signedIn = await login('rehearsal-secret');
  assert.equal(signedIn.status, 200);
  const admin = { cookie: signedIn.headers.getSetCookie()[0].split(';')[0] };
  const { csrf } = await signedIn.json();

  const overview = await (await fetch(`${origin}/local/admin/overview`, { headers: admin })).json();
  assert.equal(overview.contentMode, 'REHEARSAL');
  assert.deepEqual(overview.counts.MATH, { APPROVED: 100, IN_REVIEW: 3, DRAFT: 2 }, 'drafts and versions in review are included');
  assert.equal(overview.jobs.available, false);
  const { items } = await (await fetch(`${origin}/local/admin/questions`, { headers: admin })).json();
  assert.equal(items.length, overview.total);
  assert.doesNotMatch(JSON.stringify(items), /answerKey|explanation/, 'the list carries no keys');
  const draft = items.find((item) => item.state === 'DRAFT');
  const detail = await (await fetch(`${origin}/local/admin/question?id=${draft.versionId}`, { headers: admin })).json();
  assert.equal(detail.state, 'DRAFT');
  assert.ok(detail.answerKey?.type, 'the admin sees the private key');
  assert.equal((await fetch(`${origin}/local/admin/question?id=not-a-uuid`, { headers: admin })).status, 404);

  const mutate = (route, body, headers = {}) => fetch(`${origin}/local/admin/${route}`, { method: 'POST',
    headers: { ...admin, origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await mutate('inbox/run', {})).status, 403, 'no CSRF header');
  assert.equal((await mutate('inbox/run', {}, { 'x-admin-csrf': csrf })).status, 200);
  assert.equal((await (await mutate('inbox/run', {}, { 'x-admin-csrf': csrf })).json()).code, 'NO_RETAINED_BANK');
  assert.equal((await mutate('inbox/file', { section: 'MATH', fileName: 'a.json', text: '{}' }, { 'x-admin-csrf': csrf })).status, 409);
  const logout = await mutate('logout', {}, { 'x-admin-csrf': csrf });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${origin}/local/admin/overview`, { headers: admin })).status, 401, 'the session ends at sign-out');
});
