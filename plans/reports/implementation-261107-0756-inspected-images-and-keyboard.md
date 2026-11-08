# Inspected image delivery and keyboard continuation

Status: IN_PROGRESS. November7,2026, Asia/Bangkok. Codex controller accountable on feat/track-b-data-auth at a70861a. Original dirty work and TSA_Example_Questions are preserved. No commit, publication, deployment, retained/production database migration or paid API operation.

## Implemented

- Additive SQL028 retains legacy text-only checks and adds private immutable image-inspection evidence, sealing of exact snapshot references and narrow exam authorization. No historical row backfill or broader existing asset-table grants.
- Bank image admission fully decodes exact referenced objects through the pinned existing Sharp adapter, validates the content graph and current source display rights, and records a separate inspected-image profile. Default workflow still rejects images without the explicit local store.
- The frozen GET returns buffered bytes only after guarded ownership, snapshot membership, purpose/security-class, current rights/hold and clock/release checks. Reads are bounded500ms; PostgreSQL authorization transactions are bounded2s. Reconciliation denials commit expiry/invalidation before returning no bytes.
- The existing student renderer now receives real private images. Chromium156 and Firefox156 verified1200×800 original synthetic diagrams, native enlargement/Escape/focus restoration, saved-answer reload and authorized explanation images. Chromium narrow375px; Firefox actual narrow500px; both tablet768px. No external image requests.
- Shortcut help now offers a per-open-page checkbox to disable character shortcuts. Native operation remains available. A reproduced Chromium modal-focus failure was repaired with explicit per-modal opener capture and restoration.

## Review and corrections

Dewey implemented only the asset HTTP adapter and its eight boundary tests, then the migration test. McClintock performed actual read-only SQL review before execution; no concrete SQL defect found, with live execution left to integration tests. Pascal independently reviewed the integrated path and found a stimulus accumulating other content owners' image edges. A regression failed before the correction; local per-stimulus sets now pass and reject spurious edges. Pascal also identified incomplete state/race evidence; the controller extended it rather than treating static review as sufficient.

Lovelace's additional verification assignment stopped at an account usage limit before producing a file. The controller implemented its tests locally. No paid fallback or invented usage metrics. Reviewers did not independently run the PostgreSQL/browser suites.

## Executed evidence

- `npm run test:media`:56passed,0failed, including complete decoder/container/store checks, content graph, HTTP boundary, live PNG/release/tamper/timeout, rights/status/deadline, two-connection submit/quarantine/rights/hold ordering and populated027→028 upgrade/replay/injected-failure rollback. Log: `/tmp/tsa-media-combined-final.log`.
- Affected Bank/publication/attempt regression:52passed,0failed (`/tmp/tsa-media-regression.log`). Allocation/bundles/fixed/review/Reading/topic/historical-topic-upgrade subset:63passed,0failed (`/tmp/tsa-image-assembly-regression.log`).
- `STUDENT_IMAGE_TEST=true node scripts/verify-student-browser.mjs`:passed; `/tmp/tsa-image-browser.log`, screenshots under `/tmp/tsa-student-browser-evidence/images/`.
- `STUDENT_IMAGE_FIREFOX=true STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-image-firefox-evidence node scripts/verify-student-firefox.mjs`:passed; `/tmp/tsa-image-firefox.log` and its artifact directory.
- `npm run test:student:keyboard` and `npm run test:student:firefox`:passed after modal-focus repair. Native Space changes the preference, disabled printable keys do not trigger actions, visible Help re-enables it, and dialog focus restores correctly.
- `npm run test:b0` passed all8client test files. Build, typecheck, contracts drift and consumer checks passed. Documentation links have0errors; anchors remain NOT_CHECKED. Initial sandboxed decoder subprocess tests failed; unrestricted direct decoder9/store5 checks passed. Initial image tests exposed fixture count/SQLSTATE/grading-result mistakes, corrected to existing contracts. Initial Chromium image journey used the wrong reservation step and inspected asynchronous review too early; fixed to the actual application flow. No assertions weakened.

All PostgreSQL runs use disposable18.6 clusters with initial private backups. The migration test additionally backs up populated state before both injected failure and upgrade. No general image demo flag is enabled.

## Online ideas applied or constrained

[W3C character shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html) supports the implemented opt-out. [W3C dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) supports click/tap controls as well as keyboard alternatives for any future matching UI. [QTI interaction guidance](https://www.imsglobal.org/spec/qti/v3p0/impl) distinguishes text entry, matching and gap matching; these remain versioned-contract work, not an excuse to reinterpret captured questions as existing choice types.

## Remaining acceptance

Release commit ordering and natural-rights-expiry/revocation coverage passed15/15 in the expanded authorization/race subset. Huygens independently closed the stimulus finding, passed16/16 content/shortcut tests and found no new concrete defect in scope. General synthetic image demo activation remains disabled: the approved acceptance matrix includes future-section cases beyond the current independent-section H3 offering and must not be represented as fully exercised. Current H3 has one independent section, so future-section delivery is not a claim this implementation can verify through a legitimate multi-section offering. Numeric/text/cloze/matching and combined-examination workflows remain separate compatibility work. The main modernization mission is not declared complete.

## Reproduce

Use the existing setup guide and Node24.18.0/npm11.16.0/PostgreSQL18.6 tools, including pg_dump/pg_dumpall. Run `npm ci --ignore-scripts`, `npm run build`, `npm run test:media`, `npm run test:student:images`, and `npm run test:student:images:firefox`. Browser scripts create and clean their own synthetic database, private objects, server and browser. Existing topic demo remains documented in docs/guides/TRACK_B_TOPIC_PRACTICE.md.

## Final review and visual artifacts

Huygens completed the final bounded independent read-only review: no new concrete correctness/privacy finding, prior stimulus finding closed,16helper tests and scoped syntax/whitespace checks passed independently. It did not independently rerun PostgreSQL or browser tests. One Node module-type warning remains informational.

Retained original synthetic screenshots: [desktop](track-b-modernization-evidence/image-exam-desktop.png), [mobile](track-b-modernization-evidence/image-exam-mobile.png), [enlarged mobile](track-b-modernization-evidence/image-enlarged-mobile.png), [Firefox released review](track-b-modernization-evidence/image-firefox-released-review.png). These are generated engineering diagrams, not source corpus captures. Latest Chromium/Firefox runs also show the visible enlargement cue.

The [HUST introduction](https://ts.hust.edu.vn/tin-tuc/gioi-thieu-ve-ky-thi-danh-gia-tu-duy-tsa) describes three thinking competencies; its scientific Reading genre must not be treated as the separate Science section. Existing registered taxonomy/H3 behavior is preserved rather than presenting an independent practice profile as an official full examination.

The final56-test media run also proved that UNKNOWN rights and corrupt bytes leave no inspection evidence or question PASS, preserve DRAFT state, and permit normal review only after valid object restoration. [Versioned-extension compatibility map](compatibility-261107-0756-question-interactions-and-combined-exam.md).
