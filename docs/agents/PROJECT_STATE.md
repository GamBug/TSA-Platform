# Project state

Updated 2026-11-16. This is current navigation; historical state is in the [dated archive](../archive/2026-11-08/PROJECT_STATE.md).

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

## Current checkpoint

- 2026-11-16 (content review): The owner specified three Math edits and delegated the remaining correctness/clarity
  decisions. A private reviewed package contains 42 higher versions and four replacement starch questions; all 46 pass
  copy-only publication and grading checks. All 28 uncertainty tags in the original files were reviewed, plus the other
  named disagreements and passage siblings. Owner publication now excludes superseded DRAFT parents. The retained Bank
  and originals remain unchanged; real import/publication is still pending. See the [report](../../plans/reports/codex-261116-2332-question-content-review.md).

- 2026-11-16 (publication repair): Owner publication now finds receipt-backed exchange drafts, supplies inspected image
  storage to submission and approval, and bundles exchange passages by question id. Copy-only rehearsal approved nine
  Reading drafts and image-bearing Science draft `SCIE-T26SC-000101`; the retained Bank is byte-for-byte unchanged and
  still serves 276 Math + 100 Reading, with all 141 exchange drafts unpublished. Science `000401`–`000404` remain blocked
  by unsupported passage TeX. No schema or public contract changed. See the [report](../../plans/reports/codex-261116-1417-exchange-draft-publication.md).

- 2026-11-16 (Reading and Science): 9 Reading and 26 Science questions from the same PDF were imported as unpublished DRAFTs (agent-derived keys; 18 questions skipped as defective). The importer now supports passages, a Science taxonomy exists, and 10 figures are in the image library. Those two blockers were repaired in the later checkpoint above; publication still requires the owner. See the [report](../../plans/reports/claude-261116-1307-tsa-2026-dot1-reading-science-import.md).

- 2026-11-16 (later): The owner added the compiled TSA 2026 đợt 1 PDF (three shifts of Math, Reading, Science). 106 of its Math questions were imported as unpublished DRAFTs with agent-derived keys, under the existing OWNER_ATTESTED rights; 9 were skipped as inconsistent or duplicate. Reading and Science remain: they need passage import and a Science taxonomy. See the [report](../../plans/reports/claude-261116-1014-tsa-2026-dot1-math-import.md).

- 2026-11-16: Question-bank architecture pass (local commits on `feat/track-b-data-auth`). Four of the five flagged Math items were handled through the new `npm run bank:correct`: two were repaired as new approved versions and three were withheld as `NEEDS_MANUAL_REVIEW`; one duplicate numeric twin is also withheld, so the retained Bank now serves 277 Math and 100 Reading items. New: the portable question exchange format `tsa-question/1` with validator, standalone AI generation prompt and exportable reference package ([guide](../../docs/question-bank/QUESTION_FORMAT.md)); a reusable image asset library with stable codes (migration 032, [guide](../guides/IMAGE_LIBRARY.md)); a draft importer with receipts (migration 033); a blind answer-verification workflow ([guide](../guides/ANSWER_VERIFICATION.md)); and the "resumed" notice now appears only for a genuinely held attempt. The verification pass found 7 further defects in published Math items; their corrections are prepared but NOT applied, pending the owner. See the [report](../../plans/reports/claude-261116-0242-question-bank-architecture.md).

- 2026-11-15: Demo stabilization audit. The retained Bank's audit trail shows the owner publication command approved all 381 imported items on 2026-11-11 (Math 281, Reading 100); older bullets below that call Math drafts or "nothing published" are historical. Real-Bank student journeys (Math and Reading topic practice, numeric, cloze/matching) pass with correct grading. Five published Math items have inconsistent source keys and one numeric problem is published twice; these await an owner decision. CI no longer needs the private corpus: the Reading interaction suites run on a synthetic corpus and `npm run test:corpus:private` runs them on the real one (three local commits, not pushed). See the [audit report](../../plans/reports/claude-261115-2242-demo-stabilization-audit.md).

