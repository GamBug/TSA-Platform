import assert from "node:assert/strict";

export async function runExamShortcutJourney({ evaluate, waitFor, pressKey, query, report, slots, assertNoSubmit }) {
  const counter = query("question-counter");
  await evaluate(`document.getElementById("question-title").focus()`);
  await pressKey("n");
  await waitFor(`${counter}.textContent.includes('Câu 2 /')`, "N moves to the next question");
  await pressKey("p");
  await waitFor(`${counter}.textContent.includes('Câu 1 /')`, "P returns to the previous question");

  const marked = query("mark-for-review");
  await pressKey("m");
  assert.equal(await evaluate(`${marked}.getAttribute('aria-pressed')`), "true", "M marks the current question");
  await pressKey("m");
  assert.equal(await evaluate(`${marked}.getAttribute('aria-pressed')`), "false", "M removes the current question mark");

  const singleChoiceIndex = slots.findIndex((slot) => slot.interaction.type === "SINGLE_CHOICE");
  assert.notEqual(singleChoiceIndex, -1, "the mixed fixture has a single-choice question for native radio checks");
  for (let index = 0; index < singleChoiceIndex; index++) {
    await pressKey("n");
    await waitFor(`${counter}.textContent.includes('Câu ${index + 2} /')`, `N visits question ${index + 2}`);
  }
  const singleChoiceOption = slots[singleChoiceIndex].interaction.options[0];
  const radio = query(`option-${singleChoiceOption.id}`);
  await evaluate(`${radio}.focus()`);
  const questionBeforeNativeKey = await evaluate(`${counter}.textContent`);
  const answerBeforeNativeKey = await evaluate(`${radio}.checked`);
  await pressKey("n");
  assert.equal(await evaluate(`${counter}.textContent`), questionBeforeNativeKey, "N does not steal focus from a native radio");
  assert.equal(await evaluate(`${radio}.checked`), answerBeforeNativeKey, "the native answer remains unchanged by N");

  await evaluate(`document.getElementById("question-title").focus()`);
  for (let index = singleChoiceIndex; index > 0; index--) {
    await pressKey("p");
    await waitFor(`${counter}.textContent.includes('Câu ${index} /')`, `P restores question ${index}`);
  }
  await evaluate(`document.getElementById("question-title").focus()`);
  await pressKey("g");
  await waitFor("document.getElementById('navigator-dialog')?.open", "G opens the question navigator");
  await pressKey("Escape");
  await waitFor("!document.getElementById('navigator-dialog')?.open", "Escape closes the question navigator");
  await waitFor(`${counter}===document.activeElement`, "navigator close event restores trigger focus");
  assert.equal(await evaluate(`${counter}===document.activeElement`), true, "closing the navigator restores focus to its trigger");

  await evaluate(`document.getElementById("question-title").focus()`);
  await pressKey("?", { shift: true });
  await waitFor("document.getElementById('shortcut-help-dialog')?.open", "? opens shortcut help");
  assert.equal(await evaluate(`document.getElementById('shortcut-help-dialog').textContent.includes('1–9')
    && document.getElementById('shortcut-help-dialog').textContent.includes('Ctrl + Enter')`), true,
  "help lists option selection and safe submission shortcuts");
  await evaluate(`${query('character-shortcuts-toggle')}.focus()`);
  await pressKey(" ");
  assert.equal(await evaluate(`${query('character-shortcuts-toggle')}.checked`), false, "native checkbox disables character shortcuts");
  await pressKey("Escape");
  await waitFor("!document.getElementById('shortcut-help-dialog')?.open", "Escape closes shortcut help");
  await waitFor("document.activeElement.id==='question-title'", "help close event restores opener focus");
  assert.equal(await evaluate(`document.activeElement.id==='question-title'`), true, "closing help restores focus to its opener");

  const disabledCounter = await evaluate(`${counter}.textContent`);
  for (const key of ["n", "m", "g", "?", "1"]) await pressKey(key);
  assert.equal(await evaluate(`${counter}.textContent`), disabledCounter, "disabled character shortcuts do not navigate");
  assert.equal(await evaluate('Boolean(document.querySelector("dialog[open]"))'), false, "disabled G and ? leave dialogs closed");
  await evaluate(`${query('shortcut-help-open')}.focus()`);
  await pressKey("Enter");
  await waitFor("document.getElementById('shortcut-help-dialog')?.open", "visible help action remains operable when ? is disabled");
  await evaluate(`${query('character-shortcuts-toggle')}.focus()`);
  await pressKey(" ");
  assert.equal(await evaluate(`${query('character-shortcuts-toggle')}.checked`), true);
  await pressKey("Escape");
  await waitFor("!document.getElementById('shortcut-help-dialog')?.open", "close re-enabled help");
  await waitFor("document.activeElement.dataset.testid==='shortcut-help-open'", "re-enabled help close restores its visible opener");
  await evaluate('document.getElementById("question-title").focus()');

  await pressKey("Enter", { ctrl: true });
  await waitFor("document.getElementById('submit-dialog')?.open", "Ctrl+Enter opens submit confirmation");
  await pressKey("n");
  assert.equal(await evaluate(`${counter}.textContent.includes('Câu 1 /')`), true, "navigation shortcuts are ignored inside the submit dialog");
  await pressKey("Escape");
  await waitFor("!document.getElementById('submit-dialog')?.open", "Escape closes submit confirmation");
  await waitFor("document.activeElement.id==='question-title'", "submit close event restores opener focus");
  assert.equal(await evaluate(`document.activeElement.id==='question-title'`), true, "closing submit confirmation restores focus to its opener");
  if (assertNoSubmit) await assertNoSubmit();

  const navigatorExpanded = await evaluate(`${query("exam-question-list")}.open`);
  assert.equal(navigatorExpanded, await evaluate("innerWidth>=900"), "the desktop navigator is persistent and the mobile navigator is collapsed");
  report.examShortcuts = {
    navigationMarkingHelpAndSafeSubmit: "N/P/M/G/?/Escape/Ctrl+Enter work, restore focus, and ignore answer controls and active dialogs",
    viewportWidth: await evaluate("innerWidth"),
    navigatorExpanded,
    questionCount: await evaluate(`${counter}.textContent`),
  };
  return { questionCount: await evaluate(`${counter}.textContent`), navigatorExpanded };
}
