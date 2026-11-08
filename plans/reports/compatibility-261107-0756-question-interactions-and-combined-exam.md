# Compatibility boundary for further TSA interactions

Status: source-verified engineering map, not an implemented feature or new architecture approval. November7,2026. Existing owner scope permits compatible implementation; the current published contracts remain the source of truth.

## Current constraints

- `packages/contracts/src/index.ts` freezes question/1, interaction/key/response unions to single choice, multiple choice and grouped true/false. SQL001 independently restricts the stored schema and interaction type. Text-entry or matching data cannot be reinterpreted as choice answers without losing behavior.
- The Bank validates canonical identity across content, private keys, referenced parents/stimuli and taxonomy. New schema versions need matching identity, safe-content, duplicate fingerprint, authoring, import and review dispatch. No historical question or hash may be relabeled.
- The same frozen interaction/response types flow through student snapshots, answer persistence, grading and released review. SQL012 validates saves against sealed interactions; SQL014 pins practice-binary-v1 and recomputes trusted grades. A frontend-only input would not be a functioning question type.
- Existing H3 allocation and delivery support independent sections. SQL011 and SQL015 select one form section with `INTO STRICT`; current student DTOs describe a single domain. Adding a three-section blueprint alone would break delivery/review, even though lower-level tables can describe multiple sections.

## Concrete extension boundaries

| Capability | Required compatible implementation | Safety and acceptance |
| --- | --- | --- |
| Numeric response | Separate versioned interaction/key/response. Specify accepted decimal syntax, locale normalization, bounded input and exact scoring/tolerance policy. | Never execute expressions. Reject ambiguous formats; preserve saved strings and exact-retry semantics. Validate, persist, grade and review through the existing lifecycle. |
| Text and cloze | Stable field IDs, authored labels/locations, bounded response maps and explicit normalization/case/accent policy. | Keep keys/accepted variants private. Native inputs must bypass shortcuts; partial fields must have honest incomplete progress. |
| Matching | Stable row/target IDs with cardinality and reuse limits; structured response mapping and versioned grading. | Native selects or equivalent click/tap controls plus native keyboard operation. Dragging alone is insufficient under W3C2.5.7. |
| Combined simulation | Explicit versioned multi-section offering and student DTOs, authoritative section schedule, section-bound allocation/read/save/expiry and final release rules. | Reuse the existing allocation, attempts, sealed snapshots and worker; do not compose independently pausable attempts and label them a complete timed examination. Never disclose future-section assets or early grading keys. |

A compatible implementation must keep ordinary v1 discovery/allocation/read consumers on their supported version. It must add explicit version-aware dispatch and upgrade/rollback evidence before new questions enter eligible inventory. Required tests span Bank draft/review, real allocation, typed saves/retries, refresh, expiry, grading/release, privacy and both browsers. No request-time AI dependency is needed.

## Source evidence and product implications

The private corpus inventory contains entry/matching captures, exposed answer keys and clipped diagrams; it is reference evidence, not a ready approved bank. Scientific Reading is a Reading genre. The [HUST introduction](https://ts.hust.edu.vn/tin-tuc/gioi-thieu-ve-ky-thi-danh-gia-tu-duy-tsa) describes three thinking competencies, while the [QTI implementation guide](https://www.imsglobal.org/spec/qti/v3p0/impl) distinguishes entry, matching and gap-matching interactions. [W3C](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) requires a non-drag pointer alternative independently of keyboard equivalence.

These findings constrain further work; they do not establish official HUST affiliation, scoring equivalence, source-use permission, an implemented new interaction version or a completed combined simulation. The delivered topic/media/keyboard vertical slices remain in the existing application.
