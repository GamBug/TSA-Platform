# Offline Reading generation-path comparison

RECOVERY-022, November 5, 2026 (Asia/Bangkok). Root Codex is accountable and owns
the existing test-fixture seam; operation_tests_resume owns the new integration
test. Branch `feat/track-b-data-auth`, base `a70861a`; inherited tracked/untracked
changes preserved. Existing subscriptions only, no paid model API calls.

## Contract and delivered scope

[Scenario J](../quality/TEST_STRATEGY.md) calls for comparative adapter fixtures,
the same canonical publication/exam boundary, and no provider calls from student
requests. The [acceptance-map review](RECOVERY_ACCEPTANCE_MATRIX_2026_11_02.md)
corrected an unjustified planner-approval dependency for that investigation.

The [existing test fixture](../../tests/integration/factory-bank-exam/fixture.mjs)
now accepts an optional generator, defaulting to the original direct generator.
Only initial generation is injected; the altered-content/same-key conflict
control stays unchanged. This is a private test seam, not a new application API.

The [comparison test](../../tests/integration/factory-bank-exam/provider-replacement.test.mjs)
uses existing direct deterministic generation and the existing configured local
subprocess bridge. Both run sequentially through actual canonical DRAFT import,
exact replay, unselectable-DRAFT checks, two passage bundles and the existing
synthetic publication gate. Ordinary HTTP publication still returns 403; only
the established disposable fixture capability permits synthetic publication.
Both complete actual HTTP login, allocation, all typed saves, reload, submit,
worker grading and released review for twenty questions.

Stable semantic projections compare passages, question content/interactions,
language/section/skills/cognitive labels, sealed typed keys/explanations and
released responses/results. Run IDs, timestamps, critic metadata and evidence
hashes are not incorrectly required to match across the two generation paths.
Direct generation retains NO_LLM_FIXTURE/zero usage/no critic. The local command
retains TEST_DOUBLE and its synthetic reported usage, two critic records, four
subprocess dispatches and raw-before-result checkpoint ordering. Raw checkpoints
are captured in memory here; this is not a durable checkpoint/restart proof.
After generation, the command wrapper rejects further dispatch; the student
journey leaves its call count unchanged.

The two paths share the existing Reading package builder and controlled fixture
content. This compares transport and downstream behavior, not independent model
judgment, two vendor adapters, generic G1 adapter interchangeability, human
content quality or full Track A acceptance. No student/server/SQL/grant/schema,
generation-provider implementation, dependency or approval-route changes.

## Executed verification

Environment: Node 24.18.0, npm 11.16.0, PostgreSQL 18.6, local disposable fixtures.

| Check / actor | Observed result | Limits |
| --- | --- | --- |
| Writer `node --check tests/integration/factory-bank-exam/provider-replacement.test.mjs` | PASS | Syntax only. |
| Writer `node --test tests/integration/factory-bank-exam/provider-replacement.test.mjs` | 1 PASS, no failures/skips, approximately 8.3 seconds | Two sequential actual Bank/exam journeys, local test double only. |
| Independent same focused command | 1 PASS, no failures/skips, approximately 8.9 seconds | Actual read-only operation_review_final; no material findings. |
| Root `node --check tests/integration/factory-bank-exam/fixture.mjs` | PASS | Existing helper's optional generator seam. |
| Root isolated default-generator fallback fault | Detected | Command-path metadata assertion fails when the injected generator is ignored. |
| Root isolated student/provider coupling fault | Detected | The command wrapper rejects generation attempted during student runtime startup. |
| Root `node --test --test-concurrency=1 tests/ai/reading-factory.test.mjs tests/integration/factory-bank-exam/*.test.mjs tests/integration/assembly/reading-experiment.test.mjs` | 21 PASS, no failures/skips, approximately 22.8 seconds | Existing affected Reading selection plus new comparison; sequential file execution. |
| Root `npm run contracts:consumer-check` | PASS | Both student and public-app import boundaries. |
| Root `npm run docs:check`; `git diff --check`; direct task-file whitespace check | PASS | No docs errors; preserved historical whitespace warning, anchors NOT_CHECKED. |

The two fault controls copied the helper and test into private temporary
directories, resolved imports to the original modules, and changed exactly one
helper statement per case. Both reached the intended behavioral assertions;
neither was a setup/compile failure. Temporary copies were removed and both
workspace source hashes were rechecked unchanged. Logs:
`/tmp/tsa-recovery022-ignored-generator.log` and
`/tmp/tsa-recovery022-student-provider-coupling.log`. These are sampled test-value
controls, not observed product defects or proof against arbitrary coupling.

Independent review covered the full new test and existing helper/publication seam; it did not repeat
the fault controls or broader suite. Final suite log:
`/tmp/tsa-recovery022-reading-final.log`; boundary log:
`/tmp/tsa-recovery022-boundaries.log`. No failures or skips occurred in these
executions. The existing public `.js` module-type warning remains nonfatal.
Documentation log: `/tmp/tsa-recovery022-docs.log`. All owned test sessions ended;
fixture clusters/HTTP servers/worker pools and temporary fault copies were
cleaned up. Source hashes match the submitted values below after final checks.

Final submitted helper SHA-256:
`74bb79b86ce0ac6eb3dfbb874a9777ec3a41374edd973c4d40fd555cffc4f16e`.
Final submitted test SHA-256:
`3ac8b0a466f77d12380fdb3fd62724d98b0a2625ac458b653f16905925c46ff5`.

## Remaining limits

This adds bounded J fixture evidence; no full provider replacement, scientific
evaluation, production decoupling or A/B/I scheduler/recovery acceptance follows.
Existing manual transport/media/planner decisions and human content/rights/AT
inputs retain their separate gates. No research, historical exams, commits,
push, merge or deployment changes. Model-token/CPU/peak-memory/CI-billing usage
is not measured; test duration is not a cost or production-performance claim.
Root integrated backlog, project state, acceptance map, dated plan and latest
handoff. Implementation and review reservations are released; the broader goal
remains active with the separate recorded acceptance gates.
