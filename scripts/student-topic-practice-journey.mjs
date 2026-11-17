import assert from 'node:assert/strict';

export async function runTopicPracticeJourney({ evaluate, command, click, query, waitFor, fixture, capture, report,
  narrowWidth = 375, selectFirst: nativeSelectFirst,
  viewport = (width, height) => command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }),
  reload = () => command('Page.reload', { ignoreCache: true }),
}) {
  await click('topic-practice-open');
  await waitFor(`Boolean(${query('topic-select')})`, 'registered topic tree');
  assert.equal(await evaluate(`${query('topic-start')}.disabled`), true, 'zero topics cannot create');
  await capture('topic-catalog-desktop');
  const selectFirst = nativeSelectFirst ?? (async () => {
    const point = await evaluate(`(()=>{const e=${query('topic-select')};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  });
  await selectFirst();
  assert.equal(await evaluate(`${query('topic-start')}.disabled`), false, 'group selection enables practice');
  await selectFirst();
  assert.equal(await evaluate(`${query('topic-start')}.disabled`), true, 'group deselection clears selection');
  await selectFirst();
  await evaluate(`${query('topic-question-count')}.value='100'`);
  await click('topic-start');
  await waitFor(`!${query('topic-start')}.disabled`, 'insufficient inventory returns control');
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 0, 'insufficient inventory creates no attempt');
  assert.equal(await evaluate(`Boolean(document.querySelector('#question-title'))`), false);
  await viewport(narrowWidth, 812);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'mobile topic tree fits');
  await capture('topic-catalog-mobile');
  await evaluate(`${query('topic-question-count')}.value='2';${query('topic-duration')}.value='3'`);
  await click('topic-start');
  await waitFor(`Boolean(${query('created-start')})`, 'topic reservation');
  await capture('topic-reservation-mobile');
  await click('created-start');
  await waitFor('Boolean(document.querySelector("#question-title"))', 'topic attempt started');
  const view = await evaluate(`fetch('/api/v1/attempts?limit=100').then(r=>r.json()).then(p=>fetch('/api/v1/attempts/'+p.items.find(x=>x.state==='IN_PROGRESS').attemptId)).then(r=>r.json())`);
  assert.equal(view.slots.length, 2);
  assert.equal(Date.parse(view.deadlineAt) - Date.parse(view.startedAt), 180000);
  const clock = (await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0];
  await click('mark-for-review');
  assert.equal(await evaluate(`${query('mark-for-review')}.getAttribute('aria-pressed')`), 'true');
  const slot = view.slots[0];
  if (slot.interaction.type === 'SINGLE_CHOICE') await click('option-b');
  else if (slot.interaction.type === 'MULTIPLE_CHOICE') {
    await click('option-a'); await waitFor(`Boolean(${query('multiple-choice-unsaved')})`, 'topic staged multiple choice'); await click('option-c');
  } else {
    await click('tf-s1-true'); await waitFor(`!${query('tf-s2-false')}.disabled`, 'topic partial statement saved'); await click('tf-s2-false');
  }
  await waitFor(`${query('save-status')}.classList.contains('saved')`, 'topic answer acknowledged');
  await click('question-next'); await click('question-prev');
  const before = await evaluate('performance.timeOrigin');
  await reload();
  await waitFor(`performance.timeOrigin!==${before} && Boolean(document.querySelector('#question-title'))`, 'topic refresh resume');
  const resumed = await evaluate(`fetch('/api/v1/attempts/${view.attemptId}').then(r=>r.json())`);
  assert.equal(resumed.answers.length, 1);
  assert.deepEqual((await fixture.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0], clock);
  assert.equal(await evaluate(`${query('mark-for-review')}.getAttribute('aria-pressed')`), 'true');
  await capture('topic-exam-mobile');
  await viewport(1440, 1000);
  await capture('topic-exam-desktop');
  await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'topic result after explicit submit with unanswered question');
  await capture('topic-result');
  await click('return-catalog'); await click('topic-practice-open');
  await waitFor(`Boolean(${query('topic-select')})`, 'topic catalog after grading');
  assert.match(await evaluate(`${query('topic-tree')}.textContent`), /[1-9]\d* đã làm/);
  await capture('topic-progress');
  report.topicViewport = { narrowWidth, desktopWidth: 1440 };
  report.checks.push('Real taxonomy group select/deselect, zero selection, insufficient inventory with no attempt, desktop/mobile catalog and topic creation');
}
