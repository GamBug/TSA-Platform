# Project state

Updated 2026-11-17. This is current navigation; historical state is in the [dated archive](../archive/2026-11-08/PROJECT_STATE.md).

## Product goal and owner decisions

Build an unofficial local practice demo that can grow into a full product. The target simulation is 100 questions (40/20/40), with section timers (60/30/60 minutes) and return-to-section navigation; topic practice and correct-answer counts per section and total are also in scope. No live AI runs during exam creation, delivery, or grading.

The owner's [2026-11-07 direction](../decisions/OPEN_DECISIONS.md#university-demo-product-direction--2026-11-07) keeps versioned contracts, the Bank as the content source, and human approval before publication. Corpus rights are REQUIRES_VERIFICATION until evidence is recorded. The demo remains non-profit and makes no HUST affiliation or official-score claim.

## What works today

- Topic catalog and owner-bound topic practice are integrated with the student experience.
- The opt-in v3 full simulation delivers 100 questions with server-side section clocks, return navigation, read-only exhaustion, and per-section/total correct counts.
- Versioned numeric practice and binary per-section/total scoring are implemented.
- Opt-in cloze and matching practice (`question/3`, `/api/v4`) works end to end, including staff authoring and preview; see the [guide](../guides/TRACK_B_CLOZE_MATCHING.md).
- Private inspected-image delivery is implemented behind a default-off feature flag.
- Keyboard shortcuts support per-page opt-out and modal focus restoration.
- Reading research/factory and manual draft transport support validated, unpublished DRAFT intake.
- Local staff and student demo flows use the existing PostgreSQL-backed practice prototype.
- Questions can be authored outside the Bank in one versioned format, validated offline and imported as DRAFTs; images are reusable library assets; published keys can be re-checked by blind verification; defective published questions are repaired through new versions ([corrections guide](../guides/BANK_CORRECTIONS.md)).
- ChatGPT output pasted into `question-inbox/` imports with `npm run questions:inbox` into a separate practice pool, offered only as extra practice after owner publication ([inbox guide](../guides/CHATGPT_QUESTION_INBOX.md)). Originals (`GPT-` batches) are recorded as OWNED; transcriptions of the owner's pictures and PDFs (`SRC-` batches) as corpus material under the owner's attestation. ChatGPT Project setup: [chatgpt-projects](../guides/chatgpt-projects/README.md).

## Current checkpoint

- 2026-11-22 (admin account): The local demo has one sign-in account, `AdminBao`, on a new admin page
  (`/student/?page=admin`, loopback only; the public site answers 404 for it). The admin sees every Bank version with keys
  and explanations, adds ChatGPT answer files to the inbox, imports and publishes them through the owner commands, and
  generates questions with OpenAI when `OPENAI_API_KEY` is set (otherwise the page shows the ChatGPT Project steps).
  Local students now start as one-click guests; the A/B buttons and the old staff workspace are no longer shown. See the
  [admin guide](../guides/ADMIN_PAGE.md). `test:admin` (4), `test:demo:uni` (20), `test:auth`, `test:critical:privacy`,
  `test:b0` (112), `test:question-inbox`, `test:student-web:browser` and `test:demo:uni:browser` pass; a rehearsal on a
  copy of the retained Bank imported and published one file from the page. Pre-existing failures, not from this work:
  `test:demo:public` (1 subtest, Math offering lookup since `9f21e78`) and `test:docs` (the tracked
  `INSTRUCTIONS_*.txt` files of `af75967`). OpenAI was not called for real.

