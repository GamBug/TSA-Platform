# Phase 06 report — Regression, Firefox and contracts

- Date and time (Asia/Bangkok): 2026-11-23, about 21:35 to 21:50 (session 1)
- Tester: Claude Code, Haiku 5.5
- Worktree commit (`git log --oneline -1`): c2846a3
- Phase status: DONE

Every command was run once from `/home/wolfleo/Documents/Projects/TSA-Platform-qa`, one at a time. Logs are in `reports/run-logs/6A-*`, `6B-*` and `6C-*`. The only reruns were for `test:local` (two runs in total, the limit in the plan). No demo of mine was started by hand; the suites start and stop their own servers. Ports 4180, 4181, 4184 and 4444 were free before the first command and free after the last one. No `ps` entry of mine was left.

## Results by checklist item

| Item | Command | Result | Duration | Evidence |
|---|---|---|---|---|
| A1 | `npm run contracts:check` | PASS (exit 0) | 1 s | "All generated OpenAPI and operation-map artifacts match the runtime route registry." Log `6A-contracts-check-s1.log` |
| A2 | `npm run test:built` | PASS (exit 0), 2 of 2 | 1 s | `ℹ tests 2 / pass 2 / fail 0`. Log `6A-test-built-s1.log` |
| A3 | `npm run test:consumers` | PASS (exit 0), 12 of 12 | 2 s | `ℹ tests 12 / pass 12 / fail 0`. Log `6A-test-consumers-s1.log` |
| A4 | `npm run contracts:consumer-check` | PASS (exit 0) | 1 s | "Student consumer import boundary passed…", "Practice app public import boundary passed." Log `6A-contracts-consumer-check-s1.log` |
| B1 | `npm run test:assembly` | PASS, 85 of 85 | 33 s | `ℹ tests 85 / pass 85 / fail 0` |
| B1 | `npm run test:attempts` | PASS, 28 of 28 | 19 s | `ℹ tests 28 / pass 28 / fail 0` |
| B1 | `npm run test:grading` | PASS, 24 of 24 | 30 s | `ℹ tests 24 / pass 24 / fail 0` |
| B1 | `npm run test:results` | PASS, 7 of 7 | 6 s | `ℹ tests 7 / pass 7 / fail 0` |
| B2 | `npm run test:directory` | PASS, 9 of 9 | 11 s | `ℹ tests 9 / pass 9 / fail 0` |
| B2 | `npm run test:simulation` | PASS, 11 of 11 | 38 s | `ℹ tests 11 / pass 11 / fail 0` |
| B2 | `npm run test:numeric` | PASS, 19 of 19 | 14 s | `ℹ tests 19 / pass 19 / fail 0` |
| B2 | `npm run test:media` | PASS, 56 of 56 | 32 s | `ℹ tests 56 / pass 56 / fail 0` |
| B3 | `npm run test:demo:uni` | PASS, 20 of 20 | 31 s | `ℹ tests 20 / pass 20 / fail 0`. Log `6B-test-demo-uni-s1.log` |
| B4 | `npm run test:local` (run 1) | FAIL, 116 of 119, exit 1 | 44 s | 3 failing tests, see Findings. Log `6B-test-local-s1.log` |
| B4 | `npm run test:local` (rerun 1, the last allowed) | FAIL, 116 of 119, exit 1 | 40 s | Same 3 failing tests. Log `6B-test-local-s1-rerun1.log` |
| C1 | `npm run test:student:browser` | PASS by exit code 0 | 17 s | Script prints its 12 checks, no pass count. Chrome 157. Log `6C-student-browser-s1.log` |
| C2 | `npm run test:student:simulation` | PASS by exit code 0 | 34 s | Chromium; 3 check groups printed. Log `6C-student-simulation-s1.log` |
| C3 | `npm run test:student:simulation:firefox` | PASS by exit code 0 | 45 s | Firefox 156.0. Log `6C-student-simulation-firefox-s1.log` |
| C4 | `npm run test:student:firefox` | PASS by exit code 0 | 11 s | Firefox 156.0; `examShortcuts` reported. Log `6C-student-firefox-s1.log` |
| C5 | `npm run test:student:keyboard` | PASS by exit code 0 | 7 s | 18 accessibility-tree checks with `"passed": true`, 0 with `false`. Log `6C-student-keyboard-s1.log` |
| C6 | `npm run test:student:images` | PASS by exit code 0 | 9 s | Log `6C-student-images-s1.log` |
| C7 | `npm run test:student:numeric` | PASS by exit code 0 | 7 s | Log `6C-student-numeric-s1.log` |
| C8 | `npm run test:student:cloze-matching` | PASS by exit code 0 | 8 s | `fixtureProfile: SYNTHETIC_CLOZE_MATCHING_WITH_LEGACY_GROUPS`. Log `6C-student-cloze-matching-s1.log` |
| opt | `npm run test:topics*` | NOT RUN | — | Optional in the plan; topic practice is paused on purpose. |

