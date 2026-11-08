# Proposed private manual Reading DRAFT transport

Status: **PROPOSED / NOT APPROVED / NOT IMPLEMENTED**,2026-11-04.
RECOVERY-019; root accountable designer. Existing internal authoring permission
does not approve this new transport/parser. This document makes the earlier
[manual staging proposal](INT_003_MANUAL_LLM_STAGING.md) concrete for owner review.

## Decision requested and bounded scope

Approve a new, disabled-by-default, local-only `factory-package/3` profile
`manual-reading-draft/1`, a private parser/exporter/import service and compatible
Bank import-attribution/review readers. Preserve all v1/v2 contracts and behavior.
The profile transports one complete ten-question Reading bundle from manual chat,
unknown usage, exact private evidence and internal experiment permission. It never
confers current source rights, human review, eligibility or publication authority.

Choose the storage-compatible source representation below: existing Bank
`sources.origin=EXTERNAL` means imported across the Factory→Bank boundary, with
actual AI authoring represented separately in immutable evidence. It does not
mean a third-party article, legal rights category or verified human author. This
interpretation itself needs owner disposition. If rejected, stop this proposal's
implementation and design the coordinated first-class source-origin migration;
do not silently substitute OWNED or change the SQL enum/constraint.

Initial execution remains NODE_ENV development/test plus LOCAL_SYNTHETIC_ONLY,
an explicit feature opt-in and a trusted internal capability. No new public HTTP
route, staff upload/editor, provider/scheduler/budget service, media support,
production activation or paid API. Existing human publication gates remain.

## Verified existing constraints

| Existing fact | Consequence |
| --- | --- |
| [FactoryRunMetadataSchema](../../packages/contracts/src/index.ts) requires numeric input/output usage and nonempty modelRevision. | Do not cast manual null usage into v2 or invent tokens/revision. |
| [RightsEvidenceRecordSchema](../../packages/contracts/src/factory-package-v2.ts) accepts eligible legal categories; source payload is strict `{title,content}`. | Add distinct internal-permission/manual evidence records in v3; do not widen v2 source/rights objects. |
| [Current importer](../../src/modules/bank/factory-import.mjs) uses origin EXTERNAL/created_by NULL for imported sources; exact registered taxonomy/author required for questions. | Preserve the actual declared source-authoring evidence and registered local attribution separately. No fake registration. |
| [Migration005](../../db/migrations/005_factory_package_v2_import.sql) stores private JSONB reference nodes, manifests and run metadata, permits null provenance rights decision and nullable external run ID. | This profile can reuse storage without new SQL if the source classification choice is approved. It creates no source_rights/rights_decisions rows. |
| Import-attribution/review/replay code recognizes `factory/2/` explicitly. | A real v3 namespace needs reader changes and cross-version tests, not just a new parser label. |

These are VERIFIED source-inspection facts, not tests of the proposed profile.
Actual manual revisions remain [private DRAFTs](../reviews/RECOVERY_MANUAL_DRAFT_REVISION_2026_11_04.md).

## Proposed strict wire profile

All records reject unknown fields and nonplain/accessor/proxy/cyclic in-memory
inputs. Raw JSON is bounded fatal-UTF8 with duplicate object keys rejected. Use
existing canonicalization/reference hashing and question/1 identities unchanged.
No normalization of source/output text before byte hashes or UTF-16 span checks.

| Top-level field | Proposed exact meaning |
| --- | --- |
| `schemaVersion`, `profile` | Literals `factory-package/3`, `manual-reading-draft/1`. |
| `producerNamespace`, `batchKey` | Nonblank bounded strings; a distinct owner-activated manual producer identity and one immutable output revision/batch key. Revisions use new keys with private lineage evidence. |
| `manualRun` | Exactly one ManualRun/1 record below; no provider-result variant in this first profile. |
| `sourcePermissions` | Exactly one InternalPermission/1 record, also represented by its matching evidence node. No `rightsEvidence` field/legal-rights record in this profile. |
| `sourceAuthoring` | Exactly one source-bound AuthoringEvidence/1 record, also represented by its matching evidence node. |
| `candidates` | Exactly10 ManualCandidate/3 records, ordinals0–9, one itemKey/whole stimulus bundle, unique stable/version IDs/fingerprints. |
| `references` | Complete bounded existing reference/1 graph using existing reference kinds. Exactly one source/text stimulus, exact registered taxonomy and evidence/provenance/question closure. |
| `assets` | Literal empty array; text-only content/interaction/explanation, no image/math/table conversion. |

