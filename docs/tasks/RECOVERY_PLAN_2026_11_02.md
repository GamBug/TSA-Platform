# Inherited-project audit and dated recovery plan

Date: 2026-11-02, Asia/Bangkok. Task: AUDIT-001. Accountable auditor: current
Codex root, sole implementer. Owner request: inspect the inherited structure,
establish progress and prepare a plan with concrete deadlines. This assignment
authorizes this documentation audit; future work below is PROPOSED and unassigned.
No architecture approval, content approval or deployment approval is implied.

## Finding

The repository contains a working local synthetic Track B demonstration with
substantial backend and browser verification records. It has progressed beyond
architecture planning. The full Technical MVP, AI Research Demonstrator and Final
Integrated Deliverable have not met all acceptance criteria. A numeric completion
percentage would conceal their different engineering and human acceptance gates.

VERIFIED means directly inspected or executed in this audit. Historical runtime
results below are VERIFIED as repository evidence, not freshly reproduced runtime
behavior. ASSUMPTION marks scheduling estimates. REQUIRES_VERIFICATION marks open
acceptance. No new external research claims are made.

## Structure inspected

| Path | Present responsibility and limits |
| --- | --- |
| `apps/practice-prototype/` | Browser UI and server; mock B0 and opt-in persistent student/staff modes. The name does not mean every mode is mocked. |
| `src/modules/` | Database, source rights, Bank ingestion/review/publication, assembly, attempts, grading jobs and scoring. Node ESM implementation. |
| `src/http/`, `src/local/` | HTTP adapters, synthetic identity and local PostgreSQL orchestration; production identity remains separate. |
| `packages/contracts/` | TypeScript runtime schemas, student/staff/private export boundaries, generated OpenAPI and operation maps. |
| `db/migrations/` | 26 SQL migration files in the working tree; 026 belongs to the uncommitted Reading experiment. File presence is not proof of application to a database. |
| `tools/question-factory/`, `tools/reading-research/` | Offline/manual Reading generation, validation and private capture analysis; these tools are untracked in the starting tree. |
| `tests/`, `scripts/` | Unit/contract, real-PostgreSQL integration, critical lifecycle and browser journey checks plus demo launchers. |
| `docs/` | Specifications, scoped decisions, task records, evidence and operator guides; current and historical statements coexist. |
| `data/`, `.local/` | Research/private local artifacts. Do not assume all are committed or reproducible; captured source rights remain unresolved. Raw content was not opened for this audit. |
| `infra/`, `services/`, `workers/` | No files returned by the scoped file search; these directories do not establish implemented infrastructure or separate deployed services. |

VERIFIED baseline: branch `feat/track-b-data-auth`, HEAD `a70861a` (2026-10-27,
saved-attempt recovery). Starting Git status: 13 modified tracked paths and
17 untracked entries (entries may be directories). Prior changes were preserved.
Installed Node 24.18.0 / npm 11.16.0 match root engine pins. No installation ran.

## Delivery position

| Area | Evidence-backed position | Remaining acceptance |
| --- | --- | --- |
| Track B student journey | Local three-domain PostgreSQL allocation, server timing, acknowledged saves/reload, submit, grading, released explanations and history have recorded automated results. Fixed/review/short profiles exist in scoped opt-in modes. | Fresh reproduction of the inherited working tree; qualified human accessibility and real-content evidence. |
| Track B staff | B1–B9 provide scoped draft editing/inspection, evidence reads, handoff, rejection/quarantine, history, preflight, diagnostics, stock rehearsal and fixed sealing. | Website is not a complete real-content CMS; qualified approval/publication and rights attestations are not supplied by synthetic controls. |
| Integrity/security/recovery | Recorded ownership/CSRF/Origin, immutable snapshots, concurrency, worker/recovery and browser checks; TEST-002 remains partial. | Current release matrix, remaining scenario coverage, dated dependency review and independently reviewed candidate. |
| Reading Factory INT-003 | Offline 20-question fixture flow has recorded import/browser evidence; manual batch contains 10 AI-authored DRAFT questions. | Human-approved count is 0 in the manual-batch record; one cognition flag and nine distractor cautions remain. Manual null usage/internal-only rights transport proposal is unapproved. |
| Capture research INT-003-R | Synthetic tooling tests and one-question capture are recorded. | Representative operator pilot, rights and visual checks remain open. Full extraction was deferred and must not resume under this plan. |
| Full Track A | Partial experimental tooling exists. | AI-001/002, FACTORY-001/002/003 and full A/B/I/J production/recovery evidence are not established by INT-003. |
| Release operations | Local restore/outage/upgrade evidence exists. | Production identity, hosting/region, privacy/retention, approved load target and deployment acceptance remain unresolved. |