- 2026-11-20 (real-pool browser check): New `npm run test:real-pool:browser` takes the whole 40/20/40 test in Chromium on the
  published Bank, at 1280 px and 360 px, and inspects all 100 question screens (formulas, images, sideways scroll, saving,
  console and network errors, result totals). It found and fixed two defects: long inline formulas pushed the page sideways on
  phones, and formulas written as `$...$` inside table cells and captions were shown as raw TeX (a Science water-quality table;
  the table's accessible name had the same problem). Both viewports now pass with 0 defects and 0 page problems; each run draws
  a different random test (about 55 questions with formulas, about 30 with images). Test creation speedups are deployed:
  50 simultaneous section attempts plus 10 simultaneous full tests pass live with no 5xx. Not run: real phones, Firefox, Safari.

- 2026-11-19 (server packaging, CP4/CP5): The public demo runs on the shared VPS behind nginx with a valid certificate at
  `https://tsa.103.72.56.139.sslip.io`; `tsa.smartnovi.tech` waits for the owner's relative to add the DNS record, then
  Certbot and one environment line switch it. Live checks (`scripts/verify-public-live.mjs`) pass for isolation, no leakage,
  grading and a full 100-question test. Starting a test took about 30 s and 12 simultaneous starts gave four 503s; public mode
  now speeds this up (planner setting plus a proven source cache, see the runbook): first start about 7 s on the server, and 50
  simultaneous section attempts plus 10 simultaneous full tests pass with no 5xx. The About page now tells visitors to report wrong questions to whoever shared the link. The bare link redirects to `/student/`, and the practice page lists only Math and Science practice (Reading is in the full test). The launch checklist is the [launch run of show](../guides/PUBLIC_LAUNCH_RUN_OF_SHOW.md). Added `infra/server/` (provisioning,
  release, Bank upload, systemd unit, nginx site) and the [runbook](../guides/PUBLIC_DEMO_RUNBOOK.md); `DEMO_OFFERING_DAYS`
  keeps tests open beyond one day. On the server the real Bank reports "Full simulation: offered, at least 4 without
  repeats"; restart takes about 18 s, a hard kill recovers in about 23 s, a stop leaves no process. The launcher needs
  exactly PostgreSQL 18.6, so the server holds that version. `test:demo:uni` (18) and `test:docs` pass. The source-credit
  line on the server is a visible temporary text the owner must replace.

- 2026-11-19 (public student UI, CP3): The React student app now works behind the public URL: one-click guest start,
  landing explanation, About page, full-test headline card on the catalog, social-preview meta tags, no logout in
  public mode. New `npm run test:student-web:public` passes at 1280, 768 and 360 px through a TLS proxy (guest isolation,
  reload, section practice, full 6/100 test, About, root 404). Local mode unchanged: `test:student-web`,
  `test:student-web:browser`, `test:demo:public` (13) and `test:docs` pass. Open: owner contact line and Open Graph
  image/URL need the final domain. See the [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261119-public-student-ui.md).

- 2026-11-18 (public demo mode, CP1): `DEMO_PUBLIC=true npm run demo:uni` now has a public student-only mode for a
  reverse-proxied https origin: one synthetic guest per browser, staff paths 404, Host/Origin pinned, security
  headers, `/healthz`, per-address guest limit. The local demo is unchanged. The student app still signs in with the
  local A/B login, so it needs the guest call (CP3) before use behind the public URL. Required suites pass; see the
  [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261119-public-mode.md) and [plan](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/261118-1305-public-demo-launch/plan.md).

- 2026-11-17 (old student UI retired): Owner decision: the university demo sends students only to the React
  student app; old `?student=` links redirect to its matching mode, and the launcher and run of show list only
  the new links. Topic practice is paused until the owner asks to resume it. The original student screens stay
  only as the harness for the existing student browser suites and fixtures. The automated browser check now also
  covers cloze/matching with drag, tap and list matching (6/6). The Figma export's source is kept in
  `design/figma-make/` (the archive itself is not tracked). `test:student-web:browser`, `test:demo:uni:browser`,
  `test:demo:uni`, `test:b0` and `test:docs` pass.

- 2026-11-17 (React student app): At the owner's request the student experience was rebuilt in React from the
  owner's Figma Make design (`apps/candidate-web`, served at `/student/`; see the [guide](../guides/STUDENT_WEB_APP.md)
  and [plan](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/261117-2227-react-student-app/plan.md)). It covers section practice, numeric, cloze/matching
  with drag-and-drop matching, and the full simulation, through the existing APIs with no contract change; topic
  practice and staff screens stay in the original app, which is unchanged. An earlier CSS-only restyle was rolled
  back. `test:student-web`, `test:student-web:browser` (desktop and mobile), `test:b0`, `test:demo:uni`, the
  student leakage test and `test:docs` pass. Cloze/matching was checked manually on the synthetic fixture only.

