# TSA-Platform — Orchestrator Handoff Baton

## Current policy update — Luna XHigh, 2026-10-18

Owner instruction: "CONFIGURATION UPDATE — LUNA XHIGH DEFAULT" authorizes this
configuration/documentation update and one local commit; no push, merge, agent
spawn or Stage 3 work. Coordinator/implementer: Codex Sol 6.1 / Medium for the
bounded configuration and integration checks. Starting branch:
`chore/codex-orchestrator-setup`, HEAD `8407bea5c26ba97e7b2d7086aa933fa6f331bdff`;
only the owner's preserved `AGENTS.md` was dirty. That commit finalized Stage 2,
including the exact-path documentation-checker repair.

Current configuration: coordinator Sol 6.1 / Medium; default worker, `tsa_scout`
and `tsa_builder` Luna / XHigh; `tsa_complex_builder` Terra / Medium;
`tsa_reviewer` Sol 6.1 / Medium. Explicit custom-role model/effort settings take
precedence over spawn/default settings. Normal discovery, implementation,
debugging and test development use Luna / XHigh. Terra requires a demonstrated
complexity/capability reason; Sol handles coordination and integration review.
Astra requires explicit owner approval; no Astra role is configured. Do not
select more expensive models merely for availability or repeat a failed approach.
See [dispatch controls](ORCHESTRATION_PROTOCOL.md#8-project-local-codex-dispatch-controls).

Verification on Codex 0.163.0: all five TOML files parse; only the three intended
reasoning values changed. `codex --strict-config doctor --json` passed (exit 0).
App-server `initialize` + `config/read` with cwd/includeLayers confirmed the enabled
project layer and effective Sol/Medium, Luna/XHigh defaults, workspace-write,
approval on request and network disabled. Explicit role fields were checked
against official precedence rules; Terra/Sol overrides remain Medium. The local
model catalog lists Luna XHigh support; quota and XHigh role execution are NOT
VERIFIED. No runtime delegation test was run. Final documentation/whitespace
check results are recorded in this configuration commit's message.

The Stage 2 record below preserves historical Low/Medium routing evidence; it
does not prove XHigh role execution. No agents were spawned for this update.
The active session has owner-supplied full-access/never overrides; project
workspace-write/on-request/network-disabled defaults remain unchanged. A Stage 3
writing pilot still requires a fresh verified workspace-write/on-request session
and an explicit owner assignment. Product decisions, backlog and PROJECT_STATE
remain unchanged; FOUND-002 is IN_PROGRESS, G1 NOT ESTABLISHED, DATA-001 BLOCKED.

## Current baton — orchestration setup, 2026-10-18

Owner authorization: "Proceed to ORCHESTRATOR SETUP ONLY"; project-scoped Codex
configuration and narrow operating documentation. No implementation pilot,
application feature, migration, contract change, backlog status change, gate
transition, commit, push or merge was authorized. Later rollout stages in the
owner's message are future templates, not active assignments.

- **Verified base:** `main` at `a4dda015d0af3aa1953d47b761a93761dedfa2ad`.
  Setup branch: `chore/codex-orchestrator-setup`, same HEAD, no commit.
  Owner's pre-existing dirty `AGENTS.md` is byte-for-byte preserved.
- **Setup-owned paths:** `.codex/config.toml`, four `.codex/agents/*.toml`, section 8
  of ORCHESTRATION_PROTOCOL, this current-baton section and the LAST_HANDOFF pointer.
  No other writer or task is reserved. Main's branch reference is unchanged.
- **Authority:** existing AGENTS/protocol/decision precedence is unchanged; dispatch
  controls extend [ORCHESTRATION_PROTOCOL section 8](ORCHESTRATION_PROTOCOL.md#8-project-local-codex-dispatch-controls).
  Backlog, decisions, PROJECT_STATE and user-level Codex config were hash-checked
  unchanged. FOUND-002 remains IN_PROGRESS; G1 NOT ESTABLISHED; DATA-001 BLOCKED.

### Verified capability and permission evidence

Codex CLI and running app-server: **0.163.0**. `codex debug models` catalog lists
`gpt-6-luna`, `gpt-5.6-terra`, and `gpt-6.1-sol`, with Low/Medium/High among their
supported efforts. Authentication diagnostics report ChatGPT login, no stored API
key; OPENAI_API_KEY was absent. No API-key runner or paid API was used. Catalog
presence is not proof of quota or an execution test for every model.

| Route | Configuration | Execution evidence |
|---|---|---|
| Coordinator | Sol 6.1 / Medium | Native validation parent recorded this model/effort |
| `tsa_scout` | Luna / Low | Custom role spawned and completed; runtime metadata verified |
| `tsa_builder` | Luna / Medium | TOML parsed; model catalog confirms ID; role execution NOT RUN |
| `tsa_complex_builder` | Terra / Medium | CLI catalog confirms `gpt-5.6-terra`; execution NOT RUN; current outer spawn tool does not list Terra |
| `tsa_reviewer` | Sol 6.1 / Medium | TOML parsed; model catalog confirms ID; independent review NOT RUN |

`codex --strict-config doctor --json` passed configuration loading. App-server
`initialize` + `config/read` with cwd/includeLayers verified an enabled project
layer and effective Sol/Medium, workspace-write, network disabled and approval
on request. The project layer contains a two-spawned-thread limit and Luna/Low
default. No global config, project trust or managed permission policy was changed.

**Permission limitation:** the active setup session already had full-access/never
overrides. Project defaults do not retrofit it. The read-only CLI probe requested
approval on request, but `codex exec` recorded **never** for its parent and child;
both retained a **read-only** sandbox. No full-access setting or approval bypass
was added. A writing pilot must run in a fresh verified workspace-write/on-request
session, not this overridden session or the tested non-interactive exec path.
Read-only custom-role instructions alone are behavioral, not OS isolation.

### Genuine delegation proof

- Native parent thread: `01a14f83-a73d-73e0-8be8-360d54df80a3`.
- One child: `01a14f83-fce6-7743-b30a-611db35a939a`, task
  `/root/stage2_scout_validation`; spawn used `agent_type="tsa_scout"`,
  `fork_turns="none"`, without a model override.
- Child source metadata records `agent_role="tsa_scout"`, depth 1, that parent;
  turn context records **gpt-6-luna / low**, read-only. This is runtime evidence,
  not the child's model self-report. No nested or additional child was created.
- Child findings: no root build script (`package.json` scripts); OpenAPI has
  **18 schemas / zero paths** (`student-contracts.openapi.json` lines 4/5182).
  It inspected with `rg`, `nl`, `sed` and Python JSON parsing. Initial `python`
  was unavailable; retry with `python3` produced the counts. No build/tests ran
  inside the child. One handoff clarification reused the same child.
- Repository file hashes before/after delegation: **zero changed/new/deleted files**,
  excluding Git internals and pre-existing dependencies. Parent/child performed no
  edits. Child completed; explicit thread-close capability was unavailable.
- Usage from local final token events: parent 163,650 input (143,744 cached),
  1,564 output; child 84,714 input (47,872 cached), 1,632 output. These are cumulative
  per-turn token counters, not unique context size, plan credits or a cost estimate.
  Relative usage: MEDIUM due to harness/context overhead despite a tiny task.

Local proof locations (not required for successor context): parent/child rollout
JSONL files under `~/.codex/sessions/2026/10/18/`, named with the thread IDs above;
sanitized probe summaries in `/tmp/tsa-setup-config-proof.json` and
`/tmp/tsa-setup-delegation-proof.json`. No full transcript is copied into the repo.

### Verification and next authorization

TOML parsing: all five files PASS. Strict configuration load and effective project
layer: PASS. Custom scout routing/read-only task and no-file-change comparison:
PASS. Inspection-only probe corrections: `--strict-config` is unsupported on
`codex debug`; rerun without it passed. A temporary RPC reporting script initially
assumed an optional `disabledReason` field; reading it as optional fixed reporting.
Neither issue required changing the project settings or application.

Final checks on Node **v24.18.0** / npm **11.16.0**: `npm run typecheck`, `npm test`
(**42 cases / eight suites**, zero failed/skipped), `npm run contracts:check`,
`npm run docs:check` (21 required docs, 187 links, 36 tasks, zero errors; preserved
historical whitespace warning), and `git diff --check`: **PASS**, exit 0 each.
Protected-file hashes matched. No clean install, hosted CI, DB/browser test or gate
acceptance is implied. Refer to LAST_HANDOFF for historical contract verification,
not native role-routing proof. Independent implementation review: NOT PERFORMED.

**Next proposed pilot:** one FOUND-002 executable shared-contract build and emitted
JS smoke test, preserving existing schemas/exports, no dependencies or application
features. Owner must accept setup and explicitly assign the single pilot with its
file allowlist/tests; use a separate feature branch/worktree and a fresh verified
permission session. No pilot is queued. If native custom roles cannot be selected
by the chosen client, use section 8's explicitly model-selected/manual fallback and
report the limitation. No Astra, paid fallback or automatic gate advancement.

## Historical baton — 2026-10-17 (verify before reuse)

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
