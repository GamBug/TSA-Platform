# Independently executable Question Factory

Status: PROPOSED under ADR-005/008, based on the owner's Phase 02.75 two-system requirement. This document owns scheduling/batching/runtime; [AI pipeline](AI_QUESTION_PIPELINE.md) owns candidate generation/quality gates; [question schema](QUESTION_SCHEMA.md) owns content; [database](../architecture/DATABASE_DESIGN.md) owns durable records. This is an early research track, not a dependency on a completed website.

## Runtime, commands and permissions

Propose a separate Node/TypeScript executable in the same repository (future `tools/question-factory`), importing provider-neutral domain libraries. It can run on a research machine or worker host against an isolated database, fixtures and approved source payloads without starting Next.js, OIDC or student services. No application command exists yet. Planned command contracts: `plan --config <version>`, `run --batch-key <key>`, `resume --batch-id <id>`, `report --batch-id <id>`, `export --batch-id <id>`; schedule invokes the same run command. Manual initiation is restricted to content operators; no student endpoint launches it.

CLI inputs are an approved configuration version, operator or schedule identity, aggregate inventory snapshot and rights-eligible source versions. `plan` returns a frozen batch ID/key, ranked unit manifest, reservations and stop reason without provider calls. `run` creates or resumes that exact plan and returns its batch ID plus terminal or paused status; `resume` requires an existing batch ID and never replans implicitly. `report` reads durable status and cost evidence. `export` emits only draft package data and its provenance; it confers no approval. Invalid config, missing rights, unknown schema or unavailable inventory fails planning with a recorded reason before dispatch.

Shared deployment may use the same PostgreSQL instance but separate DB credentials, connections, queue kinds and process resource limits. Factory can read authorized source payloads and aggregate inventory, write jobs/runs/drafts/validation via scoped commands, but cannot approve/publish, read student identities/history/answers, access private exam snapshots or run grading/attempt commands. Review/publication happens under independent human staff identity. The website has no model credentials and no generation SDK calls on catalog/create/start/save/submit/grade. The exam worker claims only exam job kinds; factory claims only factory kinds. No orchestration server/microservice API is necessary.

Web exams never call the LLM, including on shortage, retry or grading paths.

The provider adapter implements the [pipeline contract](AI_QUESTION_PIPELINE.md): `capabilities()` reports supported output schemas and limits; `generate(GenerationRequest, approvedSourcePayload, cancellationSignal)` returns `ProviderResult` or a typed `ProviderError`. Factory maps unknown provider output through strict `question/1` validation before bank draft creation. It pins request/specification version, taxonomy, source IDs and rights decisions, section/skills/type, prompt template, model/adapter revision, output schema, limits and optional seed. Adapter-specific responses remain in restricted run evidence, never in the canonical question type. Swapping adapters changes configuration and evaluation evidence, not bank or exam contracts. A seed records a request parameter; deterministic replay means the same work identity and persisted output are reused. It does not promise that a paid provider will return identical text on a second call.

Start with factory concurrency 2 and bounded provider/DB timeouts (proposals to benchmark), separate DB pool caps, small transactions per work unit and low-priority/pause-on-DB-pressure controls. No provider call or batch loop holds bank-publication/user-allocation/attempt locks. Grade/recovery capacity is reserved independently. Separate CPU/memory cgroups/container/process host limits prevent a 500-draft run from monopolizing the web runtime. Shared DB remains a common failure domain; “independent” does not assert immunity to DB failure. OPS-001 must validate load and pause factory if student SLOs degrade; split infrastructure only after measured need.

## Versioned configuration and inventory planning

`factory-config/1` pins taxonomy version; section/skill/cognitive/target-difficulty/type quotas; eligible source versions; prompt/template/validator versions; provider adapter/model revisions; candidate cap; per-call and batch token/cost limits in integer minor units and explicit currency; provider concurrency/timeouts/retries; validation CPU capacity; available human review capacity; schedule/timezone and evaluation partition. Freeze resolved configuration/hash per batch; changing config creates a new version. Provider metadata stays opaque; canonical question data is provider-independent.

