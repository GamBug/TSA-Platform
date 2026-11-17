# Reading Factory experimental verification — 2026-10-27

Later continuation: [first ten actual current-Codex-authored questions](INT_003_FIRST_MANUAL_LLM_BATCH.md)
now exist in private manual staging, with unknown usage and no provider API call.
The original fixture outcomes below remain historical fixture evidence; they are
not relabelled as real LLM output or human approval.

Status: IMPLEMENTED / AUTOMATED_PASS for the bounded fixture experiment; live
generation and human acceptance remain unperformed. Accountable implementer
root/current Codex. Scope/authority:
[owner experiment](../decisions/READING_FACTORY_EXPERIMENT_2026_10_27.md).
Branch `feat/track-b-data-auth`, starting HEAD `a70861a`, uncommitted. Owner-modified
AGENTS.md and untracked research remain outside this task's edits. No commit,
push, merge, deployment, real source rights or human content approval is claimed.

## Separate outcomes

| Dimension | Observed status |
|---|---|
| Offline tool / adapter / validators | IMPLEMENTED; dry-run outputs20 canonical Factory v2 candidates, two passages, all three supported interactions |
| Deterministic unit tests | PASS17, real local subprocess fixture bridge; no network/model |
| Canonical Bank / profile / student integration | PASS; canonical DRAFT import/replay, existing review procedure, ordinary publication blocked, test-only synthetic approval,20-question1800-second save/reload/submit/release, seed/receipt replay and NEW_ONLY shortage |
| Existing website browser journey | PASS on Chrome156; all20 saves, reload, submit,100%, all20 released explanations, desktop/narrow screenshots; final browser/label verification is root-only |
| Live LLM inference | NOT_EXECUTED; no provider/model/credential/budget configured in repository source; command bridge needs operator configuration |
| Independent model critique | NOT_EXECUTED with real model; blinded process protocol tested using explicit local TEST_DOUBLE |
| Human content review / approval | NOT_PERFORMED; synthetic identities are not human reviewers |
| Real Bank publication | NOT_PERFORMED; existing publication gates retained |
| Six bundles /60 human-approved questions | NOT_PERFORMED; first full20-question technical slice prioritized |
| Independent code review | Core/tooling/SQL/runtime/integration reviewed; one raw-byte P2 fixed and independently retested. Launcher static review performed. Final browser repairs and small client profile label were not independently re-reviewed because reviewer reached usage limit |

## Executed evidence

Environment: Node24.18.0, npm11.16.0, installed repository dependencies on Linux,
2026-10-27 Asia/Bangkok. Tests requiring subprocess stdin and private PostgreSQL
sockets run with authorized sandbox escalation. Ordinary sandbox child stdin was
empty: initial unit command failed (10 pass/3fail when run directly; node test
isolation reported one failed file). This is not recorded as a pass. The same
subprocess tests passed outside the sandbox; final suite expanded to17 tests.

| Command | Actual result | Scope / limits |
|---|---|---|
| `npm run build` | PASS | Existing contract build, no schema changes |
| `node tools/question-factory/cli.mjs fixture-input /tmp/tsa-reading-input-20261027.json` | PASS | Original labelled fixture input only |
| `node tools/question-factory/cli.mjs dry-run /tmp/tsa-reading-input-20261027.json /tmp/tsa-reading-run-20261027` | PASS20; validation PASS; human/publication NOT_PERFORMED | Actual private export; second identical invocation replayed persisted bytes |
| `node tools/question-factory/cli.mjs dry-run /tmp/tsa-reading-input-20261027.json /tmp/tsa-reading-run-final-20261027` (twice) | PASS20 then exact replay | Final tool/prompt/validator-pinned plan and private near-match flags in reference evidence; earlier run retained unchanged |
| `node --test tests/ai/reading-factory.test.mjs` (authorized escalation) | PASS17/17, zero skipped | Schema/type/quota/key/evidence/rights/ID/exact duplicates, near-match flag, inert source instructions, active HTML rejection, private run replay/conflict/integrity, public-root/symlink-parent export denial, provider credentials/budgets, four separate calls, blinded disagreement, exact raw bytes/invalid UTF-8, refusal/timeout/unknown failure, unrelated credential isolation and nullable actual usage |
| `node --test tests/integration/bank/factory-import.test.mjs tests/integration/factory-bank-exam/reading-factory-exam.test.mjs` | PASS16/16 | Real PostgreSQL canonical package atomicity/late-member rollback, exact replay/conflict, restricted capability/roles, immutable references, current rights, actual20-question student HTTP/client flow; synthetic content/reviewer scope only |
| `node --test tests/integration/assembly/*.test.mjs tests/integration/student-runtime/*.test.mjs tests/integration/student-security/*.test.mjs tests/integration/directory/*.test.mjs` | PASS137/137 | Real PostgreSQL assembly/bundles, H1/reuse/review/fixed/short/domain/lifecycle/restart/recovery, restricted pools, directory/catalog/cursors; includes experimental pin/shortage guard |
| `npm run test:factory:reading` | PASS19/19, zero skipped | Final public script: offline17 + profile1 + full PostgreSQL integration1 |
| `npm run test:factory:reading:browser` | PASS; Chrome156.0.8078.47;20/20,100%;20 explanations; five captures | Existing website, real disposable PostgreSQL/worker; desktop1280×900 and captured390×844; no human usability/accessibility or Firefox claim |
| `env NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true node scripts/start-reading-factory-demo.mjs` | READY at `http://127.0.0.1:40699/?student=postgres` | Retained running disposable process for owner walkthrough; synthetic fixture only; separate from browser-test database. Closing it discards demo data |
| `npm test && npm run test:consumers && npm run test:b0` (authorized escalation) | PASS; B038/38 | Contract suite, emitted consumers and existing prototype/persistent client regression. Initial sandbox run failed two contract files without detailed child test output; all passed with normal subprocess access |
| `npm run typecheck` | PASS | Existing package TypeScript scope |
| `npm run contracts:check` | PASS | Existing OpenAPI/operation maps unchanged |
| `npm run contracts:consumer-check` | PASS | Existing student/public app import boundary |
| `npm run test:b0 && npm run contracts:consumer-check && node --check apps/practice-prototype/public/app/main.js` | PASS38/38, import boundary and syntax PASS | After additive Reading20 profile-name presentation repair; no transport/eligibility authority moved to client |
| `git diff --check` | PASS | Owner AGENTS.md remains outside task edits |
| `npm run docs:check` (authorized escalation) | PASS; zero errors | Tracked docs; separate link/fence/whitespace check passed for three new task-owned docs. Sandbox fallback instead included owner's untracked research and reported its existing whitespace/missing screenshot links; owner draft left unchanged |

