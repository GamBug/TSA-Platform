import assert from 'node:assert/strict';

export async function runClozeMatchingJourney({ evaluate, click, query, waitFor, capture, report, fixture,
  reload, viewport, pressKey, typeText, narrowWidth = 375, focusControl = click }) {
  // Keyboard assignment starts from focus alone where a pointer click would open a native popup
  // that headless automation cannot drive; the harness supplies that focus step.
  const questionView = async () => evaluate(`fetch('/api/v4/attempts?limit=100').then(response=>response.json()).then(page=>
    fetch('/api/v4/attempts/'+page.items.find(item=>['CREATED','IN_PROGRESS'].includes(item.state)).attemptId)
      .then(response=>response.json()))`);
  await click('demo-start');
  await waitFor(`Boolean(document.getElementById('question-title'))`, 'real q3 attempt starts from the fixture catalog');
  const view = await questionView();
  const interactionTypes = view.slots.map((slot) => slot.interaction.type);
  assert.deepEqual([...interactionTypes].sort(),
    ['CLOZE', 'MATCHING', 'MULTIPLE_CHOICE', 'NUMERIC_RESPONSE', 'SINGLE_CHOICE', 'TRUE_FALSE_GROUP'].sort(),
    'the actual q3 attempt mixes cloze/matching with all four existing student interaction kinds');
  assert.equal(JSON.stringify(view).includes('acceptedValues'), false, 'active attempt never includes private cloze keys');
  assert.equal(JSON.stringify(view).includes('correctAnswer'), false, 'active attempt never includes released answers');
  assert.ok(view.slots.some((slot) => slot.interaction.type === 'CLOZE'));
  assert.ok(view.slots.some((slot) => slot.interaction.type === 'MATCHING'));
  assert.ok(fixture.blueprint.config.allowedTypes.includes('CLOZE'));
  const attemptId = view.attemptId;
  const ordinalFor = (type) => view.slots.find((slot) => slot.interaction.type === type).ordinal;

  async function goTo(type) {
    const target = ordinalFor(type);
    const current = Number((await evaluate(`${query('question-counter')}.textContent.match(/\\d+/)?.[0]`)) ?? 1);
    if (target > current) {
      for (let ordinal = current; ordinal < target; ordinal += 1) await click('question-next');
    } else {
      for (let ordinal = current; ordinal > target; ordinal -= 1) await click('question-prev');
    }
    await waitFor(`${query('question-counter')}.textContent.includes(${JSON.stringify(String(target))})`, `${type} question navigation`);
  }

  await goTo('CLOZE');
  await waitFor(`Boolean(${query('cloze-answer-city')}&&${query('cloze-answer-ratio')})`, 'native cloze fields');
  assert.equal(await evaluate(`${query('cloze-answer-city')}.getAttribute('maxlength')`), null,
    'supplementary characters are not cut off by HTML UTF-16 maxlength');
  assert.equal(await evaluate(`${query('cloze-answer-city')}.labels.length`), 1, 'each cloze field has a native label');
  assert.equal(await evaluate(`document.body.textContent.includes('acceptedValues')||document.body.textContent.includes('CLOZE_PRIVATE')`), false,
    'student screen does not expose implementation or private-key labels');

  await click('cloze-answer-city');
  await pressKey('a'); await pressKey('d'); await pressKey('ArrowDown');
  assert.equal(await evaluate(`${query('cloze-answer-city')}.value`), 'ad', 'A/D and arrows type or move the caret inside the native input');
  assert.equal(await evaluate('Boolean(document.querySelector("dialog[open]"))'), false, 'focused inputs bypass global shortcuts');
  assert.equal(await evaluate(`${query('question-counter')}.textContent.includes(${JSON.stringify(String(ordinalFor('CLOZE')))})`), true,
    'focused input keys do not change the question');
  await click('interaction-discard');

  await typeText('cloze-answer-city', 'x'.repeat(41));
  assert.equal(await evaluate(`${query('cloze-answer-city')}.value.length`), 41, 'over-limit text remains visible for honest validation');
  assert.equal(await evaluate(`${query('cloze-answer-city')}.getAttribute('aria-invalid')`), 'true');
  assert.equal(await evaluate(`${query('cloze-answer-save')}.disabled`), true, 'cloze save is blocked beyond the scalar limit');
  assert.match(await evaluate(`${query('cloze-answer-error')}.textContent`), /40 ký tự/);
  assert.equal(await evaluate(`${query('question-next')}.disabled`), true, 'navigation protects an invalid unsaved draft');
  await click('interaction-discard');

  const rawCity = '  Ha No\u0303i  ';
  await typeText('cloze-answer-city', rawCity);
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__clozeMatchingSaveCalls=[];let drop=true;window.fetch=async(...args)=>{
    const response=await original(...args);const path=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href).pathname;
    const options=args[1]??{};if(options.method==='PUT'&&path.endsWith('/answers/${view.slots.find((slot) => slot.interaction.type === 'CLOZE').slotId}')){
      window.__clozeMatchingSaveCalls.push({body:JSON.parse(options.body),key:new Headers(options.headers).get('idempotency-key')});
      if(drop){drop=false;throw new Error('Synthetic committed cloze save lost its acknowledgement');}}
    return response;};return true})()`);
  await click('cloze-answer-save');
  await waitFor(`Boolean(${query('save-error-action')})`, 'committed cloze save with lost acknowledgement is visibly uncertain');
  assert.equal(await evaluate(`${query('cloze-answer-city')}.value`), rawCity, 'raw decomposed text survives an uncertain acknowledgement');
  await click('cloze-answer-save');
  await waitFor(`${query('save-status')}.classList.contains('saved')&&window.__clozeMatchingSaveCalls.length===2`, 'same cloze request explicitly retries');
  const retries = await evaluate('window.__clozeMatchingSaveCalls');
  assert.deepEqual(retries[1], retries[0], 'retry preserves the exact response body and idempotency key');
  assert.deepEqual(retries[0].body.value, { type: 'CLOZE', values: { city: rawCity, ratio: '' } });
  assert.equal(await evaluate(`${query('answered-count')}.textContent.startsWith('0/')`), true, 'one partial field does not mark a cloze item complete');

  const savedBeforeReload = await questionView();
  const savedCloze = savedBeforeReload.answers.find((answer) => answer.slotId === view.slots.find((slot) => slot.interaction.type === 'CLOZE').slotId);
  assert.equal(savedCloze.value.values.city, rawCity, 'server retains combining marks and outer spaces verbatim');
  const oldTime = await evaluate('performance.timeOrigin');
  await reload();
  await waitFor(`performance.timeOrigin!==${oldTime}&&Boolean(document.getElementById('question-title'))`, 'real page reload resumes the v4 attempt');
  await goTo('CLOZE');
  assert.equal(await evaluate(`${query('cloze-answer-city')}.value`), rawCity, 'reload restores the exact raw cloze response');
  assert.equal(await evaluate(`${query('cloze-answer-ratio')}.value`), '', 'partial cloze response remains partial after reload');
  await click('cloze-answer-clear');
  await waitFor(`${query('save-status')}.classList.contains('saved')&&${query('cloze-answer-city')}.value===''`, 'typed clear is acknowledged');
  const clearedCloze = await questionView();
  const clearValue = clearedCloze.answers.find((answer) => answer.slotId === view.slots.find((slot) => slot.interaction.type === 'CLOZE').slotId).value;
  assert.deepEqual(clearValue, { type: 'CLOZE', values: { city: null, ratio: null } }, 'clear sends typed null fields, not a null response');

  await typeText('cloze-answer-city', '  Ha Noi  ');
  await typeText('cloze-answer-ratio', '3:2');
  await click('cloze-answer-save');
  await waitFor(`${query('save-status')}.classList.contains('saved')&&${query('answered-count')}.textContent.startsWith('1/')`, 'complete cloze is acknowledged and marked complete');
  await viewport(narrowWidth, 900);
  await capture('cloze-controls-375');
  await viewport(1280, 900);
  await capture('cloze-controls-desktop');

  await goTo('MATCHING');
  await waitFor(`Boolean(${query('matching-answer-row-a')}&&${query('matching-answer-row-b')}&&${query('matching-answer-row-c')})`, 'native matching selects');
  assert.equal(await evaluate(`${query('matching-answer-row-a')}.labels.length`), 1, 'each native select has an associated label');
  assert.equal(await evaluate(`${query('matching-answer-row-a')}.getBoundingClientRect().height>=44`), true, 'matching selects meet the touch target height');
  await evaluate(`(()=>{const select=${query('matching-answer-row-a')};select.__keyboardTrace=[];for(const type of ['focus','keydown','keyup','change'])select.addEventListener(type,event=>select.__keyboardTrace.push({type,key:event.key,value:select.value,active:document.activeElement===select}));return true})()`);
  await focusControl('matching-answer-row-a'); await pressKey('ArrowDown'); await pressKey('Enter');
  const red = view.slots.find((slot) => slot.interaction.type === 'MATCHING').interaction.targets[0].id;
  const keyboardSelection = await evaluate(`(()=>{const select=${query('matching-answer-row-a')};return{value:select.value,selectedIndex:select.selectedIndex,active:document.activeElement===select,trace:select.__keyboardTrace}})()`);
  report.matchingKeyboardSelection = keyboardSelection;
  assert.equal(keyboardSelection.value, red, `keyboard selects the first matching target: ${JSON.stringify(keyboardSelection)}`);
  assert.equal(await evaluate(`${query('matching-answer-row-b')}.querySelector('option[value="${red}"]').disabled`), true,
    'a target at its reuse limit is disabled for other rows');
  await click('matching-answer-save');
  await waitFor(`${query('save-status')}.classList.contains('saved')`, 'partial matching map is saved');
  assert.equal(await evaluate(`${query('answered-count')}.textContent.startsWith('1/')`), true, 'partial matching remains incomplete');

  const targets = view.slots.find((slot) => slot.interaction.type === 'MATCHING').interaction.targets;
  const expectedTargets = targets.map(({ id }) => id);
  for (const [index, rowId] of ['row-b', 'row-c'].entries()) {
    await focusControl(`matching-answer-${rowId}`); await pressKey('ArrowDown'); await pressKey('Enter');
    await waitFor(`${query(`matching-answer-${rowId}`)}.value===${JSON.stringify(expectedTargets[index + 1])}`,
      `keyboard assigns matching row ${rowId} within reuse limits`);
  }
  await click('matching-answer-save');
  await waitFor(`${query('save-status')}.classList.contains('saved')&&${query('answered-count')}.textContent.startsWith('2/')`,
    'all matching rows are acknowledged and complete');
  await click('matching-answer-clear');
  await waitFor(`${query('save-status')}.classList.contains('saved')&&${query('answered-count')}.textContent.startsWith('1/')`,
    'matching clear returns the item to incomplete');
  const clearedMatching = await questionView();
  const matchingSlotId = view.slots.find((slot) => slot.interaction.type === 'MATCHING').slotId;
  assert.deepEqual(clearedMatching.answers.find((answer) => answer.slotId === matchingSlotId).value,
    { type: 'MATCHING', assignments: { 'row-a': null, 'row-b': null, 'row-c': null } }, 'matching clear uses typed null assignments');
  for (const [index, rowId] of ['row-a', 'row-b', 'row-c'].entries()) {
    await focusControl(`matching-answer-${rowId}`); await pressKey('ArrowDown'); await pressKey('Enter');
    await waitFor(`${query(`matching-answer-${rowId}`)}.value===${JSON.stringify(expectedTargets[index])}`, `restore ${rowId}`);
  }
  await click('matching-answer-save');
  await waitFor(`${query('answered-count')}.textContent.startsWith('2/')`, 'complete matching is restored');
  await viewport(narrowWidth, 900);
  await capture('matching-controls-375');
  await viewport(1280, 900);

  await goTo('NUMERIC_RESPONSE');
  await typeText('numeric-answer-input', '1.5');
  await click('numeric-answer-save');
  await waitFor(`${query('save-status')}.classList.contains('saved')&&${query('answered-count')}.textContent.startsWith('3/')`, 'mixed numeric q3 interaction uses its native text field');
  await goTo('SINGLE_CHOICE');
  await click('option-b');
  await waitFor(`${query('save-status')}.classList.contains('saved')&&${query('answered-count')}.textContent.startsWith('4/')`, 'mixed single-choice q3 interaction remains supported');
  await goTo('MULTIPLE_CHOICE');
  await click('option-b');
  await waitFor(`${query('save-status')}.classList.contains('saved')&&${query('answered-count')}.textContent.startsWith('5/')`, 'mixed multiple-choice q3 interaction remains supported');
  await goTo('TRUE_FALSE_GROUP');
  await click('tf-statement-a-true');
  await click('tf-statement-b-false');
  await waitFor(`${query('save-status')}.classList.contains('saved')&&${query('answered-count')}.textContent.startsWith('6/')`, 'mixed true/false q3 interaction remains supported');

  await click('submit-open');
  await waitFor('Boolean(document.querySelector("#submit-dialog[open]"))', 'native submit confirmation');
  await capture('cloze-matching-submit-confirmation');
  await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'real q3 attempt is graded');
  assert.match(await evaluate(`${query('result-score')}.textContent`), /6/);
  await click('review-open');
  await waitFor(`Boolean(${query('review-question')})`, 'released review opens after grading');
  const reviewIndexFor = (type) => view.slots.filter((slot) => slot.ordinal < ordinalFor(type)).length + 1;
  async function goToReview(type) {
    const target = reviewIndexFor(type);
    const current = Number((await evaluate(`${query('review-counter')}.textContent.match(/\\d+/)?.[0]`)) ?? 1);
    for (let index = current; index < target; index += 1) await click('review-next');
    for (let index = current; index > target; index -= 1) await click('review-prev');
  }
  await goToReview('CLOZE');
  await waitFor(`Boolean(${query('cloze-review')})`, 'released cloze review');
  const releasedCloze = await evaluate(`${query('review-question')}.textContent`);
  assert.match(releasedCloze, /City/); assert.match(releasedCloze, /Ratio/); assert.match(releasedCloze, /Ha Noi/);
  assert.match(releasedCloze, /Đáp án được chấp nhận: Ha Noi/);
  await capture('cloze-released-review');
  await goToReview('MATCHING');
  await waitFor(`Boolean(${query('matching-review')})`, 'released matching review');
  const releasedMatching = await evaluate(`${query('review-question')}.textContent`);
  assert.match(releasedMatching, /Row A/); assert.match(releasedMatching, /Red/); assert.match(releasedMatching, /Đáp án đúng: Red/);
  await goToReview('NUMERIC_RESPONSE');
  await waitFor(`Boolean(${query('numeric-review')})`, 'released mixed numeric review');
  await capture('cloze-matching-released-review');
  report.checks.push('Real q3 PostgreSQL journey mixes all six interaction types through /api/v4; native cloze fields validate scalar length, preserve raw decomposed text over commit/retry/reload, clear with typed null maps, and keep drafts from navigation.');
  report.checks.push('Native matching selects support keyboard assignment, enforce reuse limits, save partial/complete maps, clear, and resume; Chromium/Firefox capture 375px layouts and released labels/answers only after grading.');
  report.attemptId = attemptId;
  report.fixtureProfile = 'SYNTHETIC_CLOZE_MATCHING_WITH_LEGACY_GROUPS';
}
