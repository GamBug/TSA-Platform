# HUST TSA–Style AI Assessment Platform: Research, Architecture, and Implementation Blueprint

## Executive summary

The recommended project is **not a literal clone of HUST's production testing system**, but an independent **TSA-style preparation and assessment platform** whose behavior is parameterized from HUST's publicly documented Test of Scholastic Aptitude structure. That distinction matters technically, psychometrically, and legally.

As of October 15, 2026, Hanoi University of Science and Technology maintains an official TSA portal and an official **TSA 2026 handbook**, described by HUST as its official, comprehensive preparation material. The most explicit public technical specification located in this research is HUST's exam-organization document for the post-2023/2025 structure. It specifies a **100-question, 150-minute computer-based test** divided into Mathematical Thinking, Reading Comprehension, and Scientific Thinking/Problem Solving. The published blueprint gives section counts of **40/20/40 questions**, time allocations of **60/30/60 minutes**, and an M1:M2:M3 cognitive-level distribution of **4:3:3** within each section. citeturn18search0turn7view0turn18search1

HUST's published scheme describes five digital interaction forms: single-answer selection, true/false, multiple-answer selection, drag-and-drop, and answer entry. For compound interactions, the document states that all required components must be correct for the question to count as correct. citeturn7view1 HUST also states that TSA scores are calculated using **Item Response Theory (IRT)**, that equally large raw-correct counts need not receive identical scaled scores because item difficulty matters, and that anchor/bridge items are used across forms or administrations to support score comparability. The detailed operational IRT model, parameter estimates, equating transformation, post-test calibration procedure, rounding rules, and protected item-bank rules are not publicly specified in the sources reviewed. citeturn7view2turn6view0

That leads to the most important architecture decision:

> **Implement the public TSA blueprint as versioned configuration, but do not claim to reproduce HUST's official scoring algorithm.**

A production-quality platform should therefore have two scoring modes: a transparent raw-score practice mode and an independently calibrated **TSA-style IRT practice score** clearly labeled as unofficial. If sufficient pilot-response data become available, anchor-based equating can make the platform's own forms comparable over time, following the same broad psychometric principle HUST publicly describes. citeturn7view2

The recommended software architecture is initially a **modular monolith plus asynchronous workers**, rather than a premature microservice estate:

- **Next.js/React/TypeScript** candidate and authoring interfaces.
- **Python/FastAPI** application/API layer because generation, optimization, data science, and psychometrics are Python-heavy.
- **PostgreSQL** as the authoritative transactional database, optionally with `pgvector` for semantic-near-duplicate retrieval.
- **Redis** for ephemeral caching, rate limits, job state, and distributed coordination.
- An **S3-compatible object store** for source documents, images, QTI packages, and immutable export artifacts.
- **OR-Tools CP-SAT** for constrained test assembly; Google's project is Apache-2.0 licensed and supports combinatorial/constraint optimization. citeturn17search3
- Separate asynchronous AI-generation and psychometric workers.
- OIDC/OAuth-based authentication, preferably through an external identity provider such as Keycloak or another managed IdP.
- OpenTelemetry plus metrics/error tracking.
- Containers first; Kubernetes only after concurrency or operational requirements justify its cost.

The core design principle for AI is equally important: **AI authors drafts; AI never autonomously publishes operational questions.** A safe pipeline is:

**approved source → generation specification → LLM/template generation → deterministic validation → independent AI critic → similarity/leakage scan → subject-matter expert review → pilot → psychometric calibration → eligible item bank**

This is justified by the state of question-generation research. Neural question-generation work has demonstrated automatic generation from source passages, while more recent systems provide multilingual/multidomain QG pipelines; however, high textual quality is not equivalent to a valid test item. citeturn9search1turn20view0 Distractor research likewise emphasizes that distractors must be simultaneously *incorrect* and *plausible*, and recent reviews warn that automatic distractor metrics do not necessarily correspond well to actual examination behavior. citeturn19view3turn17search13

For difficulty, an LLM's M1/M2/M3 or difficulty prediction should be treated as an **authoring prior**, not psychometric truth. Final operational difficulty should come from examinee-response data: classical item statistics first, followed by an IRT calibration after an adequate pilot. HUST itself publicly states that its TSA scoring uses IRT. citeturn7view2

For interoperability, the internal item schema should be richer than any UI-specific format, with **QTI 3 import/export adapters**. 1EdTech's QTI specification is specifically designed to exchange item/test content and results among authoring systems, item banks, test-construction systems, delivery systems, and analytics/scoring engines, and QTI 3 includes accessibility and internationalization features. citeturn21search3turn21search22

Legally, the project should have a rights gate before ingestion. HUST material can be studied to understand public structure, but the official material examined here does not provide an open-content reuse license. The safe default is therefore to **not copy HUST stems, passages, figures, explanations, answer keys, branding, or proprietary-looking test forms into a commercial or public item bank without permission**. Vietnam's Intellectual Property Law was further amended by Law No. 131/2025/QH15, effective April 1, 2026, so current Vietnamese counsel should review the planned reuse model rather than relying on older summaries of copyright law. citeturn23search0turn23search1

Personal-data architecture also requires current legal review. Vietnam's Personal Data Protection Law No. 91/2025/QH15 and implementing Decree No. 356/2025/NĐ-CP both took effect January 1, 2026. citeturn22view0turn22view1 Candidate identity should consequently be separated from psychometric analytics wherever practical, data collection minimized, retention explicitly defined, and any overseas AI/cloud processing assessed before deployment.

The recommended implementation sequence is:

**public TSA blueprint → secure item-bank core → reliable candidate test engine → constrained assembly → AI-assisted authoring → pilot system → psychometric calibration → hardening and large-scale release**.

Trying to build the “AI magic” before the item lifecycle, provenance, assessment delivery, and measurement model is the tempting path, Senpai—but it is also the path most likely to produce an impressive demo and an unreliable exam system.

## HUST TSA baseline, project goals, requirements, and assumptions

The current public evidence should be treated as a **versioned reference profile**, not hard-coded forever. HUST has an official 2026 handbook, while the detailed public project documentation explains the exam structure introduced after 2023 and retained into the 2025 scheme. citeturn18search0turn6view0

**Publicly supported baseline**

| Area | Public HUST baseline to model | Certainty for this project |
|---|---|---|
| Delivery | Computer-based objective assessment | High; explicitly documented. citeturn7view2 |
| Total duration | 150 minutes | High. citeturn7view0turn18search1 |
| Mathematical Thinking | 40 questions, 60 min | High. citeturn7view0 |
| Reading Comprehension | 20 questions, 30 min | High. citeturn7view0 |
| Scientific Thinking / Problem Solving | 40 questions, 60 min | High. citeturn7view0 |
| Total | 100 questions; published structural table totals 100 points | High for blueprint. citeturn7view0 |
| Cognitive levels | M1/M2/M3, with a 4:3:3 distribution in each section | High. citeturn7view0turn7view1 |
| Reading stimulus | Public scheme describes roughly 800–1,000-word Vietnamese reading texts across science, technology, economics, engineering, industry, agriculture, finance/banking, medicine and related fields | High for the examined public scheme. citeturn7view0 |
| Item interactions | Single choice, true/false, multiple response, drag/drop, answer entry | High. citeturn7view1 |
| Compound-item scoring | Published description requires the required parts to be correct for the question to be counted correct | High. citeturn7view1 |
| Score methodology | HUST says TSA uses IRT and reports on a 100-point scale | High at conceptual level. citeturn7view2 |
| Equating | Anchor/bridge questions across forms/administrations | High at conceptual level. citeturn7view2 |
| Exact IRT family and coefficients | Not specified in the public sources reviewed | **Unspecified** |
| Exact raw-to-scaled transformation | Not specified publicly in the sources reviewed | **Unspecified** |
| Exact item-type proportions | Not established by the sources reviewed | **Unspecified** |
| Backtracking/navigation between sections | Not established by the sources reviewed | **Unspecified** |
| Pause/reconnection policy | Not established by the sources reviewed | **Unspecified** |
| Operational anchor count and identities | Protected/not publicly specified | **Unspecified** |
| Exposure-control algorithm | Not publicly specified | **Unspecified** |
| Accommodation policy details to reproduce | Not established in the technical sources reviewed | **Unspecified** |

For a 4:3:3 split, the natural configurable interpretation produces 16/12/12 M1/M2/M3 questions in each 40-item section and 8/6/6 in the 20-item reading section. This arithmetic should be represented in a `blueprint_version`, rather than buried in application code.

**Project objectives.** The platform should provide an independent TSA-style environment in which students can take realistic full mock tests and targeted practice; teachers and SMEs can author, review, pilot, calibrate, publish, retire, and analyze items; AI can produce grounded candidate items and distractors; psychometricians can measure and calibrate them; and an assembly engine can produce new forms satisfying explicit content and statistical constraints.

