# QA-001R — Independent Architecture Audit Report

**Date:** 2026-10-16
**Auditor:** Independent Engineering Reviewer (Gemini 3.8 Flash / Antigravity)
**Task:** QA-001R (Cross-document regression audit)
**Phase:** Phase 02.75 (Architecture & Specification Refinement — Documentation Only)
**Target File:** `docs/reviews/LOW_COST_REVIEW_001.md`

---

## 1. Executive Summary

This independent architectural audit evaluates the Phase 02.75 system architecture, database design, API contracts, domain specifications, and implementation roadmap for the TSA Practice Platform. The review specifically examines the tri-component division (**Question Factory**, **Question Bank**, and **Practice Web**), personalized `NEW_ONLY` allocation, provider-neutral AI generation, database transaction boundaries, error semantics, and task dependencies.

### Overall Assessment
The Phase 02.75 architectural baseline establishes clear component responsibilities, strong provider independence, reproducible pseudo-random exam assembly, and defensible security boundaries preventing unvetted AI-generated content from reaching student examinations.

However, this audit identified **8 specific findings** (5 Confirmed Defects, 2 Unverified Risks, and 1 Open Product Decision) that must be reconciled before implementation begins:
1. **Database Relational Integrity**: A missing unique constraint on `attempts(id, user_id)` prevents the foreign key for `student_question_history` from compiling in PostgreSQL.
2. **API & Specification Contradiction**: A naming collision and schema divergence exists between `INVENTORY_SHORTAGE` and `INSUFFICIENT_*` error codes, along with structural incompatibility between `ErrorResponse` and `StudentShortage`.
3. **Circular Gate Dependencies**: Dual definitions of Gate G3 in `TASK_BACKLOG.md` create a circular dependency deadlock for early Track A research tasks (`AI-001`, `FACTORY-001`).
4. **Starter Bank Depletion Risk**: Lack of an active-attempt limit on personalized practice allows rapid, permanent question burn on the 30-item seed inventory.
5. **Client State DTO Incompleteness**: `AttemptView` omits the start TTL deadline (`startBefore`), preventing the frontend from rendering an unstarted attempt countdown.
6. **Schema Baseline Discrepancy**: The baseline table definition for `score_runs` in `DATABASE_DESIGN.md` §2.3 omits `form_id`, conflicting with foreign keys in §3.2.
7. **Taxonomy & Quota Ambiguity**: Section ID string keys and domain section enums are ambiguously conflated between `BlueprintConfig` and `Quota`.
8. **Static Verification Failure**: Trailing whitespace in all 14 `docs/agents/prompt-cards/*.md` files causes the repository's test script to fail.

The platform architecture is **Conditionally Ready** for human owner approval, subject to resolving the defects documented below.

---

## 2. Findings Ordered by Severity

### Summary Table

| Finding ID | Severity | Classification | Target Area | Short Description | Suggested Tier |
|---|---|---|---|---|---|
| **CRIT-01** | CRITICAL | CONFIRMED_DEFECT | Database Design | Missing `UNIQUE(id, user_id)` on `attempts` breaks composite FK in `student_question_history` | HIGH |
| **HIGH-01** | HIGH | CONFIRMED_DEFECT | API / Specifications | Contradiction between `INVENTORY_SHORTAGE` vs `INSUFFICIENT_*` and broken `ErrorResponse` schema | MEDIUM |
| **HIGH-02** | HIGH | CONFIRMED_DEFECT | Backlog / Roadmap | Contradictory definitions of Gate G3 create circular dependency for `AI-001` and `FACTORY-001` | LOW / MEDIUM |
| **HIGH-03** | HIGH | OPEN_PRODUCT_DECISION | Reuse Policy / Engine | Unbounded active personalized attempts allow accidental permanent exhaustion of the 30-question bank | HIGH |
| **MED-01** | MEDIUM | CONFIRMED_DEFECT | API Contracts | `AttemptView` DTO omits `startBefore`, preventing student countdown for unstarted `CREATED` attempts | MEDIUM |
| **MED-02** | MEDIUM | CONFIRMED_DEFECT | Database Design | Table definition for `score_runs` in §2.3 omits `form_id` and `UNIQUE(id, form_id)` required by §3.2 | LOW |
| **MED-03** | MEDIUM | UNVERIFIED_RISK | API / Assembly | Conflation of `sectionId` string and `section` enum between `BlueprintConfig` and `Quota` | LOW / MEDIUM |
| **LOW-01** | LOW | CONFIRMED_DEFECT | Agent Cards / Quality | Trailing whitespace across all 14 prompt cards fails `TEST_STRATEGY.md` static verification script | LOW |

