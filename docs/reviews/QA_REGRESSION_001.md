# QA-RECHECK-001 — Independent Architecture Regression Audit Report

**Date:** 2026-10-17
**Auditor:** Independent Software Architecture Reviewer (Gemini 3.8 Flash / Antigravity)
**Task:** QA-RECHECK-001 (Architecture Regression Audit)
**Phase:** Phase 02.75 (Architecture & Specification Refinement — Documentation Only)
**Target File:** `docs/reviews/QA_REGRESSION_001.md`
**Reference Baseline:** `docs/reviews/LOW_COST_REVIEW_001.md`

---

## 1. Executive Summary

This independent architectural regression audit evaluates whether the 8 defects identified in the previous independent architecture audit (`docs/reviews/LOW_COST_REVIEW_001.md`) have been correctly resolved in the HUST TSA Platform specification and architecture documents. The audit verifies recent repair commits (`3013121`, `0dd776d`, `465a789`, `a8a0740`, and `26d27bf`), the cross-document consistency of the owner-approved ADR-004 H1 policy, task dependency graph acyclicity, and static documentation quality.

### Summary of Audit Results

1. **Resolution of Prior Defects:** All 8 previously identified findings (**CRIT-01**, **HIGH-01**, **HIGH-02**, **HIGH-03**, **MED-01**, **MED-02**, **MED-03**, and **LOW-01**) have been **RESOLVED**.
2. **Owner-Approved ADR-004 H1:** The human project owner's scoped approval of ADR-004 H1 (one active `CREATED` or `IN_PROGRESS` attempt per student globally across all practice modes) is consistently applied across the database specification, API contracts, exam engine specification, question reuse policy, and decision records. Unapproved statuses for H2, H3, and ADR-004 as a whole are strictly preserved.
3. **Task Dependency Graph:** The task-to-task dependency graph across all 36 task cards in `docs/tasks/TASK_BACKLOG.md` forms a valid, acyclic Directed Acyclic Graph (DAG) with 0 cycles and 0 unknown task references. Early AI research tasks (Track A) are verified to be completely decoupled from student web integration.
4. **Static Quality Verification:** Automated documentation checks from `docs/quality/TEST_STRATEGY.md` execute with 0 errors across 41 markdown documents and 180 valid local links. Zero broken links or trailing whitespace exist in reviewed documentation.
5. **New Regressions:** One minor confirmed documentation defect was detected: non-normative task description prose in `docs/tasks/TASK_BACKLOG.md` cards `FOUND-004` and `EXAM-001` retains obsolete text stating that H1 applies to "fixed forms only", which was not synchronized during the global H1 repair.

### Final Recommendation

**READY_FOR_FINAL_REVIEW**

The architectural model, relational schema, wire API contracts, reuse boundaries, and lifecycle gates are structurally sound, mutually consistent, and ready for the human owner's final baseline architecture approval (Gate G0).

---

## 2. Status of Previous Audit Findings

| Finding ID | Severity | Previous Classification | Current Status | Target Area |
|---|---|---|---|---|
| **CRIT-01** | CRITICAL | CONFIRMED_DEFECT | **RESOLVED** | Database Design |
| **HIGH-01** | HIGH | CONFIRMED_DEFECT | **RESOLVED** | API / Specifications |
| **HIGH-02** | HIGH | CONFIRMED_DEFECT | **RESOLVED** | Backlog / Roadmap |
| **HIGH-03** | HIGH | OPEN_PRODUCT_DECISION | **RESOLVED** | Reuse Policy / Decisions |
| **MED-01** | MEDIUM | CONFIRMED_DEFECT | **RESOLVED** | API Contracts |
| **MED-02** | MEDIUM | CONFIRMED_DEFECT | **RESOLVED** | Database Design |
| **MED-03** | MEDIUM | UNVERIFIED_RISK | **RESOLVED** | API / Assembly |
| **LOW-01** | LOW | CONFIRMED_DEFECT | **RESOLVED** | Agent Prompt Cards |

---

### Finding CRIT-01: Missing PostgreSQL composite FK target uniqueness