It should additionally preserve enough provenance to answer a deceptively important question for every production item: **Where did this come from, who changed it, which model touched it, what evidence supports its answer, who approved it, which examinees have seen it, and which version appeared on each form?**

The primary project constraints are:

1. The exact operational HUST scoring and security machinery is not public, so the system can reproduce the public structure but cannot honestly claim numerical identity with official TSA scoring.
2. HUST's published examples are useful construct references but should not automatically become a training corpus.
3. No expected candidate concurrency, latency SLA, budget, cloud provider, or availability requirement has been specified.
4. Psychometric calibration requires real response data; an LLM cannot manufacture defensible IRT item parameters.
5. AI output can contain factual, mathematical, linguistic, or answer-key errors. NIST's Generative AI profile treats generative-AI risks as lifecycle risks requiring governance, measurement, evaluation, and management rather than assuming generated content is trustworthy. citeturn22view5

**Functional requirements**

The candidate application should support full mock tests, section practice, targeted practice, five interaction types, stimuli shared by multiple items, mathematical notation, tables/figures, answer flagging, autosaving, server-authoritative timers, reconnection, submission confirmation, result reports, and optionally explanations after release.

The author/reviewer application should support source registration, stimulus creation, manual authoring, AI generation, version comparison, metadata/tag editing, answer-key validation, reviewer queues, comments, lifecycle transitions, duplicate detection, pilot allocation, statistical dashboards, and item retirement.

The assessment-management application should support blueprint versions, rule configuration, assembly previews, solver diagnostics, test-form sealing, form versioning, scheduled mock administrations, score releases, anchor configuration, invalid-item handling, and auditing.

The AI subsystem should support generation by section/skill/M-level/item type, constrained distractor generation, source-grounded explanations, duplicate detection, automated validation, estimated difficulty, and automatic recommendation of bank items for a desired test blueprint.

The psychometrics subsystem should support raw-response exports, CTT statistics, IRT calibration experiments, item-fit inspection, DIF/fairness analysis where legally and statistically appropriate, anchor linking, form information curves, calibration snapshots, and score-transform versioning.

**Proposed nonfunctional targets — assumptions, not HUST requirements**

| Dimension | Recommended initial engineering target |
|---|---|
| Availability | 99.9% during scheduled mock-test windows |
| Candidate reads | p95 ≤ 300 ms within selected hosting region |
| Response autosave | p95 ≤ 500 ms excluding client network conditions |
| AI generation | Asynchronous; do not place it on candidate exam request paths |
| Scalability | Stateless API replicas; benchmark at ≥2× forecast concurrent-candidate load once forecast is known |
| Data durability | Managed PostgreSQL PITR plus tested backups |
| Suggested starting recovery targets | RPO 15 min; RTO 1 hour, pending business requirements |
| Accessibility | WCAG 2.2 AA engineering target |
| Security | OWASP ASVS-driven requirements plus API Top 10 threat tests |
| Auditability | Append-only privileged-action log with actor, timestamp, object/version and reason |
| Reproducibility | Pin prompt/model/config/calibration/blueprint versions for every generated item and form |

WCAG 2.2 is the W3C-recommended current WCAG 2.x target and includes criteria relevant to keyboard interaction, dragging alternatives, target size, accessible authentication, and other issues especially important in an assessment application. citeturn22view4 OWASP ASVS is explicitly intended as both a secure-development requirements source and a basis for testing web-application security controls. citeturn22view2

## System architecture, datasets, database model, and provenance

The most appropriate first architecture is a **modular monolith for transactional assessment functions with separately scalable workers for AI, test assembly, and psychometrics**. This keeps attempt/scoring/item-release transactions understandable while allowing expensive workloads to scale independently.

```mermaid
flowchart TB
    subgraph Clients
        CAND[Candidate Web App]
        AUTHOR[Author / Reviewer Console]
        ADMIN[Psychometrics / Admin Console]
    end

    subgraph Edge
        CDN[CDN / WAF]
        BFF[API Gateway / BFF]
        IDP[OIDC Identity Provider]
    end

    subgraph Core["Assessment Core"]
        AUTHZ[Authorization / Policy]
        ATTEMPT[Attempt & Timer Module]
        DELIVERY[Item Delivery Module]
        SCORE[Scoring Module]
        BANK[Item Bank Module]
        BLUEPRINT[Blueprint Module]
        FORM[Test Form Module]
        REVIEW[Review Workflow]
        AUDIT[Audit Module]
    end

    subgraph Intelligence["Asynchronous Intelligence"]
        AI[AI Authoring Worker]
        VALIDATE[Validation Pipeline]
        RETRIEVE[Retrieval / Similarity]
        ASSEMBLY[Test Assembly Solver]
        PSY[Psychometrics Worker]
    end

    subgraph Data
        PG[(PostgreSQL)]
        REDIS[(Redis)]
        OBJ[(Object Storage)]
        VEC[(Vector Index / pgvector)]
        WH[(Analytics Warehouse\noptional)]
    end

    subgraph External["Controlled External Dependencies"]
        LLM[LLM Provider or\nSelf-hosted Model]
        SOURCES[Approved Source Corpus]
        OBS[Observability / Alerting]
    end

    CAND --> CDN --> BFF
    AUTHOR --> CDN
    ADMIN --> CDN
    BFF <--> IDP
    BFF --> AUTHZ

    AUTHZ --> ATTEMPT
    AUTHZ --> BANK
    AUTHZ --> BLUEPRINT
    AUTHZ --> FORM
    AUTHZ --> REVIEW

    ATTEMPT --> DELIVERY
    ATTEMPT --> SCORE
    DELIVERY --> FORM
    FORM --> BANK

    BANK --> PG
    FORM --> PG
    ATTEMPT --> PG
    SCORE --> PG
    REVIEW --> PG
    AUDIT --> PG

    BFF --> REDIS
    BANK --> OBJ

    SOURCES --> AI
    AI --> LLM
    AI --> VALIDATE
    VALIDATE --> RETRIEVE
    RETRIEVE --> VEC
    VALIDATE --> REVIEW
    REVIEW --> BANK

    BLUEPRINT --> ASSEMBLY
    BANK --> ASSEMBLY
    ASSEMBLY --> FORM

    ATTEMPT --> PSY
    PSY --> PG
    PSY --> WH
    PSY --> BANK

    BFF --> OBS
    AI --> OBS
    ASSEMBLY --> OBS
    PSY --> OBS
```

The critical data flow is deliberately one-way around publication:

```text
Approved/owned source
        ↓
Rights + provenance registration
        ↓
Content extraction / synthetic scenario specification
        ↓
AI or deterministic item generation
        ↓
Schema validation
        ↓
Answer verification / solver checks
        ↓
Grounding + contradiction checks
        ↓
Duplicate / leakage checks
        ↓
Human SME review
        ↓
Pilot-only item
        ↓
Real examinee responses
        ↓
Psychometric calibration
        ↓
Operational eligibility
        ↓
Constrained form assembly
        ↓
Candidate responses
        ↓
Scoring + analytics
```

There should be **no direct edge from `AI generation` to `published item`**.

A rights-aware source catalogue should precede every AI ingestion operation:

| Source field | Purpose |
|---|---|
| `source_id` | Immutable internal identifier |
| `source_type` | HUST-public-reference, licensed book, OER, paper, synthetic, staff-authored, etc. |
| `title` / `publisher` | Attribution |
| `canonical_uri` | Reproducibility |
| `rights_status` | `OWNED`, `LICENSED`, `OPEN_LICENSE`, `PUBLIC_DOMAIN`, `REFERENCE_ONLY`, `UNKNOWN` |
| `license_spdx_or_text` | Machine-readable where possible |
| `allowed_uses` | Generation, training, retrieval, display, quotation, none |
| `effective_from/to` | License validity |
| `content_hash` | Detect later mutation |
| `ingested_by` / `approved_by` | Accountability |
| `legal_notes` | Restrictions |
| `source_version_id` | Frozen source snapshot |

`UNKNOWN` should behave as deny-by-default for production generation.

**Canonical item dataset**

Rather than making each item type a bespoke database table, use a normalized relational core plus typed `JSONB` interaction specifications. This provides integrity for important relationships while retaining flexibility for QTI-like interactions.

