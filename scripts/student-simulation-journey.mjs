import assert from 'node:assert/strict';

/** Shared real-browser simulation journey; all answer changes use native UI controls. */
export async function runSimulationJourney({evaluate,click,query,waitFor,capture,viewport,reload,fixture,report,key,changeIdentityInOtherTab,narrowWidth=375}){
 await click('persistent-login-studentA');await waitFor(`Boolean(${query('demo-start')})`,'simulation offering');
 await evaluate(`(()=>{const original=window.fetch.bind(window);window.__simulationResponses=[];window.__simulationSaves=[];window.__dropSimulationSave=true;window.fetch=async(path,options={})=>{
 const url=new URL(typeof path==='string'?path:path.url,location.href);const response=await original(path,options);
 if(url.pathname.startsWith('/api/v3/')){const body=await response.clone().json();window.__simulationResponses.push({path:url.pathname,status:response.status,body});
 if(options.method==='PUT'){window.__simulationSaves.push({body:options.body,key:new Headers(options.headers).get('idempotency-key')});if(response.ok&&window.__dropSimulationSave){window.__dropSimulationSave=false;throw new TypeError('Synthetic lost acknowledgement after real database commit');}}}return response;};return true;})()`);
 await click('demo-start');await waitFor(`Boolean(${query('section-math')})`,'mathematics opened');
 assert.equal(await evaluate(`document.querySelectorAll('.simulation-options input').length`),3);
 let responses=await evaluate('window.__simulationResponses');const firstView=responses.find(r=>r.path.match(/\/attempts\/[^/]+$/)&&r.body.state==='IN_PROGRESS').body;
 assert.equal(firstView.slots.length,40);assert.doesNotMatch(JSON.stringify(firstView),/SYNTHETIC_READING|SYNTHETIC_SCIENCE|SIMULATION_PRIVATE|answerKey/);
 const id=firstView.attemptId;
 await click('option-b');await waitFor(`Boolean(${query('simulation-retry-save')})`,'lost acknowledgement stays unconfirmed');
 assert.equal(await evaluate(`${query('section-reading')}.disabled`),true);
 await click('simulation-retry-save');await waitFor(`${query('save-status')}.classList.contains('saved')`,'exact retry acknowledged');
 const saves=await evaluate('window.__simulationSaves');assert.equal(saves.length,2);assert.deepEqual(saves[0],saves[1]);
 for(const width of [1440,768,narrowWidth]){await viewport(width,900);assert.equal(await evaluate('innerWidth'),width);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await capture(`simulation-math-${width}`);}
 await viewport(1280,900);
 const before=await evaluate('performance.timeOrigin');await reload();await waitFor(`performance.timeOrigin!==${before}&&Boolean(${query('option-b')})`,'refresh resumes simulation');assert.equal(await evaluate(`${query('option-b')}.checked`),true);
 for(let i=1;i<40;i++){await click('question-next');await click('option-b');await waitFor(`${query('save-status')}.classList.contains('saved')`,'mathematics answer saved');}
 await fixture.expireSection(id,'math');await click('simulation-reload');await waitFor(`Boolean(${query('section-locked')})`,'server expiry locks math');assert.equal(await evaluate(`${query('option-b')}.disabled`),true);
 await capture('simulation-locked-math');await click('section-reading');await waitFor(`document.querySelector('[role="tabpanel"]').getAttribute('aria-label')==='Reading'`,'reading opened');
 for(let i=0;i<20;i++){if(i)await click('question-next');await click('option-b');await waitFor(`${query('save-status')}.classList.contains('saved')`,'reading answer saved');}
 await click('section-math');await waitFor(`Boolean(${query('section-locked')})`,'exhausted math remains readable');assert.equal(await evaluate(`${query('option-b')}.disabled`),true);
 await click('section-science');await waitFor(`document.querySelector('[role="tabpanel"]').getAttribute('aria-label')==='Science'`,'science opened');
 for(let i=0;i<40;i++){if(i)await click('question-next');await click('option-b');await waitFor(`${query('save-status')}.classList.contains('saved')`,'science answer saved');}
 await viewport(narrowWidth,900);await capture('simulation-science-narrow');await click('submit-open');await waitFor('Boolean(document.querySelector("dialog[open]"))','submit-all confirmation');
 await capture('simulation-submit-all');await key('Escape');await waitFor('!document.querySelector("dialog[open]")','cancel preserves attempt');
 await click('submit-open');await click('submit-confirm');await waitFor(`Boolean(${query('result')})`,'three-section result released');
 assert.equal(await evaluate(`${query('result')}.textContent.includes('100 / 100 correct')`),true);
 for(const section of ['math','reading','science'])assert.equal(await evaluate(`Boolean(${query(`result-${section}`)})`),true);
 assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.answers WHERE attempt_id=$1',[id])).rows[0].n,100);
 await capture('simulation-results-narrow');report.checks.push('100 real UI saves, committed lost-ACK retry, refresh, unopened-section privacy, locked read-only return, section navigation, submit-all cancellation, 100/100 binary section totals, desktop/tablet/narrow layouts.');
 await click('simulation-home');await waitFor(`Boolean(${query('simulation-history-'+id)})`,'completed attempt history');
 await evaluate(`(()=>{const original=window.fetch.bind(window);window.__holdSimulationRead=true;window.fetch=async(path,options={})=>{const response=await original(path,options);const url=new URL(typeof path==='string'?path:path.url,location.href);if(window.__holdSimulationRead&&(!options.method||options.method==='GET')&&url.pathname===${JSON.stringify('/api/v3/attempts/'+id)}){window.__holdSimulationRead=false;window.__simulationReadHeld=true;return new Promise(resolve=>{window.__releaseSimulationRead=()=>resolve(response);});}return response;};return true;})()`);
 await click('simulation-history-'+id);await waitFor('window.__simulationReadHeld===true','old-owner GET response held');
 await changeIdentityInOtherTab();await waitFor(`Boolean(${query('persistent-login-studentB')})`,'cross-tab identity change clears cached owner state');
 await evaluate('(()=>{window.__releaseSimulationRead();return true;})()');
 await waitFor(`Boolean(${query('persistent-login-studentB')})&&!${query('persistent-login-studentB')}.disabled`,'late old-owner response cannot restore released result');
 assert.equal(await evaluate(`Boolean(${query('result')})`),false);
 await click('persistent-login-studentB');await waitFor(`Boolean(${query('demo-start')})`,'replacement identity has its own empty attempt history');
 assert.equal(await evaluate(`Boolean(${query('simulation-history-'+id)})`),false);
 report.checks.push('A real second tab changes A to B while an A GET response is delayed; cached result clears and the released response cannot restore the old owner.');

}