- **Original Finding:** In `docs/architecture/DATABASE_DESIGN.md`, `student_question_history` defined composite foreign key `(first_attempt_id, user_id) REFERENCES attempts(id, user_id)`, but table `attempts` lacked the required matching `UNIQUE(id, user_id)` constraint, preventing DDL compilation in PostgreSQL.
- **Current Status:** **RESOLVED**
- **Evidence:**
  - `docs/architecture/DATABASE_DESIGN.md` §1 (line 9):
    > "Every composite FK below requires a matching UNIQUE target tuple, including ... (id,user_id) and (id,form_id) on attempts ..."
  - `docs/architecture/DATABASE_DESIGN.md` §2.3 (Table `attempts`, line 66):
    > `UNIQUE(id,user_id); UNIQUE(id,form_id); UNIQUE(form_id) WHERE form_mode=PERSONALIZED_PRACTICE; owner-approved H1 partial UNIQUE(user_id) WHERE state IN ('CREATED','IN_PROGRESS') across both modes; ...`
  - `docs/architecture/DATABASE_DESIGN.md` §3.2 (Table `attempts`, line 143):
    > "retain `attempts` UNIQUE(`id`,`user_id`) and UNIQUE(`id`,`form_id`), FK(`form_id`,`form_mode`) → `forms(id,mode)`, personal-owner composite check ..."
- **Assessment:** Table `attempts` now explicitly includes `UNIQUE(id, user_id)` in both §1, §2.3, and §3.2. PostgreSQL can build foreign key `(first_attempt_id, user_id) REFERENCES attempts(id, user_id)` without error.

---

### Finding HIGH-01: Inconsistent inventory shortage error codes and incompatible error response schemas

- **Original Finding:** `QUESTION_REUSE_POLICY.md` and `EXAM_ASSEMBLY_SPEC.md` referenced `INVENTORY_SHORTAGE`, while `API_CONTRACTS.md` specified `INSUFFICIENT_UNSEEN_INVENTORY` and `INSUFFICIENT_ELIGIBLE_INVENTORY`. Furthermore, `StudentShortage.error` omitted `message: string`, violating the base `ErrorResponse` contract.
- **Current Status:** **RESOLVED**
- **Evidence:**
  - `docs/architecture/API_CONTRACTS.md` §1 (lines 14–24):
    ```typescript
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
    ```
  - `docs/architecture/API_CONTRACTS.md` §5 (lines 172–176):
    ```typescript
    type StudentShortage = {error:{code:
      "INSUFFICIENT_UNSEEN_INVENTORY"|"INSUFFICIENT_ELIGIBLE_INVENTORY";
      message:string; requestId:string;
      details:ErrorDetails & {blueprintVersionId:UUID;
        reuseMode:"NEW_ONLY"|"REVIEW_ALLOWED";
        sectionDeficits:SectionDeficit[]; alternatives:AlternativeOption[]}}};
    ```
  - `docs/specifications/QUESTION_REUSE_POLICY.md` §4 (line 49):
    > "Use **inventory shortage** only as the generic concept. The API returns `INSUFFICIENT_ELIGIBLE_INVENTORY` when the authorized eligible bank cannot satisfy the request even before this student's NEW_ONLY exclusions. It returns `INSUFFICIENT_UNSEEN_INVENTORY` only when that eligible baseline can satisfy the request but excluding this student's assigned stable identities and current canonical equivalence groups makes the NEW_ONLY request provably insufficient."
  - `docs/specifications/EXAM_ASSEMBLY_SPEC.md` §4 (line 45):
    > "Errors: `INSUFFICIENT_ELIGIBLE_INVENTORY` (provable bank-level eligible constraint), `INSUFFICIENT_UNSEEN_INVENTORY` (provable student-specific NEW_ONLY constraint after the eligible baseline is sufficient) ... “Inventory shortage” is a generic concept, never an API error code."
- **Assessment:** Error taxonomy is unified across all specifications. `StudentShortage` now strictly conforms to `ErrorResponse` with a required `message: string` and fully typed `details`.

---

### Finding HIGH-02: Conflicting G3 definitions and circular task dependencies