---

### Finding CRIT-01: Missing `UNIQUE(id, user_id)` on `attempts` breaks composite FK

- **Finding ID:** CRIT-01
- **Severity:** CRITICAL
- **Classification:** CONFIRMED_DEFECT
- **Exact File and Section:**
  - `docs/architecture/DATABASE_DESIGN.md` §2.3 (Table `attempts`, lines 65–66)
  - `docs/architecture/DATABASE_DESIGN.md` §3.2 (Table `attempts`, lines 138–139)
- **Evidence:**
  `DATABASE_DESIGN.md` line 139 mandates:
  > "`student_question_history.first_attempt_id` must reference an attempt owned by the same user (composite FK(`first_attempt_id`,`user_id`) → UNIQUE(`attempts.id`,`user_id`))"
  Furthermore, `DATABASE_DESIGN.md` line 9 specifies:
  > "Every composite FK below requires a matching UNIQUE target tuple, including (source_version_id,id) on rights_decisions, (question_version_id,id) on reviews, (attempt_id,id) on score_runs and (id,taxonomy_version_id) on question_versions."
  However, in `DATABASE_DESIGN.md` line 66, the constraints on `attempts` are defined as:
  > `UNIQUE(id,form_id); UNIQUE(form_id) WHERE form_mode=PERSONALIZED_PRACTICE; proposed H1 UNIQUE(user_id,form_id) WHERE state IN ('CREATED','IN_PROGRESS');`
  There is no `UNIQUE(id, user_id)` defined on table `attempts`.
- **Failure Scenario:**
  During database migration execution in task `DATA-001`, PostgreSQL will execute:
  `ALTER TABLE student_question_history ADD CONSTRAINT fk_sqh_attempt FOREIGN KEY (first_attempt_id, user_id) REFERENCES attempts (id, user_id);`
  PostgreSQL will reject this statement with `ERROR: there is no unique constraint matching given keys for referenced table "attempts"`, failing migration startup.
- **Root Cause:**
  When Phase 02.75 introduced `student_question_history` with user-scoped attempt references, the composite target unique constraint was added to text in §3.2 but omitted from the table schema specification in §2.3 and line 9 conventions.
- **Minimal Recommended Correction:**
  1. In `docs/architecture/DATABASE_DESIGN.md` line 66, add `UNIQUE(id, user_id)` to the constraints column of table `attempts`.
  2. In `docs/architecture/DATABASE_DESIGN.md` line 9, add `(id, user_id) on attempts` to the list of required composite unique target tuples.
- **Regression Test:**
  PostgreSQL DDL test: create tables `attempts` and `student_question_history` with foreign key `(first_attempt_id, user_id) REFERENCES attempts(id, user_id)`. Assert successful execution and verify that inserting mismatched `user_id` values raises a foreign key violation.
- **Suggested Agent Capability:** HIGH (Sol / Database Engineer)

---

### Finding HIGH-01: Contradiction in Shortage Error Codes and Incompatible ErrorResponse Schema

- **Finding ID:** HIGH-01
- **Severity:** HIGH
- **Classification:** CONFIRMED_DEFECT
- **Exact File and Section:**
  - `docs/specifications/QUESTION_REUSE_POLICY.md` §4 (lines 48–52, lines 64–66)
  - `docs/specifications/EXAM_ASSEMBLY_SPEC.md` §4 (line 45)
  - `docs/architecture/API_CONTRACTS.md` §1 (lines 14–17), §2 (line 43), §5 (lines 166–176)
  - `docs/tasks/TASK_BACKLOG.md` §FOUND-007 (line 279, lines 308–317)
- **Evidence:**
  1. `QUESTION_REUSE_POLICY.md` line 49 states:
     > "NEW_ONLY returns INVENTORY_SHORTAGE when the eligible unseen pool is provably insufficient."
     Line 65 repeats: "A's eligible unseen pool cannot satisfy a section or bundle quota: Return INVENTORY_SHORTAGE only with proof...".
     `EXAM_ASSEMBLY_SPEC.md` line 45 agrees: "Errors: INVENTORY_SHORTAGE...".
  2. In contrast, `API_CONTRACTS.md` line 43 states:
     > "422 `INSUFFICIENT_UNSEEN_INVENTORY` or `INSUFFICIENT_ELIGIBLE_INVENTORY` with StudentShortage".
     Lines 166–176 define `StudentShortage` with only these two codes.
  3. Structural incompatibility:
     `ErrorResponse` (lines 14–17) requires:
     `type ErrorResponse = {error:{code:string; message:string; requestId:string; details?:{...}}};`
     `StudentShortage` (lines 166–176) omits `message: string`:
     `type StudentShortage = {error:{code: "INSUFFICIENT_UNSEEN_INVENTORY"|"INSUFFICIENT_ELIGIBLE_INVENTORY"; requestId:string; details:{blueprintVersionId:UUID; reuseMode:...; sectionDeficits:...; alternatives:...}}};`
     Furthermore, `details` in `ErrorResponse` does not include `blueprintVersionId`, `reuseMode`, or `alternatives`.