Quotas count requested draft questions by section, skill, interaction type and target difficulty; a multi-skill question can serve multiple inventory deficits but consumes one candidate slot. Planner records each target, observed approved supply, pending-work estimate and assigned quota so overlap cannot inflate the candidate cap. A zero deficit yields an empty completed plan with a reason. A rights-ineligible source never fills a quota. Target difficulty remains an authoring goal, not an official TSA difficulty or score claim.

Weekly production is a configurable schedule, with proposed default Monday 02:00 Asia/Ho_Chi_Minh. Store IANA timezone, local period and resolved UTC scheduled instant; changing timezone/config creates a schedule revision. An OS scheduler or hosting cron invokes the executable, not a student web request. `UNIQUE(scheduleId,scheduledForUtc)` prevents duplicate dispatch, regardless of scheduler retries. Manual runs use a unique operator batch key. One active batch per schedule; missed weeks coalesce into one latest-period inventory plan (no unlimited catch-up). Retrying an incomplete batch resumes its original frozen plan; an operator supersedes it explicitly if a fresh inventory plan is wanted. Schedule disabled/provider outage simply pauses production, never examination availability.

An inventory snapshot records eligible approved distinct identities/equivalence groups, feasible bundle counts, section/skill/type/target-difficulty coverage, rights horizons, and already pending drafts/review backlog. Distinguish unique questions from bundles; a per-skill count may overlap another skill. Counts alone do not prove a full blueprint is feasible; include dry-run assembly against representative authorized profiles. Aggregated recent shortage events/cohort demand can prioritize skills, but factory receives no per-student histories or arbitrary private identifiers. No shortage event directly creates an LLM job.

Planner ranks deficits against configured target inventory and representative unseen-inventory demand. Deduct likely yield of already-pending work with explicitly recorded estimated acceptance rate (unknown rate uses conservative configured prior); estimates never count as approved stock. Allocate a batch's finite candidate budget to largest weighted deficits, including bundle-compatible production. Persist priorities, evidence, predicted yield and stop reason. Maximum planned work is bounded by all of: configured cap, remaining money/token reservation, independent validator capacity and available human review slots. Do not generate uniformly or replenish a student's exact exam on demand. A requested cap of 500 means at most 500 drafts, not a promise of 500 approved questions; reduce/stop if review/budget capacity is smaller.

## Durable batch and item lifecycle

Reuse `jobs` for all leases/retries/fencing, `generation_runs` for provider provenance and the bank's validation/review workflow. Add batch/config/inventory records plus one `factory_items` manifest row per planned production unit; do not add a second queue or separate review bank. A unit is a standalone question or a complete stimulus bundle and has stable itemKey, spec hash, ordinal, planned candidate count and linked job. The batch cap counts questions, not merely units.

Batch states: PLANNED → RUNNING → COMPLETED / COMPLETED_WITH_FAILURES / PAUSED / CANCELLED. PAUSED records BUDGET, CAPACITY, PROVIDER or OPERATOR and can resume; COMPLETED means generation/import accounting finished, not publication. Jobs retain QUEUED/RUNNING/SUCCEEDED/FAILED_RETRYABLE/FAILED_FINAL/CANCELLED. Report items pending, generated, validation-failed, awaiting review, rejected and published separately. Publication can happen later, without changing completed run outputs.

Use one stable producer namespace plus batch key as the logical batch identity. A scheduled key derives from schedule ID, schedule revision and resolved UTC period; a manual key is supplied by its authorized operator. Batch ID is the database UUID allocated once for that key. Freeze ordered item keys from batch key + plan ordinal + unit specification hash; the item ID is its persisted UUID. A job dedup key contains batch/item key and job kind. Generation run ID identifies one reserved external call, with a unique `(job ID, call kind, call ordinal, attempt number)`; it is never a substitute for item identity or a bank import receipt. Retries reuse batch/item/job identities and their committed responses. An intentional new generation has a new item key and a `supersedes` link. Persist canonicalization/hash algorithm versions so replay and package conflict checks compare the same bytes.

Reserve worst-case call/retry spend atomically against batch budget before dispatch; reconcile actual usage after response. Timeout may be charged: hold ambiguous reservations until provider reconciliation or conservatively consume them; retry cannot assume zero cost. Include independent verifier calls in budgets. Fencing prevents stale workers committing final outcomes. A call may execute twice externally; exactly-once billing is not promised. Bounded retry/backoff with max 3 call attempts is the proposed default. A valid already-persisted output is never regenerated simply because later validation/import failed.

