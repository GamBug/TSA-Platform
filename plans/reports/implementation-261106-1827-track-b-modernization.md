# Track B modernization implementation and verification

Core implementation integrated locally; full mission remains IN_PROGRESS because image byte delivery and additional captured interaction types remain gated. No publication, deployment, commit, paid API, production database or new reference-content import occurred.

## A. Repository status

Branch `feat/track-b-data-auth`, source `a70861a412e0a1c88566f25cc42232c9f7987283`. Origin fetch succeeded; branch matched origin0ahead/0behind. Extensive inherited dirty recovery work and the newly supplied `TSA_Example_Questions` were preserved. Changes remain uncommitted.

## B. Implemented features

- Real hierarchical topic catalog with registered versions, group/individual selection, canonical NEW_ONLY inventory, duration-aware rights horizons, confirmed-answer activity and released-only accuracy. Supports multiple selected nodes within one domain/version, empty/shortage/error/loading states and registered family/filter metadata.
- Topic creation uses owner-bound immutable recipes and the existing allocator, snapshot builder, attempt lifecycle, saved answers, grading and release. Server validates ancestry/count/timing; selected-topic/bundle filtering runs again during commit. Private recipes stay out of the ordinary catalog.
- Entry cards connect topic practice, configured independent practice, shortest available configured quick practice and owned resume. Existing H3 independent-section architecture remains; no combined full-TSA examination or official aggregate score is claimed.
- Desktop question canvas/right control rail; responsive collapsed question list; actual timer/progress/bookmarks/submit confirmation; native SC/MC/TF controls and local math/table rendering.
- N/P, option1–9, M/G/?, Escape and Ctrl+Enter with edit/math/composition/modifier/dialog safeguards. Synchronous attachment prevents rapid-redraw lost shortcuts. Native dialog-close focus is checked after its observable close event.
- Staff authoring selects registered version/section/domain/skills/subskills/cognitive level/difficulty. Independent server validation and DRAFT/review/ownership rules remain intact.
- Image widget uses only the frozen authenticated attempt-asset URL and supports enlargement/focus restoration when authorized bytes exist. It does not bypass the inherited default-off media admission/delivery gate. Unsupported images retain alternative text.

## C. Architecture and compatibility

Main owners: `src/modules/topic-practice/service.mjs`, `src/http/topic-practice.mjs`, SQL027, small existing allocation/service/runtime hooks; browser topic/shortcut/media helpers, existing main/staff/client/style files and static allowlist. SQL027 adds a private owner/key/hash-bound recipe registry and narrow candidate functions; original question/1, blueprint/1 and frozen attempt DTOs remain stable.

Additive local API: GET `/api/v1/topics?durationSeconds=120`; POST `/api/v1/topic-practice` with taxonomy/topic IDs, count, optional duration and idempotency key. See [guide](../../docs/guides/TRACK_B_TOPIC_PRACTICE.md). Raw registry access is denied to application roles. The existing migration runner handles SQL027 atomically. The unwritten inherited media migration takes the next available number rather than inserting an older migration later.

`src/local/database-backup.mjs` creates private logical database/role backups before retained startup migration/bootstrap; disposable fixture setup similarly backs up its empty baseline. Backup failure stops bootstrap. Actual restore and populated026→027 preservation checks passed. No retained or production database was migrated during this session.

## D. Actual orchestration and review

AgentKit3.0.0 and installed routing/implementation/frontend/testing/review workflows were used. Kit Explore failed because its configured gpt-5.4-mini is unsupported by this account; no kit/provider configuration was changed. Two native workers owned backend/exam slices. Backend delivery was partial; controller took over and repaired/integrated SQL/service/HTTP/allocator, then reassigned the worker to a bounded real-DB test. Exam worker delivered layout/shortcuts/shared browser scenarios; controller repaired the observable-close test synchronization.

Actual separate AgentKit tsa_reviewer reviews found stale-session UI clearing, discarded retry intent, globally colliding blueprint names, replay budget ordering and incomplete-bundle counts. Controller fixed them with regressions. Final native tsa_reviewer found canonical-group overcount; controller changed catalog counting to group IDs and added a real equivalence adjudication regression. Reviewer independently confirmed source closure. No unresolved finding remains from these scoped reviews. Reviewers did not independently run PostgreSQL/browser suites. Reliable usage/quota metrics were unavailable.

