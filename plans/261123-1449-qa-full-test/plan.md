# Full QA test run — test and report only (owner request 2026-11-23)

Status: READY. Tester: Claude Code with **Haiku 5.5** (`claude --model haiku`), one phase per session, in the isolated
worktree `/home/wolfleo/Documents/Projects/TSA-Platform-qa` (branch `qa/haiku-test-run`). Reviewer of high-severity
findings: the owner or a stronger model (Opus) — a recommendation, not a recorded review.

Why Haiku: the work is running known commands, driving a browser and writing evidence down; it is cheap and fast. Its
weak spot is judging results, so every finding must carry raw evidence and HIGH/CRITICAL findings are re-checked later.

## Goal

Find and document problems in the TSA practice platform, in this order: UI/UX, security, data, AI question generation,
then regression and cross-browser. **Test and report only. Fix nothing.**

## Hard rules (read every session; they override AGENTS.md duties for this run)

1. **Write only inside this folder**: `plans/261123-1449-qa-full-test/` (reports, `STATUS.md`, and helper scripts in
   `scratch/`). Test scripts also write screenshots and logs into `tmp/` by themselves; that is fine. Do not edit
   anything else: not `src/`, `apps/`, `scripts/`, `db/`, `packages/`, `tests/`, `tools/`, `infra/`, `docs/`,
   `package.json`, `AGENTS.md`, backlog, handoff or decision files. If a test seems wrong, report it; do not change it.
2. **No git changes**: never `git commit`, `push`, `checkout`, `reset`, `stash`, `rebase`, `clean`, or branch commands.
   `git status`, `git log` and `git diff` are fine.
3. **No installs**: never `npm install`, `npm ci`, `npm update`, `npx <package>` that downloads, or `pip install`.
4. **Data stays in this worktree.** The Bank under test is the copy in `.local/track-b` (images `.local/track-b-images`,
   inbox `question-inbox/`). A pristine copy is in `.local/track-b.pristine` (see "Resetting the copy"). Never use a path
   under `/home/wolfleo/Documents/Projects/TSA-Platform/` (the owner's real repository and Bank), and never set
   `TRACK_B_DATA_DIRECTORY`, `TSA_IMAGE_STORE_DIRECTORY` or `TSA_QUESTION_INBOX` to a path outside this worktree.
5. **No live server, no paid API.** Never run `scripts/verify-public-live.mjs`, `infra/server/*`, `ssh`, `scp`, or
   anything against `tsa.smartnovi.tech` or another public host. Never set `OPENAI_API_KEY`; real OpenAI calls are
   NOT RUN unless the owner gives a key and written approval in the chat.
6. **Processes**: only one demo can use port 4180. Before starting one, run `ss -ltnp | grep 4180`. If it is busy and
   you did not start it, stop and write BLOCKED in `STATUS.md` (the owner may be running a demo). Start demos with the
   background-run facility, note the PID in `STATUS.md`, and stop them with `kill -INT <pid>` when done. Never `pkill`
   or `killall`, never kill a process you did not start. At the end of every session, no demo of yours may be running.
7. **Honesty**: a test you could not run is **NOT RUN** with the reason, never PASS. Copy real output; never invent
   output, counts or screenshots. Say "suspected" when you did not reproduce a problem.
8. **English** for all reports. Vietnamese only when quoting what the page shows.
9. Some paths are blocked by the owner's hooks (for example reading inside `node_modules/` or `dist/`). Do not work
   around a block; continue without it and mention it if it stopped a check.
10. Long commands: give them a timeout of at least 10 minutes (600000 ms); browser checks can take 5-15 minutes.

## How to run a session

1. Read this file, `STATUS.md`, `report-template.md` and the next phase file whose status is not DONE.
2. Work through the phase's checklist in order. After each item, update `STATUS.md` (item result, one line).
3. Write the phase report to `reports/phase-NN-<name>.md` using the template. Findings go in the report, with evidence.
4. Set the phase to DONE (or PARTIAL with what is left) in `STATUS.md`, stop your demos, and end the session with a
   five-line summary for the owner. Do not start the next phase in the same session.

**DONE or PARTIAL.** A phase is DONE when every item has a result, and NOT RUN is a result. An item that cannot run for
a reason another session would not change (the content does not exist in the Bank, it needs the owner, a rule or the
guard refuses it) is NOT RUN, and the phase is still DONE. Use PARTIAL only when the session ended with items that
could still run. A phase gets at most two sessions: in the second one, finish what you can, mark the rest NOT RUN, and
set DONE. Keep the `STATUS.md` phase row short (status, report, finding counts); details go in the item log.

## Severity

| Level | Meaning |
|---|---|
| CRITICAL | Data loss, answer keys or explanations visible to students before release, admin reachable on the public site, the real Bank or live server touched, a student cannot finish a test. |
| HIGH | Wrong score or wrong answer key accepted, a security check missing, a main flow broken on one browser or on phones, import or publication silently wrong. |
| MEDIUM | A flow works but confuses or misleads, a recoverable error without a clear message, layout broken at one size, an accessibility barrier. |
| LOW | Cosmetic, wording, small inconsistency. |

## Phases

| # | File | Focus |
|---|---|---|
| 1 | [phase-01-baseline.md](phase-01-baseline.md) | Environment, build and baseline suites; known failures |
| 2 | [phase-02-ui-ux.md](phase-02-ui-ux.md) | Student app and admin page in the browser, desktop and phone, math display |
| 3 | [phase-03-security.md](phase-03-security.md) | Admin auth, CSRF, origin, public mode, key leakage, uploads, secrets |
| 4 | [phase-04-data.md](phase-04-data.md) | Bank integrity, inbox and figures, publication, question changes, duplicates, backups |
| 5 | [phase-05-ai-generation.md](phase-05-ai-generation.md) | AI generation (fake OpenAI), ChatGPT Project files, validator |
| 6 | [phase-06-regression.md](phase-06-regression.md) | Remaining suites, Firefox, contracts |
| 7 | [phase-07-summary.md](phase-07-summary.md) | One ranked summary for the owner |

## Known before this run (do not report as new; confirm they still behave the same)

- `npm run docs:check` and `npm run test:docs` fail on the tracked `docs/guides/chatgpt-projects/INSTRUCTIONS_*.txt`
  (6 pass, 7 fail on `test:docs`), also on commit `ea7638e`.
- `npm run test:demo:public`: the subtest "each browser gets its own guest" failed before the admin-page work too.
- Topic practice is paused on purpose; the old UI in `apps/practice-prototype` is retired from the demo.
- The demo serves a copy of the Bank made at start: published changes appear after a restart. Not a bug.
- Moving a question to another section adds a new version; the old one stays as history. Not a bug.

## Resetting the copy

After phase 4 (or whenever the copied Bank is in a confusing state), with no demo running:
`rm -rf .local/track-b && cp -a .local/track-b.pristine .local/track-b`. Never delete `.local/track-b.pristine`.