Apply configured provider request/token rate limits and concurrency across factory workers before each generation or verifier call; a single-process prototype can use its own bounded scheduler, while multiple workers need durable shared reservations in the existing database. Respect provider retry-after where supplied; otherwise bounded exponential backoff with jitter applies only to retryable rate-limit, timeout and availability errors. Refusal, invalid output, rights failure and validator failure are final for that call/item until an operator creates a revision or explicitly retries a corrected input. Enforce batch and operator-approved period spend caps in one currency with explicit conversion assumptions for cross-currency reports; missing prices or exhausted cap pause dispatch. A late response or lease loss cannot free its reservation or overwrite a newer checkpoint.

Persist each provider response durably with run ID, itemKey, model/adapter revision, prompt/input hashes, source versions, decoding options, seed if supported, usage/cost/currency and response hash before acknowledging item completion. Provider results are untrusted. Candidate or complete bundle import plus provenance links and manifest outcome commits atomically per unit; no 500-item transaction. A crash resumes from durable unit checkpoints, not batch start. Cancellation stops unstarted calls, retains committed drafts/run evidence and accounts for in-flight cost. Invalid candidates remain rejected/quarantined evidence, never visible to assembly.

## Portable import and controlled publication

Factory staging consists of restricted batch/item/job/run records, raw provider responses and rejected or unimported candidates. These are internal evidence and are never selectable by assembly. A successful canonical import creates immutable `DRAFT` question/stimulus versions in the shared bank's authoring area, linked to the factory receipt; it does not create eligible stock. The approved bank consists only of versions with current `APPROVED` workflow, eligible pointer, valid rights and resolved equivalence/duplicate checks. Factory operators and service credentials cannot cross that publication boundary. Raw evidence retention may be limited by approved policy, but source/rights, validation, review and receipt provenance required for a published version must remain available.

Export `factory-package/1` manifest contains producer namespace, stable batchKey/itemKey, candidate ordinal, canonical content hash/schema version, question/stimulus/assets, exact source/rights evidence, run/validator metadata and template lineage. No production student data or invented approval is transported. Scoped import validates package/version/rights/assets and maps external source IDs to local immutable IDs; it must not trust claimed APPROVED status. Existing manual import uses the same bank validation command, not a second ingestion authority.

Importer records `UNIQUE(producerNamespace,batchKey,itemKey,candidateOrdinal)` and output hash → local question/version. Same key/hash returns same mapping; same key/different hash fails IMPORT_CONFLICT. Bundle members and stimulus import all-or-none, with every candidate mapped. Intentional regeneration uses a new itemKey with supersedes lineage, not overwriting a previous key. This record is a durable provenance receipt, not the expiring HTTP idempotency cache. If import is remote later, package receipts bridge systems; initially direct module calls with dedicated DB role are sufficient.

Generated drafts follow rights → schema/normalization → exact/semantic dedup → taxonomy → independent answer verification → automated quality evaluation → independent human review → controlled approval/publication through BANK-001. Publication is the existing exact-version APPROVED transition plus eligible pointer, under bank publication lock and eligibility revision increment. It is not a factory batch state. Human reviewer must not be the responsible human author/operator of that draft; retain operator identity even when a service imports it. Reuse-equivalence review is mandatory before eligibility. Active exams are unaffected by new approved versions.

Machine checks have `PASS`, `FAIL` or `INCONCLUSIVE` evidence tied to exact version hash and validator version. A `FAIL` blocks `IN_REVIEW`; `INCONCLUSIVE` needs explicit reviewer evidence and cannot silently pass. Human review records the independent reviewer's identity, rubric, decision and reason against that same hash. Rejection preserves the version; edits create a new `DRAFT` version and repeat applicable checks. Approval is an authorized human bank command, never a factory CLI or provider result. Revocation or quarantine removes future eligibility without changing frozen historical exams.

## Reporting, evaluations and integration milestone

