# Phase 04 report — Data (Bank, inbox, figures, publication, question changes)

- Date and time (Asia/Bangkok): 2026-11-23 21:14 to 21:30 (session 1)
- Tester: Claude Code, Haiku 5.5
- Worktree commit (`git log --oneline -1`): c2846a3 docs(plans): count NOT RUN items as finished and give each test phase at most two sessions
- Phase status: DONE. Every item has a result. Item 4.13 is NOT RUN for its literal case (reason below). Item 4.5 has one link check NOT RUN (reason below).

All data work ran on the copied Bank (`.local/track-b`), never on the owner's repository. No demo was started, so port 4180 was not used. No process of mine is left running. The copy was reset at the end and the reset inventory matches the starting inventory exactly.

## Results by checklist item

| Item | Result | Evidence |
|---|---|---|
| A suites | PASS, 10 of 10 suites exit 0 | `npm run test:bank` 190/190; `test:question-inbox` 5/5; `test:question-change` 2/2; `test:exchange-import` 8/8; `test:owner-twins` 1/1; `test:image-library` 6/6; `test:verification` 6/6; `test:question-bank` 53/53; `test:db:preflight` 11 named invariant checks, all PASS, "Completed 11 named invariant checks"; `test:recovery` 16/16. Logs `reports/run-logs/4A-*-s1.log`. |
| 4.1 versions and served per section | PASS (counts only) | Before: MATH APPROVED 454 (served 446), DRAFT 157, QUARANTINED 5; READING APPROVED 200 (served 200), DRAFT 9; SCIENCE APPROVED 195 (served 195), DRAFT 26. Served by taxonomy: MATH 276 corpus + 170 simulation; READING 100 simulation + 100 retained corpus; SCIENCE 195 simulation. Log `4B-inventory-before-s1.log`. |
| 4.2 served per interaction type against test sizes | PASS (counts) | Served MATH: SINGLE_CHOICE 285, NUMERIC_RESPONSE 58, TRUE_FALSE_GROUP 71, MATCHING 12, CLOZE 10, MULTIPLE_CHOICE 10. READING: SINGLE_CHOICE 200. SCIENCE: SINGLE_CHOICE 122, TRUE_FALSE_GROUP 58, MULTIPLE_CHOICE 15. Enough per section for 40 / 20 / 40 by count. The test runs themselves are phase 2 and phase 6 items. |
| 4.3 served versions without key or explanation | PASS | `served_without_key` 0; `served_empty_explanation` 0 (`4B-inventory-before-s1.log`). |
| 4.4 open exact twins and served duplicates | FINDING F-04-01 (HIGH) | `duplicate_relations` open EXACT = 0, but all 270 EXACT relations are `CONFIRMED`. 270 same-section fingerprint groups have two served copies each: MATH 170 (corpus taxonomy vs simulation taxonomy) and READING 100 (simulation vs retained corpus). Log `4B-inventory-extra-before-s1.log` (X1, X2). |
| 4.5 stored `image_request` blocks and image blocks | PASS for `image_request`; link check NOT RUN | 0 stored versions with an `image_request` block. One served version (SCIENCE, `72af61d2-446a-40ac-9002-900022db0309`) has one image block with `assetVersionId` and `alt`. The link to an active asset was not checked: the image list prints asset codes, not version ids. |
| 4.6 `npm run images -- list` | PASS | Exit 0, 65 assets, all ACTIVE (`4B-images-list-before-s1.log`). After the import: 66 (`4C-images-list-after-inbox-s1.log`). |
| 4.7 inbox dry run; rejected file moved back | PASS | Empty inbox: "The inbox is empty" (`4C-inbox-dryrun-1-s1.log`). After moving `20261122-151944-SRC-MATH-261122-A-P3.json` from `rejected/` to `math/` (dropping the first prefix): "REJECT ... 6 problem(s)" with a FIGURES request naming `MATH-S261122A-000025_NEW-IMG-001.png` through `000030`, each with its source note (`4C-inbox-dryrun-2-s1.log`). |
| 4.8 placeholder figures; dry run; confirm | PASS after a tester fix | First six placeholders were my own hand-written PNGs. The platform rejected all six as "could not be read". A real stored WebP decoded fine with the same probe. I rebuilt the six with Python PIL (200x150 white). Dry run: "OK ... 10 question(s), 10 new, transcription, 6 figure(s) attached" (`4C-inbox-dryrun-4-s1.log`). Confirm `IMPORT 10`: 10 DRAFT questions imported; the six figures resolved to one shared asset `IMG-MATH-000001` (identical bytes, deduplicated); PNGs moved to `imported/`; library 65 → 66 assets; backups 23 → 27 (`4C-inbox-confirm-s1.log`). Questions checked as DRAFT and not served. |
| 4.9 publish the imported set | PASS | Dry run: "Corpus versions awaiting publication: MATH 61", no twin warning (`4C-publish-dryrun-s1.log`). Confirm `PUBLISH 61 ALL`: "Approved and published: 61" (`4C-publish-confirm-s1.log`). Served Math 446 → 507. Duplicate fingerprint groups unchanged at 270. |
| 4.10 `--publish` one draft | PASS | Draft `f5fea077-9f4d-4811-a19d-455a65987178` (Math, NUMERIC_RESPONSE, no passage). Dry run, then confirm `PUBLISH f5fea077`: "Published f5fea077...". State APPROVED, served. Total served 902 → 903. Backups 28 → 30. A draft with a shared passage was refused at dry run ("use Publish on the Import & publish tab"), which is the intended behaviour. |
| 4.11 withhold, then restore | PASS | Confirm `WITHHOLD f5fea077`: "Withheld f5fea077"; state QUARANTINED, not served. Confirm `RESTORE f5fea077`: "Restored ...; it is published again"; state APPROVED, served. Wording issue: stored reason reads "Withheld by the owner on the admin page: QA check" (F-04-04). |
| 4.12 move to SCIENCE (practice-pool and corpus question) | MIXED: practice-pool move PASS; corpus move FAIL (F-04-03, HIGH) | Practice-pool `d77f6b39-9f83-4cf6-868a-a2cd4791761b` → SCIENCE, confirm `MOVE d77f6b39 TO SCIENCE`: "Moved to SCIENCE as version d9a6fa47..., approved and served". Math v1 not served; SCIENCE v2 served (taxonomy pool). Corpus `28b0642e-2067-4114-8d18-1a9592bfdb78` → SCIENCE, confirm `MOVE 28b0642e TO SCIENCE`: exit 1, "CONSTRAINT_CONFLICT. The new version de186298-b7ce-4a3a-b24b-2d81e73a555b is IN_REVIEW and not approved; version 28b0642e... is still served." The stray SCIENCE version stayed in the database as IN_REVIEW. Old Math version still served. Logs `4D-12-*-s1.log`. |
| 4.13 move onto an identical question in the target section must be refused | NOT RUN (literal case); partial evidence only | No identical question exists in SCIENCE for `28b0642e`; the only SCIENCE version with its fingerprint is the stray row. The refusal path was reached by the 4.12 corpus move (CONFIRMED EXACT twin gate, `publication-gates.mjs:133`), but only after the write (F-04-03). A pre-write refusal of an identical target-section question was not reproduced. |
| 4.14 wrong confirmation phrase | PASS | `--withhold ... --confirm "WITHHOLD 00000000"` on served `3c5dc20f-1cf4-40e3-a51e-64953c30614c`: exit 1, "Confirmation does not match. Expected exactly: WITHHOLD 3c5dc20f". State APPROVED, revision 3, served before and after. Backups 38 before and after (`4D-14-*`). |
| 4.E reset | PASS | No demo running. `rm -rf .local/track-b && cp -a` from the reference copy. Inventory re-run: identical to the before-state log (`4E-inventory-after-reset-s1.log` vs `4B-inventory-before-s1.log`). Inbox restored (see Findings note). |

