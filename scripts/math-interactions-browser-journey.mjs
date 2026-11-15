// Optional Chromium check against the disposable synthetic Math import integration test.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function verifyMathInteractionsBrowser(demo) {
  const profile = await mkdtemp(join(tmpdir(), 'tsa-math-interactions-chromium-'));
  const browser = spawn(process.env.STUDENT_BROWSER ?? '/snap/bin/chromium', ['--headless', '--disable-gpu',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    ...(process.env.STUDENT_BROWSER_NO_SANDBOX === 'true' ? ['--no-sandbox'] : []), 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  let diagnostics = '', socket, serial = 0;
  const pending = new Map(), errors = [];
  browser.stderr.setEncoding('utf8'); browser.stderr.on('data', (s) => { diagnostics = (diagnostics + s).slice(-32_000); });
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  let launchError;
  browser.once('error', (e) => { launchError = e; });
  try {
    for (let i = 0; i < 200 && !diagnostics.includes('DevTools listening on'); i++) {
      if (launchError) throw launchError;
      if (browser.exitCode !== null) throw new Error(diagnostics);
      await delay(50);
    }
    const endpoint = diagnostics.match(/DevTools listening on (ws:\/\/\S+)/u)?.[1]; assert.ok(endpoint, diagnostics);
    const targets = await (await fetch(`${endpoint.replace('ws:', 'http:').split('/devtools/')[0]}/json/list`)).json();
    socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(JSON.stringify(message.params.args));
      const task = pending.get(message.id); if (!task) return;
      pending.delete(message.id); clearTimeout(task.timer);
      message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
    };
    await once(socket, 'open');
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15_000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async (expression) => {
      for (let until = Date.now() + 20_000; Date.now() < until;) { if (await evaluate(expression)) return; await delay(50); }
      throw new Error(`UI did not reach: ${expression}`);
    };
    const selector = (id) => `document.querySelector('[data-testid="${id}"]')`;
    const click = async (id) => { await wait(`Boolean(${selector(id)})`); await evaluate(`${selector(id)}.click()`); };
    await command('Runtime.enable'); await command('Page.enable');
    await command('Page.navigate', { url: demo.urls.clozeMatching });
    await click('persistent-login-studentB'); await click('demo-start');
    await wait("Boolean(document.getElementById('question-title'))");
    const types = new Set();
    for (let position = 0; position < 4; position++) {
      await wait(`Boolean(${selector('question-counter')})`);
      const type = await evaluate(`document.querySelector('[data-testid^="cloze-answer-field-"]') ? 'CLOZE' : document.querySelector('select[data-testid^="matching-"]') ? 'MATCHING' : null`);
      assert.ok(type, 'cloze or matching controls render'); types.add(type);
      assert.equal(await evaluate("/acceptedValues|answerKey|capturedTargetLabels/.test(document.body.textContent)"), false);
      await evaluate(`(()=>{const text=document.body.textContent;const index=Number(/exercise (\\d+)/.exec(text)[1])-1;
        const input=document.querySelector('[data-testid^="cloze-answer-field-"]');
        if(input){input.value=String(index+17);input.dispatchEvent(new Event('input',{bubbles:true}));}
        else for(const select of document.querySelectorAll('select[data-testid^="matching-"]')){
          const row=select.dataset.testid.endsWith('row-1')?'target-1':'target-2';select.value=row;select.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
      await click(type === 'CLOZE' ? 'cloze-answer-save' : 'matching-answer-save');
      await wait(`${selector('save-status')}.classList.contains('saved')`);
      if (position < 3) await click('question-next');
    }
    assert.deepEqual([...types].sort(), ['CLOZE', 'MATCHING']);
    await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
    await writeFile('/tmp/tsa-math-interactions-mobile.png', Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await click('submit-open'); await click('submit-confirm'); await wait(`Boolean(${selector('result')})`);
    const result = await evaluate(`fetch('/api/v4/attempts?limit=100').then(r=>r.json()).then(p=>fetch('/api/v4/attempts/'+p.items[0].attemptId+'/result').then(r=>r.json()))`);
    assert.equal(result.correctCount, 4); assert.deepEqual(errors, []);
    return { engine: 'Chromium', interactions: [...types], correctCount: result.correctCount, consoleErrors: errors,
      screenshot: '/tmp/tsa-math-interactions-mobile.png' };
  } finally {
    socket?.close();
    for (const task of pending.values()) clearTimeout(task.timer);
    if (!launchError && browser.exitCode === null && browser.signalCode === null) {
      browser.kill('SIGTERM');
      const exited = await Promise.race([once(browser, 'close').then(() => true), delay(5000).then(() => false)]);
      if (!exited) { browser.kill('SIGKILL'); await once(browser, 'close'); }
    }
    await rm(profile, { recursive: true, force: true });
  }
}
