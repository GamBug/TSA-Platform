# WEB-004 — Reachable student history

2026-10-27 Asia/Bangkok; branch `feat/track-b-data-auth`, base `7211ef3`.
**IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED** in the scopes below.

## Scope and implementation

Selected by root under the recorded Track B engineering-choice delegation. A
read-only native Luna/XHigh scout confirmed that the SDK already loads all owned
history pages, but the UI silently limits access to10 attempts. No server contract,
SDK, SQL, role, score, release, clock or reuse-policy change was needed.

Root/current Codex owns main.js/styles.css, integration and coordinated records.
Recommended Sol6.1/High for session-safe integration; current Codex implements.
Native `history_checks` Luna/XHigh wrote only the existing persistent-state tests
and shared history browser helper. Native `history_review` Sol6.1/Medium performed
independent read-only source/test/browser review. All actually executed using
normal tools; recommendations do not substitute for execution. Owner AGENTS.md and
untracked research remain untouched/excluded.

- History is a dedicated readable section with state/mode, server-provided dates,
  released score and owned-attempt actions, preserving the red design.
- Ten rows initially; **Xem các bài cũ hơn** reveals the next10 until every loaded
  attempt is reachable. The exact displayed/loaded count remains visible. Focus
  moves to the first newly revealed action and scrolls it into view deliberately.
- **Đọc lại lịch sử** exposes loading and explicit retry. Failed reads retain
  loaded entries with a clear cached-data message; failure never claims freshness.
- Only the history region updates. Refresh preserves focus and scroll and never
  rebuilds the catalog/header. Identity and latest-request generation fences prevent
  stale success/failure from replacing newer data or clearing a replacement session.
  Identity reset clears expanded history and its reveal/loading state.

## Executed verification

Node24.18.0/npm11.16.0, Chromium156.0.8078.47/Firefox156.0, existing disposable
PostgreSQL fixtures. No direct database state patch or real examination content.

| Actor / command | Observed result |
|---|---|
| Root: `STUDENT_ARTIFACT_DIR=/tmp/tsa-history-chrome npm run test:student:short` | PASS10 groups/30 captures/201 validated API responses on initial helper revision; same final application source. |
| Root: `STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-history-firefox npm run test:student:short:firefox` | PASS10/30 on initial helper revision. Final helper adds first-history/account-clear assertions and captures the actual history section. |
| Root: `STUDENT_ARTIFACT_DIR=/tmp/tsa-history-domains npm run test:student:domains` | PASS all three full-domain lifecycles/78 validated API responses. |
| Root: `B0_BROWSER=/snap/bin/chromium B0_ARTIFACT_DIR=/tmp/tsa-history-b0 npm run test:b0:browser` | PASS11/26; existing route/header geometry, keyboard/demo behavior and scrollbar checks preserved. |
| Builder/root: `node --test apps/practice-prototype/test/persistent-state.test.mjs` | PASS14/14 including cross-identity and overlapping same-identity history-response races. |
| Root/reviewer: `npm run test:b0` | PASS34/34. |
| Root: `npm run build`; `npm run contracts:consumer-check`; `npm run docs:check`; `git diff --check` | PASS. Existing historical-review whitespace warning retained; docs have no errors. |
| Independent: `STUDENT_ARTIFACT_DIR=/tmp/tsa-history-independent-chrome npm run test:student:short` | Final-source PASS10/31/202 validated API responses. |
| Independent: `STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-history-independent-firefox npm run test:student:short:firefox` | Final-source PASS10/31. |
| Independent: syntax checks on main/history helper/shared short journey/state tests, consumer boundaries and whitespace | PASS; no repository edits. |

The new shared helper reuses the existing two-engine short-practice runners, not a
new harness. After four ordinary full/short UI completions, fixture setup explicitly
uses the existing SDK's synthetic repeat-consented create/start/submit requests to
produce12 additional genuinely worker-graded attempts. These are test setup calls,
not automatic consent or fallback in the student product. First-assignment rows
remain exactly unchanged. Normal student actions then verify16 reachable rows,
older-result exact GET, retained cached entries after one injected GET503 and an
explicit GET-only retry. Actor rotation clears all A rows/reveal state before B's
new attempt. Both engines retain header identities with max geometry delta0px
during desktop/narrow refresh; narrow widths375Chrome/actual500Firefox do not
overflow. Existing short uncertainty/save/reload/grade/release checks still pass.

## Independent review and limits

Final Sol6.1/Medium source/test review against7211ef3 found no unresolved finding.
Reviewed request/session fencing, loading/error truthfulness, focus, scroll, older
entry reachability and unchanged student contracts. Independently inspected actual
desktop cached-error and375/500px history screenshots; root inspected the same
current evidence. Test-oracle issues involving intentional scroll, cross-viewport
comparison, retry settling and misplaced screenshots were repaired before final
independent runs; they were not reported as product failures or passing evidence.
The helper's inaccurate no-write comment was corrected to say it never patches
database rows directly; genuine SDK persistence is preserved.

Reviewed application SHA256:

```text
03099ac36cab89baf6a96a7acab7ef2adc621dd93584b008116dfd38c8249733  public/app/main.js
7ed51020129e9e0e3bd376c5df1a23d0cf03708bbab2ea467c104bd5f8ff8d5f  public/styles.css
```

Qualified accessibility/manual AT/usability remains **MANUAL_CHECK_PENDING**;
lawful independently reviewed real starter stock is **HUMAN_APPROVAL_REQUIRED**.
No performance/production acceptance. Safari and a fresh checkout of this source
are **NOT_EXECUTED** at this checkpoint. No new independent backend-wide suite,
staff browser run or qualified human evidence is claimed. All writers released
their reservations; no remote push/merge/deployment or paid/live model dependency.
