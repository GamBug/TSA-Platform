# AI Studio on the admin page (2026-11-24)

Status: done 2026-11-25 (see the handoff). Owner request 2026-11-24; implementer Claude Code (Opus 5.5), single agent.

## Outcome

The owner writes TSA questions in a chat on the local admin page instead of ChatGPT Web Projects: choose the writer
agent, model and effort; type any request; attach images, PDFs or text. The platform checks, repairs and AI-reviews
every batch without manual error handling, and publishes it on one click (or automatically when the run's switch is on).

## Owner decisions (2026-11-24)

- Auto-publish is a per-run switch, off by default. With it off, an AI-checked batch waits for one **Publish** click.
- The reviewer is a different agent from the writer by default (changeable).
- The writer may see any Bank question (corpus included) as a style example.
- Reading and Science follow the real exam: passages with several questions (2026 Đợt 1: Reading 2 texts × 10,
  Science 8 texts × about 5), not 2 per passage.

## Acceptance

1. Chat sessions persist under `.local/ai-studio/`; a running turn shows its stage and can be stopped.
2. Writer: codex / claude / agy (model + effort lists read from each CLI) or OpenAI; web research on; attachments
   reach the agent; figures drawn into the run folder when the agent can run Python in a sandbox.
3. Prompt carries matching Bank examples (Math questions; whole Reading/Science passages with all their questions).
4. Mechanical fields and ids are normalised before validation; validator and Bank dry-run problems go back to the
   writer automatically (max 3 rounds); the reviewer solves each question blind and checks key, ambiguity, passage
   support, data consistency and Vietnamese; failed questions are fixed or dropped.
5. Publish imports exactly that batch as DRAFTs and publishes exactly those versions (whole passages only; open twins
   are never auto-published). Auto-publish does the same without the click.
6. "Review drafts with AI" checks DRAFTs already in the Bank and publishes the passed ones on click (or automatically).
7. Plain-language errors with Retry / switch-agent; no raw error codes as the only message.
8. Tests: unit tests with fake agents for the pipeline; existing admin, inbox and demo suites still pass; one real run.

## Files

- `src/local/admin/ai-agents.mjs` (CLI runners, model catalogs), `ai-studio.mjs` (sessions, turn pipeline),
  `ai-review.mjs` (reviewer), `bank-examples.mjs` (example selection), `exchange-normalize.mjs`.
- `scripts/questions-inbox.mjs` (`--only`, `--report`), `scripts/owner-publish.mjs` (`--versions`).
- `src/local/admin/admin-jobs.mjs`, `admin-routes.mjs`, `admin-bank.mjs`.
- `apps/candidate-web/src/screens/AiStudio.tsx`, `api/admin.ts`, `AdminScreen.tsx`.
- `docs/guides/ai-studio/` (writer and reviewer instructions), `docs/guides/chatgpt-projects/` passage rule,
  `docs/guides/ADMIN_PAGE.md`, decision record, handoff.
