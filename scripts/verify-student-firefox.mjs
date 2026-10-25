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

  report.viewports = { staffDesktop: desktopViewport, staffNarrow: {
    requestedOuterWidth: narrowRequested, returnedOuterWidth: narrowViewport.width,
    widthRequestHonored: narrowWidthHonored, ...narrowMeasured,
  } };
  report.checks.push('Staff B1 synthetic AUTHOR opens only exact version 0 on explicit activation; AVAILABLE SC, native MathML, table, key, explanation, version and hash verified');
  report.checks.push('Staff 1280px desktop and best-supported narrow Firefox viewport screenshots; W3C Escape restores exact row focus; logout clears private DOM');
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