ManualRun/1 exact fields: `schemaVersion=manual-llm-run/1`, `manualRunId` (UUID),
`kind=MANUAL_LLM_OUTPUT`, `declaredOperatorId` (nonblank staging identity),
`declaredModel` (nonblank actual declaration, may explicitly say unknown),
`exactModelRevision` (nonblank or null), `declaredAt` (instant), `interface`
(nonblank), `timestampMeaning=LOCAL_DECLARATION_ASSEMBLY`, `promptTemplateVersion`,
`sourceVersionIds` (one external source ID), `inputHash`, `promptHash`,
`responseHash`, `artifactRefs` (below), `usage=null`,
`usageVerification=UNVERIFIED`, `providerCalled=false`, `providerRunRef=null`,
`generationRunId=null`. `manualRunId` identifies private evidence; it is not a
generation_runs/job ID or proof of an actual provider call. No cost/token0 fields.

`artifactRefs` exact fields: required `input`, `prompt`, `response`, `declaration`,
`sourceDeclaration`, optional paired `criticResponse`/`criticDeclaration`, and
optional `criticNotes` requiring that pair. Each is an evidence-node
ID plus raw bytesHash. The summary stored per question is bounded16KiB; raw bytes
live in the graph/manifest, not copied into every run_metadata row. The manual
declaration is still an operator assertion, not a provider signature or usage proof.

Artifact evidence payload exact fields: `schemaVersion=manual-artifact/1`,
`artifactKind` (INPUT/PROMPT/RESPONSE/DECLARATION/SOURCE_DECLARATION/
CRITIC_RESPONSE/CRITIC_DECLARATION/CRITIC_NOTES),
`byteLength`, `bytesHash` (SHA-256 of decoded exact bytes), `bytesBase64` (canonical
base64). Bound each decoded artifact to128KiB and the whole canonical package to
1MiB; at most100reference nodes and graph depth32. Fail before writes on overflow;
never truncate evidence or fall back to a smaller provider-shaped claim. These
profile limits are proposed engineering bounds, not TSA passage requirements.

InternalPermission/1 exact fields: `schemaVersion=internal-source-permission/1`,
`id`, `sourceVersionId`, `sourceTextHash`,
`state=INTERNAL_EXPERIMENT_AUTHORIZED`, `allowedUses=[DISPLAY,GENERATE]`,
`scope=LOCAL_PRIVATE_DRAFT_REVIEW`, `territories` (nonempty unique codes),
`validFrom` (instant), `validUntil` (instant or null), `authorizationEvidenceRef`,
`copyrightVerification=UNVERIFIED`, `publicationPermission=false`.
DISPLAY here permits only private operator review, never student delivery. Validate
its declared scope/time and the trusted activation snapshot below; supplied text
alone does not authorize import. Preserve expired/missing claims only in staging,
not as successful imports. Effective activation revocation blocks subsequent
import/replay admission, without erasing evidence or authorizing publication.

AuthoringEvidence/1 exact fields: `schemaVersion=manual-source-authoring/1`, `id`,
`sourceVersionId`, `sourceTextHash`, `kind=AI_AUTHORED_EXPERIMENTAL`,
`declarationEvidenceRef`, `exactModelRevision` (nonblank or null),
`scientificVerification=UNVERIFIED`, `copyrightVerification=UNVERIFIED`.
Source payload stays exactly `{title,content}` with one text block. sourceTextHash
is SHA-256 of that block's original UTF-8 bytes; it must equal the bound raw input's
source text. Authoring/permission evidence nodes depend on the source node;
source has no reverse edge, so no reference cycle is introduced.

ManualCandidate/3 exact fields: `itemKey`, `candidateOrdinal`, `contentHash`,
`question` (unchanged QuestionVersionSchema), `provenance` (below),
`manualRunId` (must match top-level run), `validations` (existing machine evidence).
Question origin remains GENERATED; manual chat is the generation mechanism, not
human MANUAL authorship. generationRunId stays null. Candidate/question contentHash
must match a fresh existing identity calculation. Difficulty remains uncalibrated;
4:3:3 cognition is intended metadata only. No workflow/approval field accepted.

Each provenance record has exact fields `sourceVersionId`, `origin=GENERATED`,
`sourceSpan=null` (per-question spans are retained in question evidence),
`transformation`, `creator` (registered author UUID),
`sourcePermissionId` (matching internal record). This v3-only record does not
pretend an internal permission is a v2 RightsEvidenceRecord. The stored
rights_decision_at_authoring remains NULL; its private provenance evidence retains
the actual permission/authoring/run refs. Machine evidence can state schema,
content safety and package-exact-duplicate results. AI critic judgments retain
AI provenance/limits and never become HUMAN/RIGHTS/ANSWER approval evidence.

