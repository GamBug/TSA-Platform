# RECOVERY-004 — isolated portable working-tree reproduction

Date: 2026-11-02 Asia/Bangkok. Root accountable; navigation worker owns only
temporary snapshot/evidence, no repository implementation edits. Source branch
`feat/track-b-data-auth`, HEADa70861a plus inherited/uncommitted engineering changes.
This is not a Git clean checkout, release commit or production deployment.

## Isolation and source inventory

Snapshot `/tmp/tsa-recovery-portable-004` contains314 source files/5,672,912bytes.
Original node_modules, generated dist, .git, .local and all data were excluded.
Source manifest `/tmp/tsa-recovery-portable-004-evidence/source-manifest.json` has
SHA-256 `e00f5770e8cbde51dcb8dabbc9eb84b6b01c6d5f56dc3e195fdd534b1f245a59`.
Worker copied regular source bytes without hardlinks and installed dependencies
inside the copy. Root independently checked all314 source hashes and confirmed
dependency symlinks resolve within the isolated snapshot; .git/.local/data absent.
No raw captures or private staging content were copied.

## Commands and actual results

Node24.18.0/npm11.16.0, installed PostgreSQL18.6. Worker reports successful initial
`npm ci --ignore-scripts --offline` (24 packages added, zero vulnerabilities),
build, emitted/staff2 tests, consumers12, upgrade1, Factory→Bank1 and student
domains78response checks. Initial stdout/stderr was not saved. These initial
outcomes remain worker-reported tool observations, not reconstructed logs.

Root requested persistent evidence. Worker performed this fresh sequence in the
snapshot, stopping on failure:

| Exact command | Result with saved stdout/stderr/exit code |
| --- | --- |
| `npm run build` | Exit0 |
| `node --test tests/integration/assembly/reading-experiment-upgrade.test.mjs` | Exit0,1PASS/0FAIL |
| `PG_BIN=/usr/lib/postgresql/18/bin npm run test:student:domains` | Exit0, Chrome156.0.8078.47,78checkedAPIresponses; independent domain clocks, save/reload/submit/replay/grading/history |

Persistent rerun evidence: `/tmp/tsa-recovery-portable-004-evidence/fresh-key-rerun/`
contains `results.json`, stdout/stderr files and log SHA-256 manifest. Stderr is
empty for all three. Initial summary is `/tmp/tsa-recovery-portable-004-evidence/SUMMARY.md`.
The root-workspace explicit Chrome149 runs remain separately attributed; this
snapshot run used the harness default and actually reported Chrome156.

## Acceptance and limits

This establishes portability of the copied engineering tree for the executed
commands, including untracked migration/tools/tests; it does not make HEAD alone
reproducible. No full suite/Firefox/manualAT/load/liveprovider/accepted-content or
production claim. Root verified inventory/isolation and inspected saved results,
but did not independently rerun all snapshot commands. No independent reviewer
ran the complete reproduction. Temporary evidence is supplementary; this record
preserves essential commands, versions, results and limitations if logs disappear.

RECOVERY-004 completed within scope. All temporary-workspace reservations released.
Next investigate authorized image delivery: an existing frozen attemptAsset route
already exists in routes/1; compare its contract and storage/rights prerequisites
before proposing any schema change or implementing it. Image placeholders are an
unimplemented capability, not an observed private-byte leak. Recommended existing
Codex available model/high for cross-layer authorization design, separate read-only
review. No paid API, commit/push/merge/deployment.
