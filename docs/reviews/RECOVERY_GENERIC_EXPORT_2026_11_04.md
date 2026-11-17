# RECOVERY-011 generic fixture export/import verification

Date: 2026-11-04, Asia/Bangkok. Accountable implementer: root Codex. Branch
`feat/track-b-data-auth`, base `a70861a`; inherited tracked/untracked changes
preserved, no commit, push, merge or deployment. Existing autonomous local
engineering authority applies; accepted schemas and privileges are unchanged.

## Delivered behavior

The [generic exporter](../../tools/question-factory/generic-fixture.mjs) composes
the fake adapter and response inspector into existing canonical Factory v2 output.
All three domains and all three interaction types, mixed requests and shared
stimulus are supported. Strict trusted bindings, bounded plain input, verified
closed reference hashes, existing content safety, recomputed identity/fingerprint,
whole-package duplicate checks and the existing100-candidate limit fail closed.
Only machine schema/content/package-duplicate evidence is emitted; no answer,
rights or human PASS is fabricated. See the [guide](../guides/GENERIC_FIXTURE_FACTORY.md).

The [CLI](../../tools/question-factory/generic-fixture-cli.mjs) privately publishes
exact canonical bytes using a synced temporary file and atomic no-replace link.
It rejects public-tree paths, input/output symlinks and existing targets. It emits
safe summary diagnostics without private question/key data.

`generic_export_builder` hit an actual subscription usage limit before writing
its assigned files. Root checked for partial files and took sole implementation
ownership. No alternate paid provider or quota workaround was used. The separate
read-only `response_review` reviewer was available normally and actually reviewed
the implementation and executed the final focused suite.

## Executed evidence

Environment: Node24.18.0, npm11.16.0, PostgreSQL18.6, local working tree.

| Executed command/check | Observed final result | Evidence / limits |
| --- | --- | --- |
| `npm run test:factory:generic` | Root11 PASS,0fail/skip | `/tmp/tsa-generic-export-focused-final.log`; unit, actual CLI/process and disposable PostgreSQL. |
| Independent `npm run test:factory:generic` | Reviewer11 PASS, no remaining findings | Actual read-only response_review; includes SIGKILL and competing-publisher cases. |
| `node --test tests/ai/*.test.mjs` | 73 PASS,0fail/skip | `/tmp/tsa-generic-export-all-ai.log`; synthetic/offline only. |
| `npm run contracts:consumer-check` | PASS | `/tmp/tsa-generic-export-boundaries.log`; public import boundaries. |
| Node syntax checks of implementation/tests | PASS | Syntax only; no claim of full application regression. |
| `npm run docs:check`; scoped `git diff --check`; direct new-document whitespace/local-target/hash checks | PASS | 149 Markdown files/885 links/0 errors; one preserved historical whitespace warning. Three implementation hashes match the values below. |
| Actual `npm run factory:fixture -- …` invocation | Exit0;9813 canonical bytes, private file | `/tmp/tsa-generic-export-demo-L4T0Gp/`; Reading shared-stimulus2 fixture, parent0700/input and output0600. |

The [PostgreSQL test](../../tests/integration/factory-bank-exam/generic-fixture-import.test.mjs)
uses actual Bank author identity, internal capability and import service. It
persists all nine domain/type combinations as DRAFT, checks durable exact replay
and changed-content same-key conflict, then imports a two-question shared Reading
unit. A separate two-question unit faults on its second candidate via a temporary
test-owned trigger; every application-table snapshot is unchanged after rollback.
Removing that trigger permits a successful retry. The13 total imported versions
remain unselectable, eligible pointers remain0 and actual source-rights rows
remain0. Synthetic rights transport is not promoted into a legal grant.

## Findings and corrections

- Initial root fixture construction passed a reference hash into a strict hash
  helper; the test exposed the error and explicit allowed fields fixed it.
- Independent review found a P2: direct final-path writing could expose a partial
  final file after process interruption. Root replaced it with synced temporary
  writing and atomic no-replace publication. Reviewer confirmed closure.
- The real SIGKILL test initially timed out because its child IPC wait did not
  keep Node alive. A test-only message listener corrected the harness; no runtime
  fault hook was introduced. Final test kills the owned child at the synced
  prepublication barrier, verifies no final path, and verifies subsequent retry.
- Competing writers produce one complete winner and no ordinary-race temporary
  residue. Postpublication uncertainty never deletes the final file.

Final source SHA-256:

| File | Hash |
| --- | --- |
| Exporter | `543451b1b9d87d551d447b028fb6b2f64e4b7376206845e4e47aab35ab688c8b` |
| CLI | `27aba15e0715150d59615eebdd7e5a0fe934e10e4530c8dd25f651c7524148f5` |
| PostgreSQL test | `4113c2a6072ec4a944dc09481b58b57bff6d09bde2c8ffad69b6a843fa03a566` |

## Disposition

VERIFIED: RECOVERY-011 is complete within provider-free canonical fixture/DRAFT
import scope. No broader Bank/browser suite or power-loss test was rerun; Bank
runtime itself is unchanged. Semantic answer quality, qualified human review,
real rights, manual accessibility, real-provider economics and production remain
REQUIRES_VERIFICATION. Full AI/Factory/MVP milestones are incomplete. Pending
media/planner proposals remain PROPOSED, not approved by continuation or review.