| Metadata group | Recommended fields |
|---|---|
| Identity | `item_id`, `item_version_id`, `version_no`, `parent_version_id` |
| Lifecycle | `status`, `security_class`, `created_at`, `published_at`, `retired_at` |
| Construct | `section`, `domain`, `topic`, `skill`, `subskill`, `m_level` |
| Presentation | `language`, `stem`, `stimulus_id`, `interaction_type`, `interaction_spec` |
| Correctness | `answer_key`, `scoring_policy`, `solution`, `validator_evidence` |
| Authoring | `author_type`, `author_user_id`, `generation_run_id` |
| Difficulty prior | `predicted_m_level`, `predicted_difficulty`, `prediction_confidence` |
| Timing | `expected_time_seconds`, empirical timing quantiles |
| CTT | `p_value`, `point_biserial`, option-selection frequencies |
| IRT | `irt_model`, `a`, `b`, optional additional parameters, standard errors, calibration run |
| Fairness | DIF statistics and review state where available |
| Exposure | eligible administrations, exposure cap, usage aggregates |
| Provenance | source IDs, source spans, hashes, rights state |
| Review | reviewers, rubric scores, comments, decision |
| Quality | ambiguity flags, duplicate cluster, automated validator versions |
| Reproducibility | model ID, prompt template version, generation parameters, seed |
| Integrity | version checksum/signature |

HUST's public scoring description is compatible with storing an item as a **binary scored observation** in TSA mode even where the UI contains multiple subparts, because the public specification says all required components of such questions must be correct for the question to count correct. citeturn7view1 The schema can still support partial-credit policies for non-TSA products.

A sensible item lifecycle is:

```text
DRAFT
  → AUTO_VALIDATED
  → HUMAN_REVIEW
  → PILOT_ELIGIBLE
  → PILOTED
  → CALIBRATED
  → OPERATIONAL_ELIGIBLE
  → PUBLISHED
  → RETIRED

Any state → QUARANTINED
```

Published versions should be immutable. Editing a published question creates a new `item_version`. A historical attempt always points to the exact version delivered at test time, never to “the current item.”

**Relational model**

```mermaid
erDiagram
    USER {
        uuid user_id PK
        string email
        string status
        datetime created_at
    }

    ROLE {
        uuid role_id PK
        string code
    }

    USER_ROLE {
        uuid user_id FK
        uuid role_id FK
    }

    SOURCE {
        uuid source_id PK
        string source_type
        string rights_status
        string canonical_uri
    }

    SOURCE_VERSION {
        uuid source_version_id PK
        uuid source_id FK
        string content_hash
        string license
        datetime captured_at
    }

    STIMULUS {
        uuid stimulus_id PK
        string language
        text content
        uuid source_version_id FK
    }

    ITEM {
        uuid item_id PK
        string security_class
        datetime created_at
    }

    ITEM_VERSION {
        uuid item_version_id PK
        uuid item_id FK
        int version_no
        uuid stimulus_id FK
        string section
        string interaction_type
        string m_level
        text stem
        json interaction_spec
        json answer_key
        string status
        string checksum
    }

    ITEM_PROVENANCE {
        uuid provenance_id PK
        uuid item_version_id FK
        uuid source_version_id FK
        json source_spans
        string transformation
    }

    TAG {
        uuid tag_id PK
        string namespace
        string value
    }

    ITEM_TAG {
        uuid item_version_id FK
        uuid tag_id FK
    }

    AI_RUN {
        uuid generation_run_id PK
        string model_id
        string prompt_version
        json parameters
        string input_hash
        datetime created_at
    }

    REVIEW {
        uuid review_id PK
        uuid item_version_id FK
        uuid reviewer_id FK
        string decision
        json rubric
    }

    CALIBRATION_RUN {
        uuid calibration_run_id PK
        string model_type
        json configuration
        datetime created_at
    }

    ITEM_PARAMETER {
        uuid item_parameter_id PK
        uuid item_version_id FK
        uuid calibration_run_id FK
        float discrimination
        float difficulty
        json diagnostics
    }

    BLUEPRINT {
        uuid blueprint_id PK
        int version
        string name
        json constraints
    }

    TEST_FORM {
        uuid form_id PK
        uuid blueprint_id FK
        string state
        string form_hash
        datetime sealed_at
    }

    FORM_ITEM {
        uuid form_id FK
        uuid item_version_id FK
        int ordinal
        string section
    }

    ATTEMPT {
        uuid attempt_id PK
        uuid user_id FK
        uuid form_id FK
        datetime started_at
        datetime deadline_at
        string state
    }

    RESPONSE {
        uuid response_id PK
        uuid attempt_id FK
        uuid item_version_id FK
        json response_value
        datetime saved_at
        int revision
    }

    SCORE_RESULT {
        uuid score_id PK
        uuid attempt_id FK
        string scoring_version
        float raw_score
        float ability_estimate
        float scaled_score
    }

    AUDIT_EVENT {
        uuid audit_id PK
        uuid actor_id FK
        string action
        string object_type
        uuid object_id
        datetime occurred_at
    }

    USER ||--o{ USER_ROLE : has
    ROLE ||--o{ USER_ROLE : grants

    SOURCE ||--o{ SOURCE_VERSION : versions
    SOURCE_VERSION ||--o{ STIMULUS : supports
    ITEM ||--o{ ITEM_VERSION : versions
    STIMULUS o|--o{ ITEM_VERSION : contextualizes
    ITEM_VERSION ||--o{ ITEM_PROVENANCE : records
    SOURCE_VERSION ||--o{ ITEM_PROVENANCE : originates
    ITEM_VERSION ||--o{ ITEM_TAG : tagged
    TAG ||--o{ ITEM_TAG : classifies
    ITEM_VERSION ||--o{ REVIEW : reviewed
    USER ||--o{ REVIEW : performs
    CALIBRATION_RUN ||--o{ ITEM_PARAMETER : estimates
    ITEM_VERSION ||--o{ ITEM_PARAMETER : receives
    BLUEPRINT ||--o{ TEST_FORM : creates
    TEST_FORM ||--o{ FORM_ITEM : contains
    ITEM_VERSION ||--o{ FORM_ITEM : selected
    USER ||--o{ ATTEMPT : takes
    TEST_FORM ||--o{ ATTEMPT : instantiates
    ATTEMPT ||--o{ RESPONSE : contains
    ITEM_VERSION ||--o{ RESPONSE : answers
    ATTEMPT ||--o{ SCORE_RESULT : produces
    USER ||--o{ AUDIT_EVENT : acts
```

A generation run should be linked explicitly to item provenance even if the Mermaid diagram omits that edge for readability. At minimum, retain the model identifier, provider/self-hosted deployment, prompt template hash, decoding parameters, retrieval corpus versions, safety/validation versions, and input hashes.

**Example generated item object**

This example is intentionally synthetic rather than copied from HUST. It is in English for this report; a production TSA profile would normally use `vi-VN`.

```json
{
  "item_id": "itm_01JX9K2M4Z9X8Y",
  "version": 1,
  "status": "HUMAN_REVIEW",
  "language": "en-US",
  "section": "SCIENTIFIC_THINKING",
  "domain": "data_reasoning",
  "skills": [
    "linear_relationship",
    "interpolation_extrapolation",
    "quantitative_reasoning"
  ],
  "target_m_level": "M2",
  "interaction_type": "SINGLE_CHOICE",
  "stimulus": {
    "type": "table",
    "content": {
      "headers": ["Depth (m)", "Pressure (kPa)"],
      "rows": [
        [0, 101.3],
        [5, 150.3],
        [10, 199.4]
      ]
    }
  },
  "stem": "The measurements are approximately linear over the observed range. Using this relationship, what pressure is expected at a depth of 12 m?",
  "options": [
    {
      "id": "A",
      "text": "209.2 kPa",
      "misconception": "uses an incorrect slope"
    },
    {
      "id": "B",
      "text": "219.0 kPa"
    },
    {
      "id": "C",
      "text": "239.2 kPa",
      "misconception": "adds the 10 m pressure increase twice"
    },
    {
      "id": "D",
      "text": "300.7 kPa",
      "misconception": "adds absolute readings instead of changes"
    }
  ],
  "answer_key": {
    "correct_option_ids": ["B"]
  },
  "solution": {
    "method": "The increase is about 9.81 kPa per metre. 101.3 + 12 × 9.81 ≈ 219.0 kPa."
  },
  "provenance": {
    "mode": "SYNTHETIC",
    "external_source_ids": [],
    "copyright_reuse": false
  },
  "ai_generation": {
    "generator_class": "instruction_llm",
    "prompt_template": "science-item-v7",
    "validators_required": [
      "schema",
      "numeric_solver",
      "answer_uniqueness",
      "semantic_duplicate",
      "language",
      "human_sme"
    ]
  }
}
```

The production bank should also be exportable into an external assessment interchange format. QTI is well suited to this boundary because 1EdTech defines it specifically for exchanging items, tests and results among authoring, banking, delivery and scoring systems. citeturn21search3 QTI 3's accessibility capabilities are another reason not to invent an irreversible proprietary representation. citeturn21search22

## AI generation, difficulty calibration, distractors, item-bank intelligence, and human review

The AI subsystem should be designed around **construct-constrained generation**, not “ask an LLM to write a TSA question.”