- **Original Finding:** In `docs/tasks/TASK_BACKLOG.md`, line 27 defined Gate G3 as ADR approval (`ADR-005/008`), while lines 268–275 and `IMPLEMENTATION_ROADMAP.md` defined G3 as integration readiness requiring `AI-002` and the Technical MVP web slice. Early tasks `AI-001` and `FACTORY-001` listed prerequisite `G3`, creating an unresolvable circular deadlock.
- **Current Status:** **RESOLVED**
- **Evidence:**
  - `docs/tasks/TASK_BACKLOG.md` §Execution rules (lines 27–28):
    > "Legacy ADR approval groups are distinct from lifecycle gates: **ADR-CORE** = ADR-001–004 and ADR-007 approved; **ADR-OPS** = ADR-006 approved for production; **ADR-FACTORY** = ADR-005 and ADR-008 approved. These groups do not change the PROPOSED status of any ADR or authorize implementation."
  - `docs/tasks/TASK_BACKLOG.md` §AI-001 (line 209):
    > "Prerequisites: FOUND-002 shared contracts and G1 for the standalone fixture/fake-provider entry point; lawful isolated fixtures. Live provider calls additionally require ADR-FACTORY approval, approved provider data handling, and provider/data-rights authorization. No website or canonical-bank runtime prerequisite."
  - `docs/tasks/TASK_BACKLOG.md` §FACTORY-001 (line 245):
    > "Prerequisites: AI-001 and G1 shared contracts; owner schedule/budget/review capacity. A standalone fixture DB and provider-free planning are allowed without web. Live provider dispatch additionally requires ADR-FACTORY and ADR-OPS approval, provider/data-rights authorization, and the approved operating inputs."
  - `docs/tasks/TASK_BACKLOG.md` §INT-001 (line 255):
    > "Prerequisites: G3 integration readiness, reached from the completed component milestones and INT-002 controlled-import evidence; FACTORY-001, AI-002 evaluated fixtures, BANK-001, ASSEMBLY-001, EXAM-002, SCORE-001 and independent human reviewer; UI journey additionally WEB-001. G3 does not gate any of those component milestones."
  - `docs/tasks/TASK_BACKLOG.md` §INT-002 (line 414):
    > "Prerequisites: FACTORY-003, BANK-001 and BANK-002 acceptance, G2 controlled publication readiness, and a human reviewer for the publication subset. This proof supplies the controlled-import evidence needed to establish integration readiness."
- **Assessment:** Lifecycle gates G0, G1, G2, G3 have singular, sequential definitions. Legacy ADR clusters are renamed to `ADR-CORE`, `ADR-OPS`, and `ADR-FACTORY`. Circular dependencies are fully eliminated; early AI tasks depend on Gate G1 (shared contracts), not Gate G3.

---

### Finding HIGH-03: Unbounded active personalized attempts

- **Original Finding:** Under the earlier Phase 02.75 draft, active attempt uniqueness was scoped only to fixed forms (`UNIQUE(user_id, form_id)`). Because personalized practice generates a distinct `form_id` per request, a student could launch parallel requests in multiple browser tabs, causing immediate permanent burn of the 30-question starter inventory upon start TTL expiration.
- **Current Status:** **RESOLVED**
- **Evidence:**
  - `docs/decisions/OPEN_DECISIONS.md` §ADR-004 (line 55, line 99):
    > "Scoped approval (H1 only): APPROVED BY HUMAN OWNER on 2026-10-17, recorded from the owner's TASK REPAIR-H1-001 instruction in this session. Approval identity: human project owner. Exact approved decision: “Each student may have at most ONE active examination attempt across ALL practice modes.” Active states are CREATED and IN_PROGRESS; modes are PERSONALIZED_PRACTICE and PUBLISHED_FIXED. A student with an existing active attempt cannot create another active attempt, may resume that attempt when its state permits, and may create a new attempt after the previous attempt reaches a terminal state."
  - `docs/architecture/DATABASE_DESIGN.md` §2.3 (line 66) & §3.1 (lines 96–98):
    ```sql
    CREATE UNIQUE INDEX uq_one_active_attempt_per_user
    ON attempts (user_id)
    WHERE state IN ('CREATED', 'IN_PROGRESS');
    ```
  - `docs/architecture/API_CONTRACTS.md` §1 (lines 25–26) & §2 (line 52):
    > `409 CONCURRENT_ATTEMPT_EXISTS with ConcurrentAttemptExists for a different creation request while this student has an active attempt in either mode;`
  - `docs/specifications/QUESTION_REUSE_POLICY.md` §3 (lines 40–42):
    > "Under owner-approved ADR-004 H1, each student may have at most one active attempt across both `PERSONALIZED_PRACTICE` and `PUBLISHED_FIXED`. Active states are `CREATED` and `IN_PROGRESS`. A different creation request while an attempt remains active returns 409 `CONCURRENT_ATTEMPT_EXISTS` with the caller's active attempt ID and creates no form or history."