Per batch/provider/model/prompt/section: planned units/candidates, actual drafts, schema/answer/dedup rejects, review backlog, human accepted/rejected/pending, published count, latency, tokens, currency-normalized costs and cost per published question (undefined when denominator zero). Human acceptance = accepted/(accepted+rejected) at reported cutoff, separately report pending; no treating unresolved drafts as successes. Preserve model comparison evaluation data/labels and uncertainty as in AI pipeline. Report source permissions and rights expiry, reproducibility limits and budget stop reasons.

Track A starts with source verification, rights-cleared taxonomy/evaluation fixtures, fake/template adapter and at least two interchangeable provider adapters for comparison (live use only with approved credentials/budget/data handling). It runs without the website. Track B starts with manually verified content, bank and personalized engine. Integration milestone INT-001 reimports a factory package twice, independently approves a subset, assembles a student's NEW_ONLY exam from that subset, then disables factory/provider and completes the exam; no engine/provider-specific changes. AI throughput is never a release condition for the first manually seeded web slice, while independent AI feasibility work is not deferred until that slice finishes.

Cost reservations are durable generation_runs records created before network dispatch, keyed by job/call kind/ordinal/attempt; batch counters and run reservation update in one transaction. This covers multiple independent verification calls as well as generation. Reconciliation settles each reservation once; uncertain charges cannot be released by a worker lease timeout alone.

## Acceptance scenarios for future implementation

These are required observable behaviors, not tests already run. Use fixtures and a controlled clock/provider unless an owner-approved live evaluation is available.

| Scenario | Input / interruption | Expected durable result |
|---|---|---|
| 1. Weekly and manual identity | Invoke a scheduled period twice, then a manual key twice; change the config for a later period | One batch per logical key/period; second invocation returns its existing batch ID/plan. Later period pins its new config; no duplicate provider work. |
| 2. Inventory quota and capacity | Give one section a shortage, overlapping skill targets, 500 requested drafts, and capacity/budget for fewer | Snapshot records deficits and overlap; plan favors shortage, fits all candidate/review/validator/spend caps, or records an empty-plan reason; no student history is read. |
| 3. Provider limit or long outage | Return rate limits/timeouts for repeated weeks, including an uncertain charged timeout | Retry-after/backoff and configured request/token caps hold; reserved spend stays bounded; batches pause/fail with typed reasons. Existing approved-bank exams still run without LLM access. |
| 4. Halfway crash and stale lease | Kill worker after a response checkpoint, then after unit import before job acknowledgment; let old lease holder return | Resume uses persisted response and receipt, imports one version once, fences stale completion and retains uncertain cost. Unfinished units alone continue. |
| 5. Bundle and import conflict | Fail one member/asset during bundle import; retry same package, then change content under the same producer/batch/item/ordinal | First transaction leaves no partial bundle; matching retry maps to same immutable local IDs; changed hash returns `IMPORT_CONFLICT`. |
| 6. Validation and human gate | Supply malformed, ambiguous and valid candidates; attempt approval with factory credentials or the responsible author | Hard failure cannot enter review; inconclusive needs evidence; unauthorized/self approval fails. Only independently reviewed exact versions become eligible. |
| 7. Provider replacement | Run the same versioned fixture specification through two adapters and export/import their drafts | Both adapters satisfy one contract; provenance identifies each model/run, and bank schema/review/exam contracts remain unchanged. A seed alone makes no textual identity promise. |
| 8. Concurrent workload and disabled factory | Process a bounded 500-candidate batch alongside start/save/submit traffic, then stop factory/provider | Factory obeys separate pools/job kinds and pauses on measured DB pressure; workload meets owner-set SLOs or records the failure. Approved stock still supports exams; no web exam path calls the LLM. |

## Decisions and evidence needed before live production

ADR-005/008 and the provider data/rights envelope remain PROPOSED. The owner must approve schedule/timezone, provider and input permissions, currency/prices and batch/period budgets, request/token ceilings, reviewer capacity, acceptance thresholds, resource limits and retention before live dispatch. Factory implementation can use synthetic or rights-cleared isolated fixtures within its assigned scope. No official TSA reuse permission, official item format, equivalent scoring, provider determinism or live-load result is inferred from this specification.

