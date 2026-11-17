# RECOVERY-001 — inherited working-tree baseline

Date: 2026-11-02 Asia/Bangkok. Root Codex accountable under the owner's explicit
autonomous execution/subagent instruction recorded in decisions. Base branch
`feat/track-b-data-auth`, HEAD `a70861a`. No commit, push, merge or deployment.

## Scope and provenance

This reproduces the inherited working tree, not HEAD alone and not a clean-clone
release. The initial audit found 13 modified tracked paths and 17 untracked
entries before audit documentation was added. Existing runtime edits belong to
the Reading20 experiment; tools/tests/evidence and captured research also remain
uncommitted. No inherited source, raw capture or owner change was reset/staged.

[Engineering snapshot](RECOVERY_RUNTIME_SNAPSHOT_2026_11_02.json) records SHA-256
for 33 modified/untracked runtime, migration, tool, test and script files at this
checkpoint. It excludes documentation, private data and ignored artifacts. It is
an integrity inventory, not a complete portable archive. Retain existing tracked
base and all listed engineering files to reproduce these results.

Root changed only three Bank test expectation arrays and the student browser test
harness; the navigation worker changed README and created the acceptance matrix.
Root also owns the guide, this evidence and coordination records. Existing runtime
and migration026 behavior were preserved. No shared contract or dependency change.

## Concrete failures and repairs

1. Initial `npm run test:bank` failed 3 of 161 tests because upgrade receipt arrays
   stopped at migration025; actual migration026 was correctly applied. Append026
   to each explicit expected list in bank, equivalence-history and publication-boundary
   tests. Preserve all data/rights/privilege assertions and fixed historical boundaries.
2. Initial three-domain browser failed before navigation: Playwright Chrome149
   reported “No usable sandbox” on this host. A direct invocation reproduced exit134.
   The student test harness now accepts strict `STUDENT_BROWSER_NO_SANDBOX=true`
   opt-in, leaves default sandbox behavior intact, and reports early browser exit
   code/signal/stderr. The guide documents this synthetic-test option.
3. README no longer claims that allocation/scoring/browser integration is absent.
   It distinguishes B0 mock, retained empty-catalog mode and disposable synthetic
   PostgreSQL demonstration while preserving real-content and production gates.

## Fresh verification

Existing Node24.18.0/npm11.16.0; Linux user1000; installed PostgreSQL18.6 default
harness path `/usr/lib/postgresql/18/bin`. No dependency installation or provider
call. All commands executed 2026-11-02; final commands below exited0 unless noted.

| Command | Observed result |
| --- | --- |
| `npm run build` | PASS |
| `npm test` | 161 tests PASS, no skips |
| `npm run test:assembly` | 84 tests PASS, no skips |
| `npm run test:student` | 44 tests PASS, no skips; includes logical restore/process recovery and pool security |
| `npm run test:factory:reading` | 19 tests PASS, no skips; canonical DRAFT/Bank/Reading20 integration |
| `npm run test:bank` | Initial158PASS/3FAIL (migration receipt lists); final161PASS/0FAIL/0SKIP |
| `npm run test:critical:student` | 9 tests PASS, no skips; bounded service/HTTP generated lifecycle |
| `npm run test:built` | Emitted smoke and 2 staff tests PASS |
| `npm run test:consumers` | 12 tests PASS, no skips |
| `npm run contracts:consumer-check` | Student and public-app boundaries PASS |
| `npm audit --json` | Exit0; 0 known vulnerabilities across25 dependencies; `/tmp/tsa-recovery-audit.json`. Registry advisory snapshot, not a complete security guarantee. |
| `PG_BIN=/usr/lib/postgresql/18/bin STUDENT_BROWSER=/home/wolfleo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome STUDENT_BROWSER_NO_SANDBOX=true npm run test:student:domains` | PASS Chrome149, 78 checked API responses, 8 captures; independent MATH4/READING2/SCIENCE4 save/reload/submit/result/history |
| `PG_BIN=/usr/lib/postgresql/18/bin READING_FACTORY_BROWSER=/home/wolfleo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome npm run test:factory:reading:browser` | PASS Chrome149, all20 saves/reload, 100% result, 20 released explanations, 5 captures; no live LLM |

Preceding AUDIT-001 also ran docs/typecheck/contract drift, B0/scoring and offline
Reading41 successfully; attribution remains in the audit. Bank final log:
`/tmp/tsa-recovery-bank-final.log`; critical log `/tmp/tsa-recovery-critical.log`;
browser logs `/tmp/tsa-recovery-domains.log` and
`/tmp/tsa-recovery-reading-browser.log`. Logs/screenshots are temporary evidence.
Browser reports/captures: `/tmp/tsa-student-browser-evidence/domains/` and
`/tmp/tsa-reading-factory-browser-evidence/`. Root visually inspected the catalog/
history capture and narrow Reading20 question capture; not a full visual audit.

Nonfatal Node warning: public `.js` ESM has no package type and is reparsed;
no root package-type change inferred from that warning.

## Review and limits

Actual independent read-only `baseline_scout` reviewed README, final harness,
three Bank expectation changes and the acceptance matrix: no actionable findings.
It ran browser-script syntax, scoped whitespace and docs checks successfully.
This was source/document review, not independent PG/browser reproduction. The
navigation worker implemented only README/matrix and checked links/path existence.
No reviewer model/reasoning identity beyond the actual inherited agent is claimed.

[Acceptance matrix](RECOVERY_ACCEPTANCE_MATRIX_2026_11_02.md) supplies RP-02's
Q-01–Q-16/A–J navigation groundwork. Its historical rows are not all freshly
executed tests. Remaining Q-08 audit scope must first be checked against existing
coverage; absence from a summary is not evidence of a product defect.

NOT RUN here: full Firefox/manual AT, formal load, complete A–J/full Track A,
production identity/hosting/privacy/retention and clean-clone reproduction with
this uncommitted snapshot. Human content approvals remain absent; no accepted
real inventory or full MVP/production completion is claimed.

RECOVERY-001 baseline is complete within this scope. Next: bounded Q-08 discovery
and actual regression for a concrete gap if found, then record remaining acceptance
work. Recommended implementer: existing Codex available model/high for privacy
boundary work, with separate read-only review; no paid API. All baseline writer
reservations released.
