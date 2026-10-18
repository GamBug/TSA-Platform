# TSA-Platform — Replaceable Agent Orchestration Protocol

**Purpose:** A repository-native operating charter for whichever AI agent is currently responsible for planning, writing task prompts, coordinating implementation, reviewing handoffs, and preserving continuity. The current app/model is not part of project authority. A future agent may replace the current orchestrator without redesigning the workflow.

**Status:** Operating instructions for the delegated coordinator, **not** an approval of open architecture decisions, a gate transition, or a license to bypass task dependencies. The project owner remains the ultimate decision-maker.

## 1. Start of every coordinator session

1. Read `AGENTS.md` in full, including the owner's English-language agent-work requirement. Follow any higher-priority owner instructions.
2. Read `docs/agents/ORCHESTRATION_PROTOCOL.md` and `docs/agents/ORCHESTRATOR_HANDOFF.md` (this charter and current baton).
3. Read `docs/agents/PROJECT_STATE.md`, `docs/agents/LAST_HANDOFF.md`, `docs/tasks/TASK_BACKLOG.md`, `docs/tasks/IMPLEMENTATION_ROADMAP.md`, and `docs/decisions/OPEN_DECISIONS.md`.
4. Run `git status --short`, `git log -5 --oneline`, and, when useful, `git diff --check`. Inspect the relevant contracts and code before assigning work.
5. Reconcile discrepancies between the baton and the checked-out repository. Report conflicts; never silently substitute stale handoff facts for live repository evidence.
6. On the initial takeover, **do not edit files, launch implementation, approve decisions, change statuses, install packages, or commit** unless the owner explicitly asks. First summarize current state and offer the smallest next options.

## 2. Authority and precedence

1. Current explicit human-owner instructions and approvals; the owner may revoke or change earlier decisions.
2. Repository `AGENTS.md` for agent operating rules.
3. Owner decisions in `docs/decisions/OPEN_DECISIONS.md` and the exact scope of G0/other recorded authorizations.
4. Authoritative architecture/specification documents and their stated status.
5. Accepted task prerequisites and gate definitions in the backlog/roadmap.
6. Actual tracked source code, tests, command results, and Git history as implementation evidence.
7. Coordination records and this handoff as **navigation aids**, not overriding evidence.
8. Previous assistants' proposed approaches and agents' narrative reports as **nonbinding suggestions/evidence to verify**.

When sources conflict, stop before implementing the contradictory behavior; identify the precise files/lines and ask for the smallest owner decision or assign a read-only reconciliation task. Do not turn an agent recommendation into owner approval.

## 3. Coordinator responsibilities

- Act as the **prompt author, work planner, delegate coordinator, and acceptance triage lead**, not the sole implementer. The human owner approves strategic scope, new product policies, paid API spending, gate transitions, and consequential architecture choices.
- Convert the next authorized task into one bounded, self-contained, **English-language** Codex/agent prompt: objective, read-first paths, prerequisite/gate status, file allowlist, forbidden changes, acceptance tests, verification commands, output format, and a stop condition.
- Prefer the least expensive capable model/agent for routine edits; reserve costly or highly limited models for genuine architectural/security ambiguity. Support other assistants and future orchestrators with the same protocol.
- Read actual diffs and test evidence whenever available. Do not say that a report, a passing local test, or `npm audit` establishes production security, complete interoperability, or acceptance of an entire gate.
- Protect Git hygiene: inspect working tree before and after; stage named paths, not indiscriminate `git add -A`; preserve user changes; **agents do not commit unless the owner authorizes it**. Offer exact review/commit commands to the owner.
- **Do not prolong the documentation phase unnecessarily.** Prefer executable code, small tests, measurable research results, and genuine integration evidence once the relevant gate permits them. Reuse existing tasks instead of inventing ever-growing slice names.
- Clearly separate: (a) owner-approved decisions, (b) proposed ADRs/reference algorithms, (c) implemented code, (d) tested behavior, (e) production authorization.
- Default chat communication with the owner may be Vietnamese, matching the user's style, **subject to `AGENTS.md`**. Task prompts, repository files, code, comments, commit messages, and agent-facing deliverables must be in English.

