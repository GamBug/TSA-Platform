import assert from 'node:assert/strict';
import { beginHeaderStability, assertHeaderStable } from './browse-header-stability.mjs';

/** Existing real student UI, with explicit short-profile recovery and no fallback. */
export async function runShortPracticeJourney({evaluate,click,query,waitFor,fixture,capture,report,reload,viewport,escape,narrowWidth=375}) {
 const catalog=await evaluate("fetch('/api/v1/catalog?limit=100').then(r=>r.json())");
 const shorts=catalog.items.filter(row=>['MATH','SCIENCE'].includes(row.domain)&&row.questionCount===2);
 assert.equal(catalog.items.length,5);assert.equal(shorts.length,2);assert.ok(shorts.every(row=>row.reviewAllowed===false));
 await waitFor("document.querySelectorAll('[data-testid=short-practice-card]').length===2",'two explicit short profiles');
 assert.match(await evaluate(`${query('catalog-count')}.textContent`),/3/);
 // Exercise the authenticated header too: its longer disclosure and conditional
 // result destination have different min-content requirements from the mock demo.
 async function checkHeader(width, phase) {
  await viewport(width,900);
  await evaluate('window.scrollTo(0,0)');
  await beginHeaderStability(evaluate);
  await evaluate(`${query('nav-home')}.click()`);
  await waitFor(`Boolean(${query('catalog-open')})`,'header home route');
  await evaluate(`${query('catalog-open')}.click()`);
  await waitFor(`Boolean(${query('catalog-panel')})`,'header catalog route');
  await evaluate(`${query('exam-intro')}.click()`);
  await waitFor(`Boolean(${query('intro-back')})`,'header detail route');
  await evaluate(`${query('intro-back')}.click()`);
  await waitFor(`Boolean(${query('catalog-panel')})`,'header detail return');
  report.headerStability ??= {};
  report.headerStability[`${phase}-${width}`]=await assertHeaderStable(evaluate,`authenticated ${phase} ${width}px`);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),'authenticated header never overflows the document');
  assert.equal(await evaluate('document.activeElement.tagName'),'H1','route return focuses its heading');
  await capture(`header-${phase}-${width}`);
 }
 for(const width of [1280,1024,768,narrowWidth])await checkHeader(width,'fresh');
 await viewport(1280,900);await capture('short-catalog-desktop');
 await viewport(narrowWidth,900);await evaluate("document.querySelector('[data-testid=short-practice-card]').scrollIntoView({block:'start'})");await capture('short-catalog-narrow');
 const outcomes=[];
 async function view(id){return evaluate(`fetch('/api/v1/attempts/${id}').then(r=>r.json())`);}
 async function fill(attempt){
  for(const [position,slot] of attempt.slots.entries()){
   if(position)await click('question-next');
   if(slot.interaction.type==='MULTIPLE_CHOICE'){await click('option-a');await waitFor(`Boolean(${query('multiple-choice-unsaved')})`,'short scenario staged MC');await click('option-c');}
   else if(slot.interaction.type==='TRUE_FALSE_GROUP'){await click('tf-s1-true');await waitFor(`!${query('tf-s2-false')}.disabled`,'short scenario partial TF acknowledgement');await click('tf-s2-false');}
   else await click('option-b');
   await waitFor(`Boolean(${query('save-status')}.classList.contains('saved'))`,'short scenario acknowledged save');
  }
 }
 async function finish(domain,label){
  await click('submit-open');await click('submit-confirm');await waitFor(`Boolean(${query('result')})`,label+' result');
  assert.match(await evaluate(`${query('result-score')}.textContent`),/100%/);await capture(domain.toLowerCase()+'-'+label+'-result');
  await click('review-open');await waitFor(`Boolean(${query('back-score')})`,label+' released review');
  if(!(await evaluate(`${query('explanation')}.open`)))await click('review-explanation-toggle');
  await capture(domain.toLowerCase()+'-'+label+'-review');await click('back-score');await click('return-catalog');await waitFor(`Boolean(${query('catalog-panel')})`,label+' catalog return');
 }
 for(const [index,short] of shorts.entries()){
  const full=catalog.items.find(row=>row.domain===short.domain&&row.questionCount===4);
  const fullButton=`document.querySelector('[data-testid="catalog-card-${short.domain}"] [data-testid="demo-start"]')`;
  await evaluate(`${fullButton}.click()`);await waitFor('Boolean(document.getElementById("question-title"))','full profile starts explicitly');
  let history=await evaluate("fetch('/api/v1/attempts?limit=100').then(r=>r.json())");
  const active=history.items.find(row=>row.state==='IN_PROGRESS');assert.ok(active);const fullView=await view(active.attemptId);
  assert.equal(fullView.sections[0].count,4);await fill(fullView);await finish(short.domain,'full');
  if(index===0){for(const width of [1280,1024,768,narrowWidth])await checkHeader(width,'graded');}
  const before=(await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.attempts')).rows[0].n;
  await evaluate(`${fullButton}.click()`);await waitFor(`Boolean(${query('short-practice-offer')})`,'real full shortage offers explicit short profile');
  assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.attempts')).rows[0].n,before,'shortage does not allocate a fallback');
  const open=`document.querySelector('[data-testid="short-practice-open"][data-blueprint-version-id="${short.blueprintVersionId}"]')`;
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__shortPosts=[];window.__shortLost=false;window.__shortReadFailure=false;window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(window.__shortReadFailure&&(!init.method||init.method==='GET')&&/^\\/api\\/v1\\/attempts\\/[^/]+$/.test(url.pathname)){window.__shortReadFailure=false;return new Response(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE',message:'Synthetic short read failure',requestId:crypto.randomUUID(),details:{}}}),{status:503,headers:{'content-type':'application/json'}});}const response=await original(input,init);if(init.method==='POST'&&url.pathname==='/api/v1/attempts'&&JSON.parse(init.body).blueprintVersionId===${JSON.stringify(short.blueprintVersionId)}){window.__shortPosts.push({body:JSON.parse(init.body),key:new Headers(init.headers).get('idempotency-key'),status:response.status});if(response.ok&&!window.__shortLost){window.__shortLost=true;window.__shortReadFailure=true;await response.arrayBuffer();throw new TypeError('Synthetic lost committed short receipt');}}return response;};return true;})()`);
  await evaluate(`${open}.click()`);await waitFor(`Boolean(${query('short-practice-dialog')}?.open)`,'short native confirmation');
  assert.equal(await evaluate(`${query('short-practice-dialog')}.querySelectorAll('input[type=checkbox]').length`),0,'NEW_ONLY needs no repeat consent');
  assert.match(await evaluate(`${query('short-practice-dialog')}.textContent`),/2 câu.*3 phút/s);
  await escape();await waitFor(`!${query('short-practice-dialog')}`,'short Escape cancellation');
  assert.equal(await evaluate('window.__shortPosts.length'),0);assert.equal(await evaluate(`document.activeElement.dataset.blueprintVersionId===${JSON.stringify(short.blueprintVersionId)}`),true);
  await evaluate(`${open}.click()`);await click('short-practice-confirm');await waitFor(`Boolean(${query('short-practice-retry')})`,'lost short receipt remains uncertain');
  assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.attempts')).rows[0].n,before+1);
  await click('short-practice-retry');await waitFor(`Boolean(${query('short-practice-reload')})`,'short receipt acknowledged but GET failed');
  const posts=await evaluate('window.__shortPosts');assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);assert.deepEqual(posts[0].body,{blueprintVersionId:short.blueprintVersionId});
  await click('short-practice-reload');await waitFor(`Boolean(${query('created-start')})`,'short owned reservation explicit Start');
  assert.equal(await evaluate('window.__shortPosts.length'),2,'receipt recovery has no POST');
  assert.match(await evaluate(`${query('created-attempt')}.textContent`),/2 câu/);assert.match(await evaluate(`${query('created-attempt')}.textContent`),/3 phút/);
  await capture(short.domain.toLowerCase()+'-short-reserved');
  history=await evaluate("fetch('/api/v1/attempts?limit=100').then(r=>r.json())");const reserved=history.items.find(row=>row.state==='CREATED');assert.ok(reserved);assert.equal(reserved.domain,short.domain);
  const firstHistory=(await fixture.pool.query('SELECT question_id,first_attempt_id FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id',[fixture.principals.studentA.userId])).rows;
  const oldDocument=await evaluate('performance.timeOrigin');await reload();
  await waitFor(`performance.timeOrigin!==${oldDocument}&&Boolean(${query('created-start')})`,'short CREATED reload is read only');
  const unknown=await evaluate(`${query('created-attempt')}.textContent`);assert.match(unknown,/Chưa có thông tin thời lượng/);assert.doesNotMatch(unknown,/6 phút/);
  assert.equal((await fixture.pool.query('SELECT started_at FROM tsa.attempts WHERE id=$1',[reserved.attemptId])).rows[0].started_at,null);
  assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.attempts')).rows[0].n,before+1);
  await capture(short.domain.toLowerCase()+'-short-reloaded-reservation');
  await click('created-start');await waitFor('Boolean(document.getElementById("question-title"))','short explicit Start');
  const shortView=await view(reserved.attemptId);assert.equal(shortView.sections[0].count,2);assert.equal((Date.parse(shortView.deadlineAt)-Date.parse(shortView.startedAt))/1000,180);
  const clocks=(await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1',[reserved.attemptId])).rows;
  await fill(shortView);const savedDocument=await evaluate('performance.timeOrigin');await reload();await waitFor(`performance.timeOrigin!==${savedDocument}&&Boolean(document.getElementById('question-title'))`,'short saved reload');
  assert.equal((await view(reserved.attemptId)).answers.length,2);assert.deepEqual((await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1',[reserved.attemptId])).rows,clocks);
  await finish(short.domain,'short');
  assert.deepEqual((await fixture.pool.query('SELECT question_id,first_attempt_id FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id',[fixture.principals.studentA.userId])).rows,firstHistory);
  outcomes.push({domain:short.domain,fullCount:4,shortCount:2,durationSeconds:180});
 }
 const history=await evaluate("fetch('/api/v1/attempts?limit=100').then(r=>r.json())");assert.equal(history.items.length,4);assert.ok(history.items.every(row=>row.state==='GRADED'&&row.score.percentage==='100.00'));
 assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.student_question_history')).rows[0].n,12);
 await capture('short-four-attempt-history');report.shortDomains=outcomes;
 // Prepare in A, then rotate the actual local session externally before dispatch.
 const selected=shorts[0];
 await evaluate(`document.querySelector('[data-testid="short-practice-open"][data-blueprint-version-id="${selected.blueprintVersionId}"]').click()`);
 await waitFor(`Boolean(${query('short-practice-dialog')}?.open)`,'short intent before external session rotation');
 await evaluate(`(()=>{const original=window.fetch.bind(window);window.__shortCrossSessionCreates=0;window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(init.method==='POST'&&url.pathname==='/api/v1/attempts')window.__shortCrossSessionCreates++;return original(input,init);};return true;})()`);
 const rotation=await evaluate(`(async()=>{const csrf=()=>document.cookie.split('; ').find(s=>s.startsWith('tsa_local_csrf='))?.slice('tsa_local_csrf='.length);const post=(path,body)=>fetch(path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf()},body:JSON.stringify(body)});const old=csrf();const logout=await post('/local-auth/logout',{}),bootstrap=await post('/local-auth/bootstrap',{}),login=await post('/local-auth/login',{actorKey:'studentB'});return{logout:logout.status,bootstrap:bootstrap.status,login:login.status,changed:old!==csrf()};})()`);
 assert.deepEqual(rotation,{logout:200,bootstrap:201,login:200,changed:true});
 await click('short-practice-confirm');await waitFor(`Boolean(${query('persistent-login')})`,'short prepared intent fenced after account rotation');
 assert.equal(await evaluate('window.__shortCrossSessionCreates'),0,'A intent never creates a B attempt');
 await capture('short-session-intent-fenced');
 await click('persistent-login-studentB');await waitFor(`Boolean(${query('catalog-panel')})`,'explicit replacement candidate login');
 // A real authenticated API request models another request arriving while this UI is stale.
 const external=await evaluate(`fetch('/api/v1/attempts',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':document.cookie.split('; ').find(s=>s.startsWith('tsa_local_csrf=')).slice('tsa_local_csrf='.length),'idempotency-key':crypto.randomUUID()},body:JSON.stringify({blueprintVersionId:${JSON.stringify(selected.blueprintVersionId)}})}).then(async response=>({status:response.status,body:await response.json()}))`);
 assert.equal(external.status,201);assert.equal(external.body.state,'CREATED');
 await evaluate(`document.querySelector('[data-testid="catalog-card-${selected.domain}"] [data-testid="demo-start"]').click()`);
 await waitFor(`Boolean(${query('attempt-conflict-recover')})`,'stale full profile selection offers explicit owned recovery');
 assert.equal(await evaluate('window.__shortCrossSessionCreates'),1,'stale selection sends no replacement allocation');
 assert.equal((await fixture.pool.query('SELECT started_at FROM tsa.attempts WHERE id=$1',[external.body.attemptId])).rows[0].started_at,null);
 await click('attempt-conflict-recover');await waitFor(`Boolean(${query('created-start')})`,'GET recovery reaches owned reservation without Start');
 assert.match(await evaluate(`${query('created-attempt')}.textContent`),/Chưa có thông tin thời lượng/);
 assert.equal(await evaluate('window.__shortCrossSessionCreates'),1);
 assert.equal((await fixture.pool.query('SELECT started_at FROM tsa.attempts WHERE id=$1',[external.body.attemptId])).rows[0].started_at,null);
 await capture('short-existing-unknown-profile-recovered');
 await click('created-start');await waitFor('Boolean(document.getElementById("question-title"))','owned recovered short starts only explicitly');
 const recovered=await view(external.body.attemptId);assert.equal(recovered.sections[0].count,2);
 assert.equal((Date.parse(recovered.deadlineAt)-Date.parse(recovered.startedAt))/1000,180);
 assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.student_question_history WHERE user_id=$1',[fixture.principals.studentA.userId])).rows[0].n,12);
 assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.student_question_history WHERE user_id=$1',[fixture.principals.studentB.userId])).rows[0].n,2);

 report.checks.push('Authenticated header nodes and per-frame geometry survive home/catalog/detail routes at desktop/tablet/narrow widths before and after a real graded result; no document overflow',
  'B11 exact full4/2/4 defaults and two separate2/180 short catalog choices remain3 domains with short review disabled',
  'B11 real full unseen shortage creates no fallback; short native confirmation/Escape/focus sends no POST until explicit choice',
  'B11 committed lost short receipt retries exact body/key; post-receipt GET failure recovers through GET only before explicit Start',
  'B11 CREATED reload keeps duration/profile unknown rather than borrowing full metadata; saved reload preserves2answers and180second server clocks',
  'B11 both short domains grade100/release/review with preserved first-history and four owned full/short results, desktop/mobile without overflow',
  'B11 an A-prepared short intent cannot dispatch after actual A-to-B session rotation; replacement account receives no unintended assignment',
  'B11 stale full-profile selection detects another authenticated short reservation; explicit GET-only unknown-profile recovery never creates or starts until separately chosen');
}
