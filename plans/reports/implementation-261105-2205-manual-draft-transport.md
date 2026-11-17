# Manual DRAFT transport implementation evidence

Status: engineering COMPLETE; exact pilot activation PENDING owner input.
November 5, 2026, Asia/Bangkok. Root accountable implementer/integrator.
[Plan](../261105-2120-recovery028-manual-draft-transport/plan.md) and
[owner authority](../../docs/decisions/OPEN_DECISIONS.md) define the scope.

## Result

Implemented an internal strict manual v3 parser/builder, private filesystem
preparation, shared Bank persistence, format-aware attribution/review readers,
explicit registered mapping, and a durable single-connection activation coordinator.
The parser reconstructs the exact canonical projections and typed graph from raw
artifacts. Unknown usage remains null, permission stays internal-only, and current
rights/human review/eligibility are never manufactured. V1/v2 and public DTOs remain
stable. No SQL migration, new grant, provider, dependency installation or paid API.

The feature is disabled by default. The new
[operator guide](../../docs/guides/MANUAL_DRAFT_TRANSPORT.md) documents setup,
location/snapshot pins, stop/drain, journal capacity and uncertain-commit recovery.
The ordinary manual staging exporter and all historical artifacts stay unchanged.
No actual pilot Bank import, registration, activation, publication or commit.

## Final executed verification

Node24.18.0, existing locked dependencies and disposable PostgreSQL18.6.
Counts overlap; do not add these rows into a unique-test total.

| Command/check | Observed result | Scope |
| --- | --- | --- |
| `npm run test:factory:manual:transport` | 28 PASS, exit0 | Build plus7contract,5configuration,16realPG cases. |
| `npm test` | 168 PASS, exit0 | Existing v1/v2/public/private contracts plus new strict v3 tests. |
| `node --experimental-strip-types --test --test-concurrency=1 tests/integration/bank/factory-import.test.mjs tests/integration/bank/review-context.test.mjs tests/integration/bank/manual-factory-import.test.mjs` | 74 PASS, exit0 | Existing v2/upgrade/private review compatibility and new v3 integration. |
| `node --test tests/ai/*.test.mjs` | 78 PASS, exit0 | Existing offline generation/staging plus new private configuration tests. |
| `npm run build`, `npm run typecheck` | PASS | Emitted contracts and source/test type checks. |
| `npm run test:built` | Smoke and2tests PASS | Ordinary emitted JS and private package entry. |
| `npm run test:consumers` | 12 PASS | Separate emitted producer/consumer processes and declaration compilation. |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS | Public/private artifact drift and student/public import boundaries. |
| `npm run docs:check`, `git diff --check` | PASS | Historical whitespace warning preserved; anchors NOT_CHECKED. |
| Raw draft JSON-schema parity probe | true | New pinned raw response schema equals the existing tooling's serialized schema. |

Real PostgreSQL cases verify ten atomic DRAFTs, exact replay/no writes, changed
same-key denial, cross-format producer collision, source reuse/original pointer,
local correction/ancestor review, current authorization, unknown rights/zero
eligibility, a late database failure with complete rollback, second-coordinator
exclusion, idle Bank-lock availability, queued stop/drain/retirement and stale
restart, DB-clock expiry, actual backend termination during insertion, and an
actual COMMIT whose acknowledgment is deliberately lost. Both uncertain states
require explicit read-only receipt reconciliation; no transparent reconnect or
blind resubmission occurs. HTTP student/static requests cannot read the artifacts.

Filesystem fault cases cover truncated/unwritable journals, failed post-rollback
resolution, retirement I/O failure, concurrent stop, copied control directories,
unsafe permissions/symlink ancestors and a nearly-full journal. Pending admission
reserves resolution capacity. Known ROLLED_BACK remains distinct from externally
verified ABSENT. Connection error listeners are removed on release.

## Failures and actual independent review

An initial contract scaffold passed one insufficient happy-path test but lacked
raw/typed-graph reconstruction; root rejected it. A replacement worker hit the
subscription usage limit. Root completed the contract without a paid fallback.
A bounded simplifier later changed only the two assigned contract modules and
reported typecheck/7contract PASS.

The first reviewer failed at model capacity before reviewing. Actual native
`code-reviewer` manual_coordinator_review (gpt-5.6-sol/medium role) reviewed the four
v3 TS modules, schemas/tests/fixture, coordinator/config/mapping/namespace,
shared persistence/private readers and preparation tool. Findings about journaling
before auth, uncertain journal writes, retirement cleanup, historical control
copies, environment gating, post-rollback resolution and journal capacity were
repaired. Final reviewer result: no unresolved findings; independent7contract and
5configuration tests PASS, syntax/diff PASS. The reviewer did not rerun PG.

Root's initial fixture login incorrectly used an absent guest principal; it now
obtains a real authenticated guest before login. A correction fixture supplied a
null evidence URI contrary to the existing source contract; fixed without
weakening validation. A reconciliation scope pin was initially omitted from an
internal call; repaired. The listener warning led to real listener cleanup.
Initial blocked imports before contract build and AgentKit's generated-output
context filter were disclosed; source inspection/fresh builds resolved the route.
Final checks above pass; missing tests were never counted as passing.

## Retained Bank and exact pilot proposal

Before starting the stopped retained cluster for read-only SQL inspection, root
captured a private64,051,200-byte physical backup under
`.local/recovery/manual-v3-registration-check-2026-11-05/`.
Archive SHA256: `5a98d5e5727446a9fc68a726ddcac20ae3a5689ca0e6e21e85e50097f500c915`.
The backup receipt describes capture-time state. Starting/stopping PostgreSQL can
change its operational files; no application data/schema mutation was performed.
Inspection found the existing synthetic AUTHOR and two runtime roles, but only one
Math taxonomy and zero Reading taxonomies. The owned cluster was stopped afterward.

The [exact registration and activation proposal](../../docs/decisions/OPEN_DECISIONS.md#recovery-028-private-activation-proposal--2026-11-05)
contains the proposed target taxonomy, private package/mapping and immutable
activation/location pins. Root built and parsed the actual existing ten final
drafts plus their original critic/source evidence; original response hash still
matches042409db08bed4a4ea551d4677e6858ca150936293a39a91cc7aed8f516972b9.
This is PROPOSED_UNREGISTERED_NOT_ACTIVATED, not a successful import or fake registry.
No old artifact was rewritten. All proposed private files are owner-only.

A specific asynchronous owner question requests the separate exact registration
and snapshot action. It is pending; no approval is inferred from elapsed time.
The activation expires November9 at18:00UTC+7 and cannot be extended automatically.
Other reviewed local media/planner engineering remains authorized while it waits.

## Continuation

Root retains integration ownership; delegates released their files. No project
server/verifier is intentionally left running. Parent recovery is incomplete;
its native tracker still reports BLOCKED despite authorized local work resuming.
No goal completion, production/human/rights acceptance or clean release is claimed.

[Local journal](../journals/2026-11-05-private-manual-draft-transport-and-durable-intake.md)
was persisted and validated through AgentKit. AgentWiki publish skipped.
