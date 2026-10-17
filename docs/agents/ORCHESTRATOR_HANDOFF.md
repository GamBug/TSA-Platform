# TSA-Platform — Orchestrator Handoff Baton

**Prepared:** 2026-10-17 (Asia/Ho_Chi_Minh)
**Outgoing coordinator:** ChatGPT web conversation (long context; user requests handoff to Codex 6.1 Sol)
**Incoming coordinator:** Codex 6.1 Sol, or any later replacement
**Purpose:** Current snapshot, **not** the source of truth. Read `ORCHESTRATION_PROTOCOL.md` and verify this record against live Git/docs before relying on it.

## Immediate instruction / user intent

The owner is transferring **prompt engineering and agent/workflow orchestration** away from a lagging ChatGPT web thread. The incoming coordinator should take over task selection, delegation, scoped prompt writing, result review, Git hygiene guidance, and future agent succession.

**Important:** The owner explicitly said they are **not following the outgoing assistant's most recent proposed next steps yet**. In particular, the owner has **NOT approved FOUND-007** merely by transferring control. This handoff is **not** an authorization to implement the outstanding G1 decisions, change statuses, or launch `DATA-001`. At initial handover, read and reconcile repository state, then give a succinct report and ask for the desired next priority rather than silently executing a proposed task.

The owner also confirmed a prior `AGENTS.md` change was intentional: it mandates English in agent work. Preserve it and follow the actual file.

## Project profile

- Repository on owner's Ubuntu workstation: `~/Documents/Projects/TSA-Platform` (the path is from earlier reports; verify).
- HUST Project I: **LLM-powered TSA practice platform** for high-school students, supervised by a university lecturer. Research bottlenecks: representative/high-quality TSA question data and model selection/evaluation.
- Architecture has three separated logical components:
  1. **Question Factory:** scheduled/offline, provider-neutral draft generation and validation with budgets/retries/recovery. No student-request generation; no direct publication authority.
  2. **Question Bank:** stable identity and immutable versions, source/rights/provenance, equivalence/duplicate handling, independent human approval/publish gate.
  3. **Practice Web:** assembly of human-approved bank content into persistent attempt/form snapshots, independent timers, autosave, scoring, history; cannot claim to be the official TSA exam.
- Original dataset goal: **30 vetted questions**: 12 Math, 6 Reading, 12 Science. Three independently launched mini-tests: **MATH 4**, **READING 2**, **SCIENCE 4**; each has its own attempt, timer, submission, score, history. Generic storage can support multi-section profiles later, but MVP does not chain tests and does not fabricate an official combined score.

## Owner-approved decisions (do not change without new owner instruction)

- **H1:** globally at most one active attempt per student in `CREATED`/`IN_PROGRESS` (across practice modes). Replaying same idempotent key/body returns existing receipt; different key with an active attempt returns HTTP 409 `CONCURRENT_ATTEMPT_EXISTS`. Expired active attempt cleanup has transactional obligations.
- **H2:** admission-only `[available_from, available_until)` for creation/first start; after valid start, full duration can continue beyond admission close.
- **H3:** one TSA domain section per independently launchable MVP test; section-entry ID is separate from domain enum.
- **Start TTL:** mandatory 600 seconds. `attempts.start_before_at TIMESTAMPTZ NOT NULL` stored at creation, immutable; `min(created_at + 600 seconds, admission_until_at_creation)`; exactly at deadline cannot start. No unlimited fallback. CreationReceipt gives original deadline; AttemptView gives it only in `CREATED` state, otherwise null.
- **Ordinary admission schedule edits:** **non-retroactive** for already CREATED attempts. Do not recheck current mutable admission windows to invalidate their committed eligibility. Explicit withdrawal, rights revocation, security invalidation remain independent overriding guards.
- **Reuse:** `PERSONALIZED_PRACTICE + NEW_ONLY`, student-specific permanent assignment history at `CREATED` commit, excluding equivalent questions; abandoning an attempt does not refund unseen inventory.
- **G0:** human owner authorized development/testing, local/free no-charge LLM, dataset research, and deployment preparation. **Only AI-spending restriction explicitly imposed:** no paid LLM API calls without new human approval. This permission never waives external law, copyright, privacy, security, or publish/release gates.
- **ADR statuses:** the full ADRs, including ADR-004 as a whole, remain `PROPOSED`; scoped owner approvals above do not approve each ADR in its entirety.

