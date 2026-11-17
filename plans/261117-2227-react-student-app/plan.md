# React student app from the Figma design

Status: DONE (first version) · owner decides when to retire the old student app · Owner decision 2026-11-17 (chat): rebuild the student experience as a React app using the
owner's Figma Make export (`TSA_Figma_UIUX/Define TSA Practice Visual System.zip`) as the visual and component base,
connected to the existing local API. An earlier CSS-only restyle was rolled back at the owner's request.

## Outcome

Students use a new React app for section practice, full simulation, numeric answers and cloze/matching, with
drag-and-drop answering for cloze and matching. It talks to the existing server APIs only; grading, timers, saving,
release rules and question formats stay server-owned and unchanged.

## Scope

- In: login with local demo accounts; section catalog (v1), numeric practice (v2), cloze/matching practice (v4),
  full simulation (v3); question screen for single choice, true/false groups, numeric, cloze, matching, passages,
  math and inspected images; save with revisions, server clock, navigator, flag, submit, result counts, released
  review; drag-and-drop for cloze blanks and matching rows with keyboard and tap fallbacks.
- Out (first version): topic practice (stays in the old app), staff screens, new question types, any API or
  contract change, removal of the old student app.

## Constraints

- No API, schema or question-format change. Reuse `apps/practice-prototype/public/app/persistent-api.js` for v1/v2/v4.
- No runtime third-party requests: fonts are bundled locally (OFL), no Google Fonts or analytics from the Figma
  scaffold. The demo server serves only files from the built `dist/` allowlist.
- Keys and explanations appear only after the server releases them, exactly as today.
- Unofficial-practice and non-affiliation notices stay visible on catalog and result pages.
- The old app keeps working at its current URLs until the new app passes the same browser journeys.

## Progress

- Phase 1 done (`dcb791f`). Phases 2, 3 and 5 done: verified against the rehearsal demo (Math, Reading, Science,
  numeric) and the synthetic cloze/matching fixture, desktop and mobile, including drag, tap and list matching.
- Phases 4 and 6 done: full simulation (6/100 with 3/40, 2/20, 1/40 on desktop and mobile), automated browser
  check `npm run test:student-web:browser`, launcher prints the new links, guide `docs/guides/STUDENT_WEB_APP.md`.
- Follow-ups: add cloze/matching (and drag-and-drop) to the automated browser check; topic practice; retiring the
  old student app is an owner decision.
- Cloze questions are typed answers with no word list in the question format, so drag-and-drop applies to matching
  only; a cloze word bank would be a format change and is out of scope.

## Phases

| # | Phase | Done when |
|---|-------|-----------|
| 1 | Scaffold `apps/candidate-web` (React 19, Vite, TypeScript, Tailwind v4) from the Figma tokens and components; local fonts; build to `dist/`; demo server serves it at `/student/` | Build and typecheck pass; server test covers the allowlist; page renders on the demo |
| 2 | Session and catalog: login with demo accounts, logout, section catalog with notices; links for numeric, cloze/matching and simulation modes | Login and catalog work against the rehearsal demo |
| 3 | Practice attempt: create/start, question renderer (all current types, passages, math, images), save with revision and error states, server clock, navigator, flag, submit, result, review | A section practice runs end to end with correct counts |
| 4 | Full simulation (v3): three section clocks, switcher, read-only expiry, submit all, per-section and total counts | Same checks as `verify-uni-demo-browser` simulation step |
| 5 | Drag-and-drop for cloze and matching, with keyboard and tap fallbacks | Answers saved by drag equal those saved by select/input |
| 6 | Browser journeys for the new app, demo launcher prints its URLs, docs and project state | New journeys and existing suites pass; owner decides when to retire the old student app |

## Risks

- The Figma components assume local fake data; each screen must be rewired to real API states (loading, errors,
  expired, conflicts), which is most of the work.
- Adding a build step: the demo must build `candidate-web` before serving; a missing build shows a clear message.
- `test:b0:browser` already fails "footer reaches viewport bottom" on the old app; unrelated to this plan.

## Rollback

The old app is untouched; remove the `/student/` route and the `apps/candidate-web` folder.