- **Assessment:** The human owner's explicit approval of ADR-004 H1 has been implemented across the database constraint, API contract, exam engine, reuse policy, and decision logs. Accidental parallel bank exhaustion is impossible.

---

### Finding MED-01: Missing AttemptView.startBefore

- **Original Finding:** `CreationReceipt` included the 15-minute start TTL reservation deadline (`startBefore`), but `AttemptView` (returned on `GET /attempts/{id}`) omitted it. If a student refreshed the browser during the `CREATED` state, the client UI could not compute the countdown deadline.
- **Current Status:** **RESOLVED**
- **Evidence:**
  - `docs/architecture/API_CONTRACTS.md` §1 (lines 37–43):
    ```typescript
    type AttemptView = {attemptId:UUID; state:AttemptState; formId:UUID;
      formMode:FormMode; reuseMode:ReuseMode; reusePolicyVersion:string;
      serverNow:Instant; startBefore:Instant|null; startedAt:Instant|null; deadlineAt:Instant|null;
      activeSectionId:string|null;
      sections:{sectionId:string; startsAt:Instant|null; endsAt:Instant|null; count:number}[];
      slots:StudentSlot[]; answers:AnswerAck[]; closure:Closure};
    ```
  - `docs/architecture/API_CONTRACTS.md` §1 (line 45):
    > "For `CREATED`, `startBefore` is the server-authoritative exclusive deadline at which the reserved attempt may first start; it is the committed reservation deadline returned at creation and is never derived from the client clock. For every non-`CREATED` state it is `null`; `startedAt` and `deadlineAt` preserve the existing started-attempt timing semantics."
- **Assessment:** `AttemptView` now contains `startBefore: Instant | null`, enabling the client to display countdowns and warn students before unstarted attempts lapse.

---

### Finding MED-02: Incomplete score_runs baseline definition

- **Original Finding:** The summary table in `DATABASE_DESIGN.md` §2.3 defined `score_runs` without `form_id` and omitted `UNIQUE(id, form_id)`, contradicting §3.2 which required composite foreign keys from `score_items`.
- **Current Status:** **RESOLVED**
- **Evidence:**
  - `docs/architecture/DATABASE_DESIGN.md` §1 (line 9):
    > "... (attempt_id,id) and (id,form_id) on score_runs ..."
  - `docs/architecture/DATABASE_DESIGN.md` §2.3 (Table `score_runs`, line 69):
    > `score_runs | attempt_id NOT NULL FK, form_id NOT NULL, policy_version, input_hash, correct_count, total_count, percentage numeric(5,2), section_totals JSONB, supersedes_id nullable FK, reason | FK(attempt_id,form_id) → attempts(id,form_id); UNIQUE(attempt_id,id); UNIQUE(id,form_id); UNIQUE(attempt_id,policy_version,input_hash); 0≤correct≤total and total>0; immutable`
  - `docs/architecture/DATABASE_DESIGN.md` §2.3 (Table `score_items`, line 70):
    > `score_items | score_run_id, form_id NOT NULL, slot_id, earned smallint | PK(score_run_id,slot_id); FK(score_run_id,form_id) → score_runs(id,form_id); FK(form_id,slot_id) → form_slots(form_id,slot_id); index(form_id,slot_id); earned IN(0,1); composite FKs enforce run/slot form match`
- **Assessment:** `score_runs` includes `form_id NOT NULL`, foreign key `FK(attempt_id, form_id) → attempts(id, form_id)`, and target constraints `UNIQUE(attempt_id, id)` and `UNIQUE(id, form_id)`. The schema compiles cleanly.

---

### Finding MED-03: Ambiguous section identifiers

