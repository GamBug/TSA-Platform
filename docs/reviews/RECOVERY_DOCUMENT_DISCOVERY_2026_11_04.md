# RECOVERY-014 authored untracked documentation verification

Date2026-11-04 Asia/Bangkok. Root Codex sole implementer; response_review actual
independent read-only reviewer. Branch feat/track-b-data-auth/basea70861a with
inherited uncommitted changes preserved. Existing autonomous recovery authority;
no architecture/application/runtime/dependency/research changes or commits.

## Observed gap

The inherited `docs:check` enumerated `git ls-files`; its workspace walk ran only
when Git failed. It therefore reported149 tracked Markdown files but skipped27
authored untracked documents with155 outgoing local file links. Actual reviewer
reproduced a broken-link false negative using a read-only in-memory mutation of
an untracked guide. Separate scoped inspection found no currently missing file
targets among those155 links. Earlier149-file passes remain accurately attributed
to tracked-only coverage, not retroactively promoted to full-tree acceptance.

The checker also did not validate heading fragments. This task explicitly reports
`anchors: NOT_CHECKED`; it does not claim to implement a Markdown heading parser.

## Delivered correction

The [embedded checker](../quality/TEST_STRATEGY.md) retains tracked-artifact checks,
required documents/task references, decision-status checks and both immutable
historical input hashes. Git discovery additionally includes nonignored untracked
Markdown only in docs/agents, architecture, decisions, guides, quality, reviews,
specifications and tasks. It reports tracked/untracked counts separately and
deduplicates file validation. New research/private/generated files remain outside
this additional scope. No bulk staging, commit or private-content crawl occurs.

If Git discovery fails, a read-only walk stays within those authored directories,
required root documents and the two pinned historical inputs. It reports reduced
coverage: Git-ignore and tracked-artifact coverage NOT_CHECKED. It cannot supply
Git classifications. Symlink files and ancestor directories are rejected or
skipped without following them; existing generated/temp/dependency exclusions
remain. Directory traversal does not expand into data or new research files.

The [focused tests](../../tests/quality/docs-check.test.mjs) execute the actual
embedded JavaScript with read-only virtual filesystem/Git mutations. They verify
new-file link/fence/whitespace/task failures, valid-file discovery/deduplication,
tracked artifact rejection, private/research/generated exclusions, bounded Git
failure behavior, symlink refusal and protected-input hash failures. They never
write probe files or modify pinned inputs. The test runner itself uses the normal
Git checkout to seed its tracked-file fixture; this is not a no-Git test-runner
portability claim. The checker fallback is tested through injected Git failure.

## Executed verification

Environment: existing Node24.18.0/npm11.16.0, local working tree2026-11-04.

| Command / actor | Observed result | Scope |
| --- | --- | --- |
| Root `npm run test:docs` | 6PASS,0fail/skip | Actual embedded checker and read-only mutation oracles. |
| Independent `npm run test:docs` | 6PASS,0fail/skip | Actual response_review, no concrete findings. |
| Root/independent `npm run docs:check` before this evidence document | 176Markdown:149tracked+27untracked;1048links;0errors | One preserved historical whitespace warning; heading anchors explicitly unchecked. |
| Independent syntax/scoped `git diff --check` | PASS | Checker/test code and assigned edits only. |

Final root rerun after integrating evidence links: test:docs6PASS
(`/tmp/tsa-recovery014-tests-final.log`); docs:check177Markdown=149tracked+
28untracked/1053links/0errors (`/tmp/tsa-recovery014-docs-final.log`). Scoped
tracked diff, new-test syntax and direct untracked-file whitespace/local-target
checks PASS. Counts grow with authored documents and are not fixed limits.

Final source SHA-256: TEST_STRATEGY.md
`6199d9f492d1a310d495bf52c5b83fd102905cb7f3cac4f284d3b53b5392e5d2`;
docs-check.test.mjs
`a44a2a3d758df201c34e3c248c9b212e482e5fa4e92e062056b8b4e0b4a358f8`.
Both pinned input hashes match their unchanged values enforced by the checker.

## Disposition and limits

VERIFIED: bounded authored-document discovery gap corrected and independently
reviewed. No application or PostgreSQL/browser tests were needed or rerun for
this verification-tool change. No semantic specification/approval claim follows
from file/link checks. Research corpus and historical review remain immutable;
no heading-fragment, arbitrary external-link or full Markdown-parser acceptance.
All broader product/content/AT/architecture/production gates remain unchanged.
