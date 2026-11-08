# RECOVERY-006 — remaining local service verification

Date: 2026-11-02 Asia/Bangkok. Root sole verifier under autonomous recovery scope.
Previous goal turn made progress through four recorded recovery tasks. This batch
executes the remaining service suites needed to strengthen the current acceptance
matrix; it changes no application, question, contract, migration or test code.

Environment: existing Node24.18.0/npm11.16.0, PostgreSQL18.6 private disposable
fixtures, inherited working tree based on a70861a. No dependency install, provider
call, personal data, production database, commit/push/merge/deployment.

| Exact executed command | Observed result | Retained log |
| --- | --- | --- |
| `node --test tests/integration/database/foundation/*.test.mjs tests/security/auth/*.test.mjs tests/integration/local/*.test.mjs` | Exit0,57PASS/0FAIL/0SKIP | `/tmp/tsa-recovery-services-foundation.log` |
| `node --test tests/integration/attempts/*.test.mjs tests/integration/directory/*.test.mjs` | Exit0,37PASS/0FAIL/0SKIP | `/tmp/tsa-recovery-services-attempts.log` |
| `node --test tests/integration/grading/*.test.mjs tests/integration/results/*.test.mjs tests/integration/recovery/*.test.mjs` | Exit0,46PASS/0FAIL/0SKIP | `/tmp/tsa-recovery-services-grading.log` |

No concrete failures were found. The first group covers database immutability,
connection/recovery and local auth/workspace checks. The second covers attempt
start/save/closure boundaries, actual races and owner-scoped history. The third
covers queued grading transactions/worker behavior, expiry/recovery, released
results, and result/rights serialization. Exact cases and assertions remain in
the executed files; the counts are tests, not a full-Q or full-A–J acceptance rate.

These supplement [baseline results](RECOVERY_BASELINE_2026_11_02.md) and the
[invariant/scenario map](RECOVERY_ACCEPTANCE_MATRIX_2026_11_02.md). Bank161,
assembly85, student44, contracts161 and critical9 evidence remains in their
separate fresh records. Public-asset tests and the populated026 upgrade also have
separate records. No fresh source findings required another application repair.

## Acceptance limits and next work

This is root execution, not independent rerun/review of every test oracle. No full
Firefox/manualAT/load/complete Factory scheduler or provider A/B/I/J execution.
Synthetic rights/review fixtures do not supply actual lawful accepted inventory
or qualified human review. No full Technical MVP/production acceptance follows.

The concrete unimplemented media capability is under RECOVERY-005 proposal;
existing text-only validators/guards must remain until architecture disposition.
Human content/AT and production inputs remain external. Do not invent a defect
or add duplicate tests merely because no code failure was found in this batch.

RECOVERY-006 complete in the stated verification scope. Root owns coordination
updates; all verifier reservations released. Recommended next implementing agent:
existing Codex available model/high if selectable for accepted concrete gaps;
independent reviewer separately assigned for critical implementation. No paid API.
