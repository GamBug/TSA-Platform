# WEB-001 independent three-domain integration — executed evidence

2026-10-22, `feat/track-b-data-auth`, base `55bd3b4`. Accountable Sol6.1;
Luna/XHigh remains usage-limited. Scope: documented independent domain profiles
through existing frozen student APIs, a narrow persistent-result domain label,
and explicitly disposable original test fixtures. No Bank service, schema,
solver, authorization capability or frozen contract changes.

## Implemented and actually demonstrated

`domain-fixture.mjs` reuses the existing disposable mixed-MATH fixture, then creates
new immutable READING/SCIENCE taxonomy identities, original labeled questions and
independent offerings. Parent taxonomy/children commit in one transaction. Existing
Bank validation/review and postmaster-bound synthetic publication scope are used;
no guard is disabled or retained stock provisioned. The inventory is10 original
engineering questions, not the vetted30-question target or qualified human review.
READING/SCIENCE here are standalone single-choice content; MATH includes all three
supported interactions, Vietnamese, raw TeX/alternative text and a table.

The browser run uses actual catalog clicks for MATH4/READING2/SCIENCE4. Each has
its own form/attempt, exactly one domain and configured360/180/360-second clock.
Cross-domain creation while active returns409 CONCURRENT_ATTEMPT_EXISTS and does
not consume history. All answers are acknowledged; a fresh page reload preserves
the original clocks and saved answers. Each submit commits but loses its browser
acknowledgement once; explicit retry uses the same key and produces one job.
All three independent results show100.00%, their domain and raw count. Every
released question explanation is opened and checked visibly rendered. Completion
returns to catalog; no next domain is allocated until its explicit selection.
Three separate graded history entries are rendered with individual scores.

The initial browser run exposed a real product gap: persistent results omitted
their domain. A five-line persistent-only result label now identifies it. Default
mock presentation remains unchanged; no reference-UI reconstruction occurred.

Final browser run: Chrome155.0.8059.79,78 inspected API responses, eight screenshots,
no uncaught exceptions, no mock/external requests. Private fields are banned in
captured API bodies except successful authorized released-result responses.
Temporary artifacts `/tmp/tsa-student-browser-evidence/domains/report.json` and PNGs;
the owned disposable database is removed after execution.

| Domain | Questions / seconds | Attempt ID | Form ID | Score |
|---|---|---|---|---|
| MATH | 4 /360 | `4566d59c-9651-4569-ad10-0d988969f56a` | `e6d7d4bd-ddba-4506-a088-b2af337a0ccb` | 100.00% |
| READING | 2 /180 | `08fed844-4dd9-4334-a406-fa6468c5fa15` | `7d89fa11-2ffb-41d6-9d5c-724eb7bc6428` | 100.00% |
| SCIENCE | 4 /360 | `a7fbe5ed-9ac8-4254-ac10-3c1720a3fc30` | `c96384b8-e52c-432a-aa69-f533c7938f52` | 100.00% |

These are project fixture timings and unofficial practice scores, not official
rules or scoring equivalence. Standalone reading does NOT satisfy the documented
two-question shared-reading-stimulus/bundle requirement.

## Runnable disposable demo

`NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:domains`

Adds explicit `STUDENT_FIXTURE_DOMAINS=true` to the existing isolated launcher;
malformed values fail before fixture creation. Default mixed-MATH demo is retained.
Production/missing-opt-in refusal and cleanup remain intact. New launcher tests
actually authenticate, read the three-domain catalog and interrupt the entire
supervisor terminal process group, checking direct Node exit0/closed listener.

The exact npm command also ran in a real TTY: THREE_DOMAINS ready, page200,
authenticated catalog200 with4/2/4 questions and360/180/360 seconds. Ctrl+C closed
the owned listener without PG errors; npm cancellation status1 is recorded,
not misrepresented as direct worker exit0. Retained workspace is untouched and
continues to seed no eligible questions.

## Executed verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Chrome155 and Firefox156, Linux,
2026-10-22. Commands below actually executed against this batch.

