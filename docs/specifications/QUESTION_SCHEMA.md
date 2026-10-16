# Canonical question schema

Status: PROPOSED, contract `question/1`, ADR-003. This is the authoritative domain shape; [database](../architecture/DATABASE_DESIGN.md) maps storage and [API](../architecture/API_CONTRACTS.md) maps transport. Types below are documentation, not application code.

## Identity and immutable content

`Question` is a stable UUID identity. `QuestionVersion` is an immutable revision with `(questionId, versionNo)` uniqueness and optional parentVersionId from the same identity. Every saved content edit creates a new version, including draft edits. Workflow status is a separate mutable projection backed by immutable events; a review or validator run references an exact version and hash. Editing never transfers approval. Sources, stimuli, blueprints and assets are also version-pinned. UUID strings are canonical lowercase; IDs are not security credentials.

```typescript
type Section = "MATH" | "READING" | "SCIENCE";
type Level = "M1" | "M2" | "M3";
type Block =
  | {type:"text"; text:string}
  | {type:"math"; tex:string; display:boolean; accessibleText:string}
  | {type:"table"; caption:string; headers:string[]; rows:string[][]}
  | {type:"image"; assetVersionId:string; alt:string; caption?:string};
type Option = {id:string; content:Block[]};
type Interaction =
  | {type:"SINGLE_CHOICE"; options:Option[]}
  | {type:"MULTIPLE_CHOICE"; options:Option[]; minSelections:number; maxSelections:number}
  | {type:"TRUE_FALSE_GROUP"; statements:{id:string; content:Block[]}[]};
type AnswerKey =
  | {type:"SINGLE_CHOICE"; optionId:string}
  | {type:"MULTIPLE_CHOICE"; optionIds:string[]}
  | {type:"TRUE_FALSE_GROUP"; values:Record<string,boolean>};
type ResponseValue =
  | {type:"SINGLE_CHOICE"; optionId:string|null}
  | {type:"MULTIPLE_CHOICE"; optionIds:string[]}
  | {type:"TRUE_FALSE_GROUP"; values:Record<string,boolean|null>};
type QuestionVersion = {
  schemaVersion:"question/1"; id:string; questionId:string; versionNo:number;
  parentVersionId:string|null; language:"vi-VN"; section:Section;
  taxonomyVersionId:string; domainId:string; skillIds:string[]; subskillIds:string[];
  cognitiveLevel:Level|null;
  difficulty:{target:"EASY"|"MEDIUM"|"HARD"|null;
    predicted:{label:string; methodVersion:string; confidence:number}|null;
    empiricalStudyId:string|null};
  content:Block[]; stimulusVersionId:string|null; interaction:Interaction;
  private:{answerKey:AnswerKey; explanation:Block[]; evidenceRefs:string[];
    scoringPolicy:"practice-binary-v1"};
  origin:"MANUAL"|"IMPORTED"|"GENERATED"|"AUGMENTED";
  provenanceIds:string[]; generationRunId:string|null;
  createdBy:string; createdAt:string; contentHash:string;
};
```

Authoring metadata lives outside student DTOs. Cognitive level is a taxonomy claim, not empirical difficulty. Future empirical studies are append-only estimates with sample/population/method identifiers; never overwrite target/predicted values. Taxonomy paths must refer to the pinned taxonomy version and subskills must belong to chosen skills. Subject/domain identifiers are editor-defined; section is the high-level assessment partition.

## Validation rules