- 2026-11-17 (student image delivery): The local university demo connects the existing private image library to student
  delivery. Copy-only Chromium journeys passed for real Math and Science stem, option and passage figures, cloze/matching,
  mobile enlargement, answer reload and correct grading; synthetic explanation release also passed. All requested suites
  pass. All 1,410 retained Bank files are unchanged: 276 Math + 100 Reading remain served and 141 exchange drafts remain
  unpublished. See the [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261117-student-image-delivery.md).

- 2026-11-16 (content review): The owner specified three Math edits and delegated the remaining correctness/clarity
  decisions. A private reviewed package contains 42 higher versions and four replacement starch questions; all 46 pass
  copy-only publication and grading checks. All 28 uncertainty tags in the original files were reviewed, plus the other
  named disagreements and passage siblings. Owner publication now excludes superseded DRAFT parents. The retained Bank
  and originals remain unchanged; real import/publication is still pending. See the [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261116-2332-question-content-review.md).

- 2026-11-16 (publication repair): Owner publication now finds receipt-backed exchange drafts, supplies inspected image
  storage to submission and approval, and bundles exchange passages by question id. Copy-only rehearsal approved nine
  Reading drafts and image-bearing Science draft `SCIE-T26SC-000101`; the retained Bank is byte-for-byte unchanged and
  still serves 276 Math + 100 Reading, with all 141 exchange drafts unpublished. Science `000401`–`000404` remain blocked
  by unsupported passage TeX. No schema or public contract changed. See the [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261116-1417-exchange-draft-publication.md).

- 2026-11-16 (Reading and Science): 9 Reading and 26 Science questions from the same PDF were imported as unpublished DRAFTs (agent-derived keys; 18 questions skipped as defective). The importer now supports passages, a Science taxonomy exists, and 10 figures are in the image library. Those two blockers were repaired in the later checkpoint above; publication still requires the owner. See the [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261116-1307-tsa-2026-dot1-reading-science-import.md).

- 2026-11-16 (later): The owner added the compiled TSA 2026 đợt 1 PDF (three shifts of Math, Reading, Science). 106 of its Math questions were imported as unpublished DRAFTs with agent-derived keys, under the existing OWNER_ATTESTED rights; 9 were skipped as inconsistent or duplicate. Reading and Science remain: they need passage import and a Science taxonomy. See the [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261116-1014-tsa-2026-dot1-math-import.md).

- 2026-11-16: Question-bank architecture pass (local commits on `feat/track-b-data-auth`). Four of the five flagged Math items were handled through the new `npm run bank:correct`: two were repaired as new approved versions and three were withheld as `NEEDS_MANUAL_REVIEW`; one duplicate numeric twin is also withheld, so the retained Bank now serves 277 Math and 100 Reading items. New: the portable question exchange format `tsa-question/1` with validator, standalone AI generation prompt and exportable reference package ([guide](../../docs/question-bank/QUESTION_FORMAT.md)); a reusable image asset library with stable codes (migration 032, [guide](../guides/IMAGE_LIBRARY.md)); a draft importer with receipts (migration 033); a blind answer-verification workflow ([guide](../guides/ANSWER_VERIFICATION.md)); and the "resumed" notice now appears only for a genuinely held attempt. The verification pass found 7 further defects in published Math items; their corrections are prepared but NOT applied, pending the owner. See the [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261116-0242-question-bank-architecture.md).