Research in neural QG has long shown that end-to-end models can generate questions conditioned on passages, and newer open-source tooling such as `lmqg` exposes QG/QAG training and evaluation pipelines. citeturn9search1turn20view0 However, the current `lmqg` repository lists built-in support for English, French, Japanese, Korean, Russian, Italian, Spanish, German and Chinese—not Vietnamese—so it is best viewed here as reusable architecture/evaluation code rather than a turnkey Vietnamese TSA generator. citeturn20view0

A production system should therefore make the model interface pluggable:

```text
GenerationProvider
 ├── HostedLLMProvider
 ├── SelfHostedLLMProvider
 ├── FineTunedQGProvider
 └── DeterministicTemplateProvider
```

This prevents the item-bank domain model from depending on whichever LLM is fashionable at the time.

**Generation pipeline**

```mermaid
flowchart LR
    A[Blueprint Need] --> B[Select Eligible Source]
    B --> C[Rights Gate]
    C --> D[Build Item Specification]

    D --> E1[Math Hybrid Generator]
    D --> E2[Reading Grounded Generator]
    D --> E3[Science Scenario Generator]

    E1 --> F[Candidate Item JSON]
    E2 --> F
    E3 --> F

    F --> G1[Schema Validator]
    F --> G2[Answer Validator]
    F --> G3[Grounding Validator]
    F --> G4[Language / Ambiguity Critic]
    F --> G5[Similarity / Leakage Scan]
    F --> G6[Difficulty / M-Level Estimator]

    G1 --> H{All hard checks pass?}
    G2 --> H
    G3 --> H
    G4 --> H
    G5 --> H

    H -- No --> R[Reject / Regenerate]
    H -- Yes --> SME[Human SME Review]

    SME -- Reject --> R
    SME -- Revise --> F
    SME -- Approve --> PILOT[Pilot Bank]

    PILOT --> DATA[Candidate Responses]
    DATA --> CTT[CTT Diagnostics]
    CTT --> IRT[IRT Calibration]
    IRT --> PSY[Psychometric Review]

    PSY -- Pass --> OP[Operational-Eligible Bank]
    PSY -- Fail --> RET[Revise / Retire / Re-pilot]
```

**Generation strategy by section**

| Section | Recommended generation approach | Why |
|---|---|---|
| Mathematical Thinking | Hybrid deterministic templates + symbolic computation + LLM language variation | Mathematical correctness is easier to guarantee when numbers/solutions originate in code rather than free-form generation |
| Reading Comprehension | Rights-approved source/RAG → answer/evidence selection → question → distractors → entailment validation | Makes every correct answer traceable to evidence |
| Scientific Thinking / Problem Solving | Synthetic or licensed scenario → deterministic dataset/chart generation → reasoning question → numeric/logical validator | Supports tables, graphs and realistic scenarios while reducing factual hallucination |

For mathematics, the generator should ideally produce **solution first, then stem and distractors**, with symbolic or numerical checks confirming the key. A computer algebra layer such as SymPy can verify equations, simplify expressions, test equivalence and evaluate numeric outcomes.

For reading items, store explicit evidence spans. An item should fail automatic validation when the correct response cannot be supported from the intended passage, or when another choice is also defensible.

For science/problem-solving questions, prefer synthetic datasets or properly licensed public datasets. Generated data should be deterministic from a seed and verified by code before an LLM writes the surrounding scenario.

**Distractor generation deserves a separate pipeline.** The EDGE work on automatic distractor generation frames the core requirement precisely: distractors need to be wrong while remaining sufficiently plausible, and its model conditions on passage, question and correct answer. citeturn19view3 A broader EMNLP survey covers retrieval, ranking, neural and pretrained-model approaches and demonstrates how broad the distractor-generation problem has become. citeturn19view2 More recent work on mathematics also finds substantial room for improvement in predicting the actual misconceptions that cause students to choose incorrect answers. citeturn17search19

Therefore generate distractors from **misconception classes**, not arbitrary semantic similarity:

```text
Correct solution
    ↓
Identify reasoning steps
    ↓
Enumerate likely misconception/error transformations
    ↓
Generate one candidate per misconception
    ↓
Verify every candidate is false
    ↓
Check lexical/length/style balance
    ↓
Check no accidental second solution
    ↓
Pilot
    ↓
Measure actual option attraction
```

Examples for mathematics include sign reversal, denominator inversion, premature rounding, wrong formula substitution, unit conversion, off-by-one counting, confusing average with sum, or using an intermediate result.

For reading, distractor families could include true-but-irrelevant, partially supported, reversed causal relationship, over-generalization, under-generalization, and evidence from the wrong paragraph.

The distractor evaluation hierarchy should be:

1. **correctness safety:** zero accidentally correct distractors;
2. **plausibility:** SME rating;
3. **distinctness:** no paraphrase duplicates;
4. **linguistic balance:** avoid answer-length/style leakage;
5. **empirical functionality:** after pilot, whether lower-ability respondents actually select the distractor;
6. **item discrimination:** whether the complete item separates ability appropriately.

Do not optimize primarily for BLEU, ROUGE, or similarity against reference distractors. The 2025 review of automated distractor evaluation explicitly notes a lack of consensus and warns that commonly used automated measures are often poorly aligned with actual exam performance. citeturn17search13

**Difficulty should have three different concepts.**

`target_difficulty` is what the author asks for.

`predicted_difficulty` is what an AI/ML system estimates before use.

`calibrated_difficulty` is what response data support after pilot.

Never overwrite one with another.

An initial authoring model can estimate M1/M2/M3 using:

- cognitive-operation labels;
- number of reasoning steps;
- abstraction requirements;
- computation length;
- stimulus length;
- number of constraints;
- vocabulary complexity;
- similarity to human-labeled items;
- subject-matter expert features.

Its evaluation should use a held-out expert-labeled set and report exact agreement, adjacent-class accuracy, confusion matrix, and preferably an ordinal agreement statistic such as weighted Cohen's κ.

But **predicted difficulty must not decide operational difficulty by itself**.

After pilot:

\[
p_i=\frac{\text{number correct on item }i}{\text{number attempting }i}
\]

provides an initial classical difficulty statistic, while point-biserial correlation gives a basic discrimination signal. Then fit an IRT model.

For a platform-controlled 2PL practice model:

\[
P_i(\theta)=\frac{1}
{1+\exp[-a_i(\theta-b_i)]}
\]

where \(a_i\) is discrimination, \(b_i\) difficulty and \(\theta\) examinee ability.

Its item-information function is:

\[
I_i(\theta)=a_i^2P_i(\theta)(1-P_i(\theta))
\]

and a form's test information is:

\[
I_T(\theta)=\sum_{i\in T}I_i(\theta)
\]

This gives the assembly system something much more useful than “20% hard questions”: it can target measurement precision across a range of abilities.

This **does not assert HUST uses a 2PL model**. HUST's public document establishes IRT use, but the exact model is unspecified. citeturn7view2 `py-irt` can be useful for research/prototyping: its current repository provides Bayesian 1PL, 2PL and 4PL implementations under the MIT license; it does not currently make a complete replica of HUST scoring possible. citeturn21search2

A calibration snapshot should therefore store:

```json
{
  "calibration_run_id": "cal_2027_spring_003",
  "model": "2PL",
  "response_population": "pilot_cohort_2027_03",
  "linked_to": "scale_2027_base",
  "anchor_set_version": "anchor_v2",
  "estimation_code_version": "psychometrics-1.4.2",
  "item_parameters": {
    "itm_01JX9K2M4Z9X8Y:v1": {
      "a": 1.18,
      "b": 0.37,
      "standard_errors": {
        "a": 0.11,
        "b": 0.08
      }
    }
  }
}
```

Before publishing an item, the human workflow should require:

| Gate | Reviewer | Example acceptance condition |
|---|---|---|
| Rights | Content/legal owner | Source authorized |
| Content | SME | Correct, relevant, no ambiguity |
| Construct | Assessment specialist | Measures intended skill/M level |
| Language | Vietnamese-language reviewer | Natural and age-appropriate |
| Technical | Automated + QA | UI interaction and key behave correctly |
| Psychometric | Psychometrician | Pilot statistics acceptable |
| Security | Bank manager | No known leakage/exposure issue |

For secure banks, the author should generally not be the sole approver.

**AI evaluation dashboard**

| Stage | Metrics that matter |
|---|---|
| Question generation | key correctness, answerability, source-support rate, ambiguity rate, SME acceptance, novelty |
| M-level classification | exact agreement, adjacent agreement, weighted κ |
| Distractors | accidental-correct rate, SME plausibility, duplicate rate, empirical option-selection rate |
| Grounding | unsupported-claim rate, evidence-span agreement |
| Similarity | nearest-neighbor similarity, paraphrase/leak flags |
| Pilot item | p-value, point-biserial, time distribution, omit rate |
| IRT | discrimination, difficulty, parameter SE, item fit, information |
| Fairness | relevant DIF statistics plus human investigation |
| Complete form | blueprint violations, information deviation, exposure, content overlap |
| AI operations | cost/item, generation latency, rejection rate, model-version drift |

