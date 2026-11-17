# OPS-001 isolated logical restore drill — 2026-10-23

**Bounded engineering drill IMPLEMENTED / VERIFIED.** Accountable Codex Sol6.1;
branch `feat/track-b-data-auth`, base `4369cb5`. Starting worktree contained only
owner AGENTS.md changes and untracked reference research. Existing continued local
engineering authority applies. Final code scope is two new test-only files; no
foundation helper, production code, schema, frozen G1 API or publication capability
changed. No Astra, paid model API, live inference, push, merge, deployment or real
publication. Luna previously reached its usage limit; Sol implemented with a
separate Sol6.1/Medium read-only engineering reviewer.

## Restore procedure and boundaries

[Private restore helper](../../tests/integration/student-runtime/restore-fixture.mjs)
accepts only an explicitly opted-in owned synthetic fixture with its active
postmaster-bound scope, private Unix socket, expected18.6 version and bootstrap
identity. Production process environment and missing opt-in are rejected. It runs
pinned18.6 pg_dumpall/pg_dump/psql/pg_restore with shell:false, explicit private
connection arguments, no password prompts and cleared ambient PG settings. Role
export explicitly omits passwords; owners and ACLs are retained. Data archive,
original role SQL and derived role-import SQL have0600 permissions under0700
owned temporary storage. SQL/private data/connection diagnostics are not logged.

The target is a genuinely fresh independent private cluster, not another database
on the source postmaster. Socket roots, postmaster start times and cluster system
identifiers differ. Database ownership is preserved. Source application services
are quiescent during the synthetic logical snapshot; no source grading poller runs.
Source rows, role/security metadata and cluster identity remain unchanged after
all target operations. The source is not treated as a concurrently writable
production failover peer.

PostgreSQL18 role restoration required preserving the original bootstrap grantor
identity. Target initdb creates `probe` as bootstrap roleOID10, just as the source
does. The helper validates the source identity and exactly one anchored
`CREATE ROLE probe;` in the trusted generated role export. The original role file
is retained; a private derived import omits only that duplicate CREATE statement.
Every ALTER ROLE, membership, grantor and other grant is retained. Import uses
ON_ERROR_STOP and a transaction. Application restore uses pg_restore
--exit-on-error --single-transaction. No --no-owner/--no-acl or privilege bypass
was used; the existing foundation fixture remains unchanged.

[Actual restore tests](../../tests/integration/student-runtime/backup-restore.test.mjs)
compare all65 tsa/tsa_private/tsa_meta application tables exactly before recovery,
including migration checksums, versions, provenance, rights, reviews, immutable
manifest/form/public and private snapshots, saved answers, clocks, history,
receipts, sessions, job inputs and digests. Separate normalized catalog comparison
checks role attributes/memberships/grantors, schema/table/function owners and
effective ACLs,89 function security-definer/configuration records and17 RLS policies.
Migration replay applies nothing. Restored exam credentials still see no private
form-secret rows through RLS; identity credentials cannot query them and ordinary
exam credentials cannot claim worker leases.

An additional exact-version/hash IN_REVIEW draft and independent reviewer session
are prepared before backup. After restoration, the same old fixture scope ID is
used in an otherwise valid approval command. It fails specifically with403
PUBLICATION_DISABLED; every restored application row remains unchanged. No replacement
scope is registered. Old test approval authority is not inferred from restored data.

The restored runtime re-attests distinct restricted identity/exam/worker pools and
uses existing HTTP/result/worker code. Four original shared-reading cases cover
QUEUED and RUNNING jobs, each with eligible rights and with passage rights revoked
before backup. Eligible work grades2/2 =100.00%, with one immutable score/release
and exact passage. Revoked work cancels, returns owner410 and foreign404, and creates
zero scores/releases. Dispatch identity/digest and sealed content/history remain
unchanged. Live RUNNING leases are observed before expiry, retain token1, then
recover token2 after actual expiry; cached old load/finish probes lose the lease.
The original source job/data remain untouched.

## Cleanup and independent review finding

