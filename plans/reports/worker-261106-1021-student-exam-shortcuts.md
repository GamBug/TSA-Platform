# Student exam modernization and shortcuts

Status: DONE for implementation and focused checks; ready for the controller's Chromium and Firefox runs.

## Delivered

- Added a responsive exam sidebar with timer, completion progress, submit action, question grid, and a visible text-and-symbol status legend. On mobile, the question grid is inside a collapsed native disclosure; timer, progress, and submit stay visible.
- Added safe N/P/M/G/?/Escape/Ctrl+Enter shortcuts and an accessible help dialog with focus restoration. Number keys select the indexed option for the current single-choice or multiple-choice question; multiple-choice uses the existing staging/save path. True/false statements retain their native controls.
- Shortcut handling also ignores custom math editors, `[data-math-input]`, comboboxes, spinbuttons, and editable controls found along a composed event path.
- Shortcut handling is statically imported and synchronously attached after each exam render, avoiding a window where navigation redraws temporarily lose the listener.
- Added shared Chromium/Firefox journey coverage for navigation, marking, dialogs, focus restoration, native-control exclusions, option selection/toggling, submission guards, and true/false exclusion.
- Preserved the existing controller edits and did not start browser or server processes.

## Files

- `apps/practice-prototype/public/app/main.js` — exam rendering and shortcut wiring only.
- `apps/practice-prototype/public/styles.css` — exam-specific layout and responsive styles.
- `apps/practice-prototype/public/app/exam-shortcuts.js` — shortcut classification and dispatch.
- `apps/practice-prototype/test/exam-shortcuts.test.mjs` — helper semantics tests.
- `scripts/student-exam-shortcuts-journey.mjs` — shared browser journey.
- `scripts/verify-student-browser.mjs` and `scripts/verify-student-firefox.mjs` — wired Chromium and Firefox scenarios.

## Verification

- `node --test apps/practice-prototype/test/exam-shortcuts.test.mjs` — 5 passed.
- `node --check` on `main.js`, the shortcut module/test, shared journey, and both browser scripts — passed.
- `git diff --check` — passed.
- Browser journeys were not run here to avoid competing with the controller's planned Chromium/Firefox runs. No browser services were started.

## Recommendation

Use the current Codex model with high reasoning if selectable for this UI and lifecycle integration; use a separate read-only reviewer after the controller's browser evidence. Model availability and quota are unverified.

## Concerns

- The controller must include the existing full keyboard/domains/Firefox runs and review the captured responsive behavior; this worker did not execute browser journeys.
- Node emits a non-failing module-type warning when importing the browser `.js` helper in the focused test. Browser delivery uses the already-registered module asset; no package metadata was changed.
