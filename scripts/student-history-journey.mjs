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

  // Hold one genuine owned-attempt GET so students can see a truthful local
  // pending/error/retry sequence without changing any stored exam state.
  async function installSavedReadHarness(attemptId, mode) {
    await evaluate(`(()=>{
      const original=window.fetch.bind(window);
      const harness={path:'/api/v1/attempts/${attemptId}',mode:${JSON.stringify(mode)},requests:[],mutations:[],releaseError:null,releaseSuccess:null};
      harness.original=original;
      window.__savedReadHarness=harness;
      window.fetch=async(input,init={})=>{
        const url=new URL(typeof input==='string'?input:input.url,location.href);
        const method=(init.method||'GET').toUpperCase();
        if(url.pathname.startsWith('/api/v1/')&&method!=='GET')harness.mutations.push({path:url.pathname,method});
        if(url.pathname===harness.path&&method==='GET'){
          harness.requests.push({path:url.pathname,method});
          if(harness.mode==='hold-error'){
            harness.mode='error-held';
            return new Promise(resolve=>{harness.releaseError=()=>resolve(new Response(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE',message:'Synthetic saved attempt read outage',requestId:crypto.randomUUID(),details:{}}}),{status:503,headers:{'content-type':'application/json'}}));});
          }
          if(harness.mode==='hold-success'){
            harness.mode='success-fetching';
            const response=await original(input,init);
            harness.mode='success-held';
            return new Promise(resolve=>{harness.releaseSuccess=()=>resolve(response);});
          }
        }
        return original(input,init);
      };
      return true;
    })()`);
  }
  async function releaseSavedReadError() {
    await evaluate(`window.__savedReadHarness.releaseError()`);
  }
  async function readFeedbackVisibility(actionId, containerId, phase) {
    const visibility = await evaluate(`(()=>{
      const origin=${query(containerId)},container=origin?.closest('.persistent-history-item, .persistent-current-attempt'),action=${query(actionId)},status=container?.querySelector('[data-testid="saved-read-status"]');
      const rect=node=>{if(!node)return null;const box=node.getBoundingClientRect(),style=getComputedStyle(node);return{visible:box.width>0&&box.height>0&&box.left>=-1&&box.top>=-1&&box.right<=innerWidth+1&&box.bottom<=innerHeight+1&&style.display!=='none'&&style.visibility==='visible',x:box.x,y:box.y,width:box.width,height:box.height,bottom:box.bottom}};
      return{status:rect(status),action:rect(action),viewport:{width:innerWidth,height:innerHeight}};
    })()`);
    assert.equal(visibility.status?.visible, true, `${phase} saved-read status is fully inside the actual viewport: ${JSON.stringify(visibility.status)}`);
    assert.equal(visibility.action?.visible, true, `${phase} saved-read action is fully inside the actual viewport: ${JSON.stringify(visibility.action)}`);
    return visibility;
  }
  async function assertPendingSavedRead(attemptId, phase) {
    await waitFor(`${query('saved-read-status')}?.textContent.toLowerCase().includes('đang')`, `${phase} saved attempt read is visible`);
    const pending = await evaluate(`(()=>{const row=${query(`history-${attemptId}`)}?.closest('.persistent-history-item'),action=${query(`history-${attemptId}`)},status=row?.querySelector('[data-testid="saved-read-status"]');return{inside:Boolean(row&&status),role:status?.getAttribute('role'),focused:document.activeElement===action,ariaDisabled:action?.getAttribute('aria-disabled'),disabled:action?.disabled,cancel:Boolean(row?.querySelector('[data-testid="saved-read-cancel"]'))}})()`);
    assert.deepEqual(pending, { inside: true, role: 'status', focused: true, ariaDisabled: 'true', disabled: false, cancel: true }, `${phase} pending state stays beside the selected row and preserves the focused native action`);
    await readFeedbackVisibility(`history-${attemptId}`, `history-${attemptId}`, `${phase} pending`);
  }
  async function assertSavedReadError(attemptId, phase, scrollBefore) {
    await waitFor(`${query('saved-read-status')}?.getAttribute('role')==='alert'`, `${phase} saved attempt error is local and announced`);
    const error = await evaluate(`(()=>{const row=${query(`history-${attemptId}`)}?.closest('.persistent-history-item'),action=${query(`history-${attemptId}`)},status=row?.querySelector('[data-testid="saved-read-status"]');return{inside:Boolean(row&&status),role:status?.getAttribute('role'),focused:document.activeElement===action,label:action?.textContent.trim(),entries:document.querySelectorAll('.persistent-history-item').length,scrollY:window.scrollY,rowHeight:row?.getBoundingClientRect().height,text:status?.textContent}})()`);
    assert.equal(error.inside, true, `${phase} failure remains attached to its selected history row`);
    assert.equal(error.role, 'alert');
    assert.equal(error.focused, true, `${phase} failure retains focus on the retry action`);
    assert.match(error.label, /Thử đọc lại/);
    assert.equal(error.entries, 16, `${phase} failure preserves all cached owned rows`);
    const nearestScrollAllowance = error.rowHeight + 32;
    assert.ok(Math.abs(error.scrollY - scrollBefore) <= nearestScrollAllowance,
      `${phase} failure scroll adjustment stays within the selected row: ${scrollBefore} -> ${error.scrollY} (row ${error.rowHeight}px)`);
    assert.match(error.text, /đọc|thử lại/i);
    await readFeedbackVisibility(`history-${attemptId}`, `history-${attemptId}`, `${phase} error`);
  }

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

  await installSavedReadHarness(olderId, 'hold-error');
  await click(`history-${olderId}`);
  await assertPendingSavedRead(olderId, 'desktop');
  const desktopPendingScroll = await evaluate('window.scrollY');
  await capture('history-saved-read-pending-desktop');
  await waitFor(`window.__savedReadHarness.mode==='error-held'`, 'desktop saved attempt GET is held by the synthetic outage');
  await releaseSavedReadError();
  await assertSavedReadError(olderId, 'desktop', desktopPendingScroll);
  await capture('history-saved-read-error-desktop');
  await click(`history-${olderId}`);
  await waitFor(`Boolean(${query('result')})`, 'history retry opens its selected older result');
  assert.deepEqual(await evaluate('window.__savedReadHarness.requests'), [
    { path: `/api/v1/attempts/${olderId}`, method: 'GET' },
    { path: `/api/v1/attempts/${olderId}`, method: 'GET' },
  ], 'failed read recovery repeats only the exact selected attempt GET');
  assert.deepEqual(await evaluate('window.__savedReadHarness.mutations'), [], 'history recovery sends no POST or other mutation');
  assert.equal(await evaluate(`Boolean(${query('result')} && ${query('result-score')})`), true,
    'recovered older attempt shows its genuine owned result and released score');
  await capture('history-saved-read-recovered-desktop');
  await click('return-catalog');
  await waitFor(`Boolean(${query('catalog-panel')})`, 'recovered older result returns to catalog');
  await evaluate('window.fetch=window.__savedReadHarness.original');

  // The same local feedback must work from the selected current-attempt card.
  await installSavedReadHarness(olderId, 'hold-error');
  await click('persistent-resume');
  await waitFor(`${query('saved-read-status')}?.textContent.toLowerCase().includes('đang')`, 'current-attempt resume read is visible');
  const resumePending = await evaluate(`(()=>{const card=${query('persistent-current-attempt')},action=${query('persistent-resume')},status=card?.querySelector('[data-testid="saved-read-status"]');return{inside:Boolean(card&&status),role:status?.getAttribute('role'),focused:document.activeElement===action,ariaDisabled:action?.getAttribute('aria-disabled'),disabled:action?.disabled,cancel:Boolean(card?.querySelector('[data-testid="saved-read-cancel"]'))}})()`);
  assert.deepEqual(resumePending, { inside: true, role: 'status', focused: true, ariaDisabled: 'true', disabled: false, cancel: true }, 'resume pending state stays beside its focused current-attempt action');
  await readFeedbackVisibility('persistent-resume', 'persistent-current-attempt', 'current-attempt pending');
  const resumePendingScroll = await evaluate('window.scrollY');
  await waitFor(`window.__savedReadHarness.mode==='error-held'`, 'resume attempt GET is held by the synthetic outage');
  await releaseSavedReadError();
  await waitFor(`${query('saved-read-status')}?.getAttribute('role')==='alert'`, 'resume failure is local and announced');
  const resumeError = await evaluate(`(()=>{const card=${query('persistent-current-attempt')},action=${query('persistent-resume')},status=card?.querySelector('[data-testid="saved-read-status"]');return{inside:Boolean(card&&status),role:status?.getAttribute('role'),focused:document.activeElement===action,label:action?.textContent.trim(),scrollY:window.scrollY,cardHeight:card?.getBoundingClientRect().height}})()`);
  assert.equal(resumeError.inside, true);
  assert.equal(resumeError.role, 'alert');
  assert.equal(resumeError.focused, true, 'resume failure preserves focus on its retry action');
  assert.match(resumeError.label, /Thử đọc lại/);
  assert.ok(Math.abs(resumeError.scrollY - resumePendingScroll) <= resumeError.cardHeight + 32,
    `current-attempt failure scroll adjustment stays within its card: ${resumePendingScroll} -> ${resumeError.scrollY} (card ${resumeError.cardHeight}px)`);
  await readFeedbackVisibility('persistent-resume', 'persistent-current-attempt', 'current-attempt error');
  await click('persistent-resume');
  await waitFor(`Boolean(${query('result')})`, 'current-attempt resume retries the selected owned attempt');
  assert.deepEqual(await evaluate('window.__savedReadHarness.requests'), [
    { path: `/api/v1/attempts/${olderId}`, method: 'GET' },
    { path: `/api/v1/attempts/${olderId}`, method: 'GET' },
  ], 'current-attempt retry repeats only its exact selected GET');
  assert.deepEqual(await evaluate('window.__savedReadHarness.mutations'), [], 'current-attempt retry sends no mutation');
  await click('return-catalog');
  await waitFor(`Boolean(${query('catalog-panel')})`, 'current-attempt retry returns to catalog');
  await evaluate('window.fetch=window.__savedReadHarness.original');

  await evaluate(`(()=>{window.__historyAttemptGets=[];const original=window.fetch.bind(window);window.__historyReadOriginal=window.fetch;window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if((!init.method||init.method==='GET')&&url.pathname.startsWith('/api/v1/attempts/'))window.__historyAttemptGets.push(url.pathname);return original(input,init);};return true})()`);
  await click(`history-${olderId}`);
  await waitFor(`Boolean(${query('result')})`, 'older owned graded result opens from history');
  assert.equal(await evaluate(`window.__historyAttemptGets.includes('/api/v1/attempts/${olderId}')`), true, 'older link reads the selected owned attempt');
  assert.equal((await fixture.pool.query('SELECT state FROM tsa.attempts WHERE id=$1 AND user_id=$2', [olderId, fixture.principals.studentA.userId])).rows[0].state, 'GRADED');
  await capture('history-older-result');
  await click('return-catalog');
  await waitFor(`Boolean(${query('catalog-panel')})`, 'older result returns to catalog');
  await evaluate('window.fetch=window.__historyReadOriginal');

  // Exercise the same failure and recovery affordance at a narrow viewport.
  await viewport(narrowWidth, 900);
  await waitFor(`Boolean(${query('persistent-history')})`, 'narrow history remains available after result recovery');
  const narrowRetryId = generated[1];
  await installSavedReadHarness(narrowRetryId, 'hold-error');
  await click(`history-${narrowRetryId}`);
  await assertPendingSavedRead(narrowRetryId, 'narrow');
  const narrowPendingScroll = await evaluate('window.scrollY');
  await capture('history-saved-read-pending-narrow');
  await waitFor(`window.__savedReadHarness.mode==='error-held'`, 'narrow saved attempt GET is held by the synthetic outage');
  await releaseSavedReadError();
  await assertSavedReadError(narrowRetryId, 'narrow', narrowPendingScroll);
  await capture('history-saved-read-error-narrow');
  await click(`history-${narrowRetryId}`);
  await waitFor(`Boolean(${query('result')})`, 'narrow history retry opens its selected older result');
  assert.deepEqual(await evaluate('window.__savedReadHarness.requests'), [
    { path: `/api/v1/attempts/${narrowRetryId}`, method: 'GET' },
    { path: `/api/v1/attempts/${narrowRetryId}`, method: 'GET' },
  ], 'narrow history retry reads only its selected attempt');
  assert.deepEqual(await evaluate('window.__savedReadHarness.mutations'), [], 'narrow history recovery sends no mutation');
  await capture('history-saved-read-recovered-narrow');
  await click('return-catalog');
  await waitFor(`Boolean(${query('catalog-panel')})`, 'narrow recovered result returns to catalog');
  await evaluate('window.fetch=window.__savedReadHarness.original');

  const explicitlyCancelledId = generated[3];
  await installSavedReadHarness(explicitlyCancelledId, 'hold-success');
  await click(`history-${explicitlyCancelledId}`);
  await assertPendingSavedRead(explicitlyCancelledId, 'narrow cancel-control');
  await waitFor(`window.__savedReadHarness.mode==='success-held'`, 'cancel-control scenario receives genuine owned-attempt GET');
  await click('saved-read-cancel');
  await waitFor(`!${query('saved-read-status')} && document.activeElement===${query(`history-${explicitlyCancelledId}`)}`, 'cancel control restores focus to the selected history action');
  await evaluate('window.__savedReadHarness.releaseSuccess()');
  await waitFor(`Boolean(${query('catalog-panel')}) && !${query('result')}`, 'cancelled read completion leaves the catalog in place');
  assert.equal(await evaluate(`${query(`history-${explicitlyCancelledId}`)}.disabled`), false, 'explicit cancellation clears the pending read lock');
  await evaluate('window.fetch=window.__savedReadHarness.original');

  // A real late success after navigation must not redirect away from the
  // catalog or leave the next catalog/history operation locked.
  const cancelledReadId = generated[2];
  await viewport(1280, 900);
  await installSavedReadHarness(cancelledReadId, 'hold-success');
  await click(`history-${cancelledReadId}`);
  await waitFor(`window.__savedReadHarness.mode==='success-held'`, 'cancellation scenario receives genuine owned-attempt GET');
  await click('nav-home');
  await waitFor(`Boolean(${query('catalog-open')}) && Boolean(window.__savedReadHarness.releaseSuccess)`, 'navigation cancels the pending history read');
  await evaluate('window.__savedReadHarness.releaseSuccess()');
  await waitFor(`Boolean(${query('catalog-open')}) && !${query('result')}`, 'late successful read cannot leave the home route');
  assert.equal(await evaluate(`${query('catalog-open')}.disabled`), false, 'catalog entry remains available after cancelled read completes');
  await click('catalog-open');
  await waitFor(`Boolean(${query('catalog-panel')})`, 'catalog can open after cancelled read completes');
  assert.equal(await evaluate(`${query('history-refresh')}.disabled`), false, 'catalog history remains available after cancelled read completes');
  await click('history-refresh');
  await waitFor(`${query('persistent-history')}.getAttribute('aria-busy')==='false'`, 'catalog history can refresh after cancelled read completion');
  await evaluate('window.fetch=window.__savedReadHarness.original');

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
  report.checks.push('Student history reveals all16 genuine owned attempts with progressive focus; older results open by exact GET and recover through a focused row-local retry',
    'Targeted saved-attempt failures preserve cached entries and scroll; cancellation fences a late success after navigation, and desktop/narrow pending, error and recovered states are captured');
  report.history = { generatedAttempts: generated.length, olderOpened: olderId, failedReadRetainedEntries: 16, retryWasGetOnly: true, savedReadScreens: ['desktop', 'narrow'], lateSuccessNavigationFenced: true, firstHistoryPreserved: true };
}
