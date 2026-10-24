# API contracts

Status: PROPOSED `api/v1`, ADR-003, except owner-approved ADR-004 H1 create-conflict, H2 admission, H3 one-domain MVP policy, Start TTL, and non-retroactive ordinary admission-schedule edits. Representative typed wire contracts for the MVP; FOUNDATION implementation must encode these as runtime schemas/OpenAPI and contract tests before separately assigned frontend/backend work. FOUND-002 now supplies runtime validators and generated operation types/OpenAPI; see the scoped Stage 4B addendum below. Mutation services and deployed authentication remain later work. Domain types refer to [question schema](../specifications/QUESTION_SCHEMA.md); lifecycle/timing semantics belong to [engine](../specifications/EXAM_ENGINE_SPEC.md).

## Transport and access

Same-origin HTTPS JSON under `/api/v1`; UTF-8; UUID identifiers; RFC3339 UTC timestamps; integer seconds/revisions; decimal percentage strings. Reject unknown properties. Request bodies ≤1 MiB (question payload ≤256 KiB); bounded pagination (`limit` 1..100, opaque cursor). No client-supplied user/role/score/approval timestamps accepted. Cookie sessions require CSRF token and validated Origin on mutations. Candidate routes always scope to authenticated local user; unauthorized object IDs return 404 without existence leakage. Staff roles are server-enforced, never inferred from hidden UI controls.

All student attempt/result and staff-private responses use `Cache-Control: no-store`. Deliver safe projections with an allowlist; never serialize DB rows and remove a few keys afterward. Private content must not appear in HTML hydration, error details, logs, caches or media URLs. Asset GET verifies attempt ownership, active-section or released-result permission and current withdrawal holds; a naked object key is not authorization.

```typescript
type UUID = string;
type Instant = string;
type SectionDeficit = {sectionId:string; missingCount:number};
type AlternativeOption =
  | {kind:"SHORTER_PROFILE"; blueprintVersionId:UUID; name:string}
  | {kind:"REVIEW_MODE"; blueprintVersionId:UUID; requiresRepeatConsent:true}
  | {kind:"WAIT_FOR_PUBLICATION"};
type ErrorDetails = {field?:string; currentRevision?:number; currentAnswer?:ResponseValue;
  retryAfterSeconds?:number; existingAttemptId?:UUID; assemblyRunId?:UUID;
  blueprintVersionId?:UUID; reuseMode?:ReuseMode; sectionDeficits?:SectionDeficit[];
  alternatives?:AlternativeOption[]};
type ErrorResponse = {error:{code:string; message:string; requestId:string;
  details:ErrorDetails}};
type ConcurrentAttemptExists = {error:{code:"CONCURRENT_ATTEMPT_EXISTS";
  message:string; requestId:string; details:{existingAttemptId:UUID}}};
type AttemptState = "CREATED"|"IN_PROGRESS"|"SUBMITTED"|"EXPIRED"|
  "GRADED"|"CANCELLED"|"INVALIDATED";
type Closure = {attemptId:UUID; state:AttemptState;
  terminalReason:"EXPLICIT_SUBMIT"|"DEADLINE"|null;
  cancellationReason:"FORM_WITHDRAWN"|"RIGHTS_BLOCKED"|"ADMISSION_CLOSED"|"START_TTL_EXPIRED"|null;
  closedAt:Instant|null; gradingStatus:"PENDING"|"RUNNING"|"SUCCEEDED"|
    "FAILED_RETRYABLE"|"FAILED_FINAL"|null};
type AnswerAck = {slotId:UUID; value:ResponseValue; revision:number; savedAt:Instant};
type StudentSlot = {slotId:UUID; sectionId:string; ordinal:number;
  content:Block[]; stimulus:{id:UUID; content:Block[]}|null; interaction:Interaction};
type AttemptView = {attemptId:UUID; state:AttemptState; formId:UUID;
  domain:Section; formMode:FormMode; reuseMode:ReuseMode; reusePolicyVersion:string;
  serverNow:Instant; startBefore:Instant|null; startedAt:Instant|null; deadlineAt:Instant|null;
  activeSectionId:string|null;
  sections:{sectionId:string; section:Section; startsAt:Instant|null; endsAt:Instant|null; count:number}[];
  slots:StudentSlot[]; answers:AnswerAck[]; closure:Closure};
```

For `CREATED`, `startBefore` is the server-authoritative exclusive deadline at which the reserved attempt may first start; it is read from immutable `attempts.start_before_at`, committed with the attempt, and never derived from the client clock or current editable availability. The owner-approved MVP rule persists `min(created_at + 600 seconds, admission_until_at_creation)`; missing or invalid required TTL configuration rejects creation and never permits unlimited start time. CreationReceipt.startBefore uses this same stored value, including on same-key replay after availability edits or process restart. For every non-`CREATED` state it is `null`; `startedAt` and `deadlineAt` preserve the existing started-attempt timing semantics. MVP `sections` has exactly one entry, whose `section` equals `domain`; its `sectionId` is the opaque blueprint entry ID. Before start/after closure, `slots` is empty (results have a separate route). During an attempt only that section's slots and saved answers are returned. Null untouched answers have logical revision 0 and need no stored row. API consumers must use current state, not assume a successful HTTP response means still IN_PROGRESS.

