# MVP scope

Status: PROPOSED implementation scope under the owner's Phase 02.75 product requirements; ADR-002/004/007/008 require implementation review. This document owns scope; [engine](EXAM_ENGINE_SPEC.md), [question model](QUESTION_SCHEMA.md) and [assembly](EXAM_ASSEMBLY_SPEC.md) own behavior.

## Three independently demonstrable milestones

This scope has three deliverables, not one release gate. They may progress in parallel, but none implies completion, approval or operational dependency of another. All acceptance evidence below is future work and is **REQUIRES_VERIFICATION** until recorded by the accountable task owner; no calendar date is implied.

| Milestone | Purpose and boundary | Required relationship to the other milestones |
|---|---|---|
| 1. Technical MVP | A 10-question engineering mini-exam using vetted seed content, personalized practice allocation and the minimal student/staff workflow. | Uses the shared approved bank and must work without an AI provider or factory process. It is not an official TSA simulation. |
| 2. AI Research Demonstrator | A standalone Question Factory experiment that measures generation, validation and independent-review throughput. | Starts early and remains independently executable. Its drafts are not selectable questions and it does not depend on the MVP website. |
| 3. Final Integrated University Deliverable | An integrated demonstration in which the practice product consumes factory-originated items only after the normal validation, independent human approval and bank-publication path. | Joins the two tracks without making a live model call part of exam creation, delivery, scoring or grading. |

The Question Factory remains an independent executable with separate credentials, bounded work and no publication privilege, as specified in [the factory specification](QUESTION_FACTORY_SPEC.md). The shared bank is the sole bridge: factory outputs enter it as drafts; staff independently approve eligible versions; the product allocates only approved bank items. This preserves a usable Technical MVP if research generation pauses or a provider is unavailable.

## Milestone 1 — Technical MVP

Authenticated student requests a newly assembled PERSONALIZED_PRACTICE exam in NEW_ONLY mode from the shared approved bank, excluding all identities/equivalents previously assigned to them, then resumes after disconnect, submits or expires, receives a transparent score and explanations, and sees their own attempt history. Staff can import/manual-author, validate, review, approve and quarantine questions and publish an optional PUBLISHED_FIXED mock form. Each student's default attempt receives its own immutable form; no live AI is involved. Explicit REVIEW_ALLOWED and fixed-form selection may repeat previously assigned questions, with visible labeling; neither is a silent fallback. A small review screen is sufficient; no elaborate CMS.

Proposed `practice-mini-v1` fixture blueprint: three sections MATH/READING/SCIENCE with 4/2/4 questions, 6/3/6 minutes, sequential section clocks. This is a project assumption, not an official TSA profile or psychometric miniature. Initial content target: 30 independently authored Vietnamese questions (12/6/12 across sections), including a two-question shared reading stimulus and examples of all three MVP interaction types. Two different humans must be available for authorship and independent subject approval; lack of reviewer capacity blocks publication, not an excuse for self-approval. Initial diversity target provides alternatives, not a guarantee of feasible arbitrary quotas or unlimited unseen exams. Thirty questions can exhaust after at most three disjoint ten-question forms, and bundle/skill constraints may exhaust sooner. The UI must report shortage and offer an authorized shorter profile, explicitly selected review mode or waiting; it must not recycle old questions.

MVP interaction types: SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE_GROUP. Include typed text, TeX math and tables; support media references once media access is implemented. A chart can initially be an authorized static image with data/alt text. No four-option assumption in the generic schema. Difficulty is editor-assessed metadata, explicitly uncalibrated. Blueprint filtering is configurable, but the first fixture does not impose unsupported empirical-difficulty or M-level ratios.

Do not label the mini profile a full TSA simulation or an official TSA assessment. A full reference profile is POST_MVP: source verification, enough lawful approved content, appropriate interactions and product review must precede enabling it. The verified/unverified official requirements live only in [research assessment](../research/RESEARCH_ASSESSMENT.md).

### Technical MVP acceptance criteria

1. A browser-backed, real-PostgreSQL run completes one `practice-mini-v1` 10-question form (4/2/4), including the configured section timing, reconnect, duplicate-submit handling, practice result and explanation release. Record the test fixture, command/environment and resulting attempt/form identifiers or equivalent retained evidence.
2. The demonstrated form contains only vetted seed versions with authorized provenance, frozen content, validator evidence and independent human approval. No generated item is auto-approved or required for this milestone.
3. Default creation is `PERSONALIZED_PRACTICE` + `NEW_ONLY`. A real-database same-student test verifies that a same-key retry replays its original result, while a different-key concurrent request returns `409 CONCURRENT_ATTEMPT_EXISTS` while either a personalized or fixed attempt is CREATED/IN_PROGRESS and writes no allocation history. After closure, a later NEW_ONLY attempt excludes prior stable identities/current canonical equivalents. A different student may receive the same eligible item.
4. A shortage demonstration returns an explicit error or an explicitly chosen authorized alternative; it never silently repeats a question, weakens the blueprint or invokes live AI.
5. Sealed forms and scoring inputs remain unchanged after a later bank-version change; a cross-student access attempt and pre-release key/explanation attempt are denied.
6. The result identifies raw correct count, total and practice percentage, and the interface/fixture documentation identifies the mini-exam as independent practice rather than an official or equivalent TSA simulation.
7. Keyboard operation, visible save acknowledgement/error state, Vietnamese text and readable math are checked for the mini-exam; the executed accessibility evidence is recorded rather than assumed.

