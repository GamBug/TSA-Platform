// Actual second-engine journey; disposable synthetic PostgreSQL inventory only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createMixedStudentFixture } from '../tests/integration/student-runtime/mixed-fixture.mjs';
import { createStudentRuntime } from '../src/local/student.mjs';
import { createDatabasePool } from '../src/modules/database/pool.mjs';
import { createReviewBrowserFixture } from '../tests/integration/bank/review-browser-fixture.mjs';

const artifacts = path.resolve(process.env.STUDENT_FIREFOX_ARTIFACT_DIR ?? '/tmp/tsa-student-firefox-evidence');
if (process.env.STUDENT_REVIEW_PRACTICE_FIREFOX !== undefined
    && !['true', 'false'].includes(process.env.STUDENT_REVIEW_PRACTICE_FIREFOX)) {
  throw new Error('STUDENT_REVIEW_PRACTICE_FIREFOX must be true or false');
}
const enableReviewPractice = process.env.STUDENT_REVIEW_PRACTICE_FIREFOX === 'true';
// Snap Firefox cannot use the host's /tmp checkout as a profile root.
// A new owned profile in its common directory also works from a clean /tmp clone.
const profileParent = path.resolve(process.env.STUDENT_FIREFOX_PROFILE_ROOT
  ?? path.join(homedir(), 'snap', 'firefox', 'common'));
