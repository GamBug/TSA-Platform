# SEC-001 — bounded Zod validation dependency remediation

2026-10-25, base694df4d. AUTHORIZED_IN_SCOPE / IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED, selected
by root under recorded owner engineering-choice delegation. Recommended root Codex
Sol6.1/High for contract compatibility/integration; separate actual Sol6.1/Medium
read-only reviewer. Existing subscriptions only; no model API or new live dependency.

## Observed problem and bounded choice

Clean B8 installation succeeds, but current `npm audit --json` exits1 with one high
advisory against locked runtime Zod4.1.12:
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Advisory
reviewed2026-10-23 affects<4.6.6. A controlled actual StudentQuestionSchema input
with10,000 invalid options (the existing allowed maximum is10) allocates20,002
validation issues on4.1.12. No process crash/OOM or network exploitation is claimed.
Body caps and role gates remain necessary independent protections.

Select exact Zod4.6.7 (npm registry observed patched version, MIT, no declared
runtime dependencies). Existing zod-to-openapi8.5.0 peer^4.0.0 includes it. Registry
integrity observed: sha512-g8W2D2kU6a8untc053fX1uVBKzM7yqAxW/3zwk83+6RyF2+SKOuV+c0wBDhUwzV1PaGapmZH+rmcUzPf+3CGwg==.
Change only packages/contracts/package.json and the matching lock entry, plus a
focused real-schema bounded-error regression and task evidence. Do not run a broad
forced audit upgrade. Preserve every other resolved dependency unless a demonstrated
peer requirement is reviewed and explicitly recorded first.

## Compatibility and acceptance

No intended wire-schema, policy, identity/canonicalization, solver, DB, route,
privilege, student workflow or content change. Existing generated OpenAPI/operation
artifacts and golden/replay fixtures must remain unchanged. Inspect actual type,
contract, emitted-consumer, reference, PG and browser outcomes. If an observed
validation/artifact change alters a frozen contract, stop that change for explicit
impact/disposition rather than weakening tests or silently regenerating artifacts.

A bounded real StudentQuestionSchema regression must show that an oversized invalid
collection rejects without collecting an issue for every invalid member. Keep the
fixture small enough to run safely without memory/timing assertions or inducing OOM.
Existing accepted valid payloads still pass, unknown/private fields still reject.
Record observed pre/post issue counts, exact version/integrity/license/dependency
diff, dated audit output and limitations. Run existing targeted contract/emitted/
boundary/PG/browser checks; no redundant general security harness. Independent
read-only review and clean checkout before completion. Dated zero-advisory output
is an observation, never a complete security or production guarantee.

[Executed compatibility and review evidence](../reviews/SEC_001_ZOD_REMEDIATION_VERIFICATION.md).
Clean-checkout reproduction pending; no frozen source/artifact edit was required.
