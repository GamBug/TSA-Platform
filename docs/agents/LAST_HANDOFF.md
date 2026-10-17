# Latest handoff — FOUND-002 Slice 6

Date: 2026-10-17 (Asia/Bangkok). Accountable implementer: Codex, Deterministic Systems and Contract Engineer. Status: Slice 6 COMPLETED; FOUND-002 remains IN_PROGRESS and G1 is NOT ESTABLISHED.

## Scope and repository state

Authorized scope: the owner's FOUND-002 Slice 6 assignment under scoped G0 implementation authorization. Primary files: `packages/contracts/`; coordinated backlog, project state and handoff updates only. Starting state: `main` at `0dbc7ae`, with an existing uncommitted `AGENTS.md` edit preserved. No commit was created. No external AI call, dependency installation, HTTP endpoint, migration or renderer was added. Independent review: NOT PERFORMED.

## Specification audit and outcome

| Contract area | Status | Evidence and action |
|---|---|---|
| Canonicalization | Partially specified | `QUESTION_SCHEMA.md` requires lowercase UUIDs and a versioned canonical serialization, but defines no immutable-field byte layout, object/array ordering, Unicode or whitespace normalization, number formatting or hash-input encoding. Existing schema rejects uppercase UUIDs; Slice 6 tests field-order-insensitive parsing and unchanged content. No content canonicalizer was invented. |
| Stable hashing/content identity | Partially specified | `QUESTION_SCHEMA.md` requires immutable fields including private key/explanation and referenced IDs/hashes, excluding workflow/events; `QUESTION_FACTORY_SPEC.md` requires versioned algorithm/hash evidence and import key/hash conflict semantics. Digest algorithm, encoding, self-referential `contentHash` exclusion, reference-hash representation and duplicate fingerprint normalization are not specified. Fixture hash strings are synthetic labels, not computed digests. |
| PRNG and unit shuffle | Fully specified for the isolated reference; ADR-004 remains PROPOSED | `EXAM_ASSEMBLY_SPEC.md` lines 67–77 define uint32 seed range, zero mapping to 2463534242, xorshift steps, three published five-output vectors and exact integer Fisher–Yates indexing. Added versioned pure helper and executable goldens. It shuffles caller-supplied order and makes no production assembly or full replay claim. |
| Deterministic question ordering | Partially specified | Ascending lowercase UUID unit input and UUID source per unit are stated, but unit-kind collision ordering, bundle internal-order wire shape, search/soft-rank ties, node counting and final slot order are not fully pinned. Canonical unit sorting, search and manifest-to-slot goldens were deferred. |
| Renderer-compatible fixtures | Fully specified for `question/1` shape; partial for visual behavior | Synthetic text, math, table and image blocks plus SINGLE_CHOICE, MULTIPLE_CHOICE and TRUE_FALSE_GROUP validate through shared schemas. Malformed tables/images/keys/responses fail. This tests structures, not browser rendering, TeX safety, asset authorization or visual output. |
| Factory-to-Bank serialization | Fully specified for existing strict subset; partial for full export | JSON package → `factory-package/1` validation → `question/1` validation → draft receipt validation is executable. Full stimulus/assets and resolved config transport lack field-level schemas. Schema validation is not an actual import transaction or rights/approval decision. |

Synthetic fixtures also validate one-domain `blueprint/1`, CREATED AttemptView, ResultView and StudentSlot. Public slot and result schemas reject private/authoring fields; Factory export has no workflow field and Bank receipt accepts only DRAFT. Public projection retains content and interaction while excluding the private key/explanation. No provider credentials or real student data appear in fixtures.

## Verification evidence

| Executed command/check | Environment and date | Observed result | Limitations |
|---|---|---|---|
| `npm run typecheck` | Node `v24.18.0`, npm `11.16.0`, 2026-10-17 | Exit 0 | Static TypeScript only |
| `npm test` | Same | Exit 0; 8 contract test files passed | Shared-package tests only; no service interoperability or visual rendering |
| `npm run contracts:check` | Same | Exit 0; OpenAPI artifact matches runtime schemas | Components-only drift check; no public DTO shape changed |
| `git diff --check` | Git, 2026-10-17 | Exit 0 | Whitespace check only |
| `sed -n '/^```javascript$/,/^```$/p' docs/quality/TEST_STRATEGY.md \| sed '1d;$d' \| node` | Same | Exit 0; 21 required docs, 185 links, 36 tasks, zero errors; one preserved historical whitespace warning | Static documentation consistency only |

The first final `npm test` run exited 1 because a negative UUID fixture used an all-digit UUID that remained unchanged under uppercase conversion. The fixture was corrected to contain uppercase hex letters; the full suite then exited 0. No generation command was changed or run. Tests not executed: HTTP, database transactions, real Factory/Bank services, browser rendering, provider calls, paid LLM, concurrency, release gates and cross-language reproducibility. These remain outside Slice 6.

## Continuation

- Remaining FOUND-002 acceptance gaps: owner-reviewed canonicalization/hash and full ordering/search contracts; computed hash and manifest-to-slot fixtures; complete Factory stimulus/assets/config schemas; endpoint-backed client generation; CI and development-run instructions; fresh-checkout and import-boundary evidence. Proposed ADR-003/004/005/007/008 mechanisms are not approved as whole decisions.
- Recommended next task: obtain an explicit field-level content/hash and assembly ordering/search contract with impact/migration review, then add golden content identity and full replay vectors in a bounded FOUND-002 slice.
- Ownership transfer: releases `packages/contracts/**` and coordinated state files after this handoff. Preserve the unrelated `AGENTS.md` edit and all existing work. No reviewer or next implementer is assigned.
- State updates: backlog and project state updated by this accountable implementer; no decision or architectural specification was changed.
- Recovery: run `npm run typecheck`, `npm test`, `npm run contracts:check`, `git diff --check` and the embedded documentation checker. Do not treat synthetic fixture hashes as validated content hashes or shuffle output as a full assembly algorithm.
