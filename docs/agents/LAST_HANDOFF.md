# Latest handoff — FOUND-002 Stage 4B

Date: 2026-10-19, Asia/Bangkok. Accountable coordinator/reviewer: Codex Sol 6.1 /
Medium. Owner authority: "OWNER APPROVAL — ACTIVATE STAGE 4B BOUNDED AUTOPILOT",
recorded in [OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md#d1d6-scoped-contract-approval--stage-4b--2026-10-19).
Authorized D1–D6 engineering batch COMPLETE. FOUND-002 IN_PROGRESS pending owner
acceptance/G1 disposition; G1 NOT ESTABLISHED; DATA-001 BLOCKED. No gate advanced.

## Git and ownership

Branch `feat/found-002-stage4b-contracts`, base `8beb0ff` (accepted Stage 4A).
Accepted setup `0be13842bf18ba82a6c96e732c322eef2af512a1` is an ancestor.

| Local checkpoint | Accepted contribution |
|---|---|
| `07ced30` | D1 bounded FOUND-007 reconciliation/approval record; D2 identity/1 and fingerprint/1, exact reference closure and byte goldens |
| `d65e08b` | D4 Factory package/2 complete source/stimulus/assets/provenance/rights transport and atomic DRAFT-only receipts |
| `8a09b92` | D3 canonical assembly manifest, bounded search, replay, oracle/goldens and measured limits |
| `3af1b34` | D3 review repair: discard stale shortage before bounded fresh-snapshot replan |
| `a6ec4ad` | D5/D6 consumer entries, generated route types/OpenAPI, actual GET boundary, import fence and emitted integration evidence |

The following documentation checkpoint records final status; find its hash in
Git history. All task reservations released. Only intended residual change is the
owner's AGENTS.md, never staged/committed, SHA-256
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.

One reused native `tsa_builder`, Luna / XHigh, wrote identity, Factory, assembly,
route/generation/entrypoints and initial HTTP/tests. Reused native `tsa_scout`,
Luna / XHigh, performed narrow read-only oracle, Factory, assembly and acceptance
mapping checks. Prior recorded runtime metadata/session IDs remain at
`8beb0ff:docs/agents/LAST_HANDOFF.md`; no role/model was silently changed.
Maximum two child threads, one writing worker. Worker hit usage limit, resumed
after owner reset, then twice returned model-capacity errors. Dispatch stopped;
coordinator took bounded integration ownership: strengthened import fence/emitted
checks, completed CI/README, repaired consumer fixture paths and reviewed/finalized
HTTP regressions. No model fallback, Terra, Astra or paid external API. Relative
cost: Luna implementation low–medium; Sol integration/review medium; actual credit
charges unavailable. No claim of another independent Sol reviewer.

## Acceptance evidence and guarantees

| G1 contribution | Executable evidence / scope |
|---|---|
| D1 shortage taxonomy | Existing error tests plus coordinator strict response/status/private-field assertions; 422 eligible/unseen versus 503 unknown preserved. FOUND-007 accepted only for bounded contract reconciliation, not allocation implementation. |
| D2 identity/fingerprint | `identity.test.ts`: literal bytes/digests, Unicode, immutable closure, tamper/missing/duplicate/cycle/depth/size, ID-independent image fingerprint. Python independently verified exact byte/hash vectors. Operational state excluded; authored content preserved; no equivalence merge. |
| D3 assembly/replay | 20 tests: literal manifest/slots hashes, ordering/ties, whole units, overlapping quotas, source/group/conflict constraints, nullable labels, shared NEW_ONLY budget, replay pins and stale contention. 60 small cases checked against a separate exhaustive oracle; scout separately enumerated six representative cases. Python independently verified blueprint/manifest/slot bytes and SHA-256. |
| D4 transport | 14 focused tests: full parent/stimulus closure, assets/hash/MIME/base64, provenance/rights/validation binding, strict/bounded inputs and all-or-throw later-candidate rejection. Separate process transport and built-module consumer pass. Rights records are assertions, not actual legal permission. PASS/FAIL/INCONCLUSIVE remain draft evidence; import never approves/publishes. |
| D5 released results | Existing owner-only result path retained; score-only ResultView remains separate. Real Request/Response and loopback tests prove pre-load owner/release/withdrawal gates, exact nested projections and final access revision check for synthetic server ports. |
| D6 consumers/routes | Eight student operations plus one separate released-review operation; inferred request input/response output/header types; four generated artifacts with non-mutating missing/drift tests. Three consumer entries; old root remains compatible. Static/type/dynamic/template/absolute/URL/local-escape negatives and strict emitted declaration checks pass. |
| Build/dependencies/compatibility | Ordinary Node emitted smoke and integration; 18 legacy public component schemas identical; root index/v1 schemas, dependency/engine/workspace pins and lockfile unchanged. Stage 4A dated dependency/license/support/advisory evidence retained. |

Measured focused D3 run: 2,000 units selecting 200 in 159.2 ms / 201 nodes;
adverse case 213.5 ms / exactly 50,000 nodes, SEARCH_EXHAUSTED and no slots.
Caller limits remain explicit; three contention attempts include the initial plan.
These are local reference observations, not production SLOs. Advisory guard pair
`(1414742321,1)` is reserved; no database lock/transaction behavior is claimed.

Review repaired graph depth memoization/self-reference/duplicate edges; Factory
asset ID metadata, ancestry/provenance closure and parser integrity; assembly
seeded output versus usage rank and stale shortage; route wire-input/error-status
and legacy component compatibility; HTTP mutable-guard/loader-copy, foreign malformed
metadata and nested answer-reference boundaries. Scout found no remaining concrete
Factory/search defect in its narrow scope. Coordinator inspected actual diffs and
independently verified worker output; worker claims alone were not acceptance.

## Executed final verification

Node `v24.18.0`, npm `11.16.0`, TypeScript `5.9.3`, 2026-10-19.

| Command | Observed result |
|---|---|
| `npm run build` | PASS, exit 0 |
| `npm run test:built` | PASS, ordinary emitted JavaScript |
| `npm run test:consumers` | PASS, 10 tests / 3 suites; no failures/skips |
| `npm run typecheck` | PASS, exit 0 |
| `npm test` | PASS, 102 tests / 15 suites; no failures/skips |
| `npm run contracts:check` | PASS, two OpenAPI + two type artifacts |
| `npm run contracts:consumer-check` | PASS, declared student consumer tree |
| `npm run docs:check` | PASS, zero errors; preserved historical review whitespace warning |
| `git diff --check`, named staged diff review | PASS |
| Setup ancestry / owner bytes / root schemas / dependency pins / legacy 18 schemas | PASS, independently compared against accepted base |

Full local command transcript: `/tmp/tsa-stage4b-verification.log` (transient;
commands/results above and committed tests are durable evidence). Subprocess and
loopback tests used managed scoped execution. Restricted Factory invocation failed;
its permitted rerun passed. Restricted assembly reported only a file wrapper;
permitted rerun confirmed nested tests. The initial route interval negative used
incorrect timezone arithmetic and failed; fixture corrected without changing the
valid interval rule. Stale-shortage regressions failed before the repair, then
passed. No failed/restricted/missing run is labelled a clean hosted CI pass.

## Limits and next authorized action

No READY D1–D6 engineering remains. Next is owner review/acceptance of FOUND-002
and explicit G1 disposition; no new scoped semantic decision is requested. Do not
start DATA-001 or other G1-dependent implementation before that disposition.

NOT RUN this batch: fresh install (unchanged lock/dependencies; prior clean-install
evidence retained), hosted GitHub CI (no push), browser/application bundle, real
service/database/concurrency/auth/publication/provider/scoring/load validation.
Those later runtime checks are not silently added as G1 prerequisites. Static
import policy covers `test/fixtures/stage4b/student-consumer`; future app consumer
roots must be registered. It is not a JavaScript sandbox or proof of physical
browser-bundle isolation. HTTP ports are synthetic trusted server collaborators,
not deployed sessions/CSRF or DB enforcement. Remaining seven mutation/catalog/
history/asset operations are contract definitions, not implemented services.

No push, merge to main, deployment, paid external API, security-policy bypass,
owner AGENTS modification, unrelated ADR approval or G1 advancement occurred.
Rights-cleared content, human reviewers, retention/privacy/provider/budget and
operating choices retain their separate later-task gates.

Historical evidence is preserved in Git: Stage 4A at
`8beb0ff:docs/agents/LAST_HANDOFF.md` (including agent routing/dependency details),
Stage 3 at `84ddff3:docs/agents/LAST_HANDOFF.md`; the
[dependency review](../reviews/FOUND002_STAGE4A_DEPENDENCIES.md) and historical
[decision packet](../reviews/G1_STAGE4A_DECISIONS.md) remain intact. Current approvals
supersede only the packet's scoped D1–D6 blockers; whole ADRs stay PROPOSED.