## Student endpoints

| Method/path | Request schema | Success schema / behavior |
|---|---|---|
| GET `/catalog` | cursor?, limit? | 200 `{items:CatalogEntry[],nextCursor:string|null}`; each MVP entry identifies one MATH, READING or SCIENCE test and its own question count, duration and admission interval; fixed forms separately labeled; no slots/keys or promise of sufficient unseen inventory |
| POST `/attempts` | CreateAttempt + Idempotency-Key | 201 CreationReceipt after atomic allocation; 409 `CONCURRENT_ATTEMPT_EXISTS` with ConcurrentAttemptExists for a different creation request while this student has an active attempt in either mode; 422 `INSUFFICIENT_UNSEEN_INVENTORY` or `INSUFFICIENT_ELIGIBLE_INVENTORY` with StudentShortage; same-key success replays; no AI call/job |
| POST `/attempts/{id}/start` | `{}` + key | 200 `{attemptId:UUID,startedAt:Instant,deadlineAt:Instant}` immutable start receipt; first start sets clock, retry never resets it; GET view for current section/state |
| GET `/attempts/{id}` | none | 200 AttemptView; lazily expires/cancels as specified by engine, returns current server time; CANCELLED returns safe closure/reason, no slots |
| PUT `/attempts/{id}/answers/{slotId}` | `{expectedRevision:number,value:ResponseValue}` + key | 200 AnswerAck; zero-based expectedRevision; belongs-to-form, active-section and time checks |
| POST `/attempts/{id}/submit` | `{}` + key | 200 Closure; persists closure and job atomically; no bundled answer write |
| GET `/attempts/{id}/result` | none | 200 Result below if released; 409 RESULT_NOT_READY for ungraded/held; invalidated returns 410 CONTENT_WITHDRAWN without private fields |
| GET `/attempts` | cursor?, limit? | 200 `{items:{attemptId:UUID,formId:UUID,domain:Section,formMode:FormMode,reuseMode:ReuseMode,state:AttemptState,startedAt:Instant|null,closedAt:Instant|null,score:{correctCount:number,totalCount:number,percentage:string}|null}[],nextCursor:string|null}`; one entry per domain-test attempt, only caller's history |
| GET `/attempts/{id}/assets/{assetVersionId}` | purpose `question` or `explanation` | authorized image bytes; membership + section/release check; no arbitrary source URL proxy |

```typescript
type Result = {attemptId:UUID; scoreRunId:UUID; domain:Section; formMode:FormMode; reuseMode:ReuseMode;
  policyVersion:"practice-binary-v1";
  scoreLabel:"UNOFFICIAL_PRACTICE"; correctCount:number; totalCount:number;
  percentage:string; sections:{sectionId:string; section:Section; correctCount:number; totalCount:number}[];
  items:{slotId:UUID; earned:0|1; response:ResponseValue|null;
    question:StudentSlot; correctAnswer:AnswerKey; explanation:Block[]}[];
  releasedAt:Instant};
```

The Result type is a separate released-only DTO; never reuse it for active delivery. Its MVP `sections` array has exactly one entry matching `domain`; no endpoint calculates a combined or official TSA score from domain mini-tests. The endpoint is for the owner only and checks the entire attempt state and withdrawal holds before loading private snapshots.

## Staff endpoints

### Delegated B4.1 negative-disposition addendum — 2026-10-24