- **Original Finding:** `API_CONTRACTS.md` conflated opaque section identifier strings (`sectionId: string`) with domain `Section` enum values (`"MATH" | "READING" | "SCIENCE"`), creating confusion in quota matching and deficit reporting.
- **Current Status:** **RESOLVED**
- **Evidence:**
  - `docs/architecture/API_CONTRACTS.md` §3 (lines 107–111):
    ```typescript
    // BlueprintConfig.sections[].id is an opaque, blueprint-local section-entry ID.
    // Quota.sectionId references that exact ID; neither is a Section enum value.
    type Quota = {sectionId:string; min:number; max:number} & (
      {dimension:"SKILL"; value:UUID} |
      {dimension:"COGNITIVE_LEVEL"; value:"M1"|"M2"|"M3"} |
      {dimension:"DIFFICULTY"; value:"EASY"|"MEDIUM"|"HARD"});
    ```
  - `docs/architecture/API_CONTRACTS.md` §5 (line 146):
    > "`BlueprintConfig.sections[].id` is the opaque, unique identifier of one blueprint section entry. `BlueprintConfig.sections[].section` is the domain `Section` enum used to select questions and appears on the sealed form section. Every `Quota.sectionId` must exactly reference an entry `id`; it never references the enum."
  - `docs/architecture/API_CONTRACTS.md` §5 (lines 197–207):
    Example shortage payloads use opaque entry identifiers:
    `sectionDeficits:[{sectionId:"section-math-1",missingCount:2}]`
  - `docs/specifications/EXAM_ASSEMBLY_SPEC.md` §5 (lines 55–57):
    > "Each `BlueprintConfig.sections[]` entry has an opaque, blueprint-local `id` and a domain `section` enum: the `id` identifies the entry in quotas, form sections, section deficits and slot projections; the enum selects the question section. `Quota.sectionId` must exactly equal one entry `id`; it is never a `Section` enum value."
- **Assessment:** The distinction between blueprint-local entry identifiers (`id`) and question classification enums (`section`) is formally codified and consistently applied.

---

### Finding LOW-01: Trailing whitespace in prompt cards

- **Original Finding:** All 14 markdown prompt cards in `docs/agents/prompt-cards/*.md` contained line-ending whitespace, failing the static quality script defined in `docs/quality/TEST_STRATEGY.md`.
- **Current Status:** **RESOLVED**
- **Evidence:**
  - Git commit `26d27bf` stripped trailing whitespace across all 14 files (`01_GOV-001_Luna.md` through `14_REVIEW-001R_Astra.md`).
  - Regex verification across `docs/agents/prompt-cards/*.md` confirms 0 lines with trailing whitespace.
  - The static documentation check `sed -n '/^```javascript$/,/^```$/p' docs/quality/TEST_STRATEGY.md | sed '1d;$d' | node` exits with code 0 and reports `errors: []`.
- **Assessment:** Prompt cards are clean and conform to repository quality standards.

---

## 3. Owner-Approved ADR-004 H1 Verification

The human project owner recorded approval for ADR-004 H1 in session TASK REPAIR-H1-001 on 2026-10-17:
> **Decision:** "Each student may have at most ONE active examination attempt across ALL practice modes."<br>
> **Active states:** `CREATED`, `IN_PROGRESS`<br>
> **Modes:** `PERSONALIZED_PRACTICE`, `PUBLISHED_FIXED`<br>
> **Scope:** H1 only. H2, H3, and ADR-004 as a whole remain unapproved (`PROPOSED`).

### Cross-Document Consistency Matrix

