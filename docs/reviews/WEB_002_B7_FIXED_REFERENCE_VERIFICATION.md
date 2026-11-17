# WEB-002 B7.1 additive fixed reference verification

Started2026-10-24, verified2026-10-25 Asia/Bangkok, branch feat/track-b-data-auth,
base7571a36. [Root-selected additive decision](../decisions/WEB_002_B7_FIXED_REFERENCE_DECISION.md)
under owner engineering-choice delegation. Native Luna/XHigh writer actually owned
assembly-reference.ts/new fixed tests, released. Root integration/compatibility/
emitted tests/historical migration repair/docs; separate Sol6.1/Medium read-only
review. Owner AGENTS.md/untracked research preserved/excluded. No paid API/dependency.

## Implemented

Separate strict fixed-assembly-manifest/1 with literal PUBLISHED_FIXED/
FIXED_AS_PUBLISHED and no student history/user fields, own canonical bytes/hash,
fixed runner and replay. Shared private common validators and selection helpers
accept explicit exclusion context; fixed never calls the personal parser or maps
to REVIEW_ALLOWED. Fixed one baseline search, exact ranking/order/bundles/quotas/
source/group/conflict checks and independent final validation. Fixed failures are
constraint conflict, eligible-constraint infeasibility or search exhaustion; never
unseen shortage or partial slots. Internal-only export via existing star surface.
Old personal schema/modes/types/canonical bytes/results and original test/fixture
bytes preserved. No persistence/grant/migration/HTTP/UI or fixed-delivery claim.

## Executed evidence

Node24.18.0/npm11.16.0, actual isolated PostgreSQL and Chromium156.
Ignored `.local/verification-b7` logs are local evidence, not committed private data.

| Command | Observed result |
| --- | --- |
| `node --experimental-strip-types --test packages/contracts/test/assembly-reference.test.ts packages/contracts/test/fixed-assembly-reference.test.ts packages/contracts/test/fixed-legacy-compatibility.test.ts` | PASS31 |
| `npm test` | PASS148 |
| `npm run test:consumers` / `npm run test:built` | PASS12 / PASS |
| `npm run typecheck` / `npm run build` | PASS (build also executed by actual writer) |
| `npm run contracts:check` / `npm run contracts:consumer-check` | PASS |
| `npm run test:assembly` after historical-test repair | PASS50 |
| `npm run test:student` | PASS34 |
| `STUDENT_ARTIFACT_DIR=.local/verification-b7/domains npm run test:student:domains` | PASS78 independent persistent-domain API responses |
| Scoped whitespace / original assembly test+fixture empty diff | PASS |

Original untouched suite20 plus fixed10 cover literal canonical-byte/hash/slots,
strict modes/history/extra fields, replay mismatch, normalization/bounds, constraints,
ranking/exclusions, empty failure slots and a small independent exhaustive oracle.
Root additionally cloned committed7571a36 without hardlinks, installed locked deps,
and captured10 literal legacy cases for both modes, seeds and node/unit limits.
Only a new measurement helper was copied into that baseline clone; its algorithm
remained committed7571a36. Recorded manifest hashes, complete results/slots/node
counts match current source. This measurement clone is not a clean-reproduction
claim. Emitted tests exercise ordinary Node fixed replay and absence from root/
student/released/staff exports. No new student/browser service or UI route.

Observed failure: full assembly suite initially49PASS/1 failure because its pinned
017→018 migration rehearsal assumed018 was latest despite019. First filtering-only
repair still allowed a default upgrade call to apply019 and failed again. Final
repair creates explicit old17/bad18/target18 directories and pins upgrade/replay to
target18. Actual historical rollback/row/security/job/allocation checks remain;
final50PASS. This was a test-boundary error, not a fixed-solver DB regression.
Writer initial fixed golden placeholder and invalid blueprint test setup were
repaired before final30PASS; no failed/preparatory outcome counted as passing.

## Actual independent review

Separate read-only `/root/lifecycle_review`, native configured Sol6.1/Medium: no
findings in design or final implementation against7571a36. Independently reference31,
typecheck/consumer12/drift/import/whitespace PASS. Also loaded actual git-show7571a36
baseline in memory and compared all10 cases canonical bytes and full results against
current and recorded pins: PASS. Reviewed mode isolation, normalization, exclusions,
budget accounting/failure semantics and internal-only boundary. Build not rerun by
reviewer; emitted checks used existing built output. No reviewer writes/commits.
Historical-test supplement independently syntax/whitespace/actual focusedPG1 PASS;
reviewer did not independently reproduce earlier failed attempts.

Reviewed source SHA256:
8a511a7014a11f4ce3b68b354e02b92101649c3874a9a57e49548581f811e37c.
Historical test SHA256:
6ec8a017b129ecdf07b8c0b5f69000588c6be454c2ed6785931dcd35fcfdcd1b.

AUTOMATED_PASS / INDEPENDENTLY_REVIEWED within scope. No fixed persistence/delivery/
publication, qualified content/rights/accessibility/load/production acceptance.
Staff-specific browser/Firefox tests NOT_EXECUTED for this pure reference increment;
actual three-domain Chromium ran. Next: narrowly audited stored fixed-run diagnostic
projection, explicit discovery and useful staff UI with genuine synthetic reference
fixtures. Do not disclose personal manifests or call dataset preflight assembly
feasibility. Clean reproduction follows commit and is appended only when executed.

## Clean committed reproduction —7ba60a5

Root no-hardlink clone `.local/verification-b7/clean-7ba60a5`: locked npm ci
--ignore-scripts, build, reference31, consumer12, actualPGassembly50, typecheck,
drift/import/docs PASS. Final clone Git status empty. No source patches/manual
SQL/API setup; this reproduction clone is separate from the earlier baseline
measurement clone. Logs under parent clean-*.log. Runner completion handle expired
after completion; all stage logs and final clone status were subsequently inspected.
