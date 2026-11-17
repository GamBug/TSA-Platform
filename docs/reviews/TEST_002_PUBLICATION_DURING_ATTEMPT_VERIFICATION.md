# TEST-002 scenarioG — corrected publication during an active exam

2026-10-25, basea2d5094, feat/track-b-data-auth. AUTOMATED_PASS /
INDEPENDENTLY_REVIEWED within this scenario; full TEST-002 remains IN_PROGRESS.
Root accountable integration/shared records; actual native Luna/XHigh one-file
writer; actual separate Sol6.1/Medium read-only reviewer. Recommendation matches
bounded test implementation and independent integrity-oracle review. No paid API,
push/merge/deploy. Owner AGENTS.md/untracked research preserved/excluded.

## Acceptance gap and implemented evidence

Read-only scout mapped C–H and searched additional attempt/grading/result/runtime
files: correction exclusion and revocation preservation existed, but corrected
publication DURING IN_PROGRESS followed by original-key grading was absent. This
is the named TEST_STRATEGY G gap, not a new runtime feature or general harness.

Only tests/integration/results/delivery.test.mjs changes. Reuse existing disposable
PostgreSQL allocation/attempt/Bank HTTP/workflow/trusted worker/released result
fixtures. The test starts a four-question NEW_ONLY exam and saves original b
responses. The ordinary authenticated Bank version route creates a same-stable-ID
correction with new text and keya; existing synthetic fixture workflow makes it
eligible. Current Bank pointer must advance; this is no qualified human approval.

Compare complete immutable form row, ordered slot+private-secret rows, their
hashes, microsecond UTC started/deadline times, all assignment-history fields and
SQL grading input digest across publication. Then submit/grade/release:4/4 earned,
original b keys/content/interactions/explanations/responses. Independent fixed
expectation shows corrected a would mark the saved response wrong. A later NEW_ONLY
attempt excludes every prior stable ID including the corrected question; first
assignment history remains intact. No runtime/schema/privilege/clock/scoring change.

## Actual commands and review

Node24.18/npm11.16/PostgreSQL18.6, Zod4.6.7:

- Writer targeted `node --experimental-strip-types --test --test-name-pattern='an in-progress attempt grades' tests/integration/results/delivery.test.mjs`: PASS1.
- Writer full delivery file: PASS2; scoped whitespace PASS.
- Root `npm run test:results`: PASS7; `npm run test:grading`: PASS23.
- Root tightened the test oracle: pg Date loses sub-millisecond precision, so add
  exact microsecond strings and full form/slot/secret/history JSONB alongside the
  selected values. Final `node --test tests/integration/results/delivery.test.mjs`:
  PASS2. Root final helper change affects tests only, not application behavior.
- Separate reviewer final actual full delivery file PASS2, syntax/whitespace PASS;
  no findings. Exam/key/score oracle, ordinary publication, full-row/precision
  comparisons, follow-up history, teardown and synthetic-review boundaries inspected.
  Reviewer wrote no files; broad results/grading/browser not independently rerun.

Final reviewed file SHA256:
`c61b72ea16afd4d6cf845b695f4675a77ca341b042919e79587e4eec81eef06c`.
Ignored logs `.local/test002-g-*`. Clean no-hardlink reproduction of4dd3fca PASS: fresh `npm ci --ignore-scripts`,
`npm run build`, `npm run test:results` PASS7; final clone Git status empty.
No file patches/manual SQL/API setup, inherited DB or browser profile. Root clone
`/tmp/tsa-test002-g-clean.NiXmCp`, logs `.local/test002-g-clean-*`; automatic teardown.

No product defect was observed. This closes G's controlled synthetic publication/
immutability/grade/released-review evidence gap. Full A–J, real content, qualified
accessibility, production operations/load remain distinct. H current-domain barrier
extension is separate; unsupported fixed/review modes are not implemented here.
