# WEB-001 retained local student composition — executed evidence

2026-10-22, branch `feat/track-b-data-auth`, base `ed953aa`. Accountable implementer:
Codex Sol6.1. Luna/XHigh remained usage-limited; no model API was called. Scope:
authorized local engineering under the existing local identity/SQL approvals and
[owner integration authority](../decisions/LOCAL_STUDENT_INTEGRATION_AUTHORITY_2026_10_22.md).
This records engineering verification, not qualified human content review.

## Implementation

`LOCAL_STUDENT_ENABLED=true` explicitly enables frozen catalog/attempt routes in
the retained staff workspace. Unset/false preserves staff-only behavior; malformed
values fail before creating a data path. Existing Bank routes/template remain
separate. No schema, frozen contract, solver or publication changes.

Local owner bootstrap provisions distinct exam and worker logins only for this
mode. The owner pool closes before full existing student credential attestation
and before requests. Components reuse the existing student handler, expiry sweep
and grading worker. HTTP drains before worker/pools/PostgreSQL; concurrent close
calls share one cleanup promise. The standalone student runtime still accepts
caller-owned attested pools and uses the same prepared components.

The direct CLI supervises a detached worker so terminal SIGINT does not stop
PostgreSQL before pools drain. Early signal/disconnect requests are remembered;
these early-start/parent-loss branches are not exhaustively fault-injected.
`TRACK_B_DATA_DIRECTORY` optionally selects an absolute owned private data path;
existing safe path/ownership/start-lock checks apply. No deployment is involved.

No approved questions or blueprint offerings are seeded. Author drafts remain
DRAFT; the source retains UNKNOWN rights. Fresh student catalog/history are empty.
A retained positive allocation/grading journey has NOT been demonstrated here.
The separate disposable fixture flow exercises the existing positive journey.

## Actual coordinator verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Linux, 2026-10-22. All below actually
executed against this implementation; no mock replaces PostgreSQL concurrency
or persistence in the existing integration suites.

| Command | Observed result |
|---|---|
| `npm run test:local` | PASS15: existing13 plus retained composition and CLI tests |
| `npm run test:student` | PASS8, including separate credential/security and disposable CLI regressions |
| `npm run test:attempts` | PASS28 |
| `npm run test:grading` | PASS21 |
| `npm run test:recovery` | PASS16 |
| `npm run test:directory` | PASS9 |
| `npm run test:results` | PASS6 |
| `npm run test:bank` | PASS94 |
| `npm run test:assembly` | PASS23 |
| `npm run test:db:foundation` | PASS34 |
| `npm run test:auth` | PASS5 |
| `npm run build` / `npm run typecheck` | PASS |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 |
| `npm run contracts:check` / `npm run contracts:consumer-check` | PASS |
| `npm run test:b0` | PASS21 |
| `npm run test:student:browser` | PASS actual Chromium155/PostgreSQL synthetic journey |
| `npm run docs:check` | PASS; one preserved historical whitespace warning |

New retained composition test uses an owned temporary PostgreSQL data directory:
actual HTTP candidate/author authorization, empty owned catalog/history for two
students, author draft creation, full server/database restart, previous candidate
session and exact draft version persistence, unchanged UNKNOWN rights, separate
runtime roles, Bank denial of exam execution, concurrent close, unsafe BYPASSRLS
startup refusal and ADMIN OPTION drift refusal through full attestation. Failed
startups leave no owned postmaster/start lock. The first test run used a nonexistent
synthetic factory actor and failed400; corrected to the existing AUTHOR-denial case
before passing. It does not fabricate a Factory login or human identity.

CLI integration launches the actual entrypoint twice against one owned data path,
serves the student page/session, sends SIGINT to the supervisor terminal process
group, observes clean exit0 and no PG shutdown errors, closed listener, retained
PG_VERSION, removed postmaster/start-lock files. Candidate/draft persistence is
proved by the separate retained-runtime test, not by anonymous CLI session checks.
This is direct Node exit status; npm Ctrl+C behavior is not claimed from it.

Browser verification still uses original disposable, postmaster-bound synthetic
stock; it is not retained production stock or human-approved publication evidence.
Temporary logs: `/tmp/tsa-retained-{local,regressions,bank,contracts,browser,docs}.log`.
Browser captures: `/tmp/tsa-student-browser-evidence`; not committed evidence assets.
Hosted CI, manual screen reader/native200% zoom and production identity NOT RUN.

## Independent engineering review

Separate existing `/root/directory_review`, native read-only Sol6.1/Medium, inspected
source diffs, credential/route/lifecycle boundaries and new tests. Final review:
no P1/P2 findings, syntax/scoped whitespace PASS, no files changed. P3 README demo
anchor corrected. Reviewer PostgreSQL run failed before integration at Unix socket
binding (`Operation not permitted`); no independent passing PG result is claimed.
Coordinator actual PG/browser evidence above remains distinct from that review.

## Handoff boundary

G1 accepted; G2/G3 OWNER_ACCEPTED remains unchanged. Lawful inventory, named
independent human rights/content review, publication evidence and Track A remain
outstanding. WEB-001/004 overall acceptance remains IN_PROGRESS; local composition
is a verified bounded slice. Next executable integration card: add isolated
retained-workspace fault/recovery tests around queued grading across full process
restart using the existing disposable test publication scope, without enabling
retained runtime publication or creating a production seed. Qualified manual
accessibility assessment is a separate human prerequisite.

Owner AGENTS.md SHA256 `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`
and owner-local research SHA256 `6dbab1f88148251cf3cd86e24492e35a9166e64bdfe21ab862a0cbe2666592ba`
remain byte-preserved and unstaged. No push/merge/deploy/Astra/paid APIs/live student
LLM/unauthorized publication. All task reservations released at checkpoint.
