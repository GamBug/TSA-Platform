# Full QA run — summary for the owner

**HIGH and CRITICAL findings need re-checking by the owner or a stronger model before acting.** The tester was Haiku 5.5, and this summary only reads the six phase reports. It re-tests nothing.

## 1. Overall state

All seven phases are recorded. Phases 1 to 6 are DONE, and this phase (7) is DONE. The run recorded 29 findings: 0 CRITICAL, 2 HIGH, 12 MEDIUM and 15 LOW. Of these, 23 were REPRODUCED and 6 are SUSPECTED (F-02-02, F-02-07, F-05-04, F-05-05, F-05-06, F-06-02). The two HIGH findings are both in the data phase: confirmed exact-twin questions still served as pairs, and a refused move that left a stray version behind. Baseline and regression suites mostly pass. The known failures are still there: the `docs:check` and `test:docs` failures (phase 1, unchanged), and the `test:demo:public` / public-mode `blueprintVersionId` TypeError (phases 3 and 6, unchanged). `test:local` fails 3 of 119 tests in two runs. Those are the public-mode failure plus a suspected race in the Postgres check (F-06-02). Several checks are NOT RUN, listed in section 4.

## 2. Findings, CRITICAL first

| ID | Severity | Status | Title | Report |
|---|---|---|---|---|
| F-04-01 | HIGH | REPRODUCED | Confirmed exact twins are still served as pairs in Math and Reading (270 groups) | [phase-04-data.md](phase-04-data.md) |
| F-04-03 | HIGH | REPRODUCED | A refused move leaves a stray IN_REVIEW version; the dry run promised a different result | [phase-04-data.md](phase-04-data.md) |
| F-02-01 | MEDIUM | REPRODUCED | Science questions scroll sideways on a 360 px phone | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-02 | MEDIUM | SUSPECTED | Real-pool browser closes mid-journey | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-05 | MEDIUM | REPRODUCED | Phone: first screen of a practice section is the grid, question above the viewport | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-07 | MEDIUM | SUSPECTED | Some Science figure images fail to load (one scan) | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-08 | MEDIUM | REPRODUCED | Keyboard Tab and Space do not work on single-choice practice questions | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-10 | MEDIUM | REPRODUCED | Literal `\italic{` in a Reading passage shown to students | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-12 | MEDIUM | REPRODUCED | Space in the full simulation saves the answer but moves focus to the page body | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-13 | MEDIUM | REPRODUCED | On a 390 px phone, the full simulation's section clocks are cut short | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-03-01 | MEDIUM | REPRODUCED | Student app and API send no framing or content-security headers | [phase-03-security.md](phase-03-security.md) |
| F-03-02 | MEDIUM | REPRODUCED | Figure upload is capped at about 1 MiB of body, not 2 MiB | [phase-03-security.md](phase-03-security.md) |
| F-05-05 | MEDIUM | SUSPECTED | Rights record depends only on the batch-id prefix | [phase-05-ai-generation.md](phase-05-ai-generation.md) |
| F-06-02 | MEDIUM | SUSPECTED | Postgres check after the public launcher stops fails in two of two runs | [phase-06-regression.md](phase-06-regression.md) |
| F-01-01 | LOW | REPRODUCED | Typecheck fails on three type errors in a contracts test file | [phase-01-baseline.md](phase-01-baseline.md) |
| F-02-03 | LOW | REPRODUCED | English notice on the student start page | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-04 | LOW | REPRODUCED | Admin list previews show raw TeX delimiters | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-06 | LOW | REPRODUCED | Phone submit button wraps | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-09 | LOW | REPRODUCED | Console 401 errors when the full-test page is opened directly | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-11 | LOW | REPRODUCED | Reload in the full simulation returns the student to question 1 | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-02-14 | LOW | REPRODUCED | Navigation and flag controls are 40 to 41 px tall, under the 44 px target | [phase-02-ui-ux.md](phase-02-ui-ux.md) |
| F-04-04 | LOW | REPRODUCED | Misleading or unclear messages (stored withhold reason says "by the owner" on a QA check) | [phase-04-data.md](phase-04-data.md) |
| F-04-05 | LOW | REPRODUCED | Figure decode failure gives no cause | [phase-04-data.md](phase-04-data.md) |
| F-05-01 | LOW | REPRODUCED | README gives a wrong instruction size | [phase-05-ai-generation.md](phase-05-ai-generation.md) |
| F-05-02 | LOW | REPRODUCED | README gives the wrong number of Project files | [phase-05-ai-generation.md](phase-05-ai-generation.md) |
| F-05-03 | LOW | REPRODUCED | Topic codes are not checked, and one example uses a code outside the list | [phase-05-ai-generation.md](phase-05-ai-generation.md) |
| F-05-04 | LOW | SUSPECTED | Backslash convention differs between the subject files | [phase-05-ai-generation.md](phase-05-ai-generation.md) |
| F-05-06 | LOW | SUSPECTED | Bank versions contain `\overrightarrow`, which the current rule refuses | [phase-05-ai-generation.md](phase-05-ai-generation.md) |
| F-05-07 | LOW | REPRODUCED | Stored rejection notes use older wording than the current inbox | [phase-05-ai-generation.md](phase-05-ai-generation.md) |

