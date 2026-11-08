# Provider-free generation fixture adapter

RECOVERY-008 adds an internal, deterministic adapter over the existing G1
`GenerationRequest`, `ProviderResult` and `ProviderError` contracts. It is a
scripted test double, not an LLM, scheduler, generator of approved content, or
second question bank. No network, child process, database or file writes occur.

Import `createFakeGenerationAdapter` from
`src/modules/generation/fake-adapter.mjs` in trusted server-side/test code. Pass an
array of explicit cases, each containing exactly `request`,
`approvedSourcePayload` and `resultOrError`. Requests use the existing
`generation/1` shape. Source payloads are plain synthetic JSON, not instructions
or rights attestations. Exact request/source equality selects a case; object key
order is immaterial, array ordering is retained. Duplicate matches are rejected.

Every scripted successful result must already have
`modelRevision: 'fixture/fake-generation-adapter/1'`, `providerRunRef: null`, and
`usage: {inputTokens: 0, outputTokens: 0, costMicros: 0}`. These are actual zero
provider usage for this fake adapter. Records with real/unknown/nonzero provider
metadata are rejected rather than relabelled. This does not permit inventing zero
usage for manual LLM output or changing Factory v2/manual staging rules.

Call `await adapter.generate(request, approvedSourcePayload, cancellationSignal)`.
`capabilities()` reports supported domains/types and this fixture module's bounds;
it does not alter the shared schemas. Matching cases return independent deep
copies. COMPLETE has the requested candidate count, TRUNCATED cannot exceed it,
and REFUSED has no candidates. Candidate JSON remains untrusted: downstream
schema/content/rights/equivalence/answer checks and qualified independent human
review are still required. The adapter never imports, approves or publishes.

Scripted errors use only existing ProviderError codes and retryability. Invalid
runtime input returns a generic INVALID_OUTPUT; an unmatched case returns a
generic nonretryable UNAVAILABLE. These errors contain no request/source/candidate
content. An aborted signal rejects with AbortError as a control-flow cancellation;
the frozen ProviderError contract has no CANCELLED variant. No sleeps, retry loop
or automatic redispatch are supplied.

Configuration and runtime JSON are bounded and snapshotted. Accessors, proxies,
cycles and non-JSON values are rejected rather than evaluated. Mutation of
constructor inputs, returned outcomes or capabilities cannot alter later matches.
Fixture limits are implementation limits for this adapter only.

From an installed checkout with built contracts:

```sh
npm run build
npm run test:generation
```

The existing offline Reading tests remain separate (`node --test tests/ai/*.test.mjs`).
Do not connect this adapter to student requests or use it to claim model quality,
content correctness, real rights, durable plan/reservation/recovery behavior or
production readiness. Full AI-001/FACTORY-002 acceptance remains separate.
