const EDITABLE_TARGET = 'input, textarea, select, math-field, [data-math-input], [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"]';

function isEditableTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select"
    || tagName === "math-field"
    || target?.isContentEditable === true
    || target?.closest?.(EDITABLE_TARGET) != null;
}

function eventTargetsEditableControl(event) {
  if (isEditableTarget(event.target)) return true;
  return typeof event.composedPath === "function" && event.composedPath().some(isEditableTarget);
}

export function classifyExamShortcut(event, { activeDialog = false, characterShortcutsEnabled = true } = {}) {
  if (!event || event.defaultPrevented || event.isComposing || event.repeat || eventTargetsEditableControl(event)) return null;
  if (event.key === "Escape") return { type: "escape" };
  if (activeDialog || event.target?.closest?.("dialog[open]") != null) return null;

  if (event.key === "Enter" && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    return { type: "submit" };
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (!characterShortcutsEnabled) return null;
  if (event.key === "?") return { type: "help" };
  if (event.shiftKey) return null;

  const key = event.key.toLowerCase();
  if (key === "n") return { type: "next" };
  if (key === "p") return { type: "previous" };
  if (key === "m") return { type: "mark" };
  if (key === "g") return { type: "navigator" };
  if (/^[1-9]$/.test(event.key)) return { type: "option", index: Number(event.key) - 1 };
  return null;
}

export function attachExamShortcuts(root, actions) {
  const handleKeydown = (event) => {
    const action = classifyExamShortcut(event, {
      activeDialog: Boolean(root.querySelector("dialog[open]")),
      characterShortcutsEnabled: actions.characterShortcutsEnabled?.() !== false,
    });
    if (!action || action.type === "escape") return;

    event.preventDefault();
    if (action.type === "next") actions.next?.();
    else if (action.type === "previous") actions.previous?.();
    else if (action.type === "option") actions.selectOption?.(action.index);
    else if (action.type === "mark") actions.mark?.();
    else if (action.type === "navigator") actions.openNavigator?.();
    else if (action.type === "help") actions.openHelp?.();
    else if (action.type === "submit") actions.openSubmit?.();
  };
  root.addEventListener("keydown", handleKeydown);
  return () => root.removeEventListener("keydown", handleKeydown);
}
