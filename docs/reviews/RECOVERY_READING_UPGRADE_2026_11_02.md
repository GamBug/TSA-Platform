# RECOVERY-003 — populated025→026 preservation

Date: 2026-11-02 Asia/Bangkok. Root accountable; navigation worker owns only new
`tests/integration/assembly/reading-experiment-upgrade.test.mjs`. Existing
runtime/migration/contract bytes preserved. No equivalent populated025→026
boundary test was found in the scoped migration/assembly test search.

The test creates a real disposable database with migrations001–025. Existing
allocation/attempt/worker services create GRADED, queued SUBMITTED and IN_PROGRESS
attempts, including acknowledged answers and immutable scoring/assignment state.
It snapshots every existing application table as sorted JSONB before applying
only026; JSON conversion occurs in PostgreSQL to retain stored timestamp precision.

After migration it checks exact existing row digests, function definitions and
owners/ACL/security settings (only assembly_commit_personal's definition may
change), existing table grants, roles/memberships, schema/relation ACL/RLS and
policies. The new private registry is empty with owner-only table ACL; application
roles cannot SELECT it. The ordinary flag-off catalog remains old-only. Replaying
the migration writes no application rows and returns no applied migration; queued
pre-upgrade work can still grade. Cleanup attempts all owned resources even when
an earlier cleanup operation fails.

## Executed evidence

Existing Node24.18.0/npm11.16.0, PostgreSQL18.6, 2026-11-02:

| Agent / command | Observed result |
| --- | --- |
| Worker focused test | PASS1/1 |
| Root `node --test tests/integration/assembly/reading-experiment-upgrade.test.mjs` | PASS1/1, no skips; `/tmp/tsa-recovery-upgrade-final.log` |
| Root `npm run test:assembly` | PASS85/85, no skips; `/tmp/tsa-recovery-assembly-final.log` |
| Independent baseline_scout `PG_BIN=/usr/lib/postgresql/18/bin node --test tests/integration/assembly/reading-experiment-upgrade.test.mjs` | PASS1/1, no concrete review findings |
| Scoped `git diff --check` | PASS |

Final independently reviewed SHA-256:
`22c5c2104ce75407e92085d4bbef8ea3132adff769b9d3e9eb943edb19a2ba92`.

Root requested cleanup correction before release; final independent review
confirmed all resources are attempted. Reviewer limitation: each newly added
helper's ACL is not individually asserted by this test. It checks existing
metadata preservation and the new table ACL, not all new-function privilege
behavior. Prior focused Reading20 tests retain their separate evidence.

This is local synthetic upgrade evidence, not hosted/online migration, rollback,
full binary compatibility, human acceptance or production readiness. No browser
rerun required for this test-only addition. No commit/push/merge/deploy. Writer
reservation released; next work RECOVERY-004 isolated portable source reproduction.
Recommended inherited Codex available model/high for integrity/reproduction work,
separate read-only review; no paid API.