## Explicit identity and taxonomy mapping before export

No importer guesses staging identities from a code, title, email or similar text.
A local authorized preparation command takes an explicit mapping declaration:
declaredOperatorId→authenticated registered author; staging taxonomy/version/node
IDs→one exact registered taxonomy/version/node closure; raw draft IDs/ordinals→new
canonical stable/version IDs. It verifies actor capability and registered identity,
node kinds/parent/section/skill matches, exact taxonomy definition/hash and absence
of incompatible existing mappings. Ambiguous/missing/stale mappings fail closed.

The mapping declaration has exact fields `schemaVersion=manual-import-mapping/1`,
`profile`, `producerNamespace`, `batchKey`, `declaredOperatorId`,
`registeredAuthorId`, `sourceVersionId`, `taxonomy`, `candidates`. `taxonomy`
has exact fields `stagingVersionId`, `registeredVersionId`, `registeredDefinitionHash`,
`nodes`. Each node maps `stagingCode`, `stagingKind`, `registeredNodeId`,
`registeredCode`, `registeredKind`, `parentCode`, `section=READING`. Cover the
referenced domain/skill exactly, preserve codes/kinds/parent relationships and
verify the full target definition independently. No subskill mappings in this
profile. Each of10candidate mappings has exact fields `rawQuestionId`,
`candidateOrdinal`, `questionId`, `questionVersionId`, `stimulusVersionId`.
mappingHash is the canonical digest of this complete declaration;
taxonomyMappingHash is the canonical digest of its taxonomy object.

Preparation is not a rewrite of original raw output. It preserves original
declarations/source/raw bytes as evidence, constructs a new canonical question/1
projection with mapped identities, and recomputes reference/question hashes and
fingerprints. Each question has source-bound exact UTF-16 evidence with matching
substring and rationale. A mapping evidence node records both sides and raw draft
ordinal/hash; candidates bind that node. Import independently verifies the mapping
and registered values against the authenticated principal, not merely exporter
claims. It must not assign every external author to whoever calls import.

The first implementation is restricted to one approved local mapping declaration
and the existing ten internal drafts. It does not register taxonomy/users, create
fake participants or turn AI critique into independent human Bank review. All
registered author/taxonomy checks run again under the import transaction guard.
Session/candidate-author permission uses the existing trusted Bank identity
boundary freshly for each admission, not a fabricated direct user_roles grant or
a claim that an unrelated lock serializes identity-service revocation.
The separate immutable activation scope is not a new database registry.

## Trusted activation and effective revocation

Only one designated local importer process may admit this profile per database.
Before admission it obtains an exclusive session advisory lock for the fixed
manual-reading-draft/1 coordinator key on a dedicated Bank connection; retain
that connection/lock through stop/drain. Every serialized v3 import/replay
transaction runs on this same connection, not a second pooled connection; factor
shared persistence to accept its transaction client. Release the session lock
explicitly before returning the connection. Failure to acquire it denies startup.
Connection loss aborts its active transaction, permanently stops that coordinator's
admissions and cannot transparently reconnect/resume. If commit acknowledgement
was uncertain, reconcile immutable receipts under a newly authorized coordinator
before claiming drain complete; do not infer rollback or blindly repeat writes.
Reacquisition requires all startup lock/activation/identity checks again.
This uses existing PostgreSQL
advisory locking, not new schema/functions/grants. It is not multiworker support.

Activation consumes an immutable owner-approved private snapshot with exact
fields: `schemaVersion=manual-import-activation/1`, `activationId`, `profile`,
`ownerDecisionRef`, `producerNamespace`, `registeredAuthorId`, `declaredOperatorId`,
`sourceVersionId`, `sourceTextHash`, `permissionHash`, `sourceAuthoringHash`,
`responseHash`, `promptHash`, `mappingHash`, `taxonomyVersionId`,
`taxonomyDefinitionHash`, `validFrom`, `validUntil` (finite instant).
The owner approval record must bind this snapshot hash and scope. In tests it is
explicit synthetic authorization, never a fabricated human signature.

The snapshot comes from a fixed trusted operator configuration location outside
package input/public assets, private permissions/no symlinks, not a payload-supplied
path or self-declared source record. Missing approval/hash/scope/interval, mismatched
producer/actor/source/permission/run/mapping/taxonomy or a previously retired active
snapshot denies admission. There is no implicit producer/user/authorization registry
creation. Raw records are untrusted claims checked against that activation.

