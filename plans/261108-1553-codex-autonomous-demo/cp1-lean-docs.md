# CP1: Lean docs (cut the cost of every future agent session)

Goal: an agent can start with less than 20 KB of navigation. History is preserved in Git and
`docs/archive/`. Leader reasoning: medium. Builder: `tsa_light_builder`.

## Allowed files
`docs/agents/PROJECT_STATE.md`, `docs/agents/LAST_HANDOFF.md`, `docs/tasks/TASK_BACKLOG.md`,
`docs/agents/AGENT_ONBOARDING.md`, `docs/agents/ORCHESTRATION_PROTOCOL.md` (§1 read-list only),
new files under `docs/archive/`, and links that break as a result.
Not allowed: `AGENTS.md` content rules, specifications, decisions, research, code.

## Steps
1. Move the current full PROJECT_STATE, LAST_HANDOFF and TASK_BACKLOG verbatim to
   `docs/archive/2026-11-08/` (use `git mv`, then recreate the originals).
2. New `PROJECT_STATE.md` (≤ 80 lines): product goal and owner decisions (link
   OPEN_DECISIONS 2026-11-07), what works today (one line per capability), current checkpoint
   (link the plan), known gaps, how to run the demo (link the guide).
3. New `LAST_HANDOFF.md`: only the most recent handoff, ≤ 60 lines, using HANDOFF_TEMPLATE.
4. New `TASK_BACKLOG.md`: only active and next tasks (the CP cards), ≤ 120 lines. Link the
   archive for history.
5. Update the read-lists in AGENT_ONBOARDING and ORCHESTRATION_PROTOCOL §1 to say: AGENTS.md,
   PROJECT_STATE, the assigned card, and task-specific specs only. The archive is read on demand.
6. Fix links: `grep -rn "PROJECT_STATE.md#\|LAST_HANDOFF.md#\|TASK_BACKLOG.md#" docs README.md`
   and point broken anchors to the archive copy.

## Exit criteria
- `wc -c` of AGENTS.md + PROJECT_STATE + LAST_HANDOFF + the backlog is under 20 KB in total.
- `npm run docs:check && npm run test:docs` pass.
- No content deleted from Git history; the archive files are byte-identical to the pre-move
  versions (compare with `git show HEAD:<path> | sha256sum`).