The `lmqg` project's own evaluation tooling reports BLEU, ROUGE-L, METEOR, BERTScore and MoverScore, illustrating useful language-generation diagnostics, but these should sit below correctness and psychometric validity for this use case. citeturn20view0

## Test assembly, scoring, web stack, API design, authentication, and deployment

Automated test assembly is a mature optimization problem, not something that needs to be invented around an LLM. Van der Linden's foundational review covers heuristic assembly, 0-1 linear programming, network flow and optimal-design approaches to test assembly, including IRT-based assembly. citeturn21search4 The `eatATA` work likewise implements automated test assembly using mixed-integer programming solvers. citeturn21search1

The platform should implement **three layers**, using the lower layer as a fallback and the higher layers to improve quality.

**Rule-based assembly**

Use for early MVP and solver fallback.

```text
function assemble_greedy(blueprint, item_bank, candidate_id):
    pool = filter item_bank where:
        status == OPERATIONAL_ELIGIBLE
        section is requested
        security restrictions pass
        rights restrictions pass
        item not excluded
        exposure below cap
        candidate has not seen item when required

    selected = []

    while selected.count < blueprint.total_items:
        deficits = compute_blueprint_deficits(selected, blueprint)

        feasible = items in pool that:
            do not violate hard constraints if added
            do not violate enemy-item rules
            do not duplicate selected stimulus unless allowed

        for item in feasible:
            utility[item] =
                content_deficit_reduction(item, deficits)
              + difficulty_fit(item, blueprint)
              + information_gain(item, blueprint)
              - exposure_penalty(item)
              - semantic_overlap_penalty(item, selected)

        best = argmax(utility)
        selected.append(best)
        pool.remove(best)

    if not all_constraints_satisfied(selected):
        fail with diagnostic

    return selected
```

If there are \(N\) candidates and \(C\) indexed constraint checks, filtering is roughly \(O(NC)\); sorting/ranking produces an \(O(N\log N)\)-class component. Recomputing all semantic relations naively can become \(O(N^2)\), so semantic “enemy pairs” should be precomputed offline.

Greedy assembly is simple and debuggable but can enter a dead end: selecting a locally attractive item can make a later content quota impossible.

**Constraint/optimization assembly**

For production, represent eligible items with binary variables:

\[
x_i =
\begin{cases}
1 & \text{item }i\text{ is selected}\\
0 & \text{otherwise}
\end{cases}
\]

Total size:

\[
\sum_i x_i=100
\]

Public TSA-style section constraints:

\[
\sum_{i\in Math} x_i=40
\]

\[
\sum_{i\in Reading} x_i=20
\]

\[
\sum_{i\in Science}x_i=40
\]

For the documented 4:3:3 Math pattern:

\[
\sum_{i\in Math,M1}x_i=16,\quad
\sum_{i\in Math,M2}x_i=12,\quad
\sum_{i\in Math,M3}x_i=12
\]

with analogous 8/6/6 constraints for Reading and 16/12/12 for Science. The underlying public ratios are documented by HUST. citeturn7view0

A psychometric objective can minimize deviation from a desired test-information curve:

\[
\min
\sum_{\theta \in \Theta}
w_\theta
\left|
\sum_i I_i(\theta)x_i-
I^{target}(\theta)
\right|
+
\lambda_E\sum_i exposure_i x_i
+
\lambda_D D(x)
\]

where \(D(x)\) penalizes undesirable semantic/content overlap.

Other constraints should include:

```text
min/max topic quotas
required skill coverage
stimulus bundle rules
maximum items per source
maximum exposure
no previously seen candidate items
enemy-item exclusions
anchor-item requirements
estimated total reading load
expected section-completion time
asset/device compatibility
accessibility restrictions
security classification
```

For a pair of enemy items \(i,j\):

\[
x_i+x_j\leq1
\]

OR-Tools CP-SAT is a strong fit for this layer and is available under Apache License 2.0. citeturn17search3

General 0-1 constrained optimization can have exponential worst-case search behavior, so engineering should not send the complete million-item bank directly to the solver. First use database/index filters to reduce the candidate set, then solve; configure a time limit; and retain a deterministic greedy fallback.

A useful pattern is:

```text
full bank
  ↓ SQL eligibility filter
20,000 eligible
  ↓ construct + exposure prefilter
2,000 candidates
  ↓ semantic diversity / top-k screening
500–1,000 solver candidates
  ↓ CP-SAT
100-item form
```

**ML-assisted assembly** should not replace the optimizer. It should estimate properties that improve its objective:

```text
item → ML predictions:
    SME acceptance probability
    likely M-level
    provisional difficulty
    expected response time
    exposure/leakage risk
    semantic cluster
             ↓
    CP-SAT hard constraints
             ↓
        legal form
```

This division is important. ML can say which item seems desirable; the solver decides whether a combination is legal.

A future adaptive-practice mode could select items based on estimated information near the current \(\theta\), but that should be a distinct product mode. The public HUST sources reviewed describe a fixed 100-question structure and IRT scoring, not evidence that the live TSA is a computer-adaptive test. Do **not** label adaptive delivery as a HUST feature. citeturn7view0turn7view2

**Scoring architecture**

Use two explicit score families:

```text
Practice Raw
  response → item scoring policy → correct/incorrect → section/raw totals

Calibrated Practice
  response → binary item outcomes
           → frozen item parameters
           → ability estimate θ
           → platform-specific scale transform
           → unofficial TSA-style practice score
```

The UI should state:

> “This score is generated by this practice platform and is not an official HUST TSA score.”

Anchor items can connect successive platform calibrations, consistent with the general approach HUST publicly describes, but the platform's anchor set and coefficients are independent. citeturn7view2

**Recommended application stack**

| Layer | Primary recommendation | Alternative | Rationale |
|---|---|---|---|
| Web UI | Next.js + React + TypeScript | Vue/Nuxt | Mature typed web ecosystem |
| UI state | React Query + local reducer/state machine | Redux Toolkit | Explicit server/client state separation |
| API | FastAPI/Python | Django + DRF | Python-native AI, optimization, statistics |
| Contracts | OpenAPI + generated TypeScript clients | GraphQL | Assessment workflows map naturally to explicit commands/resources |
| Main DB | PostgreSQL | — | Transactions + JSON + analytical flexibility |
| Similarity | pgvector initially | dedicated vector store later | Avoid extra infrastructure until scale demands it |
| Cache/coordination | Redis | managed equivalent | Ephemeral state only |
| Jobs | Celery/Dramatiq/RQ class of queue | cloud-native queue | Remove AI/assembly/calibration from request paths |
| Optimization | OR-Tools CP-SAT | MILP solver | Strong constrained-assembly fit; Apache-2.0. citeturn17search3 |
| Object storage | S3-compatible store | cloud blob storage | Immutable assets and exports |
| Identity | OIDC provider | managed identity service | Avoid custom password/session security |
| Interchange | QTI 3 adapters | internal JSON only for MVP | Standards-based assessment portability. citeturn21search3 |
| Observability | OpenTelemetry + metrics/logs/traces | managed APM | Cross-worker traceability |
| Local deployment | Docker Compose | dev containers | Easy reproducible stack |
| Production | Managed containers first | Kubernetes at higher scale | Minimize initial platform complexity |

Do not split the API into ten deployable microservices on day one. Keep clear modules and interfaces so `ai-worker`, `psychometrics-worker`, and possibly `assembly-worker` can be isolated, while candidate attempts, item versions, blueprints, forms and responses initially share a transactional application.

**API surface**

| Method | Endpoint | Purpose | Minimum role |
|---|---|---|---|
| `GET` | `/v1/blueprints` | List visible blueprint versions | staff |
| `POST` | `/v1/blueprints` | Create blueprint | assessment-admin |
| `GET` | `/v1/items` | Search item bank | author/reviewer |
| `POST` | `/v1/items` | Manual draft creation | author |
| `POST` | `/v1/items/generations` | Launch AI generation job | author |
| `POST` | `/v1/items/{id}/versions` | Create new item version | author |
| `POST` | `/v1/item-versions/{id}/reviews` | Review item version | reviewer |
| `POST` | `/v1/item-versions/{id}/publish` | Controlled state transition | bank-manager |
| `POST` | `/v1/calibration-runs` | Start psychometric calibration | psychometrician |
| `POST` | `/v1/forms/assemblies` | Assemble test | assessment-admin |
| `GET` | `/v1/forms/{id}` | Administrative form detail | authorized staff |
| `POST` | `/v1/forms/{id}/seal` | Freeze operational form | bank-manager |
| `POST` | `/v1/attempts` | Begin candidate attempt | candidate |
| `GET` | `/v1/attempts/{id}` | Retrieve candidate-safe attempt state | attempt owner |
| `PUT` | `/v1/attempts/{id}/responses/{slot}` | Idempotent response save | attempt owner |
| `POST` | `/v1/attempts/{id}/submit` | Final submission | attempt owner |
| `GET` | `/v1/attempts/{id}/result` | Released score/result | attempt owner |
| `POST` | `/v1/qti/imports` | Import QTI package | author/admin |
| `POST` | `/v1/qti/exports` | Export bank/form | authorized staff |
| `GET` | `/v1/audit-events` | Security/audit query | auditor/admin |

