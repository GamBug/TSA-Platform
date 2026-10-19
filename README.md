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

Do not infer approval from the existence of a document. No provider-specific instructions are needed. Do not initialize the application until the relevant decisions and task assignment are approved. There are no install/run commands to execute in this phase.

## Shared contract verification

The current executable scope is the TypeScript shared-contract package. Use Node.js `24.18.0` and npm `11.16.0`, then run the following from a clean checkout:

```bash
npm ci
npm run build
npm run test:built
npm run typecheck
npm test
npm run contracts:check
npm run docs:check
```

`build` emits JavaScript and declarations from the shared contracts into the ignored `packages/contracts/dist` directory. `test:built` runs the emitted JavaScript with ordinary Node.js, checking runtime schema acceptance and rejection plus an exported deterministic helper. This smoke test covers only the package's emitted runtime modules; it does not establish an endpoint, client SDK, browser bundle, service integration or release readiness.

`contracts:check` compares the committed student-safe OpenAPI artifact with the runtime schemas and does not write files. Regenerate that artifact only as a deliberate coordinated change with `npm run contracts:generate`, then rerun the verification commands. These shared-package checks do not establish service, database, browser, security, or release readiness.
