# Phase 02 report — UI/UX (student app and admin page)

- Date and time (Asia/Bangkok): 2026-11-23. Session 1 from 15:24 to about 17:00 (unattended runner). Session 3 (this report's latest pass) from about 17:00 to about 17:40.
- Tester: Claude Code, Haiku 5.5
- Worktree commit (`git log --oneline -1`): ce03060 docs(plans): describe the unattended runner for the tester session (HEAD at the start of session 3; the worktree was not changed by the tester)
- Phase status: PARTIAL. Session 13 (see "Session 13" below) measured tap targets at both sizes (2.6): option cards pass the 44 px rule; the question grid and navigation controls are 40 to 41 px (F-02-14, LOW). Session 11 (see "Session 11" below) ran the phone keyboard check (2.7): FAIL, the same as desktop (F-02-08). Session 9 (see "Session 9" below) walked the full simulation by hand at both sizes, checked keyboard use there, and recorded F-02-11, F-02-12 and F-02-13. Session 8 (see "Session 8" below) completed the F-02-02 two-viewport rerun with no browser-closed error, and an automated full 40/20/40 run on both viewports; F-02-01 reproduced again. Session 7 closed 2.10 and 2.11 at phone size (both PASS). Still open: numeric, cloze and matching by hand and student-app angles (not served by the demo pools), a full 40/20/40 and 60/30/60 run to the end, and the F-02-02 two-viewport rerun (stalled in sessions 4 and 5; not repeated in session 7). Earlier wording follows. Session 5 added: all section scans at desktop and phone, admin filters, F-02-10, and the F-02-02 reruns, which did not finish). What is left is listed under "Not run" and in "Session 5". Session 3 added evidence for 2.2, 2.3, 2.5, 2.7 (Escape and keyboard), 2.8 (sign-out), 2.9, 2.10 (all check buttons) and 2.11 (inbox check). Two new findings came out of it (F-02-07 suspected, F-02-08 reproduced in practice mode), plus F-02-09 (console 401s).

Session 3 scripts are in `scratch/` (`phase2-admin-checks.mjs`, `phase2-admin-actions.mjs`, `phase2-student-checks.mjs`, `phase2-probe-keyboard-full.mjs`, `phase2-tab-by-section.mjs`, `phase2-tab-probe-by-type.mjs`, `phase2-tab-control.mjs`). Their logs are in `reports/run-logs/` (files starting `2C-`, `2D-`, `2E-`).

## Results by checklist item

