import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attachExamShortcuts, classifyExamShortcut } from "../public/app/exam-shortcuts.js";

function keyEvent(key, overrides = {}) {
  return {
    key,
    target: { tagName: "H2", closest: () => null },
    defaultPrevented: false,
    isComposing: false,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault() { this.defaultPrevented = true; },
    ...overrides,
  };
}

describe("exam keyboard shortcuts", () => {
  it("allows character shortcuts to be disabled without disabling guarded submit or native Escape", () => {
    for (const key of ["n", "p", "1", "9", "m", "g", "?"]) {
      assert.equal(classifyExamShortcut(keyEvent(key), { characterShortcutsEnabled: false }), null);
    }
    assert.deepEqual(classifyExamShortcut(keyEvent("Enter", { ctrlKey: true }), { characterShortcutsEnabled: false }), { type: "submit" });
    assert.deepEqual(classifyExamShortcut(keyEvent("Escape"), { characterShortcutsEnabled: false }), { type: "escape" });
  });
  it("maps navigation, marking, help, option numbers and guarded submit", () => {
    assert.deepEqual(classifyExamShortcut(keyEvent("n")), { type: "next" });
    assert.deepEqual(classifyExamShortcut(keyEvent("p")), { type: "previous" });
    assert.deepEqual(classifyExamShortcut(keyEvent("m")), { type: "mark" });
    assert.deepEqual(classifyExamShortcut(keyEvent("g")), { type: "navigator" });
    assert.deepEqual(classifyExamShortcut(keyEvent("?", { shiftKey: true })), { type: "help" });
    assert.deepEqual(classifyExamShortcut(keyEvent("Escape", { activeDialog: true })), { type: "escape" });
    assert.deepEqual(classifyExamShortcut(keyEvent("Enter", { ctrlKey: true })), { type: "submit" });
    assert.deepEqual(classifyExamShortcut(keyEvent("3")), { type: "option", index: 2 });
    assert.deepEqual(classifyExamShortcut(keyEvent("9")), { type: "option", index: 8 });
  });

  it("leaves editable and native answer controls untouched", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      for (const key of ["n", "3", "m", "g", "?", "Enter", "Escape"]) {
        assert.equal(classifyExamShortcut(keyEvent(key, { target: { tagName, closest: () => null }, ctrlKey: key === "Enter" })), null,
          `${tagName} keeps ${key} native`);
      }
    }
    const contentEditable = { tagName: "DIV", isContentEditable: true, closest: () => null };
    assert.equal(classifyExamShortcut(keyEvent("n", { target: contentEditable })), null);
    const textbox = { tagName: "DIV", closest: (selector) => selector.includes('[role="textbox"]') ? {} : null };
    assert.equal(classifyExamShortcut(keyEvent("Enter", { target: textbox, ctrlKey: true })), null);
  });

  it("ignores custom math editors and editable controls in a composed event path", () => {
    const mathField = { tagName: "MATH-FIELD", closest: () => null };
    assert.equal(classifyExamShortcut(keyEvent("n", { target: mathField })), null);
    const dataMathInput = { tagName: "DIV", closest: (selector) => selector.includes("[data-math-input]") ? {} : null };
    assert.equal(classifyExamShortcut(keyEvent("Enter", { target: dataMathInput, ctrlKey: true })), null);
    for (const role of ["combobox", "spinbutton"]) {
      const control = { tagName: "DIV", closest: (selector) => selector.includes(`[role="${role}"]`) ? {} : null };
      assert.equal(classifyExamShortcut(keyEvent("n", { target: control })), null, `${role} remains native`);
    }
    const innerTarget = { tagName: "SPAN", closest: () => null };
    const shadowInput = { tagName: "DIV", closest: (selector) => selector.includes("[data-math-input]") ? {} : null };
    assert.equal(classifyExamShortcut(keyEvent("n", {
      target: innerTarget,
      composedPath: () => [innerTarget, shadowInput],
    })), null, "composed paths retain the editable host guard");
  });

  it("ignores modified, repeated, composing, already handled, and dialog keystrokes", () => {
    assert.equal(classifyExamShortcut(keyEvent("n", { shiftKey: true })), null);
    assert.equal(classifyExamShortcut(keyEvent("n", { ctrlKey: true })), null);
    assert.equal(classifyExamShortcut(keyEvent("n", { altKey: true })), null);
    assert.equal(classifyExamShortcut(keyEvent("n", { repeat: true })), null);
    assert.equal(classifyExamShortcut(keyEvent("n", { isComposing: true })), null);
    assert.equal(classifyExamShortcut(keyEvent("n", { defaultPrevented: true })), null);
    assert.equal(classifyExamShortcut(keyEvent("n"), { activeDialog: true }), null);
    const inDialog = { tagName: "BUTTON", closest: (selector) => selector === "dialog[open]" ? {} : null };
    assert.equal(classifyExamShortcut(keyEvent("n", { target: inDialog })), null);
    assert.equal(classifyExamShortcut(keyEvent("Enter", { ctrlKey: true, shiftKey: true })), null);
  });

  it("dispatches only accepted actions and leaves Escape and native keys to the browser", () => {
    const listeners = new Map();
    let dialogOpen = false;
    const root = {
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type),
      querySelector: () => dialogOpen ? {} : null,
    };
    const calls = [];
    const detach = attachExamShortcuts(root, {
      next: () => calls.push("next"),
      previous: () => calls.push("previous"),
      selectOption: (index) => calls.push(`option:${index + 1}`),
      mark: () => calls.push("mark"),
      openNavigator: () => calls.push("navigator"),
      openHelp: () => calls.push("help"),
      openSubmit: () => calls.push("submit"),
    });
    const dispatch = (event) => listeners.get("keydown")(event);

    for (const [key, expected] of [["n", "next"], ["p", "previous"], ["4", "option:4"],
      ["m", "mark"], ["g", "navigator"], ["?", "help"], ["Enter", "submit"]]) {
      const event = keyEvent(key, { ...(key === "Enter" ? { ctrlKey: true } : {}) });
      dispatch(event);
      assert.equal(event.defaultPrevented, true);
      assert.equal(calls.at(-1), expected);
    }
    const escape = keyEvent("Escape");
    dispatch(escape);
    assert.equal(escape.defaultPrevented, false);
    const arrow = keyEvent("ArrowDown", { target: { tagName: "INPUT", closest: () => null } });
    dispatch(arrow);
    assert.equal(arrow.defaultPrevented, false);
    const inDialog = keyEvent("n");
    dialogOpen = true;
    dispatch(inDialog);
    assert.equal(inDialog.defaultPrevented, false);
    assert.equal(calls.length, 7);

    detach();
    assert.equal(listeners.has("keydown"), false);
  });
});
