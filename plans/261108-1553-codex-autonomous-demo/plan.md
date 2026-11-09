# Codex autonomous run: university demo

Status: CP2, CP3a, CP3a-import and CP3b complete. Created 2026-11-08 (Asia/Bangkok).
Authority: owner decisions recorded 2026-11-07 at the top of `docs/decisions/OPEN_DECISIONS.md`.
Background: `plans/reports/review-261107-2114-tsa-product-readiness-gap.md`.

CP2 session authorization, owner, 2026-11-08: “I give u full access bro... do anything
to complete CP2!” This supersedes the dependency read restriction and two-repair stop
limit for CP2. The checkpoint's feature scope, local-only delivery, publication gates,
and prohibition on paid APIs, pushes, merges and history rewrites remain in force.

## Outcome

A local demo that shows four things:

- A full TSA-style simulation: 100 questions (40/20/40) with per-section chess-clock timers
  (60/30/60) and the ability to go back to earlier sections.
- Topic and section practice.
- Results shown as the number of correct answers per section and in total.
- A bank filled from the permitted corpus through the path DRAFT → owner approval → publish.

No live AI runs at exam time. The architecture stays ready for a full product later.

## Checkpoints

Codex updates the Status column. Run one checkpoint per Codex session or goal.

| CP | Card | Depends on | Status |
|---|---|---|---|
| CP0 Safe baseline | [cp0-safe-baseline.md](cp0-safe-baseline.md) | — | DONE: six baseline commits; required suites pass |
| CP1 Lean docs | [cp1-lean-docs.md](cp1-lean-docs.md) | CP0 | DONE: compact navigation, verbatim archives and docs checks verified |
| CP2 Full simulation | [cp2-full-simulation.md](cp2-full-simulation.md) | CP1 | DONE: migration, clocks, privacy, scoring and both browser journeys verified; [report](../reports/codex-261108-2238-cp2.md) |
| CP3 Corpus ingestion | [cp3-corpus-ingestion.md](cp3-corpus-ingestion.md) | CP1 (can run alongside CP2 because the files are disjoint) | CP3a-import DONE: 100 Reading DRAFTs / ten passages retained; [import report](../reports/codex-261109-1615-cp3a-import.md). [Original verification](../reports/codex-261109-1435-cp3a.md). CP3b DONE: 80 Math DRAFTs / four disposable batches, exit checks and independent review passed; [report](../reports/codex-261109-1721-cp3b.md) |
| CP4 Cloze and matching | [cp4-cloze-matching.md](cp4-cloze-matching.md) | CP2 | BLOCKED: matching captures omit the original target pool/reuse policy; owner decision needed before import design; [report](../reports/codex-261109-1958-cp4.md) |
| CP5 Science ingestion | [cp5-science-ingestion.md](cp5-science-ingestion.md) | CP3 + owner-supplied Science files | TODO |
| CP6 Demo-ready | [cp6-demo-ready.md](cp6-demo-ready.md) | CP2, CP3 (CP4 and CP5 if done) | TODO |

## Gates only the owner can pass (Codex stops and reports)

1. **Item approval.** Codex never approves questions. It imports DRAFTs and prepares the review
   queue. The owner approves them in the staff UI.
2. **Corpus publication.** The permission evidence (grantor, date, proof) must be recorded before
   corpus items are published. Engineering and DRAFT import may proceed before that.
3. **Science files.** CP5 waits until the owner drops files into `TSA_Example_Questions/` under a
   Science folder.
4. **Git remote.** Codex may make local commits on `feat/track-b-data-auth`. It does not push,
   merge, force, or rewrite history.
5. **Contract or product changes outside a card.** Codex stops and asks.

## Quota rules (the reason this kit exists)

- **The leader reads only this file plus the current card**, and follows links only when the card
  says to. This owner instruction overrides the long read-list in
  `docs/agents/ORCHESTRATION_PROTOCOL.md` §1 and `AGENT_ONBOARDING.md`.
- **Leader is Sol 6.1 at medium.** Raise it to high only for the CP2 and CP4 design steps.
- **Subagents:** at most 2 open, and only 1 writer. Use `tsa_scout` (read-only) and `tsa_builder`
  for implementation. Run the reviewer once per checkpoint, not once per patch.
- **Luna xhigh is for hard work only** (CP2, CP4, Math transcription checks). For mechanical work
  (CP0, CP1, Reading parsing, test reruns), use a Luna-high role. Add this optional file as
  `.codex/agents/tsa_light_builder.toml` (the owner adds it, or approves Codex adding it):

  ```toml
  name = "tsa_light_builder"
  description = "Luna mechanical builder: commits, docs moves, parsers, test reruns."
  model = "gpt-6-luna"
  model_reasoning_effort = "high"
  developer_instructions = """
  Follow AGENTS.md. Do only the assigned card step within its file allowlist.
  Do not spawn agents. Return: files changed, commands run with one result line each,
  and Status DONE | BLOCKED | NEEDS_CONTEXT.
  """
  ```

- **Tests:** run focused tests per step. Run the broad suite only at the checkpoint exit.
- **Evidence:** write commands with one result line each in a ≤ 40-line report at
  `plans/reports/codex-<yymmdd-hhmm>-<cp>.md`. No prose receipts and no restating of boundaries.
- **Stop rules:** two failed repairs on the same problem, an owner gate, a needed change outside the
  card, or quota running low. When stopping, write the report, set the status to BLOCKED with one
  reason line, and end the session.
- **Model availability is not verified here.** If a configured model is unavailable, stop and
  report it. Do not silently switch models.

## Environment notes (verify on first run)

- `.codex/config.toml` uses `approval_policy = "on-request"` and has no network. PostgreSQL
  harnesses and browsers start local processes; check that they run inside the sandbox before
  launching an unattended run.
- Kill any process the run started before ending a session (see the process rules in the
  repository's AGENTS and protocol docs).