- 2026-11-15: Demo stabilization audit. The retained Bank's audit trail shows the owner publication command approved all 381 imported items on 2026-11-11 (Math 281, Reading 100); older bullets below that call Math drafts or "nothing published" are historical. Real-Bank student journeys (Math and Reading topic practice, numeric, cloze/matching) pass with correct grading. Five published Math items have inconsistent source keys and one numeric problem is published twice; these await an owner decision. CI no longer needs the private corpus: the Reading interaction suites run on a synthetic corpus and `npm run test:corpus:private` runs them on the real one (three local commits, not pushed). See the [audit report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261115-2242-demo-stabilization-audit.md).

- 2026-11-12: The next audit pass corrected the reserved-attempt catalog label and completed 19 additional browser journeys, including recovery/rate-limit paths, Firefox cloze/matching and disposable university/Reading Factory launchers. Latest app suite: 109 passed. The full audit remains active for final coverage reconciliation; see the [audit report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261111-2256-program-audit.md).

- 2026-11-12: The next audit pass repaired stale ordinary deadline responses that could replace a newer attempt/result or clear another read's lock. All 109 app tests, real expiry/topic Chromium journeys and 33 topic/attempt backend checks pass. See the same [audit report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261111-2256-program-audit.md) for reproduction and limitations; the full audit remains active.

- 2026-11-12: The owner's single-agent full-program audit is active. Confirmed fixes cover image/route wiring, stale simulation polling, publication source selection, startup role/capability drift, unsupported rights timestamps, staff numeric discovery and unsaved author navigation. The latest backend run passes 543 checks; separate final timestamp checks, 101 app tests, three Chromium staff journeys and Chromium/Firefox simulation journeys pass. Full scope remains under review. See the [audit report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261111-2256-program-audit.md) for exact evidence and remaining coverage. Existing uncommitted Math intake work is preserved; retained approvals and rights remain unchanged by the audit.

- 2026-11-11: Single-agent Math cloze/matching follow-up is implemented and uncommitted. All 25 candidate captures were inspected; 22 question/3 DRAFTs were imported after backups (10 cloze, 12 matching), and three remain blocked by a graph or missing source content/keys. Math now has 281 questions: 259 previously published and 22 unpublished drafts; 119 of 400 captures remain out. Owner publication supports question/3, and the university demo offers separate Math practice at `?student=postgres-v4` after publication. No retained approvals were made. See the [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261111-2045-math-cloze-matching.md) for checks, adaptations and the owner command. Older counts below are historical checkpoints.

- 2026-11-11: Numeric Math import and delivery committed: 60 numeric-answer Math DRAFTs (`question/2`) are in the retained Bank; `bank:owner-publish` publishes them and `demo:uni` serves a separate numeric practice at `?student=postgres-v2` (`f813c52`). Nothing is published yet; 141 Math captures remain out (figures and tables, cloze and matching, no visible key, clipped). See the [numeric import and delivery report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261111-2130-numeric-math-import-and-delivery.md).

- 2026-11-11: Numeric Math importer built and committed (`b3fbfea`): profile `corpus-math-numeric-draft/1` imports numeric-answer captures as `question/2` DRAFTs through the existing manual transport. No numeric items are imported yet, and publication and student delivery of `question/2` Math are not built. See the [numeric importer report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261111-2040-numeric-math-importer.md).

- 2026-11-11: Full Math bank import: all 400 Math captures were inspected; 199 items are in the retained Bank (80 published, 119 new DRAFTs). Publish them with `npm run bank:owner-publish -- --confirm "PUBLISH 119 ALL"`. 189 captures stay deferred (numeric, diagram or table, cloze or matching, no visible key). The new items have no independent blind solve, and five source keys look inconsistent with their problems. See the [full Math import report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261111-2010-math-full-bank-import.md).

- 2026-11-11: Retained Math import completed: 80 Math DRAFTs are in the retained Bank (backed up first; none approved or published). Math publishes with `npm run bank:owner-publish -- --confirm "PUBLISH 80 ALL"`. Math was then published by the owner (80 items). Reading and Math sit in separate taxonomy versions, so no full simulation is offered; the owner decided on 2026-11-11 that section and topic practice are enough for the demo. See the [Math import report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261111-1930-math-retained-import.md).

