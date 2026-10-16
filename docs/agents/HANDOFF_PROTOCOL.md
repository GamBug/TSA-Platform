# Collaboration and handoff protocol

Applies to Codex, Antigravity and any future coding agent. No role is permanently tied to a provider. The human owner assigns accountable work and approves architecture. Git plus these documents support both sequential and parallel contribution.

## Claiming and coordinating work

1. Read [onboarding](AGENT_ONBOARDING.md). Inspect tracked/untracked changes and HEAD; preserve all changes not proven yours. Record the assigned task and approved scope.
2. One accountable implementing agent per task. Record its actual identity/role, start state and reserved paths in the task record when changing to IN_PROGRESS. Suggested roles do not reserve a task. Task handoff explicitly releases previous ownership before another agent claims it.
3. Reviewers normally read only, send concrete file/line findings through a real available channel or a durable review record, and do not silently repair the implementation. Document reviewer identity, scope and actual outcome; never simulate another provider's review.
4. Parallel implementers use isolated worktrees/branches or explicitly disjoint file ownership. Approve shared API/schema contracts before splitting dependent work. One designated integrator owns migrations, contracts and coordination files (`TASK_BACKLOG`, `PROJECT_STATE`, `LAST_HANDOFF`, decision records) during integration. Others submit proposed updates rather than concurrently writing those files. An agent starts no parallel workers merely because the architecture is multi-agent.
5. Before shared-file updates, reread the current file and Git status, compare against recorded starting state, merge unrelated entries and stop overlapping writes if ownership is uncertain. Markdown edits alone are not a distributed locking system; sequential ownership transfer is the fallback.
6. Architecture changes use [ADR process](../decisions/OPEN_DECISIONS.md). Show impact on consumers/migrations/tests before owner approval. No implementation against an unapproved assumption unless owner explicitly authorizes a scoped experiment, recorded as such.

## Meaningful handoff contents

Use [template](HANDOFF_TEMPLATE.md). Include task ID, agent role, scope, starting repository state, changed files, decisions, commands/tests and observed results, known issues, remaining work, recommended next action, branch/commit if available. Record NOT RUN and reason for missing tests. Never include hidden reasoning, full transcripts, secrets or private student data.

The latest actionable record is [LAST_HANDOFF](LAST_HANDOFF.md). Git is the authoritative change history once committed; handoffs supplement it. Before replacing an uncommitted handoff, preserve required task-specific evidence in the backlog or a concise task-owned record; otherwise the only evidence may disappear. With commits, link previous commit/task evidence instead of duplicating history. No commit is implied or authorized by this protocol; use “uncommitted” when applicable. Worktrees cannot be assumed available before the repository has an initial commit.

## Completion and integration

Run the tests listed on the task against the final relevant changes. Record command, date, environment/runtime, result and failures/skips. Do not confuse static documentation checks with application tests. A task is COMPLETED only when deliverables and required checks have evidence; unmet essential checks keep it IN_PROGRESS or BLOCKED. Owner approval of architecture and independent code review remain distinct from test success.

Integrator checks current branch/base, diff/untracked files, overlap, required independent review and automated integration results. Resolve conflicts with module owners; no force overwrite, destructive reset or unrelated reformat. Respect explicit commit/merge authorization. Update backlog status first, project-state navigation second, latest handoff last; one integrator performs the sequence. Project state records material changes, not a duplicate task database.

For read-only reviews, preserve implementation ownership and provide findings without claiming implementation completion. For blocked tasks, name the exact missing decision/evidence, safe work already done and the next person/action needed. Do not fabricate communications or approval.
