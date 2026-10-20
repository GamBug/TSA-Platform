# G2 dataset preflight engineering — 2026-10-20

Accountable coordinator: Codex Sol. Implementer recommendation and dispatch:
native `tsa_builder`, fixed Luna/XHigh routing, for deterministic isolated
validation; coordinator Sol implements the read-only PostgreSQL adapter.
Independent reviewer: native `tsa_reviewer`, fixed Sol6.1/Medium routing; actual
read-only review completed with no unresolved P1/P2 findings.
No Astra, paid API, reference-site reconstruction, deployment or publication.

## Starting state and preservation

Branch `feat/track-b-data-auth`, HEAD `f72f6a8`. Twenty tracked paths were already
modified, with untracked UI fonts/research and WEB verification records.
These belong to prior owner/UI work and remain preserved. AGENTS.md SHA-256:
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
A binary tracked patch, untracked tar and status inventory were saved under
`/tmp/tsa-g2-preserve-20261020/` before editing. That is a transient recovery copy,
not a clean checkout or an independent verification of the old UI changes.
No existing UI, research, dependency, migration or frozen contract was assigned.
Coordinator owns additive shared-record updates; the worker owns only the new
pure validator/test files. All earlier reservations were released per handoff.

## Gate audit

| Task | VERIFIED baseline | Executable engineering now | Human/owner/inventory boundary |
|---|---|---|---|
| DATA-002 | No accepted starter inventory; 12 MATH / 6 READING / 12 SCIENCE remain targets | Test count/hash/schema and exact-version review preparation with synthetic fixtures | Lawful inventory authorization; rights attestations; distinct named human author and qualified independent reviewer; Vietnamese clarity/alternate-answer review; actual bundle/quota feasibility and two-student reuse/two disjoint attempts remain unverified |
| DATA-003 | Frozen question/identity contracts available; immutable private graphs retained by ingestion | Deterministic non-publishing manifest, counts/shortfalls, reference/hash validation, review packet | Production manifest/taxonomy/bundles, human evidence and lawful stock remain blocked; this engineering subtask does not complete the parent |
| BANK-001 | Manual ingestion `679c380`, staff `021dec0`, canonical Factory v2 transport `d376791`; earlier actual PG evidence in latest handoff | Read existing exact pinned canonical graphs through restricted Bank identity | Remaining workflow/publication, asset sanitization and rights hold/fan-out acceptance are not supplied by ingestion or this preflight |
| BANK-002 | Independent-human authorization policy exists in local AUTH; no controlled publication acceptance | Read-only workflow snapshot and exact-hash review preparation, without storing review decisions | Named real human process, rights checks across all dependencies, hard validators, equivalence adjudication/merge, approval/withdraw serialization and publication command still required |

The owner directive explicitly authorizes synthetic engineering preparation.
It does not provide missing human names, lawful stock, rights evidence or
whole-ADR approval. Synthetic role profiles and agent code review cannot satisfy
independent human content review. G1 remains ACCEPTED; G2/G3 remain unaccepted.

## Implemented scope and limits

Implemented new internal helpers:

- `preflightDataset({items:[{question,references}]})` in
  [dataset-preflight.mjs](../../src/modules/bank/dataset-preflight.mjs) returns
  deterministic manifest/report/review-packet digests, section/type counts,
  12/6/12 shortfalls and duplicate fingerprint flags. It verifies frozen schema,
  exact identity hashes and complete reference DAGs, rejects repeated identities
  and inconsistent shared references, and preserves authored ordering. Only IDs,
  hashes, counts and checklist topics leave the helper, without content/key or
  evidence payloads. Internal diagnostic format names are not new frozen API contracts.
- `createDatasetPreflightService({bankPool,identityService})` in
  [dataset-preflight-service.mjs](../../src/modules/bank/dataset-preflight-service.mjs)
  exposes `preflight(principal,{versions:[{versionId,contentHash}]})` to existing
  authorized staff. It uses the restricted Bank connection and PostgreSQL
  REPEATABLE READ READ ONLY, verifies retained canonical graph hashes and pins,
  and adds a workflow/revision/open-flag snapshot. Historical exact versions remain
  selectable; no automatic substitution of the newest revision occurs.
- Both enforce bounded diagnostic input (100 items; 16 MiB canonical aggregate).
  Reviewer P2 found deferred aggregate enforcement could retain too many graphs;
  repaired incremental checking stops before later versions are fetched. The
  driver-level budget regression uses bounded synthetic nodes; it is not a claim
  of persisted large-graph performance testing. Already-verified closures are reused.
