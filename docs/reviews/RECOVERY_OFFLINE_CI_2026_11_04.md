# RECOVERY-017 offline regression workflow wiring

Date2026-11-04 Asia/Bangkok. Root Codex implementer; response_review actual
independent read-only reviewer. Basea70861a/feat/track-b-data-auth, inherited
uncommitted source preserved. Local existing-workflow configuration only; no
push, hosted run, deployment or new service/permission/provider authority.

## Delivered change

The [existing workflow](../../.github/workflows/contracts.yml) already ran
contracts, B0 and documentation validation but omitted the provider-free AI/client
boundary tests and checker mutation tests. It now adds two steps after the existing
checkout/install/build sequence and retains every existing check:

```sh
node --test tests/ai/*.test.mjs tests/critical/persistent-api-fixed-attempt.test.mjs
npm run test:docs
```

Workflow/job labels describe the wider offline verification scope. Event triggers,
read-only contents permission, runner, action versions and installation behavior
are unchanged. The added commands use synthetic fixtures and local subprocess
doubles; no production secrets, LLM API, PostgreSQL or browser service is needed.
Existing package scripts/builded contracts and the real checkout are prerequisites.
This working-tree configuration includes inherited uncommitted files; HEAD alone
still does not reproduce the complete current source. No hosted PASS is claimed.

## Executed verification

Node24.18.0/npm11.16.0, local working tree2026-11-04.

| Check | Observed result | Evidence / limit |
| --- | --- | --- |
| Root exact offline command above |77PASS,0fail/skip | `/tmp/tsa-recovery017-offline.log`. |
| Independent exact offline command |77PASS,0fail/skip | Actual response_review. |
| Root `npm run test:docs` |6PASS,0fail/skip | `/tmp/tsa-recovery017-docs-tests.log`. |
| Independent `npm run test:docs` |6PASS,0fail/skip | Actual response_review. |
| Independent installed `yaml` parser; scoped whitespace |PASS | No dependency installed; not actionlint or hosted execution. |

Independent review: no concrete findings. No application/SQL/schema/dependency
change. Full PG/browser suites were not repeated for workflow glue; the immediately
preceding RECOVERY016 record contains final client49/student45/browser78 results.
Final documentation PASS:180Markdown=149tracked+31authoreduntracked/1070links/
0errors (`/tmp/tsa-recovery017-docs-final.log`); scoped tracked whitespacePASS.
Workflow SHA-256 `e9e7c9659124cd1262b93a00e8ffe2698a6e2e8b7a2b03db619af1be34ef4088`.
Broader production,
content/rights/AT and pending architecture gates remain unchanged.