- **Failure Scenario:**
  A frontend client using strict TypeScript validation or OpenAPI generated clients will fail schema parsing on a 422 shortage response because `error.message` is missing. Conversely, frontend code checking `error.code === 'INVENTORY_SHORTAGE'` will never handle `INSUFFICIENT_UNSEEN_INVENTORY`, displaying a generic error instead of rendering the required alternatives UI (shorter profile, review mode opt-in).
- **Root Cause:**
  Phase 02.75 refined `StudentShortage` in API contracts into distinct unseen vs eligible codes, but failed to synchronize `QUESTION_REUSE_POLICY.md`, `EXAM_ASSEMBLY_SPEC.md`, and the base `ErrorResponse` DTO. Task `FOUND-007` was noted in the backlog but left unresolved.
- **Minimal Recommended Correction:**
  1. Standardize on the two-code taxonomy: `INSUFFICIENT_UNSEEN_INVENTORY` (for student-level exhaustion in `NEW_ONLY`) and `INSUFFICIENT_ELIGIBLE_INVENTORY` (for bank-level exhaustion across any mode). Replace `INVENTORY_SHORTAGE` references in `QUESTION_REUSE_POLICY.md` and `EXAM_ASSEMBLY_SPEC.md`.
  2. In `API_CONTRACTS.md`, add `message: string` to `StudentShortage.error` and ensure `ErrorResponse.details` defines optional `blueprintVersionId?: UUID; reuseMode?: ReuseMode; alternatives?: AlternativeOption[];` (or model `ErrorResponse` as a discriminated union).
- **Regression Test:**
  Schema validation test: serialize a `StudentShortage` instance and validate that it conforms strictly to both `StudentShortage` and `ErrorResponse` schemas.
- **Suggested Agent Capability:** MEDIUM (Terra / API Contract Engineer)

---

### Finding HIGH-02: Circular Gate Dependencies and Contradictory Definitions of G3 in Backlog

- **Finding ID:** HIGH-02
- **Severity:** HIGH
- **Classification:** CONFIRMED_DEFECT
- **Exact File and Section:**
  - `docs/tasks/TASK_BACKLOG.md` §Task Backlog (line 27)
  - `docs/tasks/TASK_BACKLOG.md` §AI-001 (line 207)
  - `docs/tasks/TASK_BACKLOG.md` §FACTORY-001 (line 243)
  - `docs/tasks/TASK_BACKLOG.md` §Execution refinement table (lines 268–275, lines 300–302)
  - `docs/tasks/IMPLEMENTATION_ROADMAP.md` §Shared planning prerequisites (lines 8–12)
- **Evidence:**
  1. `TASK_BACKLOG.md` line 27 states:
     > "Global gates G1=current ADR-001–004 and ADR-007 approved; G2=ADR-006 approved for production; G3=current ADR-005/008 approved."
  2. `TASK_BACKLOG.md` line 273 and `IMPLEMENTATION_ROADMAP.md` line 12 define Gate G3 completely differently:
     > "G3 — Integration readiness: A2, AI-002, G2, and the technical-MVP attempt/scoring slice must each meet their own exit criteria."
  3. `AI-001` (line 207) states:
     > "Prerequisites: FOUND-002 shared contracts, G3, approved provider data handling..."
     `FACTORY-001` (line 243) states:
     > "Prerequisites: AI-001, G3, owner schedule/budget/review capacity..."
  4. Yet the metadata table in line 300 assigns `AI-001` to `Gate: G1 / Track A`, and line 274 states:
     > "Track A — AI Question Factory Research: RESEARCH-002 → AI-003 → AI-001 → AI-002 → FACTORY-002/003 → INT-001"
