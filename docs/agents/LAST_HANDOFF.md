# Latest handoff — Track B / WEB-B0 prototype

Owner disposition, 2026-10-19: **G1 ACCEPTED; FOUND-002 COMPLETED** against
implementation `0e67485` and audit baseline `81ef8aa`. Mandatory evidence in the
[final audit](../reviews/G1_ACCEPTANCE_AUDIT.md) is satisfied. Scoped owner record:
[OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md#g1--owner-acceptance-and-bounded-track-b-execution-2026-10-19).
G2/G3 and unresolved downstream decisions remain pending. Earlier pending-G1
statements below describe historical checkpoints, superseded by this disposition.


Date: 2026-10-19, Asia/Bangkok. Owner directive: PRIORITIZE TRACK B: TSA WEBSITE,
recorded in [decisions](../decisions/OPEN_DECISIONS.md#track-b-priority-and-isolated-b0-authorization--2026-10-19).
Priority: approximately 85% Track B visible product, 15% lightweight Track A,
not quotas. WEB-B0 first slice COMPLETED; integrated WEB-001 remains blocked.

## State, authorization and ownership

- Branch `feat/track-b-b0-prototype`, base/HEAD `81ef8aa96ae53a63186c44eae8ccb6cb1c9b173b`.
  B0 implementation is ready for its owner-authorized local checkpoint commit. Starting dirty state was owner AGENTS.md
  only; preserved SHA-256 `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
- G1 ACCEPTED in `27350b3`; FOUND-002 COMPLETED against audit `81ef8aa` and code
  `0e67485`. DATA-001 foundation prerequisites satisfied; affected proposed ADR
  mechanisms and local AUTH stub scope still require disposition. The next bounded
  Track B batch is explicitly authorized, preserving each downstream prerequisite.
- Reused native tsa_builder, Codex gpt-6-luna / XHigh, owned
  `apps/practice-prototype/**`; Sol 6.1 / Medium owned root entrypoints, browser
  acceptance harness and shared records, independently reviewed actual code and
  executed verification. Worker reservations released. No additional agent,
  Terra/Astra or paid API. Relative cost: low–medium implementation, medium review;
  no billed usage claim.
- Changed paths: new isolated app and Node tests; `scripts/verify-b0-browser.mjs`;
  three root npm scripts and one CI unit-test step; README and existing decision,
  task, roadmap/state/handoff records. No package dependency, lockfile, contract,
  database, research-corpus or owner AGENTS change. Gate-only commit `27350b3` is isolated; this B0 checkpoint follows separately. No push/merge/deployment.

## Runnable outcome and limits

Vietnamese responsive landing/catalog, MATH fixture navigation and answer choices,
six-minute demonstration countdown, one-time <=60-second announcement, submit/cancel
confirmation and raw count/percentage result; explicit catalog return/new demo.
Four slots repeat one existing English synthetic question from question.test.ts,
visibly disclosed before and during the attempt. No new subject question content
or official TSA rules were invented. Reading/science cards are visibly unavailable.

Browser modules use an isolated replaceable `/mock` adapter; server memory/cookie
is a demo handle, not authentication, database persistence or NEW_ONLY allocation.
Keys/explanation stay outside public assets and pre-submit responses. Mock scoring
occurs only on closure; no human-reviewed seed stock, live provider, real API,
scoring service, production auth or publication acceptance is claimed.

Review repairs: allow explicit new demo after GRADED without rewriting old result;
translate diagnostic/network errors; disable/guard submission and navigation during
pending saves; ignore stale save after closure; monotonic display clock and separate
expiry retry backoff without showing extra time. Full deployed security and WCAG
conformance are NOT VERIFIED by this isolated local demo.

## Executed verification

Node v24.18.0/npm 11.16.0; Chromium 155.0.8059.79, Linux, 2026-10-19.

| Command / check | Observed result |
|---|---|
| `npm run dev:b0` | Starts loopback http://127.0.0.1:4173; independently fetched |
| `npm run test:b0` | 9 nested tests PASS; zero failures/skips (not restricted 3-file wrapper output) |
| `npm run test:b0:browser` | PASS; actual pointer/keyboard radio interaction, navigation/answer retention, decreasing timer, delayed-save guard, offline failure/retry, submit cancel/confirm, 25.00% result, catalog/new demo |
| Browser desktop 1280x900 / mobile 375x812 | Landing/exam/result no horizontal overflow; six screenshots; desktop landing/mobile exam visually inspected |
| Browser network/privacy | No external page requests or uncaught exceptions; pre-submit bodies exclude keys/explanations; public-file negatives pass |
| `npm run typecheck`, `npm run build`, `npm run test:built` | PASS |
| `npm run test:consumers`, `npm test` | 11 emitted / 106 contract tests PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS; shared artifacts and original contract consumer policy unchanged |
| `npm run docs:check`, Git/new-file whitespace and diff review | PASS; historical whitespace warning retained |

B0 unit runner emits a non-failing Node auto-detection warning for its imported
browser ESM .js file; root module settings were preserved. Hosted CI NOT RUN.
Browser screenshots/report: `/tmp/tsa-b0-browser-evidence/` (transient, regenerate
with the browser command; already installed Chromium required, B0_BROWSER override).
No dependency installation, new benchmarking or dataset download was performed.

## Continuation and demonstration

From repository root run `npm run dev:b0`; open http://127.0.0.1:4173.
Use `PORT=4174 npm run dev:b0` if occupied. No npm install/build is needed for B0.
The verification-started 4173 server may still be running; reuse it or stop it in
its terminal before restarting. Demo: select catalog → start Math → answer/navigate
→ cancel submit once → confirm submit → result → catalog/new demo.
See [app instructions](../../apps/practice-prototype/README.md).

Next visible milestone: distinct lawfully usable, independently reviewed content
and remaining interaction renderers; keep mocks labeled. Integration sequence is
accepted G1 → DATA/AUTH (explicit local synthetic-stub approval) → Bank ingestion and
independent publication evidence/G2 → assembly/attempt/scoring acceptance → B1.
Reconcile ten-question target with accepted separate MATH-4/READING-2/SCIENCE-4
profiles; do not silently create a combined attempt. B2's minimum publication
controls are prerequisites for approved B1 stock, even though visually listed later.
[Roadmap](../tasks/IMPLEMENTATION_ROADMAP.md#active-priority--track-b-first-2026-10-19)
contains dependency ordering and lightweight source/quality/taxonomy/rubric inventory.

G1 evidence/approval wording: [final audit](../reviews/G1_ACCEPTANCE_AUDIT.md),
implementation `0e67485`, evidence `81ef8aa`. Prior handoff preserved in Git at
`81ef8aa:docs/agents/LAST_HANDOFF.md`; Stage 4B `0fc75d8`, Stage 4A `8beb0ff`,
Stage 3 `84ddff3`, accepted setup `0be1384` remain ancestors. Scoped G0, H1/H2/H3,
TTL600, non-retroactive admission edits and D1–D6 approvals remain unchanged;
whole unrelated ADRs remain PROPOSED. G1 acceptance and bounded Track B authorization are explicitly recorded in the
latest owner decision; no G2/G3 advancement or approval of missing evidence follows.