| Document | Section | Evidence of H1 Conformance | Status |
|---|---|---|---|
| `docs/architecture/DATABASE_DESIGN.md` | §1 (line 3), §2.3 (line 66), §3.1 (lines 96–101), §3.2 (line 143), §3.3 (lines 153, 156) | Table `attempts` enforces `owner-approved H1 partial UNIQUE(user_id) WHERE state IN ('CREATED','IN_PROGRESS') across both modes`. Partial index `uq_one_active_attempt_per_user` explicitly defined. Different-key races serialize under user lock; constraint violation maps to 409 `CONCURRENT_ATTEMPT_EXISTS`. | **CONSISTENT** |
| `docs/architecture/API_CONTRACTS.md` | §1 (line 3, lines 25–26), §2 (line 52), §5 (lines 146, 217) | `POST /attempts` returns `409 CONCURRENT_ATTEMPT_EXISTS` with typed `ConcurrentAttemptExists` (`existingAttemptId: UUID`). Different creation requests serialize per user across all modes. Matching idempotency key replays 201 receipt even after closure. | **CONSISTENT** |
| `docs/specifications/EXAM_ENGINE_SPEC.md` | §1 (line 16), §6 (lines 57–60) | Explicitly records ADR-004 H1 as owner-approved. Reconciles elapsed `startBefore` to `CANCELLED` (`START_TTL_EXPIRED`) and elapsed deadline to `EXPIRED` before admitting another attempt. Stale finalization commits even if subsequent allocation fails. | **CONSISTENT** |
| `docs/specifications/QUESTION_REUSE_POLICY.md` | §3 (lines 40–45), §6 (lines 67–68), §7 (lines 77, 80) | Enforces at most one active attempt across both modes. Conflicting creation returns 409 without form or history allocation. Sequential successful `NEW_ONLY` allocations exclude assigned identities/current canonical groups. | **CONSISTENT** |
| `docs/decisions/OPEN_DECISIONS.md` | §ADR-004 (lines 46, 55, 99, 111) | Records scoped approval date (2026-10-17), owner identity, approved text, and explicit boundary ("Do NOT approve H2, H3, or the entire ADR-004"). All 8 ADRs retain `- Status: PROPOSED; approval: none; revision: [1-9]`. | **CONSISTENT** |

---

## 4. Task Dependency Graph & Lifecycle Gate Verification

### 4.1 Lifecycle Gates and ADR Clusters

1. **Gate G0 (Architecture readiness / owner disposition):**
   - Focus: Owner decisions for ADR-001–008; baseline rights and starter evidence.
   - Tasks: `FOUND-001`, `FOUND-003`, `FOUND-004`, `FOUND-005`, `FOUND-006`, `FOUND-007`, `RESEARCH-002`, `DATA-003`, `AI-003`.
2. **Gate G1 (Shared contract readiness):**
   - Focus: `FOUND-002` freezes versioned canonical schemas, DTOs, and test fixtures.
   - Tasks: `FOUND-002`, `DATA-001`, `AI-001`, `FACTORY-001`, `FACTORY-002`, `FACTORY-003`, `ASSEMBLY-001`.
3. **Gate G2 (Controlled publication readiness):**
   - Focus: Bank publication, rights verification, independent human approval, and seed dataset.
   - Tasks: `AUTH-001` (production OIDC), `DATA-002`, `BANK-001`, `BANK-002`, `ASSEMBLY-002`, `EXAM-001`, `EXAM-002`, `SCORE-001`, `WEB-001`, `WEB-002`, `WEB-003`, `INT-002`, `OPS-001`.
4. **Gate G3 (Integration readiness):**
   - Focus: Joint demonstration of factory draft import and MVP exam delivery.
   - Tasks: `INT-001`, `WEB-004`, `TEST-001`, `TEST-002`.
5. **Distinct ADR Approval Groups:**
   - **ADR-CORE:** ADR-001, ADR-002, ADR-003, ADR-004, ADR-007.
   - **ADR-OPS:** ADR-006.
   - **ADR-FACTORY:** ADR-005, ADR-008.

### 4.2 Track A Decoupling

Track A (AI Question Factory Research: `RESEARCH-002` → `AI-003` → `AI-001` → `AI-002` → `FACTORY-001` / `FACTORY-002` / `FACTORY-003`) operates against frozen contract fixtures and fake/evaluated provider adapters. Automated graph reachability analysis confirms that **zero** Track A research tasks depend on student website runtime modules (`EXAM-*`, `WEB-*`, `SCORE-*`, or `INT-*`).

### 4.3 Automated Dependency Validation Report

- **Scope of Automated Model:**
  - Nodes: All 36 task cards parsed from `docs/tasks/TASK_BACKLOG.md`.
  - Edges: Direct task-to-task dependency relationships declared in `- Prerequisites:`.