Sources: [current state](../agents/PROJECT_STATE.md),
[local acceptance matrix](../reviews/TRACK_B_LOCAL_ACCEPTANCE_2026_10_25.md),
[Reading evidence](../reviews/READING_FACTORY_EXPERIMENT_VERIFICATION.md),
[manual batch](../reviews/INT_003_FIRST_MANUAL_LLM_BATCH.md),
[content requirements](../guides/TRACK_B_CONTENT_HANDOFF.md).
G1/G2/G3 are owner-accepted in their recorded scopes; they do not establish
real-content, whole-ADR or production acceptance.

## Inheritance risks to resolve first

1. Uncommitted runtime, migration, tools and evidence changes mean HEAD alone
   cannot reproduce the latest claimed Reading functionality. Inventory their
   provenance and scope before integration; never reset or bulk-stage the tree.
2. `AGENTS.md` retains the documentation-only default, while decisions record
   later scoped implementation authorizations. Those records explain existing
   code; this audit does not silently replace the default or authorize new scope.
3. README sections still describe absent allocation/scoring/browser integration
   after newer sections describe them. Backlog AI-001/FACTORY and INT-002 retain
   old G1/G2 blockers despite accepted gates. Acceptance records also contain
   superseded fixed-form statements. Reconcile current summaries while retaining
   dated historical evidence; do not automatically mark whole cards complete.
4. Real accepted inventory remains unverified. The existing target is 30 accepted
   items (12 Math / 6 Reading / 12 Science), not 30 generated candidates. The
   Reading20 experiment is separate from this target and the original 4/2/4 MVP.
5. Untracked `data/research/` contains captured third-party material according to
   the handoff. Inventory paths privately; keep raw material out of patches,
   commits and uploads without the required rights evidence.

## Dated execution plan

Execution checkpoint2026-11-05: the dates below remain targets, not completion
claims. Current recorded progress is:

| Work package | Current execution position |
| --- | --- |
| RP-01 | RECOVERY-001/003/004 completed baseline/navigation, populated026 preservation and portable source reproduction ahead of Nov4; HEAD alone still omits inherited uncommitted files. RECOVERY-014 corrects tracked-only doc-check coverage:27 authored untracked documents/155 outgoing links now checked, root/reviewer6PASS; protected inputs preserved. |
| RP-02 | Q-01–Q-16/A–J evidence map prepared; RECOVERY-006/007 add fresh service/second-engine/keyboard/native-zoom results. RECOVERY-012 adds independently reviewed raw/canary privacy scans over156 real HTTP responses with root/reviewer2/static4/student44PASS. RECOVERY-013 adds actual Factory LOGIN/livelease30denials with root/reviewer1/fullgrading24PASS. Full scenario, human and release acceptance remain incomplete. |
| RP-03 | No genuine human-approved real starter stock established; target12/6/12 and named rights/subject reviewers remain external inputs. |
| RP-04 | Fresh automation passes; qualified human assistive-technology/usability review remains pending and cannot be replaced by AX checks. |
| RP-05 | Actual baseline failures and RECOVERY015/016 stale read/ack/auth-denial cache races repaired and independently reviewed; final focused20/B049/student45/Chrome78PASS. Accepted-content/manual acceptance gates still prevent full Technical MVP closure. |
| RP-06 | Same ten manual DRAFTs revised privately in RECOVERY018 with two actual fresh blind AIcritics; final10key/cognitionagreements/0reportedflags, structural10/manual26/metadataPASS. Human0/Bank0/internalrights/unknownusage and transport proposal remain gates. RECOVERY-008/010/011 separately compose generic provider-free export/actual Bank DRAFT proof across all9 domain/type cases (focused11/combinedAI73PASS), no stock selectable. Full durable Factory planner/executor and real-model/human acceptance remain separate. |
| RP-07 | Current-tree and isolated portable synthetic verification plus dated audit0 support preparation. RECOVERY017 adds offline77/checker6 regressions to existing CI configuration with actual independent review/local runs; no hosted result. Not an accepted release candidate or production operations evidence. |
| RP-08 | Owner final demonstration/acceptance remains future work with the same prerequisites. |