[Recorded authority](../decisions/OPEN_DECISIONS.md#web-002-b41--engineering-scope-selected-under-owner-delegation-2026-10-24)
selects the unchanged reviewed B4 proposal. Strict private StaffRejectReview and
StaffQuarantine request/receipt types describe existing POST reviews (REJECT only)
and quarantine. B3 command CSRF/idempotency headers/error unions are reused.
No root/student/released DTO changes. Receipt is historical; private read loss
after rejection leaves current state unobserved. Quarantine can return503 after
commit/drain failure; retry uses the same key/body. No APPROVE/rights/publication
UI or human qualification inferred. [Runtime evidence](../reviews/WEB_002_B4_RUNTIME_VERIFICATION.md).

### Approved B3.1 author handoff addendum — 2026-10-24

Owner whole-B3.1 approval: [exact frozen scope](../decisions/WEB_002_B3_DRAFT_HANDOFF_PROPOSAL.md),
[authority/hash](../decisions/OPEN_DECISIONS.md#web-002-b31--owner-approved-author-draft-handoff-2026-10-24).
The existing submit-review POST now has strict private request/receipt schemas,
operation/header/body artifact and explicit local AUTHOR_OWN DRAFT UI confirmation.
Existing backend AUTHOR/created_by policy is unchanged. An idempotent receipt is
separate from current workflow observation; failed/uncertain transport is never
shown as success, and retry retains the same captured body/key. B1/B2 GET types and
all student/released/public contracts remain stable. No new route/grant/migration,
review decision, rights edit, quarantine or publication UI.
[Actual implementation and review](../reviews/WEB_002_B3_RUNTIME_VERIFICATION.md).
The broader staff table below remains proposed except specifically approved scope.

### Approved B2.1 recorded evidence addendum — 2026-10-23

The owner approved exact [B2.1](../decisions/WEB_002_B2_RIGHTS_EVIDENCE_PROPOSAL.md);
[authority/hash](../decisions/OPEN_DECISIONS.md#web-002-b21--owner-approved-recorded-evidence-read-2026-10-23).
One local opt-in `GET /api/v1/question-versions/{versionId}/review-evidence` uses
strict `StaffReviewEvidenceSchema` on `@tsa/contracts/staff`, its own operation in
the separate private staff artifact. BANK_MANAGER or current independent IN_REVIEW
REVIEWER only; no AUTHOR_OWN basis, student/released/root-export changes, new grants
or writes. Current recorded text is verbatim and may contain pasted identifiers/
question/key material; additional structured secrets and arbitrary evidence JSON
are not projected. No automatic links/media retrieval. B1 remains unchanged.
[Executed checks and review status](../reviews/WEB_002_B2_RUNTIME_VERIFICATION.md).
Broader proposed staff commands/DTOs below are not approved by this addendum.

### Approved B1.2 private inspection addendum — 2026-10-23

The human owner approved the exact [B1.2 contract](../decisions/WEB_002_REVIEW_CONTEXT_V1_PROPOSED.md)
by its committed hash; [durable authority](../decisions/OPEN_DECISIONS.md#web-002-b12--owner-approved-private-inspection-2026-10-23).
Only `GET /question-versions/{versionId}/review-context` and its narrow019 Boolean
authorship predicate/private staff namespace are approved by that disposition.
Current BANK_MANAGER, trusted local AUTHOR_OWN, or independent IN_REVIEW reviewer
scope applies; sources/held/unsafe content gates may return metadata with no preview.
The response is `staff-review-context/1`, no-store, read-only and local synthetic-only.
Ordinary students and student-runtime composition gain no access. Raw evidence,
review/publication/rights/quarantine/diagnostic/media operations remain outside B1.
The broader proposed staff table below is not approved wholesale by this addendum.
[Implemented/observed verification](../reviews/WEB_002_B1_RUNTIME_VERIFICATION.md).


| Method/path | Role | Typed request → response |
|---|---|---|
| POST `/sources` | AUTHOR | `{title:string,canonicalUri:string|null,origin:"OWNED"|"EXTERNAL"}` → 201 `{sourceId:UUID}` |
| POST `/sources/{id}/versions` | AUTHOR | `{contentHash:string,evidenceUri:string,metadata:Record<string,string>}` → 201 `{sourceVersionId:UUID}`; approved import tooling only, no arbitrary server fetch |
| POST `/source-versions/{id}/rights` | BANK_MANAGER | `{status:RightsStatus,allowedUses:AllowedUse[],territory:string[],validFrom:Instant,validTo:Instant|null,evidence:string,expectedRevision:number}` → 201 `{decisionId:UUID,revision:number}` |
| GET `/questions` | AUTHOR/REVIEWER/BANK_MANAGER | filter `{section?:Section,state?:WorkflowState,cursor?:string,limit?:number}` → 200 `{items:QuestionSummary[],nextCursor:string|null}` |
| POST `/questions` | AUTHOR | QuestionDraft → 201 `{questionId:UUID,versionId:UUID,state:"DRAFT",contentHash:string}` |
| POST `/questions/{id}/versions` | AUTHOR | `{parentVersionId:UUID,draft:QuestionDraft}` → same version result; immutable new revision |
| POST `/question-versions/{id}/submit-review` | AUTHOR | `{expectedRevision:number}` → 200 `{versionId:UUID,state:"IN_REVIEW",revision:number}` after hard validators pass |
| POST `/question-versions/{id}/reviews` | REVIEWER (human, independent of the version's author/factory operator) | ReviewInput → 201 `{reviewId:UUID,state:"APPROVED"|"REJECTED",revision:number}`; APPROVE atomically transitions the exact reviewed version and eligible pointer after all bank gates |
| POST `/question-versions/{id}/quarantine` | BANK_MANAGER | `{expectedRevision:number,reason:string}` → 200 `{state:"QUARANTINED",revision:number}`; immediate access hold, durable fan-out |
| POST `/blueprints/{id}/versions` | EXAM_MANAGER | `{config:BlueprintConfig}` → 201 `{blueprintVersionId:UUID,contentHash:string}`; must pass configuration validation |
| POST `/assemblies` | EXAM_MANAGER | `{mode:"PUBLISHED_FIXED",blueprintVersionId:UUID,seed?:number,availableFrom:Instant,availableUntil:Instant}` → 201 `{assemblyRunId:UUID,formId:UUID,state:"SEALED",seed:number,manifestHash:string}`; bounded synchronous MVP assembly |
| GET `/forms/{id}` | EXAM_MANAGER | fixed forms only; personal IDs return 404 → 200 `{formId:UUID,blueprintVersionId:UUID,contentHash:string,slots:{slotId:UUID,questionVersionId:UUID,ordinal:number}[]}`; keys require separate reviewed bank access |
| GET `/assembly-runs/{id}/diagnostics` | BANK_MANAGER | fixed assembly runs only; personal IDs return 404 → 200 AssemblyDiagnostic; audited, no keys/explanations; does not authorize POST assembly |

```typescript
type RightsStatus = "OWNED"|"LICENSED"|"OPEN_LICENSE"|"PUBLIC_DOMAIN"|
  "REFERENCE_ONLY"|"UNKNOWN"|"REVOKED";
type AllowedUse = "DISPLAY"|"ADAPT"|"GENERATE"|"TRAIN";
type WorkflowState = "DRAFT"|"IN_REVIEW"|"APPROVED"|"REJECTED"|"QUARANTINED"|"RETIRED";
type QuestionDraft = {
  schemaVersion:"question/1"; language:"vi-VN"; section:Section;
  taxonomyVersionId:UUID; domainId:UUID; skillIds:UUID[]; subskillIds:UUID[];
  cognitiveLevel:"M1"|"M2"|"M3"|null;
  targetDifficulty:"EASY"|"MEDIUM"|"HARD"|null;
  content:Block[]; stimulusVersionId:UUID|null; interaction:Interaction;
  answerKey:AnswerKey; explanation:Block[]; evidenceRefs:string[];
  origin:"MANUAL"|"IMPORTED";
  provenance:{sourceVersionId:UUID,span:string|null,transformation:string}[];
};
type QuestionSummary = {questionId:UUID; versionId:UUID; section:Section;
  state:WorkflowState; interactionType:Interaction["type"]; contentHash:string};
type ReviewInput = {expectedRevision:number; contentHash:string;
  decision:"APPROVE"|"REJECT";
  rubric:{correctness:boolean; unambiguous:boolean; relevant:boolean;
    language:boolean; explanation:boolean; rights:boolean}; reason:string};
// BlueprintConfig.sections[].id is an opaque, blueprint-local section-entry ID.
// Quota.sectionId references that exact ID; neither is a Section enum value.
type Quota = {sectionId:string; min:number; max:number} & (
  {dimension:"SKILL"; value:UUID} |
  {dimension:"COGNITIVE_LEVEL"; value:"M1"|"M2"|"M3"} |
  {dimension:"DIFFICULTY"; value:"EASY"|"MEDIUM"|"HARD"});
type AssemblyDiagnostic = {assemblyRunId:UUID; manifestHash:string;
  sectionDeficits:{sectionId:string; missingCount:number}[];
  quotaCounts:{quota:Quota; eligibleCount:number}[];
  candidateVersionIds:UUID[]; exclusionReasons:{versionId:UUID; code:string}[]};
type BlueprintConfig = {schemaVersion:"blueprint/1"; name:string; taxonomyVersionId:UUID;
  profileKind:"INDEPENDENT_PRACTICE"|"PUBLIC_REFERENCE"; evidenceIds:string[];
  sections:{id:string,section:Section,count:number,durationSeconds:number}[];
  allowedTypes:Interaction["type"][];
  quotas:Quota[];
  maxPerSource:number|null; excludedQuestionIds:UUID[];
  bundlePolicy:"ALL_OR_NONE"; scoringPolicy:"practice-binary-v1";
  releasePolicy:"after-grade-v1"};
```

MVP blueprint validation requires exactly one `sections` entry and one domain enum (MATH, READING or SCIENCE) per offered practice test; published fixed forms in MVP follow the same rule. The generic `sections` array remains available for future separately approved multi-section profiles. `sections[].id` stays opaque and distinct from `sections[].section`.

Administrative asset/stimulus/bundle import is initially a validated internal import command, not an invented complete upload API. FOUND-002 must freeze additional transport schemas before parallel UI work. Generated drafts use a service-only command with run provenance, never spoof `origin` via a student/staff author route. Factory execution is an operator CLI/scheduler contract in [factory spec](../specifications/QUESTION_FACTORY_SPEC.md), not a student/web `/generation-jobs` dependency. Factory service credentials are not a principal accepted by these public HTTP routes: they can import drafts through the scoped internal command, but cannot invoke review, publication, attempt, grading or result commands. A future staff batch dashboard may wrap that operator interface after contract review; no new HTTP generation route is required for MVP.

## Errors, concurrency and compatibility

400 malformed JSON; 401 UNAUTHENTICATED; 403 FORBIDDEN/CSRF_FAILED; 404 unknown or unauthorized object; 409 REVISION_CONFLICT/IDEMPOTENCY_CONFLICT/ATTEMPT_CLOSED/SECTION_CLOSED/RESULT_NOT_READY/CONCURRENT_MODIFICATION/CONCURRENT_ATTEMPT_EXISTS; 410 CONTENT_WITHDRAWN; 413 payload too large; 422 VALIDATION_ERROR/INSUFFICIENT_UNSEEN_INVENTORY/INSUFFICIENT_ELIGIBLE_INVENTORY/CONSTRAINT_CONFLICT/RIGHTS_BLOCKED/UNSUPPORTED_TYPE; 429 RATE_LIMITED with Retry-After; 503 TEMPORARILY_UNAVAILABLE/SEARCH_EXHAUSTED/TIMEOUT. SEARCH_EXHAUSTED details must explicitly avoid claiming infeasibility. Staff may retrieve richer assembly diagnostics; student errors never reveal bank candidates or keys.

All POST commands and answer PUT require Idempotency-Key (opaque 1–128 safe ASCII chars). Scope is actor+method+normalized route including target ID. Store canonical body hash, original status/body and side effects in one transaction. Same key/body replays; different body returns 409. Concurrent duplicate keys serialize through unique constraints. Failed validation creates no success record. Retry only network/429/503 failures with bounded backoff; do not blindly retry revision conflicts. Ownership is rechecked before replay, and withdrawal guards suppress replay of any now-restricted content. Start receipts contain no question payload, so replay cannot bypass current-section delivery; consumers GET the current view after a start receipt. A new start request on an already-started attempt returns the existing receipt; a never-started cancelled/withdrawn attempt returns 410.

Guarantee replay within the retention window in [database](DATABASE_DESIGN.md); after expiry creation keys may create a new resource, so clients must not retry indefinitely; it still must satisfy current per-user history and allocation checks. Start/submit retain natural state idempotence regardless of key retention. Optimistic workflow writes use expectedRevision in addition to idempotency.

Breaking changes require an ADR, impact list, migration/compatibility plan, updated schemas and contract tests before merging consumers. Additive optional fields may remain v1 only if strict validators/clients are updated in a coordinated release. Question schema version and scoring policy version are independent of HTTP v1; old frozen artifacts must remain readable and scoreable.

## Reconciliation constraints (ADR-004 scoped approvals; remainder PROPOSED)

ADR-004 H1 is owner-approved: one CREATED/IN_PROGRESS attempt per student across PERSONALIZED_PRACTICE and PUBLISHED_FIXED, including across domains. H2 admission, MVP H3 one-section tests, the Start TTL, and non-retroactive ordinary admission-schedule edits are also owner-approved. H1 supplements the per-user allocation lock and immutable assignment history. For a new, different-key creation request, reconcile an elapsed IN_PROGRESS attempt or a CREATED attempt past its committed `startBefore` before deciding conflict; a valid active attempt returns 409 CONCURRENT_ATTEMPT_EXISTS. Its typed `existingAttemptId` identifies only the authenticated student's attempt, which the student may GET and resume when its state permits. Authenticate and scope the existing-attempt lookup by session user before returning any ID; never disclose another user's attempt. If the named `uq_one_active_attempt_per_user` index rejects a racing insert, roll back the attempted creation, recheck the caller's active attempt and return the same 409 projection. A matching committed creation key/body replays the original 201 receipt before active-conflict handling, even if its attempt is now closed; a changed body under that key remains 409 IDEMPOTENCY_CONFLICT. A new domain attempt after closure needs current admission/rights checks. Error mappings remain 409 FORM_NOT_OPEN and 410 FORM_UNAVAILABLE. Start on a never-started withdrawn/rights-blocked/security-invalidated form commits the applicable terminal restriction and returns FORM_UNAVAILABLE. Already-started receipts replay without new admission, but effective holds still block restricted access. GET reconciles lifecycle before display. H2 availability is finite/non-null and `[from,until)` for new creation, using server time. First start of an existing CREATED attempt requires `now < attempts.start_before_at`, current authorization and ownership, CREATED state, form status, and no withdrawal/rights/security restriction; equality rejects. It does not recheck the mutable current admission interval. The committed start deadline and start eligibility are independent of later ordinary availability edits, which affect only future creation requests. There is no required full-duration fit inside the admission window. The admitted domain timer may finish later; rights withdrawal and security invalidation remain enforceable.

`BlueprintConfig.sections[].id` is the opaque, unique identifier of one blueprint section entry. `BlueprintConfig.sections[].section` is the domain `Section` enum used to select questions and appears on the sealed form section. Every `Quota.sectionId` must exactly reference an entry `id`; it never references the enum. H3 requires exactly one entry in every MVP test blueprint; it does not permanently restrict the generic database to one section. Blueprint validation rejects unknown or duplicate entry IDs, duplicate `(sectionId,dimension,value)` quota tuples and invalid integer bounds. It also validates Quota discriminators and taxonomy-version/node membership as defined in assembly. UUID format alone does not prove SKILL membership. Difficulty quotas use targetDifficulty, not predicted values. Future multi-section scheduling and database constraints require a separate approval and versioned contract.

POST `/assemblies` errors expose only code, requestId and optional assemblyRunId/sectionDeficits to EXAM_MANAGER. No question IDs, exact skill pool counts, sources, private content or manifest in error details; this projection is identical even if the caller also has BANK_MANAGER. BANK_MANAGER uses the separate audited diagnostics endpoint for stored candidate IDs/quota counts, never keys/explanations. Unknown/unauthorized runs return 404. EXAM_MANAGER deliberately sees selected question-version references via successful GET `/forms/{id}` for exam management; it does not imply permission to enumerate the eligible bank. Section aggregate disclosure is a conscious MVP trust policy, not protection against statistical inference from repeated authorized requests.

Server-side save limit proposal: token bucket per authenticated attempt (refill 10 tokens/second, capacity 20), plus per authenticated user across attempts (20/second, capacity 40). Every authorized save request, including replays/invalid payload attempts after basic parsing, costs one token from both buckets; both consume atomically or neither does. Ownership/auth checks precede bucket access, which precedes the attempt write lock. 429 includes integer Retry-After seconds (ceiling of time until both have a token, minimum 1); no answer revision or success-idempotency receipt is written. Use shared PostgreSQL bucket state, not per-process memory, for consistent replicas; see DB design. Operational failure returns 503, not unlimited bypass. Defaults are testable proposals, not measured capacity promises; tune under OPS-001 after burst tests, without weakening idempotency/timing. Client queues pending edits, obeys Retry-After and reuses the unchanged key/body; it must still handle deadline rejection. Separate start/submit commands must not consume the save bucket. General edge/auth limits remain OPS-001 requirements.

FOUND-002 establishes one runtime contract source (`src/contracts`) and deterministic generated OpenAPI/client artifacts committed with it. CI regenerates into an isolated temporary directory and compares content against the committed artifacts; stale/missing artifacts fail. Producer response fixtures must validate against schemas; consumer parsing/type checks run against the same fixtures, including negative/mismatched cases. Source/schema/artifact changes and compatibility review are required together: even an optional field is not automatically safe for a strict old client. Additive changes pass only after synchronized regeneration and consumer tests; breaking changes still require the ADR process. This specifies enforcement, not a new service or an installed tool.

## Phase 02.75 creation contracts (PROPOSED, ADR-007/008)

These replace the previous formId-only default. Server derives user ID from session; rejects client userId, seed, candidate lists, history resets or arbitrary blueprint relaxations. Mode omission means PERSONALIZED_PRACTICE + NEW_ONLY, never fixed/review.

```typescript
type FormMode = "PERSONALIZED_PRACTICE"|"PUBLISHED_FIXED";
type ReuseMode = "NEW_ONLY"|"REVIEW_ALLOWED"|"FIXED_AS_PUBLISHED";
type CreateAttempt =
  | {mode?:"PERSONALIZED_PRACTICE"; blueprintVersionId:UUID; reuseMode?:"NEW_ONLY"}
  | {mode:"PERSONALIZED_PRACTICE"; blueprintVersionId:UUID;
     reuseMode:"REVIEW_ALLOWED"; acknowledgeRepeats:true}
  | {mode:"PUBLISHED_FIXED"; formId:UUID;
     reuseMode:"FIXED_AS_PUBLISHED"; acknowledgeRepeats:true};
type CreationReceipt = {attemptId:UUID; formId:UUID; state:"CREATED";
  domain:Section; formMode:FormMode; reuseMode:ReuseMode; reusePolicyVersion:"reuse/1";
  startBefore:Instant};
type CatalogEntry = {name:string; domain:Section; questionCount:number; durationSeconds:number;
  profileKind:"INDEPENDENT_PRACTICE"|"PUBLIC_REFERENCE";
  availableFrom:Instant; availableUntil:Instant} & (
    {mode:"PERSONALIZED_PRACTICE"; blueprintVersionId:UUID; reviewAllowed:boolean} |
    {mode:"PUBLISHED_FIXED"; formId:UUID; repeatsAllowed:true});
type StudentShortage = {error:{code:
  "INSUFFICIENT_UNSEEN_INVENTORY"|"INSUFFICIENT_ELIGIBLE_INVENTORY";
  message:string; requestId:string;
  details:ErrorDetails & {blueprintVersionId:UUID;
    reuseMode:"NEW_ONLY"|"REVIEW_ALLOWED";
    sectionDeficits:SectionDeficit[]; alternatives:AlternativeOption[]}}};
```

Normative `POST /attempts` examples use a new `Idempotency-Key` for each logical request. UUIDs below are illustrative opaque values.

```typescript
// 201: authenticated student, atomic personalized allocation succeeded.
{attemptId:"a1",formId:"f1",state:"CREATED",domain:"MATH",formMode:"PERSONALIZED_PRACTICE",
 reuseMode:"NEW_ONLY",reusePolicyVersion:"reuse/1",startBefore:"2026-10-16T10:12:00Z"}

// 409: a different creation request finds this student's active attempt, in either mode.
{error:{code:"CONCURRENT_ATTEMPT_EXISTS",message:"An active attempt already exists",
 requestId:"r4",details:{existingAttemptId:"a1"}}}

// 422: the request is feasible only by repeating this student's prior assignment.
{error:{code:"INSUFFICIENT_UNSEEN_INVENTORY",message:"Not enough unseen eligible questions",
 requestId:"r1",details:{
 blueprintVersionId:"b1",reuseMode:"NEW_ONLY",
 sectionDeficits:[{sectionId:"section-math-1",missingCount:2}],
 alternatives:[{kind:"REVIEW_MODE",blueprintVersionId:"b1",requiresRepeatConsent:true}]}}}

// 422: the authorized eligible bank cannot satisfy the offering, including review mode.
{error:{code:"INSUFFICIENT_ELIGIBLE_INVENTORY",message:"Not enough eligible questions",
 requestId:"r2",details:{blueprintVersionId:"b1",reuseMode:"REVIEW_ALLOWED",
 sectionDeficits:[{sectionId:"section-math-1",missingCount:1}],
 alternatives:[{kind:"SHORTER_PROFILE",blueprintVersionId:"b2",name:"Short practice"}]}}}

// 403: an authenticated student cannot call a human publication command.
{error:{code:"FORBIDDEN",message:"Insufficient role for this command",requestId:"r3",details:{}}}
```

Shortage is an explicit no-allocation response: no form, attempt, history or generation job committed. `INSUFFICIENT_UNSEEN_INVENTORY` applies only to a `NEW_ONLY` request when eligible stock cannot satisfy the blueprint after excluding the student's recorded stable identities and current canonical equivalence groups. `INSUFFICIENT_ELIGIBLE_INVENTORY` applies when the authorized eligible bank cannot satisfy the requested offering even without that per-student exclusion, including an allowed `REVIEW_ALLOWED` request. Empty `sectionDeficits` is allowed for a proved coupled-constraint shortage not attributable to one section; `SEARCH_EXHAUSTED` remains 503 when feasibility is unknown. Suggestions are authorized preexisting profiles/modes and must be explicitly selected in a new request/key; availability/feasibility rechecked. REVIEW_MODE is offered only when the offering permits it. Never expose eligible question/group IDs, histories or predicted publication date. Invalid profile/types return VALIDATION_ERROR; stale publication/history causes bounded replan then 409 CONCURRENT_MODIFICATION. Student retrying a shortage after publication may reuse the original key because no success receipt exists.

On success, pin the immutable mode/reuse policy and show it on attempt/result/history. Extend history entries with formMode/reuseMode. Personal form ownership is server-enforced; students cannot request another personal formId or turn it into a fixed form. Fixed mode creation records all assigned identities in the same user history as personal mode; repeated fixed/review content is explicitly disclosed, not NEW_ONLY.

POST personal creation performs the [assembly transaction](../specifications/EXAM_ASSEMBLY_SPEC.md). A duplicate success key never allocates again. Different keys serialize final allocation per user across all profiles and modes; while any valid active attempt remains, the later request receives CONCURRENT_ATTEMPT_EXISTS with no new form or assignment. A later NEW_ONLY attempt after closure still excludes every prior stable identity/current confirmed equivalent. Owner history checks happen even after idempotency retention expires; they do not depend on old response bodies.

Creation needs its own per-user rate budget (proposed 1 token/second, burst 2) using the existing shared bucket mechanism, with 429/Retry-After and no allocation. It is separate from save/submit buckets; cap bounded-search work/connections and avoid letting malicious creation deplete other users' capacity. No LLM/validation work is done on this path. General web/DB availability remains necessary, factory/provider availability does not.

Staff import/publication uses current bank commands. Factory service credentials invoke scoped import with `factory-package/1` receipts, not reviewer endpoints. The existing approve-review command is a human REVIEWER action and atomically publishes the exact version/eligible pointer only after exact-hash validation, rights, resolved equivalence and independent-review checks; the factory can never invoke it. Any optional batch HTTP wrapper would be operator-only and must preserve the independent executable interface.

Personalized manifests include sensitive history/exclusion sets: ordinary EXAM_MANAGER/BANK_MANAGER roles cannot read them through form/diagnostic endpoints. Student projections expose only their safe receipt/view/shortage. Administrative historical replay of a personal run requires an explicitly assigned, audited maintenance operation under approved data access policy, not a new broadly accessible endpoint. Fixed-run diagnostics keep existing role rules. Review approval additionally requires a recorded resolved reuse-equivalence decision for the exact identity; the bank rejects unresolved duplicate flags even if the submitted rubric is true.

Offering management is initially an EXAM_MANAGER-only validated internal command: `{blueprintVersionId,enabled,availableFrom,availableUntil,startTtlSeconds:600,reviewEnabled,expectedRevision}`; validate the approved immutable blueprint, finite interval and the required TTL value of exactly 600 seconds; update under publication lock and audit. Missing or invalid TTL configuration rejects activation and attempt creation; it cannot silently permit unlimited start time. The committed rule is `min(created_at + 600 seconds, applicable_admission_end_at_creation)`, stored atomically with the attempt and never recomputed on replay. No student may activate arbitrary blueprints. A future staff HTTP adapter must freeze its transport before independent implementation.

## Stage 4B scoped consumer and egress contract — routes/1

Owner D5/D6 approval (2026-10-19) preserves all nine student routes above and
all approved timing/reuse rules. Add strict runtime schemas for CatalogEntry/page,
CreateAttempt, empty Start/Submit body, StartReceipt, UUID path params, bounded
pagination and asset purpose; reuse existing DTOs for all other bodies. Preserve
omitted PERSONALIZED_PRACTICE/NEW_ONLY defaults; REVIEW_ALLOWED and fixed requests
require acknowledgeRepeats:true. Idempotency-Key remains required for mutations.
Generate committed TypeScript operation maps (method/path/params/query/body/success
and error types) directly from the runtime registry, not handwritten client copies.
The original root package remains backward compatible; new subpaths are student,
released-review and internal. Student exports are an explicit public allowlist;
private/Factory/identity/assembly schemas and AnswerKey are not student exports.
Released-review adds only authorized result/item/key types to its own entry.

Student OpenAPI contains the eight non-result operations and public components.
Released-review OpenAPI contains GET /attempts/{id}/result and its released-only
components. Asset response is binary image bytes, never a JSON object key/proxy.
Generate and non-mutatingly check both OpenAPI artifacts and the two operation-map
artifacts together; a missing/changed artifact fails. Existing question/1 and
factory-package/1 readers remain valid. Any artifact evolution is coordinated
with strict consumer tests; historical fixture behavior is retained.

A framework-independent actual HTTP Request->Response handler covers existing
GET attempt-view and released-result paths with injected server auth/read models;
this is a reusable boundary adapter, not a deployed application/database service.
Never accept user identity, roles, state, release or holds from request data.
Authenticate, read access metadata, return indistinguishable 404 for missing or
non-owner attempts, and reject withdrawn/INVALIDATED content with 410 before
loading private snapshots. Result loading requires GRADED and releaseAuthorized;
otherwise return 409 RESULT_NOT_READY. Recheck access after loading, including a
server revision token covering state/release/withdrawal; changed revision fails
closed with 503 and no payload. Backend transaction/lock enforcement remains
later implementation, not proven by this adapter's synthetic tests.

Project only the explicit AttemptView/StudentSlot/AnswerAck/Closure or authorized
review fields, including nested objects, then validate before serializing. DTO
attemptId must equal the requested ID. Reject malformed nested data rather than
serialize it. Every response is application/json, no-store, nosniff; no raw error,
provider/provenance data, HTML/hydration or private inactive slots. Use existing
error types; new strict route-only transport error codes MALFORMED_JSON (400),
NOT_FOUND (404), PAYLOAD_TOO_LARGE (413) describe already documented statuses,
without changing the existing root ErrorCode enum. No unauthorized result loader
call or response/log side channel is allowed. Injected failures become a generic
503 response; no exception text is returned. This adapter does not implement
mutation state machines, sessions/CSRF, asset serving or production authorization.

Acceptance uses real Request/Response egress plus loopback HTTP integration with
synthetic loaders: foreign/unknown, held/ungraded/withdrawn and racing revision
requests expose no private data and do not load private content unnecessarily;
authorized released review includes exactly the permitted fields. Enforce student
consumer import restrictions in CI and compile negative imports against student
subpath; keeping internal root compatibility must not become a student escape.

Additional route-only documented error mappings are FORM_NOT_OPEN (409) and
FORM_UNAVAILABLE (410); existing root ErrorCode remains unchanged for compatibility.
The idempotency key alphabet is printable non-space ASCII U+0021–U+007E, 1..128
characters; values remain opaque and are never evaluated or used as identity.
Attempt-view egress must also match DTO state to the server access-guard state;
a stale active DTO cannot expose slots after the server reports closure. The
final guard/revision must still match before any response body is emitted.

Registry headers describe selected normalized contractual headers, not every
standard HTTP header/cookie. Cookie authentication and mutation CSRF/Origin rules
above remain binding; this batch freezes no new session-cookie/token transport.
New route query cursors are opaque nonempty strings bounded to 1,024 characters;
wire pagination limits are decimal strings 1..100, with parsed internal numbers.
Generated operation requests infer schema input types, response bodies infer output
types, and response-header maps include the required positive-seconds Retry-After
on 429. Existing safe optional error details and public component names remain
compatible. Generated type artifacts pin their corresponding OpenAPI digest.

The server access record is `{attemptId,ownerId,state,withdrawn,releaseAuthorized,
revision}`; revision is an opaque nonempty token covering access changes. Capture
an immutable primitive snapshot before awaiting loaders; do not let a loader mutate
the snapshot used for the final comparison. Malformed path/query input returns the
documented 422 validation envelope. Attempt answers may reference only delivered
slot option/statement IDs; unknown nested response keys/IDs fail closed. Preserve
existing partial-answer behavior and do not invent a new minimum-selection rule.