| Item | Result | Evidence |
|---|---|---|
| A1 `npm run test:student-web:browser` | PASS | Session 1: exit 0, `"status": "PASS"`; desktop and mobile section practice 40/40; full simulation 6/100. Log `reports/run-logs/2A-student-web-browser.log`. |
| A2 `npm run test:demo:uni:browser` | PASS | Session 1: exit 0, `"status": "PASS"`; published MATH 105, READING 50, SCIENCE 100; `"listening": false`. Log `reports/run-logs/2A-demo-uni-browser.log`. Screenshots went to `/tmp/tsa-uni-demo-evidence/` (outside the worktree). |
| A3 `npm run test:real-pool:browser` | FAIL (phone run) / UNRESOLVED (browser closed) | Session 1 phone-only run: `NPM_EXIT_CODE=1`, `FAIL: defects or page problems found`, defect F-02-01. Full runs 1 and 2 ended with `Target page, context or browser has been closed` (F-02-02). The session 3 desktop-only rerun is described under F-02-02. |
| 2.1 Start screen | FAIL (LOW) | Layout clean at 1440 and 390 px (session 1). The notice still reads English in session 3: "Nguồn nội dung: Questions collected from public online sources, used non-profit." (seen on the full-test entry at desktop and phone). F-02-03. |
| 2.2 Section practice and tests | PARTIAL | Math practice (session 1): answer saved, flag, Next, jump, Previous and reload kept `Đã làm 1/40`. Session 3, full test at both sizes: the entry shows Math 40 câu · 60 phút, Reading 20 câu · 30 phút, Science 40 câu · 60 phút (screenshot `full-test-entry-desktop.png`). "Giữ chỗ bài thi thử (100 câu)" reserves the test, "Bắt đầu bài thi thử" starts it, and the clocks start at 60:00 / 30:00 / 60:00 (desktop shows 59:57 running with Reading 30:00 and Science 60:00, `full-test-after-click-desktop.png`; phone shows 58:58 / 30:00 / 60:00, `full-test-first-phone.png`). One answer on desktop gives `Đã làm 1/100`. Six desktop questions were read: single-choice and true/false (`2D`/`full` run). Numeric, cloze and matching were not reached by hand. |
| 2.3 Submit, result and review | PASS (review page reached) | Session 1: confirmation dialog in Vietnamese; the result page says "Số câu đúng 0 /40" and "Đây không phải điểm TSA chính thức". Session 3: a Reading practice attempt submitted at both sizes shows `Số câu đúng 0 /20` (desktop) and `1 /20` (phone); the review page "Rà soát câu hỏi" lists 20 items (desktop, "Chưa đúng (20)") and 20 items (phone, "Chưa đúng (19)", "Tất cả (20)"). The phone review shows "Bài làm" (the student's answer) and "Đáp án" with the explanation after submit. Screenshots `result-reading-*.png`, `review-reading-*.png`. |
| 2.4 Math display | PARTIAL | Session 1: student question and admin panel render math (KaTeX present). Session 3: admin panel for `\prime`, `\widehat`, `\vec` searches renders KaTeX (13 `.katex` nodes in the panel for the first item). Admin list previews show raw TeX (F-02-04). Angles and vector arrows in the student app were not checked one by one. Session 13: the saved 100-question pool (`.local/public-launch-qa/real-pool/desktop-1280.json`, run of 19:58) has no `\widehat` and no `\overrightarrow` in any question, so the student-app angle and vector check stays NOT RUN. |
| 2.5 Figures | PARTIAL, PASS on the checks run | Session 3, Science scans: desktop 13 of 13 figure blocks loaded and phone 24 of 24 loaded in the later scans; "Phóng to" opens a native `<dialog>` (`dialog[open]` count 1) and Escape closes it (count 0) at both sizes. Figure `alt` text is present on the loaded images. One earlier desktop scan saw 3 asset requests return 404 and 13 blocks fall back to alt text (F-02-07, suspected). |
| 2.6 Layout | PARTIAL, FAIL on phone | Phone start page: no overflow (scrollWidth 390 = clientWidth 390), guest button 44 px tall (session 1). Phone practice first screen: the question sits above the viewport and the grid fills the screen (F-02-05, session 1). Phone full test (session 3): the question and options are on the first screen (`full-test-first-phone.png`); horizontal overflow was not measured on this view; "Nộp cả bài" wraps to two lines (F-02-06, `full-test-first-phone.png`). Science questions 20–22 at 360 px scroll sideways by 44 px (F-02-01, session 1 only). Session 13 tap-target check: option cards 58 px tall at 1440 and 390 px (pass); question-grid buttons 41 px, panel toggle, flag and mode links 40 px at 1440, flag 40 px at 390 (F-02-14, LOW, measured twice). |
| 2.7 Keyboard and accessibility | FAIL (keyboard), PARTIAL | Escape closes the zoom dialog at both sizes (PASS). Keyboard use of the answer controls fails in practice mode at 1440 px and at 390 px (session 11): Tab stays on the flag button and Space does not check a radio (F-02-08). Admin page labels PASS at both sizes (session 12: 0 unnamed buttons, 0 unlabelled inputs, 0 images without alt) and admin Tab order shows a visible outline (sample of 12 presses). Student-app label audit was done in session 5. |
| 2.8 Admin sign-in and sign-out | PASS | Session 1: wrong password shows "Wrong username or password."; right password opens the workspace. Session 3: sign-out pressed; the login form returns and the workspace is gone (`2C-admin-checks.log`, `sign-out`: `loginFormShown` 1, `workspaceShown` 0). Admin page checked on desktop only. |
| 2.9 All questions | PARTIAL | Counts table: Math DRAFT 157 / APPROVED 454 / QUARANTINED 5; Reading 9 / 200 / 0; Science 26 / 195 / 0; total "1046 question versions". Section filter Reading gives 209 of 1046 (matches 9 + 200). Search `\prime` gives 27 of 1046. Next page changes the first row. Panel shows the question, answer state and taxonomy, and the math renders. The answer-key label was not found by the testid in the panel. State filter options: All states, DRAFT, IN_REVIEW, APPROVED, REJECTED, QUARANTINED, RETIRED. Individual filter results were not checked one by one. |
| 2.10 Change status or section (check buttons only) | PASS (no Confirm pressed) | Session 3 (`2C-admin-actions-rerun2.log`): Publish on a DRAFT question prints "Finished. Question version f5fea077…: MATH, DRAFT … Dry run only. To apply, run again with --confirm \"PUBLISH f5fea077\"." Withhold with a reason prints "Dry run only … --confirm \"WITHHOLD f5fea077\"". Restore on a QUARANTINED question prints "Restore (publish again) … Dry run only. To apply, run again with --confirm \"RESTORE a86a3b55\"". Move to Reading prints "Add a new version in READING … Dry run only. To apply, run again with --confirm \"MOVE f5fea077 TO READING\"". The Confirm button appeared after each check and was never pressed. |
| 2.11 Import and publish (inbox check only) | PASS for the check; import not pressed | Session 1: inbox tab shows "Math: 0 waiting · 0 figure(s) · 6 imported · 6 rejected", and rejected rows read "0/2 figures added". Session 3: "Check the inbox" prints "The inbox is empty. Paste ChatGPT answers into …/question-inbox/math, …/reading, …/science." No Import button appeared. Nothing was imported or published. |
| 2.12 AI questions tab without a key | PASS (content check partial) | Session 1: "No API key: use a ChatGPT Project in the browser" and the three-Project steps. Not compared line by line with `docs/guides/chatgpt-projects/`. |

## Findings

### F-02-01 Science questions scroll sideways on a 360 px phone

- Severity: MEDIUM
- Status: REPRODUCED (twice): session 1 phone-only run (Science 20–22) and session 8 two-viewport rerun (Science 31–33, see "Session 8" below). Same message in both runs, different questions, because each guest draws a random question set.
- Where: real-pool browser check, phone-360 journey, Science questions 20–22 (session 1) and 31–33 (session 8) (`scripts/verify-real-pool-browser.mjs`, run with `REAL_POOL_VIEWPORT=phone`)
- Steps to reproduce: `REAL_POOL_VIEWPORT=phone npm run test:real-pool:browser`, then read the phone journey JSON, `defects`.
- Expected: no horizontal page scroll on a 360 px phone.
- Actual (log `reports/run-logs/2A-real-pool-phone-only.log`):
  ```
  "science 20: page scrolls sideways by 44px (section.bg-paper-sheet … x right=404; div.min-w-0 [overflow-wrap:anywhere] … right=383; p.whitespace-pre-wrap … right=383)"
  ```
  The same message repeats for science 21 and 22.
- Notes: a student would see the page slide sideways on those questions. No screenshot was taken by the script at this point.

### F-02-02 Real-pool browser closes mid-journey

- Severity: MEDIUM
- Status: SUSPECTED (two full runs in session 1, the phone-only run did not fail; a session 3 desktop-only rerun is pending the result below)
- Where: `scripts/verify-real-pool-browser.mjs:140` (`await page.evaluate(() => window.scrollTo(0, 0))` inside `journey`, called from line 205 for each viewport).
- Steps to reproduce: run `npm run test:real-pool:browser` (both viewports). Runs 1 and 2 failed with `page.evaluate: Target page, context or browser has been closed`. The phone-only run did not fail.
- Expected: the journey finishes both viewports.
- Actual: the error stops the script. The real exit code of runs 1 and 2 is unknown, because the background wrapper stopped before writing it. Run 2's desktop journey had `"defects": []` and `"problems": []`.
- Session 3 check: memory was not exhausted when read after the crash (free: 9.6 GB available of 15 GB). That does not show what happened during the runs. Session 3 desktop-only rerun (`REAL_POOL_VIEWPORT=desktop npm run test:real-pool:browser`, log `reports/run-logs/2E-real-pool-desktop-only.log`): `"defects": []`, `"problems": []`, `PASS: no defects or page problems`, `NPM_EXIT_CODE=0`, no browser-closed error. One clean run does not show the cause; the crash was seen in two earlier full runs, and the phone-only run never failed.
- Notes: another runner in the same worktree at 16:22 reported a different failure (a click on a `disabled` radio `tf-*-true`, `reports/run-logs/2A-real-pool-browser-run3.log`). That is not this phase's failure.

### F-02-03 English notice on the student start page

- Severity: LOW
- Status: REPRODUCED (session 1 probe; session 3 full-test entry at desktop and phone shows the same English line)
- Where: student start page and full-test entry, notice list, `demo-notice-source`. The text comes from the default of `DEMO_UNI_SOURCE_CREDIT` in the `start` script in `package.json`.
- Steps to reproduce: `npm start`, open `http://127.0.0.1:4180/student/`, or open the full-test entry.
- Expected: Vietnamese student-facing text only.
- Actual: "Nguồn nội dung: Questions collected from public online sources, used non-profit."
- Notes: the owner can change the credit with `DEMO_UNI_SOURCE_CREDIT`. Whether the public launch uses the same default was not checked.

### F-02-04 Admin list previews show raw TeX delimiters

- Severity: LOW
- Status: REPRODUCED (session 1, admin list search `\prime`, `\vec`, `widehat`)
- Where: admin page, question list items (not the open panel)
- Steps to reproduce: sign in to the admin page and read the list previews (search `\prime`).
- Expected: list previews readable without `$` and `\` commands.
- Actual: previews show e.g. `$d\ne0$`, `$\overrightarrow{AM}$`, `$\vec u=(2;-2;1)$` as plain text. The open panel renders the math correctly.
- Notes: admin-only. Students do not see the list.

### F-02-05 Phone: first screen of a practice section is the grid, question above the viewport

- Severity: MEDIUM
- Status: REPRODUCED (session 1: 3 phone runs). Not re-run in session 3. The full-test entry at phone size showed the question first (`full-test-first-phone.png`), so the problem looks specific to the section-practice entry.
- Where: student practice, phone 390×844, after Catalog → "Phần thi Toán học".
- Steps to reproduce: open `http://127.0.0.1:4180/student/`, press "Thi từng phần", press "Bắt đầu luyện tập", press the Math start card, read the first screen.
- Expected: the question text and options are the first thing a student sees.
- Actual: `scrollY` 639, question title `top: -469, bottom: -414` (outside the viewport). The question grid "Bảng câu hỏi" fills the screen. Screenshot: `reports/screens/phase-02/practice-first-viewport-phone.png`.
- Notes: the likely cause is that the page keeps the catalog's scroll position when the question loads. This is confusing, not a blocker. The cause was not confirmed.

### F-02-06 Phone submit button wraps

- Severity: LOW
- Status: REPRODUCED (session 1 section practice; session 3 full-test header at 390 px; session 9 simulation header at 390 px, "Nộp cả / bài")
- Where: student header, phone 390 px: "Nộp bài" in section practice and "Nộp cả bài" in the full test.
- Steps: start a section or the full test on a 390 px phone.
- Expected: the button label on one line.
- Actual: "Nộp / bài" and "Nộp cả / bài" on two lines (`practice-first-viewport-phone.png`, `full-test-first-phone.png`).

### F-02-07 Some Science figure images fail to load (one scan)

- Severity: MEDIUM
- Status: SUSPECTED. Seen once: the desktop scan at about 17:05 (`2D-student-desktop-figure-r4.log`) had 3 asset requests return 404 and 13 of 46 figure blocks fall back to the alt text. Two later scans did not show it (desktop 13 of 13 loaded, phone 24 of 24 loaded).
- Where: `/api/v1/attempts/<attempt>/assets/<asset-id>` for the Science section; the figure markup is `ContentBlocks.tsx:102–113`.
- Steps to reproduce: start Science practice as a guest, scan questions 1–40, read `figure-scan` in the log.
- Expected: every figure image loads or the page shows a clear missing-figure message.
- Actual (one scan): `figure-asset-responses` `"failedCount": 3` with 404 for three asset IDs, and the figure block shows its alt text instead of the image.
- Notes: each guest session draws a different question set, so the failing questions could not be tied to a specific question across runs. The image store under `.local/track-b-images` is content-addressed (`sha256/`), so the asset IDs cannot be matched to files from the shell. The database mapping belongs to Phase 4 (data). The alt text is long and descriptive, so a student is not blocked, but the figure is missing.

### F-02-08 Keyboard Tab and Space do not work on single-choice practice questions

- Severity: MEDIUM (accessibility barrier: a keyboard user cannot reach the answer radios by Tab)
- Status: REPRODUCED in section practice, 4 of 4 runs in session 3 (Math, Reading, Science, and Reading again), and again in session 11 at 1440 px and at 390 px (Reading, practice). Scope: practice mode only. In the full simulation, session 9 found that Tab reaches the radio and Space checks it (see F-02-12 for what happens next). The same step worked once in a reserved full test (see below), so the cause is not confirmed.
- Where: section practice, question 1 (single-choice), at 1440×900. The key handler is `apps/candidate-web/src/screens/AttemptScreen.tsx:99–113`.
- Steps to reproduce:
  1. Start a guest practice section, for example Reading: `start-READING`.
  2. Click the flag button "Đánh dấu (F)" to focus it, then press Tab three times.
  3. Focus `input[data-testid="option-A"]` directly, press Space, and read `checked`.
- Expected: Tab moves to the next control (the first radio), and Space checks the focused radio.
- Actual: `tab-path` `["BUTTON[flag-toggle]","BUTTON[flag-toggle]","BUTTON[flag-toggle]"]` in Math, Reading and Science (`2D-tab-section-*.log`). Space: `"checked": false` and `"save": "Chưa có câu trả lời được lưu"` (`2D-probe-keyboard-r2.log`).
- Control: in plain HTML under the same Chromium, Tab moves focus (`plain-html-tab` path `r1, b, BODY, a`) and Space checks a radio (`plain-html-space-radio` `checked: true`) (`2D-tab-control.log`). So the browser is not the cause.
- Notes: the key handler calls `event.preventDefault()` at `AttemptScreen.tsx:111`. For a single-choice question it reaches that line for any key that matches no option letter, because the single-choice branch at line 107 does not return. That would explain the result. It does not explain why the same step worked on the first question of a reserved full test (`2D-tab-by-type.log`: Tab from the flag button moved to `INPUT[option-A]`). This needs a review by the owner or a stronger model. Letter keys (A–D, N, P, F) are the handler's shortcuts; I did not run them.

### F-02-09 Console 401 errors when the full-test page is opened directly

- Severity: LOW
- Status: REPRODUCED (desktop 2 runs, phone 1 run; session 9 again on the full simulation path, desktop and phone)
- Where: `?mode=simulation` after pressing the "Thi thử đầy đủ" mode button without a guest start; API `GET /api/v3/catalog` and `GET /api/v3/attempts`.
- Steps to reproduce: open `http://127.0.0.1:4180/student/`, press "Thi thử đầy đủ", read the browser's console and the response log.
- Expected: no 401 errors on the page, or a clear message that a guest session is needed.
- Actual: `"badResponses": ["401 GET /api/v3/catalog", "401 GET /api/v3/attempts"]`, and "Failed to load resource: the server responded with a status of 401 (Unauthorized)" in the console. The reservation still works after the guest start is not clicked (`full-test-reserved-desktop.png`), so the student is not blocked.
- Notes: the 401s do not appear on the section-practice path, where guest start is clicked first (no page errors in the review and keyboard runs).

## Session 4 (about 17:47 to 18:10, Asia/Bangkok)

- 2.8 admin at phone size (390x844, `scratch/phase2-admin-phone.mjs`, log `reports/run-logs/2G-admin-phone.log`): PASS. The wrong password shows the error message, the right password opens the workspace, sign-out returns the login form, and the page has no horizontal overflow (`scrollWidth` 390 = `clientWidth` 390 on every step).
- 2.9 admin at phone size: PARTIAL. Counts table: Math 157 / 454 / 5, Reading 9 / 200 / 0, Science 26 / 195 / 0. Section filter: Math 616 of 1046, Reading 209, Science 221 (616 + 209 + 221 = 1046). State filter: QUARANTINED 5 of 1046, IN_REVIEW 0, REJECTED 0. Search `\widehat` gives 3 of 1046. Next page changed the first row. The panel showed 13 KaTeX nodes. The answer-key testid `admin-answer-key` was not found in the panel; the screenshot shows an answer list with a marked option, but the key was not read as text.
- Screenshots (viewed at reduced resolution; the list shows the counts and filter bar, and the panel shows the question, the answer options and the explanation area): `reports/screens/phase-02/admin-all-questions-phone.png`, `admin-panel-phone.png`, `admin-login-phone.png`.
- F-02-02 two-viewport rerun (`npm run test:real-pool:browser`, log `reports/run-logs/2F-real-pool-both-rerun.log`): NOT COMPLETED. The script printed nothing for about 20 minutes. The last artifact in `.local/public-launch-qa/real-pool/` is `desktop-1280-science-4-image.png` at 17:52:02, and no process was using CPU. I sent SIGINT at about 18:07, and the script ended with `NPM_EXIT_CODE=130`. This is a new stall on the desktop journey during the Science figure scan, in the same area as F-02-02 and F-02-07. It is not the browser-closed error, and its cause was not established.

## Session 5 (about 18:09 to 19:45, Asia/Bangkok)

Scripts: `scratch/phase2-student-types.mjs` (section scans), `scratch/phase2-student-raw-markup.mjs` (Reading probe), `scratch/phase2-admin-filters.mjs` (admin filters). Logs `reports/run-logs/2H-*`, `2I-*`, `2J-*`, `2K-*`, `2L-*`, `2M-*`, `2N-*`.

- F-02-02 rerun, both viewports (`2H-real-pool-both-rerun-s5.log`): the desktop-1280 journey finished with score 21/100, `"defects": []`, `"problems": []`. The phone-360 journey was still running when my own `timeout 1500` limit sent SIGTERM at about 18:34:40. The log then shows the browser-closed error (18:34:36). That error came from my limit, so it is not evidence for the F-02-02 cause, and the wrapper wrote no exit-code line.
- F-02-02 phone-only rerun (`2I-real-pool-phone-only-s5.log`): started 18:38:34, stopped after the Science 5 image with CPU idle (0.8%) for about 10 minutes. I sent SIGINT at 18:57, and it ended with `NPM_EXIT_CODE=130` (no result). This is the third stall in the Science figure scan (sessions 4 and 5 here).
- 2.2 (desktop and phone, all questions of MATH 40, READING 20 and SCIENCE 40 walked by the grid): question types seen are single-choice, multiple-choice and true-false. Numeric, cloze and matching were not seen in any student sample (six section samples, about 200 questions). The Bank does contain them (admin filter, see 2.9), so they were NOT RUN by hand. My script could not tick true-false answers ("Clicking the checkbox did not change its state", 4 to 6 times per section); the cause is not established and may be my selector. Not reported as an app defect.
- 2.4 (math display): primes and vectors present in the student questions (KaTeX annotations, for example `\overrightarrow{AA'}=\vec a` in MATH question 23 and `\overrightarrow{AB}=\vec b` in question 2). No `\widehat` in any sampled student question, so angles were NOT RUN in the student app. The first math question screenshot (`reports/screens/phase-02/types-math-single-choice-desktop.png`, viewed) renders the logarithm `log_a √(ab)`, the superscripts and `a, b > 1` correctly. Raw `$` or `\` commands in the student text: 0 in the Math, Science and desktop Reading samples. The phone Reading sample has one new finding (F-02-10).
- 2.6 (phone, 390 px): Math, Reading and Science walked on phone. Overflow scrollWidth 390 = clientWidth 390 in all three. No overflow found in this session.
- 2.7 (label audit on the last question per section, desktop): 0 buttons without a name, 0 inputs without a label, 0 images without alt, in Math, Reading and Science (all sections also clean at phone size). Focus-ring check on Tab not conclusive. Keyboard focus defect F-02-08 is not re-tested here.
- Page errors during all six section scans: 0.
- 2.9 admin (desktop, `2N-admin-filters-desktop-s5.log`): section counts Math 616, Reading 209, Science 221 (sum 1046). Type filter: CLOZE 35, MATCHING 27, MULTIPLE_CHOICE 32, NUMERIC_RESPONSE 128, SINGLE_CHOICE 650, TRUE_FALSE_GROUP 174 (sum 1046). State filter: DRAFT 192, APPROVED 849, QUARANTINED 5, IN_REVIEW/REJECTED/RETIRED 0 (sum 1046). Paging changed the first row on each of the first three pages. The question panel showed 6 KaTeX nodes, but the answer key (`admin-answer-key`) was again not read as text; this is PARTIAL. The list previews show raw `$...$` (F-02-04 again).
- 2.8 (phone): PASS in session 4. Not repeated.
- 2.10 and 2.11 at phone size: NOT RUN in this session (time).

### F-02-10 Literal `\italic{` in a Reading passage shown to students

- Severity: MEDIUM
- Status: REPRODUCED in 2 of 6 Reading samples in this session (both at 390 px; the 4 samples without the passage did not show it). Not checked at 1440 px for the same passage.
- Where: student Reading practice, the passage shared by questions 11 to 20. The text is in the passage paragraph 7 (Vietnamese text ending `phân hủy. \italic{ (Nguồn: Dịch từ bài báo "Mực sinh học phủ bởi vi khuẩn..." ...`).
- Steps to reproduce: `node plans/261123-1449-qa-full-test/scratch/phase2-student-raw-markup.mjs phone` (walks Reading questions and prints each backslash command with its context). Repeat until the passage is drawn; the questions are drawn at random per guest.
- Expected: the source credit shown as plain italic text, or no markup.
- Actual (run `2M-raw-markup-reading-phone-s5-try-21165.log`): `{"step":"hit","question":11,"context":["ược hấp thụ bởi hydrogel sẽ bị vi khuẩn trong đó phân hủy. \\italic{ (Nguồn: Dịch từ bài báo \"Mực sinh học phủ bởi vi k"]}` and the same for questions 12 to 20. Screenshot `reports/screens/phase-02/raw-markup-reading-phone-s5.png` (viewed): the literal text `\italic{` appears on its own line after paragraph 7, before the `(Nguồn: ...)` credit.
- Notes: a student sees a LaTeX-style command and a stray brace in the passage. The cause is probably the content text itself, since the same markup is in the source text rather than a renderer error. Not yet confirmed in the Bank data; that check belongs to Phase 4.

## Not run

| Item | Why |
|---|---|
| 2.2 numeric, cloze and matching questions by hand; full 40/20/40 and 60/30/60 tests to the end | Not reached within the session. The automated runs covered 40/20/40 and single-choice, true-false and cloze types. The 60/30/60 clock start was read, not run to the end. |
| 2.4 student-app angles and vectors | Not checked by hand in session 4. |
| 2.7 labels and focus audit beyond the keyboard finding | Not audited. |
| 2.9 individual type filter and paging counts | Done in session 5 (type counts sum to 1046; paging changed the first row on three pages). Not repeated. |
| 2.10 and 2.11 at phone size | Done in session 7 (Move dry run and inbox check, both PASS). Confirm and Import were not pressed, by design. |
| F-02-02 full two-viewport rerun | Stalled and interrupted in session 4 (see above). Not completed. |
| 2.4 angles (`\widehat`) and vector arrows in the student app | Not checked one by one in the student app. Admin panel KaTeX was checked. |
| 2.7 focus outline on buttons, form labels, image alt across all questions | Not audited. |
| 2.9 individual filters (type, state results) and paging counts | Only the section filter, search, one next page and one state option were checked. |
| Admin page at phone size, 2.8 and 2.9 | Done in session 4 (sign-in, filters, panel). 2.10 and 2.11 done in session 7. |
| 2.10 Confirm for any check | Not pressed by design (phase 4 confirms changes). |
| 2.11 Import | Not pressed by design. |
| F-02-02 root cause | Not established. The session 3 desktop-only rerun passed once; a full two-viewport rerun was not done in this session. |

## Session 6 additions (19:34–19:50, Asia/Bangkok)

- 2.4 angles in the admin panel — PASS for rendering. Search `\widehat` gives 3 of 1046 versions (log reports/run-logs/2S-admin-angle-render-s6.log). The panel's KaTeX shows the hat over all three letters of ∠ABC and ∠ACB (screenshot reports/screens/phase-02/admin-widehat-row-3-desktop-s6.png, viewed).
- 2.4 angles in the student app — NOT RUN. The two APPROVED angle items are NUMERIC_RESPONSE and CLOZE, and the student section practice serves only single-choice, multiple-choice and true-false (see 2.2 below). The QUARANTINED angle item is single-choice, but it is not served either.
- 2.4 vectors in the admin panel — PASS for rendering. Search `\overrightarrow` gives 15 versions and `\vec` gives 18 (log 2R-admin-angle-vector-s6.log). The panel's KaTeX renders them (12 and 11 nodes in the first opened item).
- 2.2 numeric, cloze and matching by hand — NOT RUN, with a clear reason. Across all desktop and phone section scans (sessions 3 to 5, logs 2K and 2L) the served pools contained only single-choice, multiple-choice and true-false questions. There is no numeric, cloze or matching question to answer in the demo, so those types could not be tested by hand.
- Figure load timing (F-02-02 investigation) — the suspected stall is not in the app. Science section at 390 px, all 40 questions (log 2P-figure-timing-phone-science-s6.log): every image loaded (`allComplete: true`, `broken: 0`), page errors 0. The slowest question took 10.1 s, and the waits were 5 s per image, the same 5 s as the Playwright timeout in my own script. A probe (log 2Q-scroll-probe-science-q1-phone-s6.log) shows `scrollIntoViewIfNeeded` on the second image of Science question 1 times out at 5 s, while a native `scrollIntoView` loads the same image immediately (`loaded: true`). So the delay is in the test script's actionability wait. The 15-minute stall in the real-pool phone run (sessions 4 and 5) is still unexplained. F-02-02 stays SUSPECTED.
- 2.10 Move at phone size — PARTIAL. Searching `\prime` gives 27 of 1046 versions. Pressing Move on the first hit showed the button in a "Working… (a change can take a minute)" state, and no dry-run text appeared within 2.5 s (log 2T-admin-phone-actions-s6.log; screenshot reports/screens/phase-02/admin-move-dryrun-phone-s6.png, viewed). Confirm was not pressed. The dry-run output was not read, so the phone-size confirm phrase is not checked.
- 2.11 inbox check at phone size — PARTIAL. "Check the inbox" was pressed, and the page shows the question-inbox steps and the Math, Reading and Science counts: 157/454/5, 9/200/0, 26/195/0 (log 2T; screenshot reports/screens/phase-02/admin-inbox-phone-s6.png). My 600-character sample did not reach the inbox result text, so the result was not read. The import and publish buttons were not pressed.
- Admin phone layout — PASS for overflow: scrollWidth 390 = clientWidth 390 on the admin inbox view, and 0 page errors.

## Session 7 (about 19:41 to 19:57, Asia/Bangkok)

- 2.10 Move at phone size — PASS (dry run only). Search `\prime` gave 27 of 1046 versions. Move on the first hit printed "Finished. Dry run only. To apply, run again with --confirm \"MOVE a1eb27f6 TO READING\"." (log reports/run-logs/2U-admin-phone-actions-s7.log; screenshot reports/screens/phase-02/admin-move-dryrun-phone-s7.png). Confirm was not pressed. The session 6 gap (no result text read within 2.5 s) was a wait that was too short.
- 2.11 inbox check at phone size — PASS (check only). The first probe in this session read the page while the button still said "Working…", so it did not capture the result. The second probe waited for that state to clear (scratch/phase2-admin-phone-inbox-s7.mjs, log reports/run-logs/2V-admin-phone-inbox-s7.log). The result read: "Finished. The inbox is empty. Paste ChatGPT answers into …/question-inbox/math, …/reading, …/science." The page also still lists the earlier rejected Math files with "0/2 figures added" and similar. Import and Publish were not pressed. Screenshot reports/screens/phase-02/admin-inbox-result-phone-s7.png.
- Admin phone overflow — PASS again: scrollWidth 390 = clientWidth 390 in both probes; page errors 0.
- No new findings in this session. Demo on port 4180 (started by the tester) was stopped with SIGINT; ports 4180, 4181, 4184 and 4444 are free.

## Session 8 (about 19:42 to 20:25, Asia/Bangkok)

- F-02-02 two-viewport rerun (`npm run test:real-pool:browser`, log `reports/run-logs/2W-real-pool-both-rerun-s8.log`, ends with `NPM_EXIT_CODE=1`). Both journeys ran to the end, and the browser-closed error did not appear. The exit code 1 comes from the phone defects below, not from a crash.
  - desktop-1280: score `13/100`, 100 questions (SINGLE_CHOICE 78, MULTIPLE_CHOICE 1, TRUE_FALSE_GROUP 21), `"defects": []`, `"problems": []`, `"warnings": []`. Results JSON written at 19:58:03 (`.local/public-launch-qa/real-pool/desktop-1280.json`).
  - phone-360: score `21/100`, 100 questions (SINGLE_CHOICE 74, MULTIPLE_CHOICE 4, TRUE_FALSE_GROUP 22), `"problems": []`, and three defects, all F-02-01 (`science 31`, `science 32`, `science 33`: "page scrolls sideways by 44px"). Results JSON written at 20:23:43 (`phone-360.json`).
- Figure-scan idle period (phone): the last phone image before a gap was `phone-360-science-6-image.png` at 20:02:22, and the next artifact was at 20:17:04, with CPU at 0.7–0.8%. The run then continued without intervention and finished. This is the same kind of idle period as sessions 4 and 5, where I stopped the run after about 15 minutes. This time I waited, so the cause is still not established. F-02-02 stays SUSPECTED, with no browser-closed error in this run.
- Screenshot of the F-02-01 overflow case (viewed): `reports/screens/phase-02/real-pool-phone-science-33-overflow-s8.png` (copy of `.local/public-launch-qa/real-pool/phone-360-science-33-overflow.png`). At 360 px, the Science passage on question 33 runs past the right edge of the screen, and words are cut off at the edge (for example "Ngu…" and "chất lượ…"). The script's `right=404` value is the card's right edge, and the text reaches 383 px, so the page scrolls sideways by 44 px.
- Full 40/20/40 test end-to-end, automated: the real-pool script takes the whole test as a guest on each viewport (100 questions, submit, `#result-score` read at line 156 of `scripts/verify-real-pool-browser.mjs`). It answers the first option of every question, so the score is not a check. Marking, jumping, reload and the 60/30/60 test were not done by hand in this session.
- Raw TeX: `warnings: []` on both viewports, so the script's raw-TeX check (line 61) found none. Phone `rawTex` count 0.
- Still NOT RUN after session 8: numeric, cloze and matching by hand (the full-test kinds listed above contain none of them, so they are not served in either viewport); 2.4 angles in the student app (its angle items are NUMERIC_RESPONSE and CLOZE); 2.7 labels and focus beyond F-02-08; 60/30/60 run by hand.
- Demos: no demo of mine was started in this session. The real-pool script started and stopped its own demo. After the run, ports 4180, 4181, 4184 and 4444 had no listener (`ss -ltnp`), and no `verify-real-pool` process was left.

## Things that work well

- Guest start, section practice, flag, navigation and reload persistence (answer kept after reload) work on desktop and phone (session 1).
- The full test: the entry shows the three sections with their question counts and minutes; reservation, start, and the three clocks with the first one running work at both sizes; the header shows "Đã làm n/100" and "Đã lưu" after an answer.
- The submit dialog and the result page are clear, in Vietnamese, and say the score is not an official TSA score.
- The review page lists every question, with the student's answer and the key after submit.
- Math renders in the student question and in the admin panel (`d′`, `ℕ`, `USC(a; b)`, π in options).
- Figures: loaded figures open in a dialog with "Phóng to", and Escape closes it.
- Admin: the sign-in rejects a wrong password, sign-out works, and every check button (Publish, Withhold, Restore, Move) prints a dry run with its confirm phrase and writes nothing until confirmed. The inbox check reports an empty inbox correctly.

## Session 9 (about 20:25 to 20:50, Asia/Bangkok)

This session walked the full simulation (the 100-question test with three clocks) by hand at both sizes, checked keyboard use in it, and recorded three findings: F-02-11, F-02-12 and F-02-13. Scripts are in `scratch/` (`phase2-full-simulation-by-hand-s9.mjs`, `phase2-sim-grid-probe-s9.mjs`, `phase2-sim-jump-probe-s9.mjs`, `phase2-phone-option-cover-probe-s9.mjs`, `phase2-sim-keyboard-probe-s9.mjs`). Logs are in `reports/run-logs/` (files starting `2X-`, `2Y-`, `2Z-`, `2Q-`, `2P-`). Screenshots are in `reports/screens/phase-02/` (files starting `s9-`).

- Demo: started by this session in the background (`DEMO_ADMIN_PASSWORD=… npm start`, listener PID 324285 under `npm start` PID 323673). Stopped with `kill -INT` at about 20:37; `ss -ltnp` showed no listener on 4180, and no demo process was left. The background task then reported exit 130, which is that SIGINT.

### 2.2 and 60/30/60 by hand: full simulation, both sizes — PASS

- Desktop and phone: reserve, start, answer, mark, Next and Previous, jump by the section grid, reload, switch section, submit. Logs `2X-full-by-hand-desktop-s9.log` and `2X-full-by-hand-phone-s9.log`.
- Clocks at start: `59:58`, `30:00`, `60:00` (Math 60 min, Reading 30 min, Science 60 min). On switching to Reading, the Math clock showed `Tạm dừng` (paused) at `59:43` and the Reading clock showed `Đang tính giờ` (running). The desktop screenshot shows the three clocks (`s9-full-started-desktop.png`, viewed).
- Answers survive a reload: after answering questions 1 and 7, the reload left `Đã làm 2/100` and one checked radio. The reload does reset the position to question 1 (F-02-11).
- The grid is the aside titled "Bảng câu hỏi của phần" with 40 numbered buttons, each with `aria-label` "Câu N". The first probe failed only because my selector did not match it. The header toggle "Ẩn/Hiện bảng câu hỏi" flips its label and hides the aside on desktop (`2Y-sim-grid-probe-desktop-s9.log`). On phone the toggle is hidden by design (`hidden lg:inline-flex`).
- Numeric, cloze and matching: NOT RUN by hand. The questions reached in these walks were single-choice, multiple-choice and true-false only, as the earlier sessions found.

### 2.3 submit and result — PASS (review page not opened this session)

- The submit button opens a confirmation panel. Desktop result: `1 /100`, rows `Tư duy Toán học 1/40`, `Tư duy Đọc hiểu 0/20`, `Tư duy Khoa học 0/40`. Phone result: `0 /100` with the same row layout. These two walks answered only one or two questions, so the scores say nothing about marking. Log `2X-full-by-hand-*-s9.log`.
- Review page: not opened in this session. Session 3 checked it for a Reading practice attempt.

### 2.6 layout — PASS for overflow, with two label issues

- Overflow: desktop `scrollWidth` 1440 = `clientWidth` 1440; phone 390 = 390.
- A full-page phone screenshot appeared to show option D under the sticky `Câu trước / Câu sau` bar. A viewport screenshot after scrolling to the option (`s9-phone-sim-viewport-last-option.png`, viewed) shows all four options and the bar in normal flow. That was a full-page capture artefact, not a finding.
- The submit button `Nộp cả bài` wraps to two lines at 390 px (F-02-06 again). Section clock names are cut short (F-02-13).

### 2.7 keyboard in the full simulation, desktop — PARTIAL (F-02-08 does not apply here; F-02-12 found)

- Tab from the top reaches the flag button, then `option-A`, then the grid buttons `Câu 1`, `Câu 2` and so on (`2P-sim-keyboard-desktop-s9.log`, `tab-path`).
- Space on the focused radio checks it and the answer saves (`Đã lưu`), but keyboard focus then moves to `BODY` (F-02-12).
- Phone keyboard: NOT RUN. The phone check is a touch check, and no keyboard run was made at 390 px.
- Labels and alt text: session 5 audit, unchanged.

### New findings (session 9)

### F-02-11 Reload in the full simulation returns the student to question 1

- Severity: LOW
- Status: REPRODUCED (twice: desktop and phone, session 9)
- Where: full simulation workspace, `apps/candidate-web/src/screens/SimulationScreen.tsx:25` (`const [index, setIndex] = useState(0)`). The position is kept only in the page state, not on the server.
- Steps to reproduce: reserve and start the full test, press `Câu 7` in the grid, answer it, reload the page.
- Expected: the student stays on question 7, or the page explains where they are.
- Actual: answers are kept. The desktop log shows `"before":{"title":"Trong không gian …","answered":"Đã làm 2/100","checked":1}` and `"after":{"title":"Biết rằng lim …","answered":"Đã làm 2/100","checked":1}`. The phone log shows the same pattern (`2X-full-by-hand-phone-s9.log`).
- Notes: no answer is lost, but a student has to find their place again after a reload. Practice mode was not compared.

### F-02-12 Space in the full simulation saves the answer but moves keyboard focus to the page body

- Severity: MEDIUM
- Status: REPRODUCED (three probe runs, desktop only). The cause is not established.
- Where: full simulation, answer control (`apps/candidate-web/src/screens/SimulationScreen.tsx`, `AnswerControl` near line 272).
- Steps to reproduce: start the full test at 1440x900. Press Tab until `option-A` is focused, press Space, then read `document.activeElement`. Probe `scratch/phase2-sim-keyboard-probe-s9.mjs`.
- Expected: Space checks the radio and focus stays on the radio or the next control, so Tab carries on from the answer.
- Actual: `"after":{"tag":"BODY"…}` and `"optionAChecked":true,"save":"Đã lưu"` (`2P-sim-keyboard-desktop-s9.log`). The next Tab then goes to `Câu 1, đã làm`. In one run the radio read as unchecked 800 ms after Space, while the status read `Đang lưu…`, and it was checked after about 3 s.
- Notes: a keyboard user can answer, but focus is lost after each answer. This is different from F-02-08 (practice mode), where Tab did not reach the radio at all. Screenshot `s9-sim-keyboard-after-space-desktop.png` (viewed) shows option A checked with no focus ring.

### F-02-13 On a 390 px phone, the full simulation's section clocks are cut short and do not show running or paused

- Severity: MEDIUM
- Status: REPRODUCED (screenshot viewed). The effect on students is SUSPECTED, not observed.
- Where: full simulation section tabs. `apps/candidate-web/src/screens/SimulationScreen.tsx:228` builds the status text (`Đang tính giờ`, `Tạm dừng`, `Chưa mở`). Line 236 puts that text in an element with `hidden sm:flex`, so it is hidden below 640 px.
- Steps to reproduce: start the full test at 390x844 and read the three section tabs.
- Expected: on a phone, the section names are readable and it is clear which clock is running.
- Actual: the names are cut to `Tư duy Toán …`, `Tư duy Đọc h…` and `Tư duy Khoa …`. Only the time and a red border on the selected tab are shown. The status is not shown at all. Screenshot `reports/screens/phase-02/s9-full-started-phone.png` (viewed). After switching to Reading, the tab showed `29:59` with no status (`2X-full-by-hand-phone-s9.log`).
- Notes: during a timed test, a phone student cannot see from the tab whether a clock is running or paused. The owner should decide whether the status should show on phones.

### Other session 9 notes

- F-02-09 again: opening the simulation with `mode-simulation` before a guest start gave `Failed to load resource: … 401` in the console on desktop and phone (`page-errors` count 2 in both `2X-` logs).
- F-02-08 scope: in the full simulation, Tab reaches the radio and Space checks it (one run). The failure in F-02-08 is therefore specific to section practice.

### Phase 2 status after session 9

- Still NOT RUN: numeric, cloze and matching by hand (not served by any demo pool, see session 5 and 8); student-app angles (no angle items served); the phone keyboard check; the review page of the full test (not opened this session).
- These gaps depend on what the demo serves, so they need the owner's decision or Phase 4 before they can be run.

## Session 10 (about 20:38 to 20:50, Asia/Bangkok)

Scope: the review page of the full test (2.3), a phone check of the full-test result, and evidence for the NOT RUN reasons. Demo on port 4180 started by this session (`npm start`, background task bq3q9616r) and stopped with `kill -INT` at about 20:43. Ports 4180, 4181, 4184 and 4444 were free afterwards. Script `scratch/phase2-review-s10.mjs`; logs `reports/run-logs/2Y-review-desktop-s10.log` and `2Y-review-phone-s10.log`.

### 2.3 full-test result and review — PASS for the result, NOT RUN for a per-question review

- Result page at 1440x900 and 390x844: `data-testid="result"` with `result-score` `0 /100` after two answers (question 1 true/false group, question 7 single choice), and the three section rows `0/40`, `0/20`, `0/40`. Screenshots `reports/screens/phase-02/s10-review-result-desktop.png` and `s10-review-result-phone.png` (both viewed; no clipping; phone overflow 390/390, desktop 1440/1440).
- The score of 0 is not checked against the answer key here, so the scoring is not verified in this session.
- The full-test result page has **no review control**. The buttons on the page are "Thi từng phần", "Thi thử đầy đủ", "Đăng xuất" and "Về trang thi thử" only. The review control `data-testid="review-open"` ("Xem lại đáp án và lời giải") exists only in `apps/candidate-web/src/screens/ResultView.tsx:81`, which is used for section tests. The full-test result is rendered in `apps/candidate-web/src/screens/SimulationScreen.tsx:146-170`, which has no review entry.
- The simulation contract has a `reviewAllowed` flag, and the test fixture sets it to `false` (`packages/contracts/test/simulation-v3.test.ts:205`). The missing full-test review may be intended. This is recorded as an owner question below, not as a finding.

### Session 10 notes

- F-02-09 again: `Failed to load resource: … 401` in the console on the full-test path at both sizes (`page-errors` count 2 in both logs).
- Two script defects were fixed in the script (not the app): the first answer helper assumed a single-choice question, and `.check()` on a true/false item failed because that control is a click target. The helper now reads the control type first (log entries `answer-1` and `answer-7`).

### Evidence for the NOT RUN items (no new test run)

- Numeric, cloze and matching were not seen in any section pool walked on desktop in session 5: Math 40 questions (single 31, true/false 8, multiple 1), Reading 20 (single 20), Science 40 (true/false 15, single 21, multiple 4). Logs `reports/run-logs/2K-student-types-{math,reading,science}-desktop-s5.log`, `kind-counts` lines.
- This session did not run numeric, cloze or matching, and did not re-walk the pools. The NOT RUN reason is the session-5 sweep, which covered every question of each section.
- Phone keyboard check (2.7): NOT RUN. The check needs a real touch device or an emulated keyboard, and it was not done this session.

## Session 11 (about 20:42 to 20:46, Asia/Bangkok)

Scope: the phone keyboard check (2.7), which session 10 left NOT RUN, plus a desktop control on the same build. Demo on port 4180 started by this session (`npm start`, background task buskauunm; PIDs npm 346485, sh 346718, launcher 346759, worker 346767 LISTEN 4180). Stopped with `kill -INT 346767 346759 346718 346485`; task reported exit 130, which is that SIGINT. `ss -ltnp` showed no listener on 4180, 4181, 4184 or 4444 afterwards, and no start-uni-demo process of mine is left.

### 2.7 keyboard at 390 x 844 (phone) — FAIL, same as 1440 x 900 (F-02-08)

Scripts `scratch/phase2-phone-keyboard-s11.mjs` (phone, from the top of the page) and `scratch/phase2-keyboard-size-compare-s11.mjs` (both sizes). Logs `reports/run-logs/2Z-phone-keyboard-s11.log` and `2Z-keyboard-size-compare-s11.log`. No touch events were sent.

- Phone, Tab from the top of the page (14 presses, no click first): every press left `document.activeElement` on BODY. No answer control was reached.
- Both sizes, Tab from the flag button "Đánh dấu (F)" (6 presses): focus stayed on `BUTTON[flag-toggle]` every time.
- Both sizes, focus set on `option-A` or `option-C` directly, then Space: `checked: false`, and the save status reads "Chưa có câu trả lời được lưu" on the phone.
- Control, both sizes: a mouse click on the option B label checks it and saves (`"save": "Đã lưu lúc 20:43"`). The answer path works by mouse; the failure is keyboard-only.
- The answer radio is 1 x 1 px at both sizes (`boundingBox` width 1, height 1). In `reports/screens/phase-02/s11-keyboard-compare-390.png` (viewed), option C has keyboard focus and shows no visible focus ring on its card. This is a second accessibility gap, recorded under F-02-08 and not a new finding ID. The other three screenshots saved this session (`s11-keyboard-compare-1440.png`, `s11-phone-keyboard-tab.png`, `s11-phone-keyboard-after-space.png`) were not opened and are not relied on.
- Cause not established. The session 3 control in plain HTML (recorded under F-02-08) suggests the browser is not the cause; the owner or a stronger model needs to review `AttemptScreen.tsx`.
- Page errors during the phone run: 0.

### Phase 2 status after session 11

- Every checklist item except the NOT RUN items below has now been attempted at least once. 2.7 phone keyboard moves from NOT RUN to FAIL.
- Still NOT RUN, and not reachable with the served pools: 2.2 and 2.4 numeric, cloze and matching, and 2.4 student-app angles. The session 5 and session 8 sweeps found only SINGLE_CHOICE, MULTIPLE_CHOICE and TRUE_FALSE_GROUP in the served pools, and no angle item in the student app. This is a content gap, not time. It needs a pool with those types, which is an owner decision (see phase 4 and the owner questions).

## Session 12 (about 20:45 to 20:55, Asia/Bangkok)

- Demo on 4180 started by this session (`npm start`, background task bn5m2u5ex; PIDs 351498 npm, 351509 sh, 351537 launcher, 351549 --demo-worker LISTEN 4180). Stopped with `kill -INT 351549 351537 351509 351498`; the task reported exit 130 (that SIGINT, expected). Afterwards `ss -ltnp` showed no listener on 4180, 4181, 4184 or 4444, and no start-uni-demo process of mine was left.
- 2.7 admin page label and focus audit, desktop 1440 x 900 and phone 390 x 844 — PASS for labels, PASS for focus order (sample only). Script `scratch/phase2-admin-label-focus-s12.mjs`, log `reports/run-logs/2AA-admin-label-focus-s12.log`. Read-only: no action button was clicked, and no Enter or Space was sent to admin controls.
  - Login form: 4 buttons, 0 without a name; 2 inputs, 0 without a label (`el.labels`); 0 images. Same at both sizes.
  - Workspace after sign-in: 59 buttons, 0 without a name; 4 inputs, 0 without a label; 0 images. Same at both sizes.
  - Tab order from the top of the workspace, first 12 presses: admin tabs (All questions, Import & publish, AI questions), Sign out, then Section, State and Type selects. Each focused element had a computed solid 3 px outline. The same order was seen at both sizes.
  - Page errors: 0 at both sizes.
  - Screenshots `reports/screens/phase-02/s12-admin-login-desktop-1440.png`, `s12-admin-login-phone-390.png`, `s12-admin-workspace-desktop-1440.png`, `s12-admin-workspace-phone-390.png` were viewed. The workspace layouts look clean, with the filters, the question list and the answer-key panel placeholder all visible.
  - Limits: only 12 of 59 workspace buttons were tabbed through. Focus outline is judged from computed style, not by eye on every control. Label check uses the DOM, not a screen reader.
- The 2.7 keyboard result on the student answer controls is unchanged: F-02-08 stands (sessions 3, 9 and 11). Nothing new in this session.
- Still NOT RUN after session 12: numeric, cloze and matching by hand, and student-app angles. Pool content is the blocker, as in sessions 5 to 11. The review page of the full test (2.3) has no review control on the full-test result, as in session 10.

## Session 13 (about 20:46 to 20:49, Asia/Bangkok)

Scope: the 2.6 tap-target check at 44 px, and a fresh look at the pool kinds for the NOT RUN items. Demo on port 4180 started by this session (`DEMO_ADMIN_PASSWORD=… npm start`, background task bt93a9733; PIDs worker 356157 LISTEN 4180, launcher 356052, chain 355913, 355902, 355445, 355400). Stopped with `kill -INT 356157 356052 355913 355902 355445 355400`; the task reported exit 130, which is that SIGINT. `ss -ltnp` showed no listener on 4180, 4181, 4184 or 4444 afterwards, and no demo process of mine is left. Port 4180 was free at the start of the session.

- Pool kinds (read-only, no demo needed): the saved desktop pool JSON lists `kinds` `SINGLE_CHOICE` 78, `MULTIPLE_CHOICE` 1, `TRUE_FALSE_GROUP` 21 for 100 questions. No numeric, cloze or matching item is present. This is the reason 2.2 and 2.4 numeric, cloze, matching and student-app angles stay NOT RUN.
- 2.6 tap targets, script `scratch/phase2-tap-targets-s13.mjs`, log `reports/run-logs/2AB-tap-targets-s13.log` (rerun `2AB-tap-targets-s13-rerun.log`). Both runs gave the same counts: start page at 1440 and 390 has 3 elements under 44 px high (the "TSA Practice" link at 28 px, and the mode links "Thi từng phần" and "Thi thử đầy đủ" at 40 px); question page at 1440 has 46 under 44 px high, including the panel toggle (40 px), the flag button (40 px) and the question-grid buttons (41 px, for example `question-jump-1`), plus the 1 x 1 px option radios; question page at 390 has 5 (flag button 40 px, and the four 1 x 1 px radios). `pageerror` count 0 at both sizes.
- 2.6 option cards, script `scratch/phase2-tap-options-s13.mjs`, log `reports/run-logs/2AB-tap-options-s13.log`: the label around each option is 58 px tall and 824 px wide at 1440 and 302 px wide at 390 (all four options pass the 44 px rule).
- Screenshots were not taken in this session; the measurements come from the DOM boxes only.

### F-02-14 Navigation and flag controls are 40 to 41 px tall, under the 44 px target

- Severity: LOW
- Status: REPRODUCED (twice; same counts in two runs of `phase2-tap-targets-s13.mjs`)
- Where: `apps/candidate-web` practice question screen. The panel toggle (`data-testid="panel-toggle"`), the flag button (`flag-toggle`) and the question grid buttons (`question-jump-N`) are the affected controls. Measured at 1440 x 900 and 390 x 844 on the demo.
- Steps to reproduce:
  1. Run `node plans/261123-1449-qa-full-test/scratch/phase2-tap-targets-s13.mjs` with the demo on port 4180.
  2. Read the `underHeight44` count and `smallSamples` for `desktop-1440-question-page` and `phone-390-question-page`.
- Expected: every visible button at least 44 px high, as the phase 2 checklist requires (2.6).
- Actual (from the log): `{"step":"desktop-1440-question-page", … "underHeight44":46, "smallSamples":[{"tag":"BUTTON","testid":"panel-toggle","label":"Ẩn bảng câu hỏi","w":144,"h":40 …},{"tag":"BUTTON","testid":"flag-toggle","label":"Đánh dấu (F)","w":125,"h":40 …},{"tag":"BUTTON","testid":"question-jump-1","label":"Câu 1, chưa làm","w":41,"h":41 …}` and `{"step":"phone-390-question-page", … "underHeight44":5 …}`. The start-page probe at both sizes reports `"underHeight44":3`, and its samples are the mode links `mode-practice` and `mode-simulation` at 40 px high, plus the "TSA Practice" link at 28 px.
- Notes: a near miss, not a failure of use. Clicks by mouse worked on these controls in earlier sessions; touch use was not tested. It matters for the owner's own 44 px rule and for students with motor difficulties on a phone. The owner decides whether 40 px is acceptable. Not checked with a screen reader or on a real phone.
- Session 13 limits: the question-grid and flag-button sizes were read on the question screen at two sizes only; the full-test screen and the admin page were not measured for targets.

## Questions for the owner

- Should the full test show a per-question review after submit? The result page copy says the test grades "từng câu", but the page has no review, and the simulation contract has `reviewAllowed: false` in its fixture. The tester did not change anything.

- F-02-12 and F-02-13: should keyboard focus stay on the answer after Space, and should the phone show the status of each simulation clock? Both are product decisions; the tester did not change anything.
- Is the English source notice (F-02-03) intended for the public demo, or should the default in `package.json` be Vietnamese?
- Should F-02-05 be treated as a release blocker for phones?
- F-02-08: is keyboard-only answering a launch requirement? If it is, the key handler in `AttemptScreen.tsx` needs a decision and a review by the owner or a stronger model. The tester did not change it.
- F-02-07: do the Science figure assets for the copied Bank all exist in the image store? A Phase 4 check can answer this with the database mapping.
- Two QA runners wrote to the same worktree at the same time (15:24 and 16:22), and a third started in session 3. Is that expected?
