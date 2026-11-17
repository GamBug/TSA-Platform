# Generic generation-response inspection

Use `inspectGenerationResponse(requestBytes, responseBytes)` from
`src/modules/generation/response-validation.mjs` in internal server/Factory code.
Both arguments are exact UTF-8 JSON bytes in a Buffer or Uint8Array; string and
arbitrary JavaScript objects are unsupported. Shared-memory buffers are rejected.
Native byte-view getters preserve offset/length and avoid evaluating shadow
properties or iterators. The function snapshots bytes and writes nothing.

The request and response use existing G1 GenerationRequest and ProviderResult
contracts. No route, schema version, queue, storage or provider dispatch is added.
Typed ProviderError outcomes remain adapter/executor control flow; this function
inspects complete ProviderResult envelopes, not retry policy or durable settlement.

Callers must retain actual raw provider and charge evidence before inspection.
Rejected/truncated/invalid output may still have incurred charges. No outcome here
refunds a reservation, authorizes a retry or proves that a provider call was free.
Unknown `usage.costMicros` returns REQUIRES_RECONCILIATION and no candidates;
known input/output/cost budget overruns reject. Only COMPLETE with exactly the
requested count proceeds to question-schema checks. Duplicate stable/version IDs,
invalid typed answer keys and requested metadata drift reject the entire response.

Requested section, taxonomy, interaction type and skill set must match. Skill
order is immaterial; duplicate skill IDs are unsupported. A non-null requested
cognitive level must match; null means unspecified, not verified difficulty.
Provenance references are not resolved by this function and supplied metadata
does not establish registered taxonomy, source rights or author identity.

An accepted outcome is deliberately labelled **STRUCTURALLY_VALID**. Its
`remainingChecks` still require safe-content validation, registered taxonomy,
source rights/provenance, trusted identity and hash computation, duplication/
equivalence, answer correctness and independent human review. Model-supplied
content hashes, author IDs or generation-run IDs remain untrusted data. Never
insert them directly or bypass the existing canonical DRAFT import process.

```js
const inspected = inspectGenerationResponse(
  Buffer.from(JSON.stringify(trustedRequest), 'utf8'),
  receivedProviderResultBytes,
);
// Forward only STRUCTURALLY_VALID data to the remaining internal validation gates.
// This result is not a student DTO or public error envelope.
```

All outcomes are private internal data, including the exact received-byte
`responseHash`; do not expose them through student responses, public logs or
screenshots. Rejection reasons contain fixed codes rather than source, keys,
explanations, model text, schema paths or raw parse errors. An unsupported/over-limit
byte input has no computed hash. Parsed outputs are fresh objects and cannot
mutate caller buffers or later inspections.

This implementation caps request bytes at64KiB, response bytes at2MiB and candidates
at500. These are this helper's bounds, not a change to canonical G1 limits or a
claim of500-candidate Factory execution. Candidate content can be structurally
valid while unsafe or incorrect; that limitation is explicit and tested.

Run `npm run test:generation` for fake adapter plus response boundary checks, or
`node --test tests/ai/*.test.mjs` for the full current offline AI suites. No live
model, database, rights attestation or publication is involved. Full AI-001/002
and Factory/MVP/release acceptance remain separate.
