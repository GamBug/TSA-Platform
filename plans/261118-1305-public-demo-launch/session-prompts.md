# Session prompts

Copy one prompt per new chat. Run CP1 and CP2 in two separate chats (they own different files and
can run at the same time). Recommended for both: Claude Code, Sonnet 5.5, high effort. Reason: both are
well-specified by the plan files, so a strong-but-faster model fits; CP1 is security-sensitive, so keep
effort high and review with `/code-review` before committing. Fallback: Codex, strongest listed model, high.

## Prompt A — CP1 public demo mode

```text
You are the single accountable implementer for CP1 of the public demo launch. No subagents.

Read first, in this order, and nothing else unless needed:
1. AGENTS.md
2. plans/261118-1305-public-demo-launch/plan.md
3. plans/261118-1305-public-demo-launch/cp1-public-mode.md   <- your task card; follow it exactly
4. docs/decisions/OPEN_DECISIONS.md, section "Public demo launch and real full simulation — 2026-11-18"
5. docs/guides/STUDENT_WEB_APP.md and docs/guides/TRACK_B_SUPERVISOR_RUN_OF_SHOW.md

Code entry points: scripts/start-uni-demo.mjs, src/local/uni-demo.mjs, src/local/track-b.mjs
(origin/host check near line 279, listen on 127.0.0.1), src/modules/identity/local-synthetic.mjs
(LOCAL_SYNTHETIC_ACTORS, NODE_ENV guard), src/http/ (routes, rate limits).

Goal: `DEMO_PUBLIC=true npm run demo:uni` serves only the student app and candidate APIs for a public
https origin, gives each new browser its own synthetic guest, and returns 404 for every staff path.

Hard rules:
- Before editing: `git status`; preserve unrelated changes (TSA_Figma_UIUX/ is the owner's, leave it).
- Files you own: the entry points above, new tests under tests/integration/local/, package.json
  (one new script), the two guides above. Do NOT touch apps/candidate-web (CP3 owns it), the retained
  Bank (.local/track-b), data/, or any DB migration. If the guest flow seems to need a migration or a
  public contract change, stop and report instead.
- Existing local behaviour (no DEMO_PUBLIC) must not change.
- Expose a small flag the student app can read to know it is in public mode (e.g. in the existing
  notice/config response) and document its shape in the report, so CP3 can use it.
- Verify SIGTERM leaves no orphan postgres; stop every process you start.
- No push. When the exit gate passes, run /code-review on your diff, fix real findings, then commit:
  feat(demo): add a public student-only demo mode with guest identities

Exit gate: run and record exact commands and pass/fail counts for
npm run build, npm run test:demo:public (new), npm run test:demo:uni, npm run test:critical:privacy,
npm run test:student, npm run test:student-web, npm run test:b0, npm run test:docs.
Missing or skipped tests are not passes; say so.

Finish with:
- report plans/reports/claude-261119-public-mode.md (what changed, env vars, guest flow, commands and
  results, known limits);
- update docs/agents/LAST_HANDOFF.md (new top section), the PROJECT_STATE.md current checkpoint and the
  backlog card status;
- a final chat summary ending with
  Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
  and any open questions for the owner.
Write in English. Today is 2026-11-18, Asia/Bangkok.
```

## Prompt B — CP2 steps 1–3 (backup, combined taxonomy, test pool selection)

```text
You are the single accountable implementer for CP2 steps 1–3 of the public demo launch. No subagents.

Read first:
1. AGENTS.md
2. plans/261118-1305-public-demo-launch/plan.md
3. plans/261118-1305-public-demo-launch/cp2-content-enrichment.md   <- your task card; do steps 1–3 only
4. docs/decisions/OPEN_DECISIONS.md, sections "Public demo launch and real full simulation — 2026-11-18"
   and "Question correction, portable format and image library — 2026-11-16"
5. docs/guides/BANK_CORRECTIONS.md and plans/reports/codex-261116-2332-question-content-review.md

Goal: prove on a copy of the Bank that one complete 40 Math / 20 Reading / 40 Science test can be built
in one new combined taxonomy version, and produce the exact list of questions for it. Science will be
short (only ~16–20 choice-type items exist); measure the gap precisely, do not fill it.

Key facts:
- The full test delivers only SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE_GROUP (src/local/uni-demo-seed.mjs:12).
  A passage bundle is delivered whole; bundle sizes must add up exactly to 40/20/40 within one taxonomy
  version; the DB rejects mixed taxonomies (db/migrations/002_exam_integrity.sql:1016).
- Importer: npm run questions:import -- --file set.json --source-version <uuid> [--topic-map map.json]
  [--taxonomy-version <uuid>] [--confirm "IMPORT N"]. Also: bank:register-taxonomy, questions:validate,
  bank:owner-publish (dry run without --confirm). Read each command's --help before use.
- Science source: data/corpus-ingest/pdf-2026-dot1/review-2026-11-16-r3/final-sc.json (reviewed package).
  Exclude SCIE-T26SC-000401–000404 originals; check the types of replacements SCIE-T26REV-000401–000404.
- Math/Reading: exclude withheld or NEEDS_MANUAL_REVIEW items, the held duplicate 22b00db1, and any item
  with a recorded key disagreement.

Hard rules:
- Step 1: back up .local/track-b to .local/track-b-backups/pre-simulation-pool-261118/, then
  cp -a to .local/sim-pool-rehearsal/. Verify the backup (file count + hashes) before going on.
- Every write goes to .local/sim-pool-rehearsal/ only (TRACK_B_DATA_DIRECTORY). NEVER write, migrate,
  import into, approve or publish on the retained Bank .local/track-b; that is the owner's action later.
- Do not change any answer key from model output. Do not write new questions (that is step 4).
- Private content stays in ignored folders (data/, .local/); never stage it. Do not touch application
  code owned by CP1 (src/local, src/modules/identity, src/http) or apps/candidate-web.
- No paid API, no push. Stop every process you start.

Deliverables:
- Combined taxonomy "TSA simulation taxonomy v1" registered on the rehearsal copy; record its id.
- data/corpus-ingest/simulation-pool/topic-map-{math,reading,science}.json.
- data/corpus-ingest/simulation-pool/selection.json: per section, the chosen question ids, versions,
  hashes, source paths, bundle ids and sizes; Math 40 and Reading 20 exact; Science everything usable.
- Exchange files for the pool, all passing npm run questions:validate.
- On the rehearsal copy only: dry-run import into the combined taxonomy, and a bank:owner-publish dry run;
  record the candidate counts and confirm phrases. Stop before any confirmed run unless it is on the copy
  and needed to show the launcher summary; if you do, report what the launcher says about the full test.
- The exact Science gap: number of choice-type items missing, and suggested passage sizes that make
  Science sum to exactly 40.
- Report plans/reports/claude-261119-simulation-pool-selection.md with every command and result, backup
  path and hashes; commit only tracked tooling/docs changes (docs(bank): ... or feat(bank): ...).
- Update docs/agents/LAST_HANDOFF.md (new top section) and the backlog card.
- Final chat summary ending with Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT and the
  owner's next action (which exact commands to run on the retained Bank, not run by you).
Write in English. Today is 2026-11-18, Asia/Bangkok.
```