Nov4 gate disposition: named human reviewers/capacity and actual accepted content
are still absent. As planned below, Nov27 remains a synthetic local engineering
candidate target; the accepted-content Technical MVP date stays conditional.
No missed input is silently converted to acceptance. Current implementation
evidence: [generic export/import](../reviews/RECOVERY_GENERIC_EXPORT_2026_11_04.md).

Nov4 continuous-work supplement: RECOVERY015/016 fixed reproduced client cache/
identity races, RECOVERY017 wired existing offline regressions, RECOVERY018 revised
the same10manual drafts with fresh blind AIcritique and private handoff, and
RECOVERY019 completed independently reviewed manual transport design preparation.
The manual-only local architecture decision is requested asynchronously, pending
owner response; implementation is not approved. This advances engineering and
review readiness without converting AI feedback into human content acceptance.

November 5 checkpoint: [RECOVERY-020](../reviews/RECOVERY_OPERATION_IDENTITY_2026_11_05.md)
closes a reproduced whole-operation identity gap ahead of the RP-02 November 6
deadline. Actual valid-session swaps cause no allocation or durable budget/receipt
changes. Final offline84/B049/student45 and Chrome three-domain78-response checks
pass; independent review reports no material findings. No full RP-02/RP-05
acceptance or architecture disposition is inferred. The November 6 rights/source
manifest and named human-review inputs remain due under RP-03; no evidence of
their completion is supplied by these client tests.

The [reconciled RP-02 evidence map](../reviews/RECOVERY_ACCEPTANCE_MATRIX_2026_11_02.md)
now distinguishes those recovery runs from predecessor-only evidence. Actual
independent review removed an incorrect planner-approval dependency for J:
separately scoped second-adapter comparative fixtures can be investigated within
approved contracts. Scheduler/reservation, media and manual transport proposals
retain their specific gates. No full scenario or milestone is marked accepted.

The resulting [Reading generation-path comparison](../reviews/RECOVERY_PROVIDER_REPLACEMENT_2026_11_05.md)
now verifies that bounded J subcase through actual canonical Bank/publication/
exam services. Two local synthetic paths retain equal semantic results; command
metadata remains distinct and generation is absent from student operations.
Independent focused review and affected-suite execution pass. This does not
establish two vendor adapters, calibrated quality or complete Track A acceptance.

RP-02's missing [fresh staff browser results](../reviews/RECOVERY_STAFF_BROWSER_2026_11_05.md)
were executed November 5 in Chromium and Firefox. Both passed within their actual
scope; Firefox's narrow window was 500px, not the requested 450px. Together with
the reconciled map and prior student runs, this supplies current assessment
evidence before November 6. No new code defect emerged; full critical-matrix,
human/content/accessibility and release acceptance remain separate.

RP-07 preparation now has a [current frozen source reproduction](../reviews/RECOVERY_CURRENT_SOURCE_REPRODUCTION_2026_11_05.md)
including the subsequent client/Factory work. Its first attempt exposed an actual
tracked-fixture checker failure; the narrow repair retains unrelated-artifact
rejection. The new source-only archive and all 17 fresh verification stages pass,
with actual independent isolation/evidence review. This closes current portable
source preparation, not the November 25 clean-release, hosted CI, traffic/data
or human/production acceptance dependencies. No milestone date is redefined.

The same checkpoint's [dated dependency review](../reviews/RECOVERY_CURRENT_SOURCE_REPRODUCTION_2026_11_05.md)
now records the November 5 registry advisory result with unchanged package/lock
hashes. Owner-requested AgentKit hook inspection is recorded separately; installed
automation supports execution and does not approve pending architecture or
replace content/rights/accessibility/operational inputs.

