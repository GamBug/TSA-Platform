# RECOVERY-013 dedicated Factory LOGIN / live grading lease isolation

Date2026-11-04 Asia/Bangkok. Root Codex sole implementer; response_review actual
independent read-only reviewer. Existing autonomous local engineering authority,
branch feat/track-b-data-auth/basea70861a plus inherited changes preserved. Only
one regression added to [grading worker tests](../../tests/integration/grading/worker.test.mjs);
no runtime, schema, grant or proposed Factory privilege-cutover changes.

## Coverage gap and delivered proof

Prior tests used real Factory LOGIN credentials for private import-table and
sweeper denial, catalog privilege checks and SET ROLE for some workflow/RLS
assertions. The live grading-lease impersonation test exercised student credentials.
No dedicated Factory LOGIN test used valid live job/executor/token values against
claim/load/finish/fail. This was missing executable evidence, not a demonstrated
privilege flaw.

The new test uses existing populated allocation/answer/submission fixtures and
a legitimate trusted worker to claim a live30-second grading lease and compute
a valid score. An ordinary non-elevated LOGIN with exactly one membership,
tsa_factory, has no Bank, student-exam or worker membership. Two contexts are
tested: inherited LOGIN permissions and explicit SET ROLE tsa_factory.

In each context it knows the actual lease identifiers, spoofs the corresponding
custom GUC values plus a real reviewer identity, and receives SQLSTATE42501 from:

- All four worker entrypoints: claim/load/finish/fail, using valid parameters
  including the legitimate computed score rather than a malformed-payload denial.
- Reads of populated users/attempts/answers/question secrets/sealed slot secrets.
- Direct workflow approval, eligible-pointer updates and inserting an APPROVE
  review with otherwise valid exact question identity/hash and reviewer fields.
- Escalation to tsa_exam_worker, tsa_exam and tsa_bank roles.

Total30 denied operations. Each has a fresh transaction and rollback. Existing
Factory SELECT/column-UPDATE permissions on its own production-kind job and its
source-version read succeed as positive controls. The grading job is hidden by
RLS: SELECT and UPDATE return zero rows, distinguished from missing table grants.
Factory job visibility remains intact in both contexts.

After positive controls, exact sorted JSONB snapshots of all68 application tables
in tsa/tsa_private remain unchanged by the attacks. Equality assertions use only
a boolean to avoid dumping private snapshots. The grading job is still RUNNING
with the same owner/token and a live lease. The legitimate worker finishes that
lease, yielding exactly one4/4 score, release and successful job. No owner writes
simulate the successful grading step.

## Executed verification

Environment: Node24.18.0/npm11.16.0/PostgreSQL18.6, local disposable cluster.

| Command | Observed final result | Evidence / limits |
| --- | --- | --- |
| Root `node --test --test-name-pattern='dedicated Factory LOGIN' tests/integration/grading/worker.test.mjs` | 1PASS,0fail/skip;30denials/2contexts/68tables; legitimate GRADED | `/tmp/tsa-recovery013-focused-final.log`. |
| Independent same focused command | 1PASS,0fail/skip; same diagnostics | Actual response_review, final no concrete findings. |
| `npm run test:grading` | 24PASS,0fail/skip | `/tmp/tsa-recovery013-grading.log`; includes both actual PostgreSQL restart/WAL recovery cases and existing worker/transaction regressions. |
| Root/reviewer `node --check tests/integration/grading/worker.test.mjs`; scoped `git diff --check` | PASS | Syntax/whitespace only. |
| `npm run docs:check`; scoped tracked diff and direct new-file whitespace/local-target checks | PASS |149Markdown/893links/0errors; one preserved historical whitespace warning. |

Final file SHA-256:
`2053de8488f93f471373ab63bfb2efd391d7867840054bfcf47c3fd77c81fc9e`.

## Disposition and limits

VERIFIED bounded existing-capability isolation against a live EXAM lease. No
observed authorization flaw, no role-policy repair needed. Proposed new Factory
planner/reservation privilege cutover is still PROPOSED. This does not establish
production credential provisioning, compromised-superuser resistance, separate
host/service topology, full Factory executor acceptance, real rights/human review
or all Q-11/Q-16/TEST-002 scenarios. No application/dependency changes, commit,
push, merge or deployment.
