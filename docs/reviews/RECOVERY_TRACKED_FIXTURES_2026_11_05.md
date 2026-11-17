# Tracked synthetic text-fixture correction

RECOVERY-025, November 5, 2026 (Asia/Bangkok). Root Codex sole implementer;
operation_review_final actual independent read-only reviewer. Base `a70861a`,
branch `feat/track-b-data-auth`; inherited changes preserved, no original Git
index modification or commit.

## Observed failure and cause

RECOVERY-024's isolated, fully indexed source checkpoint passed its first nine
verification stages, then documentation-checker tests returned 4 PASS / 2 FAIL.
The index includes three original synthetic `.txt` parser inputs used by
[`reading-research.test.mjs`](../../tests/ai/reading-research.test.mjs). The
[checker](../quality/TEST_STRATEGY.md) rejects unsupported tracked artifacts and
did not recognize these inputs. Their untracked status in the original tree had
hidden the integration failure. The checkpoint's failed logs remain under
`.local/recovery/source-2026-11-05-tJb2Cf/`; no later PG/browser stage ran there.

The [capture-research guide](../guides/READING_CAPTURE_RESEARCH.md) identifies the
supplied fixtures as original engineering inputs and separately requires actual
operator captures to remain private. Correct treatment is an exact-path
allowance for the three existing fixtures, retaining the generic text-artifact
restriction. Leaving these inputs untracked would not resolve their eventual
integration failure. No fixture content, research or rights approval changes.

## Repair and verification

The checker now permits only the existing `single`, `multiple` and
`truth-ambiguous` inputs under `tests/ai/fixtures/reading-captures/`. Its general
extension set is unchanged. Existing safe-file checks still run before artifact
classification, so an allowed pathname does not permit a symlink or missing file.

The [regression](../../tests/quality/docs-check.test.mjs) simulates these files as
tracked Git source, then verifies unknown/sibling/nested text paths and raw
research/data text remain unsupported. An approved-path symlink still fails
without reading its target. Text payloads are not parsed as Markdown; private/
unassigned discovery exclusions and both protected input hashes remain tested.

| Executed check | Observed result | Scope |
| --- | --- | --- |
| Root new regression before repair, `node --test tests/quality/docs-check.test.mjs` | 6 PASS / 1 FAIL | Expected failure at tracked-fixture positive assertion; `/tmp/tsa-recovery025-before.log`. |
| Root same command after repair | 7 PASS, no failures/skips | `/tmp/tsa-recovery025-after.log`. |
| Independent same command | 7 PASS, no failures/skips | Actual operation_review_final, no material findings; existing fixture hashes unchanged. |
| Root `npm run docs:check`; scoped `git diff --check` | PASS | No checker errors; preserved historical whitespace warning and anchors NOT_CHECKED. |

Reviewed checker file SHA-256:
`64386fedebe731d25d66d41a0f5f3760003bf45cdb2c79cdcfbd2173e5cafda8`.
Reviewed test file SHA-256:
`ba52ee4fd3aecbbcf39e9beea0f80187f7ac6a8dde5111cb748b37f5efce5026`.

The [repaired fully indexed checkpoint](RECOVERY_CURRENT_SOURCE_REPRODUCTION_2026_11_05.md)
now passes all 17 fresh stages, including checker7, with all three fixtures
indexed. Its independent final source/evidence review reports no material
findings. Earlier checkpoint passes remain attributed to their original frozen
source. No application, DB, provider, dependency, content/publication, architecture
or production change; broader reproduction commands and limits live in that
record. Root coordinates final docs/handoff and releases implementation ownership.
