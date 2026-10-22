# WEB-001/004 successive NEW_ONLY and shortage — 2026-10-23

Bounded engineering coverage from `88a09ea`, branch `feat/track-b-data-auth`.
Accountable implementer Codex Sol6.1; Luna previously reached its usage limit.
Separate native Sol6.1/Medium `directory_review` reviewed read-only. Existing local
engineering authority applies. Owner AGENTS.md and untracked reference research
remain byte-preserved and excluded. No product defect reproduced or product code
changed. Final verification results are recorded below before checkpointing.

## Fixture and workflow boundary

The test-only bundle helper now contains two distinct original Vietnamese reading
passages with two questions each. Existing first-passage text/options/keys remain
unchanged. The second passage concerns a school garden rather than a book exchange;
stems, quantities, answer texts and explanations differ. Explicit READING fixture
input supports one or two complete two-question bundles; default shared-reading
fixture still provisions one bundle/180seconds. MATH fixture behavior is unchanged.
No protected question-bank text is copied.

Both units use the existing isolated author/submission/exact-hash synthetic
reviewer/singleton/rights/publication test workflow. No runtime credentials, rights
checks, canonical-equivalence rules, bundle completeness checks or publication
restrictions were bypassed. These are original disposable workflow fixtures, not
qualified human-reviewed stock or real rights/content acceptance evidence.

## Actual student behavior

New [journey](../../scripts/student-new-only-journey.mjs) explicitly starts and
completes two PostgreSQL-backed READING2 forms. Every view says NEW_ONLY. Selected
SQL stable question IDs, exact version IDs and current canonical equivalence-group
IDs are disjoint across forms. Each form contains the complete ordered members of
one original bundle with its exact shared passage. Visible stems are also distinct;
no semantic novelty or human equivalence-review acceptance is inferred from that.

Both attempts acknowledge two answers, grade100%, and return explicitly to catalog
without automatic chaining. First attempt's complete immutable form/manifest/public
and private snapshots/history/clocks and bound score/items/release stay exact after
completion of the second. Two owned results remain independently readable.

Third actual creation returns422 INSUFFICIENT_UNSEEN_INVENTORY, and UI displays
that no new questions remain instead of starting an exam. Requests contain only
the original blueprintVersionId; no reuse-mode override is sent. All four questions
still have eligible versions, but their assigned identities are exhausted for this
student. Failed allocation leaves committed attempts/forms/manifests/history/
idempotency receipts/jobs/scores/releases exact, and both complete per-attempt
snapshots remain exact. No replacement/generation job appears; the only two jobs
are the original exam graders. Rate-limit buckets are deliberately outside this
comparison: a valid failed creation may consume its separate request budget.

## Review and verification scope

Initial actual Chromium run passed36 inspected responses/four screenshots with
statuses201/201/422. Independent review identified missing detailed-grade
preservation evidence: original snapshots omitted score_runs/score_items/releases.
The implementer added bound rows and cardinality assertions, with exact comparison
of first grade during second completion and both grades after shortage. Final
review reported no unresolved findings and independently passed syntax/whitespace.
No browser/PostgreSQL execution by reviewer; runtime evidence is coordinator-owned.
Engineering review is not qualified human rights/content/accessibility review.

## Final executed verification

Status: IMPLEMENTED / VERIFIED for this bounded engineering card. Node24.18.0/
npm11.16.0, PostgreSQL18.6, Chromium155.0.8059.79, Linux.

| Executed command | Observed result |
|---|---|
| `npm run test:student:new-only` | Initial and strengthened final runs PASS,36 responses/four screenshots,201/201/422 |
| `npm run test:assembly` | 49/49 PASS, zero failures/skips |
| `npm run test:student` | 31/31 PASS, zero failures/cancellations/skips |
| `npm run test:student:reading` | PASS, default original passage/32 responses |
| `npm test`, `npm run test:consumers` | 106/106 and11/11 PASS |
| `npm run build`, `npm run typecheck`, `npm run test:built` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS |
| Changed-script/fixture syntax, `git diff --check`, `npm run docs:check` | PASS; historical whitespace warning only |

No failing verification in this batch. Detailed-grade assertion gap was found in
review, fixed and actual final browser run passed. PG/browser checks were scheduled
sequentially to avoid repeating the preceding turn's contention-sensitive batch.
Transient reports/screenshots are under `/tmp/tsa-student-browser-evidence/new-only`;
commands regenerate them. Existing module-type warning remains. Full Bank/attempt/
foundation/directory, keyboard and Firefox were not rerun for this test-only change;
previous results remain historical.

No G1 contract, schema, product client/backend, dependency/lockfile, rights/review/
publication capability or retained inventory changed. No push/merge/deploy/Astra,
paid model API, live student inference or unauthorized publication. Owner files
preserved; task reservations released; broad goal active. G1 accepted and G2/G3
OWNER_ACCEPTED unchanged. Full WEB/OPS/pilot, lawful inventory, named qualified
human review, manual AT/native zoom and Track A remain outstanding.

Next bounded WEB-001/004 card from independent static discovery: mandatory timing
disclosure before start. EXAM_ENGINE_SPEC.md:77 requires offline time/no grace to
be explained before starting. Direct catalog action bypasses the optional intro's
offline text; CREATED card also lacks explicit no-grace wording. Reproduce with
existing browser assertions, add minimal shared notice near the existing direct/
reserved controls and strengthen intro wording. No new confirmation gate, clock
policy or contract is required. Static P2 only; no new-card implementation claimed
here. Recommended Sol6.1/High while Luna is usage-limited, separate Sol6.1/Medium
read-only engineering review. Prefer assertions in existing journeys rather than
another lifecycle scenario.