await mkdir(profileParent, { recursive: true });
const profileRoot = await mkdtemp(path.join(profileParent, 'tsa-student-test-'));
let fixture, staffFixture, workerPool, runtime, driver, sessionId, endpoint, driverError;
let driverLog = '';
const workerState = { available: true };
const report = { checks: [], screenshots: [] };
async function wd(method, route, body) {
  const response = await fetch(`${endpoint}${sessionId ? `/session/${sessionId}` : ''}${route}`, {
    method, headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (!response.ok || payload.value?.error) throw new Error(`WebDriver ${route}: ${payload.value?.message ?? response.status}`);
  return payload.value;
}
const evaluate = (script) => wd('POST', '/execute/sync', { script: `return (${script});`, args: [] });
async function waitFor(expression, label) {
  const end = Date.now() + 12_000;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${label}`);
}
const query = (id) => `document.querySelector(${JSON.stringify(`[data-testid="${id}"]`)})`;
async function click(id) {
  await waitFor(`Boolean(${query(id)} && !${query(id)}.disabled)`, id);
  const selector = `[data-testid="${id}"]`;
  const isInput = await evaluate(`${query(id)}.matches('input')`);
  const element = await wd('POST', '/element', { using: 'css selector',
    value: isInput ? `label:has(${selector})` : selector });
  await wd('POST', `/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
}
async function capture(name) {
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'no horizontal overflow');
  const data = await wd('GET', '/screenshot');
  const filename = path.join(artifacts, `${name}.png`);
  await writeFile(filename, Buffer.from(data, 'base64')); report.screenshots.push(filename);
}
async function setViewport(width, height, label) {
  const requested = await wd('POST', '/window/rect', { width, height });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const measured = await evaluate(`({innerWidth,outerWidth,scrollWidth:document.documentElement.scrollWidth,scale:window.visualViewport?.scale ?? null})`);
  assert.equal(measured.innerWidth, width, `${label} viewport innerWidth matches requested ${width}px`);
  assert.equal(measured.scrollWidth <= measured.innerWidth, true, `${label} has no horizontal overflow`);
  if (measured.scale !== null) assert.equal(measured.scale, 1, `${label} visual viewport is not auto-zoomed`);
  return { requestedOuterWidth: width, returnedOuterWidth: requested.width, ...measured };
}
async function runStaffReviewJourney() {
  // Clear the completed student fixture's same-origin cookies before opening a
  // fresh isolated staff database and authenticating its synthetic AUTHOR.
  await wd('DELETE', '/cookie');
  assert.deepEqual(await wd('GET', '/cookie'), [], 'student fixture cookies cleared before staff auth');

  staffFixture = await createReviewBrowserFixture();
  await wd('POST', '/url', { url: `${staffFixture.origin}/` });
  await waitFor(`location.href===${JSON.stringify(`${staffFixture.origin}/`)} && Boolean(${query('staff-open')})`, 'staff launcher at fixture root URL');
  assert.equal(await evaluate('new URL(location.href).searchParams.has("student")'), false, 'staff root has no student mode query');
  // The launcher can initialize its mock demo session while the module loads.
  // Clear that host-scoped cookie after load and directly before staff auth.
  await wd('DELETE', '/cookie');
  assert.deepEqual(await wd('GET', '/cookie'), [], 'new staff fixture starts without browser cookies');
  await setViewport(1280, 900, 'staff desktop');
  await capture('staff-launcher');

  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__staffReviewCalls=[];window.fetch=async(...args)=>{const response=await original(...args);const requestUrl=typeof args[0]==='string'?args[0]:args[0].url;const url=new URL(requestUrl,location.href);if(url.pathname.startsWith('/api/v1/question-versions/')&&url.pathname.endsWith('/review-context'))window.__staffReviewCalls.push({path:url.pathname,status:response.status,body:await response.clone().json()});return response;};return true})()`);
  await click('staff-open');
  await waitFor(`Boolean(${query('actor-select')} && ${query('staff-login')})`, 'synthetic staff login form');
  assert.equal(await evaluate(`${query('actor-select')}.value='author'`), 'author', 'select synthetic AUTHOR actor');
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-question-list')} && ${query('staff-list-status')}.textContent.includes('bản ghi metadata'))`, 'staff metadata list loaded');

  const selected = staffFixture.questions[0];
  assert.match(selected.versionId, /^[0-9a-f-]{36}$/i, 'fixture version 0 has an exact UUID');
  const versionSelector = `[data-testid="staff-review-inspect"][data-version-id="${selected.versionId}"]`;
  assert.deepEqual(await evaluate('window.__staffReviewCalls'), [], 'metadata browsing does not prefetch private review context');
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(versionSelector)}))`, 'exact version 0 inspect control');
  const inspect = await wd('POST', '/element', { using: 'css selector', value: versionSelector });
  await wd('POST', `/element/${inspect['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
  await waitFor(`Boolean(${query('staff-review-context')} && document.querySelector('.staff-review-preview .review-item'))`, 'AVAILABLE staff preview rendered');

  const calls = await evaluate('window.__staffReviewCalls');
  assert.equal(calls.length, 1, 'one explicit private request after exact-version selection');
  assert.equal(calls[0].path, `/api/v1/question-versions/${selected.versionId}/review-context`);
  assert.equal(calls[0].status, 200);
  assert.equal(calls[0].body.version.versionId, selected.versionId);
  assert.equal(calls[0].body.version.contentHash, selected.contentHash);
  assert.equal(calls[0].body.preview.status, 'AVAILABLE');
  assert.equal(await evaluate(`${query('staff-publication-status')}?.dataset.evaluation`), calls[0].body.publicationEligibility, 'Firefox renders the server publication status separately from preview permission');
  assert.equal(await evaluate(`${query('staff-publication-status')}?.innerText.includes('Not evaluated by this inspection.')`), true, 'Firefox shows an understandable unevaluated status');
  assert.equal(await evaluate(`${query('staff-publication-status')}?.querySelectorAll('button,a,input').length`), 0, 'Firefox publication status exposes no privileged operation');
  assert.equal(calls[0].body.preview.question.interaction.type, 'SINGLE_CHOICE');
  await waitFor(`Boolean(document.querySelector('.staff-review-preview .content-math[data-math-state="rendered"] math msup'))`, 'Firefox native MathML superscript in staff preview');
  const rendered = await evaluate(`(()=>{const panel=${query('staff-review-context')};const pair=(label)=>{const term=[...panel.querySelectorAll('.staff-review-metadata dt')].find(node=>node.textContent===label);return term?.nextElementSibling?.textContent??null;};const answer=[...panel.querySelectorAll('.review-item h4')].find(node=>node.textContent==='Đáp án trong phiên bản này')?.nextElementSibling?.textContent??null;const explanation=[...panel.querySelectorAll('.review-item h4')].find(node=>node.textContent==='Lời giải riêng')?.nextElementSibling?.innerText??null;return {question:panel.querySelector('.staff-review-preview .review-item .content-text')?.textContent??null,math:Boolean(panel.querySelector('.staff-review-preview .content-math[data-math-state="rendered"] math msup')),table:panel.querySelector('.staff-review-preview table caption')?.textContent??null,options:[...panel.querySelectorAll('.staff-review-preview .review-options .option-letter')].map(node=>node.textContent.toLowerCase()),answer,explanation,version:pair('Phiên bản'),hash:pair('Hash phiên bản'),viewport:{innerWidth,outerWidth,scale:window.visualViewport?.scale??null}}})()`);
  assert.equal(rendered.question, 'Bản xem trước tổng hợp 1; không phải nội dung kỳ thi.');
  assert.equal(rendered.math, true, 'native MathML rendered');
  assert.equal(rendered.table, 'Bảng tổng hợp riêng');
  assert.deepEqual(rendered.options, ['a', 'b'], 'single-choice options rendered');
  assert.equal(rendered.answer, 'b');
  assert.match(rendered.explanation, /Lời giải tổng hợp riêng để kiểm thử giao diện/);
  assert.equal(rendered.version, `1 · ${selected.versionId}`);
  assert.equal(rendered.hash, selected.contentHash);

  const desktopViewport = await setViewport(1280, 900, 'staff desktop review');
  await evaluate(`(()=>{${query('staff-review-context')}.scrollIntoView({block:'start',inline:'nearest'});return true})()`);
  await capture('staff-review-desktop');
  await evaluate(`(()=>{document.querySelector('.staff-review-preview').scrollIntoView({block:'start',inline:'nearest'});return true})()`);
  await capture('staff-review-preview-desktop');
  let narrowViewport = await wd('POST', '/window/rect', { width: 375, height: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 150));
  let narrowMeasured = await evaluate(`({innerWidth,outerWidth,scrollWidth:document.documentElement.scrollWidth,scale:window.visualViewport?.scale??null})`);
  let narrowRequested = 375;
  if (narrowMeasured.innerWidth !== 375) {
    narrowRequested = 450;
    narrowViewport = await wd('POST', '/window/rect', { width: narrowRequested, height: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    narrowMeasured = await evaluate(`({innerWidth,outerWidth,scrollWidth:document.documentElement.scrollWidth,scale:window.visualViewport?.scale??null})`);
  }
  const narrowWidthHonored = narrowMeasured.innerWidth === narrowRequested;
  if (!narrowWidthHonored) {
    assert.equal(narrowRequested, 450, 'Firefox could not honor 375px; the documented 450px fallback was requested');
    assert.equal(narrowMeasured.innerWidth, narrowMeasured.outerWidth, 'record Firefox’s actual minimum narrow viewport');
  }
  assert.equal(narrowMeasured.scrollWidth <= narrowMeasured.innerWidth, true, 'staff narrow review has no horizontal overflow');
  if (narrowMeasured.scale !== null) assert.equal(narrowMeasured.scale, 1, 'staff narrow viewport is not auto-zoomed');
  await evaluate(`(()=>{${query('staff-review-context')}.scrollIntoView({block:'start',inline:'nearest'});return true})()`);
  await capture(`staff-review-narrow-${narrowMeasured.innerWidth}`);
  await evaluate(`(()=>{document.querySelector('.staff-review-preview').scrollIntoView({block:'start',inline:'nearest'});return true})()`);
  await capture(`staff-review-preview-narrow-${narrowMeasured.innerWidth}`);

  const escape = '\uE00C';
  await wd('POST', '/actions', { actions: [{ type: 'key', id: 'staff-keyboard', actions: [
    { type: 'keyDown', value: escape }, { type: 'keyUp', value: escape },
  ] }] });
  await waitFor(`Boolean(${query('staff-review-host')}.hidden && ${query('staff-review-host')}.children.length===0)`, 'Escape removes private review panel');
  const restoredFocus = await evaluate(`document.activeElement?.getAttribute('data-version-id')`);
  assert.equal(restoredFocus, selected.versionId, 'W3C Escape closes and restores focus to exact row control');

  await wd('POST', `/element/${inspect['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
  await waitFor(`Boolean(document.querySelector('.staff-review-preview') && document.querySelector('.staff-review-preview').innerText.includes('Lời giải tổng hợp riêng'))`, 'reopen private preview before logout');
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`, 'staff synthetic logout returns to login');
  const privateDomCleared = await evaluate(`!document.body.innerText.includes('Bản xem trước tổng hợp 1; không phải nội dung kỳ thi.')&&!document.body.innerText.includes('Lời giải tổng hợp riêng để kiểm thử giao diện')&&!document.querySelector('[data-testid="staff-review-context"]')`);
  assert.equal(privateDomCleared, true, 'logout clears private review DOM');
  await capture('staff-logout-cleared');

  await evaluate(`${query('actor-select')}.value='bankManager'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-review-evidence-open')})`, 'Bank Manager evidence actions');
  assert.equal(await evaluate(`Boolean(${query('staff-review-evidence')})`),false,'no automatic evidence panel');
  await evaluate(`(()=>{const original=window.fetch;window.__staffEvidenceCalls=[];window.fetch=async(...args)=>{const response=await original(...args);const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);if(url.pathname.endsWith('/review-evidence'))window.__staffEvidenceCalls.push({status:response.status,body:await response.clone().json()});return response;};return true})()`);
  const evidenceSelector = `[data-testid="staff-review-evidence-open"][data-version-id="${selected.versionId}"]`;
  const evidenceElement=await wd('POST','/element',{using:'css selector',value:evidenceSelector});
  assert.equal(await evaluate('window.__staffEvidenceCalls.length'),0,'no evidence prefetch');
  await wd('POST',`/element/${evidenceElement['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  await waitFor(`Boolean(${query('staff-recorded-evidence-text')})`,'current recorded evidence text');
  const evidence=await evaluate('window.__staffEvidenceCalls[0]');
  assert.equal(evidence.status,200);assert.equal(evidence.body.accessBasis,'BANK_MANAGER');
  assert.equal(evidence.body.version.versionId,selected.versionId);
  assert.equal(evidence.body.version.contentHash,selected.contentHash);
  assert.equal(evidence.body.qualification,'NOT_ATTESTED_BY_PLATFORM');
  assert.equal(await evaluate(`${query('staff-recorded-evidence-text')}.textContent`),staffFixture.evidenceText);
  assert.equal(await evaluate(`${query('staff-review-evidence')}.querySelectorAll('img,a,script,iframe,object,embed').length`),0,'recorded HTML/URIs remain inert');
  await evaluate(`${query('staff-recorded-evidence-text')}.scrollIntoView({block:'center'})`);
  await capture(`staff-evidence-text-narrow-${narrowMeasured.innerWidth}`);
  await setViewport(1280,900,'evidence desktop');
  await evaluate(`${query('staff-recorded-evidence-text')}.scrollIntoView({block:'center'})`);
  await capture('staff-evidence-text-desktop');
  await evaluate(`document.getElementById('staff-review-evidence-title').focus()`);
  await wd('POST','/actions',{actions:[{type:'key',id:'staff-evidence-keyboard',actions:[{type:'keyDown',value:escape},{type:'keyUp',value:escape}]}]});
  await waitFor(`!${query('staff-review-evidence')}`,'Escape clears evidence');
  assert.equal(await evaluate(`document.activeElement.matches(${JSON.stringify(evidenceSelector)})`),true,'evidence Escape restores focus');
  await wd('POST',`/element/${evidenceElement['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  await waitFor(`Boolean(${query('staff-recorded-evidence-text')})`,'evidence reopened for logout');
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`,'evidence logout');
  assert.equal(await evaluate(`Boolean(${query('staff-review-evidence')})`),false);
  assert.equal(await evaluate(`document.body.textContent.includes(${JSON.stringify(staffFixture.evidenceText)})`),false,'logout clears evidence text');
  report.checks.push('B2 BANK_MANAGER explicit exact-version current evidence is inert verbatim text, actual narrow/desktop readable, W3C Escape restores focus and logout clears it');

  await evaluate(`${query('actor-select')}.value='author'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('draft-create')})`,'B3 author workspace');
  const b3InspectSelector=`[data-testid="staff-review-inspect"][data-version-id="${selected.versionId}"]`;
  const b3Inspect=await wd('POST','/element',{using:'css selector',value:b3InspectSelector});
  await wd('POST',`/element/${b3Inspect['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  await waitFor(`Boolean(${query('handoff-open')})`,'fresh author-owned draft handoff');
  await evaluate(`(()=>{const original=window.fetch;window.__staffB3Posts=[];window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if((init.method??'GET').toUpperCase()==='POST'&&url.pathname.endsWith('/submit-review'))window.__staffB3Posts.push({status:response.status,body:JSON.parse(init.body),key:new Headers(init.headers).get('idempotency-key')});return response;};})()`);
  await click('handoff-open');
  await waitFor(`${query('handoff-dialog')}?.open===true`,'native handoff confirmation');
  assert.equal(await evaluate(`${query('handoff-dialog-version')}.textContent`),selected.versionId);
  assert.equal(await evaluate(`${query('handoff-dialog-hash')}.textContent`),selected.contentHash);
  assert.equal(await evaluate(`document.activeElement===${query('handoff-cancel')}`),true,'confirmation focuses cancel');
  await wd('POST','/actions',{actions:[{type:'key',id:'handoff-escape',actions:[{type:'keyDown',value:escape},{type:'keyUp',value:escape}]}]});
  await waitFor(`!${query('handoff-dialog')}?.open`,'native Escape cancels without submit');
  assert.equal(await evaluate('window.__staffB3Posts.length'),0);
  assert.equal(await evaluate(`document.activeElement===${query('handoff-open')}`),true,'confirmation cancellation restores focus');
  await click('handoff-open');
  const handoffNarrow=await setViewport(narrowMeasured.innerWidth,812,'handoff narrow actual viewport');
  await capture(`staff-handoff-confirm-narrow-${handoffNarrow.innerWidth}`);
  await setViewport(1280,900,'handoff desktop');
  await capture('staff-handoff-confirm-desktop');
  await click('handoff-confirm');
  await waitFor(`${query('handoff-status')}?.dataset.stage==='acknowledged' && ${query('handoff-status')}?.textContent.includes('Trạng thái hiện tại được máy chủ ghi nhận')`,'receipt and fresh IN_REVIEW observation');
  assert.equal(await evaluate(`${query('handoff-status')}.textContent.includes('IN_REVIEW')`),true);
  const handoffPosts=await evaluate('window.__staffB3Posts');
  assert.equal(handoffPosts.length,1);assert.equal(handoffPosts[0].status,200);
  assert.deepEqual(handoffPosts[0].body,{expectedRevision:1});
  assert.equal(typeof handoffPosts[0].key,'string');
  await evaluate(`${query('handoff-status')}.scrollIntoView({block:'center'})`);
  await capture('staff-handoff-current-state');
  await click('staff-logout');
  await waitFor(`Boolean(${query('staff-login')})`,'reviewer login after handoff');
  await evaluate(`${query('actor-select')}.value='reviewer'`);
  await click('staff-login');
  await waitFor(`Boolean(${query('staff-review-queue')})`,'independent reviewer queue shortcut');
  await click('staff-review-queue');
  await waitFor(`${query('staff-question-list')}?.innerText.includes(${JSON.stringify(selected.versionId)})`,'actual author-submitted version in reviewer queue');
  const b3EvidenceSelector=`[data-testid="staff-review-evidence-open"][data-version-id="${selected.versionId}"]`;
  const b3Evidence=await wd('POST','/element',{using:'css selector',value:b3EvidenceSelector});
  await wd('POST',`/element/${b3Evidence['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  await waitFor(`${query('staff-review-evidence')}?.textContent.includes('REVIEW_QUEUE')`,'independent reviewer evidence after real handoff');
  assert.equal(await evaluate(`${query('staff-recorded-evidence-text')}.textContent`),staffFixture.evidenceText);
  assert.equal(await evaluate(`Boolean(${query('handoff-open')})`),false,'reviewer receives no author mutation control');
  report.checks.push('B3 Firefox native confirmation/Escape/focus and one actual author POST; acknowledged receipt plus fresh current state, then independent reviewer queue/evidence');

  // B4 negative actions stay synthetic and never expose an approval control.
  const rejectInspect=await wd('POST','/element',{using:'css selector',value:b3InspectSelector});
  await wd('POST',`/element/${rejectInspect['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  await waitFor(`Boolean(${query('disposition-reject-open')})`,'independent reviewer rejection control');
  await evaluate(`(()=>{const original=window.fetch;window.__ffDispositions=[];window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if((init.method??'GET').toUpperCase()==='POST'&&(url.pathname.endsWith('/reviews')||url.pathname.endsWith('/quarantine')))window.__ffDispositions.push({path:url.pathname,status:response.status,body:JSON.parse(init.body)});return response;};})()`);
  await click('disposition-reject-open');
  await waitFor(`${query('disposition-dialog')}?.open===true`,'Firefox negative disposition native dialog');
  assert.equal(await evaluate(`Array.from(${query('disposition-dialog')}.querySelectorAll('select')).length`),6);
  assert.equal(await evaluate(`Array.from(${query('disposition-dialog')}.querySelectorAll('select')).every(select=>select.value==='')`),true,'rubric never defaults to an assessed finding');
  assert.equal(await evaluate(`${query('disposition-form')}.checkValidity()`),false);
  await evaluate(`(()=>{for(const key of ['correctness','unambiguous','relevant','language','explanation','rights']){const select=document.querySelector('[data-testid="disposition-rubric-'+key+'"]');select.value=key==='correctness'?'FAIL':'PASS';select.dispatchEvent(new Event('change',{bubbles:true}));}const reason=${query('disposition-form-reason')};reason.value='Synthetic Firefox cancellation private sentinel';reason.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wd('POST','/actions',{actions:[{type:'key',id:'negative-escape',actions:[{type:'keyDown',value:escape},{type:'keyUp',value:escape}]}]});
  await waitFor(`!${query('disposition-dialog')}?.open`,'Firefox negative dialog Escape');
  assert.equal(await evaluate(`document.body.textContent.includes('Synthetic Firefox cancellation private sentinel')`),false,'Escape clears copied reason/rubric summary');
  assert.equal(await evaluate('window.__ffDispositions.length'),0);
  await click('disposition-reject-open');
  await evaluate(`(()=>{for(const key of ['correctness','unambiguous','relevant','language','explanation','rights']){const select=document.querySelector('[data-testid="disposition-rubric-'+key+'"]');select.value=key==='correctness'?'FAIL':'PASS';select.dispatchEvent(new Event('change',{bubbles:true}));}const reason=${query('disposition-form-reason')};reason.value='Kiểm thử từ chối tổng hợp trên Firefox, không phải rà soát đủ điều kiện. <img src="https://invalid.example/history.png" onerror="alert(1)">';reason.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await setViewport(narrowMeasured.innerWidth,812,'negative disposition narrow actual viewport');
  await capture(`staff-reject-confirm-narrow-${narrowMeasured.innerWidth}`);
  await setViewport(1280,900,'negative disposition desktop');
  await click('disposition-confirm');
  await waitFor(`${query('disposition-status')}?.dataset.stage==='acknowledged'&&${query('disposition-status')}?.dataset.currentState==='unobserved'`,'rejection receipt with no current queued private read');
  assert.equal(await evaluate(`${query('disposition-status')}.dataset.receiptState`),'REJECTED');
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-review-preview'))`),false);
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'manager login after rejection');
  await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');
  await waitFor(`Boolean(${query('staff-state-filter')})`,'manager metadata filters');
  await evaluate(`(()=>{const select=${query('staff-state-filter')};select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`${query('staff-list-status')}?.textContent.startsWith('Đang hiển thị')`,'manager all-state metadata list');
  const quarantineVersion=staffFixture.questions[1];
  const quarantineSelector=`[data-testid="staff-review-inspect"][data-version-id="${quarantineVersion.versionId}"]`;
  const quarantineInspect=await wd('POST','/element',{using:'css selector',value:quarantineSelector});
  await wd('POST',`/element/${quarantineInspect['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  await waitFor(`Boolean(${query('disposition-quarantine-open')})`,'manager quarantine control');
  assert.equal(await evaluate(`Boolean(${query('disposition-reject-open')})`),false);
  await click('disposition-quarantine-open');
  assert.equal(await evaluate(`${query('disposition-warning')}.textContent.includes('lượt thi')&&${query('disposition-warning')}.textContent.includes('kết quả')`),true);
  await evaluate(`(()=>{const reason=${query('disposition-form-reason')};reason.value='Kiểm thử cách ly tổng hợp rõ ràng trên Firefox.';reason.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await setViewport(narrowMeasured.innerWidth,812,'quarantine narrow actual viewport');
  await capture(`staff-quarantine-confirm-narrow-${narrowMeasured.innerWidth}`);
  await setViewport(1280,900,'quarantine desktop');
  await click('disposition-confirm');
  await waitFor(`${query('disposition-status')}?.dataset.stage==='acknowledged'&&${query('disposition-status')}?.dataset.currentState==='QUARANTINED'`,'manager quarantine receipt plus current held metadata');
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-review-preview'))`),false,'held current view contains no question/key/explanation');
  assert.equal(await evaluate(`${query('staff-review-context')}.textContent.includes('QUARANTINED')`),true);
  const dispositionPosts=await evaluate('window.__ffDispositions');
  assert.equal(dispositionPosts.length,2);assert.equal(dispositionPosts[0].status,201);assert.equal(dispositionPosts[0].body.decision,'REJECT');
  assert.equal(dispositionPosts[1].status,200);
  assert.equal(dispositionPosts.every(post=>post.body.reason.startsWith('Local synthetic disposition: ')),true);
  report.checks.push('B4 Firefox explicit rubric/reason, native Escape privacy, actual synthetic rejection with private access loss, and manager quarantine with disclosed impact/current held metadata');

  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'typed author Firefox login');
  await evaluate(`${query('actor-select')}.value='author'`);await click('staff-login');
  await waitFor(`Boolean(${query('draft-interaction-type')})`,'Firefox three-type author editor');
  async function observeTypedDrafts() {
    await evaluate(`(()=>{const original=window.fetch;window.__ffTyped={posts:[],reads:[]};window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);const response=await original(input,init);
      if(url.pathname==='/api/v1/questions'&&init.method==='POST')window.__ffTyped.posts.push({body:JSON.parse(init.body),status:response.status,receipt:await response.clone().json()});
      if(url.pathname.endsWith('/review-context'))window.__ffTyped.reads.push({status:response.status,body:await response.clone().json()});
      return response;};return true})()`);
  }
  await observeTypedDrafts();
  for(const type of ['MULTIPLE_CHOICE','TRUE_FALSE_GROUP']) {
    await evaluate(`(()=>{const select=${query('draft-interaction-type')};select.value=${JSON.stringify(type)};select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    const prompt=`Bản nháp tổng hợp Firefox ${type}; không phải đề thi.`;
    for(const [id,value] of [['draft-prompt',prompt],['draft-option-a','Nội dung tổng hợp A'],['draft-option-b','Nội dung tổng hợp B'],['draft-explanation','Lời giải tổng hợp riêng Firefox.']]) {
      await evaluate(`(()=>{const input=${query(id)};input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    }
    const before=await evaluate('window.__ffTyped.posts.length');await click('draft-create');
    await evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),80))');
    assert.equal(await evaluate('window.__ffTyped.posts.length'),before,'Firefox incomplete key sends no POST');
    if(type==='MULTIPLE_CHOICE') {
      assert.equal(await evaluate(`${query('draft-answer-multiple-a')}.checked||${query('draft-answer-multiple-b')}.checked`),false);
      await evaluate(`(()=>{${query('draft-answer-multiple-b')}.focus();return true})()`);
      await wd('POST','/actions',{actions:[{type:'key',id:'typed-keyboard',actions:[{type:'keyDown',value:' '},{type:'keyUp',value:' '}]}]});
      assert.equal(await evaluate(`${query('draft-answer-multiple-b')}.checked`),true);
    } else {
      assert.equal(await evaluate(`${query('draft-answer-true-false-a')}.value+${query('draft-answer-true-false-b')}.value`),'');
      await evaluate(`(()=>{${query('draft-answer-true-false-a')}.value='false';return true})()`);
      await click('draft-create');await evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),80))');
      assert.equal(await evaluate('window.__ffTyped.posts.length'),before,'Firefox one unset TF value sends no POST');
      await evaluate(`(()=>{${query('draft-answer-true-false-b')}.value='true';return true})()`);
    }
    await evaluate(`(()=>{${query('draft-interaction-type')}.scrollIntoView({block:'start'});return true})()`);
    await capture(`staff-author-${type.toLowerCase()}-narrow-${narrowMeasured.innerWidth}`);
    await click('draft-create');await waitFor(`window.__ffTyped.posts.length===${before+1}`,'Firefox typed draft receipt');
    const posted=await evaluate('window.__ffTyped.posts.at(-1)');assert.equal(posted.status,201);
    const expectedKey=type==='MULTIPLE_CHOICE'?{type,optionIds:['b']}:{type,values:{a:false,b:true}};
    assert.deepEqual(posted.body.answerKey,expectedKey);
    await wd('POST','/refresh',{});await waitFor(`Boolean(${query('staff-open')})`,'Firefox landing after typed reload');
    await click('staff-open');await waitFor(`Boolean(${query('draft-interaction-type')}&&${query('staff-question-list')})`,'Firefox persisted author reopen');
    await observeTypedDrafts();
    const typedSelector=`[data-testid="staff-review-inspect"][data-version-id="${posted.receipt.versionId}"]`;
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(typedSelector)}))`,'Firefox typed metadata after reload');
    const typedElement=await wd('POST','/element',{using:'css selector',value:typedSelector});
    await wd('POST',`/element/${typedElement['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
    await waitFor(`Boolean(document.querySelector('.staff-review-preview')&&${query('handoff-open')})`,'Firefox typed private preview');
    const persisted=await evaluate('window.__ffTyped.reads.at(-1)');assert.equal(persisted.status,200);
    assert.equal(persisted.body.workflow.state,'DRAFT');assert.equal(persisted.body.preview.question.content[0].text,prompt);
    assert.deepEqual(persisted.body.preview.question.interaction,posted.body.interaction);assert.deepEqual(persisted.body.preview.question.answerKey,expectedKey);
    await wd('POST','/actions',{actions:[{type:'key',id:'typed-escape',actions:[{type:'keyDown',value:escape},{type:'keyUp',value:escape}]}]});
  }
  report.checks.push('Firefox existing-contract author MC/TF editor validates unset keys with zero POST, keyboard-selects a checkbox, creates real drafts and reads exact persistent keys/text after reload with handoff still explicit');

  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'Firefox manager history login');
  await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');
  await waitFor(`Boolean(${query('staff-review-history-open')})`,'Firefox manager history buttons');
  await evaluate(`(()=>{const select=${query('staff-state-filter')};select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await waitFor(`${query('staff-list-status')}?.textContent.startsWith('Đang hiển thị')`,'Firefox all-state history metadata');
  async function openFirefoxHistory(version) {
    const selector=`[data-testid="staff-review-history-open"][data-version-id="${version.versionId}"]`;
    const element=await wd('POST','/element',{using:'css selector',value:selector});
    await wd('POST',`/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  }
  await openFirefoxHistory(quarantineVersion);await waitFor(`${query('staff-review-history-status')}?.dataset.stage==='empty'`,'Firefox held version has no recorded review');
  assert.equal(await evaluate(`${query('staff-review-history')}.dataset.workflowState`),'QUARANTINED');
  await wd('POST','/actions',{actions:[{type:'key',id:'history-escape',actions:[{type:'keyDown',value:escape},{type:'keyUp',value:escape}]}]});
  assert.equal(await evaluate('document.activeElement?.dataset.versionId'),quarantineVersion.versionId);
  await openFirefoxHistory(selected);await waitFor(`${query('staff-review-history-status')}?.dataset.stage==='loaded'`,'Firefox real rejection history');
  assert.equal(await evaluate(`${query('staff-review-history')}.dataset.versionId`),selected.versionId);
  assert.equal(await evaluate(`${query('staff-review-history')}.dataset.contentHash`),selected.contentHash);
  assert.equal(await evaluate(`${query('staff-review-history')}.dataset.workflowRevision`),'3');
  assert.equal(await evaluate(`${query('staff-review-history')}.dataset.workflowState`),'REJECTED');
  assert.equal(await evaluate(`${query('staff-review-history-reason')}.textContent.includes('<img src=')`),true);
  assert.equal(await evaluate(`${query('staff-review-history')}.querySelectorAll('img,a,script,iframe,object,embed').length`),0);
  await setViewport(1280,900,'history desktop');await evaluate(`(()=>{${query('staff-review-history')}.scrollIntoView({block:'start'});return true})()`);
  await capture('staff-review-history-desktop');await setViewport(narrowMeasured.innerWidth,812,'history narrow actual');
  await evaluate(`(()=>{${query('staff-review-history-reason')}.scrollIntoView({block:'center'});return true})()`);await capture(`staff-review-history-reason-narrow-${narrowMeasured.innerWidth}`);
  await click('staff-review-history-close');assert.equal(await evaluate(`Boolean(${query('staff-review-history-reason')})`),false);
  await openFirefoxHistory(selected);await waitFor(`${query('staff-review-history-status')}?.dataset.stage==='loaded'`,'history before Firefox logout');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'Firefox logout clears history');
  assert.equal(await evaluate(`Boolean(${query('staff-review-history')})||document.body.textContent.includes('https://invalid.example/history.png')`),false);
  report.checks.push('B5 Firefox manager exact-version empty/real REJECT history preserves inert hostile reason, current workflow and no-qualification warning; desktop/narrow captures, Escape focus and close/logout privacy');

  await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');
  await waitFor(`Boolean(${query('staff-preflight-run')})`,'Firefox manager canonical controls');
  await evaluate(`(()=>{const select=${query('staff-state-filter')};select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await waitFor(`${query('staff-list-status')}?.textContent.startsWith('Đang hiển thị')`,'Firefox canonical all states');
  await evaluate(`(()=>{const original=window.fetch;window.__ffPreflight=[];window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/v1/datasets/preflight')window.__ffPreflight.push({status:response.status,request:JSON.parse(init.body),body:await response.clone().json(),csrf:Boolean(new Headers(init.headers).get('x-csrf-token')),key:new Headers(init.headers).get('idempotency-key')});return response;};return true})()`);
  assert.equal(await evaluate(`${query('staff-preflight-run')}.disabled`),true);
  for(const version of [selected,quarantineVersion]) {
    const selector=`[data-testid="staff-preflight-select"][data-version-id="${version.versionId}"]`;
    await evaluate(`(()=>{document.querySelector(${JSON.stringify(selector)}).focus();return true})()`);
    await wd('POST','/actions',{actions:[{type:'key',id:'preflight-keyboard',actions:[{type:'keyDown',value:' '},{type:'keyUp',value:' '}]}]});
  }
  assert.equal(await evaluate('window.__ffPreflight.length'),0,'Firefox selection never runs automatic check');
  await click('staff-preflight-run');await waitFor(`${query('staff-preflight-status')}?.dataset.stage==='loaded'`,'Firefox actual canonical report');
  const canonical=await evaluate('window.__ffPreflight[0]');assert.equal(canonical.status,200);assert.equal(canonical.csrf,true);assert.equal(canonical.key,null);
  assert.equal(canonical.request.versions.length,2);assert.equal(canonical.body.counts.total,2);assert.deepEqual(canonical.body.shortfalls,{MATH:10,READING:6,SCIENCE:12});
  assert.equal(canonical.body.publishing,false);assert.equal(await evaluate(`${query('staff-preflight-report')}.dataset.versionCount`),'2');
  const canonicalText=await evaluate(`${query('staff-preflight-report')}.textContent`);assert.equal(canonical.body.blockerCodes.every(code=>canonicalText.includes(code)),true);
  await setViewport(1280,900,'canonical desktop');await evaluate(`(()=>{${query('staff-preflight-report')}.scrollIntoView({block:'start'});return true})()`);await capture('staff-canonical-preflight-desktop');
  await setViewport(narrowMeasured.innerWidth,812,'canonical narrow actual');await evaluate(`(()=>{${query('staff-preflight-version-pins')}.scrollIntoView({block:'center'});return true})()`);await capture(`staff-canonical-preflight-pins-narrow-${narrowMeasured.innerWidth}`);
  await wd('POST','/actions',{actions:[{type:'key',id:'preflight-escape',actions:[{type:'keyDown',value:escape},{type:'keyUp',value:escape}]}]});
  assert.equal(await evaluate(`Boolean(${query('staff-preflight-report')})`),false);assert.equal(await evaluate(`${query('staff-preflight-run')}.disabled`),true);
  assert.equal(await evaluate(`document.activeElement===${query('staff-preflight-selected-count')}`),true,'Firefox Escape has a logical focus destination');
  report.checks.push('B6 Firefox explicit manager keyboard selection/CSRF-only read POST produces exact canonical counts/pins/shortfalls/blockers, no publishing claim; desktop/narrow captures and Escape selection/report cleanup with logical focus');

  await evaluate(`(()=>{const original=window.fetch;window.__ffFixed=[];window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname.startsWith('/api/v1/assembly-runs'))window.__ffFixed.push({path:url.pathname,status:response.status,body:await response.clone().json()});return response;};return true})()`);
  assert.equal(await evaluate('window.__ffFixed.length'),0);await click('staff-fixed-open');await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='list-loaded'`,'Firefox stored fixed reference list');
  assert.equal(await evaluate('window.__ffFixed.length'),1);assert.equal(await evaluate('document.querySelectorAll("[data-testid=staff-fixed-run-open]").length'),3);
  for(const [key,run] of Object.entries(staffFixture.fixedRuns)){
    const selector=`[data-testid="staff-fixed-run-open"][data-run-id="${run.assemblyRunId}"]`;
    const element=await wd('POST','/element',{using:'css selector',value:selector});await wd('POST',`/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
    await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='detail-loaded'`,'Firefox replay-verified fixed detail');
    assert.equal(await evaluate(`${query('staff-fixed-detail')}.dataset.runId`),run.assemblyRunId);assert.equal(await evaluate(`${query('staff-fixed-detail')}.dataset.selectedCount`),String(key==='success'?4:0));
    assert.equal(await evaluate(`${query('staff-fixed-detail')}.dataset.failureCode`),run.result.status==='FAILURE'?run.result.code:'null');
    if(key==='success'){await setViewport(1280,900,'fixed desktop');await evaluate(`(()=>{${query('staff-fixed-detail')}.scrollIntoView({block:'start'});return true})()`);await capture('staff-fixed-success-desktop');}
    if(key==='exhausted'){
      assert.equal(await evaluate(`${query('staff-fixed-detail')}.textContent.includes('chưa rõ')`),true);
      await setViewport(narrowMeasured.innerWidth,812,'fixed narrow actual');await evaluate(`(()=>{document.querySelector('.staff-fixed-reference-result').scrollIntoView({block:'center'});return true})()`);await capture(`staff-fixed-exhausted-narrow-${narrowMeasured.innerWidth}`);
    }
    const beforeBack=await evaluate('window.__ffFixed.length');await click('staff-fixed-back');await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='list-loaded'`,'Firefox cached fixed list');assert.equal(await evaluate('window.__ffFixed.length'),beforeBack);
  }
  await wd('POST','/actions',{actions:[{type:'key',id:'fixed-escape',actions:[{type:'keyDown',value:escape},{type:'keyUp',value:escape}]}]});
  assert.equal(await evaluate(`Boolean(${query('staff-fixed-list')})||Boolean(${query('staff-fixed-detail')})`),false);assert.equal(await evaluate(`document.activeElement===${query('staff-fixed-open')}`),true);
  await click('staff-fixed-open');await waitFor(`${query('staff-fixed-status')}?.dataset.stage==='list-loaded'`,'fixed list before Firefox logout');await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'Firefox fixed private logout');
  assert.equal(await evaluate(`Boolean(${query('staff-fixed-list')})||Boolean(${query('staff-fixed-detail')})`),false);
  report.checks.push('B7 Firefox explicit manager stored fixed list and three real replay outcomes keep exhaustion feasibility unknown; desktop/narrow captures, cached back without GET, Escape focus and logout cleanup');

  // Seed four genuinely approved synthetic Bank questions late in the existing
  // fixture so the preceding B1–B7 assertions keep their original inventory.
  const rehearsalSource=await staffFixture.fixture.registerSource();
  const rehearsalStock=[];
  for(let index=0;index<4;index++) rehearsalStock.push(await staffFixture.fixture.createQuestion(rehearsalSource,`firefox-b8-stock-${index+1}`));

  await evaluate(`${query('actor-select')}.value='examManager'`);
  assert.equal(await evaluate(`${query('actor-select')}.selectedOptions[0].textContent.includes('Synthetic exam manager (EXAM_MANAGER)')`),true);
  await click('staff-login');await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprints-open')})`,'Firefox synthetic EXAM_MANAGER workspace');
  assert.equal(await evaluate(`Boolean(${query('draft-create')})||Boolean(${query('staff-question-list')})||Boolean(${query('staff-review-inspect')})`),false,'EXAM_MANAGER has no draft or private-question controls');
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__ffB8Errors=[];window.addEventListener('error',event=>window.__ffB8Errors.push(String(event.message??'error')));window.addEventListener('unhandledrejection',event=>window.__ffB8Errors.push(String(event.reason??'rejection')));window.__ffRehearsal=[];window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname.startsWith('/api/v1/fixed-rehearsal')){let body=null;try{body=await response.clone().json();}catch{}window.__ffRehearsal.push({path:url.pathname,method:(init.method??'GET').toUpperCase(),status:response.status,request:init.body?JSON.parse(init.body):null,body,csrf:Boolean(new Headers(init.headers).get('x-csrf-token')),key:new Headers(init.headers).get('idempotency-key')});}return response;};return true})()`);
  assert.equal(await evaluate('window.__ffRehearsal.length'),0,'no rehearsal metadata or command is prefetched');
  await click('staff-fixed-rehearsal-blueprints-open');await waitFor(`${query('staff-fixed-rehearsal-blueprints-status')}?.dataset.stage==='blueprints-loaded'`,'explicit Firefox supported-blueprint read');
  assert.equal(await evaluate('window.__ffRehearsal.length'),1);
  const blueprints=await evaluate('window.__ffRehearsal[0]');assert.equal(blueprints.path,'/api/v1/fixed-rehearsal-blueprints');assert.equal(blueprints.method,'GET');assert.equal(blueprints.status,200);assert.equal(blueprints.body.accessBasis,'EXAM_MANAGER');
  const rehearsalBlueprint=blueprints.body.items.find(item=>item.section==='MATH'&&item.questionCount===4);
  assert.ok(rehearsalBlueprint,'Firefox supported list contains the MATH4 rehearsal blueprint');
  await evaluate(`(()=>{const select=${query('staff-fixed-rehearsal-blueprint-select')};select.value=${JSON.stringify(rehearsalBlueprint.blueprintVersionId)};select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  assert.equal(await evaluate('window.__ffRehearsal.filter(call=>call.method===\'POST\').length'),0,'blueprint selection does not submit');
  await evaluate(`(()=>{const input=${query('staff-fixed-rehearsal-window-minutes')};input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  assert.equal(await evaluate(`${query('staff-fixed-rehearsal-form')}.checkValidity()`),false,'zero-minute rehearsal input is invalid');
  await click('staff-fixed-rehearsal-open');await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await evaluate(`${query('staff-fixed-rehearsal-dialog')}.open`),false,'invalid duration cannot open confirmation');
  assert.equal(await evaluate('window.__ffRehearsal.filter(call=>call.method===\'POST\').length'),0,'invalid duration sends zero POSTs');
  await evaluate(`(()=>{const input=${query('staff-fixed-rehearsal-window-minutes')};input.value='6e1';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await click('staff-fixed-rehearsal-open');await waitFor(`${query('staff-fixed-rehearsal-dialog')}?.open===true`,'Firefox native stock-rehearsal confirmation');
  const dialogPins=await evaluate(`(()=>({version:${query('staff-fixed-rehearsal-dialog-blueprint-id')}.textContent,hash:${query('staff-fixed-rehearsal-dialog-blueprint-hash')}.textContent,profile:${query('staff-fixed-rehearsal-dialog-profile')}.textContent,window:${query('staff-fixed-rehearsal-dialog-window')}.textContent,warning:document.getElementById('staff-fixed-rehearsal-dialog-warning').textContent}))()`);
  assert.equal(await evaluate(`${query('staff-fixed-rehearsal-window-minutes')}.value`),'60','valid numeric exponent normalizes to an integer before confirmation');
  assert.equal(dialogPins.version,rehearsalBlueprint.blueprintVersionId);assert.equal(dialogPins.hash,rehearsalBlueprint.contentHash);
  assert.equal(dialogPins.profile,`MATH · 4 items · ${rehearsalBlueprint.durationSeconds} seconds`);assert.equal(dialogPins.window,'60 minutes');
  assert.equal(dialogPins.warning.toLowerCase().includes('creates no form'),true);
  assert.equal(await evaluate('window.__ffRehearsal.filter(call=>call.method===\'POST\').length'),0,'reviewing confirmation does not post');
  assert.equal(await evaluate(`document.activeElement===${query('staff-fixed-rehearsal-cancel')}`),true,'native dialog initially focuses safe cancel action');
  await setViewport(narrowMeasured.innerWidth,812,'B8 Firefox confirmation narrow actual viewport');await capture(`staff-b8-exam-confirm-narrow-${narrowMeasured.innerWidth}`);
  await setViewport(1280,900,'B8 Firefox confirmation desktop');await capture('staff-b8-exam-confirm-desktop');
  await wd('POST','/actions',{actions:[{type:'key',id:'b8-confirm-escape',actions:[{type:'keyDown',value:escape},{type:'keyUp',value:escape}]}]});
  await waitFor(`!${query('staff-fixed-rehearsal-dialog')}?.open`,'B8 Firefox Escape cancels before POST');
  assert.equal(await evaluate(`document.activeElement===${query('staff-fixed-rehearsal-open')}`),true,'cancel restores focus to the exact rehearsal action');
  assert.equal(await evaluate('window.__ffRehearsal.filter(call=>call.method===\'POST\').length'),0);
  await click('staff-fixed-rehearsal-open');await waitFor(`${query('staff-fixed-rehearsal-dialog')}?.open===true`,'reopen the exact pinned B8 confirmation');
  await click('staff-fixed-rehearsal-confirm');await waitFor(`${query('staff-fixed-rehearsal-status')}?.dataset.stage==='acknowledged'`,'actual Firefox EXAM_MANAGER stock rehearsal receipt');
  const rehearsalPosts=await evaluate('window.__ffRehearsal.filter(call=>call.method===\'POST\')');assert.equal(rehearsalPosts.length,1);
  const firstCapture=rehearsalPosts[0];assert.equal(firstCapture.path,'/api/v1/fixed-rehearsals');assert.equal(firstCapture.status,201);assert.equal(firstCapture.csrf,true);assert.match(firstCapture.key,/^[0-9a-f-]{36}$/i);
  assert.deepEqual(firstCapture.request,{blueprintVersionId:rehearsalBlueprint.blueprintVersionId,blueprintHash:rehearsalBlueprint.contentHash,windowMinutes:60});
  assert.equal(Object.hasOwn(firstCapture.request,'seed'),false);
  const successReceipt=firstCapture.body;assert.equal(successReceipt.outcome,'SUCCESS');assert.equal(successReceipt.createsForm,false);assert.equal(successReceipt.currentEligibility,'NOT_REVALIDATED');assert.deepEqual(successReceipt.sectionDeficits,[]);
  assert.equal(Date.parse(successReceipt.availableUntil)-Date.parse(successReceipt.capturedAt),3_600_000);
  assert.equal(Date.parse(successReceipt.requiredThrough)-Date.parse(successReceipt.availableUntil),(600+rehearsalBlueprint.durationSeconds)*1000);
  assert.equal(await evaluate(`${query('staff-fixed-rehearsal-status')}.dataset.currentEligibility`),'NOT_REVALIDATED');
  assert.equal(await evaluate(`${query('staff-fixed-rehearsal-status')}.dataset.createsForm`),'false');
  assert.equal(await evaluate(`document.activeElement===${query('staff-fixed-rehearsal-status')}`),true,'receipt acknowledgement receives focus');
  assert.doesNotMatch(JSON.stringify(successReceipt),/"(?:sourceId|questionId|versionId|groupId|answerKey|explanation|seed)"\s*:/);
  for(const question of rehearsalStock) assert.equal(JSON.stringify(successReceipt).includes(question.versionId),false,'EXAM receipt omits candidate identity');
  assert.equal(await evaluate(`Boolean(${query('staff-review-context')})||Boolean(${query('staff-review-history')})||Boolean(${query('staff-review-evidence')})`),false,'EXAM_MANAGER sees no B1–B5 private review view');
  assert.deepEqual(await evaluate('window.__ffB8Errors'),[],'initial B8 capture has no uncaught browser errors');
  await evaluate(`${query('staff-fixed-rehearsal-status')}.scrollIntoView({block:'center'})`);await capture('staff-b8-exam-success-desktop');
  report.checks.push('B8 Firefox EXAM_MANAGER explicitly loads supported blueprints; invalid window sends zero POST; native pin confirmation/Escape/focus; one CSRF/idempotent actual SUCCESS receipt with no form, no current eligibility claim, and no candidate identifiers');

  const receiptDocument=await evaluate('performance.timeOrigin');await wd('POST','/refresh',{});
  await waitFor(`performance.timeOrigin!==${receiptDocument}&&Boolean(${query('staff-open')})`,'fresh Firefox document after the acknowledged B8 receipt');
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__ffB8Errors=[];window.addEventListener('error',event=>window.__ffB8Errors.push(String(event.message??'error')));window.addEventListener('unhandledrejection',event=>window.__ffB8Errors.push(String(event.reason??'rejection')));window.__ffRehearsal=[];window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname.startsWith('/api/v1/fixed-rehearsal')){let body=null;try{body=await response.clone().json();}catch{}window.__ffRehearsal.push({path:url.pathname,method:(init.method??'GET').toUpperCase(),status:response.status,request:init.body?JSON.parse(init.body):null,body,csrf:Boolean(new Headers(init.headers).get('x-csrf-token')),key:new Headers(init.headers).get('idempotency-key')});}return response;};return true})()`);
  await click('staff-open');await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprints-open')})`,'explicitly re-enter the EXAM_MANAGER workspace after reload');
  assert.equal(await evaluate('window.__ffRehearsal.length'),0,'re-entering after reload does not prefetch blueprint, history, or command state');
  assert.equal(await evaluate(`Boolean(${query('staff-fixed-rehearsal-status')})||Boolean(${query('staff-fixed-rehearsal-blueprints')})||document.body.textContent.includes(${JSON.stringify(successReceipt.rehearsalId)})`),false,'acknowledged receipt is not resurrected by reload');
  report.checks.push('B8 Firefox fresh-document reload requires explicit staff re-entry and does not restore a private acknowledgement or start a new read/POST');

  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'Firefox BANK_MANAGER login after first capture');
  await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-bank-rehearsals-open')})`,'Firefox BANK_MANAGER rehearsal-history action');
  let historyReads=await evaluate('window.__ffRehearsal.filter(call=>call.method===\'GET\'&&call.path===\'/api/v1/fixed-rehearsals\').length');
  let diagnosticReads=await evaluate('window.__ffRehearsal.filter(call=>call.method===\'GET\'&&call.path.startsWith(\'/api/v1/fixed-rehearsals/\')).length');
  assert.equal(historyReads,0,'BANK_MANAGER login does not prefetch rehearsal history');assert.equal(diagnosticReads,0,'BANK_MANAGER login does not prefetch diagnostics');
  await click('staff-bank-rehearsals-open');await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='list-loaded'`,'explicit Firefox BANK_MANAGER rehearsal history');
  historyReads=await evaluate('window.__ffRehearsal.filter(call=>call.method===\'GET\'&&call.path===\'/api/v1/fixed-rehearsals\').length');assert.equal(historyReads,1);
  const initialHistory=await evaluate('window.__ffRehearsal.find(call=>call.method===\'GET\'&&call.path===\'/api/v1/fixed-rehearsals\')');assert.equal(initialHistory.status,200);assert.equal(initialHistory.body.accessBasis,'BANK_MANAGER');assert.equal(initialHistory.body.items.length,1);
  assert.equal(initialHistory.body.items[0].rehearsalId,successReceipt.rehearsalId);assert.equal(await evaluate('window.__ffRehearsal.filter(call=>call.method===\'GET\'&&call.path.startsWith(\'/api/v1/fixed-rehearsals/\')).length'),0,'history rows do not prefetch detail');
  await setViewport(1280,900,'B8 Firefox history desktop');await evaluate(`(()=>{${query('staff-bank-rehearsals')}.scrollIntoView({block:'start'});return true})()`);await capture('staff-b8-history-desktop');
  await setViewport(narrowMeasured.innerWidth,812,'B8 Firefox history narrow actual viewport');await capture(`staff-b8-history-narrow-${narrowMeasured.innerWidth}`);
  const successRow=`[data-testid="staff-bank-rehearsal-open"][data-rehearsal-id="${successReceipt.rehearsalId}"]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(successRow)}))`,'exact historical success detail action');
  const successRowElement=await wd('POST','/element',{using:'css selector',value:successRow});await wd('POST',`/element/${successRowElement['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='detail-loaded'`,'Firefox replay-verified B8 success detail');
  diagnosticReads=await evaluate('window.__ffRehearsal.filter(call=>call.method===\'GET\'&&call.path.startsWith(\'/api/v1/fixed-rehearsals/\')).length');assert.equal(diagnosticReads,1);
  const successDiagnosticCall=await evaluate(`window.__ffRehearsal.filter(call=>call.method==='GET'&&call.path.startsWith('/api/v1/fixed-rehearsals/')).at(-1)`);
  assert.equal(successDiagnosticCall.path,`/api/v1/fixed-rehearsals/${successReceipt.rehearsalId}`);
  const successDiagnostic=successDiagnosticCall.body;
  assert.equal(successDiagnosticCall.status,200);assert.equal(successDiagnostic.captureOrigin,'BANK_ELIGIBLE_AT_CAPTURE');assert.equal(successDiagnostic.currentEligibility,'NOT_REVALIDATED');assert.equal(successDiagnostic.qualification,'NOT_ATTESTED_BY_PLATFORM');assert.equal(successDiagnostic.publicationEligibility,'NOT_EVALUATED');assert.equal(successDiagnostic.replayVerified,true);assert.equal(successDiagnostic.createsForm,false);assert.equal(successDiagnostic.capturedCandidateCount,4);assert.equal(successDiagnostic.selectedCount,4);
  for(const question of rehearsalStock) assert.equal(JSON.stringify(successDiagnostic).includes(question.versionId),false,'BANK diagnostic contains no candidate IDs');
  assert.doesNotMatch(JSON.stringify(successDiagnostic),/"(?:sourceId|questionId|versionId|groupId|answerKey|explanation|seed)"\s*:/);
  assert.equal(await evaluate(`${query('staff-bank-rehearsal-detail')}.dataset.currentEligibility`),'NOT_REVALIDATED');
  assert.equal(await evaluate(`${query('staff-bank-rehearsal-detail')}.dataset.createsForm`),'false');
  assert.equal(await evaluate(`${query('staff-bank-rehearsal-detail')}.textContent.includes('BANK_ELIGIBLE_AT_CAPTURE')&&${query('staff-bank-rehearsal-detail')}.textContent.includes('NOT_REVALIDATED')&&${query('staff-bank-rehearsal-detail')}.textContent.includes('NOT_ATTESTED_BY_PLATFORM')`),true,'detail clearly marks capture-time eligibility and no current human qualification');
  assert.equal(await evaluate(`${query('staff-bank-rehearsal-detail')}.querySelectorAll('img,a,script,iframe,object,embed').length`),0,'historical diagnostic is inert text');
  await setViewport(1280,900,'B8 Firefox success detail desktop');await evaluate(`(()=>{${query('staff-bank-rehearsal-detail')}.scrollIntoView({block:'start'});return true})()`);await capture('staff-b8-success-detail-desktop');
  await setViewport(narrowMeasured.innerWidth,812,'B8 Firefox success detail narrow actual viewport');await capture(`staff-b8-success-detail-narrow-${narrowMeasured.innerWidth}`);
  await click('staff-bank-rehearsal-back');await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='list-loaded'`,'Firefox cached B8 history back');
  assert.equal(await evaluate('window.__ffRehearsal.filter(call=>call.method===\'GET\'&&call.path===\'/api/v1/fixed-rehearsals\').length'),1,'back returns to the captured history without another GET');
  assert.equal(await evaluate(`document.activeElement?.dataset.rehearsalId===${JSON.stringify(successReceipt.rehearsalId)}`),true,'B8 back restores focus to the exact history row');
  await click('staff-bank-rehearsals-close');

  // Quarantine one of the four actual approved fixture questions through the
  // staff UI, then make a second explicit capture against the same blueprint.
  await evaluate(`(()=>{const filter=${query('staff-state-filter')};filter.value='';filter.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await waitFor(`${query('staff-list-status')}?.textContent.startsWith('Đang hiển thị')`,'Firefox all-state metadata before B8 quarantine');
  const removedQuestion=rehearsalStock[0];const removedSelector=`[data-testid="staff-review-inspect"][data-version-id="${removedQuestion.versionId}"]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(removedSelector)}))`,'exact eligible fixture question in manager metadata');
  const removedElement=await wd('POST','/element',{using:'css selector',value:removedSelector});await wd('POST',`/element/${removedElement['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
  await waitFor(`Boolean(${query('disposition-quarantine-open')})`,'manager quarantine control for exact B8 stock candidate');
  await click('disposition-quarantine-open');await waitFor(`${query('disposition-dialog')}?.open===true`,'Firefox B8 stock quarantine confirmation');
  await evaluate(`(()=>{const reason=${query('disposition-form-reason')};reason.value='Synthetic Firefox quarantine for the B8 stock-shortfall check; not human review.';reason.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await setViewport(narrowMeasured.innerWidth,812,'B8 Firefox quarantine narrow actual viewport');await capture(`staff-b8-quarantine-narrow-${narrowMeasured.innerWidth}`);
  await setViewport(1280,900,'B8 Firefox quarantine desktop');await click('disposition-confirm');
  await waitFor(`${query('disposition-status')}?.dataset.stage==='acknowledged'&&${query('disposition-status')}?.dataset.currentState==='QUARANTINED'`,'actual Firefox quarantine of one captured stock question');
  assert.equal(await evaluate(`Boolean(document.querySelector('.staff-review-preview'))`),false,'quarantined current view has no private question preview');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'Firefox EXAM_MANAGER login for the post-quarantine capture');
  await evaluate(`${query('actor-select')}.value='examManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprints-open')})`,'EXAM_MANAGER reopens after the Bank change');
  await click('staff-fixed-rehearsal-blueprints-open');await waitFor(`${query('staff-fixed-rehearsal-blueprints-status')}?.dataset.stage==='blueprints-loaded'`,'fresh explicit blueprint read after quarantine');
  const refreshedBlueprints=await evaluate('window.__ffRehearsal.filter(call=>call.method===\'GET\'&&call.path===\'/api/v1/fixed-rehearsal-blueprints\').at(-1).body');
  assert.equal(refreshedBlueprints.items.some(item=>item.blueprintVersionId===rehearsalBlueprint.blueprintVersionId&&item.contentHash===rehearsalBlueprint.contentHash),true,'same exact blueprint remains explicitly selectable');
  await evaluate(`(()=>{const select=${query('staff-fixed-rehearsal-blueprint-select')};select.value=${JSON.stringify(rehearsalBlueprint.blueprintVersionId)};select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await click('staff-fixed-rehearsal-open');await waitFor(`${query('staff-fixed-rehearsal-dialog')}?.open===true`,'second native B8 confirmation after fresh blueprint read');
  await click('staff-fixed-rehearsal-confirm');await waitFor(`${query('staff-fixed-rehearsal-status')}?.dataset.stage==='acknowledged'`,'actual Firefox post-quarantine stock rehearsal');
  const subsequentCaptures=await evaluate('window.__ffRehearsal.filter(call=>call.method===\'POST\')');assert.equal(subsequentCaptures.length,1);
  const allCaptures=[firstCapture,...subsequentCaptures];
  const shortageReceipt=allCaptures[1].body;assert.equal(allCaptures[1].status,201);assert.deepEqual(allCaptures[1].request,firstCapture.request);
  assert.notEqual(allCaptures[1].key,firstCapture.key,'a separate explicit new capture gets a new idempotency key');
  assert.equal(shortageReceipt.outcome,'FAILURE');assert.equal(shortageReceipt.failureCode,'INSUFFICIENT_ELIGIBLE_INVENTORY');assert.deepEqual(shortageReceipt.sectionDeficits,[{section:'MATH',missingCount:1}]);assert.equal(shortageReceipt.currentEligibility,'NOT_REVALIDATED');assert.equal(shortageReceipt.createsForm,false);
  assert.equal(await evaluate(`${query('staff-fixed-rehearsal-status')}.dataset.outcome`),'FAILURE');
  assert.equal(await evaluate(`${query('staff-fixed-rehearsal-status')}.dataset.currentEligibility`),'NOT_REVALIDATED');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'Firefox BANK_MANAGER login for historical B8 rows');
  await evaluate(`${query('actor-select')}.value='bankManager'`);await click('staff-login');await waitFor(`Boolean(${query('staff-bank-rehearsals-open')})`,'BANK_MANAGER returns for historical rehearsal rows');
  assert.equal(await evaluate('window.__ffRehearsal.filter(call=>call.method===\'GET\'&&call.path===\'/api/v1/fixed-rehearsals\').length'),1,'BANK_MANAGER re-login does not prefetch history');
  assert.equal(await evaluate('window.__ffRehearsal.filter(call=>call.method===\'GET\'&&call.path.startsWith(\'/api/v1/fixed-rehearsals/\')).length'),1,'BANK_MANAGER re-login does not prefetch another detail');
  await click('staff-bank-rehearsals-open');await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='list-loaded'`,'B8 history after the later shortage capture');
  const finalHistory=await evaluate('window.__ffRehearsal.filter(call=>call.method===\'GET\'&&call.path===\'/api/v1/fixed-rehearsals\').at(-1).body');
  assert.equal(finalHistory.items.length,2);assert.equal(finalHistory.items.some(item=>item.rehearsalId===successReceipt.rehearsalId&&item.outcome==='SUCCESS'),true,'the prior success remains in immutable history');assert.equal(finalHistory.items.some(item=>item.rehearsalId===shortageReceipt.rehearsalId&&item.outcome==='FAILURE'),true,'the later shortage is separately recorded');
  assert.equal(finalHistory.items[0].capturedAt>=finalHistory.items[1].capturedAt,true,'history stays newest-first');
  async function openFirefoxStockDetail(receipt) {
    const selector=`[data-testid="staff-bank-rehearsal-open"][data-rehearsal-id="${receipt.rehearsalId}"]`;
    const element=await wd('POST','/element',{using:'css selector',value:selector});await wd('POST',`/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`,{});
    await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='detail-loaded'`,'B8 exact rehearsal diagnostic');
    return selector;
  }
  const successHistoryRow=await openFirefoxStockDetail(successReceipt);
  const historicalSuccess=await evaluate(`window.__ffRehearsal.filter(call=>call.method==='GET'&&call.path==='/api/v1/fixed-rehearsals/${successReceipt.rehearsalId}').at(-1).body`);
  assert.equal(historicalSuccess.rehearsal.outcome,'SUCCESS');assert.equal(historicalSuccess.capturedCandidateCount,4);assert.equal(historicalSuccess.currentEligibility,'NOT_REVALIDATED');assert.equal(historicalSuccess.createsForm,false);
  await setViewport(1280,900,'B8 Firefox historical success desktop');await capture('staff-b8-historical-success-desktop');
  await click('staff-bank-rehearsal-back');await waitFor(`${query('staff-bank-rehearsals-status')}?.dataset.stage==='list-loaded'`,'B8 return before shortage details');
  assert.equal(await evaluate(`document.activeElement?.matches(${JSON.stringify(successHistoryRow)})`),true,'Firefox history back returns focus to the prior success row');
  const shortageHistoryRow=await openFirefoxStockDetail(shortageReceipt);
  const shortageDiagnostic=await evaluate(`window.__ffRehearsal.filter(call=>call.method==='GET'&&call.path==='/api/v1/fixed-rehearsals/${shortageReceipt.rehearsalId}').at(-1).body`);
  assert.equal(shortageDiagnostic.rehearsal.failureCode,'INSUFFICIENT_ELIGIBLE_INVENTORY');assert.equal(shortageDiagnostic.capturedCandidateCount,3);assert.equal(shortageDiagnostic.selectedCount,0);assert.equal(shortageDiagnostic.section.selectedCount,0);assert.equal(shortageDiagnostic.rehearsal.sectionDeficits[0].missingCount,1);assert.equal(shortageDiagnostic.currentEligibility,'NOT_REVALIDATED');
  assert.equal(await evaluate(`${query('staff-bank-rehearsal-detail')}.dataset.outcome`),'FAILURE');
  assert.equal(await evaluate(`${query('staff-bank-rehearsal-detail')}.textContent.includes('Count shortfall proven at capture time')`),true);
  assert.equal(await evaluate(`${query('staff-bank-rehearsal-detail')}.querySelectorAll('img,a,script,iframe,object,embed').length`),0);
  for(const question of rehearsalStock) assert.equal(JSON.stringify(shortageDiagnostic).includes(question.versionId),false,'shortage detail contains no candidate IDs');
  await setViewport(narrowMeasured.innerWidth,812,'B8 Firefox shortage detail narrow actual viewport');await capture(`staff-b8-shortage-detail-narrow-${narrowMeasured.innerWidth}`);
  assert.deepEqual(await evaluate('window.__ffB8Errors'),[],'B8 staff interactions have no uncaught browser errors');
  assert.equal(await evaluate('performance.getEntriesByType(\'resource\').every(item=>new URL(item.name).origin===location.origin)'),true,'B8 workflow loads no external resources');
  await click('staff-logout');await waitFor(`Boolean(${query('staff-login')})`,'Firefox B8 manager logout cleanup');
  assert.equal(await evaluate(`Boolean(${query('staff-bank-rehearsals')})||Boolean(${query('staff-bank-rehearsal-detail')})||document.body.textContent.includes(${JSON.stringify(successReceipt.rehearsalId)})||document.body.textContent.includes(${JSON.stringify(shortageReceipt.rehearsalId)})`),false,'logout clears private rehearsal history and detail DOM');
  report.checks.push('B8 Firefox BANK_MANAGER explicitly reads history/detail; actual UI quarantine removes one of four approved synthetic Bank questions; a fresh EXAM capture records only the proven MATH shortfall while prior SUCCESS remains historical; aggregates contain no candidate/private identifiers, current eligibility remains NOT_REVALIDATED, viewport/keyboard/logout/privacy checks pass');

  await evaluate(`${query('actor-select')}.value='examManager'`);await click('staff-login');
  await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprints-open')})`,'Firefox session-race EXAM workspace');
  await click('staff-fixed-rehearsal-blueprints-open');
  await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprint-select')})`,'Firefox session-race blueprint selection');
  await evaluate(`(()=>{const select=${query('staff-fixed-rehearsal-blueprint-select')};select.value=${JSON.stringify(rehearsalBlueprint.blueprintVersionId)};select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await click('staff-fixed-rehearsal-open');
  const beforeSessionSwitch=(await staffFixture.fixture.pool.query('SELECT count(*)::integer AS n FROM tsa_private.fixed_stock_rehearsals')).rows[0].n;
  const beforeSessionSwitchPosts=await evaluate("window.__ffRehearsal.filter(call=>call.method==='POST').length");
  await evaluate(`(async()=>{const token=()=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('tsa_local_csrf='))?.slice('tsa_local_csrf='.length);const post=(path,body,csrf)=>fetch(path,{method:'POST',headers:{'content-type':'application/json',...(csrf?{'x-csrf-token':token()}: {})},body:JSON.stringify(body),credentials:'same-origin'});if((await post('/local-auth/logout',{},true)).status!==200)throw new Error('Synthetic session rotation logout failed');if((await post('/local-auth/bootstrap',{},false)).status!==201)throw new Error('Synthetic session rotation bootstrap failed');if((await post('/local-auth/login',{actorKey:'examManager'},true)).status!==200)throw new Error('Synthetic session rotation login failed');return true})()`);
  await click('staff-fixed-rehearsal-confirm');
  await waitFor(`Boolean(${query('staff-session-reload')})`,'Firefox changed-session recovery instead of an old command');
  assert.equal(await evaluate("window.__ffRehearsal.filter(call=>call.method==='POST').length"),beforeSessionSwitchPosts,'Firefox changed session sends zero old confirmation POSTs');
  assert.equal((await staffFixture.fixture.pool.query('SELECT count(*)::integer AS n FROM tsa_private.fixed_stock_rehearsals')).rows[0].n,beforeSessionSwitch);
  assert.equal(await evaluate(`!${query('staff-review-context')}&&!${query('staff-fixed-rehearsal-status')}&&document.activeElement.id==='staff-title'`),true,'Firefox clears private/intent DOM and focuses the recovery heading');
  await setViewport(1280,900,'Firefox session recovery desktop');await capture('staff-session-changed-desktop');
  await setViewport(narrowMeasured.innerWidth,812,'Firefox session recovery narrow');await capture(`staff-session-changed-narrow-${narrowMeasured.innerWidth}`);
  await click('staff-session-reload');await waitFor(`Boolean(${query('staff-fixed-rehearsal-blueprints-open')})`,'Firefox explicit current-session read recovery');
  assert.equal(await evaluate("window.__ffRehearsal.filter(call=>call.method==='POST').length"),beforeSessionSwitchPosts,'Firefox recovery reads only and requires a new confirmation for any command');
  assert.equal(await evaluate("performance.getEntriesByType('resource').every(item=>new URL(item.name).origin===location.origin)"),true);
  report.checks.push('Firefox real authenticated session rotation invalidates a pending confirmation with zero command writes; private intent DOM clears, heading focus and desktop/narrow recovery are usable, explicit current-session reload performs no command');

  report.viewports = { staffDesktop: desktopViewport, staffNarrow: {
    requestedOuterWidth: narrowRequested, returnedOuterWidth: narrowViewport.width,
    widthRequestHonored: narrowWidthHonored, ...narrowMeasured,
  } };
  report.checks.push('Staff B1 synthetic AUTHOR opens only exact version 0 on explicit activation; AVAILABLE SC, native MathML, table, key, explanation, version and hash verified');
  report.checks.push('Staff 1280px desktop and best-supported narrow Firefox viewport screenshots; W3C Escape restores exact row focus; logout clears private DOM');
}

async function runReviewPracticeJourney() {
  assert.ok(fixture?.blueprint?.versionId, 'the actual mixed fixture blueprint exists');
  const installReviewTrace = async (seed = []) => evaluate(`(()=>{window.__reviewErrors=window.__reviewErrors||[];window.addEventListener('error',event=>window.__reviewErrors.push(event.message||'window error'));window.addEventListener('unhandledrejection',event=>window.__reviewErrors.push(String(event.reason?.message||event.reason||'unhandled rejection')));const original=window.fetch.bind(window);window.__reviewCalls=${JSON.stringify(seed)};window.__reviewDropFirstAck=false;window.__reviewHoldNextAck=false;window.fetch=async(...args)=>{const options=args[1]||{};const requestUrl=typeof args[0]==='string'?args[0]:args[0].url;const url=new URL(requestUrl,location.href);const method=String(options.method||'GET').toUpperCase();let requestBody=null;if(url.pathname==='/api/v1/attempts'&&method==='POST'&&typeof options.body==='string')requestBody=JSON.parse(options.body);const response=await original(...args);if(url.pathname==='/api/v1/attempts'&&method==='POST'){const responseBody=await response.clone().json();const record={body:requestBody,key:new Headers(options.headers||{}).get('idempotency-key'),status:response.status,responseBody};window.__reviewCalls.push(record);if(window.__reviewDropFirstAck&&requestBody?.reuseMode==='REVIEW_ALLOWED'&&response.status===201){window.__reviewDropFirstAck=false;window.__reviewDroppedReceipt=responseBody;throw new TypeError('Firefox fixture dropped a real committed review response');}if(window.__reviewHoldNextAck&&requestBody?.reuseMode==='REVIEW_ALLOWED'&&response.status===201){window.__reviewHoldNextAck=false;window.__reviewHeldReceipt=responseBody;await window.__reviewAckGate;}}return response;};return true})()`);
  await installReviewTrace();

  const narrowViewport = async (height, label) => {
    let requested = 375;
    let returned = await wd('POST', '/window/rect', { width: requested, height });
    await new Promise((resolve) => setTimeout(resolve, 150));
    let measured = await evaluate(`({innerWidth,outerWidth,scrollWidth:document.documentElement.scrollWidth,scale:window.visualViewport?.scale??null})`);
    if (measured.innerWidth !== requested) {
      requested = 450;
      returned = await wd('POST', '/window/rect', { width: requested, height });
      await new Promise((resolve) => setTimeout(resolve, 150));
      measured = await evaluate(`({innerWidth,outerWidth,scrollWidth:document.documentElement.scrollWidth,scale:window.visualViewport?.scale??null})`);
      if (measured.innerWidth !== requested) assert.equal(measured.innerWidth, measured.outerWidth, `${label} reports Firefox's actual minimum width`);
    }
    assert.ok(measured.innerWidth >= 320, `${label} has a usable measured viewport`);
    assert.equal(measured.scrollWidth <= measured.innerWidth, true, `${label} has no horizontal overflow`);
    if (measured.scale !== null) assert.equal(measured.scale, 1, `${label} is not auto-zoomed`);
    return { requestedWidth: requested, returnedOuterWidth: returned.width, widthRequestHonored: measured.innerWidth === requested, ...measured };
  };
  const readCurrentAttempt = async () => wd('POST', '/execute/async', { args: [], script: `const done=arguments[arguments.length-1];fetch('/api/v1/attempts?limit=100').then(response=>response.json()).then(page=>{const item=page.items.find(value=>['CREATED','IN_PROGRESS'].includes(value.state));if(!item)throw new Error('No owned active attempt');return fetch('/api/v1/attempts/'+item.attemptId).then(response=>response.json())}).then(done,error=>done({error:String(error)}));` });
  const saveFirstAnswer = async (slot) => {
    if (slot.interaction.type === 'MULTIPLE_CHOICE') {
      await click('option-a');
      assert.equal(await evaluate(`${query('submit-open')}.disabled`), true, 'partial multiple-choice answer remains incomplete');
      await click('option-c');
    } else if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
      await click('tf-s1-true');
      await waitFor(`!${query('tf-s2-false')}.disabled`, 'review mode first true/false save');
      await click('tf-s2-false');
    } else {
      await click('option-b');
    }
    await waitFor(`Boolean(${query('save-status')}.classList.contains('saved'))`, 'review mode acknowledged answer');
  };
  const isCompleteAnswer = (slot, answers) => {
    const value = answers.find(answer => answer.slotId === slot.slotId)?.value;
    if (slot.interaction.type === 'MULTIPLE_CHOICE') return Array.isArray(value?.optionIds)
      && value.optionIds.length >= slot.interaction.minSelections;
    if (slot.interaction.type === 'TRUE_FALSE_GROUP') return Array.isArray(value?.statementValues)
      && value.statementValues.length === slot.interaction.statements.length;
    return typeof value?.optionId === 'string';
  };
  const finishActiveAttempt = async () => {
    const current = await readCurrentAttempt();
    assert.equal(current.state, 'IN_PROGRESS');
    assert.equal(current.domain, 'MATH');
    checkPrivate(current);
    for (const [index, slot] of current.slots.entries()) {
      if (index > 0) await click('question-next');
      if (!isCompleteAnswer(slot, current.answers)) await saveFirstAnswer(slot);
    }
    await click('submit-open');
    await click('submit-confirm');
    await waitFor(`Boolean(${query('result')})`, 'review mode attempt released result');
    return current;
  };

  await click('back-score');
  await click('return-catalog');
  let shortageCall = null;
  let shortageFound = false;
  for (let index = 0; index < 4; index++) {
    const callCount = await evaluate('window.__reviewCalls.length');
    await click('demo-start');
    await waitFor(`Boolean(${query('review-mode-offer')}||document.getElementById('question-title'))`, `bounded NEW_ONLY inventory exhaustion ${index + 1}`);
    if (await evaluate(`Boolean(${query('review-mode-offer')})`)) {
      shortageFound = true;
      const calls = await evaluate('window.__reviewCalls');
      assert.equal(calls.length, callCount + 1, 'one fresh explicit NEW_ONLY create returned the shortage');
      shortageCall = calls.at(-1);
      break;
    }
    await finishActiveAttempt();
    await click('return-catalog');
  }
  assert.equal(shortageFound, true, 'bounded actual UI attempts exhaust unseen fixture inventory');
  assert.equal(shortageCall.status, 422);
  assert.equal(shortageCall.responseBody?.error?.code, 'INSUFFICIENT_UNSEEN_INVENTORY');
  assert.equal(shortageCall.responseBody?.error?.details?.reuseMode, 'NEW_ONLY');
  assert.equal(shortageCall.responseBody?.error?.details?.blueprintVersionId, fixture.blueprint.versionId);
  assert.deepEqual(shortageCall.responseBody?.error?.details?.alternatives, [{ kind: 'REVIEW_MODE', blueprintVersionId: fixture.blueprint.versionId, requiresRepeatConsent: true }]);
  assert.deepEqual(shortageCall.body, { blueprintVersionId: fixture.blueprint.versionId }, 'the failed NEW_ONLY request keeps the old omission/body');
  checkPrivate(shortageCall.responseBody);
  for (const question of fixture.questions) {
    assert.equal(JSON.stringify(shortageCall.responseBody).includes(question.versionId), false, 'unseen shortage omits eligible candidate IDs');
  }
  const offerVersion = await evaluate(`${query('review-mode-offer')}.dataset.blueprintVersionId`);
  assert.equal(offerVersion, fixture.blueprint.versionId, 'the offer is pinned to the current failed request blueprint');
  await setViewport(1280, 900, 'review offer desktop');
  await evaluate(`(()=>{${query('review-mode-offer')}.scrollIntoView({block:'center'});return true})()`);
  await capture('review-mode-offer-desktop');
  const narrow = await narrowViewport(812, 'review offer narrow');
  await evaluate(`(()=>{${query('review-mode-offer')}.scrollIntoView({block:'center'});return true})()`);
  await capture(`review-mode-offer-narrow-${narrow.innerWidth}`);

  const postsBeforeConsent = await evaluate('window.__reviewCalls.length');
  await click('review-mode-open');
  await waitFor(`Boolean(${query('review-mode-dialog')}.open)`, 'review mode explicit consent dialog');
  assert.equal(await evaluate(`${query('review-mode-dialog')}.dataset.stage`), 'confirming');
  assert.equal(await evaluate(`${query('review-mode-status')}.dataset.stage`), 'confirming');
  assert.equal(await evaluate(`${query('review-mode-consent')}.checked`), false, 'each review consent starts unchecked');
  assert.equal(await evaluate(`${query('review-mode-confirm')}.disabled`), true, 'empty repeat consent cannot confirm');
  assert.equal(await evaluate(`${query('review-mode-dialog')}.textContent.includes('Toán học')&&${query('review-mode-dialog')}.textContent.includes('4 câu')&&${query('review-mode-dialog')}.textContent.includes('10 phút')`), true, 'confirmation pins exact domain/count/duration');
  assert.equal(await evaluate('window.__reviewCalls.length'), postsBeforeConsent, 'opening an unchecked confirmation sends no POST');
  await setViewport(1280, 900, 'review consent desktop');
  await capture('review-mode-consent-desktop');
  const consentNarrow = await narrowViewport(812, 'review consent narrow');
  await capture(`review-mode-consent-narrow-${consentNarrow.innerWidth}`);
  await click('review-mode-cancel');
  await waitFor(`!${query('review-mode-dialog')}?.open`, 'review consent cancel');
  assert.equal(await evaluate(`document.activeElement===${query('review-mode-open')}`), true, 'cancel restores focus to the offer trigger');
  assert.equal(await evaluate(`${query('review-mode-status')}.dataset.stage`), 'offered', 'cancel resets the offer state');
  assert.equal(await evaluate('window.__reviewCalls.length'), postsBeforeConsent, 'cancel sends zero review POSTs');
  await click('review-mode-open');
  await waitFor(`Boolean(${query('review-mode-dialog')}.open)`, 'review consent reopen');
  const escape = '\uE00C';
  await wd('POST', '/actions', { actions: [{ type: 'key', id: 'review-consent-escape', actions: [
    { type: 'keyDown', value: escape }, { type: 'keyUp', value: escape },
  ] }] });
  await waitFor(`!${query('review-mode-dialog')}?.open`, 'native Escape cancels review consent');
  assert.equal(await evaluate(`document.activeElement===${query('review-mode-open')}`), true, 'Escape restores focus to the exact offer trigger');
  assert.equal(await evaluate(`${query('review-mode-consent')}`), null, 'canceled dialog is removed and its consent discarded');
  assert.equal(await evaluate('window.__reviewCalls.length'), postsBeforeConsent, 'Escape sends zero review POSTs');

  await click('review-mode-open');
  await waitFor(`Boolean(${query('review-mode-dialog')}.open)`, 'fresh review consent after Escape');
  await wd('POST', '/actions', { actions: [{ type: 'key', id: 'review-consent-space', actions: [
    { type: 'keyDown', value: ' ' }, { type: 'keyUp', value: ' ' },
  ] }] });
  assert.equal(await evaluate(`${query('review-mode-consent')}.checked`), true, 'keyboard activates the explicit consent checkbox');
  assert.equal(await evaluate(`${query('review-mode-confirm')}.disabled`), false, 'fresh affirmative consent enables confirmation');
  assert.equal(await evaluate('window.__reviewCalls.length'), postsBeforeConsent, 'checking consent alone sends zero review POSTs');
  await evaluate('window.__reviewDropFirstAck=true');
  await click('review-mode-confirm');
  await waitFor(`Boolean(${query('review-mode-status')}&&${query('review-mode-status')}.dataset.stage==='uncertain')`, 'lost actual review acknowledgement is reported uncertain');
  const dropped = await evaluate('window.__reviewCalls.at(-1)');
  assert.equal(dropped.status, 201, 'the deliberately dropped acknowledgement was a real committed HTTP 201');
  assert.deepEqual(dropped.body, { mode: 'PERSONALIZED_PRACTICE', blueprintVersionId: fixture.blueprint.versionId, reuseMode: 'REVIEW_ALLOWED', acknowledgeRepeats: true }, 'review consent sends the exact frozen request');
  assert.notEqual(dropped.key, shortageCall.key, 'review uses a fresh key distinct from the failed NEW_ONLY intent');
  const afterDroppedAck = await evaluate('window.__reviewCalls.length');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await evaluate('window.__reviewCalls.length'), afterDroppedAck, 'uncertain review does not auto-retry');
  assert.equal(await evaluate(`document.body.textContent.includes(${JSON.stringify(dropped.key)})`), false, 'idempotency key is not rendered');
  await setViewport(1280, 900, 'review uncertain desktop');
  await capture('review-mode-uncertain-desktop');
  await click('review-mode-retry');
  await waitFor(`Boolean(${query('created-attempt')})`, 'explicit same-key review replay reaches reserved attempt');
  const reviewCalls = await evaluate(`window.__reviewCalls.filter(call=>call.body?.reuseMode==='REVIEW_ALLOWED')`);
  assert.equal(reviewCalls.length, 2, 'one lost actual receipt plus one explicit same-intent replay');
  assert.equal(reviewCalls[0].key, reviewCalls[1].key, 'uncertain retry preserves the exact idempotency key');
  assert.deepEqual(reviewCalls[0].body, reviewCalls[1].body, 'uncertain retry preserves the exact request body');
  assert.equal(reviewCalls[0].responseBody.attemptId, reviewCalls[1].responseBody.attemptId, 'replay returns the same persisted receipt');
  assert.equal(reviewCalls[1].responseBody.state, 'CREATED');
  assert.equal(reviewCalls[1].responseBody.formMode, 'PERSONALIZED_PRACTICE');
  assert.equal(reviewCalls[1].responseBody.reuseMode, 'REVIEW_ALLOWED');
  assert.equal(await evaluate(`Boolean(${query('created-attempt')}&&document.body.textContent.includes('Lượt ôn tập · có thể lặp câu'))`), true, 'receipt and fresh view show the reserved review mode');
  assert.equal(await evaluate(`document.body.textContent.includes(${JSON.stringify(reviewCalls[1].responseBody.attemptId)})||document.body.textContent.includes(${JSON.stringify(reviewCalls[1].key)})`), false, 'receipt identifiers and idempotency key are not shown as product content');
  await evaluate(`(()=>{${query('created-attempt')}.scrollIntoView({block:'center'});return true})()`);
  await capture('review-mode-reserved-desktop');
  const reservedNarrow = await narrowViewport(812, 'review reserved narrow');
  await capture(`review-mode-reserved-narrow-${reservedNarrow.innerWidth}`);
  await setViewport(1280, 900, 'review active desktop');
  await click('created-start');
  await waitFor(`Boolean(document.getElementById('question-title')&&${query('exam-header')})`, 'review attempt explicit start');
  const reviewAttemptView = await readCurrentAttempt();
  assert.equal(reviewAttemptView.formMode, 'PERSONALIZED_PRACTICE');
  assert.equal(reviewAttemptView.reuseMode, 'REVIEW_ALLOWED');
  assert.equal(await evaluate(`${query('exam-header')}.textContent.includes('Lượt ôn tập · có thể lặp câu')`), true, 'active attempt shows persisted review mode');
  await saveFirstAnswer(reviewAttemptView.slots[0]);
  await capture('review-mode-active-desktop');
  const activeNarrow = await narrowViewport(812, 'review active narrow');
  await capture(`review-mode-active-narrow-${activeNarrow.innerWidth}`);
  const previousDocument = await evaluate('performance.timeOrigin');
  const reviewCallsBeforeReload = await evaluate('window.__reviewCalls');
  await wd('POST', '/refresh', {});
  await waitFor(`performance.timeOrigin!==${previousDocument}&&Boolean(document.getElementById('question-title')&&${query('exam-header')})`, 'review attempt reload and resume');
  await installReviewTrace(reviewCallsBeforeReload);
  const resumedReviewView = await readCurrentAttempt();
  assert.equal(resumedReviewView.attemptId, reviewAttemptView.attemptId, 'reload resumes the same owned review attempt');
  assert.equal(resumedReviewView.formMode, 'PERSONALIZED_PRACTICE');
  assert.equal(resumedReviewView.reuseMode, 'REVIEW_ALLOWED');
  assert.equal(resumedReviewView.answers.filter(answer=>answer.value).length, 1, 'the actual acknowledged review answer survived reload');
  assert.equal(await evaluate(`${query('exam-header')}.textContent.includes('Lượt ôn tập · có thể lặp câu')`), true, 'resume keeps the persisted review label');
  await finishActiveAttempt();
  const resultText = await evaluate('document.body.textContent');
  assert.match(resultText, /Lượt ôn tập · có thể lặp câu/, 'released result is labeled as review mode');
  await setViewport(1280, 900, 'review result desktop');
  await capture('review-mode-result-desktop');
  const resultNarrow = await narrowViewport(812, 'review result narrow');
  await capture(`review-mode-result-narrow-${resultNarrow.innerWidth}`);
  await setViewport(1280, 900, 'review released review desktop');
  await click('review-open');
  await waitFor(`Boolean(${query('review')})`, 'review-mode released answers');
  assert.equal(await evaluate(`Boolean(document.querySelector('.review-context .review-mode-label'))`), true, 'released-answer screen labels the persisted review mode');
  assert.equal(await evaluate(`document.body.textContent.includes(${JSON.stringify(reviewCalls[1].key)})`), false, 'released review does not show the create idempotency key');
  await capture('review-mode-released-review-desktop');
  const releasedNarrow = await narrowViewport(812, 'review released review narrow');
  await capture(`review-mode-released-review-narrow-${releasedNarrow.innerWidth}`);
  await setViewport(1280, 900, 'review history desktop');
  await click('back-score');
  await click('return-catalog');
  await waitFor(`Boolean(${query('persistent-history')})`, 'review attempt history');
  assert.equal(await evaluate(`Boolean(document.querySelector('.persistent-history .review-mode-label'))`), true, 'history labels its stored review attempt');
  assert.equal(await evaluate(`Boolean(document.querySelector('.persistent-current-attempt .review-mode-label'))`), true, 'current attempt resume card keeps its review label');
  await capture('review-mode-history-desktop');
  const historyNarrow = await narrowViewport(812, 'review history narrow');
  await capture(`review-mode-history-narrow-${historyNarrow.innerWidth}`);
  await setViewport(1280, 900, 'post-review NEW_ONLY desktop');

  const callsBeforeStrictAgain = await evaluate('window.__reviewCalls.length');
  await click('demo-start');
  await waitFor(`Boolean(${query('review-mode-offer')})`, 'subsequent strict NEW_ONLY remains exhausted');
  const afterStrictAgain = await evaluate('window.__reviewCalls');
  assert.equal(afterStrictAgain.length, callsBeforeStrictAgain + 1, 'subsequent default request makes one NEW_ONLY POST only');
  const strictAgain = afterStrictAgain.at(-1);
  assert.deepEqual(strictAgain.body, { blueprintVersionId: fixture.blueprint.versionId }, 'default body still omits review fields');
  assert.equal(strictAgain.responseBody?.error?.code, 'INSUFFICIENT_UNSEEN_INVENTORY');
  assert.equal(strictAgain.responseBody?.error?.details?.reuseMode, 'NEW_ONLY');
  assert.deepEqual(strictAgain.responseBody?.error?.details?.alternatives, [{ kind: 'REVIEW_MODE', blueprintVersionId: fixture.blueprint.versionId, requiresRepeatConsent: true }]);
  assert.equal(await evaluate(`${query('review-mode-status')}.dataset.stage`), 'offered', 'only the current same-blueprint server alternative is offered');
  assert.equal(await evaluate(`document.querySelector('.persistent-history .review-mode-label')!==null`), true, 'review history remains visible beside later strict shortage');
  await evaluate(`(()=>{${query('review-mode-offer')}.scrollIntoView({block:'center'});return true})()`);
  await capture('review-mode-new-only-shortage-desktop');
  const strictNarrow = await narrowViewport(812, 'post-review NEW_ONLY narrow');
  await capture(`review-mode-new-only-shortage-narrow-${strictNarrow.innerWidth}`);
  await setViewport(1280, 900, 'review pending logout desktop');

  await click('review-mode-open');
  await waitFor(`Boolean(${query('review-mode-dialog')}.open)`, 'fresh review intent before logout fence');
  await wd('POST', '/actions', { actions: [{ type: 'key', id: 'review-consent-final-space', actions: [
    { type: 'keyDown', value: ' ' }, { type: 'keyUp', value: ' ' },
  ] }] });
  await evaluate('(()=>{window.__reviewHoldNextAck=true;window.__reviewAckGate=new Promise(resolve=>{window.__reviewAckRelease=resolve});return true})()');
  await click('review-mode-confirm');
  await waitFor(`window.__reviewCalls.length===${afterStrictAgain.length + 1}&&${query('review-mode-status')}.dataset.stage==='posting'`, 'review creation held after real committed response');
  const heldCall = await evaluate('window.__reviewCalls.at(-1)');
  assert.equal(heldCall.status, 201, 'late-completion fence uses an actual committed review response');
  assert.deepEqual(heldCall.body, { mode: 'PERSONALIZED_PRACTICE', blueprintVersionId: fixture.blueprint.versionId, reuseMode: 'REVIEW_ALLOWED', acknowledgeRepeats: true });
  await click('persistent-logout');
  await waitFor(`Boolean(${query('persistent-login-studentA')})`, 'logout clears pending review intent');
  assert.equal(await evaluate(`Boolean(${query('review-mode-status')})||Boolean(${query('created-attempt')})`), false, 'logout removes all review operation DOM');
  await evaluate('window.__reviewAckRelease?.()');
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(await evaluate(`Boolean(${query('review-mode-status')})||Boolean(${query('created-attempt')})||document.body.textContent.includes(${JSON.stringify(heldCall.responseBody.attemptId)})`), false, 'late committed response cannot restore the prior identity UI');
  await click('persistent-login-studentB');
  await waitFor(`Boolean(${query('persistent-history')})`, 'second synthetic candidate has isolated history');
  assert.equal(await evaluate(`Boolean(document.querySelector('.persistent-current-attempt .review-mode-label'))||Boolean(document.querySelector('.persistent-history .review-mode-label'))`), false, 'review attempt is not disclosed to another candidate');
  assert.deepEqual(await evaluate('window.__reviewErrors'), [], 'Firefox review journey has no uncaught or unhandled browser errors');
  assert.equal(await evaluate(`performance.getEntriesByType('resource').every(item=>new URL(item.name).origin===location.origin)`), true, 'review journey loads no external resources');
  report.reviewPracticeViewports = { desktop: await setViewport(1280, 900, 'review final desktop'), narrow, consentNarrow, reservedNarrow, activeNarrow, resultNarrow, releasedNarrow, historyNarrow, strictNarrow };
  report.checks.push('WEB-003 Firefox bounds real NEW_ONLY exhaustion to four UI attempts and shows REVIEW_MODE only for the fresh same-blueprint unseen-inventory alternative');
  report.checks.push('WEB-003 Firefox native unchecked consent/cancel/Escape restores focus with zero review POSTs; explicit keyboard consent sends exact frozen body under a fresh idempotency key');
  report.checks.push('WEB-003 Firefox drops a real committed 201 acknowledgement, reports uncertainty, and retries explicitly with identical body/key to replay the same CREATED receipt');
  report.checks.push('WEB-003 Firefox explicitly starts the reserved review attempt, saves/reloads/resumes/submits/releases/reviews it with persisted mode labels and history; later default NEW_ONLY remains an unseen shortage');
  report.checks.push('WEB-003 Firefox real committed late receipt is fenced by logout; second synthetic candidate receives no prior review UI/history; screenshots include desktop and actual narrow viewport');
}