| Command | Observed coordinator result |
|---|---|
| `node --test tests/integration/student-runtime/domains.test.mjs` | PASS1, all3 frozen transport profiles, exact duplicate-submit keys, clocks/global H1/history and explicit unseen shortage |
| `npm run test:student` | PASS12, including original runtime/security, domain transport and both disposable launcher profiles/malformed domain opt-in |
| `npm run test:local` | PASS15 |
| `npm run test:b0` | PASS31 |
| `npm run test:student:domains` | PASS actual browser journeys above |
| `npm run test:student:browser` | PASS existing mixed-MATH journey |
| `npm run test:student:keyboard` | PASS75 focus entries/zero mismatches,18 AX checks,22 inspected responses |
| `npm run test:student:expiry` | PASS actual8-second expiry/recovery |
| `npm run test:student:closed-save` | PASS rejected-write and committed-lost-ACK cases,48 inspected responses |
| `npm run test:student:firefox` | PASS existing actual mixed-type journey |
| `npm run build` / `npm run typecheck` | PASS |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 |
| `npm run contracts:check` / `npm run contracts:consumer-check` | PASS |
| `npm run docs:check` / scoped `git diff --check` | PASS; preserved historical whitespace warning |

Initial failures were not passes: taxonomy child insertion outside parent TX was
correctly refused (fixed fixture transaction); the transport test incorrectly read
sections from its reduced display DTO (now checks frozen raw GET); new browser mode
inherited a deliberate worker outage (explicitly enabled only for this mode); real
result domain omission was repaired; review harness wrongly expected all question
rows simultaneously (now navigates one at a time). Independent review additionally
required visible per-question explanations, rather than nonempty hidden text;
that assertion was strengthened before final run.

No fresh Bank/foundation/assembly regression is claimed for these fixture/browser
changes; product Bank/schema/solver are unchanged. Their prior evidence remains
separate. Hosted CI, qualified native zoom/screen reader, lawful real inventory,
content quality and shared-reading-bundle acceptance remain unverified.
Temporary logs `/tmp/tsa-domain-*.log`; captures are not committed evidence assets.

## Actual independent engineering review

Separate read-only `/root/directory_review`, Sol6.1/Medium: inspected fixture,
transport/browser assertions, narrow result label and disposable launcher changes.
Final no open P1/P2; syntax/scoped whitespace PASS; no files touched. Flagged and
closed the hidden-explanation assertion gap. No independent PG/browser execution
is claimed; coordinator evidence above is distinct from qualified human review.

## Next executable shared-reading card

Separate read-only dependency audit found existing frozen canonical stimulus hashes,
immutable stimulus/bundle tables, solver multi-member units, safe student/released
stimulus projections and per-question scoring. PostgreSQL integration is still
standalone-only: SQL009 filters stimulus questions, candidate-stock creates
singleton units, SQL010 rejects multi-member units and omits bundle IDs,
snapshot-builder hardcodes null stimulus. Factory resolves stimulus graphs, but
bundle-table materialization was not found in its inspected importer.

Next bounded ASSEMBLY-001/002 work: bundle-aware internal stock capture and atomic
sealing using existing immutable stimulus/bundle tables and frozen solver. Test
original isolated fixtures for complete ordered membership, current rights,
identity/equivalence-history exclusion, exact immutable snapshots and all-or-none
rollback before adding shared-reading browser coverage. No public API/contract or
new authorization capability appears necessary from this audit; implementation
must verify that boundary rather than invent a new one. Real inventory ingestion
may later need bounded materialization through existing import infrastructure.

This task is required shared-reading engineering, not optional Bank expansion or
publication authorization. Recommended Sol6.1/High while Luna is usage-limited,
separate Sol6.1/Medium review for critical SQL/allocation. G1 accepted and G2/G3
OWNER_ACCEPTED unchanged. WEB-001 overall IN_PROGRESS; lawful independent human
content/rights evidence, shared reading, Track A and qualified manual AT remain.

Owner AGENTS/research remain byte-preserved and unstaged with hashes
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b` and
`6dbab1f88148251cf3cd86e24492e35a9166e64bdfe21ab862a0cbe2666592ba` respectively.
No push/merge/deploy/Astra/paid API/live student inference/unauthorized publication.
Reservations released at checkpoint.
