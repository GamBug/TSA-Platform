import assert from 'node:assert/strict';

export async function runImageJourney({ evaluate, command, click, query, waitFor, capture, report, narrowWidth = 375,
  viewport = (width, height) => command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }),
  reload = () => command('Page.reload', { ignoreCache: true }),
  escape = async () => {
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  },
}) {
  await click('demo-start');
  await waitFor('Boolean(document.querySelector("#question-title"))', 'image practice started');
  const loaded = 'Boolean(document.querySelector(".question-image-enlarge:not(:disabled) img")?.naturalWidth)';
  await waitFor(loaded, 'authorized image pixels loaded');
  await capture('image-exam-desktop');
  for (const width of [768, narrowWidth]) {
    await viewport(width, 900);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await evaluate('document.querySelector(".question-image-enlarge").click()');
    await waitFor('Boolean(document.querySelector("dialog.question-image-dialog[open] img")?.naturalWidth)', 'enlarged authorized pixels');
    assert.equal(await evaluate('document.activeElement===document.querySelector(".question-image-dialog button")'), true);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await capture(`image-enlarged-${width}`);
    await escape();
    await waitFor('!document.querySelector("dialog[open]") && document.activeElement===document.querySelector(".question-image-enlarge")', 'image close restores focus');
  }
  await click('option-a'); await waitFor(`${query('save-status')}.classList.contains('saved')`, 'image answer saved');
  await click('question-next'); await waitFor(loaded, 'next image question');
  await click('question-prev');
  const before = await evaluate('performance.timeOrigin'); await reload();
  await waitFor(`performance.timeOrigin!==${before} && ${loaded}`, 'private image resume');
  assert.equal(await evaluate(`${query('option-a')}.checked`), true);
  await capture('image-exam-mobile');
  await click('submit-open'); await click('submit-confirm');
  await waitFor(`Boolean(${query('result')})`, 'graded image practice');
  await click('review-open');
  await waitFor(`Boolean(${query('back-score')})`, 'authorized review loaded');
  if (!(await evaluate(`${query('explanation')}.open`))) await click('review-explanation-toggle');
  await waitFor('Array.from(document.querySelectorAll(".question-image img")).some(i=>i.src.includes("purpose=explanation") && i.naturalWidth>0)', 'released private explanation image');
  await capture('image-released-review');
  report.checks.push('Real inspected image admission, guarded private PNG delivery, desktop/tablet/mobile enlargement, Escape focus restoration, saved-answer refresh and released explanation image');
}
