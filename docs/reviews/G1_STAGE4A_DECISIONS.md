# G1 preparation — consolidated owner decision packet

Date: 2026-10-19, Asia/Bangkok. Author: Codex Sol 6.1 / Medium, coordinator.
Historical Stage 4A proposal, superseded in architectural scope by owner D1–D6
approval/Stage 4B activation on 2026-10-19 (OPEN_DECISIONS). The options below
preserve the original packet; they are not evidence of implementation. At that
checkpoint D3 limits were initial parameters pending measurements, as the owner explicitly required;
current Stage 4B reference measurements and completion evidence are in LAST_HANDOFF.
Current technical addenda live in the question, assembly, Factory and API specs;
no automatic G1 or unrelated ADR approval follows.

## Work classification

READY rows were executed and independently verified in Stage 4A; see the
[handoff](../agents/LAST_HANDOFF.md) and
[dependency evidence](FOUND002_STAGE4A_DEPENDENCIES.md). BLOCKED/DEPENDENT rows
preserve the historical Stage 4A classification. Current scoped approvals and
completion evidence supersede resolved D1–D6 rows; owner G1 disposition and
missing hosted-CI evidence are not approved by this packet. See current handoff.

| G1 work | Stage 4A classification | Dependency / evidence boundary |
|---|---|---|
| Existing-contract emitted producer/consumer and strict-client tests | READY | Fixed current schemas only; no real service/persistence claim |
| Emitted declaration consumption and safe projection checks | READY | Does not prove private symbols cannot be imported from the current package |
| Locked version/license/advisory evidence | READY | Findings/unknowns recorded; no automatic dependency changes |
| Build/runtime smoke and OpenAPI drift regression | READY | Stage 3 already implemented; rerun on accepted changes |
| FOUND-007 acceptance | BLOCKED | D1; code consistency is not owner task closure |
| Exact content hash and duplicate fingerprint rules | BLOCKED | D2; current fixture hashes are labels, not computed identities |
| Full assembly/search/manifest replay and lock key | BLOCKED | D3; PRNG vectors alone are insufficient |
| Complete stimulus/asset/rights transport | BLOCKED | D4; existing strict subset is not a full transport |
| Released result wire contract | BLOCKED | D5; public/released DTO and documented endpoint differ |
| Public/private import and client artifact contract | BLOCKED | D6; no silent export, endpoint or generation-target redesign |
| Identity/replay/transport/client implementation and goldens | DEPENDENT | Exact relevant D1–D6 dispositions, authoritative spec update, then bounded dispatch |
| G1 acceptance assessment | DEPENDENT | Accepted FOUND-002/FOUND-007 deliverables and all remaining evidence; no automatic gate change |
| Hosted CI observation | DEPENDENT | Authorized push/PR or existing remote execution evidence; no push in Stage 4A |

This scopes G1 preparation. Database concurrency, publication authorization,
browser/deployed-service tests and live providers remain later runtime work;
they are not silently added as G1 exit criteria.

## D1 — Shortage taxonomy / FOUND-007