- **Failure Scenario:**
  An implementing agent assigned to `AI-001` inspects its prerequisites and encounters "G3". Looking at the roadmap and gate table, Gate G3 requires `AI-002` and the full Technical MVP web slice to be finished. The agent halts work because `AI-001` cannot start until `AI-002` finishes, while `AI-002` cannot start without `AI-001` output. This circular dependency prevents Track A from ever executing.
- **Root Cause:**
  Phase 02.5 used "G1, G2, G3" as labels for decision approval clusters (where G3 meant ADR-005/008 approval). Phase 02.75 introduced sequential lifecycle gates G0, G1, G2, G3 (where G3 is Integration Readiness). Line 27 and task descriptions for `AI-001` and `FACTORY-001` retained legacy Phase 02.5 gate names.
- **Minimal Recommended Correction:**
  1. In `TASK_BACKLOG.md` line 27, rename the ADR clusters to avoid using "G1, G2, G3" (e.g., `ADR-CORE`, `ADR-OPS`, `ADR-FACTORY`).
  2. In `AI-001` (line 207), replace prerequisite `G3` with `G1, ADR-005/ADR-008 approval, approved provider data handling`.
  3. In `FACTORY-001` (line 243), replace prerequisite `G3` with `AI-001, ADR-008 approval, owner schedule/budget/review capacity`.
- **Regression Test:**
  Static topological sort script verifying that prerequisite chains across all 36 task cards form a Directed Acyclic Graph (DAG) with no backward references across lifecycle gates G0 → G1 → G2 → G3.
- **Suggested Agent Capability:** LOW / MEDIUM (Terra / Backlog Integrator)

---

### Finding HIGH-03: Unbounded Active Personalized Attempts and Rapid Seed Bank Depletion

- **Finding ID:** HIGH-03
- **Severity:** HIGH
- **Classification:** OPEN_PRODUCT_DECISION (with UNVERIFIED_RISK)
- **Exact File and Section:**
  - `docs/decisions/OPEN_DECISIONS.md` §ADR-004 (lines 97, 109)
  - `docs/specifications/QUESTION_REUSE_POLICY.md` §1 (lines 15–16), §3 (lines 39–42), §6 (lines 58–64)
  - `docs/architecture/DATABASE_DESIGN.md` §2.3 (line 66)
  - `docs/specifications/MVP_SCOPE.md` §2 (lines 20–22)
- **Evidence:**
  1. `DATABASE_DESIGN.md` line 66 defines the active-attempt index as:
     `proposed H1 UNIQUE(user_id,form_id) WHERE state IN ('CREATED','IN_PROGRESS')`.
     `OPEN_DECISIONS.md` line 109 explicitly clarifies: "scopes H1 to fixed forms".
     Because each personalized attempt generates a new, distinct `form_id`, this partial unique index does not limit personalized attempts.
  2. `QUESTION_REUSE_POLICY.md` line 64 and `TEST_STRATEGY.md` scenario H specifically state that two overlapping personalized requests for the same student will serialize under the user lock and commit disjoint sets of questions.
  3. `QUESTION_REUSE_POLICY.md` lines 15 and 59 establish that assignments are recorded at `CREATED` commit and are **never** released or undone by cancellation, expiry, non-start, or start TTL abandonment.
  4. `MVP_SCOPE.md` line 21 defines the initial starter bank as exactly 30 questions (12 Math, 6 Reading, 12 Science) for a 10-question mini-exam (4 Math, 2 Reading, 4 Science).
- **Failure Scenario:**
  A student clicks "Create Attempt" 3 times in quick succession (e.g., in separate browser tabs or before starting). Because there is no active attempt limit for personalized practice, all 3 requests succeed, creating 3 distinct forms with 30 unique questions. All 30 questions are committed to `student_question_history`. If the student closes the browser, all 3 attempts expire after the 15-minute start TTL and transition to `CANCELLED` with `ADMISSION_CLOSED`. Because assignments are permanent, the student has exhausted the entire 30-question bank without viewing or answering a single question. Any subsequent attempt immediately returns `INSUFFICIENT_UNSEEN_INVENTORY`.
- **Root Cause:**
  When H1 was refined to apply only to `PUBLISHED_FIXED` forms, no policy or constraint was established regarding the maximum number of concurrent active (`CREATED` or `IN_PROGRESS`) personalized attempts permitted per student.