## E. Executed verification

- Baseline build/type/B0five files/contracts/consumer boundaries and student45 passed. Initial restricted socket failures were rerun with approved disposable-process permissions.
- Final build, typecheck, generated contracts and import boundaries passed; no contract artifacts changed.
- Client10named tests across topic API3, topic screen2 and shortcut5 passed; prototype suite8files passed. Source syntax and `git diff --check` passed.
- Real topic HTTP lifecycle1, complete-bundle/budget/collision/equivalence regressions3, private backup/restore1, populated migration preservation1 and delegated service lifecycle1 passed.
- Broad bounded-concurrency command covered328tests:325passed;3failed solely because old migration inventories ended at026. Those assertions now include027. The focused final command reran all three affected files plus the allocation regressions:27/27passed. Do not report the first broad invocation as wholly passing. Remaining broad cases were not redundantly rerun after the bounded expectation/count repair.
- Chrome156 domains:78APIresponses, all three independently grade100%, refresh/clock and lost-submit-key replay passed. Chrome keyboard/reflow/AX checks passed after correcting the redraw race and waiting for actual native close events. No screen-reader/WCAG certification is inferred.
- Chrome and Firefox156 topic journeys passed, including selection/deselection/zero/shortage, reservation, save/navigation/refresh/bookmark, explicit submit with unanswered items and progress. Chromium375px/1440px; Firefox500px/1440px. Firefox keyboard suite passed. Headless Firefox375px is not claimed.
- Staff Chrome156 complete journey passed; one obsolete secondary-fixture template was aligned with the shared taxonomy reader. A DevTools target-navigation interruption was preserved and a subsequent full run passed. Early Firefox TF/footer overlap was repaired before the passing final Firefox student/topic runs.
- Final topic browser rerun passed after a transient initial DevTools navigation interruption. [Topic catalog](track-b-modernization-evidence/topic-catalog-desktop.png), [mobile exam](track-b-modernization-evidence/topic-exam-mobile.png), [desktop exam](track-b-modernization-evidence/topic-exam-desktop.png), [Firefox narrow catalog](track-b-modernization-evidence/topic-catalog-firefox-narrow.png).
- Docs checker passed with0link errors; anchor checking remains outside its scope. Bundled design render-check script failed browser startup and was not repaired; actual project browser captures and manual visual inspection substitute, without claiming that checker passed.

Commands and unabridged local logs: `/tmp/tsa-modernization-regression.log`, `/tmp/tsa-modernization-final-fixes.log`, `/tmp/tsa-modernization-topics-tests.log`, `/tmp/tsa-modernization-topics-final.log`, `/tmp/tsa-modernization-firefox.log`, `/tmp/tsa-modernization-topic-firefox.log`. These are local session artifacts, not release receipts.

Manual visual assessment: calm, focused, readable; approximately21/24 against the design skill rubric. Remaining weaker items are mixed inherited radius conventions, deliberately synthetic engineering copy and preserved native controls. This is a subjective scoped assessment, not conformance evidence.

## F. Reproduce

Node24.18.0/npm11.16.0/PostgreSQL18.6, including pg_dump/pg_dumpall/pg_restore:

```sh
npm ci --ignore-scripts
npm run build
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:domains
```

The launcher prepares its disposable database and starts the application. Open its printed loopback URL with `?student=postgres`, choose synthetic student A, then Topic practice. Ctrl+C tears down the owned application/database.

```sh
npm run test:topics
npm run test:topics:browser
npm run test:topics:firefox
npm run test:student:keyboard
npm run test:student:firefox
npm run test:track-b:browser
```

## G. Meaningful remaining work

1. Finish the inherited reviewed private inspected-image admission/delivery work before claiming actual diagrams can be served. The frontend URL/zoom widget alone does not complete that gate.
2. The newly supplied corpus evidences numeric/text entry and matching. These require versioned persistence/scoring/rendering compatibility work; no conversion into fake choice questions or automatic ingestion was performed. [Inspection](research-261106-1827-tsa-example-questions.md).
3. A combined full-exam flow would need an explicit versioned extension to the existing independent-section H3 architecture. Current entry cards describe actual server offerings.
4. Qualified content/rights/human accessibility and production acceptance remain separate. No full-mission completion claim is made while these relevant delivery gaps remain.
