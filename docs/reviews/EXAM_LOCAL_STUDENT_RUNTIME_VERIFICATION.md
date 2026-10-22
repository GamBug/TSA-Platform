# Local student API and grading composition

2026-10-22, base `f551f8d`, branch `feat/track-b-data-auth`. Sustained owner
continuation authorizes this EXAM/SCORE integration slice. Accountable Codex Sol
owns pool attestation, security tests and integration; native Luna/XHigh implements
the isolated runtime and HTTP journey tests. A separate native Sol6.1/Medium
engineering reviewer inspected final files read-only and independently ran tests.

## Implemented scope

`createStudentRuntime` in `src/local/student.mjs` composes existing local synthetic
authentication, frozen attempt/result handlers and the trusted exam worker on one
loopback HTTP origin. Its explicit inputs are caller-provisioned identity, exam
and worker pools; dev/test environment; port; polling interval; executor/lease/retry
settings; and independent creation/save budgets. It validates configuration before
pool access/listening, derives the actual trusted origin after binding, and fails
closed during initialization. No migration, role grant, stock seed, publication,
new public endpoint or frozen contract change occurs.

Startup attests three distinct LOGIN credentials with exactly the corresponding
`tsa_identity`, `tsa_exam` and `tsa_exam_worker` membership, usable inheritance and
SET permission, no admin option, no other parent memberships, no elevated role
attributes and no project schema/relation or database ownership. Pools must reach
the same PostgreSQL database/postmaster. This checks configured role topology and
ownership; it is not an audit of arbitrary direct ACLs added by an operator.

The worker polls outside the request path, awaiting each run before another starts.
Submission persists even while worker transport is unavailable; grading catches up
when that transport returns. Shutdown interrupts its poll wait, drains an active
run and HTTP requests, and leaves caller-owned pools open. Runtime errors expose
existing safe error shapes; no private grading payload is logged or returned.

This is a programmatic local synthetic runtime. The architecture's separately
deployed worker process, production identity/provisioning, catalog/history, expiry
sweep and student browser adapter are not delivered here. The existing prototype
UI and `/mock` routes remain mock-backed and explicitly demonstrative.

## Executed evidence

Node24.18.0/npm11.16.0/PostgreSQL18.6, disposable local clusters and loopback HTTP.
Synthetic publication fixtures retain the existing database/postmaster-bound test
scope; they are not qualified human approval or approved production inventory.

| Command | Observed result |
|---|---|
| `npm run test:student` | 5/5 PASS, zero skips/failures |
| `npm run test:attempts` | 28/28 PASS |
| `npm run test:grading` | 21/21 PASS |
| `npm run test:results` | 6/6 PASS |
| `npm run test:local` | 13/13 PASS |
| `npm run test:auth` | 5/5 PASS |
| `npm run test:b0` | 16/16 PASS |
| `npm test` / `npm run test:consumers` | 106/11 PASS |
| Build, typecheck, emitted smoke, generated drift, import boundaries | PASS |
| `npm run docs:check` | FAIL: existing owner research whitespace and four missing temporary screenshots |

The two runtime cases cover invalid configuration before side effects and a real
authenticated create/start/save/submit/background-grade/released-result journey;
CSRF/origin/foreign/staff/unauthenticated denials; worker transport outage without
inline grading; session/attempt/score persistence across HTTP runtime restart;
nonoverlapping polling, graceful close and caller pool reuse. Three credential
cases exercise actual PostgreSQL role alterations/permissions and ownership,
including admin/inheritance/SET restrictions, role parent changes, owner or Bank
substitution, raw secret denial, worker/student command isolation and cross-database
refusal. No DB behavior is mocked for these permission checks.

Separate read-only Sol6.1/Medium independently ran final `test:student` 5/5 and
scoped diff-check PASS, no open concrete P1/P2; no files edited. An early
implementation used an invented transitional error code; it was replaced with the
existing frozen API/local-auth shapes before final tests/review. Engineering review
does not constitute qualified human content review.

Bank/assembly/foundation regressions were not repeated for this composition-only
slice; their immediately preceding verified results remain 94/23/34. Browser NOT
RUN because the UI is unchanged; hosted CI NOT OBSERVED. Transient command logs
are `/tmp/tsa-student-*.log`. AGENTS SHA256 remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`;
owner tracked diffs and original untracked assets/research were compared against
the preserved snapshot. Shared authoritative updates stay unstaged alongside prior
owner edits. No push/merge/deploy/Astra/paid APIs/live student LLM/publication.

## Next execution

Implement bounded trusted expiry reconciliation so abandoned CREATED attempts
cancel and elapsed IN_PROGRESS attempts close/enqueue grading without a student
request. Reuse documented rights/withdrawal and deadline policy, immutable forms,
existing job digest and lock order; verify PostgreSQL races and rollback. Then
add frozen catalog/history transport and connect the existing student client.
G1/G2/G3 retain owner acceptance; lawful per-question rights/qualified human review,
production readiness and Track A evidence remain separate outstanding work.