- Reject unknown schema versions/fields and mismatched interaction/key/response discriminators. Content and options must be nonempty; option/statement IDs unique within a version and stable within its snapshot.
- Proposed limits: 2–10 options, 1–10 true/false statements; 1–100 blocks per content array; 20,000 Unicode characters per text block; TeX ≤4,000 characters; tables ≤100 rows ×20 columns with uniform width; total serialized question ≤256 KiB. These are engineering limits, not official TSA rules.
- Single-choice key names exactly one defined option. Multi-choice key is a nonempty unique set within the declared min/max range. True/false key covers every statement exactly once, no extras. Partial student answers may be saved; they score incorrect until complete. Empty multi-choice and null single-choice mean unanswered; nonempty multi-choice must respect min/max. Unknown IDs and duplicate set members are errors, never silently discarded.
- TeX is rendered with a restricted renderer, without trusted HTML/macros/remote fetch. Plain text is escaped. No arbitrary HTML, JavaScript, CSS or user-supplied SVG. Tables contain text; diagrams/charts use immutable, inspected image assets and accessible alternatives.
- Asset and stimulus versions must exist, be rights-eligible and compatible with the renderer before approval. Stimulus carries its own provenance and content hash; changes require a new version and new review of affected questions.
- Hash canonical serialization of immutable fields, including private key/explanation and referenced version IDs/hashes, excluding workflow/events. Record canonicalization version. Persist both content hash and a separate normalized duplicate fingerprint; they serve different purposes.

## Provenance, review and duplicate model

Each version requires at least one provenance record, including independently authored material. Record source version, origin, source span/location, transformation, creator and rights evidence. For original work, record author attestation/authorization; synthetic origin is not proof of rights. Allowed uses include DISPLAY, ADAPT, GENERATE and TRAIN independently. Rights states are OWNED, LICENSED, OPEN_LICENSE, PUBLIC_DOMAIN, REFERENCE_ONLY, UNKNOWN, REVOKED; rights gates additionally check allowed uses, territory and validity dates. UNKNOWN/REFERENCE_ONLY never qualify for published bank display or model input.

Workflow: DRAFT → IN_REVIEW → APPROVED or REJECTED. Submission to review requires passing hard validators; approval requires independent human reviewer, answer/explanation evidence, rights check and resolution of duplicate flags. An author cannot approve their own version even with REVIEWER role. Rejected versions remain immutable; revision starts as a new DRAFT. DRAFT/IN_REVIEW/APPROVED may be QUARANTINED with reason. APPROVED may be RETIRED. Quarantined versions require fresh checks and IN_REVIEW before reapproval; retired versions never become eligible again. No automatic promotion from a generation job.

A validation run stores validator kind/version, input hash, PASS/FAIL/INCONCLUSIVE, evidence pointer, time and actor. Human review stores exact hash, rubric (correctness, ambiguity, relevance, language, explanation, rights), decision and reason. Human approval is a content action distinct from human architectural approval.

Duplicate relationships are canonical ordered version pairs with kind EXACT, NEAR_DUPLICATE, ENEMY or RELATED, evidence, detector version and reviewer resolution. Exact normalized matches block approval until addressed; semantic scores only flag candidates. Confirmed duplicate/enemy pairs forbid co-selection; RELATED alone does not. Same question identity is never selected twice even across versions. Shared-stimulus questions are allowed as a bundle; sharing a passage is not itself a duplicate. Confirmed identity-level duplicate groups are carried into assembly manifests; new versions require reevaluation, not automatic disappearance of the conflict. [Reuse policy](QUESTION_REUSE_POLICY.md) gives these groups canonical reuse-equivalence semantics (including singleton membership and monotonic merges). A corrected version retains its question identity; substantively equivalent new identities cannot bypass NEW_ONLY history. The content payload remains question/1; group decisions are external audited authoring metadata, not student DTOs.

## Student projection and future types

Before release, a delivered slot contains only slotId, sectionId, ordinal, content, safe stimulus content and interaction. Required public attribution is embedded as safe text blocks in content or stimulus when authored and frozen, without exposing private provenance. It omits origin, key, explanation, review, generation data, private provenance, answer evidence and difficulty predictions. Asset access follows the same gate; do not hide answers only in the UI.

Future `question/2` may add NUMERIC_ENTRY with explicit decimal/rational normalization and tolerance, TEXT_ENTRY with declared language normalization, and MATCHING/ORDERING with keyboard alternatives. Add discriminated response/key/scorer variants and renderer compatibility together; no arbitrary code evaluation or LLM scoring on the submission path. QTI adapters remain outside the canonical core.
