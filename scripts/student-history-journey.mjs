import assert from 'node:assert/strict';
import { beginHeaderStability, assertHeaderStable } from './browse-header-stability.mjs';

/** Existing PostgreSQL browser runtime; real owned history plus explicitly synthetic repeats. */
export async function runHistoryJourney({ evaluate, click, query, waitFor, fixture, capture, report, viewport, narrowWidth = 375 }) {
  const apiModule = await evaluate(`import('/app/persistent-api.js').then(module=>Boolean(module.createPersistentApi))`);
  assert.equal(apiModule, true, 'existing public student SDK is available for isolated fixture generation');
  const firstHistoryBefore=(await fixture.pool.query('SELECT question_id,first_attempt_id FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id',
    [fixture.principals.studentA.userId])).rows;

  // Fixture setup uses the existing frozen consent/create/start/submit student
  // calls. Synthetic Math attempts persist normally; setup never patches database rows directly.
  await evaluate(`(async()=>{
    const {createPersistentApi}=await import('/app/persistent-api.js');
    window.__historyFixtureApi=createPersistentApi();
    await window.__historyFixtureApi.openDemoSession();
    return true;
  })()`);
  const generated=[];
  for(let index=0;index<12;index++){
    const id=await evaluate(`(async()=>{const api=window.__historyFixtureApi;const intent=api.prepareReviewAttempt(${JSON.stringify(fixture.domainBlueprints.MATH.versionId)});const receipt=await api.createReviewAttempt(intent);if(!receipt||receipt.state!=='CREATED'||!receipt.attemptId)throw new Error('Expected the committed owned synthetic review receipt');await api.startReservedAttempt(receipt.attemptId,receipt);await api.submitAttempt(receipt.attemptId);return receipt.attemptId})()`);
    generated.push(id);
    await waitFor(`window.__historyFixtureApi.readAttempt(${JSON.stringify(id)}).then(value=>value.attempt.state==='GRADED')`, `genuine worker grades synthetic history entry ${index+1}`);
  }
  assert.equal(generated.length, 12, '12 real review attempts reached the genuine grading worker');
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS count FROM tsa.attempts WHERE user_id=$1 AND reuse_mode=\'REVIEW_ALLOWED\'',
    [fixture.principals.studentA.userId])).rows[0].count >= 12, true);
  assert.deepEqual((await fixture.pool.query('SELECT question_id,first_attempt_id FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id',
    [fixture.principals.studentA.userId])).rows, firstHistoryBefore, 'synthetic history repeats preserve every original first-attempt assignment');

  await viewport(1280, 900);
  await waitFor(`Boolean(${query('catalog-panel')}) && Boolean(${query('history-refresh')})`, 'history refresh control');
  await evaluate(`(()=>{window.__historyHeaderRefs={root:document.querySelector('#product-header'),brand:document.querySelector('.brand'),nav:document.querySelector('#product-navigation'),home:document.querySelector('[data-testid="nav-home"]'),catalog:document.querySelector('[data-testid="nav-catalog"]')};return true})()`);
  const topBeforeRefresh = await evaluate('window.scrollY');
  await beginHeaderStability(evaluate);
  await evaluate(`${query('history-refresh')}.click()`);
  await waitFor(`${query('history-range')}?.textContent.includes('16')`, 'all attempts appear in the current history range');
  await waitFor("document.querySelectorAll('.persistent-history-item').length===10", 'first history page contains ten attempts');
  assert.equal(await evaluate('window.scrollY'), topBeforeRefresh, 'history refresh does not reset or jump page scroll');
  report.historyHeaderRefresh = await assertHeaderStable(evaluate, 'history GET refresh keeps the persistent header mounted');
  const headerDocumentY = await evaluate("document.querySelector('.brand').getBoundingClientRect().y+window.scrollY");
  await click('history-more');
  await waitFor("document.querySelectorAll('.persistent-history-item').length===16", 'show older entries reveals the complete owned history');
  assert.equal(await evaluate(`(()=>{const active=document.activeElement,row=active.closest('.persistent-history-item');return Boolean(row&&row===document.querySelectorAll('.persistent-history-item')[10])})()`), true,
    'show older entries moves focus to the first newly revealed attempt');
  const olderId = generated[0];
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-testid="history-${olderId}"]'))`), true, 'an older genuine attempt is now reachable');
  assert.equal(await evaluate("document.querySelector('.brand').getBoundingClientRect().y+window.scrollY"), headerDocumentY,
    'scrolling the first newly revealed history row keeps the header in the same document position');
  assert.equal(await evaluate(`(()=>{const a=window.__historyHeaderRefs;return a.root===document.querySelector('#product-header')&&a.brand===document.querySelector('.brand')&&a.nav===document.querySelector('#product-navigation')&&a.home===document.querySelector('[data-testid="nav-home"]')&&a.catalog===document.querySelector('[data-testid="nav-catalog"]')})()`), true,
    'progressive reveal preserves persistent header element identity');
  await evaluate(`${query('persistent-history')}.scrollIntoView({block:'start'})`);
  await capture('history-all-entries-desktop');

  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__historyOriginalFetch=window.fetch;window.__historyReads=[];window.__historyFailOnce=true;window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if((!init.method||init.method==='GET')&&url.pathname==='/api/v1/attempts')window.__historyReads.push(url.pathname+url.search);if(window.__historyFailOnce&&(!init.method||init.method==='GET')&&url.pathname==='/api/v1/attempts'){window.__historyFailOnce=false;return new Response(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE',message:'Synthetic history refresh outage',requestId:crypto.randomUUID(),details:{}}}),{status:503,headers:{'content-type':'application/json'}});}return original(input,init);};return true})()`);
  await evaluate(`${query('history-refresh')}.click()`);
  await waitFor(`${query('persistent-history')}.getAttribute('aria-busy')==='false' && (${query('history-status')}?.textContent.toLowerCase().includes('chưa') || ${query('history-status')}?.textContent.toLowerCase().includes('không thể'))`, 'history outage is explicit');
  assert.equal(await evaluate("document.querySelectorAll('.persistent-history-item').length===16"), true, 'failed refresh retains the cached full history');
  assert.equal(await evaluate('window.__historyReads.length'), 1, 'failed refresh made exactly one read');
  const cachedStatus = await evaluate(`${query('history-status')}.textContent`);
  await evaluate(`${query('persistent-history')}.scrollIntoView({block:'start'})`);
  await capture('history-refresh-error-retains-entries');
  await evaluate(`${query('history-refresh')}.click()`);
  await waitFor(`${query('persistent-history')}.getAttribute('aria-busy')==='false' && ${query('history-status')}?.textContent!==${JSON.stringify(cachedStatus)}`, 'history retry reports current state');
  assert.equal(await evaluate('window.__historyReads.length'), 2, 'recovery retries history GET only');
  assert.equal(await evaluate("document.querySelectorAll('.persistent-history-item').length===16"), true);
  await evaluate('window.fetch=window.__historyOriginalFetch');
  await capture('history-refresh-recovered');

  await evaluate(`(()=>{window.__historyAttemptGets=[];const original=window.fetch.bind(window);window.__historyReadOriginal=window.fetch;window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if((!init.method||init.method==='GET')&&url.pathname.startsWith('/api/v1/attempts/'))window.__historyAttemptGets.push(url.pathname);return original(input,init);};return true})()`);
  await click(`history-${olderId}`);
  await waitFor(`Boolean(${query('result')})`, 'older owned graded result opens from history');
  assert.equal(await evaluate(`window.__historyAttemptGets.includes('/api/v1/attempts/${olderId}')`), true, 'older link reads the selected owned attempt');
  assert.equal((await fixture.pool.query('SELECT state FROM tsa.attempts WHERE id=$1 AND user_id=$2', [olderId, fixture.principals.studentA.userId])).rows[0].state, 'GRADED');
  await capture('history-older-result');
  await click('return-catalog');
  await waitFor(`Boolean(${query('catalog-panel')})`, 'older result returns to catalog');
  await evaluate('window.fetch=window.__historyReadOriginal');

  await viewport(narrowWidth, 900);
  await waitFor(`Boolean(${query('persistent-history')})`, 'history remains visible at narrow width');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'), true, 'history has no horizontal page overflow');
  await evaluate('window.scrollTo(0,0)');
  const narrowBrand = await evaluate(`(()=>{const r=document.querySelector('.brand').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  await beginHeaderStability(evaluate);
  await evaluate(`${query('history-refresh')}.click()`);
  await waitFor(`${query('persistent-history')}.getAttribute('aria-busy')==='false'`, 'narrow history reload completes');
  report.historyHeaderNarrow = await assertHeaderStable(evaluate, 'narrow history refresh');
  const brandAfter = await evaluate(`(()=>{const b=document.querySelector('.brand'),r=b.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  assert.deepEqual(brandAfter, narrowBrand, 'narrow history refresh keeps its header geometry');
  assert.equal(await evaluate(`(()=>{const a=window.__historyHeaderRefs;return a.root===document.querySelector('#product-header')&&a.brand===document.querySelector('.brand')&&a.nav===document.querySelector('#product-navigation')&&a.home===document.querySelector('[data-testid="nav-home"]')&&a.catalog===document.querySelector('[data-testid="nav-catalog"]')})()`), true,
    'history interaction does not rebuild the persistent header');
  await evaluate(`${query('persistent-history')}.scrollIntoView({block:'start'})`);
  await capture('history-all-entries-narrow');
  report.checks.push('Student history reveals all16 genuine owned attempts with progressive focus; older graded result opens by exact GET',
    'History GET outage retains all entries and truthfully recovers through explicit retry; loading/retry does not reset the page or remount the header');
  report.history = { generatedAttempts: generated.length, olderOpened: olderId, failedReadRetainedEntries: 16, retryWasGetOnly: true, firstHistoryPreserved: true };
}
