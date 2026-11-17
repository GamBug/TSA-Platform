# RECOVERY-012 integrated student privacy regression

Date2026-11-04, Asia/Bangkok. Root Codex is accountable implementer; actual
response_review is the separate read-only reviewer. Branch feat/track-b-data-auth,
basea70861a plus inherited uncommitted changes preserved. Owner reported the
subscription reset and renewed continuation. No paid provider or quota workaround.

## Gap and implementation

Read-only discovery found existing critical checks rejected private property
names but did not scan private PostgreSQL values under otherwise permitted fields
across the composed runtime's catalog/history/auth/errors. This was a coverage
gap, not an observed application exposure. Existing RECOVERY-002 static coverage
remains useful and is reused without claiming a complete browser audit.

[Integrated regression](../../tests/critical/student-leakage.test.mjs) uses the
actual local HTTP server, authentic local synthetic sessions, dedicated least
privilege pools and disposable PostgreSQL. Optional test-only explanation prefixes
are applied before ordinary immutable question creation/review/sealing. Default
fixture explanations remain byte-for-byte unchanged. All10 question secrets and
every sealed slot are checked for the marker before the release assertions.

[Oracle](../../tests/critical/leakage-oracle.mjs) scans raw bodies, headers and
decoded JSON string leaves/property names for53 internal values: private version/
question/provenance/source identifiers, hashes/fingerprints and an injected
backend-error marker. Explanation markers are forbidden outside owner released
review. Released responses still reject internal identifiers/hashes and allow
answer/explanation fields only in schema-validated review items; the remainder is
rescanned with the ordinary restrictions. Short public option IDs are not falsely
treated as private-value canaries.

VERIFIED final focused run:156 HTTP responses, three domains, all three interaction
types, three successful owner releases. CREATED/IN_PROGRESS/SUBMITTED/GRADED
ordinary views, saves/replay/revision conflict, catalog/history including paged
history, auth/session, cross-user/role/unauthenticated/CSRF/Origin/query/JSON
denials, both64KiB adapter and1MiB server body limits, real429, injected backend503
and post-release source-withdrawal410 are checked. Previously released results
are denied for all three attempts after withdrawal. Actual mounted public HTML,
CSS and first-party scripts plus blocked source/private paths are scanned. Media
GET currently returns404; this is denial evidence, not asset support acceptance.

Automatic worker progress is blocked by test-only pool wrappers; the real trusted
worker explicitly grades each submitted attempt. Backend failure injection also
uses a test-only pool wrapper. No application hooks, schema, role or privileges
change. Failures expose only a fixed stage and safe counts, not original assertion
values, SQL errors, private markers or causes.

## Independent finding and disposition

Reviewer found P2 in the initial oracle: `decodeURIComponent` of a complete value
failed on an unrelated malformed percent sign and skipped valid encoded canaries
elsewhere. A read-only probe reproduced the false negative in a header and CSS.
Root changed decoding to independent valid percent-byte runs with forgiving UTF-8;
controls now include literal100%, encoded header/CSS markers and adjacent invalid
UTF-8 bytes. Nested/property/JSON-Unicode/raw/header leak controls also fail as
expected without printing private values. Reviewer confirmed closure and no
remaining concrete findings on final code.

## Executed checks

Environment: Node24.18.0/npm11.16.0/PostgreSQL18.6, local working tree.

| Command | Observed result | Evidence / limit |
| --- | --- | --- |
| Root `npm run test:critical:privacy` | 2PASS,0fail/skip;156 responses;53 internal values | `/tmp/tsa-recovery012-focused-final.log`; statuses200/201/400/401/403/404/409/410/413/422/429/503. |
| Independent `node --test tests/critical/student-leakage.test.mjs` | 2PASS,0fail/skip; same156/53 | Actual read-only response_review final; P2 closed. |
| `node --test apps/practice-prototype/test/server.test.mjs` | 4PASS,0fail/skip | `/tmp/tsa-recovery012-static.log`; full static allowlist boundary, existing suite. |
| `npm run test:student` | 44PASS,0fail/skip | `/tmp/tsa-recovery012-student.log`; existing runtime/security suites exercise unchanged default fixture options, including restore cases. |
| Independent syntax/scoped fixture diff checks | PASS | Test code only. |

Root `npm run docs:check` PASS:149 Markdown files/888 links/0errors; historical
ARCHITECTURE_REVIEW_001 whitespace warning preserved. Scoped `git diff --check`
and both new-file Node syntax checks PASS. These are documentation/syntax checks,
not broader runtime acceptance.

Final SHA-256:

| File | Hash |
| --- | --- |
| Oracle | `b7c880309b9ae5a8217ae3e7abb69b30e2d082c4ba5f5f025ce60314e650baa8` |
| Integrated test | `6f19b3cea8e266470e6846f641e2d998af1b3c96940c851932141a475353c457` |
| Mixed fixture | `1fefb0d6e39bc8299ccfbfeb1292f61785683102ec66ed8f6bded4c98a957b6a` |
| Domain fixture | `e097a4a82cac04d842bc3f6779993b784af09d8e02c0f11cb5466d96d56bb927` |

## Limits

Bounded automated existing-runtime coverage only. No new browser automation,
qualified human content/rights/AT evidence, production identity, media delivery,
full profile/mode matrix or exhaustive encoding/side-channel audit. Unknown
arbitrary obfuscations are not claimed detectable. All Q-08/TEST-002 and parent
milestones remain broader; pending architecture proposals remain PROPOSED.
No runtime code, new dependency, commit, push, merge or deployment.