RECOVERY-005's independently reviewed media design remains PROPOSED awaiting the
specific owner disposition requested asynchronously. Independent fixture work
does not authorize its new inspection/storage/guard changes. Current evidence:
[latest handoff](../agents/LAST_HANDOFF.md).

All deadlines are **18:00 Asia/Bangkok (UTC+7)** on the stated date. Dates are
ASSUMPTION-based targets, not owner commitments. Capacity assumption: one
accountable engineering agent working sequentially, owner available at gates,
and qualified human reviewers available for scheduled review sessions. No agent
delegation occurs in this audit. Proposed independent review requires a separately
assigned reviewer and recorded results.

| Work package / existing task | Window and deadline | Accountable role to assign | Concrete exit evidence |
| --- | --- | --- | --- |
| RP-01 Baseline and navigation / AUDIT-001 follow-up | Nov 3–4; **2026-11-04** | Engineering integrator | Owned/unowned diff manifest including untracked files; reconcile current status and obsolete blocker text; reproducible local start/stop; run pinned build/contracts and relevant PG/browser baseline. Record failures with exact environment. No commit without explicit authorization. |
| RP-02 Acceptance matrix / TEST-002, TEST-001 | Nov 5–6; **2026-11-06** | QA/integration engineer | Q-01–Q-16 and A–J mapped to exact executed evidence or an explicit gap; separate Track B requirements from full Track A scenarios; prioritized defect list and fresh student/staff browser results. |
| RP-03 Lawful starter content / DATA-002, BANK-002 | Nov 3–11; **2026-11-11** | Human owner coordinating authors, rights attestor and independent subject reviewers | Named participants by Nov 4; source/rights manifest by Nov 6; exact-version dispositions for target 12/6/12 by Nov 11. Record accepted count, bundle/skill feasibility and shortages. AI cannot substitute for these signatures. |
| RP-04 Manual accessibility / WEB-004 | Nov 9–12; **2026-11-12** | Qualified human tester with engineering support | Existing manual packet executed for screen reader, keyboard, actual 200% zoom and supported journeys; device/browser/AT versions, findings and dispositions. Automated AX evidence remains separately labelled. |
| RP-05 Technical MVP closure / WEB-002/004, TEST-002 | Nov 13–18; **2026-11-18** | Engineering integrator | Fix actual RP-02/04 findings; repeat affected checks; run accepted-content workflow only in its authorized environment and with genuine evidence. Show independent 4/2/4 journeys, NEW_ONLY shortage, immutable scores and protected review. Unmet content gates keep milestone incomplete. |
| RP-06 Bounded AI decision / INT-003, INT-002, INT-001 | Nov 19–20; **2026-11-20** | Owner/content reviewer with engineering support | Disposition existing ten drafts and transport proposal. If rights/format/approval are resolved, demonstrate exact approved factory-version receipt → Bank → student with factory stopped. Otherwise deliver blocked-gap report and retain offline synthetic demonstration. Full factory scheduling is outside this milestone. |
| RP-07 Candidate verification / TEST-001, OPS-001 preparation | Nov 23–25; **2026-11-25** | QA/integration engineer | Candidate snapshot manifest, clean reproduction, build/type/contract/PG/browser/security and scoped restore results; date dependency review. Define pilot traffic/data envelope and remaining operational decisions. Independent review requested only when assigned; no approval inferred. |
| RP-08 Contingency, demonstration and handoff | Nov 26–27; **2026-11-27** | Engineering integrator + human owner acceptance | Resolve candidate blockers, rerun affected checks, demonstrate agreed scope and deliver final acceptance matrix/runbook/limitations. Record owner disposition. Public deployment remains a separate decision. |

RP-03 human work can proceed while the single agent executes RP-01/02. The
critical path is baseline → evidence gaps + human inputs → repairs → candidate
verification → owner acceptance. Nov 26–27 provide two working days of contingency.

## Recommended agents for the work packages

These recommendations are conditional on model availability in the owner's
existing Codex Plus / Antigravity PRO subscriptions. No current availability or
quota was checked; fallback is an available subscription model with the closest
reasoning setting. No paid LLM API calls. No recommendation assigns a worker or
establishes that independent review happened.