A candidate endpoint must **never serialize `answer_key`, explanation, calibration secrets, review notes, or secure provenance** while an eligible attempt remains open.

Example assembly request:

```json
{
  "blueprint_id": "tsa-style-2026:v3",
  "assembly_mode": "CALIBRATED_FIXED_FORM",
  "constraints": {
    "exclude_item_versions": [
      "itv_01ABC"
    ],
    "exclude_seen_by_cohort": true,
    "maximum_source_overlap": 3,
    "maximum_exposure_rate": 0.25
  },
  "psychometric_target": {
    "ability_grid": [-2.0, -1.0, 0.0, 1.0, 2.0],
    "target_information": [5.0, 12.0, 18.0, 12.0, 5.0]
  },
  "random_seed": 8821731
}
```

Example asynchronous response:

```json
{
  "assembly_job_id": "asj_01K2J8GH42",
  "state": "QUEUED",
  "blueprint_id": "tsa-style-2026:v3",
  "submitted_at": "2026-10-15T08:21:41Z"
}
```

A response write should be idempotent:

```json
{
  "item_version_id": "itv_01JX9K2M4Z9X8Y",
  "response": {
    "selected_option_ids": ["B"]
  },
  "client_sequence": 14,
  "idempotency_key": "att_7c91:slot_22:rev_3",
  "client_elapsed_ms": 824321
}
```

The server should treat `client_elapsed_ms` as diagnostic data, not as the authoritative exam clock. Start time, section transition, deadline and submission validity must derive from server-maintained timestamps.

**Authorization model**

Use at least:

```text
candidate
item_author
subject_reviewer
bank_manager
psychometrician
assessment_admin
support
auditor
service_account
```

Crucially, roles are not merely navigation controls. The API itself should enforce object-level authorization. OWASP's current API Security Top 10 identifies broken object-level authorization, broken authentication, broken object-property authorization, broken function-level authorization and unrestricted resource consumption among major API risks. citeturn22view3

Recommended controls include OIDC Authorization Code + PKCE for browser authentication, MFA for privileged staff, short-lived credentials, secure `HttpOnly` session cookies where appropriate, CSRF defense, server-side role/policy checks, rate limiting, encrypted secrets management, immutable audit trails, restricted exports, and service-to-service identities.

Test item security should be more restrictive than ordinary CMS data. A database administrator account should not automatically become an item author, and customer support should not automatically see future secure forms.

**Deployment path**

```text
Development
Docker Compose
    ↓
CI
lint + types + unit + integration + SAST + dependency scan
    ↓
Preview
ephemeral web/API environment
    ↓
Staging
managed PostgreSQL + Redis + object store
    ↓
security/load/accessibility tests
    ↓
Production
managed containers + autoscaling
    ↓
optional later migration:
Kubernetes if scale/operations justify it
```

A sensible first production topology is:

```text
CDN/WAF
  ↓
2+ stateless API/web instances
  ↓
managed PostgreSQL HA
managed Redis
object store
  ↓
isolated background worker pools:
  AI
  assembly
  psychometrics
```

Database migrations should be performed as controlled deployment jobs, not independently by every application instance.

For a Vietnamese deployment, the final cloud region and any foreign AI provider should be selected only after a privacy/data-flow review. Vietnam's Personal Data Protection Law No. 91/2025/QH15 and Decree 356/2025/NĐ-CP have been in force since January 1, 2026. citeturn22view0turn22view1

## Development roadmap, repository structure, coding practices, and test strategy

A realistic team for planning is approximately four core engineers—frontend, backend/platform, AI/data, and flexible full-stack/backend—supported by a part-time DevOps/security engineer, QA capability, a psychometrician, and Vietnamese Mathematics/Reading/Science SMEs. The estimates below are **engineering planning estimates, not external factual benchmarks**.

A polished application without psychometric expertise is insufficient; conversely, a sophisticated calibration notebook without a reliable assessment engine is also insufficient.

| Milestone / task | Deliverable | Effort | Rough effort |
|---|---|---:|---:|
| TSA specification + requirements | Versioned public blueprint, unknowns register, product boundaries | Medium | 1–2 person-weeks |
| Rights/data-source policy | Source registry, rights states, ingestion rules | Medium | 1–2 |
| Core domain/database | Items, versions, stimuli, tags, forms, attempts, audit | High | 2–3 |
| Authentication/RBAC | OIDC, roles, policy tests, staff MFA | Medium | 1–2 |
| Item authoring/review UI | Five interactions, previews, workflow, revisions | High | 3–5 |
| Candidate test engine | Delivery, timers, autosave, reconnect, navigation | High | 4–6 |
| Scoring engine | Interaction scoring, sealed keys, score versions | High | 2–3 |
| Blueprint/assembly MVP | Filters + greedy assembly | Medium | 1–2 |
| Optimized assembly | CP-SAT constraints, diagnostics, information targets | High | 2–4 |
| AI generation core | Provider interface, prompts, structured generation | High | 3–4 |
| AI validation | math/grounding/ambiguity/duplicate validators | High | 3–5 |
| Provenance infrastructure | Source spans, hashes, model/prompt lineage | Medium | 1–2 |
| Pilot administration | Pilot pools, cohort assignment, exports | Medium | 2–3 |
| Psychometric pipeline | CTT, IRT experiments, anchor/equating workflow | High | 4–6 |
| Analytics dashboards | Items, attempts, exposure, solver diagnostics | Medium | 2–3 |
| QTI interchange | Import/export adapters + fixtures | Medium | 2–4 |
| CI/CD + observability | pipelines, environments, alerts, tracing | Medium | 2–3 |
| Accessibility hardening | keyboard, screen reader, drag alternatives | High | 2–3 |
| Security/load hardening | threat model, ASVS checks, DAST/load tests | High | 3–4 |
| Real pilot + recalibration | Collect responses, calibrate, repair bank | High | 4–8 calendar weeks or more, data-dependent |

With parallel work, a credible software MVP is roughly a **14–18 week** project for such a team; a psychometrically calibrated release is more realistically **20–28 weeks or longer** because obtaining and reviewing pilot data is not merely an engineering activity. These are planning assumptions and should be revised after team size, bank size and target candidate volume are known.

A useful milestone sequence is:

```mermaid
flowchart LR
    A[Specification\n& Legal Boundaries]
    --> B[Item Bank\n& Auth]
    --> C[Candidate\nAssessment Engine]
    --> D[Rule-Based\nAssembly]
    --> E[AI Authoring\n& Validation]
    --> F[CP-SAT\nAssembly]
    --> G[Pilot\nAdministration]
    --> H[Psychometric\nCalibration]
    --> I[Security / Load /\nAccessibility Hardening]
    --> J[Production Beta]
```

**Suggested monorepo**

```text
tsa-platform/
├── apps/
│   ├── candidate-web/
│   └── staff-web/
│
├── services/
│   └── api/
│       ├── app/
│       │   ├── auth/
│       │   ├── items/
│       │   ├── sources/
│       │   ├── reviews/
│       │   ├── blueprints/
│       │   ├── forms/
│       │   ├── attempts/
│       │   ├── scoring/
│       │   ├── psychometrics/
│       │   ├── audit/
│       │   └── qti/
│       └── migrations/
│
├── workers/
│   ├── ai-authoring/
│   │   ├── generators/
│   │   ├── validators/
│   │   ├── prompts/
│   │   ├── providers/
│   │   └── evaluations/
│   │
│   ├── assembly/
│   │   ├── greedy/
│   │   ├── cp_sat/
│   │   └── simulations/
│   │
│   └── psychometrics/
│       ├── ctt/
│       ├── irt/
│       ├── equating/
│       ├── dif/
│       └── reports/
│
├── packages/
│   ├── contracts/
│   ├── assessment-types/
│   ├── scoring-spec/
│   ├── qti/
│   ├── ui/
│   └── test-fixtures/
│
├── data/
│   ├── schemas/
│   ├── synthetic/
│   └── taxonomy/
│
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── e2e/
│   ├── accessibility/
│   ├── ai-evals/
│   ├── psychometric/
│   ├── load/
│   └── security/
│
├── infra/
│   ├── terraform/
│   ├── docker/
│   └── kubernetes/
│
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── threat-model/
│   ├── assessment-spec/
│   └── runbooks/
│
└── .github/
    └── workflows/
```

