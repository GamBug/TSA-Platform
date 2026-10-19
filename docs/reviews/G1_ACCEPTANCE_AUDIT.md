# Final G1 acceptance audit

Owner disposition, 2026-10-19: **G1 ACCEPTED; FOUND-002 COMPLETED** against
implementation `0e67485` and audit baseline `81ef8aa`. Mandatory evidence in the
[final audit](G1_ACCEPTANCE_AUDIT.md) is satisfied. Scoped owner record:
[OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md#g1--owner-acceptance-and-bounded-track-b-execution-2026-10-19).
G2/G3 and unresolved downstream decisions remain pending. Earlier pending-G1
statements below describe historical checkpoints, superseded by this disposition.


Date: 2026-10-19, Asia/Bangkok. Accountable auditor: Codex Sol 6.1 / Medium.
Owner authority: FINAL G1 ACCEPTANCE AUDIT, recorded in
[OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md#final-g1-acceptance-audit-authorization--2026-10-19).
Result: **READY FOR OWNER ACCEPTANCE**. G1 remains NOT ESTABLISHED and FOUND-002
IN_PROGRESS until explicit owner disposition. No downstream implementation began.

## Scope and exact existing criteria

Sources: current [FOUND-002 card](../tasks/TASK_BACKLOG.md#found-002--application-and-contract-foundation),
[G1 gate](../tasks/IMPLEMENTATION_ROADMAP.md#shared-planning-prerequisites-and-gates),
scoped [D1–D6 approval](../decisions/OPEN_DECISIONS.md#d1d6-scoped-contract-approval--stage-4b--2026-10-19),
and relevant question, Factory, assembly, reuse and API specifications. Proposed
whole ADRs are not treated as accepted. This audit adds no gate requirements.

G1's existing exit wording is:

> Versioned canonical question/stimulus schema, version/provenance, rights, equivalence and workflow terms; `factory-package/1` package/receipt semantics; draft-only import boundary; jobs/job-kind and safe DTO/API fixtures. Fixtures demonstrate independently executable factory and web/bank consumers without a live provider.

FOUND-002's existing reconciliation requires one runtime schema source; CI
regeneration/comparison of committed OpenAPI/client artifacts with drift failure;
positive/negative producer/consumer fixtures; changed responses and stale artifacts
must fail; optional fields pass only after coordinated regeneration and strict
consumer checks; pinned PRNG vectors and complete search/canonicalization fixtures.
Its listed acceptance is a fresh lockfile install/build, valid question/blueprint/API
examples, private types excluded from student consumers, documented commands, and
recorded typecheck/build, strict/unknown-field/type-negative, drift and
version/license/advisory checks. The roadmap explicitly defines G1 as interfaces,
without requiring deployment or a second production store.

## Criterion-to-evidence map

Paths in this table are relative to `packages/contracts/` unless otherwise stated.
All PASS rows were reproduced against committed code `0e67485ab7bd5e4873dbe74cdb903b995193e40b`.
Commit columns identify implementation origins, not additional approval claims;
all referenced commits are ancestors of that audited commit.

| Existing criterion | Status | Implemented files and automated evidence | Relevant commits |
|---|---|---|---|
| Versioned question/stimulus, immutable identity and provenance | PASS | `src/index.ts`, `src/identity.ts`, `src/factory-package-v2.ts`; `test/question.test.ts`, `test/identity.test.ts`, `test/factory-package-v2.test.ts`. Strict question/1 plus immutable, hash-bound stimulus/reference closure; missing/conflicting/cyclic/operational references rejected. | `07ced30`, `d65e08b`; earlier root schemas retained |
| Rights, equivalence and workflow terms | PASS at contract scope | QUESTION_SCHEMA/QUESTION_REUSE_POLICY specifications; Factory rights/provenance bindings; assembly group exclusions; DRAFT-only receipt schema. Factory, identity and assembly negatives reject rights/identity mutations and promotion claims. No automated human judgment or legal clearance is asserted. | `07ced30`, `d65e08b`, `8a09b92` |
| Existing factory-package/1 package/receipt and new version compatibility | PASS | `src/index.ts` unchanged; `test/factory-bank.test.ts`, `test/contract-vectors.test.ts`, `test/emitted-consumers.test.mjs`. Separate versioned Factory v2 adds complete manifests without reinterpreting v1. | `dadd60e`, `d65e08b` |
| Draft-only controlled bridge and atomic malformed-package rejection | PASS at parser boundary | `src/factory-package-v2.ts`; 14 focused tests, including later-candidate failure with no partial consumer output and independent producer/consumer processes. Actual durable import/idempotency is later BANK/INT work. | `d65e08b` |
| Shared jobs/job-kind fixtures | PASS after repair | `src/jobs.ts`, internal entry; `test/job-dispatch.test.ts`, `test/fixtures/job-dispatch.ts`, emitted process exchange and student negative import. Strict six-field job-dispatch/1; two existing executor-owned kinds, all six existing states, unknown/private fields, malformed UUID and wrong-executor negatives. | `0e67485` |
| Safe DTO/API fixtures and separate released results | PASS at contract/HTTP projection scope | `src/student.ts`, `src/released-review.ts`, `src/routes.ts`, `src/http-boundary.ts`; question/answer/result/history/routes/HTTP tests. Owner/release/withdrawal guards precede private loads; final access revision and nested allowlists tested through Request/Response and loopback HTTP. | `a6ec4ad` |
| One runtime source, generated OpenAPI/client types, CI drift failure | PASS | Runtime registry; `scripts/openapi.ts`, `scripts/check-openapi.ts`; two `openapi/*` documents and two `src/generated/*` maps; `test/openapi-artifact.test.ts` alters/removes each artifact, detects failure without rewriting it. CI invokes the check. | `a6ec4ad` |
| Independent consumers, positive/negative compatibility and optional-field coordination | PASS | `test/emitted-consumers.test.mjs`, `test/stage4b-built.test.mjs`, strict declaration fixtures. Separate ordinary Node Factory/Bank processes reject changed responses and hypothetical unapproved optional fields. An isolated optional-field experiment below also proved that stale declarations/artifacts fail and coordinated regeneration plus strict consumers succeeds. No optional field was retained. No live provider used. | `dadd60e`, `a6ec4ad`, `0e67485` |
| Student private-type/import exclusion | PASS for existing contract consumers | Explicit student entry, strict emitted declaration negatives, AST import policy and `test/consumer-boundaries.test.ts` (static/type/dynamic/template/absolute/URL/local-escape cases). Actual HTTP projection independently checks nested canaries. The import checker covers the declared synthetic consumer tree; future app roots must be registered. | `a6ec4ad`, `0e67485` |
| Pinned PRNG, complete canonicalization/search/replay fixtures | PASS | `test/deterministic-reference.test.ts`, `test/identity.test.ts`, `test/assembly-reference.test.ts`; literal bytes/digests, exact seeded order, 60-case independent exhaustive oracle, hard constraints, shared budgets, eligible/unseen shortages, stale-shortage replan, SEARCH_EXHAUSTED without false infeasibility. Local 2,000-unit and adverse bounded runs pass; caps remain engineering parameters, not a production SLO. | `07ced30`, `8a09b92`, `3af1b34` |
| Fresh lockfile installation, executable build, examples, documented local/CI commands | PASS | Root package scripts, README, `.github/workflows/contracts.yml`, `tsconfig.build.json`; clean Git checkout sequence below. Question/blueprint/API and private-field negatives run in source and emitted consumers. | `84ddff3`, `dadd60e`, `a6ec4ad`, `0e67485` |
| Pinned supported toolchain; dependency version/license/advisory record | PASS for scoped review | Exact Node/npm pins, unchanged lockfile; independent fresh-install seven-package inventory/license hashes and dated npm advisory response below. No dependency upgrades or support/security guarantee beyond documented evidence. | `8beb0ff`, `0e67485` unchanged dependency graph |
| Hosted GitHub Actions execution | UNVERIFIED, nonblocking | Workflow inspected and its complete command sequence passed locally. No hosted run observed; no push authorized. Existing G1 asks for reproducible local/CI entry points, not hosted execution evidence. | `.github/workflows/contracts.yml` at audited commit |
| Real DB transactions/concurrency, deployed sessions/auth, durable review/publication, physical browser bundle, live providers, scoring/load/deployment | DEFERRED | DATA-001, AUTH-001, BANK-001/002, ASSEMBLY-002, EXAM/SCORE/WEB/INT and later operational gates own this evidence. Passing pure contracts and synthetic server ports proves none of those runtime controls. | No implementation/acceptance claimed |

No mandatory criterion remains FAIL or UNVERIFIED after the bounded repair.
FOUND-007 remains accepted only for its existing bounded taxonomy reconciliation;
this is not acceptance of future allocation/database implementation.

## Independent execution and reproducibility

Starting Git state: branch `feat/found-002-stage4b-contracts`, HEAD `0fc75d8`, only
owner AGENTS.md dirty. Accepted setup `0be13842bf18ba82a6c96e732c322eef2af512a1`
is an ancestor. Owner AGENTS.md SHA-256 remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`; it was not staged.

Initial committed-snapshot verification of `0fc75d8` passed (102 contract tests,
10 emitted tests), but audit inspection found job lifecycle states without the
explicit jobs/job-kind parser required by G1. The coordinator froze a minimal
technical encoding of existing Factory production-unit and Exam grading work in
[DATABASE_DESIGN](../architecture/DATABASE_DESIGN.md#g1-shared-job-dispatch-contract--job-dispatch1).
Reused native `tsa_builder`, Luna / XHigh, implemented it; Sol independently read
the actual diff, found overly permissive UUID version/variant bits, required a
bounded repair, then independently ran regressions. No new queue, database grant,
public root schema, dependency or product workflow was added. Commit `0e67485`
contains the repair and its task-specific specification/authority record.

Final verification used a **fresh local Git clone**, with no node_modules or
uncommitted owner files, checked at `0e67485ab7bd5e4873dbe74cdb903b995193e40b`:
`/tmp/tsa-g1-final-checkout-3tv6r5c1`. Linux; Node `v24.18.0`, npm `11.16.0`,
TypeScript `5.9.3`. npm's cache was isolated in `/tmp`; install used the committed
lockfile. The complete workflow command sequence ran with permitted subprocess
and loopback execution. The earlier restricted file-wrapper result is not counted
as execution of nested tests; neither local run is labelled a hosted CI pass.

| Executed command | Observed final result |
|---|---|
| `npm ci --cache /tmp/tsa-g1-audit-npm-cache` | exit 0; fresh dependency tree |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; JavaScript and declarations emitted |
| `npm run test:built` | exit 0; ordinary Node emitted-JavaScript smoke |
| `npm run test:consumers` | exit 0; 11/11 tests, 3 suites, zero failures/skips |
| `npm test` | exit 0; 106/106 tests, 16 suites, zero failures/skips |
| `npm run contracts:check` | exit 0; all four artifacts match |
| `npm run contracts:consumer-check` | exit 0; declared student consumer boundary |
| `npm run docs:check` | exit 0; zero errors; preserved historical ARCHITECTURE_REVIEW_001 whitespace warning |
| `git diff --check` | exit 0 |
| `npm ls --all --json` | exit 0; no peer/version errors |
| `git status --porcelain` in fresh clone | empty after full sequence |
| `npm audit --json --ignore-scripts --cache /tmp/tsa-g1-audit-npm-cache` | exit 0; auditReportVersion 2, vulnerabilities {}, every severity/total 0 |

Reproduction from an accessible local repository, using the pinned Node/npm:

```bash
git clone --no-hardlinks /path/to/TSA-Platform /tmp/tsa-g1-reproduction
cd /tmp/tsa-g1-reproduction
git checkout --detach 0e67485ab7bd5e4873dbe74cdb903b995193e40b
node --version
npm --version
npm ci
npm run typecheck
npm run build
npm run test:built
npm run test:consumers
npm test
npm run contracts:check
npm run contracts:consumer-check
npm run docs:check
git diff --check
npm ls --all --json
npm audit --json --ignore-scripts
git status --porcelain
```

Independent compatibility comparison against accepted Stage 4A `8beb0ff` found
all 18 legacy OpenAPI components equal, root `src/index.ts` and package-lock.json
byte-identical, and dependency/engine/workspace fields unchanged. The authorized
additive entrypoints and scripts are not mistaken for dependency changes.
Python independently SHA-256 checked the literal UTF-8 golden strings extracted
with the TypeScript AST, without using the production hash implementation:

| Vector | SHA-256 |
|---|---|
| identity/1 | `1d5c299ab17cc3c5d9bbb49d8c9aeab72fbafa179157d7b47545ca20f946e0ba` |
| fingerprint/1 | `e82bab110128b069038a500ecff91c6a872a1959d62eaa27768a8fe7db802309` |
| assembly/1 manifest | `652ee7e01fd7551d7f87f65082dbddadf3839b583863342abd1c92f7bed1a8de` |

The fresh test suite separately compares production bytes/results to those
literals, checks the slot hash and exercises independent exhaustive search cases.
Raw local transcripts `/tmp/tsa-g1-final-verification.log`,
`/tmp/tsa-g1-final-results.json`, `/tmp/tsa-g1-final-advisories.json` are transient;
committed commands, fixtures and observed outcomes here are the durable record.

### Reversible optional-field compatibility experiment

Executed only in the disposable clone after the clean baseline. A temporary
strict declaration consumer used `StudentQuestion.auditOptional: string` and
read it as `string | undefined`. Against unchanged declarations, tsc exited 2
with auditOptional diagnostics. A temporary addition
`auditOptional: z.string().optional()` to StudentQuestionSchema then made
`npm run contracts:check` exit 1, as expected for stale artifacts.
`npm run contracts:generate`, build and artifact check subsequently exited 0;
the same strict consumer compiled (exit 0), and all 11 emitted-consumer tests
passed. This demonstrates the coordinated optional-field path without approving
or retaining a new product field. All five source/artifact files were restored
byte-for-byte, the temporary fixture removed, the original build rerun, and
`git status --porcelain` was empty. Expected negative exits are evidence, not
unrepaired failures. Transcript: `/tmp/tsa-g1-optional-check.json`.

Reproduce by making that single temporary schema addition and a StudentQuestion
consumer against built student.js; invoke tsc with `--noEmit --strict
--exactOptionalPropertyTypes --skipLibCheck --target ES2022 --module NodeNext
--moduleResolution NodeNext`. Compare before/after regeneration/build and restore
all temporary changes. The committed schema intentionally has no auditOptional.

## Dependency/support evidence and limits

Fresh-installed versions, lock metadata, license identifiers and actual license
file SHA-256 for all seven external packages matched the existing
[dependency inventory](FOUND002_STAGE4A_DEPENDENCIES.md) independently: Zod 4.1.12,
zod-to-openapi 8.5.0, openapi3-ts 4.6.2, TypeScript 5.9.3, @types/node 24.10.1,
undici-types 7.16.0 and YAML 2.9.1. No license-text or dependency change occurred.

Official sources rechecked: [Node 24.18.0 LTS release](https://nodejs.org/en/blog/release/v24.18.0),
[Node release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json),
and [npm 11.16.0 engine metadata](https://raw.githubusercontent.com/npm/cli/v11.16.0/package.json).
Node 24 is supported through 2028-04-30; npm's declared Node range includes the
pin. Line support does not establish that the pinned patch has every security fix.
The zero-advisory response is dated registry evidence for the locked package graph,
not absence of vulnerabilities, Node/npm binary security or legal redistribution
clearance. No audit fix, update, paid API or production authorization followed.

## Gate recommendation and next action

**READY FOR OWNER ACCEPTANCE**, limited to existing G1 and FOUND-002 contract
criteria at audited code commit `0e67485`. The owner alone may establish G1.
Suggested exact approval:

> I accept FOUND-002 and establish G1 for the contract implementation at 0e67485ab7bd5e4873dbe74cdb903b995193e40b, using docs/reviews/G1_ACCEPTANCE_AUDIT.md. FOUND-007 acceptance remains bounded to the approved taxonomy reconciliation. This does not approve unrelated ADRs, production readiness, missing hosted/runtime evidence, deployment, paid APIs, or downstream implementation; assign the next batch separately.

The [next proposed prerequisite batch](../tasks/IMPLEMENTATION_ROADMAP.md#proposed-post-g1-prerequisite-batch--2026-10-19)
keeps DATA/AUTH/Bank, lawful seed preparation and early research on their actual
dependency gates. No new G1 semantic decision is required. Later local-stub scope,
affected proposed database/ADR mechanisms, content rights, independent human
reviewers/labelers and provider/privacy/budget choices remain separate decisions.

Agent usage: one reused native Luna / XHigh writing worker for the narrow repair;
Sol / Medium specification, actual diff review, independent verification and
integration. No new exploratory agent, Terra or Astra. Relative cost low for the
repair and medium for the audit; actual billed credit amounts are unavailable.
Owner AGENTS.md is the only intended residual working-tree modification after
local evidence integration. No push, merge, deployment or automatic gate advancement.
