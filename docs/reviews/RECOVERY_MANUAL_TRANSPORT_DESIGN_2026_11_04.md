# RECOVERY-019 manual DRAFT transport design review

Date2026-11-04 Asia/Bangkok. Root accountable designer/sole document writer;
response_review actual independent read-only source/design reviewer. Branch
feat/track-b-data-auth/basea70861a with inherited uncommitted changes preserved.
Scope is documentation preparation only; no parser/export/import/DB/grant changes,
actual manual Bank import, architecture approval, provider call or deployment.

## Reviewable result

[Concrete proposal](../decisions/RECOVERY_MANUAL_TRANSPORT_PROPOSAL_2026_11_04.md)
replaces ambiguity in the earlier rough proposal with a bounded manual-only v3
profile: null/unverified usage, separate internal permission and source-authoring
evidence, exact raw artifacts/mapping/DAG, registered identities/taxonomy, one
private ten-question DRAFT bundle, versioned namespaces/readers/replay and unchanged
human/current-rights/publication gates. It does not fabricate v2-compatible token0,
OWNED rights, human authorship or registered staging identities.

VERIFIED source discovery: current strict v2 metadata/rights/source payload cannot
represent this truthfully; private reference/manifest/run JSONB can retain it.
Storage reuse requires explicit owner acceptance of EXTERNAL as the Bank import
classification with actual AI authoring in separate evidence. A first-class new
source-origin enum instead requires coordinated schema/service/DTO/replay migration;
that alternative is not silently included. Existing user/student/Factory grants
and public contracts stay unchanged in the proposed local-only scope.

## Actual independent findings and corrections

| Finding | Root correction | Actual reviewer disposition |
| --- | --- | --- |
| P2: supplied internal permission/mapping claims and an unspecified mutable registry cannot bootstrap authority or be serialized by an unrelated DB guard. | Immutable owner-approved activation snapshot, exact trusted source/run/permission/mapping/actor/taxonomy hashes, one designated importer, no hot reload, serialized stop/reject queued/drain/retire and explicit effective acknowledgement. Admission-only intervals and current configuration/restart limits stated. | Closed. |
| P2: top-level raw artifacts were not exact question identity roots, and raw→canonical transformations could admit unrelated answers despite consistent hashes. | Exact raw equality whitelist, typed mapping/evidence records, defined acyclic edges from question evidence/provenance roots through manual run to all artifacts; no final question hash in its own reachable evidence; mismatch/orphan/cycle tests required. | Closed. |
| P2: initial Z→source edge violates existing stimulus guard/importer semantics. | Keep exact `{content,provenanceIds}` stimulus; Z→shared source provenance V→source/permission/authoring/run. Per-question spans stay in E; no validator weakening. | Closed. Reviewer in-memory existing-fixture probe observed original provenance shape PASS and direct-source variant INVALID_REFERENCE_GRAPH. No files edited. |
| P2: losing a separate advisory-lock connection could allow a second coordinator while the first transaction still writes. | Every serialized import/replay transaction runs on the same dedicated coordinator connection. Loss aborts its TX/stops admission; uncertain commits require authorized receipt reconciliation and full reacquisition checks. Backend-termination regression required. | Closed. |

Final independent response_review found no further material ambiguity in scoped
corrections. Verified proposal SHA-256:
`e3568eaaa881fb96d147672a4807db82cb3bc68476d09ca97f64f69407cd5f0a`.
Reviewer inspected exact text/hash; its earlier source/validator probe is bounded
evidence about existing code, not execution of the proposed v3 implementation.

## Verification and limits

Executed: scoped source/contract/migration reads; actual independent proposal
reviews/hash checks; read-only in-memory stimulus validator probe. Documentation
link/whitespace checks PASS after integration (`/tmp/tsa-recovery019-docs-final.log`);
direct new-file whitespace/local-target/hash and scoped tracked diff checks PASS.
Protected research/review inputs remain pinned; historical whitespace warning
preserved. No proposed runtime,
PostgreSQL import, concurrency, activation/recovery or migration tests were run;
their acceptance cases are requirements for a future authorized implementation.

VERIFIED: RECOVERY-019 documentation preparation complete. Architecture status
remains PROPOSED / owner approval absent. Owner disposition must cover wire and
graph shapes, EXTERNAL import classification, private readers/mappings and local
activation/stop/drain semantics. Existing manual drafts remain human0/Bank0 and
BLOCKED_CONTRACT. Approval would not provide real rights, human content/AT,
calibration, production readiness or approval of separate media/planner proposals.
