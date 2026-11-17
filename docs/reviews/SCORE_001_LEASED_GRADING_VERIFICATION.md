# Leased exam grading and atomic score release

2026-10-22, base `b094a6e`, `feat/track-b-data-auth`. Accountable Codex Sol owns
SQL014, transaction/rights/fault tests and integration; actual native Luna/XHigh
owns the pure scorer, internal worker adapter and isolated tests. Separate native
Sol6.1/Medium reviewed read-only. [Owner sustained scope](../decisions/OPEN_DECISIONS.md#sustained-grading-and-student-integration-continuation--2026-10-22).
G2/G3 retain [owner acceptance](../decisions/G2_G3_OWNER_ACCEPTANCE_2026_10_21.md).

## Implemented boundary

- New NOLOGIN `tsa_exam_worker` capability grants only claim/load/finish/fail
  functions. Provisioned worker login is separate from candidate/Bank/Factory
  credentials, with no raw private-table grants. Existing student command roles
  gain no worker authority. Legacy lease-context RLS now requires worker membership
  of session_user in addition to a live scoped job; direct legacy Bank-secret
  SELECT for `tsa_exam` is revoked. Existing privileged foundation fixtures remain
  trusted operator tests, while real unprivileged student negatives fail closed.
- Claims use job row locks and SKIP LOCKED. Explicit executor, lease1–300 seconds
  and retry1–3600 seconds are local/test configuration, without production defaults.
  Expired leases reclaim with monotonic fencing tokens and bounded attempt counts;
  exhausted crashed leases become FAILED_FINAL without another grading attempt.
- Load/finalize/failure lock shared Bank guard → attempt → job, check fresh lease
  owner/token/time and current holds before private access. Only the leased frozen
  snapshot/answer input is returned to a trusted worker. Factory jobs are excluded.
- JS scorer validates all three interaction types and corrupt input. Missing,
  cleared or partial answers score zero; multiple choice compares sets; no partial
  credit, penalties, official equivalence or aggregate domain score. Integer
  quotient/remainder half-up arithmetic gives1/3="33.33",1/32="3.13".
- SQL independently recomputes typed earned items, exact aggregate/percentage and
  ordered frozen digest before accepting worker output. Score run/items, release,
  GRADED transition, successful job and service-actor audit commit atomically.
  No historical snapshots/answers/scores are rewritten.
- Stale lease tokens cannot read/finalize/fail another claim. Actual end-of-write
  lease check and deferred COMMIT guard prevent a score from committing after an
  expired lease. Duplicate completed finish returns metadata without another score.
- Code-only failure state/retry metadata and audit contain no question/key/answer
  content. Malformed persisted input/digest fails final without a fabricated score.
  Rights-first cancels pending grade; grade-first remains immutable but subsequent
  hold invalidates the attempt and revokes release.

No public contract, table, frozen solver or student grading endpoint is added.
There is no unattended scheduler, heartbeat, expiry sweep or operator retry UI.
Worker role/credentials need explicit operator provisioning; no deployment occurs.

## Actual verification

Node24.18.0/npm11.16.0/PostgreSQL18.6, disposable synthetic fixture databases.
Existing scoped Bank ingestion/review/publication test workflow is reused; no
real human content evidence is supplied by agents. PostgreSQL commands used
permitted execution for socket/network fixtures.

| Command | Observed result |
|---|---|
| `npm run test:grading` | Final21/21 PASS: 19 real PG cases and2 adapter unit cases |
| `node tests/scoring/binary.test.mjs` | 5/5 named tests PASS |
| `npm run test:scoring` | PASS; wrapper reports1 test-file result |
| `npm run test:attempts` | Independent28/28 PASS |
| `npm run test:bank` | Independent94/94 PASS |
| `npm run test:assembly` | 23/23 PASS |
| `npm run test:db:foundation` | 34/34 PASS |
| `npm run test:auth` | 5/5 PASS |
| `npm run test:local` | 13/13 PASS |
| `npm run test:b0` | 16/16 PASS |
| `npm test` / `npm run test:consumers` | 106/106 and11/11 PASS |
| Build/typecheck/emitted smoke/drift/import checks | PASS |
| Documentation check | Existing owner research issues retained |

Real PG evidence includes seven required persistence failures (score, item,
release, attempt, job, audit, deferred COMMIT) with no partial score/release;
lease expiry during writes and deferred COMMIT; real-time retry/backoff/exhaustion;
bad initial queue digest without rewriting immutable dispatch; both rights/grade
lock winner orders; two students claimed while the first claim remains uncommitted;
SQL/JS parity for all interaction types; direct raw-key/worker-command negatives.
The decisive role regression uses an actually RUNNING job with a valid matching
executor/token and future expiry, then proves student GUC spoofing yields no
private form rows and no raw Bank key/worker-function access.

## Independent review and observed repairs

Separate read-only Sol6.1/Medium independently passed final grading21/21, direct
scorer5/5 and scoped whitespace check; earlier independent attempts28/Bank94 also
passed. No open concrete P1/P2; reviewer edited no files. This is engineering
review, not qualified human question or source-rights approval.

Initial grade finalization failed because audit lacked an actor; repaired using
the existing service_actor field and configured EXAM executor identity. A privilege
probe incorrectly needed private-schema name resolution; replaced with direct
denied-access assertions. The initial spoof test ran after FAILED_FINAL and did
not prove membership enforcement; replaced with the independent live-lease test.
Finish digest error mapping/executor validation were aligned with SQL. Corrupt
fixture response is introduced while open via normal answer revision trigger,
then legitimately frozen; no immutable question/key/snapshot trigger is disabled.
Failed initial runs are not reported as passing evidence.

Owner AGENTS SHA remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
Recovery `/tmp/tsa-grading-preserve/` is transient. Owner UI/README/research and
shared records remain unstaged. No push/merge/deploy/Astra/paid model API/live
student LLM, production publication or G1 change. Browser NOT RUN; hosted CI NOT
OBSERVED. Documentation checking retains the known owner research whitespace and
four absent temporary screenshot links.

## Next

PostgreSQL now demonstrates allocation → start/read/save → closure → leased grade
→ immutable score plus authorized release. Student result transport and prototype
integration remain next; expiry sweep/operational recovery are still incomplete.
Continue owner-only released GET using the frozen final guard and released-review
DTOs, current rights/release checks, safe404/409/410 and no pre-release keys. Then
integrate the local student server without UI reconstruction. G1/G2/G3 retain
their owner dispositions; lawful inventory and qualified per-question review
remain required by unchanged publication controls. Track A remains separate.