Intervals are admission-only for private DRAFT intake: after obtaining the
admission mutex and Bank transaction guard, check database clock_timestamp against
activation and internal-permission intervals before any writes. Expiry rejects
queued/new admissions but does not retroactively cancel an admitted transaction.
This is not a student legal-rights delivery interval or an exact COMMIT deadline.

One process admission mutex covers each entire import or replay transaction.
There is no hot reload. Replace/revoke through a trusted local control operation:
stop accepting admissions, reject queued requests, drain every admitted transaction
to commit/rollback, atomically retire the active private configuration, then
acknowledge the stop. That acknowledgement is the effective revocation point;
already admitted work can complete before it, never after it. Reconfiguration
starts only after drain with a newly owner-approved snapshot. A file change alone
is not a serialized database revocation. Unexpected configuration changes stop
admission and require the same drain/reconciliation procedure; no automatic reload.

Crash/startup is disabled by default and never restores an old in-memory permit.
Startup must consult the current trusted active/retired configuration, not accept
a historical snapshot chosen by the caller. Preserve snapshot/retirement evidence
in private operator records. A concurrent cross-process or mutable shared registry
would need a separately reviewed architecture; do not claim this design provides it.
This revokes importer admission, not existing staff access to immutable evidence;
ordinary Bank authorization/quarantine/rights and retention policies remain separate.

## Exact raw projection and acyclic identity closure

Decode artifact bytes and verify byte length/hash/canonical base64 first. INPUT
uses the strict existing manual input representation (one source); RESPONSE uses
the strict existing ten-draft output representation. DECLARATION uses the existing
manual declaration shape. SOURCE_DECLARATION preserves the original AI-source
provenance, distinct from the new question-authoring declaration. PROMPT is the
bounded saved prompt JSON with exact keys `version`, `instructions`, `schemaVersion`,
`skillId`, `sourceVersionId`, `sourceData`, `taxonomyVersionId`, `outputJsonSchema`,
`evidenceSpans`, `extraInstructions` and optional `revisionBrief`. Treat its text
as data, never execution instructions. Pin the accepted prompt-template version;
unknown raw format/template requires a new profile review, not silent conversion.

inputHash is existing canonical digest of parsed INPUT; promptHash is the existing
canonical digest of parsed PROMPT; responseHash is SHA-256 of exact RESPONSE bytes.
Generator declaration must match declaredOperatorId/promptHash/declaredAt/interface/
model/nullusage; source text/ID/skill/taxonomy must match INPUT, PROMPT and source
node exactly. Critic pairs use the bound existing blinded prompt reconstruction,
exact draft IDs and original source; retain disagreement/cautions as AI evidence.

Select one raw draft by exact ordinal plus raw ID, rejecting duplicates. Canonical
content, interaction/options/order, private answer key, explanation, cognitive label,
source span/rationale and distractor reasons must equal that selected raw draft
under existing canonical object comparison, without text/Unicode/answer edits.
Allowed construction is limited to registered operator/taxonomy/domain/skill
mapping; assigned canonical stable/version/stimulus/provenance/evidence IDs;
question/1 wrapper; language vi-VN/section READING; origin GENERATED; versionNo1/
parentVersionId null; createdAt equal declaredAt; null generationRunId and
uncalibrated difficulty `{target:null,predicted:null,empiricalStudyId:null}`.
Any content revision needs a new raw response/declaration/request/batch; a mapper
cannot change the answer while retaining evidence of a different raw output.

Pin this graph recipe, where arrows are reference-node edges:

| Node | Exact dependency role |
| --- | --- |
| Source S / registered taxonomy T / artifact leaves | S has the one original text block; T is the exact registered definition; raw artifact nodes have no graph edges. |
| Permission P / authoring A | P→S,INPUT. A→S,SOURCE_DECLARATION. Top-level records equal these typed payloads. |
| Manual run M | Payload equals bounded ManualRun/1. M→S,P,A and every artifact named in artifactRefs. It never references a candidate/hash. |
| Shared source provenance V | One typed manual-candidate-provenance/1 payload equals every candidate provenance record plus matching manualRunId. sourceSpan=null, transformation/creator/permission identical across all10. V→S,P,A,M. |
| Mapping X | Typed manual-candidate-map/1 payload below. X→M,T. |
| Question evidence E | Typed manual-question-evidence/1 payload: sourceVersionId, rawQuestionId, exact raw evidence/distractorReasons/cognitiveLevel, calibration=NOT_PERFORMED. E→S,RESPONSE artifact. |
| Stimulus Z | Existing exact payload `{content,provenanceIds}` with original source text and provenanceIds=[V.id]. Z→V, all10 members bind Z and whole-bundle rules. No direct Z→S edge or extra payload key. |
| Question Q | Derived existing question projection with private.evidenceRefs exactly X,E; provenanceIds exactly V; roots T,Z,V,X,E. No assets/parent. |

