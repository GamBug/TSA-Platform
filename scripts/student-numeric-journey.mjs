import assert from 'node:assert/strict';

export async function runNumericJourney({ evaluate, command, click, query, waitFor, capture, report, narrowWidth = 375,
  viewport = (width,height) => command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}),
  reload = () => command('Page.reload',{ignoreCache:true}),
  key = async value => {
    const code = value === 'Escape' ? { code:'Escape', windowsVirtualKeyCode:27 } : {};
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:value,...code});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:value,...code});
  },
}) {
  const input = query('numeric-answer-input');
  const fill = async value => evaluate(`(()=>{const e=${input};e.focus();e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return e.value;})()`);
  await click('demo-start');
  await waitFor(`Boolean(${input})`, 'numeric response rendered');
  await capture('numeric-exam-desktop');
  const firstTitle = await evaluate('document.getElementById("question-title").textContent');
  await fill('1/2');
  assert.equal(await evaluate(`${input}.getAttribute('aria-invalid')`),'true');
  assert.equal(await evaluate(`${query('numeric-answer-save')}.disabled`),true);
  await key('n'); await key('m'); await key('?');
  assert.equal(await evaluate('document.getElementById("question-title").textContent'),firstTitle);
  assert.equal(await evaluate('Boolean(document.querySelector("dialog[open]"))'),false,'input typing never opens shortcuts');
  await click('question-next');
  assert.equal(await evaluate('document.getElementById("question-title").textContent'),firstTitle,'draft prevents silent navigation');
  await fill('1'); await click('numeric-answer-save');
  await waitFor(`${query('save-status')}.classList.contains('saved')`, 'initial numeric response acknowledged');
  const raw='  +001,500  ';
  await fill(raw);
  await evaluate(`(()=>{const original=window.fetch.bind(window);window.__numericSaves=[];let drop=true;window.fetch=async(path,options={})=>{
    const url=new URL(typeof path==='string'?path:path.url,location.href);
    if(options.method==='PUT'&&url.pathname.includes('/answers/')){
      window.__numericSaves.push({body:options.body,key:new Headers(options.headers).get('idempotency-key')});
      const response=await original(path,options);
      if(drop&&response.ok){drop=false;throw new TypeError('Synthetic lost acknowledgement after real commit');}
      return response;
    }return original(path,options);};return true;})()`);
  await click('numeric-answer-save');
  await waitFor(`Boolean(${query('save-error')})`, 'failed acknowledgement remains visibly unsaved');
  assert.equal(await evaluate(`${input}.readOnly`),true,'uncertain saves cannot be hidden by editing back to a cached value');
  await fill('1');
  assert.equal(await evaluate(`${input}.value`),raw);
  assert.equal(await evaluate(`${query('save-status')}.classList.contains('saved')`),false);
  await click('numeric-answer-save');
  await waitFor(`${query('save-status')}.classList.contains('saved')`, 'explicit retry replays confirmed response');
  assert.equal(await evaluate(`${input}.value`),raw);
  const saves=await evaluate('window.__numericSaves');
  assert.equal(saves.length,2); assert.deepEqual(saves[0],saves[1],'retry retains exact body and idempotency key');
  await click('question-next'); await click('question-prev');
  assert.equal(await evaluate(`${input}.value`),raw);
  const before=await evaluate('performance.timeOrigin'); await reload();
  await waitFor(`performance.timeOrigin!==${before}&&Boolean(${input})`, 'numeric refresh resumes');
  assert.equal(await evaluate(`${input}.value`),raw);
  await click('numeric-answer-clear');
  await waitFor(`${query('save-status')}.classList.contains('saved')&&${input}.value===''`, 'explicit clear persists null');
  await fill(raw); await click('numeric-answer-save');
  await waitFor(`${query('save-status')}.classList.contains('saved')`, 'numeric answer saved again');
  for(const width of [768,narrowWidth]) {
    await viewport(width,900);
    assert.equal(await evaluate('innerWidth'),width,'the responsive evidence uses the requested CSS viewport');
    await evaluate(`(()=>{const list=document.querySelector('.exam-question-list');if(list?.open)list.querySelector('summary').click();return true;})()`);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert.equal(await evaluate(`${input}.getBoundingClientRect().height>=44`),true);
    await capture(`numeric-exam-${width}`);
  }
  await click('shortcut-help-open');
  await waitFor('Boolean(document.querySelector("#shortcut-help-dialog[open]"))','visible shortcut help');
  await key('Escape');
  await waitFor(`!document.querySelector('dialog[open]')&&document.activeElement===${query('shortcut-help-open')}`, 'shortcut help restores focus');
  await click('submit-open');
  await waitFor('Boolean(document.querySelector("#submit-dialog[open]"))','explicit submit confirmation');
  await capture('numeric-submit-confirmation'); await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`,'numeric result graded');
  await click('review-open');
  await waitFor(`Boolean(${query('numeric-review')})`,'numeric review only after release');
  assert.equal(await evaluate(`${query('numeric-review')}.textContent.includes(${JSON.stringify(raw)})`),true);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await capture('numeric-released-review');
  report.checks.push('Real numeric entry with invalid syntax feedback, input shortcut isolation, draft navigation protection, committed lost-ACK retry, raw-value refresh, explicit persisted clear, responsive layouts and authorized released review.');
}
