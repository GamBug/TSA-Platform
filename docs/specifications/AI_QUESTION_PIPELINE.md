# Dataset and AI question pipeline

Status: PROPOSED, early Track A alongside the website Track B. Manual acquisition/import/review seeds the web MVP; factory research/prototype does not wait for website completion. ADR-005/008 govern providers and scheduled production; AI is never required for an attempt to be created, started or graded. [Factory spec](QUESTION_FACTORY_SPEC.md) owns execution, scheduling, inventory planning, budgets and import recovery. [Question schema](QUESTION_SCHEMA.md) owns canonical content and workflow states.

## Lifecycle and gates

| Stage | Durable artifact / gate | Failure and recovery |
|---|---|---|
| Acquire source | Source version, hash, creator/owner, rights decision for intended uses | UNKNOWN/REFERENCE_ONLY/expired rights → RIGHTS_BLOCKED; obtain documented grant or select different source; no protected upload |
| Import | Import batch ID, original locator/hash, extractor version | Parsing failure → FAILED_INPUT; repair extractor and create a new run; never silently truncate |
| Normalize | `question/1` or stimulus draft, language, units, math, asset references | Invalid structure → NEEDS_REVISION; retain original reference and transformation trail |
| Deduplicate | Exact fingerprint, candidate near-duplicate pairs and evidence | Exact conflicts block approval; heuristic flags go to reviewer; never auto-delete |
| Classify | Taxonomy version, section, skills, cognitive claim, estimated difficulty | Unknown/unmapped → NEEDS_REVIEW; no fabricated tags to fill quotas |
| Generate/augment (optional) | Generation specification, template/prompt version, provider response, new DRAFT version | Refusal/timeout/budget/schema errors → typed failure; original draft remains intact |
| Independently verify answer | Blind solve result, deterministic evidence where possible, critic provenance | Disagreement/unsupported answer → NEEDS_REVISION; no majority vote as proof |
| Automated checks | Schema, key uniqueness, units, answer/explanation consistency, rights, dangerous content, similarity | FAIL blocks IN_REVIEW; INCONCLUSIVE requires explicit human evidence |
| Human review | Exact version/hash, independent reviewer, rubric and reason | Reject immutable version or revise into a new draft; AI cannot approve |
| Approved bank | APPROVED workflow + eligibility pointer + valid rights | New revocation/quarantine immediately blocks delivery/selection |
| Assembly | Frozen eligible manifest and sealed form | See [assembly](EXAM_ASSEMBLY_SPEC.md); no pipeline bypass |

Imported/manual questions skip generation but not rights, validation or independent answer review. Original Vietnamese content is the initial dataset strategy. No existing third-party dataset is approved for production. Source rights must cover adaptation/generation/provider transfer separately from display. Record restrictions and expiry; retain attribution on display where required without disclosing private evidence.

## Provider-neutral contract

```typescript
type GenerationRequest = {
  specificationVersion:"generation/1"; requestId:string;
  sourceVersionIds:string[]; taxonomyVersionId:string;
  section:"MATH"|"READING"|"SCIENCE"; skillIds:string[];
  interactionType:"SINGLE_CHOICE"|"MULTIPLE_CHOICE"|"TRUE_FALSE_GROUP";
  cognitiveLevel:"M1"|"M2"|"M3"|null; language:"vi-VN";
  count:number; promptTemplateVersion:string; outputSchemaVersion:"question/1";
  seed:number|null; budget:{maxInputTokens:number,maxOutputTokens:number,maxCostMicros:number};
};
type ProviderResult = {
  candidates:unknown[]; providerRunRef:string|null; modelRevision:string;
  usage:{inputTokens:number,outputTokens:number,costMicros:number|null};
  finishReason:"COMPLETE"|"TRUNCATED"|"REFUSED";
};
type ProviderError = {code:"RATE_LIMIT"|"TIMEOUT"|"REFUSAL"|"UNAVAILABLE"|
  "INVALID_OUTPUT"|"BUDGET_EXCEEDED"; retryable:boolean};
// Adapter operations: generate(request, approvedSourcePayload, cancellationSignal)
// -> ProviderResult | ProviderError; capabilities() -> supported schemas/limits.
```

Unknown candidate data is validated and mapped into domain drafts; provider SDK types and vendor response formats never become database question schema. Provider identifiers are opaque metadata, not domain enums. Hosted, self-hosted and deterministic-template adapters obey the same contract. Model credentials remain in secret storage. No student identities, responses or protected bank items are sent to providers by default.