## Stage 4B complete draft transport — factory-package/2

Scoped D4 approval on 2026-10-19. Existing factory-package/1 and draft receipts
remain unchanged. Version 2 is an internal validated import command, not a new
HTTP generation endpoint. It contains schemaVersion, producerNamespace, batchKey,
1..100 existing FactoryCandidate objects, a shared identity/1 reference DAG,
asset members and immutable rights evidence. All candidates must validate and
match computed identity before any receipt is returned; output is DRAFT only.
No persistence/publication or current-rights authorization is inferred.

Reference payloads: taxonomy is immutable version data; question is immutable
parent-version data; stimulus is `{content:Block[],provenanceIds:string[]}`;
asset is `{mediaType,byteLength,bytesHash}`; source is `{title,content:Block[]}`;
provenance matches the corresponding existing FactoryCandidateProvenance object;
evidence is immutable evidence data. Every image dependency must be an explicit
asset edge; stimulus provenance IDs must be explicit provenance edges. Each
candidate's question.provenanceIds correspond in order to its provenance list;
provenance nodes reference the exact sourceVersionId and rightsEvidence ID as
source/evidence edges. Source lists in run metadata must equal candidate source
versions (set semantics). Parent/taxonomy/evidence payloads are immutable JSON;
operational keys forbidden by identity/1 remain forbidden.

Rights records are `{id,sourceVersionId,state,allowedUses,territories,validFrom,
validUntil,evidence}` with nonempty identifiers/evidence/territories, explicit
OWNED/LICENSED/OPEN_LICENSE/PUBLIC_DOMAIN state and GENERATE in allowedUses;
allowed uses are DISPLAY/ADAPT/GENERATE/TRAIN, unique. Bounds are RFC3339 timestamps
or null, ordered when both present. Evidence-node payload equals the immutable
record. These assertions still require human verification; no real rights grant
is created by parsing. Mutable current revocation is checked later by Bank.

Assets are `{assetVersionId,mediaType,byteLength,bytesHash,bytesBase64}`; MIME is
image/png, image/jpeg or image/webp. Decode canonical base64, verify declared length,
SHA-256 raw-byte digest and matching magic bytes. Graph asset payload equals the
member metadata. All assets must be referenced; no remote URL fetch or missing
member is permitted. No decoder/sanitization/real rights clearance is claimed.
Each asset <=2 MiB, all decoded assets <=8 MiB; entire JSON transport <=16 MiB,
identity graph <=2,000 nodes/depth64. Limits fail closed before expensive work.
Reject duplicate candidate identity, graph identity, source/evidence ID or asset ID;
conflicting references/digests, cycles, unknown fields, truncated/missing bundles,
invalid evidence and unused graph/members fail the entire import. Collect each
question's reachable graph for identity/1; shared nodes are allowed, orphan nodes
are not. Validation produces all receipts or throws, never a partial success.
Synthetic independent producer/consumer and malformed-second-item tests establish
package behavior only, not database transaction or publication correctness.
Validation evidence must name the candidate's computed contentHash; run and question
generationRunId must agree (including null). Question-version IDs must be unique
within the package. Source and rights-evidence records are shared by reference,
not repeated per candidate; every evidence/asset member must be used by the graph.
Exact top-level keys are schemaVersion, producerNamespace, batchKey, candidates,
references, assets and rightsEvidence, all required; assets may be empty only if
there are no referenced assets. AssetMember and RightsEvidenceRecord are the
technical record names above. Validation evidence inputHash binds question identity;
run.inputHash remains the independent generation-request digest.
Machine evidence may be PASS, FAIL or INCONCLUSIVE, as in v1. A FAIL prevents
IN_REVIEW and INCONCLUSIVE needs explicit reviewer evidence later; neither is
silently upgraded by draft transport. Do not invent a PASS-only import gate.
A question-kind node payload is the full immutable QuestionVersion projection
without contentHash; validate by supplying a placeholder for schema validation.
Its payload.id equals node.id. A candidate/parent edge must keep questionId equal
and versionNo strictly decrease. Every such parent payload's required identity
roots must be listed as edges. This enforces the pre-existing same-identity parent
rule; reference/1 hashes still use the original generic envelope unchanged.
