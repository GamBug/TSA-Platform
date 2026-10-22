# Student catalog and owned attempt history

2026-10-22, base `71613e1`, branch `feat/track-b-data-auth`. Owner `continue`
resumes the authorized integration work after the earlier actual usage stop.
Accountable Codex Sol owns SQL017, transaction tests, final fixes and integration.
Native Luna/XHigh wrote the initial service/HTTP/tests before its quota failure;
a fresh separate native Sol6.1/Medium context actually reviewed the resumed final
diff and independently executed tests. No human content-review claim follows.

## Implemented

Existing frozen GET `/api/v1/catalog` and GET `/api/v1/attempts` now reach restricted
PostgreSQL commands through trusted candidate identity. No new public contract,
raw-table grant, schema table, publication capability or dependency is introduced.

Catalog exposes supported independent one-domain NEW_ONLY offerings with original
name, count, duration and admission interval. Future openings are visible; disabled,
closed and unsupported profiles are omitted. It advertises neither fixed/review
allocation nor sufficient unseen inventory. The internal blueprint configuration
is validated with the frozen MVP schema, checked against the public metadata and
never included in the HTTP page. Malformed configured metadata fails closed.

History filters ownership in SQL, reconciles the selected page under the shared
Bank guard with stable UUID lock order, and returns compact frozen summaries.
Only GRADED attempts with an exact latest active score/release and current rights
include a score. Slots, answers, keys, explanations, provenance, manifests and Bank
metadata are excluded. Required cancellation/expiry commits with its existing job;
a persistence failure rolls the whole read transaction back.

Pagination defaults to 20 and accepts the frozen 1–100 bound. Catalog uses UUID
ordering; history uses immutable creation timestamp plus UUID ordering. Tagged
versioned opaque base64url cursors retain all six database fractional digits.
Strict decoding rejects invalid dates, unsupported year zero, cross-kind, malformed,
noncanonical and extra-field cursors. Duplicate/unknown query fields are rejected,
including `__proto__`. Cursors are not authorization tokens; ownership is always
derived from the trusted session. No snapshot-wide pagination guarantee is added.

## Actual verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6; disposable synthetic fixture scope.
No lawful production inventory or qualified human approval is fabricated.

| Command | Observed result |
|---|---|
| `npm run test:directory` | 9/9 PASS: 3 adapter cases +6 real PostgreSQL cases; zero failures/skips |
| `npm run test:bank` / `test:assembly` / `test:db:foundation` | 94/23/34 PASS |
| `npm run test:attempts` / `test:grading` / `test:results` | 28/21/6 PASS |
| `npm run test:recovery` / `test:student` | 16/5 PASS |
| Auth/local/prototype regressions | 5/13/16 PASS |
| Frozen contracts/emitted consumers | 106/11 PASS |
| Build/typecheck/emitted smoke/generated drift/import boundary checks | PASS |
| `npm run docs:check` | FAIL: unchanged owner research whitespace and four missing temporary screenshots |

The directory suite covers service serialization, cursor validation and error
sanitization; PostgreSQL catalog/history with the frozen Request/Response handler;
owned microsecond pagination; lazy TTL cancellation; expiry-job fault rollback and
exact retry digest; and both rights/history winner orders with actual lock waiters.
The six DB cases are not mocked transactional evidence. Directory HTTP handling
uses Request/Response calls, not a newly asserted network/browser journey; the
existing student-runtime regression separately exercises loopback composition.

Separate read-only Sol6.1/Medium independently ran final
`node --test --test-reporter=spec tests/integration/directory/*.test.mjs`:9/9 PASS,
scoped diff-check PASS; no remaining P1/P2, no files edited. It inspected SQL017,
service, HTTP wiring, tests, script and migration expectations. Initial restricted
execution failed generically and was not counted as passing.

The resumed first run was8/9: an unfinished test passed the wrong pool property.
Fixing it exposed the intended canonical-encoding test. Root also fixed the
reviewer's reproduced unknown-`__proto__` query omission with a null-prototype map
and executable service/HTTP negatives. Malformed history dates now exercise the
history decoder rather than failing only the cursor-kind check. Final evidence
reflects these fixes; earlier failures remain recorded as failures.

Unrelated owner diffs in15 tracked files and19 original untracked files were
compared against `/tmp/tsa-results-preserve/` and preserved. AGENTS SHA256 remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
Shared records stay unstaged with prior owner edits. Logs `/tmp/tsa-directory-*.log`
are transient; commands/results above are durable. Browser NOT RUN (no UI changes),
hosted CI NOT OBSERVED. No push/merge/deploy/Astra/paid API/live student LLM/publication.

## Next executable integration

Connect the existing student client to local auth and these frozen APIs. Preserve
the owner UI, expose queued/failed grading honestly, use acknowledged revisions
and stable retry keys, and exercise a real PostgreSQL/browser journey without
automatically publishing synthetic stock. The backend now supports discovery,
allocation, delivery, saved answers, explicit/unattended closure, grading, released
review and owned history. Browser integration, production worker/OIDC/provisioning,
final-failure operations, lawful inventory and qualified per-question content review
remain outstanding. G1/G2/G3 retain owner acceptance; Track A remains incomplete.