## Before and after numbers (copy)

| Measure | Before | After the confirmed changes | After reset |
|---|---|---|---|
| MATH APPROVED (served) | 454 (446) | 516 (507) | 454 (446) |
| SCIENCE APPROVED (served) | 195 (195) | 196 (196) plus 1 IN_REVIEW stray | 195 (195) |
| Served total | 841 | 903 (507 Math + 200 Reading + 196 Science) | 841 |
| Image assets | 65 | 66 | 65 |
| Duplicate fingerprint groups (served) | 270 | 270 | 270 |
| Open EXACT twins | 0 | 0 | 0 |
| Backup entries in `.local/track-b-backups/` | 23 | 38 | 38 (kept) |

## Findings

### F-04-01 Confirmed exact twins are still served as pairs in Math and Reading

- Severity: HIGH
- Status: REPRODUCED (read-only SQL inventory, run twice: before changes and after changes; both show 270 groups). Whether one test can draw both copies of a pair is SUSPECTED, not tested.
- Where: `tsa.duplicate_relations` (270 rows, all `EXACT` / `CONFIRMED`); served versions in `tsa.questions.eligible_version_id`. The approval gate in `src/modules/bank/publication-gates.mjs:119-133` refuses to approve a question that has an OPEN or CONFIRMED twin, so the pairs were already served before any of my changes.
- Steps to reproduce:
  1. `node plans/261123-1449-qa-full-test/scratch/inventory-extra.mjs` (SELECT only, on the copy).
  2. Read section X1 (`kind EXACT, resolution CONFIRMED, 270`) and X2 (MATH 170 groups, READING 100 groups, one copy per taxonomy in each pair).
- Expected: a confirmed twin is withheld or kept to one served copy, so a student does not meet the same question twice in one assembled test. The open-twin check (4.4) would show a problem.
- Actual: `open_exact_twins` = 0 because the relations are CONFIRMED, not OPEN. The same 270 pairs are served (`served_copies: 2` per group). The owner's memory records an exact-twin blocker for this pool ("copies of served questions hide originals until twins are adjudicated"), so this may already be known to the owner. Not verified against the owner's decision.
- Notes: this is a data-level finding. Whether a real 40/20/40 test picks both copies is for the owner to check (see Questions).