This milestone is a technical product slice, not a public-release authorization. Public release additionally needs approved privacy/retention/hosting decisions, backup restoration and capacity/security evidence in OPS-001/TEST-001.

## Milestone 2 — AI Research Demonstrator

The AI Research Demonstrator begins alongside seed-bank/MVP work. It is an experiment with measured evidence, not a promise that generated content is usable or publishable. It operates through the independent factory and the existing draft/review boundary; it must not be embedded in a student request path.

### AI Research Demonstrator acceptance criteria

1. An operator can execute a bounded, version-pinned factory batch using an approved configuration and rights-eligible source payloads, then retain the batch plan, item manifest, provider/run evidence, validation outcomes and actual cost/usage report. The report distinguishes planned, generated, validation-failed, awaiting-review, rejected and approved/published counts.
2. The experiment reports measurable generation throughput, automated-validation throughput and independent-review throughput using explicit numerator, elapsed interval and unit (questions or complete bundles). It separately reports pass/reject/error rates; it does not present a model opinion or an unexecuted benchmark as a quality result.
3. A controlled provider failure or paused batch leaves the Technical MVP able to create, complete and score approved-bank exams without a model credential or live model call. Resume uses the frozen batch/checkpoints rather than silently replanning.
4. Factory credentials cannot approve/publish items, read student identities/history/answers, or claim exam jobs. A generated candidate remains non-selectable until the normal schema, rights, duplicate/equivalence, answer-verification, quality and independent human-review gates complete.
5. The demonstrator records reviewer capacity and the count/time through each review disposition. Insufficient reviewer capacity, budget, rights or validation capacity pauses or bounds generation; it is not bypassed by self-approval.

## Milestone 3 — Final Integrated University Deliverable

The final integrated university deliverable is a demonstration of the complete controlled flow, not a claim of institutional affiliation, official TSA equivalence or an official examination service. It consumes factory-originated content only after it has become an approved shared-bank version through the same controls as any other content.

### Final Integrated University Deliverable acceptance criteria

1. A retained factory receipt can be traced through immutable draft/version provenance, validation and independent human approval to one eligible shared-bank version; an integration demonstration assembles that approved item into a student's immutable personalized form.
2. The student completes that form through the same browser/PostgreSQL exam path as the Technical MVP and receives the normal practice score and released explanation. The form creation, delivery, submission and scoring paths make no live provider call.
3. With the factory stopped or provider credentials unavailable after publication, the integrated form remains creatable from the approved shared bank and an already-started attempt remains resumable/scorable according to the engine rules.
4. Integration evidence shows that unapproved, rejected, quarantined, rights-revoked or equivalence-unresolved factory outputs cannot enter assembly. It also shows that a staff publication action—not a factory batch completion—is the transition that makes a generated item eligible.
5. The deliverable repeats the Technical MVP's default per-student `NEW_ONLY` allocation evidence for a form containing an approved factory-originated item, including no silent repeat and cross-student reuse where eligible.
6. The demonstration materials label all results as independent practice and the 10-question mini-exam as a project fixture, not an official TSA simulation or score-equivalent result.

## Coordinated early tracks

Track A starts source/taxonomy/evaluation research and the AI Research Demonstrator early; Track B builds the vetted seed bank and Technical MVP. The website first slice does not wait for AI yield, and the AI demonstrator does not wait for the website. [Factory spec](QUESTION_FACTORY_SPEC.md) defines manual/weekly operation, bounded deficit-driven production and recovery. Milestone 3 joins the tracks through canonical draft import, independent approval and subsequent personalized exams while factory/provider are offline.

Additional MVP acceptance: NEW_ONLY exclusions include CREATED assignments from every mode; concurrent same-student distinct-key creations leave at most one global active attempt, and the rejected request writes no allocation history; different students can receive the same questions. All original quality/timing/immutability invariants remain. [Reuse policy](QUESTION_REUSE_POLICY.md) owns exceptions and retention. No-repeat is not POST_MVP.

## Later scope

| Stage | Included only after its own approved tasks |
|---|---|
| POST_MVP | Richer authoring, exact numeric entry, matching/drag alternatives, full reference profile, stronger similarity retrieval, learning trends |
| FUTURE_RESEARCH | Calibrated difficulty/IRT, anchor equating, adaptive testing, psychometric fairness, optimizer objectives based on information curves |

Excluded initially: official score reconstruction, copied HUST corpus/branding/interface, public question scraping, AI-dependent exam path, proctoring/biometrics, payments, social ranking, native mobile apps, unrestricted free-text grading, secure high-stakes/anchor banks, QTI import/export, microservices and orchestration frameworks. These exclusions can change only through explicit scope decisions.
