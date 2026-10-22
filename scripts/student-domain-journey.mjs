import assert from 'node:assert/strict';

/** Browser-only standalone domain coverage, not human/bundle acceptance. */
export async function runDomainJourney({ evaluate, command, click, query, waitFor, fixture, capture, report }) {
  const outcomes = [];
  const clickDomain = async (domain) => {
    const expression = `document.querySelector('[data-testid="catalog-card-${domain}"] [data-testid="demo-start"]')`;
    await waitFor(`Boolean(${expression} && !${expression}.disabled)`, `explicit ${domain} selection`);
    const point = await evaluate(`(()=>{const e=${expression};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  };
  for (const [domain, count, duration, label] of [
    ['MATH', 4, 360, 'Toán học'], ['READING', 2, 180, 'Đọc hiểu'], ['SCIENCE', 4, 360, 'Khoa học'],
  ]) {
    await waitFor(`Boolean(${query(`catalog-card-${domain}`)})`, `${domain} catalog card`);
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, outcomes.length,
      'returning to catalog does not allocate or chain another test');
    await clickDomain(domain);
    await waitFor(`Boolean(document.getElementById('question-title'))`, `${domain} independent active exam`);
    const view = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items.find(x=>x.state==='IN_PROGRESS').attemptId)).then(r=>r.json())`);
    assert.equal(view.domain, domain); assert.equal(view.slots.length, count); assert.equal(view.sections.length, 1);
    assert.equal(view.sections[0].section, domain);
    assert.equal(Date.parse(view.deadlineAt) - Date.parse(view.startedAt), duration * 1000);
    assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(label)})`), true);
    assert.ok(outcomes.every((entry) => entry.attemptId !== view.attemptId && entry.formId !== view.formId), 'each explicit selection has its own attempt and form');
    const clock = (await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0];
    const historyBefore = (await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.student_question_history')).rows[0].n;
    const other = Object.entries(fixture.domainBlueprints).find(([key]) => key !== domain)[1];
    const conflict = await evaluate(`fetch('/api/v1/attempts',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':decodeURIComponent(document.cookie.split('; ').find(s=>s.startsWith('tsa_local_csrf=')).split('=')[1]),'idempotency-key':crypto.randomUUID()},body:JSON.stringify({blueprintVersionId:${JSON.stringify(other.versionId)}})}).then(async r=>({status:r.status,body:await r.json()}))`);
    assert.equal(conflict.status, 409); assert.equal(conflict.body.error.code, 'CONCURRENT_ATTEMPT_EXISTS');
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.student_question_history')).rows[0].n, historyBefore);
    for (const [index, slot] of view.slots.entries()) {
      if (index) await click('question-next');
      if (slot.interaction.type === 'MULTIPLE_CHOICE') {
        await click('option-a'); await waitFor(`Boolean(${query('multiple-choice-unsaved')})`, 'staged mixed-domain multiple choice');
        await click('option-c');
      } else if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
        await click('tf-s1-true');
        await waitFor(`Boolean(${query('tf-s1-true')}?.checked && !${query('tf-s2-false')}.disabled)`, 'partial group acknowledgement');
        await click('tf-s2-false');
      } else await click('option-b');
      await waitFor(`Boolean(${query('save-status')}.classList.contains('saved'))`, `${domain} answer acknowledgement`);
    }
    await capture(`${domain.toLowerCase()}-saved-exam`);
    const previousDocument = await evaluate('performance.timeOrigin');
    await command('Page.reload', { ignoreCache: true });
    await waitFor(`performance.timeOrigin!==${previousDocument} && Boolean(document.getElementById('question-title'))`, `${domain} reconnect`);
    const resumed = await evaluate(`fetch('/api/v1/attempts/${view.attemptId}').then(r=>r.json())`);
    assert.equal(resumed.answers.length, count);
    assert.equal(resumed.domain, domain);
    assert.deepEqual((await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0], clock);
    await evaluate(`(()=>{const original=window.fetch.bind(window);window.__domainSubmitKeys=[];window.__domainLostAck=false;window.fetch=async(input,init={})=>{const r=await original(input,init);const url=new URL(typeof input==='string'?input:input.url,location.href);if(init.method==='POST'&&url.pathname.endsWith('/submit')){window.__domainSubmitKeys.push(new Headers(init.headers).get('idempotency-key'));if(r.ok&&!window.__domainLostAck){window.__domainLostAck=true;await r.arrayBuffer();throw new TypeError('Synthetic lost domain submission acknowledgement');}}return r;};})()`);
    await click('submit-open'); await click('submit-confirm');
    await waitFor(`Boolean(${query('submit-dialog-error')}?.textContent) && !${query('submit-confirm')}.disabled`, `${domain} lost submission acknowledgement is explicit`);
    await click('submit-confirm');
    await waitFor(`Boolean(${query('result')})`, `${domain} unofficial result`);
    const keys = await evaluate('window.__domainSubmitKeys');
    assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
    assert.match(await evaluate(`${query('result-score')}.textContent`), /100%/);
    assert.equal(await evaluate(`Boolean(${query('result-domain')}) && ${query('result-domain')}.textContent.includes(${JSON.stringify(label)})`), true,
      'each result identifies its independently scored domain');
    const stored = (await fixture.pool.query(`SELECT s.correct_count,s.total_count,s.percentage::text AS percentage,
      (SELECT count(*)::int FROM tsa.jobs j WHERE j.attempt_id=a.id) AS jobs
      FROM tsa.attempts a JOIN tsa.score_runs s ON s.id=a.latest_score_id WHERE a.id=$1`, [view.attemptId])).rows[0];
    assert.deepEqual(stored, { correct_count: count, total_count: count, percentage: '100.00', jobs: 1 });
    await capture(`${domain.toLowerCase()}-result`);
    await click('review-open'); await waitFor(`Boolean(${query('back-score')})`, `${domain} authorized explanation review`);
    for (let index = 0; index < count; index++) {
      if (index) await click('review-next');
      if (!(await evaluate(`${query('explanation')}.open`))) await click('review-explanation-toggle');
      await waitFor(`${query('explanation')}.open && !document.getElementById('review-explanation-pane').hidden && document.getElementById('review-explanation-pane').getBoundingClientRect().height>0`, `${domain} visible explanation ${index + 1}`);
      assert.equal(await evaluate(`${query('review-counter')}.textContent`), `${index + 1} / ${count}`);
      assert.equal(await evaluate('document.querySelectorAll(".review-item").length'), 1);
      assert.equal(await evaluate('document.querySelector(".review-explanation-copy").textContent.trim().length>0'), true);
    }
    await click('back-score'); await click('return-catalog');
    await waitFor(`Boolean(${query('catalog-panel')})`, `${domain} returns to catalog without chaining`);
    outcomes.push({ domain, attemptId: view.attemptId, formId: view.formId, questionCount: count, durationSeconds: duration,
      score: stored.percentage, submitKeys: keys });
  }
  const history = await evaluate(`fetch('/api/v1/attempts').then(r=>r.json())`);
  assert.equal(history.items.length, 3);
  assert.deepEqual(history.items.map((item) => item.domain).sort(), ['MATH', 'READING', 'SCIENCE']);
  assert.ok(history.items.every((item) => item.state === 'GRADED' && item.score.percentage === '100.00'));
  await waitFor(`document.querySelectorAll('.persistent-history-item').length===3`, 'three independently labelled history entries');
  for (const item of history.items) assert.equal(await evaluate(`Boolean(${query(`history-${item.attemptId}`)})`), true);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 3);
  await capture('three-domain-history');
  report.domains = outcomes;
  report.checks = ['Explicit independent MATH4/READING2/SCIENCE4 selection, separate configured clocks and global H1 cross-domain protection',
    'All three domains save, reload without clock reset, retry lost submission acknowledgement with the same key, and grade100%',
    'Domain-labelled unofficial results and authorized explanation review return to catalog without automatic chaining',
    'Three owned graded history entries with independent scores; standalone synthetic scope does not claim shared reading bundle or lawful human inventory'];
}
