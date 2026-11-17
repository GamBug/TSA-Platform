# Current engineering source reproduction

RECOVERY-024, November 5, 2026 (Asia/Bangkok), verified within the scope below. Root Codex accountable
operator; operation_review_final independently checks source/archive isolation.
Base `a70861a`, branch `feat/track-b-data-auth`, inherited changes preserved.
The older [portable reproduction](RECOVERY_PORTABLE_REPRODUCTION_2026_11_02.md)
predates later client/Factory changes and its temporary copy is absent.

## Frozen source and isolation

The checkpoint contains selected tracked and authored untracked engineering
source, required root manifests, tracked docs and authored docs. Original Git
metadata, dependencies, generated dist, all data/private staging, dotenv and new
unassigned research are excluded. Source symlinks/nonregular files are refused;
copies do not share original inodes. Archive/manifest/logs are retained privately
under `.local/recovery/`, outside the temporary source copy.

A fresh, unborn local Git index stages the selected source solely for existing
checker tests. It has no commit or remote and is not a clone or release ref.
Unchanged locked dependencies install offline with scripts disabled; source
prerequisites still include the installed Node/PostgreSQL/browsers and npm cache.
This is not a fully independent operating-system/bootstrap environment.

## First attempt: preserved failure

Artifacts: `.local/recovery/source-2026-11-05-tJb2Cf/`.
Selected source: 514 files / 8,151,492 bytes.
Manifest SHA-256:
`501c94cc2f185b1185cd8d9a3bb59fb5f663ee61aaf3a7b970356476f75b15d5`.
Source archive SHA-256:
`fe13e980c1a4cbadbecb5fa10ff0ec160ad347f87899e09fed250932b8443d0e`.

Install, build, typecheck, contract drift/tests, emitted tests, consumers,
prototype and offline tests passed. Checker tests then failed 4 PASS / 2 FAIL;
the runner stopped before realPG/privacy/browser stages. Its results.json and
separate stdout/stderr logs preserve those outcomes. Independent review confirmed
all source/archive hashes and isolation, no code-root omissions, and all five
installed dependency symlinks inside the copy. It diagnosed the three tracked
synthetic text fixtures as the checker failure; [repair evidence](RECOVERY_TRACKED_FIXTURES_2026_11_05.md)
records the exact-path correction and actual before/after tests.

The failed temporary copy was removed after its runner stopped; archive and logs
remain, with `retirement.json` recording removal. No first-attempt result is
substituted for a repaired-source pass.

## Repaired checkpoint and fresh results

Artifacts: `.local/recovery/source-2026-11-05-OlByfp/`.
Selected source: 516 files / 8,164,321 bytes, including the reviewed checker and
new regression. All files, including the three synthetic text fixtures, were
indexed in the temporary repository. Manifest SHA-256:
`712c2537d166d1601e2d524df4916b6ac9a208d41a0f6a375e6d20d2e5d9d657`.
Source archive SHA-256:
`f91db09c3dc4b0581596829f0b21a2bc6e2c025517dff3544e0b69f80fd7ded1`.

All 17 stages ran afresh from the new copy and exited 0. The table uses readable
CLI equivalents for expanded file selections; `results.json` retains each exact
argument list, cwd, PID, start/end time, status, stdout/stderr paths and hashes.
`run-verification.mjs` retains the selection recipe. Every child used
`PG_BIN=/usr/lib/postgresql/18/bin` and an empty `NODE_PATH`.