- 2026-11-11: CP7 step 1 committed (`9f878c0`): owner attestation recorded; `npm run bank:owner-publish` publishes the 100 corpus Reading items (rights, passage bundles, full checks) and was verified on a copy of the retained Bank. The owner runs the confirmed command. See the [CP7 report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261111-0003-cp7-owner-publication.md).

- 2026-11-10: CP6 completed and committed (`55adbb6`): `npm run demo:uni` serves only published Bank items from a disposable copy (private Bank backed up, never written); `npm run demo:uni:rehearsal` runs a labelled synthetic rehearsal. Today 0 items are published, so the demo honestly offers nothing until the owner approves and publishes. See the [CP6 report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261110-2301-cp6.md).

- 2026-11-10: CP4 completed and committed (`46cbbb9`..`d7e71f6`): exit suites, Chromium/Firefox journeys and a recorded independent review passed. A retained import of the 78 keyed Reading DRAFTs awaits the owner. See the [CP4 completion report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261110-1215-cp4.md).

- 2026-11-09: CP3b completed: 80 private Math DRAFTs verified in four disposable batches of twenty, exit checks and independent review passed. See the [Math checkpoint report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-1721-cp3b.md).

- 2026-11-09: Earlier CP3b allowlist blocker was resolved by the owner's extension; see the historical [blocker report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-1636-cp3b.md).

[CP2 Full simulation](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/261108-1553-codex-autonomous-demo/cp2-full-simulation.md), CP3a retained Reading import and CP3b disposable Math verification are complete. The [checkpoint plan](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/261108-1553-codex-autonomous-demo/plan.md) tracks the remaining work; CP6 is next, and CP5 waits for owner-supplied Science files. Math retained-bank import remains a separate operation.

- 2026-11-08: CP1 navigation and archives verified; docs validator repaired under owner resumption authorization. See the [CP1 completion report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261108-2051-cp1.md).
- 2026-11-08: CP2 completed under owner resumption authorization; migration preservation, required suites, and Chromium/Firefox 100-answer journeys passed. See the [CP2 completion report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261108-2238-cp2.md).

- 2026-11-09: CP3a-import verified 100 retained Reading DRAFTs in ten passages, with authoritative source keys and no blind-solve doubts; no approvals or rights grants. See the [retained import report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-1615-cp3a-import.md).

## Known gaps and gates

- The full simulation demo uses disposable original synthetic inventory; the retained corpus items (Reading and Math) were approved and published by the owner on 2026-11-11 under the recorded attestation, and are separate inventory served by section, topic, numeric and cloze/matching practice.
- Corpus-derived items require recorded rights evidence and owner approval before publication; neither is implied by local engineering.
- CP5 waits for owner-supplied Science files. Hosting and production authentication are optional for this demo.

## Run the local demo

Follow the [run of show](../guides/TRACK_B_SUPERVISOR_RUN_OF_SHOW.md) for `npm run demo:uni`; the [supervisor demo guide](../guides/TRACK_B_SUPERVISOR_DEMO.md) covers setup and the older synthetic launchers.

- 2026-11-09: CP3 BLOCKED before implementation: 136 explicit-key Reading choices fall short of 150; true/false keys need owner source evidence. [Report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-0913-cp3.md).

- 2026-11-09: Owner approved CP3a’s 100-item target; CP3a BLOCKED on v3 AI-authorship literals outside its allowed contract scope. [Report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-1342-cp3a.md).

- 2026-11-09: CP3a complete: 100 Reading DRAFTs in ten bundles verified through the disposable coordinator/staff queue; blind triage and private samples retained, corpus unchanged. CP3b next. [Report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-1435-cp3a.md).

- 2026-11-09: CP4 BLOCKED before implementation pending an owner decision on missing matching target pools/reuse policy; [checkpoint report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-1958-cp4.md). No commits made.
