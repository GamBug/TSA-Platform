# QA run reports (2026-11-23)

Written by the Haiku 5.5 tester in the isolated worktree `../TSA-Platform-qa` and copied here. Start with
[SUMMARY.md](SUMMARY.md). Paths in the reports such as `reports/screens/...` and `reports/run-logs/...` refer to the
worktree; copies of the screenshots and logs are in `tmp/qa-261123/` (git-ignored: the screenshots show question content).

Review notes from the main session (Claude Opus, 2026-11-23), read from the reports and the code, not re-tested:
- F-04-03 is a real defect in `scripts/question-change.mjs`: the move dry run does not run the approval gates, so a
  question with a confirmed twin passes the dry run, and the confirmed move writes a new version that approval then
  refuses (`assertSingletonAllowed`).
- F-04-01 is most likely intended: the 270 pairs are exact twins confirmed as one equivalence group under the owner
  decision of 2026-11-19, so a single test should never draw both. One assembled test would confirm it.