- 2026-11-12: The next audit pass corrected the reserved-attempt catalog label and completed 19 additional browser journeys, including recovery/rate-limit paths, Firefox cloze/matching and disposable university/Reading Factory launchers. Latest app suite: 109 passed. The full audit remains active for final coverage reconciliation; see the [audit report](../../plans/reports/codex-261111-2256-program-audit.md).

- 2026-11-12: The next audit pass repaired stale ordinary deadline responses that could replace a newer attempt/result or clear another read's lock. All 109 app tests, real expiry/topic Chromium journeys and 33 topic/attempt backend checks pass. See the same [audit report](../../plans/reports/codex-261111-2256-program-audit.md) for reproduction and limitations; the full audit remains active.

- 2026-11-12: The owner's single-agent full-program audit is active. Confirmed fixes cover image/route wiring, stale simulation polling, publication source selection, startup role/capability drift, unsupported rights timestamps, staff numeric discovery and unsaved author navigation. The latest backend run passes 543 checks; separate final timestamp checks, 101 app tests, three Chromium staff journeys and Chromium/Firefox simulation journeys pass. Full scope remains under review. See the [audit report](../../plans/reports/codex-261111-2256-program-audit.md) for exact evidence and remaining coverage. Existing uncommitted Math intake work is preserved; retained approvals and rights remain unchanged by the audit.

- 2026-11-11: Single-agent Math cloze/matching follow-up is implemented and uncommitted. All 25 candidate captures were inspected; 22 question/3 DRAFTs were imported after backups (10 cloze, 12 matching), and three remain blocked by a graph or missing source content/keys. Math now has 281 questions: 259 previously published and 22 unpublished drafts; 119 of 400 captures remain out. Owner publication supports question/3, and the university demo offers separate Math practice at `?student=postgres-v4` after publication. No retained approvals were made. See the [report](../../plans/reports/codex-261111-2045-math-cloze-matching.md) for checks, adaptations and the owner command. Older counts below are historical checkpoints.

- 2026-11-11: Numeric Math import and delivery committed: 60 numeric-answer Math DRAFTs (`question/2`) are in the retained Bank; `bank:owner-publish` publishes them and `demo:uni` serves a separate numeric practice at `?student=postgres-v2` (`f813c52`). Nothing is published yet; 141 Math captures remain out (figures and tables, cloze and matching, no visible key, clipped). See the [numeric import and delivery report](../../plans/reports/claude-261111-2130-numeric-math-import-and-delivery.md).

- 2026-11-11: Numeric Math importer built and committed (`b3fbfea`): profile `corpus-math-numeric-draft/1` imports numeric-answer captures as `question/2` DRAFTs through the existing manual transport. No numeric items are imported yet, and publication and student delivery of `question/2` Math are not built. See the [numeric importer report](../../plans/reports/claude-261111-2040-numeric-math-importer.md).

- 2026-11-11: Full Math bank import: all 400 Math captures were inspected; 199 items are in the retained Bank (80 published, 119 new DRAFTs). Publish them with `npm run bank:owner-publish -- --confirm "PUBLISH 119 ALL"`. 189 captures stay deferred (numeric, diagram or table, cloze or matching, no visible key). The new items have no independent blind solve, and five source keys look inconsistent with their problems. See the [full Math import report](../../plans/reports/claude-261111-2010-math-full-bank-import.md).

- 2026-11-11: Retained Math import completed: 80 Math DRAFTs are in the retained Bank (backed up first; none approved or published). Math publishes with `npm run bank:owner-publish -- --confirm "PUBLISH 80 ALL"`. Math was then published by the owner (80 items). Reading and Math sit in separate taxonomy versions, so no full simulation is offered; the owner decided on 2026-11-11 that section and topic practice are enough for the demo. See the [Math import report](../../plans/reports/claude-261111-1930-math-retained-import.md).

- 2026-11-11: CP7 step 1 committed (`9f878c0`): owner attestation recorded; `npm run bank:owner-publish` publishes the 100 corpus Reading items (rights, passage bundles, full checks) and was verified on a copy of the retained Bank. The owner runs the confirmed command. See the [CP7 report](../../plans/reports/claude-261111-0003-cp7-owner-publication.md).

