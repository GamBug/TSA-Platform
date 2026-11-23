# Phase 01 report — Environment and baseline

- Date and time (Asia/Bangkok): 2026-11-23, session started 15:14
- Tester: Claude Code, Haiku 5.5
- Worktree commit (`git log --oneline -1`): b644f64 docs(plans): add a phased test-and-report plan for a separate tester session
- Phase status: DONE

## Results by checklist item

| Item | Result | Evidence |
|---|---|---|
| 1.1 Isolation | PASS | `pwd` = /home/wolfleo/Documents/Projects/TSA-Platform-qa. Branch = qa/haiku-test-run (read with `git rev-parse --abbrev-ref HEAD`; the `git branch --show-current` form was denied by the permission prompt). `git status --short` printed nothing. `git log --oneline -3` starts at b644f64. `ls -d` lists .local/track-b, .local/track-b.pristine, .local/track-b-images and question-inbox. `du -sh`: 85M (.local/track-b), 2.9M (.local/track-b-images). |
| 1.2 Tools | PASS | `node -v` v24.18.0, `npm -v` 11.16.0, `/snap/bin/chromium` and `/usr/bin/firefox` exist, `ss -ltnp \| grep 4180` returned nothing (port free). |
| 1.3 Build | PASS | `npm run build` exit 0, `tsc` step under 1 s. `npm run build:student` exit 0, "✓ built in 293ms". Only warning: "(!) Some chunks are larger than 500 kB after minification", the known one. Logs: scratch/build.log, scratch/build-student.log. |
| 1.4 `npm test` | PASS | `ℹ tests 237`, `ℹ pass 237`, `ℹ fail 0`. |
| 1.4 `npm run typecheck` | FAIL | Exit 2. Three errors, all in `packages/contracts/test/question-exchange.test.ts`: `(173,68) error TS2532`, `(176,36) error TS2345`, `(178,18) error TS2532`. See F-01-01. Reproduced on a second run (scratch/typecheck-rerun.log). |
| 1.4 `npm run test:student-web` | PASS | pass 7, fail 0. |
| 1.4 `npm run test:scoring` | PASS | pass 11, fail 0. |
| 1.4 `npm run test:generation` | PASS | pass 22, fail 0. |
| 1.4 `npm run test:b0` | PASS | pass 112, fail 0. |
| 1.5 `npm run docs:check` | CONFIRMED (known failure unchanged) | Exit 1. "Unsupported tracked artifacts: docs/guides/chatgpt-projects/INSTRUCTIONS_MATH.txt, docs/guides/chatgpt-projects/INSTRUCTIONS_READING.txt, docs/guides/chatgpt-projects/INSTRUCTIONS_SCIENCE.txt". Same as the known failure. |
| 1.5 `npm run test:docs` | CONFIRMED (known failure unchanged) | Exit 1, `ℹ pass 6`, `ℹ fail 7`. Same counts as the known failure. |
| 1.6 `npm run test:db:foundation` | PASS | pass 37, fail 0 (exit 0, 8 s). |
| 1.6 `npm run test:auth` | PASS | pass 5, fail 0. |
| 1.6 `npm run test:critical:privacy` | PASS | pass 2, fail 0. |
| 1.6 `npm run test:critical:student` | PASS | pass 9, fail 0 (exit 0, 32 s). |

At the end of the session, `git status --short` shows only `plans/261123-1449-qa-full-test/STATUS.md` (and this report) as changed. No source, test, docs or config file was touched. Port 4180 is free. No demo was started. `OPENAI_API_KEY` was not set by me.

## Findings

### F-01-01 Typecheck fails on three type errors in a contracts test file

- Severity: LOW
- Status: REPRODUCED (twice)
- Where: `packages/contracts/test/question-exchange.test.ts:173`, `:176`, `:178`. Command: `npm run typecheck` (runs `tsc -p packages/contracts/tsconfig.json --noEmit`).
- Steps to reproduce:
  1. In the worktree, run `npm run typecheck`.
  2. Observe exit code 2 and the three error lines.
- Expected: `npm run typecheck` exits 0.
- Actual (trimmed, from scratch/typecheck.log):
  ```
  packages/contracts/test/question-exchange.test.ts(173,68): error TS2532: Object is possibly 'undefined'.
  packages/contracts/test/question-exchange.test.ts(176,36): error TS2345: Argument of type '{ content_blocks: ...; passage_id?: string; ...}' is not assignable to parameter of type '{ passage_id: string; ...}'.
    Property 'passage_id' is optional in type ... but required in type ...
  packages/contracts/test/question-exchange.test.ts(178,18): error TS2532: Object is possibly 'undefined'.
  ```
- Notes: The `npm test` suite (237 tests) still passes, so the problem is in the type check, not the runtime behavior. It still breaks the typecheck gate, and a gate that is red all the time hides new type errors. Not in the known list before this run. I did not check whether it is a stale type or a real contract gap; that needs the owner or a stronger model.

## Not run

| Item | Why |
|---|---|
| Browser-based checks, live server, OpenAI calls | Not part of phase 1 by design (plan hard rules 5 and phases 2 to 5). |

## Questions for the owner

1. Should F-01-01 (three type errors in `packages/contracts/test/question-exchange.test.ts`) be fixed before phase 2, or recorded as a known failure? I did not change anything.
2. Isolation note: the permission prompt denied the `git branch --show-current` command, so I used `git rev-parse --abbrev-ref HEAD`, which returns the same answer. Tell me if you want the plan's exact command allowed for future sessions.