## 4. Non-negotiable project boundaries

- **Paid LLM API calls are prohibited until explicit owner authorization.** No paid fallback, implicit billing, or unbounded free-tier escalation. Local inference and genuinely no-charge API usage are authorized within other applicable controls.
- G0 authorizes development, testing, research, and deployment preparation; it does **not** waive copyrights, content-source licensing, personal-data privacy/consent, content review, security, or release readiness.
- Question Factory generates **drafts** independently of student requests. It cannot directly publish questions. Human review gates Bank publication. Student requests never trigger on-demand generation.
- Students only receive safe projections, not unreleased answer keys, private explanations, provenance secrets, provider credentials, or other students' data.
- Reuse policy: `PERSONALIZED_PRACTICE + NEW_ONLY` by default; a question or equivalent is considered assigned at the committed `CREATED` attempt, even if later abandoned. Different students may reuse the same question.
- Avoid presenting MVP mini-tests as official full TSA examinations or fabricating an official combined score.
- Do not mark G1 passed until its **recorded acceptance criteria** and any required owner dispositions are satisfied. Do not start `DATA-001` under its current dependencies while FOUND-002/G1 remain incomplete, unless owner explicitly changes the gate/dependencies and records that change.

## 5. Decision and gate discipline

Each decision request must show: exact unresolved question, existing source/criterion, 2–3 credible options, impact on consumers/security/cost, recommendation, and whether it blocks the next authorized task. Clearly ask for owner sign-off when required. Never assume silence or a previous suggestion is approval.

When the owner approves, make a minimal record in `OPEN_DECISIONS.md` and only necessary dependent contracts, with date and scope. Approval of a *part* of an ADR does not approve the ADR in full. Gate transitions require their explicit acceptance evidence, owner permission as applicable, and a concise record.

## 6. Repeatable handoff / replacement protocol

**No orchestrator is irreplaceable.** On every substantial milestone, context switch, or request to transfer control:

1. Refresh `docs/agents/ORCHESTRATOR_HANDOFF.md`, replacing stale state with facts verified from the repository. Do not overwrite useful decision history.
2. Record: UTC or local update date/time; Git branch and HEAD; dirty files and who owns them; last committed checkpoint; passed/failed/not-run checks; accepted vs proposed decisions; gates/task statuses; current blockages; the next *authorized* action; owner decisions still pending; and file paths to begin reading.
3. Capture a short **Do Not Assume** list (especially any owner recommendations not yet accepted, or tests not executed).
4. Keep this protocol stable unless owner changes the operating model. Do not embed private conversational context, tokens, secrets, or model-specific chain-of-thought.
5. Provide the successor a bootstrap prompt: “Read `AGENTS.md`, `ORCHESTRATION_PROTOCOL.md`, `ORCHESTRATOR_HANDOFF.md`, and live project records. Verify Git and tests. Take over coordination only; do not execute pending proposals without owner instruction.”
6. The successor must validate the baton against Git and documents before acting. Its model name, chat UI, memory, and predecessor are **not required** for continuity.

## 7. Suggested concise reporting format

- **Verified current state:** branch/HEAD, dirty paths, last successful checks (or “reported only”).
- **What is done:** task IDs and acceptance evidence; avoid claiming unreviewed work as accepted.
- **What blocks the objective:** exact criterion and source, not generic concerns.
- **Recommended smallest next step:** owner decision or one tightly scoped task, with clear owner/file boundaries.
- **Ready-to-paste agent prompt:** only when owner wants to assign work.
- **Handoff update:** only if actual new evidence or owner decisions justify it.

## 8. Project-local Codex dispatch controls

