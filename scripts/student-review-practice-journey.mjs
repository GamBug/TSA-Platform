import assert from 'node:assert/strict';
import {runNewOnlyJourney} from './student-new-only-journey.mjs';

/** Reuse the existing real reading exhaustion journey before explicit consent. */
export async function runReviewPracticeJourney(context){
 const {evaluate,click,query,waitFor,fixture,capture,report,command}=context;
 await runNewOnlyJourney({...context,expectReviewOffer:true});
 await waitFor(`Boolean(${query('review-mode-offer')})`,'same-blueprint unseen shortage offers review');
 const historyBefore=(await fixture.pool.query('SELECT to_jsonb(h) AS value FROM tsa.student_question_history h ORDER BY user_id,question_id')).rows;
 await evaluate(`(()=>{const original=window.fetch;window.__review={calls:[],lose:false,readFailure:false,wrongReceipt:false};window.fetch=async(input,init={})=>{const response=await original(input,init);const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
 if(path==='/api/v1/attempts'&&init.method==='POST'&&JSON.parse(init.body).reuseMode==='REVIEW_ALLOWED'){
  window.__review.calls.push({body:JSON.parse(init.body),key:new Headers(init.headers).get('idempotency-key'),status:response.status,receipt:await response.clone().json()});
  if(window.__review.lose){window.__review.lose=false;throw new TypeError('Controlled acknowledgement loss after commit');}
  if(window.__review.wrongReceipt){window.__review.wrongReceipt=false;const data=await response.json();return new Response(JSON.stringify({...data,reuseMode:'NEW_ONLY'}),{status:201,headers:response.headers});}
 }
 if(/^\\/api\\/v1\\/attempts\\/[^/]+$/.test(path)&&(!init.method||init.method==='GET')&&window.__review.readFailure){window.__review.readFailure=false;return new Response(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE',message:'Controlled read outage',requestId:crypto.randomUUID(),details:{}}}),{status:503,headers:{'content-type':'application/json'}});}
 return response;};return true})()`);
 const postCount=()=>evaluate('window.__review.calls.length');
 await click('review-mode-open');await waitFor(`${query('review-mode-dialog')}?.open`,'native review consent');
 assert.equal(await evaluate(`${query('review-mode-consent')}.checked`),false);assert.equal(await evaluate(`${query('review-mode-confirm')}.disabled`),true);assert.equal(await postCount(),0);
 await command('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await capture('review-practice-consent-mobile');
 await click('review-mode-cancel');assert.equal(await postCount(),0);assert.equal(await evaluate(`document.activeElement===${query('review-mode-open')}`),true);
 await click('review-mode-open');await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await waitFor(`!${query('review-mode-dialog')}?.open`,'Escape clears consent');assert.equal(await postCount(),0);
 await click('review-mode-open');await click('review-mode-consent');await evaluate('window.__review.lose=true');await click('review-mode-confirm');await waitFor(`${query('review-mode-status')}?.dataset.stage==='uncertain'`,'real committed acknowledgement remains uncertain');
 assert.equal((await fixture.pool.query("SELECT count(*)::integer AS n FROM tsa.attempts WHERE reuse_mode='REVIEW_ALLOWED'")).rows[0].n,1);
 assert.equal(await evaluate(`(()=>{const r=${query('review-mode-status')}.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`),true,'uncertainty is visible without scrolling');
 await capture('review-practice-uncertain-mobile');await evaluate('window.__review.readFailure=true');await click('review-mode-retry');await waitFor(`${query('review-mode-status')}?.dataset.stage==='read-unavailable'`,'acknowledged receipt survives read outage');
 const calls=await evaluate('window.__review.calls');assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
 assert.deepEqual(calls[1].body,{mode:'PERSONALIZED_PRACTICE',blueprintVersionId:fixture.blueprint.versionId,reuseMode:'REVIEW_ALLOWED',acknowledgeRepeats:true});
 assert.equal(await evaluate(`Boolean(${query('created-attempt')})||Boolean(document.getElementById('question-title'))`),false);
 assert.equal(await evaluate(`(()=>{const r=${query('review-mode-status')}.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`),true,'acknowledged read failure is visible without scrolling');
 await capture('review-practice-read-outage-mobile');await click('review-mode-reload');await waitFor(`Boolean(${query('created-attempt')})`,'GET-only recovery reaches reserved review');assert.equal(await postCount(),2);
 assert.equal(await evaluate(`Boolean(document.querySelector('.review-mode-label'))`),true);await capture('review-practice-reserved-mobile');
 const receipt=calls[1].receipt;const reserved=await evaluate(`fetch('/api/v1/attempts/${receipt.attemptId}').then(r=>r.json())`);assert.equal(reserved.state,'CREATED');assert.equal(reserved.reuseMode,'REVIEW_ALLOWED');assert.deepEqual(reserved.slots,[]);assert.equal(reserved.startedAt,null);
 await click('created-start');await waitFor("Boolean(document.getElementById('question-title'))",'explicit start of review');
 const active=await evaluate(`fetch('/api/v1/attempts/${receipt.attemptId}').then(r=>r.json())`);assert.equal(active.reuseMode,'REVIEW_ALLOWED');assert.equal(active.slots.length,2);
 for(let index=0;index<2;index++){
  if(index)await click('question-next');await click(index===0?'option-b':'option-c');await waitFor(`${query('save-status')}.classList.contains('saved')`,'review answer acknowledged');
 }
 const rawBefore=(await fixture.pool.query('SELECT to_jsonb(a) AS value FROM tsa.attempts a WHERE id=$1',[receipt.attemptId])).rows[0].value;
 await evaluate('window.__reviewReloadFence=true');await command('Page.reload');await waitFor("window.__reviewReloadFence!==true&&Boolean(document.getElementById('question-title'))",'fresh document restores the same active review');
 assert.deepEqual((await fixture.pool.query('SELECT to_jsonb(a) AS value FROM tsa.attempts a WHERE id=$1',[receipt.attemptId])).rows[0].value,rawBefore);
 await click('submit-open');await click('submit-confirm');await waitFor(`Boolean(${query('result')})`,'review trusted grading');assert.match(await evaluate(`${query('result-score')}.textContent`),/100%/);assert.equal(await evaluate("Boolean(document.querySelector('.review-mode-label'))"),true);
 await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await capture('review-practice-result-desktop');await click('review-open');await waitFor(`Boolean(${query('review')})`,'released review keeps review-mode label');assert.equal(await evaluate("Boolean(document.querySelector('.review-mode-label'))"),true);await capture('review-practice-released-desktop');
 await click('back-score');await waitFor(`Boolean(${query('result')})`,'return from released review to score');await click('return-catalog');await waitFor(`Boolean(${query('catalog-grid')})`,'return to strict default catalog');await click('demo-start');await waitFor(`Boolean(${query('review-mode-offer')})`,'subsequent NEW_ONLY stays exhausted');
 assert.deepEqual((await fixture.pool.query('SELECT to_jsonb(h) AS value FROM tsa.student_question_history h ORDER BY user_id,question_id')).rows,historyBefore);
 const apiHistory=await evaluate("fetch('/api/v1/attempts').then(r=>r.json())");assert.equal(apiHistory.items.filter(item=>item.reuseMode==='REVIEW_ALLOWED').length,1);
 // A mismatched receipt must remain unverified even though the server committed it.
 await evaluate(`(()=>{const original=window.fetch;window.__reviewAfterReload=[];window.fetch=async(input,init={})=>{const response=await original(input,init);if(init.method==='POST'&&new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/v1/attempts'&&JSON.parse(init.body).reuseMode==='REVIEW_ALLOWED'){const data=await response.clone().json();window.__reviewAfterReload.push(data);return new Response(JSON.stringify({...data,reuseMode:'NEW_ONLY'}),{status:response.status,headers:response.headers});}return response;};return true})()`);
 await click('review-mode-open');await click('review-mode-consent');await click('review-mode-confirm');await waitFor(`${query('review-mode-status')}?.dataset.stage==='unverified'`,'wrong-mode receipt cannot open an attempt');assert.equal(await evaluate(`Boolean(${query('created-attempt')})||Boolean(document.getElementById('question-title'))`),false);assert.equal(await evaluate(`Boolean(${query('review-mode-retry')})`),false);await capture('review-practice-unverified-desktop');
 assert.equal((await fixture.pool.query("SELECT count(*)::integer AS n FROM tsa.attempts WHERE reuse_mode='REVIEW_ALLOWED'")).rows[0].n,2);
 await click('review-mode-recover');await waitFor(`Boolean(${query('created-attempt')})`,'GET-only recovery reads the actual owned review after mismatched receipt');assert.equal(await evaluate('window.__reviewAfterReload.length'),1,'unverified recovery sends no new create');assert.equal(await evaluate(`Boolean(${query('review-mode-consent')})`),false);

 report.checks.push('Explicit Reading review: native fresh checkbox consent and cancel/Escape0POST; real committed lost acknowledgement replays exact new body/key/receipt once');
 report.checks.push('Acknowledged review read503 recovers using GET only, then reserved explicit start/save/reload/resume/submit/grade/released review retains mode and server clocks;375px fits');
 report.checks.push('First history stays exact and later NEW_ONLY still shortages; wrong-mode receipt remains unverified, then explicit GET-only recovery finds the owned reservation without replacement or start');
 report.reviewPractice={attemptId:receipt.attemptId,domain:'READING',percentage:'100.00',sameKeyReplay:true,readRetryGetOnly:true,historyUnchanged:true};
}