## Latest implementation evidence / Git state (verify on takeover)

- Latest **reported** audit checked `main` at **`77d6239`** with a clean working tree; do not presume this is still HEAD.
- Foundational TypeScript/Zod shared contracts under `packages/contracts/`: canonical `question/1`, safe student projection, typed API errors, blueprint/attempts, answer/result/history, draft-only Factory-to-Bank handoff, reference xorshift32/Fisher–Yates, producer/consumer and renderer-compatible synthetic vectors.
- Deterministic student-safe OpenAPI 3.1 components JSON; scripts to generate/check drift. **No endpoint operations or generated endpoint client yet.** Do not expose internal Factory contracts in student OpenAPI.
- GitHub Actions workflow `.github/workflows/contracts.yml` checks Node 24, `npm ci`, typecheck, tests, OpenAPI drift, docs and whitespace. Clean clone reported successful locally. **No evidence of a hosted GitHub Actions run**.
- Latest read-only **G1-ACCEPTANCE-001** audit reported checks PASS: `npm run typecheck`; `npm test` (**8 test files**); `npm run contracts:check`; `npm run docs:check` (0 errors; only historical whitespace warning); `git diff --check`; dependency manifest/lock consistency. Audit changed no files. Re-run for current checkout as needed.
- Important historical checkpoint commits from owner logs: `f7e6c3f` OpenAPI generation, `c465370` documentation checker, `4d005a1` blueprint/attempt, `b65da07` result/history, `292a4d2` missing OpenAPI registrations, `0dbc7ae` Factory/Bank. Later commits are likely present: verify via Git.
- `FOUND-002` remains **IN_PROGRESS**; **G1 NOT ESTABLISHED**; `DATA-001` **BLOCKED** by both prerequisites. `FOUND-007` is reportedly still `PROPOSED`/not accepted, even though documented error taxonomy and runtime tests agree. Do not silently mark it accepted.
- 36 backlog task IDs; G0→G1→G2→G3 gating dependencies; architecture QA checked DAG at 40 nodes/102 edges historically; verify if edited.

## G1-ACCEPTANCE-001 audit: actual remaining criteria/gaps

The latest audit was a **read-only assessment**, not a new owner approval. The report distinguished G1 blockers from later runtime/system tasks:

1. **FOUND-007** explicit owner disposition/acceptance pending, although existing codes are consistent: HTTP 422 `INSUFFICIENT_ELIGIBLE_INVENTORY`, HTTP 422 `INSUFFICIENT_UNSEEN_INVENTORY`, and distinct HTTP 503 `SEARCH_EXHAUSTED` (not an infeasibility proof). Typed `StudentShortage` must be compatible with `ErrorResponse`. **Owner has not approved closing the task.**
2. **Canonical content identity / hash / duplicate fingerprint:** define exact immutable fields and versioned byte serialization, input encoding, reference/self-reference rules, Unicode/whitespace handling, digest/fingerprint encoding and golden vectors. A suggested (not approved) approach preserves authored content and normalizes only separate fingerprint inputs.
3. **Assembly replay:** complete tie rules, bounded search node counting, final ordering, manifest-to-slot fixtures, publication-lock namespace/encoding. Reference xorshift32-v1/Fisher–Yates tests exist but their governing ADR remains proposed; no silent production approval.
4. **Factory-to-Bank package transport:** missing complete stimulus/assets payloads and exact source/rights evidence; operational `factory-config/1` scheduling/budget configuration belongs mainly to later Factory tasks rather than necessarily G1.
5. **OpenAPI/client contract:** currently components-only; accepted route operations, generated client/types, and strict compatibility/drift evidence still incomplete. No invented endpoints.
6. **Result/review contract:** documented `GET /result` released payload contains items/keys/explanations while public `ResultView` excludes them and private `AuthorizedReleasedReview` is not in OpenAPI. Align wire shape with owner/authorization rules before contract freeze; backend enforcement is later work. Outgoing audit recommended retaining documented owner-only released endpoint rather than inventing a new route, **not approved**.
7. **Build, reproducibility and dependency evidence:** build script/target acceptance not yet proven, GitHub-hosted CI unverified, version/support/license/advisory review record missing.
8. **Fixtures/import boundary:** independently consumable producer/consumer fixtures, changed-response/optional-field compatibility, and public/private bundle boundary need evidence; shared-package tests do not prove runtime service interoperability.

