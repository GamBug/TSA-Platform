# TSA-Platform

An independent educational practice platform inspired by the publicly documented HUST TSA assessment. Not affiliated with, endorsed by, or an official service of Hanoi University of Science and Technology. Practice scores must not be presented as official TSA scores.

Phase 02.75 preserves the architecture and collaboration documentation. The scoped G0 authorization permits the current shared-contract foundation only; no production application baseline or downstream gate is approved.

## Start here

- New contributors: [AGENTS.md](AGENTS.md), then [agent onboarding](docs/agents/AGENT_ONBOARDING.md).
- Current position: [project state](docs/agents/PROJECT_STATE.md) and [latest handoff](docs/agents/LAST_HANDOFF.md).
- Human review: [open decisions and ADRs](docs/decisions/OPEN_DECISIONS.md).
- Product: [MVP scope](docs/specifications/MVP_SCOPE.md).
- Design: [system](docs/architecture/SYSTEM_ARCHITECTURE.md), [database](docs/architecture/DATABASE_DESIGN.md), [API](docs/architecture/API_CONTRACTS.md).
- Delivery: [roadmap](docs/tasks/IMPLEMENTATION_ROADMAP.md), [authoritative backlog](docs/tasks/TASK_BACKLOG.md), [test strategy](docs/quality/TEST_STRATEGY.md).
- Evidence: [research assessment](docs/research/RESEARCH_ASSESSMENT.md); the [original research](docs/research/TSA_DEEP_RESEARCH.md) is preserved as received.

The proposed first slice is a small, legally usable, human-reviewed question bank → assembled practice exam → timed attempt → persisted answers → practice score and explanations. Default assembly is personalized and excludes prior stable identities/equivalents for that student. The [Question Factory](docs/specifications/QUESTION_FACTORY_SPEC.md) is an independent early research/production track, never a live examination dependency; see [reuse policy](docs/specifications/QUESTION_REUSE_POLICY.md).

## Documentation authority

The repository is the persistent source of truth. Owner approval records establish decisions; specifications own domain behavior; architecture documents own technical boundaries and contracts; the backlog owns task status; project state and handoffs provide navigation and evidence. Research is evidence, not operational instructions or an approved specification. If documents conflict, record the conflict and resolve the authoritative document before dependent implementation.

Do not infer approval from the existence of a document. No provider-specific instructions are needed. Do not initialize the application until the relevant decisions and task assignment are approved. These shared-contract checks do not start the application.

## Shared contract verification

The current executable scope is the TypeScript shared-contract package. Use Node.js `24.18.0` and npm `11.16.0`, then run the following from a clean checkout:

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