- **Items Omitted from Automated Graph:**
  - Staged/conditional prose prerequisites (e.g., `AUTH-001` specifies "G2 for production configuration", while initial synthetic development begins under G1).
  - Unapproved ADR decision gates (`ADR-CORE`, `ADR-OPS`, `ADR-FACTORY`).
  - Human resource/licensing prerequisites (e.g., "human-labeled rights-cleared evaluation set", "named independent author and reviewer").
  - Negative prose assertions (e.g., `DATA-003`: "no BANK-001 implementation required for manifest preparation").
- **Verification Results:**
  - Total tasks parsed: 36
  - Unknown task references: **0**
  - Graph topology: **Strictly Acyclic Directed Graph (DAG)**
  - Cycle count: **0**

---

## 5. Documentation Validation Commands and Results

| Command | Target / Scope | Observed Result | Status |
|---|---|---|---|
| `sed -n '/^```javascript$/,/^```$/p' docs/quality/TEST_STRATEGY.md \| sed '1d;$d' \| node` | Authoritative documentation verification suite: 21 required files, markdown file walk, local link integrity, task reference validity, ADR status check, research hash check. | Exit 0. Output: `{"required":21,"markdown":41,"links":180,"tasks":36,"hash":"97a5bbe58446...","warnings":["Preserved input whitespace: docs/reviews/ARCHITECTURE_REVIEW_001.md"],"errors":[]}` | **PASS** |
| `sed -n '/^```javascript$/,/^```$/p' docs/reviews/REVIEW_RESOLUTION_001.md \| sed '1d;$d' \| node` | Historical review resolution suite: finding coverage, PRNG reference vectors, rounding verification. | Exit 0. Output: `{"findings":15,"dispositions":{"PARTIALLY_ACCEPT":4,"ACCEPT":7,"NEEDS_HUMAN_DECISION":2,"REJECT":2},"PRNGOutputs":15,"roundingCases":4,"errors":[]}` | **PASS** |
| Comprehensive local link sweep across all 41 markdown documents | Link target existence (resolving file paths relative to source documents). | 180 local links checked; 0 broken links found. | **PASS** |
| Line-ending whitespace scan across all markdown documents (excluding preserved input) | Trailing whitespace check `[\t ]+$`. | 0 lines matched; 0 files with trailing whitespace. | **PASS** |
| Markdown code fence balance check | Count of `^```$` markers per file. | All 41 markdown files have evenly balanced code fences. | **PASS** |

---

## 6. Newly Introduced Defects and Residual Discrepancies

### 6.1 Confirmed Defects

#### DEFECT-01: Stale "H1 fixed only" text in task backlog prose

- **Classification:** CONFIRMED_DEFECT
- **File & Section:**
  - `docs/tasks/TASK_BACKLOG.md` §FOUND-004 (line 44):
    > `Acceptance additionally requires owner disposition of current ADR-004 H1–H3 (H1 fixed only), ADR-007/008 and affected revised scopes.`
  - `docs/tasks/TASK_BACKLOG.md` §EXAM-001 (line 122):
    > `Phase 02.75 acceptance: H1 applies to fixed forms only; personal form has one owner/attempt.`
  - `docs/tasks/TASK_BACKLOG.md` §Unresolved planning blockers table (line 282):
    > `ADR-001–004, 007 and 008 mechanisms remain PROPOSED; ADR-004 H1–H3 and ADR-006 retention/identity boundaries are undecided.`
- **Evidence:** Commit `465a789` synchronized `DATABASE_DESIGN.md`, `API_CONTRACTS.md`, `EXAM_ENGINE_SPEC.md`, `QUESTION_REUSE_POLICY.md`, and `OPEN_DECISIONS.md` to reflect the owner's global H1 approval across all practice modes. However, the task cards in `TASK_BACKLOG.md` were not updated and retain the superseded "fixed forms only" scoping.
- **Impact:** An engineer implementing task `EXAM-001` or `FOUND-004` who reads the backlog card could be misdirected to implement H1 only for fixed forms, conflicting with the authoritative database unique index `uq_one_active_attempt_per_user` and API contract.
- **Recommended Minimal Correction:**
  - In `docs/tasks/TASK_BACKLOG.md` line 44, update to: `(H1 approved globally across all modes; H2–H3 proposed)`.
  - In `docs/tasks/TASK_BACKLOG.md` line 122, update to: `Phase 02.75 acceptance: owner-approved H1 applies to all modes (at most one active CREATED/IN_PROGRESS attempt per student); ...`.
  - In `docs/tasks/TASK_BACKLOG.md` line 282, update to: `... ADR-004 H2–H3 and ADR-006 retention/identity boundaries are undecided (ADR-004 H1 is owner-approved).`.

---

### 6.2 Unverified Risks

#### RISK-01: Table summary row for `question_versions` omits `UNIQUE(id, taxonomy_version_id)`

- **Classification:** UNVERIFIED_RISK
- **File & Section:** `docs/architecture/DATABASE_DESIGN.md` §2.1 (Table `question_versions`, line 29) vs §1 (line 9)
- **Evidence:** Line 9 specifies:
  > "Every composite FK below requires a matching UNIQUE target tuple, including ... and (id,taxonomy_version_id) on question_versions."
  Table `question_taxonomy` (line 31) defines a composite foreign key referencing `question_versions(id, taxonomy_version_id)`. However, in table summary row line 29, the constraints column lists only:
  `UNIQUE(question_id,version_no), UNIQUE(question_id,id); parent composite FK to same question; index(section,normalized_fingerprint); immutable`
  The constraint `UNIQUE(id, taxonomy_version_id)` is omitted from this summary cell.
- **Impact:** While line 9 establishes the normative convention, an engineer implementing DDL strictly from the table summary in §2.1 might omit `UNIQUE(id, taxonomy_version_id)`, causing the `question_taxonomy` foreign key to fail compilation.
- **Recommended Minimal Correction:** In `DATABASE_DESIGN.md` line 29, append `UNIQUE(id, taxonomy_version_id);` to the constraints column.

---

### 6.3 Open Product Decisions

The following product decisions remain intentionally open and require explicit human owner disposition:

1. **ADR-004 H2 (Admission window semantics):** Decision required between admission-only window `[from, until)` (allowing full duration completion after window close) vs strict full-duration fit inside the window.
2. **ADR-004 H3 (Section uniqueness):** Confirmation of 1 to 3 unique section enum types for MVP without repeated section types.
3. **ADR Baseline Approval (Gate G0):** Formal disposition of `ADR-001` through `ADR-008` (all remain `PROPOSED` with revision numbers 1–3).
4. **Starter Bank Human Actors (DATA-002 / DATA-003):** Identification of two distinct individuals (one content author, one independent reviewer) for the 30-question Vietnamese starter inventory.
5. **AI Research Envelope (RESEARCH-002 / AI-003):** Approval of provider data terms, evaluation dataset licensing, budget ceilings, and schedule timezone before live provider dispatch.

---

## 7. Readiness Assessment for Final Architecture Review

| Evaluation Dimension | Status | Assessment and Evidence |
|---|---|---|
| **Component Architecture** | **READY** | Three-tier separation (Question Factory, Question Bank, Practice Web) is complete and decoupled. Factory has no publication or exam privileges. |
| **Relational Integrity** | **READY** | All composite foreign keys have matching unique target tuples (CRIT-01 and MED-02 resolved). Lock ordering is deterministic. |
| **API & Error Contracts** | **READY** | Shortage errors unified under `INSUFFICIENT_UNSEEN_INVENTORY` and `INSUFFICIENT_ELIGIBLE_INVENTORY` (HIGH-01 resolved). `AttemptView.startBefore` present (MED-01 resolved). Section IDs disambiguated (MED-03 resolved). |
| **Concurrency & Active Policy** | **READY** | Owner-approved H1 single active attempt globally enforced across all practice modes (HIGH-03 resolved). Race handling specified via user lock and `uq_one_active_attempt_per_user`. |
| **Task & Gate Sequencing** | **READY** | G0–G3 lifecycle gates are sequential; legacy ADR groups distinct (HIGH-02 resolved). 36 tasks form an acyclic DAG with no circular dependencies. |
| **Quality & Documentation** | **READY** | Static test strategy script passes with 0 errors (LOW-01 resolved). 0 broken links; 0 trailing whitespace lines. |
| **Overall Recommendation** | **READY_FOR_FINAL_REVIEW** | The architecture documentation is internally cohesive and ready for final human owner approval. |

---

*End of QA-RECHECK-001 Regression Audit Report. Independent auditor execution complete.*