| Packages | Recommended implementing platform / model / reasoning | Task-specific reason and separate review |
| --- | --- | --- |
| RP-01 | Codex / gpt-6.1-sol / high | Cross-reference inherited diffs, scoped approvals and runtime evidence. Separate reviewer: Codex gpt-6.1-sol / medium if assigned. |
| RP-02, RP-07 | Codex / gpt-6.1-sol / high | Assess race/privacy oracles and distinguish missing evidence from passing checks. Separate read-only reviewer: another assigned Codex gpt-6.1-sol / medium session. |
| RP-03 | Human content/rights owners; Codex / gpt-6.1-terra / high for metadata support | Human qualification and rights decisions require actual people; agent support can check exact-version manifests. Independent subject reviewer must be a qualified human distinct from the author. |
| RP-04 | Qualified human AT tester; Codex / gpt-6.1-sol / high for repair support | Manual usability findings need actual observation; engineering support handles state/focus regressions. Human retest plus separately assigned code reviewer for critical repairs. |
| RP-05 | Codex / gpt-6.1-sol / high | Repairs span student state, server timing and Bank boundaries. Separate read-only gpt-6.1-sol / medium reviewer for critical changes. |
| RP-06 | Codex / gpt-6.1-terra / high plus human reviewer | Track private provenance/transport decisions without treating AI critique as publication approval. Separate engineering reviewer if a contract delta is approved. |
| RP-08 | Codex / gpt-6.1-sol / high plus human owner | Consolidate reproducibility, acceptance gaps and durable handoff; owner supplies acceptance disposition. |

## Gates and fallback dates

- **Nov 4:** If human reviewers/capacity or content scope are unavailable, record
  that the Nov 27 target is a synthetic local engineering candidate. Keep the
  accepted-content Technical MVP date conditional.
- **Nov 11–12:** If content/accessibility evidence misses its deadline, publish
  the shortfall immediately. Continue safe regression/repair work; do not invent
  acceptance, weaken NEW_ONLY or label drafts eligible.
- **Nov 20:** An unresolved manual transport proposal or draft-quality issue
  leaves the real-content Factory integration blocked. Preserve offline tooling
  as a separate demonstration and list full Track A work explicitly.
- **Nov 25:** Any unresolved critical candidate defect prevents acceptance on
  Nov 27. Record a revised dated plan with remaining effort/dependencies; elapsed
  time is not approval.

**Target on Nov 27:** reproducible local candidate, current evidence matrix and
handoff; accepted-content Technical MVP and bounded real-content integration only
if their human and technical gates pass. Full scheduled Track A and public
production launch are **not dated commitments** in this plan. Their next planning
decision is due Nov 27 after scope, identity/hosting/privacy and capacity inputs
are available. No existing contract or milestone is redefined by this schedule.

## Audit verification executed on 2026-11-02

Environment: existing installed Node 24.18.0 / npm 11.16.0, inherited working tree.

| Command | Observed result | Scope |
| --- | --- | --- |
| `git status --short`; `git branch --show-current`; `git log -5 --format='%h %ad %s' --date=short`; `git diff --stat` | Exit 0; baseline above | Repository provenance, not runtime acceptance. |
| Scoped `rg --files` and task/document reads | Structure and status records inspected | No raw captured question content inspected. |
| `npm run docs:check` | Exit 0, no errors; preserved historical whitespace warning | Structural/link checks; not semantic approval. |
| `npm run test:b0` | Exit 0, 5 passing test-file entries, no skips | Runner summary is file-level; not five individual behavioral assertions. |
| `node --test tests/ai/manual-reading.test.mjs tests/ai/reading-factory.test.mjs tests/ai/reading-research.test.mjs` | Exit 0, 41/41 passing, no skips | Offline/synthetic checks; no real provider inference or human approval. |
| `npm run typecheck` | Exit 0 | Shared-contract TypeScript check. |
| `npm run contracts:check` | Exit 0, generated artifacts match registries | Contract consistency. |
| `npm run test:scoring` | Exit 0, 1 passing test-file entry, no skips | Pure scoring suite. |

Full PostgreSQL, browser, load, production and manual accessibility checks were
NOT RUN in this documentation audit. Historical results remain attributed to
their original records. Independent review NOT PERFORMED. No code, dependencies,
research or contracts changed; no commit/push/merge/deployment occurred.
