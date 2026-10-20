# Latest handoff — staff and canonical draft ingestion verified

2026-10-20, Asia/Bangkok. Owner scoped DATA-001/AUTH-001 approval is recorded in
[decisions](../decisions/OPEN_DECISIONS.md#data-001--auth-001--scoped-local-track-b-approval-2026-10-19).
G1 remains ACCEPTED; G2/G3 unchanged. Branch `feat/track-b-data-auth`, base
`446277f`. Owner AGENTS.md hash remains `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`; excluded from commits.

DATA-001 local foundation accepted: bank core `7885331`, followed by migration002
and its exam fixtures/tests. Luna/XHigh implemented; Sol/Medium independently
reviewed actual code and required bounded SQL, null-check, snapshot/aggregate,
clock-after-lock, role/RLS, immutable-child and fixture-isolation repairs.
Final `npm run test:db:foundation`: 34 reported tests PASS on PostgreSQL18.6,
zero failures/skips. Fresh/populated upgrade, FK/unique/immutable failures,
sealing/grading rollback, private-role boundaries, both H1 mode winner barriers,
distinct users/rollback, cancel/start and stable-history serialization, immutable
600/capped deadlines and receipt/history preservation after expired cleanup pass.
This accepts schema/adapter and fixture transaction mechanisms, not allocation,
cleanup or grading services, rights fan-out or deployment. Unknown legacy lexical
timestamps/xids remain NULL; no original identity evidence fabricated.

Root pg8.23.1 is exact-pinned; 14 added packages/license texts checked, previous
seven versions unchanged, npm audit zero registry advisories at query time. See
existing dependency review increment. No ORM/framework, accepted-contract or
frontend change. Typecheck/build/emitted smoke, contract/emitted consumer/B0 tests,
drift/import/docs/diff pass. Restricted subprocess/socket runner failed; managed
permitted rerun produced actual nested passing tests, not a clean restricted-CI claim.

AUTH-001 local development sub-acceptance is verified: migration003, guarded
synthetic-only identity service and real HTTP/PG tests. Independent `test:auth`
5/5 and `test:db:foundation` 34/34 PASS, including production-process override
refusal, role/ownership/session/CSRF negatives and private DB credential boundaries.
Test ownership routes are harness-only; production OIDC/MFA/issuer/redirect
acceptance and actual exam APIs remain unimplemented. See backlog for exact scope.

Clean archived `6f73272` independently verified with pinned Node24.18.0/npm11.16.0:
`npm ci --ignore-scripts --offline --cache /tmp/tsa-track-b-pg-npm-cache`, typecheck,
build/emitted smoke, 106 contract/11 emitted-consumer/11 B0/5 AUTH/34 DB tests,
contract drift and import boundary all PASS. No dependency graph change after the
previous pg license/advisory review. Archive docs check lacks Git metadata and
emitted a Git warning; repository `npm run docs:check` was separately rerun PASS
(49 Markdown files, 238 links, zero errors). No hosted-CI claim.

AUTH acceptance is committed as `6f73272`. BANK-001 manual ingestion is independently
verified: Bank10/10, DATA34/34 and AUTH5/5 PASS on actual PostgreSQL18.6/HTTP.
Luna/XHigh implementation; coordinator review required target-specific receipts,
private namespace snapshots, UUID→code taxonomy mapping, exact timestamps,
exclusive bank guard, dependency probe repairs and deterministic lock-barrier tests.
Fresh migration initially failed on an incorrect form-slot column join; repaired
query and full database/security regressions now pass. Populated003→004 preserves
unknown legacy origin/creator and student/staff receipts. No passing restricted-CI
claim. Accepted contracts/exports and owner AGENTS bytes remain unchanged.

Manual source/version and BANK_MANAGER rights registration, AUTHOR immutable
MANUAL/IMPORTED drafts/revisions and staff metadata-only listing are real SQL-backed
commands. Question keys/evidence graphs remain private. Duplicate flags remain OPEN;
no automatic equivalence confirmation/merge or publication occurs. Rights edits
with selected-content dependencies fail closed, not an implemented hold/fan-out.
The manual checkpoint did not accept Factory receipts; that bounded transport
is verified below. Arbitrary manual stimulus import and BANK-002 publication
remain separate work. The persistent same-app staff workspace is now verified. Named independent human review and lawful
inventory still gate publication; real exam services have not been implemented.

One writer at a time; default Luna/XHigh, Sol/Medium
independent review/integration. Terra/Medium completed a read-only canonical transport mapping plan; bounded
implementation follows only after Luna released ownership. No Astra,
push/merge/deployment/paid API.
Existing frontend remains `npm run dev:b0` at http://127.0.0.1:4173, explicitly mock.
Human review/publication and lawful inventory remain separate prerequisites.

## Same-app staff checkpoint (2026-10-20)

Manual Bank baseline is `679c380`. Luna/XHigh implemented only existing frontend,
local composition, focused tests and browser harness; Sol independently reviewed
code and required private-path, no-TCP, cleanup, factual source hashing, role-error
and idempotent retry repairs. Root owns scripts/shared records. No dependency,
schema or accepted-contract change. Owner AGENTS hash above is still identical.

Independent `npm run test:local` PASS13/13, `test:b0` PASS11 nested tests,
`test:track-b:browser` and `test:b0:browser` PASS on Chromium155. Public app import
scan via `scanConsumerTree("apps/practice-prototype/public")` returned zero
violations. Desktop/mobile staff screenshots under
`/tmp/tsa-track-b-browser-evidence`; coordinator visually inspected mobile editor.
Actual `NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true npm run dev:track-b`
started on 127.0.0.1:4174, returned Vietnamese HTML200 and stopped gracefully on
SIGINT. Local startup retains its owned `.local/track-b` data; no TCP PG listener.
No hosted-CI claim. Transient transcripts: `/tmp/tsa-local-independent.log`,
`/tmp/tsa-staff-browser-independent.log`, `/tmp/tsa-b0-local-independent.log`.

Demonstrate: staff workspace → synthetic AUTHOR → edit existing private fixture
→ create DRAFT → reload/list → logout. Real PG-backed auth and Bank APIs are
composed with separate restricted role pools; owner migration pool closes before
requests. Production/unknown modes refuse before filesystem/network effects.
Source is EXTERNAL/unverified with UNKNOWN rights and actual fixture bytes hash;
no questions auto-seeded. Candidates cannot read draft/template data. Retry after
lost successful response creates one version. Existing exam remains explicitly
in-memory mock, with no real allocation/attempt/scoring or publication claim.

Staff checkpoint committed as `021dec0`. A fresh local Git clone at this commit
(`/tmp/tsa-staff-clean-hoh1v03z`) independently passed `npm ci --ignore-scripts`,
typecheck/build/emitted smoke, 106 contract tests, 11 emitted-consumer tests,
drift/import checks and repository docs checks. Offline npm ci first failed
ENOTCACHED for zod4.1.12; permitted installation fetched pinned missing packages,
installed22/audited24 and reported zero advisories at query time. No lockfile
change. Log `/tmp/tsa-staff-clean-verification.log` includes both outcomes.
Bank10 and AUTH5 regression checks independently pass after staff integration.
The docs check initially encountered the ignored persistent cluster during its
restricted fallback walk; its existing ignored-directory list now also excludes
`.local`, and both repository/clean-clone checks pass. Owned PG process/socket and
startup lock were released after the exact CLI verification; persistent data is
retained and ignored. Current managed sandbox controls were respected; local
socket/process/Git actions used permitted escalation, with no policy changes.

## Canonical draft ingestion checkpoint (2026-10-20)

Accepted code `d376791`, following staff `021dec0` and manual Bank `679c380`.
Terra/Medium implemented the complex opaque-ID/immutable graph normalization and
atomic receipt checkpoint; Luna/XHigh completed missing tests and replay repairs.
Sol independently reviewed the complete diff and extended actual SQL role-denial
checks across every new private table for web/Factory/exam/identity credentials.
All writer reservations released. No new dependency, contract/export/public route,
provider call, human approval or gate transition occurred.

Migration005 stores private immutable manifests, exact receipts, opaque reference
mappings, verified raw asset bytes and external run evidence. Normalized SQL rows
preserve original authored question identity, raw timestamps, ancestry/origin and
private canonical DAGs. Unknown authors/taxonomy fail closed. Complete declared
packages import atomically as DRAFT; machine FAIL/INCONCLUSIVE never approves.
Package rights remain unverified private claims; no human rights decision, current
source-rights grant, eligible pointer, confirmed duplicate group or review is
created. Source/artifact containers are explicitly unverified EXTERNAL. Receipt
FKs bind the correct question/version/hash and manifest. Stored graphs/mappings/
bytes are verified before replay; exact replay preserves original receipt order
and permits subsequent workflow changes. New drafts do not erase older eligible
versions. Cross-batch exact ancestor reuse is verified; candidate collisions reject.

Independent final observed checks, Node24.18.0/npm11.16.0/PG18.6:

- `npm run test:bank`: **21/21** (10 manual +11 import), zero skips/failures.
  Includes actual authenticated HTTP correction, nanosecond lexical timestamp and
  hash/fingerprint reconstruction, v3→v2→v1 ancestry with distinct stimulus/parent
  provenance and assets, two observed blocked import workers, exact replay,
  changed/tampered/missing/corrupt graph/byte negatives, late second-candidate
  SQL23505 whole-unit rollback, populated004→005 preservation and receipt FK negatives.
- `test:db:foundation` **34/34**, `test:auth` **5/5**, `test:local` **13/13** PASS.
- Typecheck/build/emitted smoke, contracts **106**, emitted consumers **11**, B0
  **11**, generated drift/import checks and docs/diff checks PASS. Restricted
  consumer execution returned only two failed file wrappers; managed permitted
  rerun produced actual nested passes. This is not a clean restricted-CI claim.
- `test:track-b:browser` PASS on Chromium155 after005. Existing B0 Chromium
  journey also passed in this batch. Public app static import scan passed and is now registered in the root
  `contracts:consumer-check` command using the existing checker.
- Fresh Git clone of `d376791` at `/tmp/tsa-bank-clean-5h4lr8d9` passed pinned
  `npm ci --ignore-scripts --offline --cache /tmp/tsa-track-b-pg-npm-cache`, all
  build/contract/consumer checks above, Bank/DATA/AUTH/local/B0 and docs checks.
  Log `/tmp/tsa-bank-clean-verification.log`. No hosted CI observed.
- Exact `NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true npm run dev:track-b`
  upgraded retained local001–004 data to005 and served `/local-auth/session`200
  on127.0.0.1:4174. Ctrl+C removed postmaster.pid/startup lock and retained data.
  Root transcripts `/tmp/tsa-factory-final-*.log` are transient; commands/results
  above are the durable record. Historical whitespace warning remains unchanged.

Scope limits: trusted internal AUTHOR/operator capability plus restricted Bank
connection, not deployed Factory-service credential authentication. No public
asset serving/sanitization, upstream producer/export-unit completeness or
FACTORY-003/INT-002 acceptance follows from this checkpoint. No publication,
approved production inventory or real allocation/attempt/scoring API exists.
The frontend practice exam remains explicitly mock; only staff identity and Bank
persistence are integrated. G1 ACCEPTED; G2/G3 remain unestablished.

## Next action — genuine human prerequisites

No further READY implementation in the approved local batch precedes the named
human review/inventory prerequisites. BANK-002 explicitly requires a named
independent human review process; DATA-003/002 require distinct human author and
reviewer plus lawful stock authorization/evidence. Synthetic role profiles cannot
satisfy these. Ask the owner in one packet to name the author/rights attestor and
an independent qualified reviewer and authorize original/lawfully cleared stock
under existing contracts/12-MATH,6-READING,12-SCIENCE targets. Do not fabricate legal
rights, human reviews or whole-ADR approval. Then implement BANK-002 while humans
prepare DATA-003/002; verify controlled publication and obtain G2 disposition before
eligible assembly/attempt/closure/scoring and existing-frontend B1 integration.
Keep independent MATH4/READING2/SCIENCE4 attempts; no combined ten-question attempt.
Lightweight Track A source/quality/taxonomy/rubric preparation remains in roadmap;
no provider work, download, scraping or benchmarking was added.

## Previous accepted checkpoint (historical; scope blocks superseded above)

# Latest handoff — G1 accepted / Track B bounded batch verified

2026-10-19, Asia/Bangkok. Owner: G1 ACCEPTANCE AND TRACK B EXECUTION;
[authority](../decisions/OPEN_DECISIONS.md#g1--owner-acceptance-and-bounded-track-b-execution-2026-10-19).
G1 ACCEPTED in `27350b3`; FOUND-002 COMPLETED against implementation `0e67485`
and audit `81ef8aa`. G2/G3 remain unestablished; no unrelated whole ADR approved.

## Checkpoints and ownership

Branch `feat/track-b-b0-prototype`. `27350b3` records G1 only; `237da9c` preserves
the existing B0 separately. B0.1 is `06849d0`; the following local prerequisite
checkpoint contains its tests/readiness records (find hash in Git log). Owner
AGENTS.md is unchanged/excluded, SHA-256
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.

One reused native tsa_builder, Codex Luna / XHigh, implemented B0/B0.1 inside
`apps/practice-prototype`; Sol 6.1 / Medium independently inspected code/diffs,
ran actual Node/browser verification and owns root scripts/shared records.
The same worker then implemented the three disposable PostgreSQL probe files;
Sol independently reviewed and required cleanup/concurrency evidence repairs. All
reservations released. No extra explorer, Terra/Astra, dependency/lockfile/
accepted-contract change, push, merge, deployment or paid API.

## Runnable result

Same dependency-free Vietnamese frontend: landing/catalog, MATH fixture navigation,
answer selection/clearing and count, monotonic demonstration countdown, save/error
feedback, submission summary/confirmation and score. Reload visibly resumes the
same in-memory attempt, original deadline and acknowledged answers. Explicit
post-grade review displays the original fixture answer/explanation on a separate
screen; active/cancelled/foreign sessions cannot read that review. Ordinary result
responses remain score-only. Focus restoration and a semantic main landmark added.

All four slots repeat the original English synthetic fixture, visibly disclosed;
Reading/science unavailable. Cookie/session, attempts, saves, score and released
review are local mock services, not production auth, durable DB, approved content,
NEW_ONLY allocation or integrated backend acceptance. No fresh content invented.

## Independent evidence

Node v24.18.0/npm 11.16.0; Chromium 155.0.8059.79, Linux.

- `npm run test:b0`: 11 actual nested tests / 2 suites, zero failures/skips.
- `npm run test:b0:browser`: PASS, clear/re-answer, reload same attempt/deadline,
  active review 409, post-grade original explanation and back-score; pointer/radio
  keyboard, navigation retention, ticking clock, held-save guards, offline failure/
  retry, confirmation, result 25.00%, explicit new demo. No uncaught exceptions,
  external page requests or private pre-submit response fields.
- Desktop 1280x900/mobile 375x812 no horizontal overflow; eight screenshots in
  `/tmp/tsa-b0-browser-evidence`, review-mobile visually inspected by coordinator.
- Final batch independently reran typecheck/build/emitted smoke, 106 contract and
  11 emitted-consumer tests, 11 B0.1 tests, drift/import checks: all PASS. Contract
  tree/lockfile still identical to audited `0e67485`. Local transcript:
  `/tmp/tsa-track-b-final-verification.log` (transient; commands/results are durable here).
- Final docs/new-file whitespace/diff checks pass; historical whitespace and non-failing browser-ESM
  Node auto-detection warnings retained. Hosted CI not observed.

## Run and continue

From repository root: `npm run dev:b0` → http://127.0.0.1:4173.
No installation/build needed for B0; `PORT=4174 npm run dev:b0` for another port.
Browser check needs existing Chromium; B0_BROWSER selects its executable. Start
catalog → answer/clear/navigate → reload/resume → confirm submission → review
explanation → return to score/catalog/new demo. Original test text remains English;
navigation and notices are Vietnamese.

## Database prerequisite outcome and next scope

`npm run test:db:preflight` independently PASS on installed PostgreSQL 18.6:
11 named invariant checks in a new private cluster, Unix socket only. Both inverse
cross-mode same-user races observed actual Lock waits before winner commit and
loser SQLSTATE23505; separate distinct-user connections committed while the winner
remained uncommitted. Terminal replacement, rollback, full600/capped300 deadlines,
NULL/bad interval/TTL rejection, immutable creation fields and strict < boundary
PASS. Owned cluster/socket removal and no leftover task-owned server verified;
missing binaries explicitly fail rather than skip/pass. Worker’s initial restricted
socket failure was not accepted evidence; permitted run exposed/repaired a helper
default-argument bug, then coordinator independently verified final behavior.

Probe files under `tests/integration/database/approved-invariants` are fixtures,
not production migrations. No real application DB integration, start transaction,
mutable availability-edit transaction, complete FK/history/upgrade schema or auth
is accepted from them. Full DATA-001 remains incomplete.

All currently authorized READY tasks in this bounded batch are complete.
DATA-001 full schema/adapter still
requires affected ADR-001/003 disposition; AUTH-001 requires explicit local
synthetic-only stub approval. Bank stock needs rights evidence and named independent
human review/publication; assembly/attempt/scoring follow their gates. Ten-question
B1 target does not authorize a combined 4/2/4 domain attempt.

Track B remains ~85% priority; lightweight source/quality/taxonomy/rubric preparation
is in the roadmap without downloads or benchmarking. Prior handoff checkpoints:
`237da9c` B0; `81ef8aa` final audit; `0fc75d8` Stage 4B; `8beb0ff` Stage 4A;
`84ddff3` Stage 3. Consult decisions, not historical pending-G1 phrases, for current
approval. Full deployed security/DB/publication/WCAG evidence remains later work.