Use existing `jobs` for generation/validation leases and retries, with `factory_batches`, `factory_items`, `generation_runs` and durable `bank_import_receipts` as specified in [database](../architecture/DATABASE_DESIGN.md). Do not implement the earlier separate generation_jobs queue proposal. Runs retain provider/prompt/source provenance; import uniqueness is producer+batch+item+candidate ordinal plus hash, not merely run ID. Same-package retries reuse mappings; changed content under the same key fails. Raw outputs are restricted with retention limits. Shared database or exported factory-package/1 use the same canonical draft import/publication gate.

Job states: QUEUED → RUNNING → SUCCEEDED, FAILED_RETRYABLE, FAILED_FINAL or CANCELLED. Retryable failures return to QUEUED with bounded exponential backoff (proposed max 3 attempts); validation failure is not an infrastructure retry. SUCCEEDED means drafts persisted, not questions approved. Worker leases/fencing and deduplication follow the shared jobs contract. Cancellation prevents new calls and persists any already incurred cost; a provider timeout may still have incurred cost. Exactly-once external billing cannot be promised; use provider idempotency if available and conservative budget reservations.

## Verification methods and evaluation

Math: deterministic templates or symbolic/numeric independent solver where applicable, test constraints/domain/units and each distractor; use sandboxed computations, never execute generated code. Reading: reviewer checks cited evidence spans and alternative answers against the frozen passage; an entailment model is advisory. Science: preserve seeded synthetic data and verify calculations/physical constraints; charts must match their table values. Independent LLM verifier receives the problem without the generator's answer first; record its method/model. A second model may share errors and is not proof of independence in the statistical sense.

| Dimension | Objective checks | Heuristic / human evidence |
|---|---|---|
| Correctness | Exact arithmetic, solver results with domain restrictions, key IDs | SME derivation and alternate-answer challenge; LLM agreement alone insufficient |
| Ambiguity | Detect identical choices/missing data fields | Human interpretation review; adversarial critic as triage |
| Difficulty | None from prompt alone | Target/predicted separately stored; later response studies for empirical estimates |
| Duplicates | Normalized exact fingerprint | Lexical/embedding similarity with labeled evaluation; confirm paraphrases manually |
| Domain relevance | Taxonomy ID validity | SME construct alignment, cognitive-level rubric |
| Formatting | Schema, rendering, asset availability, safety | Language clarity and accessible presentation |
| Explanations | Key/result consistency where computable | Evidence completeness, reasoning validity, pedagogical usefulness |

AI-002 must create a rights-cleared held-out evaluation manifest (proposed minimum 60 cases, balanced across three sections, with valid/invalid/ambiguous items), separate from prompt examples. Include golden correctness, adversarial ambiguity, prompt injection and copied/near-duplicate cases. Two reviewers resolve label disagreements; record adjudication. Report correctness/ambiguity sensitivity and false positives, domain acceptance, duplicate precision/recall at chosen threshold, explanation rubric, cognitive-label confusion matrix, cost per approved item and review time. Report sample size and uncertainty; no invented accuracy guarantee.

Hard release gate: every generated draft has all deterministic checks passing, no unresolved critical flags and independent human approval before eligibility. Equivalence classification follows [reuse policy](QUESTION_REUSE_POLICY.md): cosmetic/generated variants cannot evade a student's history by acquiring a new identity. Model/prompt upgrades rerun fixed regression cases plus a fresh sample; a failed leakage/injection or known-wrong-answer regression blocks adoption. Thresholds for heuristic triage require measured baseline and owner approval, never inferred from benchmark marketing.

## Cost, safety and reproducibility

Generation runs asynchronously with per-call/batch/operator budgets and validation/review-capacity limits; no generation requests on student exam routes. Inventory shortages prioritize weekly plans; student shortage responses never trigger immediate generation. Estimate upper-bound token cost before dispatch; account for retries/rejections and human review. Choose provider only after region/data-handling review and measured Vietnamese performance. Do not copy hosted proprietary material into prompts without documented permission.

Treat all sources as untrusted quoted data. No provider tools with network, file, publication or bank-export privileges; source fetching is a separate allowlisted ingestion operation with SSRF/size checks. A malicious passage cannot change workflow permissions. Store normalized inputs, frozen source identifiers, prompt/config hashes and available model revisions; replaying stored outputs is deterministic, rerunning hosted generation may not be even with a seed. Provider replacement must pass the same contract/evaluation suites before becoming active.
