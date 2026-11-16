# Current handoff — program audit in progress

**2026-11-16 (Reading and Science).** 35 more drafts are in the retained Bank (9 Reading, 26 Science), none selectable. New: passage import in the exchange importer, `bank:register-taxonomy`, a Science taxonomy and 10 Science figures. Next decisions are how to publish exchange drafts and whether to fix the image gate for figure questions. See the [report](../../plans/reports/claude-261116-1307-tsa-2026-dot1-reading-science-import.md).

**2026-11-16 (later).** The owner's 7 verification corrections are applied, and the TSA 2026 đợt 1 PDF was added: 106 Math drafts (agent-derived keys, not selectable) are in the retained Bank; Reading and Science are the next task and need passage import plus a Science taxonomy. See the [PDF import report](../../plans/reports/claude-261116-1014-tsa-2026-dot1-math-import.md).

**2026-11-16 update (Claude Code session, single agent).** Added `tsa-question/1` (portable question format, offline
validator, standalone AI prompt, exportable package), an image asset library (migration 032), a draft importer
(migration 033), `bank:correct`, and a blind verification workflow, plus the resumed-notice fix. Of the five Math items
flagged on 2026-11-15, two were repaired and three withheld; one duplicate numeric twin is withheld too. A blind solve of
the 197 Math items that had none found 182 agreeing and 7 further defects; their corrections are prepared in the private
`data/corpus-ingest/audit-2026-11-16/corrections-verification.json` and verified on a copy, but NOT applied: the owner
must run `npm run bank:correct -- --spec <that file> --confirm "CORRECT 7"` (the agent's attempt was blocked, correctly,
because the brief forbids changing answers from model output without the owner). Passage-based questions cannot be
imported by the exchange importer, the empty legacy topic group remains, and nothing is pushed unless the report says so.
Full results: [report](../../plans/reports/claude-261116-0242-question-bank-architecture.md).

**2026-11-15 update (Claude Code session, single agent).** CI was failing because three Reading
interaction suites read the gitignored corpus; they now use a synthetic corpus, with
`npm run test:corpus:private` for the real one. Three commits are local and not pushed. The real-Bank
demo passes every student journey. The retained Bank was not changed. Open owner decisions: five
published Math items with inconsistent source keys, one published duplicate, and the source-credit
text for `demo:uni`. Details and the recommended next task are in the
[stabilization audit](../../plans/reports/claude-261115-2242-demo-stabilization-audit.md).

The owner requested a full-program audit and repair loop, single agent, and resumed
with full execution permissions on 2026-11-11. The current Codex session owns the
work. [Plan](../../plans/2026-11-11-program-audit/plan.md);
[audit evidence and live verification handles](../../plans/reports/codex-261111-2256-program-audit.md).
Confirmed fixes cover numeric/cloze image routing, missing-route responses,
registered local route forwarding, stale simulation polling and publication source
selection. Startup role/capability drift and unsupported rights timestamps are now
rejected correctly too. The baseline has 605 passing integration checks; the latest
backend run has 543 passing checks, followed by affected timestamp/application
checks. Chromium/Firefox simulation journeys pass with Back navigation coverage.
Staff reviewers/managers now discover enabled numeric drafts without the author
template. Unsaved author edits and uncertain creation requests receive navigation
warnings; session changes still clear private fields immediately. All 101 app
tests and standard, numeric/native-dialog and cloze/matching Chromium staff
journeys pass. Initial browser harness failures and their corrections are recorded
in the audit report.
Ordinary deadline reads also fence stale responses and release only their own
read lock. Latest app tests: 109 passed; expiry/topic Chromium journeys and 33
topic/attempt backend checks passed.
The next pass corrected the CREATED reservation callout and verified 19 more
browser journeys, including admission, allocation races, save/grade failures,
rate limits, Firefox cloze/matching and disposable university/Reading Factory
launchers. Two stale journey assumptions were corrected against the frozen read
contract and explicit conflict recovery; details and original failures are in the
audit report. Final coverage reconciliation remains outstanding.
All audit-started processes have completed or were stopped. Retained
content, approvals and rights were not changed by the audit.
The full audit remains active. No independent review, retained publication or commit
is claimed. The prior Math handoff below remains valid for that preserved work.