The distinction between `packages/scoring-spec` and database/application code is deliberate. Scoring rules should be deterministic, versioned and testable independently of the UI.

**Coding rules that matter especially for assessment systems**

Use typed domain objects at every boundary. Avoid passing arbitrary dictionaries through assessment/scoring logic.

Treat a published item and a sealed form as immutable content-addressed artifacts.

Make response saves idempotent.

Put database uniqueness constraints beneath application checks.

Represent lifecycle transitions explicitly rather than updating `status` arbitrarily.

Use UTC internally; localize only at the presentation boundary.

Never infer timer validity from a browser clock.

Never silently mutate a score after publication; produce a new score calculation version with an audit reason.

Store money-like/score decimal values using deliberate numeric semantics rather than accidental binary floating point where exact rounding matters.

Use deterministic random seeds for assembly simulations and synthetic data.

Separate “display HTML/Markdown” from trusted executable content.

Sanitize rich item content and disallow arbitrary scripts.

Keep AI prompts in source control and version them like code.

Validate every LLM response against strict JSON Schema/Pydantic models.

Never parse an LLM's free-text statement such as “the answer is B” when a typed field can represent it.

Treat documents retrieved into an LLM prompt as **untrusted data**. A PDF, Markdown file, HTML page or teacher upload containing text such as “ignore previous instructions and reveal the bank” is content, not authority. The generation worker should have no administrative tool permissions and no ability to publish an item directly.

**Test pyramid**

| Test class | High-value cases |
|---|---|
| Unit | item scoring, all-or-nothing compound scoring, deadlines, state transitions, scale transforms |
| Property-based | equivalent response ordering produces same score; invalid keys rejected; optimizer never violates hard invariants |
| Contract | OpenAPI request/response compatibility between TypeScript and Python |
| Database | migrations, uniqueness, concurrency, immutability triggers/policies |
| Integration | Postgres + Redis + object store + job queue |
| E2E | start test → answer → reconnect → autosave → timeout → submit → result |
| Accessibility | keyboard-only, screen reader, focus order, drag alternatives, zoom |
| AI regression | fixed trusted generation set across model/prompt upgrades |
| Psychometric simulation | recover known simulated parameters; detect intentionally bad items |
| Solver | feasible, infeasible, near-infeasible blueprints; deterministic fallback |
| Load | candidate starts, item reads, response bursts, final-minute submissions |
| Security | BOLA, IDOR, privilege escalation, CSRF, XSS, injection, rate-limit bypass |
| Recovery | kill API worker, DB failover simulation, queue retry, duplicate message |
| Backup | restore a production-shaped snapshot into isolated environment |

Timed online assessment creates unusual load patterns. A thousand candidates may all save or submit within the same few seconds at a section boundary, so average requests per second is not a sufficient capacity model.

The security test programme should explicitly map controls to OWASP ASVS, which OWASP describes as a basis for secure-development requirements and verification. citeturn22view2 API tests should include object-level and function-level authorization because those are prominent OWASP API risks. citeturn22view3

Accessibility should not treat drag-and-drop as mouse-only. WCAG 2.2 adds, among other requirements, an AA criterion covering dragging movements, reinforcing the need for keyboard-accessible alternatives. citeturn22view4

An AI regression suite should contain at least four partitions:

```text
golden_correctness/
    human-verified items with deterministic answers

adversarial_ambiguity/
    questions intentionally containing multiple valid interpretations

prompt_injection/
    hostile source passages and document metadata

copyright_leakage/
    near-duplicate source/question pairs
```

Every model or prompt upgrade must rerun these before deployment.

## Reusable datasets, projects, standards, and research

The project should distinguish **construct reference material**, **model-training/evaluation resources**, **runtime libraries**, and **assessment standards**. They are not interchangeable.

| Resource | Type | Applicability | License / legal concern |
|---|---|---|---|
| HUST TSA portal | Official primary source | Current official TSA entry point and product reference | Do not assume content is reusable merely because it is public |
| HUST TSA 2026 handbook | Official primary source | Highest-priority construct/preparation reference for current cycle | Official HUST content; no open reuse license identified in material examined |
| HUST TSA organization scheme | Official primary source | Best detailed public source found for 100/150 format, sections, interactions, M-levels and IRT description | Use as specification reference; seek permission before copying questions/assets |
| QTI 3 | Open assessment standard | Import/export; reduces proprietary item-format lock-in | Specification terms apply; implementation can remain your own. citeturn21search3 |
| Moodle | Open-source assessment/LMS | Mature question-bank and quiz-engine design reference | GPL-3.0; copying/linking code requires careful copyleft analysis. citeturn8search4 |
| Open edX `edx-platform` | Open-source learning/assessment platform | Architecture and assessment workflow reference | AGPLv3 unless otherwise noted; strong copyleft implications. citeturn8search2 |
| Google OR-Tools | Optimization library | CP-SAT test assembly | Apache-2.0. citeturn17search3 |
| `py-irt` | Open-source psychometrics library | IRT prototypes, research and calibration experiments | MIT; current repo implements 1PL/2PL/4PL. citeturn21search2 |
| `eatATA` | R package / research | Reference implementation for automated test assembly using MIP | Verify package/dependency solver licenses before embedding; paper documents MIP approach. citeturn21search1turn21search24 |
| `lmqg` | QG library | QG/QAG pipeline design, training/evaluation code | MIT; current built-in language list does not include Vietnamese. citeturn20view0 |
| SQuAD 2.0 | Dataset | Reading-QG/answerability research and regression tests | CC BY-SA 4.0; 100k SQuAD 1.1 questions plus >50k adversarial unanswerables. citeturn22view6 |
| UIT-ViQuAD | Vietnamese QA dataset | Much more linguistically relevant for Vietnamese MRC/QG experiments | >23,000 QA pairs from 5,109 passages; UIT requires contacting them and signing a corpus user agreement. citeturn22view7 |
| GSM8K | Math reasoning dataset | Reasoning pipeline/evaluation experiments, not TSA construct matching | 8.5k grade-school math problems; repository license MIT. citeturn10search5turn10search1 |
| Du, Shao & Cardie 2017 | Original QG paper | Foundational answer/context-conditioned neural QG design | Research reference. citeturn9search1 |
| Qiu et al. 2020 / EDGE | Original distractor paper | Distractor correctness/plausibility design | Paper is CC BY 4.0; that does not automatically license every external dataset it discusses. citeturn19view3 |
| Alhazmi et al. 2024 | Survey | Distractor methods, datasets and metrics | Research reference; useful design map. citeturn19view2 |
| Van der Linden 1998 | Original ATA paper | Mathematical basis for constrained/IRT test assembly | Research reference. citeturn21search4 |
| NIST AI 600-1 | AI risk-management guidance | Governance, testing and generative-AI risk framework | Public NIST guidance. citeturn22view5 |
| OWASP ASVS | Security standard/project | Secure requirements and verification | Open OWASP resource. citeturn22view2 |
| WCAG 2.2 | W3C standard | Candidate/admin accessibility | W3C Recommendation. citeturn22view4 |

Two dataset warnings are particularly important.

First, **UIT-ViQuAD is valuable because it is genuinely Vietnamese**, with more than 23,000 human-created QA pairs based on 5,109 passages from 174 Vietnamese Wikipedia articles, but UIT's official page says users should contact the group to sign the corpus user agreement. It therefore should not be treated as an unrestricted “download and commercialize” corpus. citeturn22view7

Second, SQuAD, ViQuAD and GSM8K are **not TSA psychometric data**. They can teach models QA or reasoning patterns and provide regression benchmarks, but they cannot tell you whether a new item is an M1/M2/M3 TSA-quality item or what its IRT difficulty should be.

**Prioritized direct sources**

| Priority | Source | Link |
|---|---|---|
| Highest | HUST MyTSA portal | https://tsa.hust.edu.vn/ |
| Highest | Official HUST TSA 2026 handbook page | https://ts.hust.edu.vn/tin-tuc/cam-nang-thi-danh-gia-tu-duy-tsa-2026-xuat-ban-lan-thu-2 |
| Highest | HUST public TSA organization PDF examined in this research | https://hust-dev.hust.edu.vn/uploads/sys/tuyen-sinh/2023_01/de-an-tsa-2025.pdf |
| High | 1EdTech QTI specification | https://www.1edtech.org/standards/qti/index |
| High | OR-Tools | https://github.com/google/or-tools |
| High | `py-irt` | https://github.com/nd-ball/py-irt |
| High | `lmqg` | https://github.com/asahi417/lm-question-generation |
| High | Moodle | https://github.com/moodle/moodle |
| High | Open edX | https://github.com/openedx/edx-platform |
| High | UIT NLP datasets | https://nlp.uit.edu.vn/datasets |
| High | SQuAD | https://rajpurkar.github.io/SQuAD-explorer/ |
| Research | Learning to Ask, ACL Anthology | https://aclanthology.org/P17-1123/ |
| Research | EDGE distractor-generation paper | https://aclanthology.org/2020.coling-main.189/ |
| Research | Distractor Generation survey | https://aclanthology.org/2024.emnlp-main.799/ |
| Research | Optimal Assembly of Psychological and Educational Tests | https://doi.org/10.1177/01466216980223001 |
| Research | eatATA paper | https://www.mdpi.com/2624-8611/3/2/10 |
| Governance | NIST Generative AI Profile | https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf |
| Security | OWASP ASVS | https://owasp.org/projects/asvs |
| Accessibility | WCAG 2.2 | https://www.w3.org/TR/WCAG22/ |

