# RECOVERY-009 — Factory planner/reservation proposal review

Date: 2026-11-02 Asia/Bangkok. Root accountable, navigation drafted the proposal,
baseline_scout supplied preliminary source review. Those earlier agent handles
were no longer live on continuation; root preserved the draft, took sole edit
ownership and assigned an actual independent read-only `planner_final_review`
(tsa_reviewer role). No application, SQL, contract, dependency or data change.

## Deliverable and scope

[Concrete proposed design](../decisions/RECOVERY_FACTORY_PLANNER_PROPOSAL_2026_11_02.md)
specifies config/inventory/plan shapes, deterministic overlapping-deficit and
whole-bundle accounting, candidate/call/token/cost/review caps, scheduled/manual
identity, per-call reservations, fencing/uncertainty, and Factory privilege/
migration impact. Existing `generation/1`, Factory v2, job-dispatch/1, Bank and
student contracts are preserved. This is an approval-ready design, not implemented
planner/budget/recovery behavior or completion of FACTORY-002/003.

Verified source correction: migrations already contain `factory_produce_unit`,
Factory SELECT/UPDATE RLS and bounded column grants. The missing parts are Factory
batch/item/run persistence and orchestration/claim routines. No new job kind,
second queue or duplicate Bank is proposed.

## Findings and disposition

| Finding | Final design disposition |
| --- | --- |
| Unfillable highest-ranked cell could starve lower feasible cells | Exhaustive ranked-cell/template scan before no-fit; required oversized-A/feasible-B regression. |
| Schedule-scoped manual row with null schedule identity bypasses active-schedule uniqueness | Operator-triggered period run uses the same populated schedule tuple as cron, with initiator audit; ad hoc manual rows alone have null schedule columns. Cross-period winner-order test required. |
| Plan creation had no authorized INSERT actor | Narrow checked factory_plan_commit owns atomic plan/item/existing-job inserts; no broad job INSERT grant. |
| Plan/dispatch rights and pending counts ambiguous | GENERATE rights checked at freeze and dispatch, pending stages mutually exclusive; forecasts never become actual eligible stock. |
| Reservations conflated with final dispatch authorization | Separate begin-dispatch guard/commit, bounded handoff, source/lease/current-rights recheck, explicit linearization and uncertainty. |
| Terminal job had no lease for charge reconciliation | Restricted proof/CAS reconciler works after cancellation/expiry/terminal state, without dispatch/publication authority. |
| Budget cap could erase incurred overrun evidence | Persist actual cost/overage, pause later dispatch; numeric aggregate projections can exceed the admission cap. |
| Final owner decision still named old reservation boundary | Decision explicitly names the revised begin-dispatch commit and bounded handoff. |
| Revoking existing Factory UPDATE is not expand-only | Separate additive expansion and owner-approved privilege cutover; dispatcher off until cutover; preserve EXAM semantics, test approved differences explicitly. |

Current fake adapter's 128-case/per-call limits are distinguished from a500-candidate
batch. No500-candidate fake execution, live model quality, human review, paid spend
or actual reservations are claimed. New inspection/media scope remains separate.

## Actual verification

Final SHA-256:
`926dad0105c8618ec9cc09ac6f94fb100d10d941e416a9fc6f4cbf29c43e7f55`.

Independent planner_final_review inspected the final text and necessary source
references; no remaining material findings. `sha256sum` matched; direct Python
check passed13 relative links/anchors, whitespace and final newline. Scoped
`git diff --check` exited0; because the proposal is untracked, the direct text
check is the substantive new-file whitespace check. Root docs/link checks also
passed. No implementation/database/browser tests ran for this documentation-only
batch. Future acceptance tables are requirements, not executed PASS results.

## Remaining decisions

The document stays PROPOSED. Owner architecture disposition is required for the
new config/storage/reservation schema and privilege cutover; it supplies neither
source rights nor human review/capacity nor live paid-provider permission. Concrete
budget/schedule/reviewer inputs are still absent. No migration/file, dispatcher,
provider or production activation was created. RECOVERY-009 preparation complete;
all edit/review reservations released. Overall recovery goal remains incomplete.

Recommended implementer for an approved next scope: existing Codex subscription,
available model/high if selectable for deterministic planning and atomic budgets;
separate read-only reviewer for SQL/grant/concurrency changes. No paid API.
