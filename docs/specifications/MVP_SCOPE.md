# MVP scope

Status: PROPOSED implementation scope under the owner's Phase 02.75 product requirements; ADR-002/004/007/008 require implementation review. This document owns scope; [engine](EXAM_ENGINE_SPEC.md), [question model](QUESTION_SCHEMA.md) and [assembly](EXAM_ASSEMBLY_SPEC.md) own behavior.

## First usable product

Authenticated student requests a newly assembled PERSONALIZED_PRACTICE exam in NEW_ONLY mode from the shared approved bank, excluding all identities/equivalents previously assigned to them, then resumes after disconnect, submits or expires, receives a transparent score and explanations, and sees their own attempt history. Staff can import/manual-author, validate, review, approve and quarantine questions and publish an optional PUBLISHED_FIXED mock form. Each student's default attempt receives its own immutable form; no live AI is involved. Explicit REVIEW_ALLOWED and fixed-form selection may repeat previously assigned questions, with visible labeling; neither is a silent fallback. A small review screen is sufficient; no elaborate CMS.

Proposed `practice-mini-v1` fixture blueprint: three sections MATH/READING/SCIENCE with 4/2/4 questions, 6/3/6 minutes, sequential section clocks. This is a project assumption, not an official TSA profile or psychometric miniature. Initial content target: 30 independently authored Vietnamese questions (12/6/12 across sections), including a two-question shared reading stimulus and examples of all three MVP interaction types. Two different humans must be available for authorship and independent subject approval; lack of reviewer capacity blocks publication, not an excuse for self-approval. Initial diversity target provides alternatives, not a guarantee of feasible arbitrary quotas or unlimited unseen exams. Thirty questions can exhaust after at most three disjoint ten-question forms, and bundle/skill constraints may exhaust sooner. The UI must report shortage and offer an authorized shorter profile, explicitly selected review mode or waiting; it must not recycle old questions.

MVP interaction types: SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE_GROUP. Include typed text, TeX math and tables; support media references once media access is implemented. A chart can initially be an authorized static image with data/alt text. No four-option assumption in the generic schema. Difficulty is editor-assessed metadata, explicitly uncalibrated. Blueprint filtering is configurable, but the first fixture does not impose unsupported empirical-difficulty or M-level ratios.

Do not label the mini profile a full TSA simulation. A full reference profile is POST_MVP: source verification, enough lawful approved content, appropriate interactions and product review must precede enabling it. The verified/unverified official requirements live only in [research assessment](../research/RESEARCH_ASSESSMENT.md).

## Release acceptance

1. Every selectable question has authorized provenance, a frozen version, validator evidence and independent human approval; no generated auto-approval.
2. One complete vertical slice works through real PostgreSQL and the browser, including deadline, reconnect and duplicate submit.
3. Sealed forms and scoring inputs remain unchanged if bank versions later change; withdrawn content is blocked according to the engine incident policy.
4. Student APIs/assets expose no keys/explanations before release; another student's attempts are inaccessible.
5. Raw correct count, total and practice percentage are explained; no official-score equivalence or cross-form calibration claim.
6. History displays own start/completion time, profile, score state and result link. Advanced progress analytics are not needed.
7. Keyboard operation, explicit save acknowledgement/error state, Vietnamese text and readable math are tested. Branding clearly states independent status.
8. Public release additionally needs approved privacy/retention/hosting decisions, backup restoration and capacity/security evidence in OPS-001/TEST-001.

## Coordinated early tracks

Track A starts source/taxonomy/evaluation research and an independently executable scheduled factory prototype early; Track B builds the bank and personalized website with manual fixtures. The website first slice does not wait for AI yield, and the AI prototype does not wait for the website. [Factory spec](QUESTION_FACTORY_SPEC.md) defines manual/weekly operation, bounded deficit-driven production and recovery. INT-001 joins the tracks through canonical draft import, independent approval and subsequent personalized exams while factory/provider are offline.

Additional MVP acceptance: NEW_ONLY exclusions include CREATED assignments from every mode; concurrent same-student allocations cannot overlap in NEW_ONLY; different students can receive the same questions. All original quality/timing/immutability invariants remain. [Reuse policy](QUESTION_REUSE_POLICY.md) owns exceptions and retention. No-repeat is not POST_MVP.

## Later scope

| Stage | Included only after its own approved tasks |
|---|---|
| POST_MVP | Richer authoring, exact numeric entry, matching/drag alternatives, full reference profile, stronger similarity retrieval, learning trends |
| FUTURE_RESEARCH | Calibrated difficulty/IRT, anchor equating, adaptive testing, psychometric fairness, optimizer objectives based on information curves |

Excluded initially: official score reconstruction, copied HUST corpus/branding/interface, public question scraping, AI-dependent exam path, proctoring/biometrics, payments, social ranking, native mobile apps, unrestricted free-text grading, secure high-stakes/anchor banks, QTI import/export, microservices and orchestration frameworks. These exclusions can change only through explicit scope decisions.