Mapping X exact payload fields: `schemaVersion=manual-candidate-map/1`,
`rawQuestionId`, `candidateOrdinal`, `responseArtifactId`, `responseHash`,
`declaredOperatorId`, `registeredAuthorId`, `stagingTaxonomyVersionId`,
`registeredTaxonomyVersionId`, `taxonomyMappingHash`, `questionId`,
`questionVersionId`, `versionNo=1`, `parentVersionId=null`, `stimulusVersionId`,
`targetDomainId`, `targetSkillIds` (one registered skill), `createdAt`.
Canonical subskillIds is empty. Every mapping payload must match the activation's
mapping declaration/hash and constructed question values.

All required nodes must be reachable from every relevant Q through these roots;
reject missing/duplicate/orphan artifacts and mismatched wrapper edges, not just
unresolved top-level IDs. Verify leaves/dependencies before final question hashes.
The existing stimulus/content guard and importer remain authoritative: stimulus
edges must be its provenance/asset roots, and stimulus_sources is derived through
V.payload.sourceVersionId. Source S is reached through V, not by widening that
guard for a direct source edge. The current candidate Q nodes are derived/materialized by the importer, not
supplied again in references; question-kind wire nodes are forbidden in this
first-versionNo1/no-parent profile. Cross-candidate X/E nodes belong to their
own Q; shared S/T/Z/V/M/artifacts are reachable from all10. Reject nodes outside
the union of the10defined closures rather than requiring each private span to
be reachable from every other question.
No reachable mapping/run/provenance node contains Q's final contentHash or a
back-edge to Q; such a value would make identity hashing circular. Machine
validation records remain outside Q's dependency graph and may bind its completed
hash; final manifest hash is computed last. A self-consistent graph with raw
answer A and unrelated canonical answer B must fail projection equality.

## Persistence, namespace and replay

Reuse the existing Bank-owned internal DRAFT transaction and private manifest/
receipt/reference/run tables only after strict v3 validation. Never manufacture a
v2 object with token0, OWNED rights or invented modelRevision to reuse its parser.
Factor shared persistence after format-specific validation; keep v2 code paths and
fixtures intact. A new internal `importManualFactoryPackageV3` capability is
disabled by default and requires the authenticated existing author permission.
Factory service credentials gain no Bank/student/publication grants.

Use `factory/3/` reference namespaces with a domain-separated digest of profile,
producerNamespace and batchKey. Require a distinct owner-activated manual producer
namespace; reject use of a producer namespace already bound to a different
transport/profile before writes. This matters because existing external mappings
are keyed by producer/kind/externalID, not transport version. Do not rewrite old
factory/2 rows or assume a prefix alone separates external mapping keys.

An imported source retains Bank origin EXTERNAL/created_by NULL as classified
above; source_versions metadata retains its original reference pointer. Actual
AI authoring/declared identities remain in the immutable source-bound evidence.
When an identical source is reused in another batch, preserve its first pointer;
verify its original manifest attribution and mapping hash rather than rewriting
it to the new batch namespace. Existing conflicts on changed mapped payloads
remain conflicts. New format-aware attribution must reconstruct original operator
and external stimulus IDs for ancestors and exact reviewed revisions.

Store the exact parsed v3 manifest and canonical manifest hash, each unchanged
question/1 projection/secrets, all reference nodes and mapping evidence, and the
bounded ManualRun summary in factory_import_runs.run_metadata. All external
generation-run IDs and question generationRunId remain NULL. An internal permission
produces zero source_rights/rights_decisions, eligible pointers, human reviews,
approval rows or grading jobs. Existing selection predicates must still reject
the imported stock even after unrelated internal metadata is inspected.

One producer/batch imports the complete10-member unit atomically. Identical
validated manifest replays exact existing receipts/IDs after authorization and
stored-integrity checks; any changed raw artifact/declaration/permission/mapping/
candidate under that key conflicts. A late member failure rolls back every
application row including manifests/mappings/evidence/audit. Canonical raw bytes
and text hashes remain distinguishable from canonical manifest/question hashes.