## Previous handoff — Math cloze and matching

- Date and implementer: 2026-11-11, Asia/Bangkok; current Codex session, single agent. No subagents or independent reviewer.
- Task/status: [Math cloze/matching follow-up](../tasks/TASK_BACKLOG.md#math-clozematching-follow-up), DONE_WITH_CONCERNS, uncommitted. [Plan](../../plans/261111-2045-math-cloze-matching/plan.md); [report](../../plans/reports/codex-261111-2045-math-cloze-matching.md).
- Starting state: `feat/track-b-data-auth` at `61a35ab`, with only the preceding untracked Math diagnosis report. It was preserved; no concurrent implementers were used.
- Scope: private standalone Math intake, question/3 owner publication, separate published-only demo practice and retained DRAFT import. Excluded unrelated image/fraction work and retained publication.
- Changed surfaces: private factory/4 schemas/builder and admission mapping/namespace; Math package/intake tools; owner publication and university demo; regression/browser checks; owning guides, decision/task/state/plan/report records and journal.
- Authorization: [owner's 2026-11-11 Math instruction](../decisions/OPEN_DECISIONS.md#math-cloze-and-matching-intake--2026-11-11). No new database migration or student contract version. No commits, paid APIs or retained approvals.
- Result: 22 new DRAFTs (10 cloze, 12 matching); Math 281 total, including 259 previously published. All existing question hashes, 100 Reading questions, 359 reviews, 24 rights records and 359 eligible versions are unchanged. All 600 source files are unchanged. New drafts remain unselectable.

## Verification evidence

Linux, Node 24.18.0, PostgreSQL 18.6 and local Chromium, 2026-11-11. Exact commands, logs, initial failures and fixes are in the report.

| Check | Observed result |
|---|---|
| Build, typecheck, generated contracts, consumer boundaries | PASS. |
| Affected Bank/import/local/student/scoring regressions | 251 passed. |
| Final focused Math/Reading/source-pin/stock checks | 16 passed. |
| Contract suite; app suite | 192 and 86 passed. |
| Synthetic publication and /api/v4 journey | Rights/self-approval gates passed; allocation/save/submit/grade 4/4. |
| Chromium student flow and 375px layout | Both types saved; 4/4 result; no console errors or overflow. Screenshot inspected. |
| Retained imports and replay | Two backups, 22 DRAFTs, exact keys and replay, preserved baseline counts/hashes. |
| Owner publication dry run | 22 Math candidates; three sources need rights; phrase `PUBLISH 22 MATH`. |
| `npm run docs:check`; `git diff --check` | PASS; only pre-existing pinned research warnings. |

Independent review: NOT PERFORMED, per the owner's single-agent experiment. Inline code review used the code-review skill. Firefox and browser inspection of every real corpus question were NOT RUN; browser content was synthetic. New plan/report links were checked separately because the docs checker excludes untracked plan/report discovery.

## Continuation

- Owner next action: review six derived pools, symbolic exact-text answers and source wording/key concerns in the report; then run `npm run bank:owner-publish -- --section MATH --confirm "PUBLISH 22 MATH"`. Restart `demo:uni` with the existing source credit and open `?student=postgres-v4`.
- Remaining sources: GiaiTich/000007 needs its graph; HinhHoc/000007 lacks complete question/key data; XacxuatThongke/000034 has no visible keys. Across Math, 119 captures remain without retained imports.
- Recovery: artifacts under `data/corpus-ingest/cp3b-interactions-2026-11-11/`. Dumps: `retained/backup/before-start-ovUMeA/database.dump` and `retained-text-only/backup/before-start-svvjST/database.dump`. Inspect original package/admission/receipt records before recovery; do not regenerate identities for committed batches.
- Ownership: implementation complete; no delegate ownership or background process remains. Backlog, project state and handoff were updated by the same implementer. Earlier CP6 evidence remains in its [report](../../plans/reports/claude-261110-2301-cp6.md) and Git history.