Actual invalid-archive restoration failure removes owned archive and target roots
without touching source data. Missing explicit opt-in fails before source access.
A separate real-target fault test injects runtime shutdown failure and a rejection
after real pool shutdown; cleanup still terminates the target and removes archives,
then reports both original errors. On unconfirmed target termination, the helper
preserves its private archive directory rather than deleting live database resources.
Successful tests explicitly verify archive/target-directory absence.

The separate reviewer identified a P2 in initial teardown: runtime/pool rejection
could skip target/archive cleanup. This was repaired with `closeRestoredRuntime`,
which catches shutdown failures, attempts all pool closes and target cleanup, and
raises collected errors afterward. The reviewer confirmed the fix and new fault
test; final review has **no remaining concrete P1/P2**. Independently executed
syntax and direct whitespace checks for both files: PASS. Reviewer inspected the
coordinator log but did not execute PostgreSQL. No files edited by reviewer.
Engineering review is not qualified human content or rights approval.

## Executed verification

Node24.18.0, npm11.16.0, PostgreSQL/client tools18.6. Original isolated synthetic
question content only. No mocked database establishes restore/transaction evidence.

| Executed command | Observed result |
|---|---|
| `node --test tests/integration/student-runtime/backup-restore.test.mjs` | PASS7/7: four state/rights restore cases, corrupt archive, opt-in and cleanup-failure tests |
| `npm run test:student` | PASS31/31, zero failures/skips, includes final restore helper and prior process/runtime/security/browser-transport tests |
| `npm run test:db:foundation` | PASS34/34 |
| `npm run test:grading` | PASS22/22 |
| `npm run test:results` | PASS6/6 |
| `npm test`, `npm run test:consumers`, `npm run test:built` | PASS106/106,11/11 and emitted smoke |
| `npm run build`, `npm run typecheck` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS generated drift and consumer/import boundaries |
| `npm run docs:check`, staged `git diff --check` | PASS; zero documentation errors, preserved historical whitespace warning |

Initial failures were not counted as passes. Fresh-target role import under a
*different* bootstrap name failed because PostgreSQL18 GRANTED BY required the
original bootstrap grantor semantics. A roles-only minimal reproduction confirmed
that failure, leading to the validated bootstrap-preserving import above. A syntax
error in a new catalog assertion and an incorrect expectation of permission-error
rather than RLS-empty rows for ordinary exam credentials were corrected without
changing runtime privileges. The review cleanup P2 was repaired and fault-tested.
Final focused7 and fullstudent31 passed after the relevant fixes; the final full
suite includes the last synchronous-cleanup-error hardening.

Not rerun: full Bank/auth/assembly/attempt/local/recovery/scoring or browser suites;
production code and prior fixtures are unchanged. Earlier verified evidence remains
in prior handoffs. Parent tests retain the existing harmless module-type warning.
This drill establishes neither physical backup/WAL/PITR, backup encryption or
scheduling, continuous replication, host/DB-crash recovery, production failover,
RPO/RTO/SLO acceptance nor lawful production inventory. Test timing observations
are not approved production recovery objectives.

## Preservation and continuation

Owner AGENTS.md and reference research remain unstaged/byte-preserved:

- `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
- `6dbab1f88148251cf3cd86e24492e35a9166e64bdfe21ab862a0cbe2666592ba`.

G1 accepted; G2/G3 OWNER_ACCEPTED unchanged. Full OPS/pilot, lawful inventory,
named qualified human reviewers, manual accessibility and Track A remain outstanding.
The broad engineering goal remains active; this checkpoint does not redefine its
completion around a passing drill.

Next executable WEB-004 card: actual PostgreSQL-backed **429 save/retry browser
journey**. Existing save HTTP tests prove429/no mutation; current student browser
scenarios have no explicit429/Retry-After case (repository search performed).
Use isolated original stock and bounded real save budgets, assert unsaved draft
and blocked navigation/submission, explicit retry after real refill with the same
idempotency key, exactly one acknowledgement/revision, and correct result. Reuse
existing API/clock/renderer; repair only a reproduced behavior defect, no reference-UI
reconstruction or contract change. This is an existing documented WEB acceptance
requirement, not a new feature. Recommended Codex Sol6.1/High for integrated timing;
Luna/XHigh for isolated work only if its quota is available, otherwise Sol fallback;
separate Sol6.1/Medium read-only engineering reviewer. Manual AT remains separate.
