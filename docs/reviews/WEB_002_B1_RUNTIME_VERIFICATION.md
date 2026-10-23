# WEB-002 B1.2 private inspection — runtime verification

2026-10-23, branch `feat/track-b-data-auth`, starting `5f916af`.
Accountable integrator/backend/migration/tests: Codex root. Two actual native
`tsa_builder` delegates (dispatch configured Luna/XHigh) implemented the disjoint
private contracts and staff UI/browser/launcher slices; neither claimed independent
review. Model-routing metadata was not independently observable inside workers.
Owner AGENTS.md and untracked research note remain preserved and excluded.

Authority: [explicit owner B1.2 approval](../decisions/OPEN_DECISIONS.md#web-002-b12--owner-approved-private-inspection-2026-10-23),
exact immutable specification hash
`94d81d1c574dff0b9d8c9338a3559d1c88aa9629f17743a1171bdc2c9b074392`.
Historical PROPOSED footer remains unchanged; the owner disposition supersedes it.

## Implemented

One opt-in `GET /api/v1/question-versions/{versionId}/review-context` is composed
only in the explicitly enabled local staff runtime. Default Bank composition and
ordinary student runtime expose no such route. Current trusted roles, own-version
server creation evidence and independent queued-reviewer author/operator checks
precede private content loading. Imported creator UUIDs do not grant ownership.

Migration019 adds only the STABLE/SECURITY DEFINER fixed-search-path Boolean
local-authorship probe. PUBLIC execution is revoked; only Bank receives execution.
Bank cannot SELECT raw audits. No historical row/backfill/table/role expansion.

A READ ONLY REPEATABLE READ snapshot verifies canonical graph/hash, normalized
question/provenance/stimulus storage, exact opaque mappings, current source rights
and complete parent/stimulus/source closure. Held, rights-blocked and unsupported
states return metadata with no question/key/explanation. Effective-source checks
include hidden attestor/evidence and GENERATE/ADAPT requirements; response schemas
also enforce DTO-visible necessary rights. No validation/delivery cache, audit,
receipt, job, eligibility pointer or grading state is written by inspection.

The new private `@tsa/contracts/staff` schema/subpath and dedicated staff operation
artifact/drift checks preserve every existing root/student/released export and
public operation artifact. Existing root verification now includes staff artifact
and compiled/package-export checks. No dependency or framework was added.

Staff UI requests an exact version only after explicit selection, displays its
identity/current workflow/rights metadata, safely renders authorized text/math/
tables/keys/explanations, and handles blocked/error/retry/close states. Workspace,
identity/version/request generations prevent late responses restoring private DOM.
Long metadata wraps on mobile; a strict375px viewport assertion prevents false
passing checks caused by mobile auto-zoom.

The disposable `demo:staff:review` launcher reuses the isolated synthetic fixture,
requires explicit test/synthetic/fixture flags, prints no private content/credentials,
and provides browser navigation without manual SQL/API calls. Valid synthetic
rights remain in its owned fixture; retained UNKNOWN sources are not promoted.

## Concrete defects and failed runs

- Initial service probe returned503 because PostgreSQL custom-enum arrays arrived
  as strings. Explicit `allowed_uses::text[]` repaired the projection.
- Independent P2: schema accepted AVAILABLE with currentRights null. Added
  necessary observable rights checks and negatives; repaired/reviewed.
- Independent P2: manual child of an imported parent returned503 because mappings
  used only the target namespace. Reproduced genuine import/manual-child201/GET503;
  repaired per-question contexts, receipt-less ancestor manifest attribution and
  exact target-local stimulus selection. Regression now passes with4 source
  dependencies and revocation blocking both parent/child previews.
- Import test setup initially spread contentHash into createReferenceHash and
  asserted a nonexistent service result status/items. These were test errors;
  explicit hash inputs and actual receipts shape repaired them before passing.
- First migration test expected a ledger name without `.sql`; actual migrator
  names include it. Test expectation repaired; no migration semantics changed.
- Initial full Bank run had104 passes/3 stale migration-list failures. Only the
  expected latest migration lists in those tests gained019; rerun PASS107.
- First actual oversized-rights test hit helper transport413 because the fixture
  still used the mock32KiB limit. Helper now matches the real local1MiB transport;
  actual response/source bounds produce the specified safe503.
- Visual mobile review exposed716px layout viewport despite375px requested.
  The old `scrollWidth<=innerWidth` check falsely passed. New strict width check
  reproduced the failure; wrapping/grid CSS repaired it to375/375/scale1.
- Launcher initially printed the student-only query URL, which hides the staff
  entry. Root changed it to `/`, matching the real browser staff journey, and
  retained the established early-disconnect cleanup guard. No failing outcome
  above is counted as passing evidence.

## Executed commands and results

Linux, Node24.18.0/npm11.16.0/PostgreSQL18.6/Chromium155.0.8059.79.
Counted passing suites have zero failures/cancellations/skips.

| Actual coordinator command | Observed result |
| --- | --- |
| `npm run test:staff:review` | PASS15:12 real-PG/HTTP read/security cases,1 populated018→019 upgrade,2 guarded CLI/startup/terminal-shutdown cases |
| `npm run test:bank` | Final PASS107 before the additional launcher2 was added; earlier104/3 failure recorded above |
| `npm run test:db:foundation` / `npm run test:auth` | PASS37 / PASS5 |
| `npm run test:local` | PASS15 |
| `npm run test:student` | PASS34 |
| `npm run test:student:domains` | PASS78 inspected responses; independent MATH4/READING2/SCIENCE4 save/reload/submit/grade/review/history |
| `npm run test:track-b:browser` | Final PASS19 check descriptions/7 screenshots; retained UNKNOWN block, all3 private interaction types, XSS block, exact data, stale responses, roles, keyboard close and strict mobile geometry |
| `npm test` / `npm run test:consumers` | PASS117 / PASS11 |
| `npm run test:b0` | PASS32 |
| `npm run typecheck` / `npm run build` / `npm run test:built` | PASS; built includes two new staff package/compiled checks |
| `npm run contracts:check` / `npm run contracts:consumer-check` | PASS, including separate staff drift and denied student import |
| Scoped syntax/whitespace | PASS |

Focused cases exercise denied anonymous/candidate/exam-manager/foreign authors,
current role removal/combined-role precedence, imported creator/operator exclusions,
actual Origin and GET-body rejection, fixed error IDs, rights unknown/revoked/
future/expired/territory/use/attestor, held precedence, all-table count+hash zero-
write oracles, barrier-controlled snapshot versus next-read revocation, corruption,
>100 sources and >1MiB response safe503. The ordinary student HTTP runtime returns404
for staff inspection even with a staff session. Migration preserves all application
rows and exact immutable drafts while retaining raw-audit/grant restrictions.

Browser delayed-response and503 injections are controlled interceptions around
real requests; they do not prove a real database outage. Keyboard checks include
programmatic focus before Enter and real Escape, not a full assistive-technology
acceptance. Actual synthetic screenshot paths are under
`/tmp/tsa-track-b-browser-evidence`; coordinator inspected the repaired375px preview.
No screenshots/DBs/tokens/private production evidence are committed.

## Independent engineering review

Actual separate native `/root/lifecycle_review`, configured Sol6.1/Medium, read-only,
reviewed contracts/migration/backend/frontend/tests. Its two implementation P2s
(rights-schema gap and mixed ancestry) were repaired. Final no unresolved findings.
Independently executed read/security12, populated-upgrade1, scoped staff contract13,
staff drift/public consumer checks, syntax/whitespace and actual Chromium19checks/
7screenshots. Supplemental mobile CSS/UI recheck and actual browser rerun PASS:
innerWidth375/documentWidth375/visualScale1; reviewer visually inspected preview.

Reviewed backend SHA256:
`e3869b48f8e8841bd94720cd97c8a6c8ee4c3b27905c467e8a3e4812e03878d0`.
Migration019 SHA256:
`e9ba4573e5d5708ffbfd3ff7a47465e8b51c5f794e268088b375b056c5cedaab`.
Broader regression commands above are coordinator evidence, not reviewer executions.
Final launcher review/clean-checkout reproduction are appended when executed.

## Scope limits and next work

B1 private inspection is a local engineering capability. It creates no qualified
human reviewer, real rights evidence, publication acceptance or new student release.
No review decisions, rights edits, quarantine, raw evidence, image bytes or assembly
diagnostics UI was added. Full WEB-002, lawful30-item inventory, manual AT/native
zoom/accessibility, operational/load targets and production identity remain open.
No paid API/Astra/live student inference/push/merge/deployment occurred.

Full assembly/attempt/grading/result/recovery suites were not rerun for this
read-only staff increment; student and Bank regressions above were executed.
Hosted CI NOT_EXECUTED. Existing module-type/historical-whitespace warnings remain.

## Launcher and second-engine completion

Separate reviewer `/root/lifecycle_review` independently ran
`node --test tests/integration/bank/review-demo.test.mjs`: PASS2, syntax3 PASS,
no launcher findings. An additional immediate-after-spawn IPC-disconnect probe
exited0 with no stdout/stderr. Its earlier pre-spawn probe ended with unsettled
await and is explicitly inconclusive; no orphan processes were observed.

Coordinator exact
`NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STAFF_REVIEW_FIXTURE_DEMO=true npm run demo:staff:review`
started the real root URL `http://127.0.0.1:<port>/`; root/app/math/KaTeX/auth session
all returned200/no-store. Terminal Ctrl+C closed the listener. Direct CLI tests
exit0; npm interactive cancellation returns1, as with the student launcher.

Delegate extended the existing Firefox harness behind `STAFF_REVIEW_FIREFOX=true`,
then actually ran `STAFF_REVIEW_FIREFOX=true node scripts/verify-student-firefox.mjs`:
PASS on Firefox156.0/geckodriver0.37.1. The existing student journey also passes in
that command. Staff checks cover root landing, explicit synthetic AUTHOR, cookie
isolation, no prefetch, exact AVAILABLE version/hash, MathML/table/options/key/
explanation, real Escape/focus restore and logout DOM clear. Desktop innerWidth1280,
scrollWidth1268, scale1. Firefox clamped requested375 and fallback450 to actual500;
narrow capture is honestly labelled500, scrollWidth488/scale1. It is not evidence
of a375px Firefox viewport. Chromium independently demonstrates375px.

Initial Firefox attempts exposed a mock cookie created when loading root and the
minimum viewport clamp. The test now clears cookies immediately before staff auth
and records actual geometry rather than claiming the requested width. Both failed
attempts are excluded from passing evidence. New owned resources are all attempted
during cleanup, with aggregated errors. Default student-only Firefox behavior stays
unchanged unless the staff flag is true.

Artifacts include `/tmp/tsa-student-firefox-evidence/staff-review-preview-desktop.png`
and `staff-review-preview-narrow-500.png`. Formal screen reader/native zoom/WCAG
checks remain MANUAL_CHECK_PENDING. Final independent Firefox-slice review and
clean-checkout reproduction follow below when executed.

Final optional Firefox slice independent review: `/root/lifecycle_review` inspected
cookie isolation, exact-version loading, output, actual-width reporting, Escape/
logout and cleanup; no findings. Syntax/scoped whitespace PASS. It did not run
Firefox; delegate execution above remains separately attributed.
