# TSA-Platform

An independent educational practice platform inspired by the publicly documented HUST TSA assessment. Not affiliated with, endorsed by, or an official service of Hanoi University of Science and Technology. Practice scores must not be presented as official TSA scores.

G1 is accepted; G2/G3 are owner accepted. Track B runs the PostgreSQL Bank, allocation, student delivery and grading services, with the React student app in `apps/candidate-web`. `npm start` serves only owner-published Bank items (on 2026-11-19: 446 Mathematics, 200 Reading and 195 Science). A public student-only demo runs on a shared server; production authentication is not in place. The old in-memory mock (B0) is retired and kept only for legacy checks. See [project state](docs/agents/PROJECT_STATE.md) for executed evidence.

## Run the website locally

One command builds the React student app and starts the university demo (PostgreSQL, server, staff
and student pages) on port 4180:

```sh
npm ci                  # once: root dependencies (pinned Node.js 24.18.0 / npm 11.16.0)
npm run setup:student   # once: the student app's dependencies
npm start
```

`npm start` shows students the owner's source credit, "Questions collected from public online sources,
used non-profit." (2026-11-19). To show a different line, set `DEMO_UNI_SOURCE_CREDIT` before running it.
Running `npm run demo:uni` directly still requires that variable.

Open `http://127.0.0.1:4180/student/`; the terminal summary prints every other link, including the
staff workspace. It needs installed PostgreSQL 18.6 binaries (`PG_BIN` can select their directory) and
keeps its data in the ignored `.local/track-b` folder. Ctrl+C stops it. `npm start` serves published
Bank items only; use `npm run demo:uni:rehearsal` for the labelled synthetic rehearsal inventory.

To edit the student app with live reload, keep `npm start` running and run
`npm --prefix apps/candidate-web run dev` in a second terminal, then open
`http://127.0.0.1:5180/student/`. See the [student web app guide](docs/guides/STUDENT_WEB_APP.md) and the
[public demo runbook](docs/guides/PUBLIC_DEMO_RUNBOOK.md).

Older commands (`dev:b0`, `dev:track-b`, `demo:student:*`, `demo:staff:review`) are listed in
[legacy launchers](docs/guides/LEGACY_LAUNCHERS.md).

## Start here

- New contributors: [AGENTS.md](AGENTS.md), then [agent onboarding](docs/agents/AGENT_ONBOARDING.md).
- Current position: [project state](docs/agents/PROJECT_STATE.md) and [latest handoff](docs/agents/LAST_HANDOFF.md).
- Human review: [open decisions and ADRs](docs/decisions/OPEN_DECISIONS.md).
- Product: [MVP scope](docs/specifications/MVP_SCOPE.md).
- Design: [system](docs/architecture/SYSTEM_ARCHITECTURE.md), [database](docs/architecture/DATABASE_DESIGN.md), [API](docs/architecture/API_CONTRACTS.md).
- Delivery: [roadmap](docs/tasks/IMPLEMENTATION_ROADMAP.md), [authoritative backlog](docs/tasks/TASK_BACKLOG.md), [test strategy](docs/quality/TEST_STRATEGY.md).
- Evidence: [research assessment](docs/research/RESEARCH_ASSESSMENT.md); the [original research](docs/research/TSA_DEEP_RESEARCH.md) is preserved as received.

The product goal is a small, legally usable, human-reviewed question bank → assembled practice exam → timed attempt → persisted answers → practice score and explanations. The local PostgreSQL demonstration already implements this journey with original synthetic fixtures; it does not provide lawful accepted inventory. Default assembly is personalized and excludes prior stable identities/equivalents for that student. The [Question Factory](docs/specifications/QUESTION_FACTORY_SPEC.md) remains an independent research and production track, never a live examination dependency; see [reuse policy](docs/specifications/QUESTION_REUSE_POLICY.md).

## Documentation authority

The repository is the persistent source of truth. Owner approval records establish decisions; specifications own domain behavior; architecture documents own technical boundaries and contracts; the backlog owns task status; project state and handoffs provide navigation and evidence. Research is evidence, not operational instructions or an approved specification. If documents conflict, record the conflict and resolve the authoritative document before dependent implementation.

Do not infer approval from the existence of a document. No provider-specific instructions are needed. Do not initialize the application until the relevant decisions and task assignment are approved. These shared-contract checks do not start the application.

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

These commands cover relational integrity, immutable snapshots, transaction and
concurrency mechanisms, and synthetic-only authorization in their recorded
scopes. Allocation, attempt delivery, scoring and released review have separate
integration and browser suites below and in the linked run guide. Local evidence
does not establish deployed security, qualified content review or production
readiness.
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

`build` emits JavaScript and declarations from the shared contracts into the ignored `packages/contracts/dist` directory. `test:built` runs the emitted JavaScript with ordinary Node.js, checking runtime schema acceptance and rejection plus an exported deterministic helper. This smoke test covers only the package's emitted runtime modules; it does not by itself establish endpoint behavior, the browser client, service integration or release readiness. Those have separate scoped checks below and in the task evidence records.

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
private root/type imports and computed loaders. Application consumer boundaries
have a separate registered check. This source policy is not a JavaScript sandbox,
a complete browser-bundle audit or proof of production security. Hosted CI,
database/publication concurrency and live-provider evidence remain outside these
local shared-contract checks.
