# TSA-Platform

An independent educational practice platform inspired by the publicly documented HUST TSA assessment. Not affiliated with, endorsed by, or an official service of Hanoi University of Science and Technology. Practice scores must not be presented as official TSA scores.

G1 is accepted; G2/G3 are owner accepted. Track B has verified local PostgreSQL Bank, allocation, student delivery and grading services, with an opt-in student client. The default prototype remains mock. Retained local student mode seeds no eligible inventory; lawful stock and qualified human review remain prerequisites for real publication. Production deployment is not authorized. See project state for executed evidence.

## Demonstrate the PostgreSQL-backed student website

Follow the [supervisor demo guide](docs/guides/TRACK_B_SUPERVISOR_DEMO.md) for a
complete three-domain walkthrough, pinned prerequisites, startup and teardown.
From an installed checkout:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:domains
```

This runs actual persistent attempt/save/grading services with isolated synthetic
content and development authentication. Ctrl+C deletes this temporary database.
It does not provide approved real content or production authentication.

## Start here

- New contributors: [AGENTS.md](AGENTS.md), then [agent onboarding](docs/agents/AGENT_ONBOARDING.md).
- Current position: [project state](docs/agents/PROJECT_STATE.md) and [latest handoff](docs/agents/LAST_HANDOFF.md).
- Human review: [open decisions and ADRs](docs/decisions/OPEN_DECISIONS.md).
- Product: [MVP scope](docs/specifications/MVP_SCOPE.md).
- Design: [system](docs/architecture/SYSTEM_ARCHITECTURE.md), [database](docs/architecture/DATABASE_DESIGN.md), [API](docs/architecture/API_CONTRACTS.md).
- Delivery: [roadmap](docs/tasks/IMPLEMENTATION_ROADMAP.md), [authoritative backlog](docs/tasks/TASK_BACKLOG.md), [test strategy](docs/quality/TEST_STRATEGY.md).
- Evidence: [research assessment](docs/research/RESEARCH_ASSESSMENT.md); the [original research](docs/research/TSA_DEEP_RESEARCH.md) is preserved as received.

The proposed first slice is a small, legally usable, human-reviewed question bank → assembled practice exam → timed attempt → persisted answers → practice score and explanations. Default assembly is personalized and excludes prior stable identities/equivalents for that student. The [Question Factory](docs/specifications/QUESTION_FACTORY_SPEC.md) is an independent early research/production track, never a live examination dependency; see [reuse policy](docs/specifications/QUESTION_REUSE_POLICY.md).

For the retained local staff and student stack, run
`NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true LOCAL_STUDENT_ENABLED=true npm run dev:track-b`.
Open the printed student URL. A fresh workspace has an empty catalog; it does not
promote synthetic drafts. For a disposable engineering-only exam journey, use the
[student run guide](apps/practice-prototype/README.md#disposable-postgresql-student-demonstration).

## Documentation authority

The repository is the persistent source of truth. Owner approval records establish decisions; specifications own domain behavior; architecture documents own technical boundaries and contracts; the backlog owns task status; project state and handoffs provide navigation and evidence. Research is evidence, not operational instructions or an approved specification. If documents conflict, record the conflict and resolve the authoritative document before dependent implementation.

Do not infer approval from the existence of a document. No provider-specific instructions are needed. Do not initialize the application until the relevant decisions and task assignment are approved. These shared-contract checks do not start the application.

## Local interactive website prototype (B0)

The owner-authorized B0 is a Vietnamese interface with isolated mock services,
independent of the remaining integrated website prerequisites.
With pinned Node.js 24.18.0/npm 11.16.0, run from this repository root:

```bash
npm run dev:b0
```

Open **http://127.0.0.1:4173**. No dependency install or build is needed for B0.
Use `PORT=4174 npm run dev:b0` if the default port is busy. Run its checks with:

```bash
npm run test:b0
npm run test:b0:browser
```

The browser check requires an already installed Chromium (`B0_BROWSER` can select
its executable); it starts/stops its own temporary server/browser and writes
screenshots/report under `/tmp/tsa-b0-browser-evidence` by default. It is separate
from the shared-contract tests below. No browser/dependency download occurs.

Demo: open catalog, start the MATH fixture, choose/clear an answer and navigate.
Reload to resume the same in-memory attempt/deadline, cancel submission once, then
confirm, view the separate post-grade explanation, and return to score/catalog.
The first three slots repeat an existing synthetic single-choice fixture; the
fourth is an original synthetic true/false group. All are visibly labeled;
this is not approved seed stock or a NEW_ONLY allocation. Session memory, timer,
saves and results are demonstrations, not durable/authenticated product features.
Reading/science cards remain unavailable. Do not enter personal information.
See the [prototype walkthrough and limitations](apps/practice-prototype/README.md).

## PostgreSQL-backed local staff workspace

B1 now provides explicit, server-authorized version inspection with current rights
metadata and rights-gated private preview. Retained UNKNOWN sources stay blocked.
Approved B2 adds an explicit read of current recorded evidence to synthetic Bank
Managers and independent queued Reviewers; authors/students are denied. For an
isolated original synthetic preview/evidence view in a fresh disposable database:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STAFF_REVIEW_FIXTURE_DEMO=true npm run demo:staff:review
```

