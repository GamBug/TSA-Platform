// Existing frozen student contracts, exercised through the real local UI.
import assert from 'node:assert/strict';

export async function runFixedPracticeJourney({evaluate, click, query, waitFor, fixture, capture, report, reload, viewport, escape, narrowWidth=375}) {
  const catalog=await evaluate("fetch('/api/v1/catalog?limit=100').then(r=>r.json())");
  const allForms=catalog.items.filter(row=>row.mode==='PUBLISHED_FIXED');
  assert.equal(allForms.length,4);
  const forms=allForms.filter((row,index)=>allForms.findIndex(other=>other.domain===row.domain)===index);
  assert.equal(forms.length,3);
  await waitFor("document.querySelectorAll('[data-testid=fixed-practice-card]').length===4",'four fixed cards');
  const sameTitle=allForms.filter(row=>row.domain==='MATH');assert.equal(sameTitle.length,2);assert.equal(sameTitle[0].name,sameTitle[1].name);
  for(const row of sameTitle)assert.equal(await evaluate(`document.querySelector('[data-testid="fixed-practice-card"][data-form-id="${row.formId}"]').textContent.includes(${JSON.stringify(row.formId)})`),true,'same-title seals have distinct visible safe references');
  await viewport(1280,900);await evaluate("document.querySelector('[data-testid=fixed-practice-list]').scrollIntoView({block:'start'})");await capture('fixed-catalog-desktop');
  await viewport(narrowWidth,900);await evaluate("document.querySelector('[data-testid=fixed-practice-list]').scrollIntoView({block:'start'})");await capture('fixed-catalog-narrow');
  const outcomes=[];
  for(const [index,form] of forms.entries()) {
    const select=`document.querySelector('[data-testid="fixed-practice-open"][data-form-id="${form.formId}"]')`;
    const card=`document.querySelector('[data-testid="fixed-practice-card"][data-form-id="${form.formId}"]')`;
    assert.equal(await evaluate(`${card}.textContent.includes(${JSON.stringify(form.formId)})`),true,'visible safe form reference');
    await evaluate(`(()=>{const original=window.fetch.bind(window);window.__fixedPosts=[];window.__fixedLost=false;window.__fixedBlockRead=false;window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(window.__fixedBlockRead&&(!init.method||init.method==='GET')&&/^\\/api\\/v1\\/attempts\\/[^/]+$/.test(url.pathname)){window.__fixedBlockRead=false;return new Response(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE',message:'Synthetic unavailable read',requestId:crypto.randomUUID(),details:{}}}),{status:503,headers:{'content-type':'application/json'}});}const response=await original(input,init);if(init.method==='POST'&&url.pathname==='/api/v1/attempts'){window.__fixedPosts.push({key:new Headers(init.headers).get('idempotency-key'),body:JSON.parse(init.body),status:response.status});if(response.ok&&!window.__fixedLost){window.__fixedLost=true;window.__fixedBlockRead=true;await response.arrayBuffer();throw new TypeError('Synthetic lost committed fixed acknowledgement');}}return response;};return true;})()`);
    await evaluate(`${select}.click()`);
    await waitFor(`Boolean(${query('fixed-practice-dialog')}?.open)`,'native fixed consent');
    assert.equal(await evaluate(`${query('fixed-practice-consent')}.checked`),false);
    assert.equal(await evaluate(`${query('fixed-practice-confirm')}.disabled`),true);
    await escape();
    await waitFor(`!${query('fixed-practice-dialog')}`,'Escape cancels fixed intent');
    assert.equal(await evaluate(`document.activeElement===${select}`),true,'Escape restores same form trigger');
    assert.equal(await evaluate('window.__fixedPosts.length'),0,'cancel does not assign');
    await evaluate(`${select}.click()`);await click('fixed-practice-consent');await click('fixed-practice-confirm');
    await waitFor(`Boolean(${query('fixed-practice-retry')})`,'lost acknowledgement truthfully uncertain');
    assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.attempts')).rows[0].n,index+1);
    await click('fixed-practice-retry');
    await waitFor(`Boolean(${query('fixed-practice-reload')})`,'receipt followed by failed GET stays recoverable');
    const posts=await evaluate('window.__fixedPosts');assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);
    assert.deepEqual(posts[0].body,{mode:'PUBLISHED_FIXED',formId:form.formId,reuseMode:'FIXED_AS_PUBLISHED',acknowledgeRepeats:true});
    await click('fixed-practice-reload');
    await waitFor(`Boolean(${query('created-start')})`,'owned reservation requires Start');
    assert.equal(await evaluate('window.__fixedPosts.length'),2,'read recovery sends no extra create');
    const history=await evaluate("fetch('/api/v1/attempts?limit=100').then(r=>r.json())");
    const created=history.items.find(row=>row.state==='CREATED');assert.ok(created);assert.equal(created.formId,form.formId);
    const id=created.attemptId;
    const reserved=(await fixture.pool.query('SELECT started_at,deadline_at FROM tsa.attempts WHERE id=$1',[id])).rows[0];assert.deepEqual(reserved,{started_at:null,deadline_at:null});
    await capture(`${form.domain.toLowerCase()}-fixed-reserved`);
    await click('created-start');await waitFor('Boolean(document.getElementById("question-title"))','explicit fixed Start');
    const view=await evaluate(`fetch('/api/v1/attempts/${id}').then(r=>r.json())`);assert.equal(view.formMode,'PUBLISHED_FIXED');assert.equal(view.slots.length,form.questionCount);
    const clocks=(await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1',[id])).rows;
    for(const [position,slot] of view.slots.entries()) {
      if(position) await click('question-next');
      if(slot.interaction.type==='MULTIPLE_CHOICE'){await click('option-a');await waitFor(`Boolean(${query('multiple-choice-unsaved')})`,'staged multiple choice');await click('option-c');}
      else if(slot.interaction.type==='TRUE_FALSE_GROUP'){await click('tf-s1-true');await waitFor(`!${query('tf-s2-false')}.disabled`,'partial group acknowledged');await click('tf-s2-false');}
      else await click('option-b');
      await waitFor(`Boolean(${query('save-status')}.classList.contains('saved'))`,'fixed acknowledged answer');
    }
    await capture(`${form.domain.toLowerCase()}-fixed-saved`);
    const oldDocument=await evaluate('performance.timeOrigin');await reload();
    await waitFor(`performance.timeOrigin!==${oldDocument}&&Boolean(document.getElementById('question-title'))`,'fixed reload resumes');
    const resumed=await evaluate(`fetch('/api/v1/attempts/${id}').then(r=>r.json())`);assert.equal(resumed.answers.length,form.questionCount);assert.equal(resumed.formId,form.formId);
    assert.deepEqual((await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1',[id])).rows,clocks);
    assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.attempts')).rows[0].n,index+1);
    await click('submit-open');await click('submit-confirm');await waitFor(`Boolean(${query('result')})`,'fixed released result');
    assert.match(await evaluate(`${query('result-score')}.textContent`),/100%/);
    assert.equal(await evaluate('document.body.innerText.includes("Bài dùng chung")'),true,'fixed result labelled');
    await capture(`${form.domain.toLowerCase()}-fixed-result`);
    await click('review-open');await waitFor(`Boolean(${query('back-score')})`,'fixed released review');
    if(!(await evaluate(`${query('explanation')}.open`)))await click('review-explanation-toggle');
    await capture(`${form.domain.toLowerCase()}-fixed-review`);
    await click('back-score');await click('return-catalog');await waitFor(`Boolean(${query('catalog-panel')})`,'return to catalog');
    outcomes.push({domain:form.domain,questionCount:form.questionCount,durationSeconds:form.durationSeconds});
  }
  assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.forms')).rows[0].n,4,'student requests never create forms');
  const history=await evaluate("fetch('/api/v1/attempts?limit=100').then(r=>r.json())");assert.equal(history.items.length,3);assert.ok(history.items.every(row=>row.state==='GRADED'&&row.formMode==='PUBLISHED_FIXED'));
  await capture('fixed-three-domain-history');report.fixedDomains=outcomes;
  const heldId=history.items[0].attemptId;
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__fixedHeld=false;window.fetch=async(input,init={})=>{const response=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/v1/attempts/${heldId}'&&(!init.method||init.method==='GET')){window.__fixedHeld=true;await new Promise(resolve=>window.__releaseFixedRead=resolve);}return response;};return true;})()`);
  await click(`history-${heldId}`);await waitFor('window.__fixedHeld===true','real owned fixed GET held');
  const rotation=await evaluate(`(async()=>{const csrf=()=>document.cookie.split('; ').find(s=>s.startsWith('tsa_local_csrf='))?.slice('tsa_local_csrf='.length);const post=(path,body)=>fetch(path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf()},body:JSON.stringify(body)});const old=csrf();const logout=await post('/local-auth/logout',{});const bootstrap=await post('/local-auth/bootstrap',{});const login=await post('/local-auth/login',{actorKey:'studentB'});return{logout:logout.status,bootstrap:bootstrap.status,login:login.status,changed:old!==csrf()};})()`);
  assert.deepEqual(rotation,{logout:200,bootstrap:201,login:200,changed:true});
  await evaluate('window.__releaseFixedRead();true');
  await waitFor(`Boolean(${query('persistent-login')})`,'old fixed read cannot render under replacement session');
  assert.equal(await evaluate(`Boolean(${query('result')}) || Boolean(${query('back-score')})`),false,'old private result absent');
  await capture('fixed-session-read-fenced');
  report.checks.push('B10 fixed catalog forms have distinct visible references even for identical titles, desktop/narrow layouts and native unchecked consent; Escape restores focus and sends zero POST',
    'B10 each real committed lost acknowledgement retries the identical fixed body/key; post-receipt GET failure recovers through GET only and explicit Start',
    'B10 independent MATH/READING/SCIENCE PostgreSQL saves survive reload without new assignment or clock reset; all grade100 and release explicit review',
    'B10 history preserves three fixed graded attempts sharing original immutable forms; no per-student form or silent personal fallback',
    'B10 a held real owned fixed GET is rejected after actual external A-to-B session rotation; private result stays cleared');
}