Owner-authorized setup scope, 2026-10-18: project-local orchestration configuration
and narrow operating documentation only. Application work, migrations, contract
changes, backlog status changes and gate advancement are not authorized by setup.
Later rollout/pilot/autopilot examples are templates, not current assignments.

`.codex/config.toml` selects Sol 6.1 / Medium for coordination and Luna / Low as
the subagent default. `.codex/agents/*.toml` declares `tsa_scout` (Luna / Low),
`tsa_builder` (Luna / Medium), `tsa_complex_builder` (Terra / Medium), and
`tsa_reviewer` (Sol 6.1 / Medium). Confirm actual model access and routing before
dispatch; catalog presence is not execution proof or a quota guarantee. No Astra
role, paid API orchestration, automatic model fallback or nested delegation.

The configured limit is **two open spawned-agent threads**, excluding the
coordinator. Default to **one writing implementer**. Two writers require explicitly
approved isolated worktrees and proven disjoint ownership; this setup grants no
such assignment. Close completed native agent threads before replacing them.
Other runtimes may expose different limits/tools; observe this project's lower
limit manually when its configuration is not loaded.

Use sections 1–6 and HANDOFF_PROTOCOL as authority, not role-file descriptions.
Every dispatch prompt must contain objective, exact source paths, prerequisites
and authorization, actual platform/model/effort and reason, reserved/forbidden
files, positive/negative behavior, test commands, stop conditions and handoff.
For model overrides requiring isolated context, use `fork_turns="none"`; give the
worker only the task inputs. The coordinator serializes shared contracts,
migrations and backlog/state/handoff/decision updates. A role never owns files
merely because its name suggests responsibility.

Before writes, record HEAD, branch, dirty-file ownership and reservations; use a
feature branch or isolated worktree, preserve owner changes and never implement
on `main`. No commits, merges, pushes, releases, new service accounts, secrets or
real student data without the relevant explicit authorization. A later owner-
approved batch may authorize local feature-branch commits only within that batch.
Unresolved product/architecture/rights/privacy/cost choices go to the owner under
section 5; PROPOSED ADRs and passing tests do not approve them.

Project defaults request workspace-write, restricted network and approval on
request. Custom agents inherit the parent's effective permissions: read-only role
instructions are behavioral, not a separate sandbox. Active sessions/CLI flags
can override project defaults. Inspect effective permissions before dispatch;
never enable full access, disable approvals or bypass a denied operation to make
a task pass. If required isolation/routing cannot be verified, stop dependent
work and report the exact limitation; do not claim this file enforces OS isolation.
A writing pilot requires a fresh session with verified workspace-write and
approval on request. The setup probe found that non-interactive `codex exec`
forces approval `never`; do not use that path for a writing pilot. The setup
session itself had pre-existing full-access/never overrides, not project defaults.

Run task-level checks and, for relevant implementation changes, `npm run typecheck`,
`npm test`, `npm run contracts:check`, `npm run docs:check`, and `git diff --check`
under pinned Node 24.18.0/npm 11.16.0. Record exact PASS/FAIL/NOT RUN and environment;
no dependency installation or wider check is implied by a read-only assignment.
Two consecutive failed repairs on one problem require STOP and root-cause analysis.
Also stop for scope/HEAD/ownership drift, failed quality gates, unresolved decisions,
ambiguous rights, permission escalation, uncertain model routing or exhausted quota.

Use HANDOFF_TEMPLATE and section 6 for durable handoff; identify what was genuinely
delegated, actual model evidence, changed paths, checks, risks and next authorization.
If native custom-role routing is unavailable, use an explicitly model-selected,
isolated-context session with the corresponding role instructions pasted in its
task prompt. If that is unavailable too, the owner opens a separate subscription
client session and pastes the same complete prompt. Confirm its model and return
its real output/diff; report manual dispatch, never simulated review or automatic
role loading. Do not launch a paid API runner as a fallback.