## Consumer changes and migration decision

Required code inventory includes a new internal parser/export entry, existing
factory-import dispatch/shared persistence/replay verification,
[import-attribution](../../src/modules/bank/import-attribution.mjs),
[review snapshots](../../src/modules/bank/review-snapshot.mjs), private evidence/
diagnostic readers and import-consumer boundary tests. Audit all `factory/2/` and
FactoryRunMetadata assumptions before implementation. V3 metadata must be rendered
as manual/unknown, not a provider run with missing values converted to0. Any typed
staff DTO requiring a new field needs explicit scoped contract review before
adding it; existing generic private evidence can carry the versioned record.
Student APIs/import boundaries and released-review schemas stay unchanged.

No SQL migration is proposed for the storage-compatible choice: current limits
are reference payload8MiB, manifest16MiB, run metadata256KiB; this profile is much
smaller. No new grants/tables/enum states. Verify existing constraints/ACLs before
activation and exact stored/reconstructed v1/v2 behavior afterward. If code review
finds storage/consumer constraints incompatible with this choice, stop and amend
the proposal instead of silently altering SQL or relying on unsupported JSON.

The alternative first-class AI_AUTHORED_EXPERIMENTAL source-origin value requires
separate approval of migration004 constraint expansion, source-service validation,
staff SourceSchema/public projections, replay and review-snapshot consumers,
fresh/populated migration failure/rollback tests. It is not included by implication.

## Required acceptance before any local activation

1. New parser accepts bounded truthful manual fixtures and rejects missing/null
   misuse, fabricated0usage/OWNED conversions, unknown/duplicate keys, wrong raw
   hashes/base64/UTF8, overflow, incomplete closure/cycle/bundle, unsafe content,
   source/mapping/declaration/prompt/output drift and unsupported assets/types.
   Include raw-versus-canonical answer/content mismatch, orphan top-level run
   evidence, incorrect graph edges and circular candidate-hash evidence negatives.
2. Real PostgreSQL imports one complete10-member DRAFT unit, reconstructs every
   source/permission/authoring/run/mapping record, replays exact receipts, conflicts
   changed same-key metadata and rolls back a late member fault across all tables.
   Demonstrate source reuse/original attribution and ancestor review under v3.
3. Unknown author/taxonomy/mapping, foreign operator, missing internal capability,
   expired/retired activation and Factory/student credentials are denied with
   no writes. Imported rights/review/eligibility counts stay0 and selection false.
   Barrier-test admission-stop/drain/effective-revocation orders, queued-request
   rejection, second-importer lock denial, restart disabled and stale config refusal.
   Terminate the dedicated coordinator backend during an admitted transaction:
   lock loss must also abort that same transaction, stop old admissions and require
   explicit authorized receipt reconciliation/reacquisition after an uncertain ACK.
4. V1/v2 parser/service/receipt/hash/namespace/projection tests remain unchanged;
   test mixed-format namespaces, attempted producer collisions and missing v3
   reader support. No old manual artifacts/receipts/questions/forms are rewritten.
5. Public static/HTTP/bundle privacy checks cannot expose raw artifacts, private
   answers/declarations or internal authorization. Manual HTML remains private.
   No live/paid provider, fabricated human publication or data upload in tests.
6. Pin exact source/contract revisions, local command/results and actual independent
   engineering review. Human scientific/content/rights/publication review is a
   separate future gate and cannot be supplied by these fixture tests.

Rollback/disable: turn off the v3 capability/exporter and keep immutable imported
evidence/receipts/drafts. Old readers must reject unsupported v3 explicitly;
redeploying a reader without v3 support is not safe evidence access and is not a
reason to relabel stored rows as v2. No down migration, content deletion, token
fabrication, rights promotion or automatic publication.

## Owner disposition record

Approval identity/date/scope/evidence: **ABSENT**. No implementation assigned.
Requested disposition must explicitly cover the manual-only wire/evidence shapes,
Bank EXTERNAL import classification, format-aware private readers, registered
mapping scope, immutable approved activation snapshot, single-importer stop/drain
and effective revocation semantics, and zero-cost local DRAFT-only activation. It does not approve
media/planner proposals, production/live providers or human content acceptance.
Recommended implementation: existing Codex subscription/current available model,
high reasoning if selectable for graph/mapping/replay work; separate independent
read-only reviewer for consumer/privacy boundaries. No paid LLM API.