Question: accept the currently documented and tested taxonomy and close the
bounded FOUND-007 reconciliation, without approving ADR-004/007 as a whole?
Sources: [FOUND-007](../tasks/TASK_BACKLOG.md#found-007--resolve-attempt-shortage-and-error-response-contract-consistency),
[API contracts](../architecture/API_CONTRACTS.md), existing error-response tests.

- **A, recommended:** retain HTTP 422 `INSUFFICIENT_ELIGIBLE_INVENTORY` and
  `INSUFFICIENT_UNSEEN_INVENTORY`, HTTP 503 `SEARCH_EXHAUSTED` without an
  infeasibility claim, current safe shortage details and no-allocation retry rules.
  Minimal consumer migration; typed shortage remains compatible with generic errors.
- B: introduce a generic public shortage alias. Requires coordinated schema,
  document and strict-client migration; loses the current diagnostic distinction.

Unlocks: recorded FOUND-007 acceptance and freeze of its contribution to FOUND-002.

## D2 — Exact immutable identity and separate duplicate fingerprint

Question: approve byte rules, hashed field set and reference resolution before
computed hashes replace synthetic labels? [Question schema](../specifications/QUESTION_SCHEMA.md)
requires immutable fields/private answers/references but does not specify bytes.

- **A, recommended:** versioned envelope `{canonicalizationVersion, question,
  references}`; `question` contains all current QuestionVersion fields except
  `contentHash`; exclude external workflow/events. JCS per
  [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) → UTF-8 → SHA-256 encoded
  `sha256:` plus lowercase hex. Preserve authored strings and array order; no
  trimming or Unicode rewriting for identity. Explicitly list each referenced
  immutable stimulus/asset/source version and verified hash, sorted by kind/ID;
  reject missing/duplicate/conflicting refs and self-reference. Do not hash an
  unresolved reference or infer its bytes from a label. Persist the versioned
  envelope separately pending approval of transport/storage fields.
- B: hash normalized content only, excluding identity/author metadata. Easier
  cross-import equivalence but conflates content identity with duplicate detection
  and changes the meaning of the documented immutable-version hash.

Separate fingerprint recommendation under A: a versioned content/interaction
projection (content, resolved stimulus content, option/statement content and their
order; exclude IDs, creator, private answer/explanation and workflow); normalize
human text with NFC and collapse/trim an explicitly enumerated Unicode whitespace
set, preserve TeX and case. Hash the canonical projection; option reordering and
near-semantic similarity remain review signals, not automatic equivalence merges.
Alternative: reuse exact identity as fingerprint; simpler but misses metadata-only
and whitespace-only duplicates. The exact whitespace set and referenced payload
projection must be frozen in the approved field-level addendum before code starts.

Consequences: A adds cross-implementation canonicalization/golden tests and a
reference envelope; B needs wider semantic migration. Either version applies to
new content; historical questions/exams are immutable, never silently rehashed.
Unlocks: content byte/digest, tamper, Unicode and duplicate-detection goldens.

## D3 — Complete assembly-v1 replay and publication lock encoding

Question: freeze every search/ordering decision and the lock key, not merely PRNG?
Source: [assembly reproducibility](../specifications/EXAM_ASSEMBLY_SPEC.md#algorithm-and-reproducibility).

- **A, recommended:** deterministic bounded depth-first search over the captured
  manifest; existing UUID sort, xorshift32/Fisher–Yates reference; choose unmet
  quota by lowest remaining-compatible-capacity / required-remainder ratio (exact
  integer cross-products), ties by section index, dimension then value lexical
  order; if none unmet, choose first incomplete section. Branch units by captured
  usage ascending then seeded unit order; take before skip, with independent final
  validation. Count root and each entered child state once, including pruned
  children; cap before entering the next state; exhaustion is not a shortage proof.
  Keep proposed 50,000-node / 2,000-unit caps and three contention replans. Final
  output follows blueprint section order, seeded selected-unit order and frozen
  bundle-member order. Pin all of this under an explicit algorithm version.
- B: use a solver or simpler unranked selection. A solver increases replay/version
  obligations and potential dependency scope; removing ranking changes selection
  preference and requires an explicit spec disposition.

Proposed lock encoding under A: PostgreSQL two-int advisory transaction lock,
fixed namespace/key `(1414742321, 1)` for the bank publication guard, shared for
sealing and exclusive for eligible-bank mutation. Reserve this pair in the approved
contract, keep user-allocation locks separate, and avoid hashing arbitrary names.
Any multi-bank/tenant key scheme is a separate approved revision.

A still needs an approved field-level manifest schema, hard-pruning semantics,
source-cap accounting for bundles and boundary goldens; approve that addendum
before implementation. This packet is a concrete direction, not an invented
complete replay contract. Unlocks: reference search and manifest-to-slot goldens;
database lock enforcement remains DATA/ASSEMBLY work after G1.

## D4 — Complete Factory package transport

Question: inline complete immutable stimuli/assets/provenance or rely on an
out-of-band resolver? Sources: [Factory](../specifications/QUESTION_FACTORY_SPEC.md),
[question references](../specifications/QUESTION_SCHEMA.md#validation-rules).

- **A, recommended:** explicitly versioned complete package envelope with unique
  stimulus/asset manifests, MIME/size/digest and content-addressed asset members,
  source-version/rights-evidence records and every candidate's exact references.
  Missing, conflicting or partial bundles fail atomically. Preserve draft-only
  receipt/publication separation. Freeze field shapes, size limits and byte/member
  delivery format in an owner-approved addendum; do not add fields to strict v1
  consumers implicitly. Prefer a new package version for the expanded shape.
- B: keep ID-only references and mandate external resolvers. Smaller packages,
  but incomplete offline replay and explicit resolver availability/trust requirements.

Unlocks: full transport schemas, complete-bundle producer/consumer negatives and
reference-integrity fixtures; not real import transactions or rights permission.

## D5 — Released-result wire shape

Question: what does documented `GET /attempts/{id}/result` return after release?
Sources: [API route and Result](../architecture/API_CONTRACTS.md),
`ResultViewSchema` / `AuthorizedReleasedReviewSchema` in the runtime source.

- **A, recommended:** keep the existing documented route, use a separate explicitly
  authorized released-review response including items/keys/explanations, and keep
  public score-only ResultView distinct. Before release use existing documented
  errors, never a private partial response. Generate a separately classified
  released contract artifact, not unreleased keys in the student-safe artifact.
  Requires coordinated route/schema/client generation and authorization tests.
- B: make the existing route score-only and add a separate review route. Cleaner
  route separation but invents an endpoint and changes documented consumers.

Unlocks: accepted result/review operation and strict generated-client fixtures.
Human ownership/release enforcement stays mandatory; no automatic key publication.

## D6 — Public exports and generated-client target

Question: authorize a consumer boundary and artifact scope before enforcing imports?
[API artifact policy](../architecture/API_CONTRACTS.md#errors-concurrency-and-compatibility)
requires coordinated generated artifacts; current package root exports all schemas
and OpenAPI has components but no paths.

- **A, recommended:** approve a dedicated student-safe package subpath/allowlist,
  with internal and released-review surfaces separate. Generate committed
  TypeScript request/response declarations for approved existing route operations;
  any generator dependency or runtime client library requires explicit scope review.
  Retain the internal root temporarily, migrate student consumers to the safe entry,
  and add negative import/declaration plus artifact-drift tests. Do not claim this
  alone enforces future browser bundling or server authorization.
- B: retain one broad root and rely on conventions/schema projection. No export
  migration, but cannot honestly satisfy an import-level private-type exclusion.

Unlocks: safe-entry import tests and strict operation/client generation after D5
and field-level route acceptance. No new route/service or dependency is authorized
by Stage 4A. Exact public symbol list and client-generation scope must be recorded.

## Owner disposition and Stage 4B boundary

Record approve/revise/defer for D1–D6, with exact scope, identity and date in
[decisions](../decisions/OPEN_DECISIONS.md). Recommendations are not approvals.
D2–D4 and D6 require their listed field-level addenda before implementation;
approving only a direction does not authorize workers to invent missing fields.
After dispositions: serialize authoritative contract updates, then dispatch
identity, replay, transport and client work under explicit allowlists. Use Luna /
XHigh by default, Terra / Medium only for demonstrated complexity, and Sol /
Medium for necessary independent boundary review. No Stage 4B starts automatically.