No finding is CRITICAL. The HIGH rating for F-04-01 and F-04-03 is the tester's; the owner should confirm it. F-03-01 may deserve HIGH, as the phase 3 report notes.

## 3. Top five things to fix first

1. **F-04-01 (HIGH): confirmed exact twins are served as pairs.** The inventory found 270 same-section groups with two served copies: 170 in Math and 100 in Reading. A student may see the same question twice in one section. Whether a single test can draw both copies is SUSPECTED and has not been tested.
2. **F-04-03 (HIGH): a refused move leaves a stray version.** One confirm attempt wrote an IN_REVIEW row and then refused the move. The dry run had promised a different result. This is a write that persisted after the command failed, which is a data-integrity risk on the Bank. The stray is not served.
3. **F-03-01 (MEDIUM, owner may rate HIGH): no framing or content-security headers.** The student app and the API send no `Content-Security-Policy` and no `X-Frame-Options` or `frame-ancestors`. The admin page is loopback-only, so the exposure is the public student app and API.
4. **F-02-01 (MEDIUM): Science text runs off a 360 px phone screen.** Words are cut off at the right edge on question 33 of a Science passage. This was reproduced in two runs, and the screenshot was viewed.
5. **F-02-08 (MEDIUM): keyboard users cannot answer single-choice practice questions.** Tab does not reach the answer radios, and Space does not check them. The phone keyboard check also failed. The full simulation works by keyboard, so the gap is in section practice. This is an accessibility barrier.

Next in line: F-02-05 (phone practice opens on the grid, not the question) and F-02-02 (the real-pool browser closing mid-run, which could be a stall in the test or in the app; not established).

## 4. NOT RUN, with reasons

- **Phase 2, UI/UX:**
  - Numeric, cloze and matching questions by hand (2.2). The served pools contain only single-choice, multiple-choice and true-false questions, so there is nothing to answer.
  - Angles in the student app (2.4). Angle items are NUMERIC_RESPONSE and CLOZE, and none is served.
  - Per-question review of the full test (2.3). The full-test result has no review control.
  - The 60/30/60 run by hand, as last recorded in the phase 2 report.
  - The three phase 6 student suites with numeric, cloze-matching and images run on disposable fixtures, so they do not close these items.
- **Phase 3, security:**
  - 3.9 explanations after release: needs the owner to release explanations.
  - 3.11 public-mode admin absence: public mode refuses to start without `DEMO_UNI_SOURCE_CREDIT`. This is a setting the plan does not include, so the check was not run.
  - 3.12 secret scan in tracked files: the QA guard refused the `git grep` command because it names an API key pattern.
- **Phase 4, data:**
  - 4.13 literal case (a move onto an identical question in the target section must be refused before any write). No identical question exists in SCIENCE for the tested question, so the literal case was not run.
  - One link check in 4.5, from an image block to an active asset.
- **Phase 5, AI generation:**
  - 5.1 real OpenAI call: no key, and none was used.
  - ChatGPT output tests: no ChatGPT access in this run.
- **Phase 6, regression:**
  - `test:topics*` (optional): topic practice is paused on purpose.

## 5. Questions for the owner

1. Is the known `test:demo:public` / public-mode failure acceptable for the public launch, or should it block the launch? It has been unchanged since phase 1.
2. Should F-04-01 (served twins) be treated as a launch blocker, and should the pair adjudication come first?
3. Should F-03-01 (no framing or CSP headers) be rated HIGH rather than MEDIUM?
4. Should item 3.11 run in a later session with `DEMO_UNI_SOURCE_CREDIT` set? The plan does not include that setting.
5. Should the secret-scan check (3.12) use a pattern that does not name the OpenAI key variable, or stay NOT RUN?
6. Is keyboard-only answering in section practice (F-02-08) a launch requirement? Are the English start-page notice (F-02-03) and the full-simulation focus and clock issues (F-02-12, F-02-13) intended?
7. The phase 2 report header still says PARTIAL, but STATUS.md records phase 2 as DONE after the owner's sessions. Please confirm phase 2 is closed.
