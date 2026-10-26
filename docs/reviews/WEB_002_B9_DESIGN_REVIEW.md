# WEB-002 B9.1 independent design review

2026-10-26, reviewed based4929a0, feat/track-b-data-auth. Actual native Codex
Sol6.1/Medium read-only reviewer `/root/b9_design_review`; root authored disposition.
No files written by reviewer. Source inspection only; no B9 implementation,
PostgreSQL/upgrade/contracts/browser/runtime acceptance or owner approval.

## Finding and disposition

P2: original exhaustive success receipt omitted requestId, but the proposal also
required matching body/header IDs and exact historical receipt replay. Existing
src/http/bank.mjs supplies a fresh request-ID header on every response and a matching
body field only for errors. The original success requirements were inconsistent.

Root clarified: errors require matching body/header IDs; success has no body ID,
uses a fresh HTTP header and replays identical stored receipt bytes. Acceptance now
explicitly includes initial success, repeated success and errors. No runtime/public
contract changed. Final wording independently rechecked; P2 resolved with no further design finding
in the inspected scope. No runtime/public contract was changed.

## Performed independent checks

Read AGENTS/onboarding/state/top handoff/backlog/decision/handoff rules; the exact
B9 proposal; relevant002/004/006/007/018/020/021/022 migration excerpts; snapshot
builder; Bank idempotency helper, rehearsal service and HTTP response framing;
applicable API/contracts/identity/test strategy. Targeted git status/branch/HEAD,
git show, rg/cat/sed/numbered reads and git diff --check executed; whitespace passed.
One nonexistent source filename was corrected to fixed-stock-rehearsals.mjs.

Confirmed020 lacks form-linked exclusions in both B7 paths;021 separates rehearsals,
current EXAM role checks/grants/receipt scope;018 snapshots require candidate
identity. B9's proposed separate staff path and fixed hash recipe preserve those
boundaries. No other concrete finding in this source review; this is not a promise
of runtime correctness or qualification/rights evidence. All B9 runtime tests remain
NOT_EXECUTED because the contract remains PROPOSED / HUMAN_APPROVAL_REQUIRED.