function checkPrivate(value) {
  const privateFields = new Set(['answerKey', 'correctAnswer', 'explanation', 'provenance', 'reviewNotes', 'keySnapshot', 'privateHash']);
  if (Array.isArray(value)) { value.forEach(checkPrivate); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(privateFields.has(key), false, `unexpected private field: ${key}`); checkPrivate(child);
  }
}
try {
  await mkdir(artifacts, { recursive: true });
  fixture = await createMixedStudentFixture();
  const login = `firefox_worker_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${login} LOGIN`); await fixture.pool.query(`GRANT tsa_exam_worker TO ${login}`);
  workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: login });
  const workerProxy = { async connect() {
    if (!workerState.available) throw new Error('Synthetic worker outage');
    return workerPool.connect();
  } };
  const rate = { capacity: 100, refillPerSecond: 10 };
  runtime = await createStudentRuntime({ identityPool: fixture.harness.authPool, examPool: fixture.examPool,
    workerPool: workerProxy, env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0,
    pollMilliseconds: 30, sweepBatchSize: 10, executorId: 'firefox-browser', leaseSeconds: 30, retrySeconds: 1,
    enableReviewPractice,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  workerState.available = false;
  driver = spawn(process.env.STUDENT_GECKODRIVER ?? '/snap/bin/geckodriver',
    ['--host', '127.0.0.1', '--port', '0', '--profile-root', profileRoot], { stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [driver.stdout, driver.stderr]) {
    stream.setEncoding('utf8'); stream.on('data', (chunk) => { driverLog = (driverLog + chunk).slice(-32_000); });
  }
  driver.once('error', (error) => { driverError = error; });
  for (let index = 0; index < 200 && !endpoint; index++) {
    if (driverError) throw driverError;
    const port = driverLog.match(/Listening on 127\.0\.0\.1:(\d+)/)?.[1];
    if (port) endpoint = `http://127.0.0.1:${port}`;
    else await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(endpoint, 'geckodriver listens on an ephemeral loopback port');
  const session = await wd('POST', '/session', { capabilities: { alwaysMatch: {
    browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] },
  } } });
  sessionId = session.sessionId; report.browser = `${session.capabilities.browserName}/${session.capabilities.browserVersion}`;
  assert.equal(session.capabilities.browserName, 'firefox');
  await wd('POST', '/window/rect', { width: 1280, height: 900 });
  await wd('POST', '/url', { url: `${runtime.origin}/?student=postgres` });
  await waitFor(`Boolean(${query('persistent-login-studentA')})`, 'explicit candidate login');
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__responses=[];window.fetch=async(...args)=>{const response=await original(...args);const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);if(url.pathname.startsWith('/api/v1/'))window.__responses.push({path:url.pathname,status:response.status,body:await response.clone().json()});return response;};return true})()`);
  await capture('login'); await click('persistent-login-studentA'); await click('demo-start');
  await waitFor('Boolean(document.getElementById("question-title"))', 'persisted question delivery');
  const view = await wd('POST', '/execute/async', { args: [], script: `const done=arguments[arguments.length-1];fetch('/api/v1/attempts?limit=100').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items[0].attemptId)).then(r=>r.json()).then(done,e=>done({error:String(e)}));` });
  assert.equal(view.state, 'IN_PROGRESS'); assert.equal(view.slots.length, 4); checkPrivate(view);
  const clocks = (await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows;
  await waitFor('Boolean(document.querySelector(".content-math[data-math-state=rendered] math msup"))', 'Firefox native MathML superscript');
  assert.equal(await evaluate('document.body.innerText.includes("Bảng dữ liệu tổng hợp")'), true);
  for (const [index, slot] of view.slots.entries()) {
    if (index) await click('question-next');
    if (slot.interaction.type === 'MULTIPLE_CHOICE') {
      await click('option-a');
      assert.equal(await evaluate(`${query('submit-open')}.disabled`), true, 'partial MC stays unsaved');
      await click('option-c');
    } else if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
      await click('tf-s1-true');
      await waitFor(`!${query('tf-s2-false')}.disabled`, 'first TF save acknowledged');
      await click('tf-s2-false');
    } else await click('option-b');
    await waitFor(`Boolean(${query('save-status')}.classList.contains('saved') && !${query('submit-open')}.disabled)`, 'acknowledged typed answer');
  }
  assert.match(await evaluate(`${query('answered-count')}.textContent`), /4\/4/);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.answers WHERE attempt_id=$1', [view.attemptId])).rows[0].n, 4);
  const responses = await evaluate('window.__responses'); assert.ok(responses.length >= 7);
  responses.forEach(({ body }) => checkPrivate(body));
  const priorDocument = await evaluate('performance.timeOrigin');
  await wd('POST', '/refresh', {});
  await waitFor(`performance.timeOrigin!==${priorDocument} && Boolean(document.getElementById('question-title'))`, 'fresh document resumes');
  assert.match(await evaluate(`${query('answered-count')}.textContent`), /4\/4/);
  assert.deepEqual((await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows, clocks);
  await capture('saved-exam');
  await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('grading-pending')})`, 'durable pending submission');
  workerState.available = true;
  await waitFor(`Boolean(${query('result')})`, 'released result');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /100/);
  await capture('released-result'); await click('review-open');
  await waitFor(`Boolean(${query('back-score')})`, 'released owner review');
  await capture('released-review');
  assert.equal(await evaluate(`performance.getEntriesByType('resource').every(item=>new URL(item.name).origin===location.origin)`), true);
  report.checks = ['Actual Firefox candidate login and mixed-type PostgreSQL allocation/delivery',
    'SC/MC/TF acknowledged saves and partial MC guard; actual pre-release response privacy',
    'Fresh reload preserves saved answers and exact PostgreSQL clock text',
    'Pending worker outage, recovered 100% release and explicit owner review'];
  if (enableReviewPractice) await runReviewPracticeJourney();
  if (process.env.STAFF_REVIEW_FIREFOX === 'true') await runStaffReviewJourney();
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n${driverLog.slice(-3000)}\n`); throw error;
} finally {
  const cleanupErrors = [];
  const cleanup = async (name, action) => {
    try { await action(); } catch (error) { cleanupErrors.push(new Error(`${name}: ${error.message}`, { cause: error })); }
  };
  if (sessionId) await cleanup('Firefox session', async () => { await wd('DELETE', ''); });
  if (driver && driver.exitCode === null && driver.signalCode === null) await cleanup('geckodriver', async () => {
    driver.kill('SIGTERM');
    const closed = await Promise.race([once(driver, 'close').then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 3000))]);
    if (!closed && driver.exitCode === null && driver.signalCode === null) {
      driver.kill('SIGKILL');
      await once(driver, 'close');
    }
  });
  if (staffFixture) await cleanup('staff browser fixture', () => staffFixture.close());
  if (runtime) await cleanup('student runtime', () => runtime.close());
  if (workerPool) await cleanup('student worker pool', () => workerPool.end());
  if (fixture) await cleanup('student fixture', () => fixture.close());
  await cleanup('Firefox profile', () => rm(profileRoot, { recursive: true, force: true }));
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Firefox verification cleanup failed');
}