Totals for the suites that print counts: B1 to B4 `local` excluded: 85 + 28 + 24 + 7 + 9 + 11 + 19 + 56 + 20 = 259 tests, all pass. `test:local` alone: 119 tests, 116 pass, 3 fail, in both runs.

The browser suites in section C print a list of checks and exit with code 0. None of them prints a pass count, so these results are "PASS by exit code", the same basis the phase 3 report used for the rate-limit script.

## Known failures from before this run

- **`test:demo:public` / public mode (the `tests/integration/local/uni-demo-public.test.mjs` file).** This is the known failure from the plan and from phase 1 and phase 3. It is still the same: `TypeError: Cannot read properties of undefined (reading 'blueprintVersionId')` at `tests/integration/local/uni-demo-public.test.mjs:251:40`, in the subtest "each browser gets its own guest and cannot reach another visitor's attempt", and the parent "public mode serves the student app only, to one guest per browser" fails with it. It is not reported as a new finding. Phase 1 did not run `test:local`, so this run is the first time the rest of that file was run in this phase. Product bug or test bug is not established. Phase 3 recorded the same test as its known failure.
- `docs:check` / `test:docs` and the Vietnamese guide files: not in phase 6, not run again here.

## Findings

### F-06-02 Postgres check after the public launcher stops fails in two of two runs (suspected race or real leftover)

- Severity: MEDIUM
- Status: SUSPECTED (reproduced in 2 of 2 runs of `test:local`, but the reported processes were gone when checked, so no leftover was seen)
- Where: `tests/integration/local/uni-demo-public.test.mjs:325` to `:356`, the test "SIGTERM stops the public launcher and leaves no database process behind". The failing assertion is at line 355.
- Steps to reproduce:
  1. `npm run test:local` in the worktree (no demo running on the port range).
  2. Look at the test "SIGTERM stops the public launcher and leaves no database process behind" in the output.
- Expected: after `launcher.kill('SIGTERM')` and the launcher's `close` event, no postgres process started by the launcher is left.
- Actual (run 1, `reports/run-logs/6B-test-local-s1.log`):
  ```
  AssertionError [ERR_ASSERTION]: no new postgres process remains
    + actual - expected
    + [
    +   '462238',
    +   '462277'
    + ]
    - []
  ```
  Actual (run 2, `6B-test-local-s1-rerun1.log`): the same assertion, with one PID, `474006`. Checked with `ps -o pid,ppid,lstart,args -p`, none of the PIDs were alive afterwards.
- Notes: The assertion runs right after the launcher's `close` event. Postgres children may still be shutting down at that moment, so the test may be racing the shutdown. That is a hypothesis, not proven: no run has shown a delayed check passing or a leftover process being seen while running. If the postgres children really do outlive the launcher, that is a process leak, which the owner's process rules treat as serious. Owner or a stronger model should decide which it is. The other `tsa-uni-demo-*` postgres clusters seen during the session (PIDs 233401, 264622, 297677 and others) belong to earlier sessions and were not touched.

## Not run

| Item | Why |
|---|---|
| Topic practice suites (`test:topics*`) | Optional in the plan. Topic practice is paused on purpose, and no topic suite is in the phase checklist. Not run in this session. |
| Live server, `scripts/verify-public-live.mjs`, `infra/server/*` | Forbidden by plan rule 5 for this phase. Never touched. |
| Real OpenAI calls | Forbidden by plan rule 5. `OPENAI_API_KEY` was not set or read in this phase. |

Notes on what the browser suites used:

- `test:student:numeric`, `test:student:cloze-matching` and `test:student:images` run on disposable fixtures (`tests/integration/student-runtime/*-fixture.mjs`) with their own PostgreSQL. Their PASS shows the code paths work. It does not close the phase 2 items that were NOT RUN because the served Bank has no numeric, cloze or matching question.
- The browser suites wrote their screenshots to `/tmp/tsa-*-evidence/`, outside the worktree. That is the scripts' own choice; I did not change it.

## Questions for the owner

1. Should F-06-02 be checked by a stronger model or by the owner before anyone changes the test? The race and the real-leftover explanation predict different results for a delayed check, and I did not run that check, since it would mean editing a test file.
2. The known `test:demo:public` failure (the `blueprintVersionId` TypeError) is still there after five phases. Is it still accepted for the public launch, or should it block it?
