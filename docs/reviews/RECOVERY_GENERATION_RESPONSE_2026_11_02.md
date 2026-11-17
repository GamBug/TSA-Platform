# RECOVERY-010 — generic generation-response boundary

Date: 2026-11-02 Asia/Bangkok. Owner requested “next” after the recovery checkpoint;
root selected this implementation over existing accepted G1 contracts without
treating that instruction as approval of the pending media/Factory architectures.
Root is sole implementer; actual response_review (tsa_reviewer) independently
reviewed source, tests and guide read-only. Base feat/track-b-data-auth/a70861a;
all inherited dirty files preserved. No SQL, contract, dependency or rights changes.

## Outcome

New `inspectGenerationResponse(requestBytes,responseBytes)` validates bounded
exact UTF-8 JSON bytes against GenerationRequest, ProviderResult and QuestionVersion.
It checks complete counts, known usage limits, request section/taxonomy/interaction/
skill-set and requested cognition, unique version/stable identities, and rejects
the entire response on any failure. Unknown cost requires reconciliation rather
than appearing to be free. Refused/truncated output cannot be partially salvaged.

Accepted data is labelled STRUCTURALLY_VALID and retains explicit remaining checks
for content safety, registered taxonomy, source rights/provenance, trusted identity/
hashes, duplication/equivalence, answer correctness and independent human review.
The helper does not verify model-supplied hashes or perform reference resolution;
it never imports, publishes or creates validation/approval records. The deliberately
schema-valid unsafe-content test proves this limit rather than implying rendering
safety. Full AI-001/002 and Factory acceptance remain incomplete.

Private outcomes include the exact raw-response hash and contain no reflected
source/key/explanation/parse-error text in rejection reasons. They are not public
student DTOs or error envelopes. Native typed-array operations handle offset views
without evaluating shadow accessors/iterators; proxy/shared-memory inputs are
unsupported. Caller charge/raw-response evidence must be retained independently:
rejection does not refund costs, authorize retry or settle a durable reservation.

Code limits (64KiB request,2MiB response,500 candidates) are explicit helper limits,
not a change to canonical schemas or proof of500-candidate execution. No provider,
network, child process, filesystem write, database, student route or budget ledger
is used. [Usage and limitations](../guides/GENERATION_RESPONSE_VALIDATION.md).

## Verification

Node24.18.0/npm11.16.0 with existing built contracts, 2026-11-02:

| Actual command/check | Observed result |
| --- | --- |
| Root `npm run test:generation` | Final22PASS/0FAIL/0SKIP, fake10 + response12; `/tmp/tsa-recovery-response-validation-final.log` |
| Root `node --test tests/ai/*.test.mjs` | Final63PASS/0FAIL/0SKIP including existing manual/offline/research regressions; `/tmp/tsa-recovery-response-all-ai-final.log` |
| Root `npm run contracts:consumer-check` | Student/public-app import boundariesPASS; `/tmp/tsa-recovery-response-boundaries.log` |
| Independent response_review `npm run test:generation` | Final22PASS/0FAIL/0SKIP; no concrete correctness/privacy findings |
| Independent source/test syntax and direct new-file whitespace | PASS |

Reviewer additionally probed offset-view hashing, shadow accessors/iterators,
proxy/revoked-proxy rejection and unsafe integer usage. Root converted relevant
probes into permanent regressions; final review of those additions and the guide
found no new issue. No broader independent suite was run. Root final doc/link checks
passed; no unrelated PG/browser rerun for this isolated unwired internal module.

Final source SHA256:
`545d8add767407b3af4b1cef244a1eb9fdf3832479e8f68320e5ab58ad965d52`.
Final test SHA256:
`413c7f1831da43be8135ab17bb9e76680bd8782b711636ed55c71394997c22c8`.

## Continuation

RECOVERY-010 complete in this scope; root releases edit reservations. Architecture
questions are unchanged and no human content/manualAT/production acceptance is
supplied. A read-only next-slice investigation will determine whether the existing
Factory2/content validator can compose a generic provider-free entrypoint beyond
Reading without inventing a schema or duplicating the current experiment. Do not
start runtime/schema changes from an unapproved planning document.

Recommended available subscription Codex/high if selectable for accepted-contract
integration, separate read-only reviewer; no paid API or quota assumption. No
commit/push/merge/deployment.