QTI deserves particularly high priority. Its explicit purpose is interoperability among authoring tools, item banks, construction tools, learning platforms, delivery systems and scoring/analytics systems. citeturn21search3 Building QTI compatibility behind a canonical internal model is much safer than making the database itself a direct serialization of either QTI XML or a frontend component tree.

## Legal, ethical, security, and project risk analysis

The platform's largest risks are not “which LLM is best.” They are validity, copyright, leakage, scoring credibility, and operational integrity.

**Copyright and affiliation.** Public availability is not the same thing as an open license. HUST's 2026 handbook is explicitly an official HUST preparation publication. citeturn18search0turn23search2 The project should learn the assessment construct and publicly stated rules from HUST materials, but its production bank should preferably use independently written, licensed or synthetic stimuli and items.

Vietnam's current IP framework was amended by Law No. 131/2025/QH15, adopted December 10, 2025 and effective April 1, 2026. citeturn23search0turn23search1 This report is therefore not a substitute for Vietnamese IP advice about specific copying, adaptation, model-training or quotation plans.

Operationally:

```text
Do:
  encode public exam structure
  independently implement interaction behavior
  independently author TSA-style questions
  preserve citations/provenance
  obtain licenses for non-owned passages
  keep a source-rights ledger
  clearly disclose independent status

Do not assume permission to:
  republish HUST questions
  reproduce handbook passages in bulk
  reuse HUST graphics/logos
  upload protected exam material to an LLM
  market the product as an official HUST service
```

Use an independent product name and a statement such as:

> “Independent practice platform inspired by publicly documented TSA assessment structure. Not affiliated with or endorsed by Hanoi University of Science and Technology.”

That statement addresses confusion risk without asserting anything here about formal trademark registrations.

**Exam security.** Divide the item bank into at least:

```text
PUBLIC_PRACTICE
PILOT
SECURE_OPERATIONAL
ANCHOR_SECURE
RETIRED
QUARANTINED
```

A generation model should not automatically receive the secure operational or anchor bank as context. A hosted third-party LLM should not receive protected operational items unless data-handling terms and the project's security/privacy assessment explicitly permit it.

For high-value forms:

- encrypt data in transit and at rest;
- restrict item queries by purpose, not merely role;
- audit reads and exports of future forms;
- rate-limit bulk item access;
- prevent candidate APIs from returning answer keys;
- isolate anchor items;
- record form/item exposure;
- seal forms cryptographically;
- detect unusual bank downloads;
- expire presigned asset URLs;
- keep production DB backups under the same sensitivity classification as the bank.

**Personal data.** Vietnam's Personal Data Protection Law No. 91/2025/QH15 took effect January 1, 2026, with Decree 356/2025/NĐ-CP detailing implementation from the same date. citeturn22view0turn22view1 Because many TSA candidates may be young people, privacy review should happen at the design stage, not after data collection begins.

Use data separation:

```text
Identity domain
    user_id
    login/contact/account data
              │
              │ pseudonymous ID
              ▼
Assessment domain
    attempts
    responses
    scores
              │
              │ pseudonymized extract
              ▼
Psychometric analytics
```

Only join identity to analytics when there is a defined purpose. Do not give data scientists a full candidate identity table merely because it is convenient.

**Hallucination and invalid-item risk.** The AI system should be assumed fallible. NIST's Generative AI profile is explicitly structured around managing risks throughout the generative-AI lifecycle. citeturn22view5 The correct design is therefore defense in depth:

```text
LLM
 ↓
typed schema
 ↓
deterministic validator
 ↓
independent critic
 ↓
source/evidence verification
 ↓
duplicate/leak detector
 ↓
human reviewer
 ↓
pilot
 ↓
psychometrics
```

No individual check is enough.

A mathematical item can have fluent wording and a wrong key.

A reading item can have an answer supported by outside knowledge but not by the provided passage.

A scientific item can contain impossible data.

A distractor can accidentally become a second correct answer.

An AI difficulty label can look convincing while having no relationship to empirical student performance.

Every one of these should have a separate test.

**Prompt-injection risk.** Source documents are adversarial input. PDFs, copied web pages, uploaded notes, Markdown, metadata and comments may contain instruction-like strings. The retrieval subsystem should strip active content, isolate text as quoted/untrusted data, constrain model outputs to a schema, disable arbitrary external tool use, allow-list data sources, and ensure the AI worker possesses no publication or bank-export capability.

**Risk register**

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| AI creates wrong answer key | High | Critical | Deterministic answer verification + independent review |
| Ambiguous/multiple correct answers | Medium–High | Critical | adversarial answer checking + SME review + pilot statistics |
| AI-estimated difficulty is wrong | High initially | High | treat as prior only; replace with empirical calibration |
| Weak distractors | High | High | misconception-driven generation + option statistics |
| Copyright violation | Medium | Critical | rights gate, provenance, independent content, legal review |
| HUST affiliation confusion | Medium | High | independent branding and explicit disclaimer |
| Leakage of secure item bank | Medium | Critical | least privilege, isolation, audit, exposure monitoring |
| Secure item sent to external AI | Medium | Critical | classify bank, provider policy, self-host/approved environment |
| Prompt injection from source docs | High over project lifetime | High | untrusted-data isolation, no privileged AI tools |
| Overfitting to public HUST samples | High | High | construct taxonomy + broader lawful source corpus + novelty checks |
| Score falsely presented as official | Medium | Critical | explicit unofficial scoring label and versioned methodology |
| Poor cross-form comparability | Medium | High | calibrated parameters, anchors, equating validation |
| Solver creates content-valid but repetitive form | Medium | Medium | semantic enemy sets and diversity objectives |
| Optimizer becomes infeasible | Medium | Medium | diagnostics, relaxed-preview mode, greedy fallback |
| Candidate loses responses | Low–Medium | Critical | idempotent autosave, retry queue, server acknowledgments |
| Browser clock manipulation | Medium | High | server-authoritative timing |
| Last-minute submit traffic spike | High | High | load test burst patterns and autoscale |
| Broken object authorization | Medium | Critical | centralized authorization + API security regression tests |
| Staff privilege abuse | Low–Medium | Critical | separation of duties + immutable audit |
| Psychometric subgroup bias | Medium | High | DIF analysis + expert investigation |
| Model/provider drift | High | Medium–High | pin model snapshots/config where possible; golden regression suite |
| Database/version mutation corrupts history | Low | Critical | immutable item/form versions + checksums |
| Privacy noncompliance | Medium | Critical | minimization, retention policy, legal/data-flow assessment |
| Copyleft contamination from reused OSS code | Low–Medium | High | dependency/license inventory and architectural legal review |

OWASP's API guidance reinforces the object/function-authorization and resource-consumption risks in that register. citeturn22view3

The greatest product failure mode is subtler: **optimizing the system to look like an exam instead of measuring like one**.

A pixel-perfect HUST-like interface, thousands of generated questions, and an impressive “AI difficulty” score can all be built without producing a valid assessment. The durable competitive asset is instead the chain:

\[
\text{construct definition}
\rightarrow
\text{provenanced item}
\rightarrow
\text{expert review}
\rightarrow
\text{student evidence}
\rightarrow
\text{calibration}
\rightarrow
\text{controlled assembly}
\rightarrow
\text{measured form quality}
\]

HUST's own public description of IRT-based scoring and bridge items points in the same fundamental direction: item quality and comparability are measurement problems, not merely content-generation problems. citeturn7view2

The best first production target is therefore an **independent TSA-style mock platform with a high-quality human-reviewed bank, public-blueprint-compatible 100-question/150-minute forms, transparent practice scoring, AI-assisted authoring, and constrained assembly**. Once enough real response data exist, add calibrated IRT scoring and anchor-based cross-form linking. Only after those foundations are stable should ML-driven item selection or adaptive practice become central.

That order keeps AI where it is strongest—accelerating authors and searching a large bank—while leaving correctness, rights, test validity, publication authority, and final measurement decisions under explicit controls.