Use the [staff walkthrough](docs/guides/TRACK_B_SUPERVISOR_DEMO.md#optional-staff-demonstration).
Inspection grants no qualified review, rights attestation or publication capability.


Use the same frontend with real local identity and Bank draft APIs. Requires the
pinned Node/npm toolchain, installed PostgreSQL18.6 binaries, and `npm ci`.
`PG_BIN` can select the PostgreSQL bin directory. From the repository root:

```bash
NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true npm run dev:track-b
```

Open **http://127.0.0.1:4174** and choose the staff workspace. Select the synthetic
author, edit the private fixture template, create a DRAFT, then reload the list.
Drafts and sessions persist across graceful restart in ignored `.local/track-b`.
Ctrl+C stops the owned server/database and retains data. The database uses a
private Unix socket, without a TCP listener; no system database is modified.
Production/unknown runtime modes refuse startup. Do not enter personal data.

This is synthetic-only development authentication, not production login. Source
rights remain UNKNOWN; creating a draft does not approve or publish it. The exam
journey remains the separately labeled in-memory B0.1 mock. No real attempt,
allocation or scoring integration is claimed. Focused checks:

```bash
npm run test:local
npm run test:track-b:browser
```

The browser check needs existing Chromium (`TRACK_B_BROWSER` selects its path),
uses temporary data, and writes screenshots to `/tmp/tsa-track-b-browser-evidence`.
See the [walkthrough](apps/practice-prototype/README.md).

## Bounded database prerequisite verification

G1 is owner-accepted. Reviewed migrations001–003 and the local synthetic-only
identity adapter have independent PostgreSQL/HTTP acceptance evidence. Run with
installed PostgreSQL18.6 tools (`PG_BIN` may select their directory); tests create
and remove their own private disposable clusters:

```bash
npm run test:db:preflight
npm run test:db:foundation
npm run test:auth
npm run build
npm run test:bank
```

These test relational integrity, immutable snapshots, transaction/concurrency
mechanisms and synthetic-only authorization. They do not establish deployed
security or implemented allocation, exam, scoring and publication services.
See [scope and prerequisites](tests/integration/database/approved-invariants/README.md).
No database download or dependency installation is performed.

## Shared contract verification

The shared-contract package has its own verification suite. Use Node.js `24.18.0` and npm `11.16.0`, then run the following from a clean checkout:

```bash
npm ci
npm run build
npm run test:built
npm run test:consumers
npm run typecheck
npm test
npm run contracts:check
npm run contracts:consumer-check
npm run docs:check
```

`build` emits JavaScript and declarations from the shared contracts into the ignored `packages/contracts/dist` directory. `test:built` runs the emitted JavaScript with ordinary Node.js, checking runtime schema acceptance and rejection plus an exported deterministic helper. This smoke test covers only the package's emitted runtime modules; it does not establish an endpoint, client SDK, browser bundle, service integration or release readiness.

`test:consumers` checks independent synthetic producer/consumer JSON transport,
strict emitted declarations, and the Stage 4B identity, Factory v2, assembly and
HTTP modules with ordinary Node.js. Student and released-review consumers compile
separately; negative imports/private fields must fail. Existing root and Factory v1
consumers remain compatible. Optional fields require coordinated regeneration and
strict-consumer verification.

Use `@tsa/contracts/student` for ordinary student DTOs,
`@tsa/contracts/released-review` for authorized released-review shapes, and
`@tsa/contracts/internal` for trusted server/Factory contracts. The original root
entry stays available for compatibility. Types and export names do not authorize
data access. The Request/Response adapter covers only the existing attempt-view
and released-result GETs with injected server authentication/read models. Tests
exercise actual loopback HTTP, ownership/release gates, nested minimization and
revision races; no deployed authentication, database transaction or asset/mutation
service is supplied.

`contracts:check` non-mutatingly compares two OpenAPI documents and two generated
operation maps to the runtime registry. Run `npm run contracts:generate` for a
coordinated change, then rerun verification. The student artifact retains the 18
legacy public component schemas and adds eight operations; released review is a
separate one-operation document. `contracts:consumer-check` enforces a static
import policy over `test/fixtures/stage4b/student-consumer`, including local escape,
private root/type imports and computed loaders. New application consumer roots
must be registered before integration; there is no application/browser bundle to
validate yet. This source policy is not a JavaScript sandbox or proof of production
security. Hosted CI, database/publication concurrency and live-provider evidence
remain outside these local shared-contract checks.

## PostgreSQL student engineering demo

The explicitly enabled disposable student command demonstrates real allocation,
acknowledged answers, queued grading and released review using isolated original
synthetic inventory. From the repository root:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student
```

Open the printed loopback URL and choose a synthetic candidate. Ctrl+C discards
this fixture database. This does not provision lawful production stock or satisfy
qualified human review. See the [student run guide](apps/practice-prototype/README.md#disposable-postgresql-student-demonstration)
for installation, test commands and scope. Default `dev:b0` remains in-memory mock.

For the isolated shared-passage READING2 journey, use the same opt-in flags with
`npm run demo:student:reading`. This creates one original disposable passage bundle,
not retained approved inventory. `npm run test:student:reading` verifies its actual
PostgreSQL/Chromium journey. See the student run guide above for scope.