Read-only independent reviewer `/root/reading_independent_review` (configured
native Codex tsa_reviewer, Sol6.1/Medium) inspected offline tooling, SQL026,
profile/runtime guards and the integration fixture/tests; no files touched.
Reviewer independently executed offline16+profile1 PASS17/17 and integration1/1,
and `git diff --check`. Its concrete P2 reproduced malformed UTF-8 being replaced
before raw capture. Root changed capture to exact base64/length/SHA-256 before
fatal decoding; reviewer independently confirmed closure and reran17/17.
Reviewer subsequently reviewed the public-root/symlink-parent guard, pinned plan,
private near-match flags and launcher; independently reran the final focused
offline17+profile1+integration1 suite PASS19/19, zero skipped. Its actual first
browser attempt FAILED at a missing test selector (`question-title` is an HTML ID,
not a data-testid). Root then assumed the stopped worker's remaining files after
both worker/reviewer reported usage limits. Root corrected that selector, captured
the score before leaving its page, asserted visible disclosures in the existing
one-question-at-a-time review, and added captures/report/failure diagnostics.
Root's final direct browser run and public npm browser command both passed.
Final browser repairs, captures and additive client profile-name guard have
ROOT_VERIFIED status, not a claimed independent browser pass. The small UI guard
recognizes the exact returned20/1800 Reading profile for presentation; it neither
activates nor authorizes a blueprint. The fixture title explicitly labels sample
content, and all source text/rights gates remain unchanged. Root's screenshot
inspection additionally caught the label becoming unknown after reload loses its
original catalog identity. The final fallback presents only the public loaded
Reading/count/duration facts, without reconstructing a blueprint ID or bundle
layout. The browser now asserts the readable20-question label both before and
after reload; B038/import boundary/syntax were rerun successfully.
An interim strengthened browser run failed a reload race: it could inspect the
old document's title before navigation completed. Final verification now requires
`performance.timeOrigin` to change and the new loaded attempt/label to be present
before asserting restored answers. The actual public npm browser command passed
again with that new-document fence and all20 explanations; final captures/report
were regenerated. Earlier failed runs are not counted as passes.

Actual browser artifacts: `/tmp/tsa-reading-factory-browser-evidence/report.json`,
`catalog.png`, `exam.png`, `exam-narrow.png`, `result.png`, `review.png`. Root visually
inspected the narrow exam and desktop result; these are synthetic technical proof,
not educational validity. No browser page is given the private test answer keys;
the driver chooses the known fixture controls while the ordinary server boundary
is separately asserted by integration tests.

Implementation files: `tools/question-factory/{reading,providers,cli}.mjs`;
SQL026; additive profile/allocation/directory/attempt/runtime option propagation;
one client presentation guard; new AI/profile/integration tests and demo/browser
scripts. No dependency, lockfile, frozen shared schema, generated contract artifact,
research, historical exam or retained inventory change. Root owns final shared
records and all reservations are released. Existing independently reviewed core
findings remain closed; a fresh independent final browser/UI pass is NOT_EXECUTED.

These tests establish technical behavior, not educational validity. Fixture M2/M3
labels are quota plumbing. Quote equality does not establish entailment. The
unvalidated Jaccard heuristic only produces review flags; it does not adjudicate
equivalence, approve or reject a draft.

## Reproduction and remaining inputs

Follow the [operator guide](../guides/READING_FACTORY_EXPERIMENT.md). Run artifacts
are private local evidence, never student content. To execute live generation an
operator must provide a compatible explicit local/free adapter, actual pinned
model, allowed source/data handling, named credential if remote, enforced no-charge
limits and token budget. The tool has no vendor HTTP implementation because no
actual vendor configuration was available to implement against. No paid use is
authorized. Real publication additionally requires the existing authority, current
rights and independent qualified human review; this task cannot fabricate them.
