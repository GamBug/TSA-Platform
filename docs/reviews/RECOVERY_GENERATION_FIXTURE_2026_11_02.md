# RECOVERY-008 — generic provider-free generation prerequisite

Date: 2026-11-02 Asia/Bangkok. Root accountable, navigation implementing agent,
baseline_scout independent read-only reviewer. Existing owner autonomous local
engineering authority applies; no new canonical schema/storage decision selected.
Start: feat/track-b-data-auth/a70861a plus preserved inherited/recovery changes.

## Implemented behavior

New `src/modules/generation/fake-adapter.mjs` provides
`createFakeGenerationAdapter(cases)` over existing G1 GenerationRequest,
ProviderResult and ProviderError. It exposes the specified generate/capabilities
operations, uses explicit in-memory fixture cases, and matches exact request and
approved-source JSON. Object key order is immaterial; array order remains exact.
Duplicate matches and malformed fixtures reject before adapter construction.

Successful fixtures must explicitly declare the fixed fixture model revision,
null provider run reference, and actual zero provider tokens/cost. Apparently real
or unknown/nonzero provider metadata rejects instead of being normalized into
fake provenance. COMPLETE/count, TRUNCATED and REFUSED semantics are checked.
Candidate JSON stays untrusted; no question validity, correctness, rights,
equivalence, review, import, approval or publication is inferred.

Scripted typed errors cover the existing six codes. Runtime invalid or unmatched
inputs return constant safe errors without copying source/candidate data into
messages. Cancellation rejects with AbortError control flow, not a fabricated
ProviderError CANCELLED enum. No retry/sleep, credentials, external provider,
network, child process, file write, database or persistent budget is present.

Fixture input/output are deep snapshots. Returned values/capabilities are fresh
copies. Plain JSON validation rejects cycles, proxies, accessors and non-JSON
values without evaluating them; own __proto__ keys are copied as data properties.
Byte/node/depth/candidate limits are specific to this fixture implementation and
do not tighten the canonical G1 schemas.

Root owns new `test:generation` package script and
[operator/test guide](../guides/FAKE_GENERATION_ADAPTER.md). No dependency, lockfile,
student client, contract, Bank, migration or provider configuration changed.

## Verification and review

Existing Node24.18.0/npm11.16.0, built contracts, 2026-11-02:

| Actual check | Observed result |
| --- | --- |
| Worker `node --check` module and test | PASS |
| Worker focused `node --test tests/ai/fake-generation-adapter.test.mjs` | PASS10/10, no skips |
| Root `npm run test:generation` | PASS10/10, no skips; `/tmp/tsa-recovery-generation-focused.log` |
| Root `node --test tests/ai/*.test.mjs` | PASS51/51, no skips; existing manual/offline/research regressions included; `/tmp/tsa-recovery-generation-all-ai.log` |
| Root `npm run contracts:consumer-check` | PASS student/public-app boundaries; `/tmp/tsa-recovery-generation-boundaries.log` |
| Independent reviewer module/test syntax and focused suite | PASS10/10, no skips; no blocking correctness/privacy findings |
| Root scoped tracked diff and explicit new-file whitespace checks | PASS |

Reviewed SHA-256 values:

- Module: `0b53c41665f1dd4276fa4991617f7d6e8e0e04c4284cdb608a4e3f0f3d042cf1`.
- Test: `2eeed7e23d0802faa64fac71514da56bd2c6032092878e710083a23c765575e3`.

Root/reviewer found misleading metadata normalization and post-copy-only byte
limits in the draft. Worker corrected them and added provenance/bounds regressions
before final review. Final byte accounting is incremental, with array-length
rejection before own-key enumeration. Remaining reviewer caveat: plain-object
Reflect.ownKeys materializes its key list before a node-cap check. This is not an
external-input endpoint or a JavaScript sandbox; review accepted that caveat for
explicit local fixture use. Do not expose it directly to uploaded/provider data.

No PostgreSQL/browser rerun for this isolated fixture module: it is not wired into
runtime/student paths and makes no persistence/route/schema changes. Prior full
local service/browser evidence remains separately attributed. No live model,
paid API, human acceptance, commit/push/merge/deployment.

## Parent requirements and next action

RECOVERY-008 is complete; all implementation reservations released. This advances
AI-001's generic fixture-adapter prerequisite only. AI-001 durable jobs/run
provenance and two authorized real adapters/evaluation remain incomplete.
FACTORY-002 config/inventory/plan/atomic-budget-reservation interfaces and durable
schema are still proposed/unimplemented; the fake adapter is not a planner or
replacement for those requirements. Media proposal owner disposition and real
content/manualAT/production gates remain open.

Next useful preparation is a concrete Factory planner contract/reservation impact
proposal rather than inventing an unapproved schema in runtime code. Recommended
existing Codex available model/high if selectable for deterministic planning and
atomic-budget design, separate read-only review; no paid API.