- **Minimal Recommended Correction:**
  Owner product decision required between two options:
  - **Option A (Recommended):** Enforce a global one-active-attempt rule per student across all practice modes: add partial unique constraint `UNIQUE(user_id) WHERE state IN ('CREATED', 'IN_PROGRESS')`. If an uncompleted attempt exists, `POST /attempts` returns 409 `CONCURRENT_ATTEMPT_EXISTS` with `existingAttemptId`.
  - **Option B:** Permit multiple attempts but relax the assignment policy such that unstarted `CANCELLED` attempts (where `started_at IS NULL`) release their assignments from `student_question_history`. (Note: Option B violates ADR-007's "assigned at CREATED" principle and increases complexity).
- **Regression Test:**
  Create a personalized attempt for User A. Without starting it, issue a second `POST /attempts` call for User A with a new idempotency key. Under Option A, assert response is 409 `CONCURRENT_ATTEMPT_EXISTS` and verify no additional questions are inserted into `student_question_history`.
- **Suggested Agent Capability:** HIGH (Sol / Architecture & Database Engineer)

---

### Finding MED-01: `AttemptView` DTO omits `startBefore` for unstarted attempts

- **Finding ID:** MED-01
- **Severity:** MEDIUM
- **Classification:** CONFIRMED_DEFECT
- **Exact File and Section:**
  - `docs/architecture/API_CONTRACTS.md` §1 (lines 28–33)
  - `docs/architecture/API_CONTRACTS.md` §2 (line 45)
  - `docs/architecture/API_CONTRACTS.md` §5 (lines 158–160)
- **Evidence:**
  `CreationReceipt` (returned only on `POST /attempts` creation) defines:
  `type CreationReceipt = {attemptId:UUID; formId:UUID; state:"CREATED"; formMode:FormMode; reuseMode:ReuseMode; reusePolicyVersion:"reuse/1"; startBefore:Instant};`
  `AttemptView` (returned on `GET /attempts/{id}`) defines:
  ```typescript
  type AttemptView = {attemptId:UUID; state:AttemptState; formId:UUID;
    formMode:FormMode; reuseMode:ReuseMode; reusePolicyVersion:string;
    serverNow:Instant; startedAt:Instant|null; deadlineAt:Instant|null;
    activeSectionId:string|null;
    sections:{sectionId:string; startsAt:Instant|null; endsAt:Instant|null; count:number}[];
    slots:StudentSlot[]; answers:AnswerAck[]; closure:Closure};
  ```
  `AttemptView` contains `startedAt` and `deadlineAt` (which are `null` while `state === 'CREATED'`), but does not contain `startBefore`.
- **Failure Scenario:**
  A student creates an attempt, sees the 15-minute start TTL reservation, and refreshes the browser page. The frontend re-fetches attempt state via `GET /attempts/{id}`. Because `AttemptView` does not return `startBefore`, the UI cannot compute the remaining time to start and cannot warn the student before the reservation lapses. The attempt is then cancelled for `ADMISSION_CLOSED` without prior client feedback.
- **Root Cause:**
  `startBefore` was introduced into `CreationReceipt` in Phase 02.75 to support the proposed 15-minute start TTL, but was not propagated to `AttemptView`.
- **Minimal Recommended Correction:**
  In `API_CONTRACTS.md` line 30, add `startBefore: Instant | null;` to `AttemptView`. Populate this field from `form_availability.available_until` when `state === 'CREATED'`.
- **Regression Test:**
  Contract test: invoke `GET /attempts/{id}` on an attempt in `CREATED` state. Verify that `startBefore` is a non-null, valid RFC3339 timestamp equal to the form's `available_until`.
- **Suggested Agent Capability:** MEDIUM (Terra / Contract Engineer)

---

### Finding MED-02: Table definition for `score_runs` in §2.3 omits `form_id` and `UNIQUE(id, form_id)`

- **Finding ID:** MED-02
- **Severity:** MEDIUM
- **Classification:** CONFIRMED_DEFECT
- **Exact File and Section:**
  - `docs/architecture/DATABASE_DESIGN.md` §2.3 (lines 69–70)
  - `docs/architecture/DATABASE_DESIGN.md` §3.2 (lines 137–138)
- **Evidence:**
  `DATABASE_DESIGN.md` line 137 specifies:
  > "Add `score_runs.form_id` with FK(`attempt_id`,`form_id`) → `attempts(id,form_id)` and UNIQUE(`id`,`form_id`); score-item FK(`score_run_id`,`form_id`) → `score_runs(id,form_id)` and FK(`form_id`,`slot_id`) → `form_slots`, with index(`form_id`,`slot_id`)"
  However, in the baseline table definition in line 69, `score_runs` is defined as:
  > `score_runs | attempt_id FK, policy_version, input_hash, correct_count, total_count, percentage numeric(5,2), section_totals JSONB, supersedes_id nullable FK, reason | UNIQUE(attempt_id,policy_version,input_hash); 0≤correct≤total and total>0; immutable`
  The column `form_id` and the constraint `UNIQUE(id, form_id)` are absent from the table specification.
- **Failure Scenario:**
  An engineer implementing `DATA-001` relying on table summary §2.3 will create `score_runs` without `form_id`. When subsequently creating table `score_items` with composite FK `(score_run_id, form_id) REFERENCES score_runs(id, form_id)`, PostgreSQL will fail with an undefined column error.
- **Root Cause:**
  Textual amendments in §3.2 were not backported to the baseline entity-relationship table in §2.3.
- **Minimal Recommended Correction:**
  In `DATABASE_DESIGN.md` line 69, update the `score_runs` row to include `form_id FK` in columns, and append `UNIQUE(id, form_id)` to its constraints list.
- **Regression Test:**
  Execute PostgreSQL DDL for `score_runs` and `score_items` verifying that `score_items` foreign keys to `score_runs(id, form_id)` and `form_slots(form_id, slot_id)` resolve cleanly.
- **Suggested Agent Capability:** LOW (Database Engineer)

---

### Finding MED-03: Conflation of `sectionId` string and `section` enum in Blueprint and Quota contracts

- **Finding ID:** MED-03
- **Severity:** MEDIUM
- **Classification:** UNVERIFIED_RISK
- **Exact File and Section:**
  - `docs/architecture/API_CONTRACTS.md` §3 (lines 88, 103–106, 111–118, 188)
  - `docs/specifications/EXAM_ASSEMBLY_SPEC.md` §1 (lines 7–9), §5 (lines 55–58)
  - `docs/decisions/OPEN_DECISIONS.md` §ADR-004 H3 (line 99)
- **Evidence:**
  In `API_CONTRACTS.md`:
  - `QuestionDraft` (line 88) defines `section: Section` (enum `"MATH" | "READING" | "SCIENCE"`).
  - `BlueprintConfig.sections` (line 113) defines `sections: {id: string, section: Section, count: number, durationSeconds: number}[]`.
  - `Quota` (line 103) defines `{sectionId: string; min: number; max: number}`.
  - In `API_CONTRACTS.md` line 188, the example student shortage payload shows:
    `sectionDeficits: [{sectionId: "MATH", missingCount: 2}]`.
  Here `"MATH"` is the domain enum, not a unique section instance ID like `"sec_math_1"`. Under proposed decision H3 (unique section enums in MVP), `sections.id` and `sections.section` are redundant, leading to ambiguity as to whether quotas match on the section's UUID/slug `id` or the domain enum `section`.
- **Failure Scenario:**
  If a blueprint defines `sections: [{id: "s1", section: "MATH", count: 4, durationSeconds: 360}]` and a quota defines `{sectionId: "MATH", dimension: "SKILL", ...}`, the validator expects `sectionId === "s1"` and rejects the blueprint configuration with 422 `VALIDATION_ERROR` (unrecognized `sectionId`), or fails to map quota constraints during assembly.
- **Root Cause:**
  The schema allows arbitrary string section identifiers while the domain and examples assume the uppercase `Section` enum values serve as section identifiers.
- **Minimal Recommended Correction:**
  In `API_CONTRACTS.md` and `EXAM_ASSEMBLY_SPEC.md`, specify that for MVP (under proposed H3), `BlueprintConfig.sections.id` must equal `BlueprintConfig.sections.section` (or define `sectionId: Section` directly in `Quota`), eliminating the distinction between section identity and section enum.
- **Regression Test:**
  Blueprint schema fixture validation verifying that quota `sectionId` values must match an existing section's identifier and domain enum.
- **Suggested Agent Capability:** LOW / MEDIUM (Terra / Contract Engineer)

---

### Finding LOW-01: Trailing Whitespace in Agent Prompt-Cards Fails Quality Script

- **Finding ID:** LOW-01
- **Severity:** LOW
- **Classification:** CONFIRMED_DEFECT
- **Exact File and Section:**
  - `docs/agents/prompt-cards/*.md` (all 14 markdown files: `01_GOV-001_Luna.md` through `14_REVIEW-001R_Astra.md`)
  - `docs/quality/TEST_STRATEGY.md` §Phase 01 documentation verification (lines 85–87)
- **Evidence:**
  Executing the repository's authoritative documentation validation command from `docs/quality/TEST_STRATEGY.md`:
  `sed -n '/^```javascript$/,/^```$/p' docs/quality/TEST_STRATEGY.md | sed '1d;$d' | node`
  exits with code 1 and outputs 14 errors:
  ```json
  "errors": [
    "Trailing whitespace: docs/agents/prompt-cards/01_GOV-001_Luna.md",
    "Trailing whitespace: docs/agents/prompt-cards/02_FACT-001_Sol.md",
    ...
    "Trailing whitespace: docs/agents/prompt-cards/14_REVIEW-001R_Astra.md"
  ]
  ```
  `TEST_STRATEGY.md` line 85 checks:
  `if(/[\t ]+$/m.test(text))` and only permits trailing whitespace in `docs/reviews/ARCHITECTURE_REVIEW_001.md`.
- **Failure Scenario:**
  Any automated CI check running the static documentation suite fails immediately with exit code 1.
- **Root Cause:**
  Prompt card files were authored with trailing spaces at line ends and committed without running the static documentation check.
- **Minimal Recommended Correction:**
  Run a single-pass whitespace cleanup stripping trailing spaces across `docs/agents/prompt-cards/*.md`.
- **Regression Test:**
  Execute `sed -n '/^```javascript$/,/^```$/p' docs/quality/TEST_STRATEGY.md | sed '1d;$d' | node` and assert exit code 0.
- **Suggested Agent Capability:** LOW

---

## 3. Cross-Document Consistency Assessment

### 3.1 Architecture Consistency
- **Question Factory vs Question Bank vs Practice Web:** Responsibilities are cleanly divided. The Question Factory is an independent executable (`tools/question-factory`) with separate DB credentials, separate job kinds (`factory_*` vs `exam_*`), and no student data access. The Question Bank is the sole durable publication boundary; factory outputs enter only as `DRAFT` versions via `bank_import_receipts`. The Practice Web exam path reads exclusively approved bank items and has no LLM provider credentials or live generation logic.
- **Shared Database Isolation:** The shared PostgreSQL model is documented with separate connection pools and transaction bounds. Contention during 500-candidate batch runs is explicitly identified as an operational risk requiring load verification in `OPS-001`.

### 3.2 Database and API Compatibility
- **Attempt State Machine:** State vocabulary (`CREATED`, `IN_PROGRESS`, `SUBMITTED`, `EXPIRED`, `GRADED`, `CANCELLED`, `INVALIDATED`) is aligned between `EXAM_ENGINE_SPEC.md`, `API_CONTRACTS.md`, and `DATABASE_DESIGN.md`.
- **Closure and Reasons:** `terminalReason` (`EXPLICIT_SUBMIT`, `DEADLINE`) and `cancellationReason` (`FORM_WITHDRAWN`, `RIGHTS_BLOCKED`, `ADMISSION_CLOSED`) are identical across engine, API, and DB specifications.
- **Missing Elements:** As noted in findings CRIT-01, MED-01, and MED-02, specific composite foreign keys (`attempts(id, user_id)`), baseline table columns (`score_runs.form_id`), and view DTO properties (`AttemptView.startBefore`) require textual reconciliation.

### 3.3 Examination Correctness
- **Personalized NEW_ONLY:** Excludes all stable question IDs and confirmed canonical equivalence groups previously assigned to the student. Assignment occurs at `CREATED` commit and is monotonic across all attempts.
- **Deterministic Assembly:** `xorshift32-v1` PRNG vectors, Fisher-Yates shuffle order, seed constants (0 mapping to `2463534242`), and exact integer percentage calculations (`1/3` → `"33.33"`, `1/32` → `"3.13"`) are mathematically verified and consistent across `EXAM_ASSEMBLY_SPEC.md`, `EXAM_ENGINE_SPEC.md`, and `REVIEW_RESOLUTION_001.md`.
- **Concurrency & Locking:** Per-user allocation row lock acquired before shared bank publication advisory lock avoids deadlocks with the exclusive publication lock. Lock ordering is consistent across `DATABASE_DESIGN.md` and `EXAM_ASSEMBLY_SPEC.md`.

### 3.4 AI Generation Security
- **Independent Publication Gate:** Factory credentials cannot publish. Publication strictly requires human `REVIEWER` credentials (independent of the author/operator), current valid rights, all deterministic validators passing, and resolved duplicate/equivalence status.
- **Immutability:** Versioned drafts, frozen form slots, and form secrets snapshots remain immutable even if a question version is subsequently revoked or retired.

### 3.5 Provider Independence
- **Adapter Decoupling:** `GenerationRequest`, `ProviderResult`, and `ProviderError` contracts isolate vendor SDKs. Provider responses are mapped to canonical `question/1` schema before database persistence. Replacing or comparing models (e.g. in `AI-001` / `AI-002`) changes adapter configuration, never bank or exam tables.

---

## 4. Missing Implementation Prerequisites

The following prerequisites are currently unresolved and block implementation tasks beyond documentation:

1. **Human Owner Approval of ADRs (FOUND-004):**
   - All 8 ADRs (`ADR-001` through `ADR-008`) remain `PROPOSED`. Human owner sign-off is mandatory to cross Gate G0.
   - Specific owner choices required under `ADR-004`:
     - **H1:** Active attempt policy (must decide whether to restrict personalized practice as identified in Finding HIGH-03).
     - **H2:** Admission window semantics (`[from, until)` admission bounds vs full duration fit).
     - **H3:** Section uniqueness (confirming 1 to 3 unique section enum types for MVP).
2. **Reconciliation of Shortage Contracts (FOUND-007):**
   - Must resolve Finding HIGH-01 before task `FOUND-002` freezes runtime schemas and contract fixtures.
3. **Vietnamese Content Human Roles (DATA-002 / DATA-003):**
   - Two distinct human actors (one author, one independent reviewer) must be identified for the 30-question starter dataset.
4. **AI Research Envelope (RESEARCH-002 / AI-003):**
   - Owner approval of provider terms, evaluation dataset rights, budget ceilings, and schedule timezone before live provider dispatch.

---

## 5. Recommended Repair Task Assignments

To address the findings without expanding scope, the following task assignments are recommended for the next integration agent:

| Task ID | Action Required | Files to Modify | Suggested Tier |
|---|---|---|---|
| **FOUND-007** | Resolve Finding HIGH-01: Standardize on `INSUFFICIENT_UNSEEN_INVENTORY` and `INSUFFICIENT_ELIGIBLE_INVENTORY`. Add `message` to `StudentShortage`. Align `QUESTION_REUSE_POLICY.md` and `EXAM_ASSEMBLY_SPEC.md`. | `docs/architecture/API_CONTRACTS.md`, `docs/specifications/QUESTION_REUSE_POLICY.md`, `docs/specifications/EXAM_ASSEMBLY_SPEC.md` | MEDIUM |
| **DATA-001R** | Resolve Finding CRIT-01 and Finding MED-02: Add `UNIQUE(id, user_id)` to `attempts` and `form_id` + `UNIQUE(id, form_id)` to `score_runs` in baseline table definitions. | `docs/architecture/DATABASE_DESIGN.md` | HIGH |
| **API-001R** | Resolve Finding MED-01 and Finding MED-03: Add `startBefore: Instant \| null` to `AttemptView`. Clarify that `Quota.sectionId` matches `Section` enum for MVP. | `docs/architecture/API_CONTRACTS.md` | MEDIUM |
| **BACKLOG-001R**| Resolve Finding HIGH-02: Disambiguate Gate G3 in line 27 vs lines 268–275. Update prerequisites for `AI-001` and `FACTORY-001`. | `docs/tasks/TASK_BACKLOG.md` | LOW / MEDIUM |
| **GOV-001** | Resolve Finding HIGH-03: Present active personalized attempt policy choice (Option A vs Option B) to the human owner in `OPEN_DECISIONS.md`. | `docs/decisions/OPEN_DECISIONS.md` | HIGH |
| **QA-FIX-001** | Resolve Finding LOW-01: Strip trailing whitespace from all 14 files in `docs/agents/prompt-cards/*.md`. | `docs/agents/prompt-cards/*.md` | LOW |

---

## 6. Readiness for Architecture Approval

| Dimension | Readiness Status | Condition / Blocker |
|---|---|---|
| **Architectural Model** | **READY** | Three-component logical model (Factory, Bank, Web) is sound and decoupled. |
| **Provider Independence** | **READY** | Adapter contracts fully isolate external LLM APIs from student logic. |
| **Concurrency & Integrity** | **CONDITIONAL** | Sound advisory/row lock protocol, but blocked by missing DB constraints (CRIT-01). |
| **API & Error Contracts** | **NOT READY** | Blocked by shortage code mismatch and `ErrorResponse` schema drift (HIGH-01). |
| **Task Sequencing** | **NOT READY** | Blocked by circular gate definition for G3 in backlog (HIGH-02). |
| **Overall Milestone Status**| **CONDITIONALLY APPROVED** | Ready for owner approval once the 5 Confirmed Defects are reconciled. |

---

*End of QA-001R Audit Report. Independent auditor execution complete.*