### F-04-03 A refused move leaves a stray IN_REVIEW version, and the dry run promised a different result

- Severity: HIGH (a write that persisted after the command failed; the stray is not served)
- Status: REPRODUCED once (one confirm attempt). The cause is most likely the approval gate, read from source and not run a second time: the question has a CONFIRMED EXACT relation (query checked) and no OPEN one, which matches `src/modules/bank/publication-gates.mjs:133` (`assertSingletonAllowed`).
- Where: `scripts/question-change.mjs:184-200` (MOVE path). The new version is created and submitted for review in its own transaction (`withRuntime`), then `approve()` runs. If approval fails, the new row stays behind.
- Steps to reproduce:
  1. Dry run: `npm run bank:question -- --version 28b0642e-2067-4114-8d18-1a9592bfdb78 --section SCIENCE` prints "Add a new version in SCIENCE (taxonomy \"TSA simulation taxonomy v1\"). It is approved and served instead of this one."
  2. Confirm: `npm run bank:question -- --version 28b0642e-2067-4114-8d18-1a9592bfdb78 --section SCIENCE --confirm "MOVE 28b0642e TO SCIENCE"`.
  3. Exit 1: `Question change stopped: CONSTRAINT_CONFLICT. The new version de186298-b7ce-4a3a-b24b-2d81e73a555b is IN_REVIEW and not approved; version 28b0642e-2067-4114-8d18-1a9592bfdb78 is still served.`
  4. Query: version `de186298-b7ce-4a3a-b24b-2d81e73a555b` exists, section SCIENCE, taxonomy "TSA simulation taxonomy v1", state IN_REVIEW, served false, created 2026-11-23 21:23:24.
- Expected: a move that cannot be approved is refused before anything is written, and the dry run says so.
- Actual: the stray row is written, and the dry run gave the wrong expectation. The error message does name the stray row, so the change is not silent, but the Bank gained a row the owner did not ask for.
- Notes: the old Math version stayed served; the public result is unchanged. The stray was removed by the copy reset. Repair is for the owner, not this session.

### F-04-04 Misleading or unclear messages (LOW)

- Severity: LOW
- Status: REPRODUCED (observed in output)
- Where: `scripts/question-change.mjs` (withhold reason and failure message); `scripts/owner-publish.mjs` (output after confirm).
- Details:
  1. The CLI withhold writes the reason "Withheld by the owner on the admin page: QA check", although it ran from the command line.
  2. A refused confirmation (4.14) still prints "Backups taken before changes are in .local/track-b-backups/", though no backup was taken for that refused run.
  3. The publish confirm output ends with "Then restart the local demo, or upload the Bank to the live server (bash infra/server/upload-bank.sh)". The tester did not run it. The line is advice, but it points at the live server in a test context.

### F-04-05 Figure decode failure gives no cause (LOW)

- Severity: LOW
- Status: REPRODUCED once; my own file caused it. The platform's behaviour is the observation.
- Where: `src/modules/media/image-inspection-worker.mjs` maps every failure to `IMAGE_DECODE_FAILED`; `src/local/inbox-figures.mjs:73` passes that to the inbox message "the file I saved could not be read; make it again".
- Details: a hand-written PNG (valid per `file` and zlib) was rejected; a PIL-written PNG of the same size was accepted. The cause inside the decoder was not identified, and the message gives the user no hint. Not a data defect, but the user is left guessing.

## Not run

| Item | Why |
|---|---|
| 4.5 link check: served image block `assetVersionId` to an active asset | The image list prints asset codes; the version-id link was not mapped. No other command was run for it. |
| 4.13 literal case (identical question in the target section refused before any write) | No identical question exists in SCIENCE for the moved question, and no cross-section pair was found to test with. The refusal path was reached only after the write (F-04-03). |

## Notes for the owner

- Reset: the copy is identical to the starting inventory. The `.local/track-b-backups/` folder was kept (38 entries) as evidence. Remove it with the copy if you do not need it.
- Placeholder figures: the six placeholders were my test files. They were removed from `question-inbox/math/imported/` and the one image blob they created was removed from `.local/track-b-images/`.
- Inbox: `20261122-151944-SRC-MATH-261122-A-P3.json` is back in `rejected/` under its original name. It was moved out to `math/` and imported during 4.8, then moved back. Its `.errors.txt` was never moved.
- The QA guard refused one of my checks because its wording named the reference copy. I did not retry that wording. A hook block on a dependency-folder read also stopped one check (sharp version); I did not work around it. Neither affects a result above.

## Questions for the owner

1. Are the 270 CONFIRMED exact-twin pairs (MATH 170, READING 100) served on purpose, or is this the known exact-twin blocker? Should both copies of a pair be served at all?
2. Should the move path (F-04-03) refuse before writing? The current order writes a new version and only then checks approval.
3. Does a published question with a `CONFIRMED` twin need a withhold or a dedupe decision before publication? The publish dry run showed no twin warning for the 61 Math questions published in 4.9.