| Executed command or selection | Observed result |
| --- | --- |
| `npm ci --ignore-scripts --offline --no-audit --no-fund` | 24 unchanged locked packages installed; no fresh advisory audit claimed. |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm run contracts:check` | PASS |
| `npm run test` | 161 PASS, no failures/skips |
| `npm run test:built` | Emitted smoke and 2 staff tests PASS |
| `npm run test:consumers` | 12 PASS, no failures/skips |
| `npm run test:b0` | 49 PASS, no failures/skips |
| `node --test --test-concurrency=1 tests/ai/*.test.mjs tests/critical/persistent-api-*.test.mjs` | 84 PASS, no failures/skips |
| `npm run test:docs` | 7 PASS, no failures/skips; all selected source indexed |
| `node --test --test-concurrency=1 tests/integration/factory-bank-exam/*.test.mjs tests/integration/assembly/reading-experiment.test.mjs tests/integration/assembly/reading-experiment-upgrade.test.mjs` | 5 PASS, no failures/skips |
| `node --test --test-concurrency=1 tests/integration/student-runtime/*.test.mjs tests/integration/student-security/*.test.mjs` | 45 PASS, no failures/skips; actual process/restart/restore cases included |
| `node --test tests/critical/student-leakage.test.mjs` | 2 PASS; 156 actual HTTP responses, 53 private values, three domains/types/releases |
| `node --test --test-name-pattern='dedicated Factory LOGIN' tests/integration/grading/worker.test.mjs` | 1 PASS; 30 denials, two role contexts, all 68 application tables unchanged and legitimate grading succeeds |
| `STUDENT_BROWSER=/snap/bin/chromium STUDENT_ARTIFACT_DIR=<evidence>/browser npm run test:student:domains` | Chrome 156.0.8078.47, 78 validated responses, eight captures, independent 4/2/4 journeys and three 100% scores |
| `npm run contracts:consumer-check` | Both boundaries PASS |
| `npm run docs:check` | PASS, no errors; historical whitespace warning preserved, anchors NOT_CHECKED |

Tests ran sequentially. Root inspected command receipts, reports and one saved
catalog/history viewport. Nonfatal module-type warnings remain in saved stderr.
No numerical coverage percentage, load capacity or production-performance claim.

## Final integrity and cleanup

Root and actual read-only operation_review_final verified every copied source
hash against the manifest/archive, with zero unsafe entries, source symlinks,
original-copy hardlinks or code-root omissions. All five installed dependency
symlinks resolve inside the copy. Final log hashes match, the temporary working
tree has no source diff, and no timeout occurred. Only original `LAST_HANDOFF.md`
had changed during execution, for documented continuation state; remaining
coordination records were updated after verification. Embedded checker, tests
and runtime source match the frozen checkpoint.

The initial root post-scan incorrectly expected `.local` to remain absent after
all tests. The existing synthetic research test deliberately creates its parent
directory and removes the temporary child. Inspection confirmed exactly empty
`.local/reading-research`, no files/symlinks and no `data/`. The archive contains
neither directory; independent review confirmed this generated-state distinction.
No application test or input-selection rule was relaxed.

`post-verification.json` preserves final integrity/browser results. Checker
before/after diagnostics are retained under `diagnostics/`. Native runner
session 84158 ended exit 0. After final independent evidence review, the owned
temporary copy and generated dependencies were removed; `retirement.json`
records removal. Both source-only archives, manifests, exact command receipts,
logs and browser captures remain private under `.local/recovery/`.

Independent review is source/archive/evidence review, not an independent full
17-stage rerun. The copy has no released commit or remote and requires installed
system tools plus cached packages. This proves the selected engineering
checkpoint's reproduction; it does not make HEAD alone current, establish hosted
CI, exhaust every Bank/assembly/race/security case, provide human stock/AT
approval, settle production/traffic/data inputs or close full RP-07/MVP acceptance.
No paid provider, dependency-pin, app/runtime/schema/grant/research, commit, push,
merge or deployment change. Final root coordination/docs checks are recorded in
the task card and handoff.

## Dated dependency advisory review

RECOVERY-026 subsequently ran `npm audit --json` against the same package/lock
bytes, November 5, 2026, 04:49:45–04:49:46 UTC. Exit 0, empty stderr; the registry
snapshot reports zero known vulnerabilities at every severity across 25 reported
dependencies. No install, audit fix or package change occurred. This is dated
advisory evidence, not a general security or release guarantee.

Package SHA-256:
`73f149db93b96415145b59b0728a45bbf4d182e99e957a054913698a5407da4f`;
lock SHA-256:
`ae67701fff861b99f53a0c82033ad22e4a0841270d633f013edc36f60406edf3`.
Both match the frozen checkpoint and were rechecked unchanged after the query.
The artifact root above retains `dependency-audit.json`, empty
`dependency-audit.stderr` and `dependency-audit-receipt.json`, including exact
time/command/exit, input and output hashes. This later review is separate from
the original 17-stage offline verification; it does not alter that frozen source.
