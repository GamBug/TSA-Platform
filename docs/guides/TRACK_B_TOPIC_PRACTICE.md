# Topic practice and exam navigation

Optional decimal entry uses a separate versioned capability. See [numeric practice and its disposable demonstration](TRACK_B_NUMERIC_PRACTICE.md); the topic catalog retains its existing eligibility rules.

Local implementation and scoped verification are recorded in the [execution plan](../../plans/261106-1019-track-b-modernization/plan.md). This is an independent, unofficial local preparation platform. Synthetic examples establish engineering behavior, not content rights, qualified publication review, official scoring or HUST affiliation.

## Classification and counts

Topic selection uses registered immutable taxonomy versions and their domain/skill/subskill ancestry. It never creates school-subject categories or inventory on the client. Choose topics within one domain and taxonomy version; selecting a group includes its directly classified questions and descendants. Reading text genres are contexts, while reasoning skills are a separate dimension when registered. A small synthetic bank may contain only one skill in each section; absent topics are not represented as populated categories.

Counts must use the same approved-version, rights, delivery, equivalence and student-history eligibility as the allocation engine. Attempted counts include confirmed non-empty answers, including active attempts; accuracy includes only authorized released grades. Student progress comes from persisted student activity; absent accuracy remains unavailable rather than a fabricated percentage. Counts describe the read snapshot; allocation rechecks eligibility and may reject a request if stock changed or constraints cannot be met.

## Local API extension

The topic routes are additive local runtime interfaces alongside the existing frozen student API. Existing attempt GET, answer-save, start, submit, result and review DTOs remain the lifecycle authority.

- `GET /api/v1/topics?durationSeconds=120` returns `{ groups }`, containing node IDs, pinned taxonomy IDs, safe labels/codes, child nodes and eligible/attempted/accuracy aggregates. The optional duration is 60–10,800 seconds and uses the same rights horizon as creation. It contains no questions, grading keys or explanations.
- `POST /api/v1/topic-practice` takes `{ taxonomyVersionId, topicIds, questionCount, durationSeconds? }` and an `Idempotency-Key`. Count is 1–100; duration defaults to 60 seconds per question and is bounded to 60–10,800 seconds. Requests require the current candidate session, same-origin protections and CSRF. The response is an existing creation receipt; a separate owned GET reads the reserved attempt. Stock shortage is explicit and never silently repeats questions.

A topic catalog and a creation intent are bound to the initiating session. Retrying an uncertain response preserves the same key and original body. Refreshing recovers an owned saved attempt instead of repeating a creation POST. Creating a reservation does not start its clock; the existing explicit Start action does.

## Staff authoring

The authenticated AUTHOR template includes registered taxonomy metadata. Select a version, section, domain, one or more skills, optional descendant subskills, cognitive level and target difficulty. Changing a parent resets incompatible descendants. The server validates membership independently. Creation remains DRAFT; existing review, ownership and publication gates are unchanged. The local template source remains explicitly synthetic with UNKNOWN rights until a separately authorized workflow changes them.

## Exam controls

Desktop presents the current question with a timer, submit action, numbered question rail and answered/total progress. Smaller screens collapse the question rail; native answer controls remain operable by Tab, Shift+Tab, arrows, Space and Enter.

| Shortcut | Action |
| --- | --- |
| N / P | Next / previous question |
| 1–9 | Select or toggle an applicable answer option |
| M | Toggle bookmark |
| G | Open question navigator |
| ? | Open shortcut help |
| Esc | Close the active dialog or navigator |
| Ctrl+Enter | Open submit confirmation |

Global shortcuts ignore input, textarea, select, editable regions, composing/repeated keystrokes and active dialogs. True/false statements retain native per-statement controls. Submission requires explicit confirmation. Save status distinguishes acknowledged, pending and failed changes; navigation cannot discard unacknowledged changes.

Shortcut help includes a native checkbox to disable character-only shortcuts, including the question-mark shortcut. The visible Help button remains available. The preference applies to the current open page and survives question redraws; a page reload starts with the default enabled setting. Ctrl+Enter and native keyboard operation remain available. This follows [W3C's character-shortcut guidance](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html); it is not a claim of complete accessibility conformance.

Authorized images use only the frozen owned-attempt asset route with an explicit question/explanation purpose, alternative text and native enlargement. SQL028 and an explicitly injected private local image store support inspected PNG/JPEG/WebP content through a separate profile. The feature remains disabled by default. Student byte requests recheck ownership, sealed membership, purpose/security class, current rights/holds, section timing and released-result permission. Unsupported, corrupt or unavailable bytes fail closed. See the [media implementation plan](../../plans/261105-2242-recovery029-media-delivery/plan.md) and [verification checkpoint](../../plans/reports/implementation-261107-0756-inspected-images-and-keyboard.md). No source screenshot import or general media activation follows from the test fixture.

## Demonstrate and test

Use Node24.18.0/npm11.16.0 and PostgreSQL18.6; see the existing [setup guide](TRACK_B_SUPERVISOR_DEMO.md). Install and build:

```sh
npm ci --ignore-scripts
npm run build
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:domains
```

The launcher prepares a disposable synthetic PostgreSQL database and prints its loopback URL. Open that exact URL with `?student=postgres`, sign in as synthetic profile A, then choose Topic practice from the catalog. Stop the terminal with Ctrl+C to close the app and remove the disposable database. Never point fixture scripts at production or mutate a retained database without a fresh backup.

Existing checks include `npm run test:b0`, `npm run test:student:keyboard`, `npm run test:student:domains`, `npm run test:student:firefox` and `npm run test:track-b:browser`. Use `npm run test:topics` for topic service/HTTP/allocation/upgrade regressions, `npm run test:topics:browser` for Chromium, and `npm run test:topics:firefox` for Firefox. Firefox headless automation on this host verifies 500px narrow width; Chromium verifies375px. Commands are not passing evidence until recorded as executed in the task report.

The retained local runtime creates a private logical database and role backup in a sibling `<data-directory>-backups` directory before migration/bootstrap changes. PostgreSQL `pg_dump` and `pg_dumpall` are required; restore verification also uses `pg_restore`. Backups are private local data, excluded from Git and public assets. A backup failure stops bootstrap. Disposable fixtures take an initial private backup inside their temporary directory and remove it on teardown.
