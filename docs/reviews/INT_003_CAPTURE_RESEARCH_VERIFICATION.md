# INT-003-R capture research verification

2026-10-28 Asia/Bangkok; root/current Codex, sole implementer. Started on
`feat/track-b-data-auth` / `a70861a`, with owner/previous INT-003 tracked and untracked
changes. All changes uncommitted. No other agent review or human review claimed.
[Authority](../decisions/INT_003_CAPTURE_RESEARCH_SCOPE.md),
[operator instructions and demo diagnosis](../guides/READING_CAPTURE_RESEARCH.md).

## Observed outcomes

VERIFIED: new offline tool accepts explicit manifests, saves original bytes and
hashes, extracts conservative text boundaries/options/explicit key observations,
flags unknowns, groups repeated normalized passages and creates private structured
metadata/report/taxonomy/generation guide. Raw files and private extraction remain
separate from derived structural reports. No application/Bank/provider imports.

Synthetic CLI pilot produced3 captures,4 questions,2 normalized passages,1 repeated
passage group,3 explicitly marked answer observations, and6 review flags. It
includes single/multiple/true-false and unsupported text entry. Proposed cognition
counts1M1/1M2/1M3/1unknown are lexical fixture results, not validated TSA findings.
The test fixtures are original engineering content. Generated private artifacts:
`.local/reading-research/synthetic-pilot-2026-10-28/` (first CLI run), and
`.local/reading-research/synthetic-pilot-final-2026-10-28/` (final report revision).

ASSUMPTION: lexical skills/cognition/format proposals and generic authoring pattern
menu. Distractor signals are lexical observations, not verified distractor intent.
SUPPORTED_BY_RESEARCH: no new external research or population claim is made.
REQUIRES_VERIFICATION: actual operator-capture coverage, extraction precision/recall,
rights, semantic keys, human skill/cognition labels, sampling and representativeness.
No operator sample path was supplied during implementation; no third-party file
was analyzed. Broader capture acceptance remains IN_PROGRESS.

## Executed checks

Node v24.18.0, existing installed repository dependencies, no install/build needed
for research tool. Commands executed2026-10-28:

| Command/check | Observed result | Limit |
|---|---|---|
| `node --test tests/ai/reading-research.test.mjs` | PASS15/15 | Synthetic only; raw CRLF/emoji spans, standalone/inline options, key conflicts/unknowns, truth maps, shared passages, injection-as-data, missing boundaries, UTF8 rejection, private permissions/symlink/public-path/overwrite refusal, pilot batch gate |
| `node --test tests/ai/reading-research.test.mjs tests/ai/manual-reading.test.mjs tests/ai/reading-factory.test.mjs` | PASS41/41 | Existing manual9+offline17; command-provider tests use local fixture subprocess, no live LLM |
| `node tools/reading-research/cli.mjs tools/reading-research/synthetic-manifest.json .local/reading-research/synthetic-pilot-2026-10-28` | PASS3captures/4questions; representativeness NOT_ESTABLISHED | Original synthetic fixtures only |
| Same CLI with final new `synthetic-pilot-final-2026-10-28` output | PASS3captures/4questions | Adds aggregate stem/option statistics |
| Direct `createPrototypeHandler()` GET probes | `/`200, `/?student=postgres`200, `/api/v1/student/practice/catalog`404 | Handler-level; no browser/database launched |
| `npm run docs:check` | PASS,0errors | Preserved historical whitespace warning only |
| `git diff --check` | PASS | Includes existing tracked owner changes |

The exact handler probe imported `createPrototypeHandler` from
`apps/practice-prototype/server.mjs`, constructed the default handler and invoked
`handle({method:'GET',url})` for the three paths above. Source inspection confirms
mock default, query-selected client transport, separate guarded launcher, exact
profile registration and opt-in disposable student runtime. Existing demo launcher
already supplies safe labelled exposure; no runtime change was needed.

NOT RUN: real operator pilot/batch (no supplied samples), PostgreSQL/full runtime
regression and Reading20 browser replay (runtime unchanged). Prior Reading20 browser
results remain in their original record; they are not new evidence for this task.
Independent review NOT PERFORMED. No commits, push, merge, deployment, Bank import,
external upload, real content approval or weight training occurred.
