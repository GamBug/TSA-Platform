// Live checks against a deployed public demo: guest isolation, answer leakage, a concurrent section load
// and concurrent full 40/20/40 tests. No dependency beyond Node's fetch. Reads only; every guest is synthetic.
//   node scripts/verify-public-live.mjs https://<host> [--guests 50] [--full 10] [--skip-load]
// Needs DEMO_GUESTS_PER_HOUR on the server to be at least guests + full + 4, or creation answers 429.
import { randomUUID } from 'node:crypto';

const [origin, ...flags] = process.argv.slice(2);
if (!origin?.startsWith('https://')) { console.error('Usage: node scripts/verify-public-live.mjs https://<host> [--guests N] [--full N] [--skip-load]'); process.exit(2); }
const flagValue = (name, fallback) => { const at = flags.indexOf(name); return at >= 0 ? Number(flags[at + 1]) : fallback; };
const GUESTS = flagValue('--guests', 50), FULL = flagValue('--full', 10), SKIP_LOAD = flags.includes('--skip-load');
const results = { checks: [], failures: [], latencies: [], statuses: {} };

function note(ok, label, detail = '') {
  results.checks.push({ ok, label, detail });
  if (!ok) results.failures.push(`${label} ${detail}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

class Guest {
  constructor() { this.cookies = new Map(); this.csrf = ''; }
  async call(method, path, body) {
    const headers = { accept: 'application/json', origin, cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') };
    if (method !== 'GET') { headers['x-csrf-token'] = this.csrf; headers['content-type'] = 'application/json'; headers['idempotency-key'] = randomUUID(); }
    const started = performance.now();
    let response, text = '';
    try {
      response = await fetch(origin + path, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}), signal: AbortSignal.timeout(300_000) });
      text = await response.text();
    } catch (error) {
      results.statuses.NETWORK = (results.statuses.NETWORK ?? 0) + 1;
      return { status: 0, json: null, text: String(error) };
    }
    results.latencies.push(performance.now() - started);
    results.statuses[response.status] = (results.statuses[response.status] ?? 0) + 1;
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'); const at = pair.indexOf('=');
      this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
      if (pair.startsWith('tsa_local_csrf=')) this.csrf = pair.slice('tsa_local_csrf='.length);
    }
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: response.status, json, text };
  }
  async start() { const r = await this.call('POST', '/local-auth/guest', {}); if (r.status !== 201) throw new Error(`guest ${r.status} ${r.text.slice(0, 120)}`); return r.json; }
}

/** A plausible answer for any choice-type slot; other types are left unanswered. */
function answerFor(slot) {
  const it = slot.interaction;
  if (it.type === 'SINGLE_CHOICE') return { type: it.type, optionId: it.options[0].id };
  if (it.type === 'MULTIPLE_CHOICE') return { type: it.type, optionIds: [it.options[0].id] };
  if (it.type === 'TRUE_FALSE_GROUP') return { type: it.type, values: Object.fromEntries(it.statements.map(({ id }) => [id, true])) };
  return null;
}

const pick = (items, test) => items.find(test);
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0; };

async function fillAndSubmit(guest, base, view, label, sectionFilter) {
  let saved = 0;
  const revisions = new Map((view.answers ?? []).map((a) => [a.slotId, a.revision]));
  for (const slot of view.slots) {
    if (sectionFilter && slot.sectionId !== sectionFilter) continue;
    const value = answerFor(slot); if (!value) continue;
    const r = await guest.call('PUT', `${base}/answers/${slot.slotId}`, { expectedRevision: revisions.get(slot.slotId) ?? 0, value });
    if (r.status >= 300) throw new Error(`${label} save ${r.status} ${r.text.slice(0, 160)}`);
    saved += 1;
  }
  return saved;
}

async function sectionRun(index) {
  const guest = new Guest(); await guest.start();
  const catalog = (await guest.call('GET', '/api/v1/catalog?limit=100')).json;
  const math = pick(catalog.items, (item) => item.domain === 'MATH');
  const created = await guest.call('POST', '/api/v1/attempts', { blueprintVersionId: math.blueprintVersionId });
  if (created.status !== 201) throw new Error(`create ${created.status} ${created.text.slice(0, 120)}`);
  const id = created.json.attemptId, base = `/api/v1/attempts/${id}`;
  const started = await guest.call('POST', `${base}/start`, {}); if (started.status >= 300) throw new Error(`start ${started.status}`);
  const view = (await guest.call('GET', base)).json;
  await fillAndSubmit(guest, base, view, `section ${index}`);
  const submitted = await guest.call('POST', `${base}/submit`, {}); if (submitted.status >= 300) throw new Error(`submit ${submitted.status} ${submitted.text.slice(0, 120)}`);
  let after = (await guest.call('GET', `${base}/result`)).json;
  for (let i = 0; i < 60 && after?.totalCount === undefined; i += 1) { await new Promise((r) => setTimeout(r, 1000)); after = (await guest.call('GET', `${base}/result`)).json; }
  return { total: after?.totalCount, correct: after?.correctCount };
}

async function fullRun(index) {
  const guest = new Guest(); await guest.start();
  const offer = (await guest.call('GET', '/api/v3/catalog?limit=100')).json.items[0];
  const created = await guest.call('POST', '/api/v3/attempts', { blueprintVersionId: offer.blueprintVersionId });
  if (created.status !== 201) throw new Error(`create ${created.status} ${created.text.slice(0, 120)}`);
  const base = `/api/v3/attempts/${created.json.attemptId}`;
  const started = await guest.call('POST', `${base}/start`, {}); if (started.status >= 300) throw new Error(`start ${started.status} ${started.text.slice(0, 120)}`);
  let saved = 0;
  for (const section of ['math', 'reading', 'science']) {
    if (section !== 'math') { const sw = await guest.call('POST', `${base}/section`, { sectionId: section }); if (sw.status >= 300) throw new Error(`switch ${section} ${sw.status} ${sw.text.slice(0, 120)}`); }
    const view = (await guest.call('GET', base)).json;
    saved += await fillAndSubmit(guest, base, view, `full ${index} ${section}`, section);
  }
  const submitted = await guest.call('POST', `${base}/submit`, {}); if (submitted.status >= 300) throw new Error(`submit ${submitted.status} ${submitted.text.slice(0, 120)}`);
  let result = (await guest.call('GET', `${base}/result`)).json;
  for (let i = 0; i < 60 && result?.totalCount === undefined; i += 1) { await new Promise((r) => setTimeout(r, 1000)); result = (await guest.call('GET', `${base}/result`)).json; }
  return { saved, total: result.totalCount, correct: result.correctCount, sections: result.sections?.map((s) => `${s.sectionId} ${s.correctCount}/${s.totalCount}`) };
}

/** Run tasks with every one started at once, collecting successes and failures. */
async function together(count, task) {
  const settled = await Promise.allSettled(Array.from({ length: count }, (_, i) => task(i)));
  return { ok: settled.filter((s) => s.status === 'fulfilled').map((s) => s.value), errors: settled.filter((s) => s.status === 'rejected').map((s) => String(s.reason?.message ?? s.reason)) };
}

// ---- 1. Surface, isolation and leakage ----
const probe = async (path) => (await fetch(origin + path, { redirect: 'manual' })).status;
note((await probe('/healthz')) === 200, 'healthz is public');
note((await probe('/')) === 404, 'root path is 404');
for (const path of ['/api/v1/staff', '/local/workspace/template', '/mock/attempts', '/bank', '/?student=postgres']) note((await probe(path)) === 404, `staff or legacy path ${path} is 404`);
note((await fetch(origin + '/local-auth/guest', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' })).status === 403, 'guest creation with a foreign Origin is refused');

const alice = new Guest(), bob = new Guest();
await alice.start(); await bob.start();
const catalogA = (await alice.call('GET', '/api/v3/catalog?limit=100')).json;
const offer = catalogA.items[0];
const created = await alice.call('POST', '/api/v3/attempts', { blueprintVersionId: offer.blueprintVersionId });
note(created.status === 201, 'guest A creates a full test', `status ${created.status} ${created.status === 201 ? '' : created.text.slice(0, 200)}`);
const aBase = `/api/v3/attempts/${created.json.attemptId}`;
await alice.call('POST', `${aBase}/start`, {});
const view = await alice.call('GET', aBase);
note(view.status === 200 && view.json.slots?.length === 40, 'first section delivers 40 slots', `slots ${view.json?.slots?.length}`);
note((await bob.call('GET', aBase)).status >= 400, 'guest B cannot read guest A attempt');
note((await bob.call('POST', `${aBase}/submit`, {})).status >= 400, 'guest B cannot submit guest A attempt');
note(!(await bob.call('GET', '/api/v3/attempts?limit=100')).text.includes(created.json.attemptId), 'guest B history does not list guest A attempt');

const names = new Set();
(function walk(value) { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { names.add(k); walk(v); } })(view.json);
const suspicious = [...names].filter((name) => /correct|answerkey|solution|explanation|rationale|isright|keyversion|author|reviewer|draft|rights|licen[cs]e|source(?!Id$)/i.test(name));
note(suspicious.length === 0, 'no key, explanation or staff field names in the attempt view', suspicious.join(', '));
const earlyResult = await alice.call('GET', `${aBase}/result`);
note(earlyResult.status >= 400 || earlyResult.json?.correctCount === undefined, 'no result before submission', `status ${earlyResult.status}`);
const sections = await alice.call('GET', `${aBase}`);
note(!JSON.stringify(sections.json).includes('"reading"') || sections.json.slots.every((s) => s.sectionId === 'math'), 'later sections are not delivered early');

if (!SKIP_LOAD) {
  // ---- 2. Concurrent section attempts ----
  const t0 = performance.now();
  const sec = await together(GUESTS, sectionRun);
  note(sec.errors.length === 0, `${GUESTS} guests complete a Math section together`, `${sec.ok.length} ok, ${sec.errors.length} failed in ${((performance.now() - t0) / 1000).toFixed(1)}s ${sec.errors[0] ?? ''}`);
  note(sec.ok.every((r) => r.total === 4), 'every section attempt graded 4 questions', JSON.stringify(sec.ok[0]));
  // ---- 3. Concurrent full tests ----
  const t1 = performance.now();
  const full = await together(FULL, fullRun);
  note(full.errors.length === 0, `${FULL} guests complete the full 100-question test together`, `${full.ok.length} ok, ${full.errors.length} failed in ${((performance.now() - t1) / 1000).toFixed(1)}s ${full.errors[0] ?? ''}`);
  note(full.ok.every((r) => r.total === 100 && r.saved >= 90), 'every full test graded 100 questions', JSON.stringify(full.ok[0]));
}

const five00 = Object.entries(results.statuses).filter(([code]) => code === 'NETWORK' || Number(code) >= 500).reduce((sum, [, n]) => sum + n, 0);
note(five00 === 0, 'no 5xx or network errors during the whole run', JSON.stringify(results.statuses));
console.log(`requests ${results.latencies.length}, p50 ${percentile(results.latencies, 0.5).toFixed(0)} ms, p95 ${percentile(results.latencies, 0.95).toFixed(0)} ms, max ${Math.max(...results.latencies).toFixed(0)} ms`);
console.log(results.failures.length ? `\n${results.failures.length} check(s) failed` : '\nAll checks passed');
process.exit(results.failures.length ? 1 : 0);