The audit explicitly said actual DB concurrency, publication transaction, browser bundle scan, provider calls, scoring enforcement, load, and deployed-service tests are later work, not extra G1 exit criteria.

**DATA-001** currently requires accepted FOUND-002 **and** G1. The coordinator cannot bypass this gate without a new explicit, recorded owner authorization and dependency update.

## Unapproved options from the outgoing ChatGPT conversation

The prior assistant proposed: accept existing FOUND-007 taxonomy, preserve authored bytes for content hash, freeze assembly-v1 after complete vectors, and reconcile released-result wire shape. **These are proposals, not owner decisions.** The user explicitly stopped before following them.

Avoid treating `FOUND-007` as a mandatory *next* step solely due to the predecessor's preference; inspect task critical path and ask the owner what to prioritize. Avoid serial documentation-only prompts when a bounded code, research or CI deliverable can move the project forward without bypassing the gates.

## What the owner wants from you now

1. Take responsibility for **prompt writing, task decomposition, agent assignment, progress checking, and inter-agent handoffs**.
2. Preserve continuity when a successor replaces you: maintain this baton, cite live evidence, leave no dependency on your memory/persona.
3. Keep tasks short, scoped, English-language, testable, with explicit file ownership and no unauthorized commits or paid LLM API calls.
4. Keep the dataset/model research track visible. The academic project's main difficulty is **quality-controlled TSA question generation**, not only web infrastructure. It can proceed in parallel where gate rules permit.
5. On first response, summarize verified repo state and provide 1–2 options without unilaterally approving the outstanding FOUND-007/content-identity/assembly decisions. No work is queued for automatic execution by this handoff alone.

## Files to inspect first

```
AGENTS.md
docs/agents/ORCHESTRATION_PROTOCOL.md
docs/agents/ORCHESTRATOR_HANDOFF.md
docs/agents/PROJECT_STATE.md
docs/agents/LAST_HANDOFF.md
docs/tasks/TASK_BACKLOG.md
docs/tasks/IMPLEMENTATION_ROADMAP.md
docs/decisions/OPEN_DECISIONS.md
docs/architecture/API_CONTRACTS.md
docs/specifications/QUESTION_SCHEMA.md
docs/specifications/EXAM_ASSEMBLY_SPEC.md
docs/specifications/QUESTION_FACTORY_SPEC.md
docs/quality/TEST_STRATEGY.md
packages/contracts/
.github/workflows/contracts.yml
```

Quick non-destructive verification:

```bash
git status --short
git log -5 --oneline
npm run typecheck
npm test
npm run contracts:check
npm run docs:check
git diff --check
```

Do not run broad installs or tests if the user only wants a prompt/handoff, or if the worktree/environment makes them inappropriate; explain what you verified and what remains reported only.

## Next baton update template

- **Updated at / time zone:**
- **Coordinator / replacement (optional):**
- **Branch / HEAD / working-tree status:**
- **Latest owner approvals / prohibitions:**
- **Tasks/gates completed, pending, blocked:**
- **Evidence and exact tests (pass/fail/not-run):**
- **Unapproved pending decisions:**
- **Current task ownership / allowed files / in-flight agents:**
- **Next authorized smallest action:**
- **Warnings / do-not-assume:**
- **Source-of-truth files to read:**