- Every report sets `publishing:false` and retains five human/legal blockers.
  Source/package metadata cannot clear them. Review packets bind exact immutable
  version/content/reference hashes and the correctness, ambiguity, relevance,
  language, explanation, rights and equivalence rubric. They contain no human
  decision, signature or approval. No database writes or eligible-pointer mutation.

This internal diagnostic has no public route, student DTO or publication command.
Canonical graph preflight is not verification of all normalized SQL rows, asset
bytes/sanitization, current rights intervals/territory, taxonomy semantics, human
review evidence, complete bundle capacity or future assembly feasibility.
A manifest digest is an integrity handle, never publication authorization.

## Executed verification

2026-10-20, pinned Node24.18.0/npm11.16.0 and installed PostgreSQL18.6. No new
packages, migrations, frozen contracts or provider calls. The coordinator ran:

| Command | Observed final result |
|---|---|
| `npm run build`, `npm run typecheck`, `npm run test:built` | PASS |
| `npm test` | PASS106 nested tests after permitted rerun |
| `npm run test:consumers` | PASS11 nested tests |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS; generated artifacts/public imports unchanged |
| `npm run test:bank` | PASS35/35, zero failures/skips: manual10, Factory12, pure preflight6, PostgreSQL preflight7 |
| `npm run test:db:foundation` | PASS34/34 real PostgreSQL |
| `npm run test:auth` | PASS5/5 real PostgreSQL/HTTP |
| `npm run test:local` | PASS13/13 real persistent-local composition fixtures |
| `npm run test:b0` | PASS16/16 inherited frontend regressions |
| `npm run docs:check` | Git-backed permitted run PASS50 Markdown files / 255 links after staging this record; new-record links/whitespace also checked separately |
| `git diff --check` and preservation comparison | PASS; 16 untouched prior tracked diffs and all19 prior untracked file contents match the recovery copy; AGENTS SHA unchanged |

Actual independent read-only Sol review ran
`node --test-isolation=none --test tests/integration/bank/dataset-preflight.test.mjs tests/integration/bank/dataset-preflight-service.test.mjs tests/integration/bank/factory-import.test.mjs`:
**PASS25/25** using permitted disposable sockets; no files touched. Reviewer
identified the aggregate-bound issue above and verified the repair and regression.
No unresolved P1/P2 findings; this is agent code review, not human content review.

New PostgreSQL evidence includes exact stale/unknown pins, candidate/forged-staff/
anonymous rejection, unchanged workflow/eligible pointers/reviews/receipts, actual
SQLSTATE25006 on an attempted write, a separately committed workflow/revision
change between snapshot reads, historical version retention, and Factory v2
asset/stimulus/nanosecond lexical identity preservation through preflight/replay.
Pure negatives include malformed/oversized input, corrupted/missing/cyclic DAGs,
stale keys/reference hashes, duplicate identities and shared-reference conflicts.

Initial restricted contract/DB commands failed file wrappers; reader diagnosis
revealed EPERM on local process/socket operations. Permitted reruns above produced
actual nested tests, not a clean restricted-CI claim. First new PG fixture run
failed because its rights validFrom was null; corrected the fixture to the
existing required instant, without changing production validation. Restricted
fallback docs check still flags inherited trailing whitespace in untracked
`VN_EXAMS_UI_GAP_ANALYSIS.md`; preserved that owner input. No full restricted
workspace-docs pass is claimed. Browser checks NOT RUN: no UI change in this task.
Hosted CI, production security, publication concurrency, actual human content
review, lawful stock acceptance and G2/G3 acceptance NOT RUN / NOT ESTABLISHED.

## Next executable task and human packet

The owner must identify a human author/rights attestor and a distinct qualified
reviewer, authorize original/lawfully cleared inventory and attach source/asset
rights evidence. Review must assess Vietnamese clarity, alternate answers,
correctness and equivalence against the exact packet hashes. Names/attestations
must come from real humans; synthetic roles and agent review are insufficient.
No such identities or inventory authorization were provided in this task.

Next task: BANK-002 exact-hash independent review submission/decision and controlled
publication command, after the owner records the named human process and affected
unresolved mechanism dispositions. Implement fail-closed rights/dependency and
validator checks, self-review/operator exclusion, equivalence adjudication,
quarantine/revocation and real-PG approval/withdraw serialization before asking
for G2 acceptance. Prepare DATA-003/002 lawful stock in parallel with those humans;
preflight alone does not prove capacity or permit student delivery.
Recommended implementer: Codex Luna/XHigh for isolated bounded work if available,
otherwise direct Sol; independent Sol/Medium reviewer for critical guards. Existing
subscriptions only; no paid API/Astra. No delegation is authorized by this next-task
recommendation alone. The project is closer to integrated delivery through an
executable Bank-to-review diagnostic, while student examination remains mock-only.