- 2026-11-10: CP6 completed and committed (`55adbb6`): `npm run demo:uni` serves only published Bank items from a disposable copy (private Bank backed up, never written); `npm run demo:uni:rehearsal` runs a labelled synthetic rehearsal. Today 0 items are published, so the demo honestly offers nothing until the owner approves and publishes. See the [CP6 report](../../plans/reports/claude-261110-2301-cp6.md).

- 2026-11-10: CP4 completed and committed (`46cbbb9`..`d7e71f6`): exit suites, Chromium/Firefox journeys and a recorded independent review passed. A retained import of the 78 keyed Reading DRAFTs awaits the owner. See the [CP4 completion report](../../plans/reports/claude-261110-1215-cp4.md).

- 2026-11-09: CP3b completed: 80 private Math DRAFTs verified in four disposable batches of twenty, exit checks and independent review passed. See the [Math checkpoint report](../../plans/reports/codex-261109-1721-cp3b.md).

- 2026-11-09: Earlier CP3b allowlist blocker was resolved by the owner's extension; see the historical [blocker report](../../plans/reports/codex-261109-1636-cp3b.md).

[CP2 Full simulation](../../plans/261108-1553-codex-autonomous-demo/cp2-full-simulation.md), CP3a retained Reading import and CP3b disposable Math verification are complete. The [checkpoint plan](../../plans/261108-1553-codex-autonomous-demo/plan.md) tracks the remaining work; CP6 is next, and CP5 waits for owner-supplied Science files. Math retained-bank import remains a separate operation.

- 2026-11-08: CP1 navigation and archives verified; docs validator repaired under owner resumption authorization. See the [CP1 completion report](../../plans/reports/codex-261108-2051-cp1.md).
- 2026-11-08: CP2 completed under owner resumption authorization; migration preservation, required suites, and Chromium/Firefox 100-answer journeys passed. See the [CP2 completion report](../../plans/reports/codex-261108-2238-cp2.md).

- 2026-11-09: CP3a-import verified 100 retained Reading DRAFTs in ten passages, with authoritative source keys and no blind-solve doubts; no approvals or rights grants. See the [retained import report](../../plans/reports/codex-261109-1615-cp3a-import.md).

## Known gaps and gates

- The full simulation demo uses disposable original synthetic inventory; the retained corpus items (Reading and Math) were approved and published by the owner on 2026-11-11 under the recorded attestation, and are separate inventory served by section, topic, numeric and cloze/matching practice.
- Corpus-derived items require recorded rights evidence and owner approval before publication; neither is implied by local engineering.
- CP5 waits for owner-supplied Science files. Hosting and production authentication are optional for this demo.

## Run the local demo

Follow the [run of show](../guides/TRACK_B_SUPERVISOR_RUN_OF_SHOW.md) for `npm run demo:uni`; the [supervisor demo guide](../guides/TRACK_B_SUPERVISOR_DEMO.md) covers setup and the older synthetic launchers.

- 2026-11-09: CP3 BLOCKED before implementation: 136 explicit-key Reading choices fall short of 150; true/false keys need owner source evidence. [Report](../../plans/reports/codex-261109-0913-cp3.md).

- 2026-11-09: Owner approved CP3a’s 100-item target; CP3a BLOCKED on v3 AI-authorship literals outside its allowed contract scope. [Report](../../plans/reports/codex-261109-1342-cp3a.md).

- 2026-11-09: CP3a complete: 100 Reading DRAFTs in ten bundles verified through the disposable coordinator/staff queue; blind triage and private samples retained, corpus unchanged. CP3b next. [Report](../../plans/reports/codex-261109-1435-cp3a.md).

- 2026-11-09: CP4 BLOCKED before implementation pending an owner decision on missing matching target pools/reuse policy; [checkpoint report](../../plans/reports/codex-261109-1958-cp4.md). No commits made.
