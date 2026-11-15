# Program audit and repair

Status: ACTIVE. Single Codex implementer and inline reviewer; no delegation or independent review. Owner resumed the goal with full execution permissions on 2026-11-11. The preceding turn made progress by inventorying the workspace and establishing baseline evidence. Existing uncommitted Math work is preserved.

## Confirmed repair

Numeric and cloze/matching practice rendered inspected images with the default `/api/v1` URL even though their attempt APIs use `/api/v2` and `/api/v4`. The shared image component also refused `v4`. The main client now shares its selected API version with image rendering, and the component accepts the already-supported v4 asset endpoint. Simulation continues using its existing explicit v3 endpoint. No backend authorization, publication gate or versioned contract changes.

The new `question-media.test.mjs` executes the real mode setup and content renderer with the existing minimal DOM test approach. It failed before the fix on the numeric image URL and passes after the fix for question and released-explanation images in v1, v2 and v4, while rejecting unsupported versions.

## Executed evidence

- `npm run build`, `npm run typecheck`, `npm run contracts:check`, `npm run contracts:consumer-check`: PASS.
- `node --test --test-concurrency=2 tests/ai/*.test.mjs tests/scoring/*.test.mjs tests/security/auth/*.test.mjs`: restricted execution reported five file failures; unrestricted rerun PASS, 121 tests. Logs: `/tmp/tsa-audit-unit.log`, `/tmp/tsa-audit-unit-escalated.log`.
- `npm test`: PASS, 192 tests; `/tmp/tsa-audit-contracts.log`.
- `npm run test:docs`: PASS, 13 tests; `npm run docs:check`: PASS with preserved historical warnings before navigation updates.
- `node --test apps/practice-prototype/test/question-media.test.mjs`: reproduced the URL mismatch before the fix, PASS afterward.
- `npm run test:b0`: PASS, 87 tests after the repair; `/tmp/tsa-audit-app.log`.
- `npm run test:built`, `npm run test:consumers`: PASS, emitted smoke checks plus 2 and 12 tests.
- Database foundation tests: PASS, 37 tests; `/tmp/tsa-audit-db-foundation.log`.
- `npm run test:db:preflight`: PASS, 11 named PostgreSQL invariants; `/tmp/tsa-audit-db-preflight.log`.
- `npm audit --json`: zero reported vulnerabilities; `/tmp/tsa-audit-dependencies.json`.
- Chromium image, numeric and cloze/matching journeys: PASS; `/tmp/tsa-audit-browser-images.log`, `/tmp/tsa-audit-browser-numeric.log`, `/tmp/tsa-audit-browser-cloze.log`.
- `node --test --test-concurrency=2 tests/integration/**/*.test.mjs tests/critical/*.test.mjs tests/media/*.test.mjs apps/practice-prototype/test/*.test.mjs`: PASS, 605 tests, zero failed/skipped, 383 seconds; `/tmp/tsa-audit-integration-full.log`. This run began before the client fix; the complete 87-test app suite and focused regression were run after the fix. Backend source was unchanged by this audit.
- Syntax checks across 137 application, service, script and tool JavaScript modules: PASS.
- Documentation check after navigation updates and final `git diff --check`: PASS.

## In progress and remaining scope

The integration run (session 94088), browser journeys (session 44184), database foundation run (session 60576), syntax scan (session 22457), and all other audit-started test/probe handles completed. The old restricted integration runner was stopped (owned PID 420485); its failures are not treated as product findings. No audit-started background runtime remains.

The owner resumed the goal tracker on 2026-11-12. Its earlier paused state is resolved. The full objective is not marked complete or blocked.

Continue inspection across operational scripts, content admission, Bank/publication, allocation, attempt lifecycle, grading, privacy and browser behavior. The current test evidence does not prove the entire program free of bugs. No retained content was approved, changed or published. Tests use owned disposable databases and their existing pre-change backup facilities. The pre-existing demo on port 4180 belongs to earlier work and was left running.

## Second audit pass — 2026-11-12

The preceding pass was progress: it repaired image protocol selection and completed the recorded baseline checks. The current worktree and completed process handles were rechecked before continuing. All prior uncommitted Math changes remain preserved.

Confirmed additional repairs:

- Disabled v2/v3/v4 APIs and unknown local workspace paths returned 503/500 because the integrated router returned null. They now return 404; API errors retain the existing safe error envelope and request ID. Real unavailable services still use 503.
- Registered `/local/` extension routes outside the hard-coded workspace/demo-notice paths were unreachable. The HTTP bridge now forwards the full local route namespace; the runtime still uses exact registered paths and returns 404 for unknown paths.
- A delayed simulation background poll could clear a replacement authenticated identity or overwrite its notice. Completion now checks the read sequence, attempt and bound session before changing UI state. Real current-session failures still clear a revoked identity.
- Owner publication skipped unsupported candidates but still recorded display rights on their exclusive sources. The publication plan now selects rights dependencies from only supported targets, retains required shared sources, and makes a zero-target confirmed run inert. The candidate inspection query supplies the real local source dependencies. No retained publication or rights operation was executed.

Verification:

- `node --test tests/integration/local/track-b.test.mjs`: reproduced 503 instead of 404, then reproduced a configured route returning 404 instead of 200 before its separate bridge fix.
- `node --test --test-concurrency=2 tests/integration/local/*.test.mjs apps/practice-prototype/test/server.test.mjs`: PASS, 43 tests at that revision; `/tmp/tsa-audit-local-routing.log`.
- `node --test apps/practice-prototype/test/simulation-state.test.mjs`: three stale-poll cases failed before repair; all seven cases now PASS, including same-session read ordering and positive current-session controls.
- `npm run test:b0`: PASS, 94 tests; `/tmp/tsa-audit-app-second-pass-final.log`.
- `node --test --test-concurrency=2 tests/integration/student-runtime/transport.test.mjs tests/integration/student-runtime/asset-http-boundary.test.mjs tests/critical/student-leakage.test.mjs`: PASS, 12 tests; `/tmp/tsa-audit-routing-boundaries.log`.
- `npm run test:student:simulation` and `npm run test:student:simulation:firefox`: PASS, real 100-answer journeys, retry, session changes, privacy, layouts, section clocks and final section totals; `/tmp/tsa-audit-simulation-chromium.log`, `/tmp/tsa-audit-simulation-firefox.log`. The precise stale-poll race is covered by the callback regressions above; the browser journeys provide broader simulation regression evidence.
- Publication-plan tests reproduced both excess-source cases before repair. `node --test tests/integration/local/owner-publication-plan.test.mjs`: PASS, three tests including real PostgreSQL zero-candidate command execution; `/tmp/tsa-audit-publication-noop.log`.
- Numeric import plus publication planning: PASS, three tests; `/tmp/tsa-audit-publication-sources.log`. The first added database assertion incorrectly compared an external source ID to its remapped local ID; it was corrected to resolve the immutable external mapping, without changing production import behavior.

Publication/Math/demo regressions: PASS, 21 tests; `/tmp/tsa-audit-publication-regressions.log`. All second-pass test/browser processes completed; none remains running. Documentation and diff checks pass. Remaining audit scope is unchanged; these repairs do not establish full-program completion. No independent reviewer was used.

## Third audit pass — 2026-11-12

The preceding pass was progress: four confirmed repairs and their focused verification were completed. This pass inspected backup, migration, process cleanup and role-provisioning paths, then followed the same role checks into direct Bank and identity startup.

Confirmed repair: startup accepted capability grants with ADMIN enabled or required INHERIT/SET disabled, and accepted capability roles widened through parent roles or role-management privileges. This could let a service delegate its capability or cross the intended service boundary, or cause later transaction failures. Local provisioning and direct Bank/identity connection checks now reject those configurations. Capability roles must retain their pinned non-login, non-inheriting, non-privileged, parentless configuration. Startup does not silently rewrite existing grants. The already-strict student pool attestation remains unchanged. No retained roles or data were altered.

Evidence:

- `runtime-role-membership.test.mjs` reproduced every missing membership-option rejection for all four local runtime logins, then reproduced inherited Factory access and CREATEROLE capability drift. The same gaps were reproduced through direct Bank and identity construction.
- `node --test tests/integration/local/runtime-role-membership.test.mjs tests/integration/local/student-workspace.test.mjs tests/security/auth/local-auth.test.mjs`: PASS, 38 tests at the completed guard revision; `/tmp/tsa-audit-capability-drift-after.log`. Each mutation used a backed-up disposable database; failed startup left the drift untouched and tests restored or rolled back their changes.
- The simulation browser journey now tests navigating away and Back, retaining the saved answer and a ticking clock. Chromium and Firefox both PASS, including their complete 100-answer journey. Logs: `/tmp/tsa-audit-simulation-back-before.log`, `/tmp/tsa-audit-simulation-back-firefox.log`. Both engines reloaded the document (`cached document: false`), so these checks do not establish back-forward-cache restoration behavior. No speculative timer repair was applied.
- The intermediate backend run completed with 528 passes and 15 failures, `/tmp/tsa-audit-backend-final.log`. Fourteen failures were new capability-drift assertions and their parent tests loaded against the earlier module revision while the repair was being developed. They pass under the completed revision in the 38-test focused run above. This mixed-revision run is not reported as a passing gate.
- The remaining failure was diagnosed from its original assertion: the staff demo test inspected stdout after the readiness record but before the later human banner reached the pipe. The reader now accepts only complete JSON lines and waits for the final banner footer before retaining all existing assertions. The isolated rerun passes, 2 tests; `/tmp/tsa-audit-review-demo-banner.log`.
- The fresh broader backend run completed against the finished security guards: PASS, 543 tests, zero failed/skipped, 393 seconds; `/tmp/tsa-audit-backend-stable.log`. No production source changed during that run. The later timestamp fix below has separate affected-suite evidence.

Additional confirmed repairs:

- A real disposable HTTP probe and the new rights regression reproduced `503 TEMPORARILY_UNAVAILABLE` for year-zero timestamps and offsets of +16:00/-16:00. Rights validation now rejects the unsupported PostgreSQL representation with `422 VALIDATION_ERROR`, before rights writes. Original timestamp strings still reach PostgreSQL unchanged, preserving microsecond windows. The regression verifies both validFrom/validTo rejection, no rights records, successful +07:00 and boundary ±15:59 offsets, and one-microsecond intervals. Focused test PASS (1); Bank/publication regressions PASS (25), `/tmp/tsa-audit-rights-timestamps-regressions.log`; actual delivery-safety/review-context suites PASS (48), `/tmp/tsa-audit-rights-delivery-regressions.log`.
- Numeric-answer help now displays the ASCII minus accepted by the parser rather than the unsupported typographic minus. `npm run test:b0`: PASS, 94 tests; `/tmp/tsa-audit-app-third-pass.log`.

One ad-hoc regression invocation included two nonexistent test paths that Node silently ignored. Its 25 Bank/publication passes were retained as that narrower evidence, and the real owning delivery/review-context suites were located and run separately above. A filesystem check found all 132 referenced package-script paths/globs resolve; no package-command coverage was inferred from unmatched paths.

All third-pass test/browser/probe processes have completed. Documentation and diff checks pass. Next coverage includes staff authoring/navigation and remaining intake/operational error paths. The overall goal remains active and incomplete.

## Fourth audit pass — 2026-11-12

The owner explicitly continued the goal with full execution permissions. Single-agent implementation and inline review continue; no delegation, commits, retained database mutation or paid API calls.

Confirmed repairs:

- REVIEWER and BANK_MANAGER workspaces did not discover enabled numeric routes because numeric capability was populated only from the AUTHOR template. They now probe the existing v2 metadata route, following the existing v4 discovery pattern, and use v2 for the legacy/numeric list when enabled. No author template, key or explanation access is added. Two role-specific regressions failed before repair and now pass for enabled/disabled configurations; the real numeric browser journey verifies both roles, actual numeric metadata and the manager's rights-blocked v2 context.
- Unsaved author fields could be silently discarded by Return, Logout or browser navigation. Input/change tracking now protects local edits and uncertain create acknowledgements. Return and Logout ask for explicit discard; beforeunload uses the browser warning. Cancellation preserves the form; acknowledged creation clears the submitted revision while edits made during the request remain protected. Successful logout, explicit discard and workspace replacement clean up private state/guards; session invalidation clears private fields immediately. Draft contents are not persisted to browser storage. An already-sent request can still commit, which the discard message explains.

Verification against the completed repair:

- `npm run test:b0`: PASS, 101 tests, zero failed/skipped; `/tmp/tsa-audit-app-fourth-pass-final.log`. Five new navigation tests cover cancelled navigation, in-flight edits, lost acknowledgement, guard cleanup and forced session clearing. Numeric discovery adds two tests.
- `TRACK_B_NUMERIC_TEST=true TRACK_B_ARTIFACT_DIR=/tmp/tsa-audit-staff-draft-navigation node scripts/verify-track-b-browser.mjs`: PASS; `/tmp/tsa-audit-staff-draft-navigation-browser.log`. Real Chromium native Return/Logout confirm and Reload beforeunload cancellations preserve values and document identity. A separate accepted discard removes the private form and unload block. Reviewer/manager discovery and existing numeric PostgreSQL creation checks also pass.
- `TRACK_B_ARTIFACT_DIR=/tmp/tsa-audit-staff-standard node scripts/verify-track-b-browser.mjs`: PASS; `/tmp/tsa-audit-staff-standard-browser.log`. Complete existing staff workflow and privacy assertions are retained.
- `TRACK_B_ARTIFACT_DIR=/tmp/tsa-audit-staff-cloze TRACK_B_CLOZE_MATCHING_TEST=true node scripts/verify-track-b-browser.mjs`: PASS; `/tmp/tsa-audit-staff-cloze-browser.log`. Both real question/3 creation paths and rights-blocked context remain correct.
- All three browser runs report no uncaught browser errors or external page requests. Their databases/profiles are disposable, owned and cleaned up by the harness.

Initial verification failures were diagnosed rather than counted as passes. The expanded numeric journey first clicked away while manager context was still loading; it now waits for the completed `NOT_EVALUATED` status before switching identity. The standard journey timed out on Logout after its answer-type validation deliberately left unsaved fields. Adding control-ID/dialog diagnostics identified the native confirm at that exact action; the journey now explicitly accepts discard there. Production warnings were preserved. The final logs above supersede those failing runs; no weakened assertions or fabricated responses were used to satisfy the new checks.

Inline review confirmed that post-create metadata refresh already catches its own read failures, so it does not erase a successful creation acknowledgement. No speculative acknowledgement repair was applied. Guides explain numeric role discovery and unsaved draft behavior. Documentation/diff checks pass; all fourth-pass browser/test processes completed and no owned runtime remains. The full-program goal stays active; remaining coverage includes additional allocation/attempt failure boundaries and intake/operational paths. No independent review is claimed.

## Fifth audit pass — 2026-11-12

The preceding turn made progress through two verified staff repairs and updated authoritative records. This pass inspected topic catalog preparation, pagination, attempt creation/save/start/submit and ordinary student deadline reads. Existing uncommitted work remains preserved.

Confirmed repair: `refreshAfterDeadline` guarded only identity changes. Within the same identity, a delayed old deadline read could replace a newer graded/selected attempt with its old closure, restart the old clock from an IN_PROGRESS response, or clear the lock on a newer deadline read after timer replacement. It now captures the exact attempt object and a unique in-flight read token. Success/error handling requires both to remain current; cleanup releases only its own token. Existing server-authoritative timing, retries and genuine current-session failure handling remain intact. No contract or server behavior changed.

Evidence:

- `node --test apps/practice-prototype/test/persistent-state.test.mjs`: reproduced five failing stale-result/error/lock assertions before repair; `/tmp/tsa-audit-deadline-before.log`. The actual private callback is exercised with deferred completions, following the existing file's test pattern.
- `npm run test:b0`: PASS, 109 tests, zero failed/skipped; `/tmp/tsa-audit-app-deadline-final.log`. Eight added deadline cases cover same-ID/new-ID replacement, stale authentication errors, overlapping read cleanup, stale clock response, positive clock/closure behavior and current failure/retry. An earlier completed post-fix run passed 107 tests before the final two positive/clock cases were added.
- `STUDENT_EXPIRY_TEST=true STUDENT_ARTIFACT_DIR=/tmp/tsa-audit-deadline-expiry node scripts/verify-student-browser.mjs`: PASS; `/tmp/tsa-audit-deadline-expiry-browser.log`. A real eight-second PostgreSQL deadline, acknowledged answer, offline page departure, owner-read expiry reconciliation, unchanged snapshots/digest and one grading job are verified. This is broader browser regression evidence; the precise delayed-response race is established by the callback tests above.
- `STUDENT_TOPIC_TEST=true STUDENT_ARTIFACT_DIR=/tmp/tsa-audit-topic-browser node scripts/verify-student-browser.mjs`: PASS; `/tmp/tsa-audit-topic-browser.log`. Real taxonomy selection/deselection, empty selection, shortage without allocation, topic creation and desktop/mobile rendering pass.
- `node --test --test-concurrency=2 tests/integration/topic-practice/*.test.mjs tests/integration/student-runtime/topic-allocation-boundaries.test.mjs tests/integration/student-runtime/topic-http.test.mjs tests/integration/attempts/*.test.mjs`: PASS, 33 tests, zero failed/skipped; `/tmp/tsa-audit-topic-attempt-regressions.log`. Tests include canonical inventory, owner isolation, exact retries, rights/save lock ordering and deadline crossing during save.

All test/browser handles completed and process inspection found no remaining audit-owned runtime. No retained data/roles, content approvals or rights were changed; no commits, paid API calls or delegation. Inline review only. The overall audit remains active; further intake/operational and remaining browser failure-path inspection is still required.

## Sixth audit pass — 2026-11-12

The preceding pass made progress through a verified deadline-read repair. This pass inspected deterministic corpus input pinning/private outputs, Math append baselines, backup execution, import activation/coordinator retirement, and demo startup/cleanup. No additional reproducible defect was established in those inspected operational paths. Existing DRAFT and rights boundaries were preserved; inspection did not run retained import or publication.

Confirmed usability repair: the catalog's owned-attempt callout labeled a CREATED reservation as an attempt in progress and displayed answered progress before start. It now says the reservation has not started and offers **Đọc lại bài đã giữ**. An IN_PROGRESS attempt retains its existing progress and continue label. The real admission browser journey asserts the reserved label and then reads and starts the original attempt explicitly.

Two browser journeys had stale assumptions, which were diagnosed against current source and frozen contracts:

- Admission initially expected a reloaded externally-created attempt to be associated with a specific catalog blueprint solely by domain. `AttemptViewSchema` and `AttemptHistoryItemSchema` expose no blueprint ID, and `persistent-api.js` intentionally keeps validated creation/profile associations only in memory. The current UI correctly disables an unknown association and preserves the owner-scoped read callout. The journey now asserts this boundary and uses that existing callout through the available filter, separate reserved start and later resume. It still verifies future/elapsed new-admission guards, ICT times across timezone changes, one original allocation/start, unchanged form/secrets/history/clocks and final 100% result. No domain-based guess or contract addition was introduced. The final admission log is `/tmp/tsa-audit-browser-admission.log`.
- Allocation race timed out because it expected the losing client to recover automatically. Current `startDemo`, `recoverConflictingAttempt` and `attempt-conflict-recover` deliberately require a separate owned read after actual CONCURRENT_ATTEMPT_EXISTS. The journey now asserts no automatic start on the losing client, invokes the read, and explicitly starts only if the read still shows CREATED. Original 201/409, one-allocation/receipt/form/manifest, immutable clocks, shared saved answers, one job/score/release and 100% assertions remain. Failing log: `/tmp/tsa-audit-browser-allocation-race.log`; completed passing log: `/tmp/tsa-audit-browser-allocation-race-after.log`.

Verification:

- `npm run test:b0`: PASS, 109 tests, zero failed/skipped; `/tmp/tsa-audit-app-sixth-pass.log`.
- `STUDENT_ACCESSIBILITY_TEST=true STUDENT_ARTIFACT_DIR=/tmp/tsa-audit-keyboard node scripts/verify-student-browser.mjs`: PASS; `/tmp/tsa-audit-keyboard-browser.log`. Keyboard operation, focus restoration, reflow and supplementary Chromium accessibility-tree checks pass. This is not screen-reader or WCAG-conformance evidence.
- `STUDENT_CLOZE_MATCHING_FIREFOX=true STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-audit-cloze-firefox node scripts/verify-student-firefox.mjs`: PASS; `/tmp/tsa-audit-cloze-firefox.log`. Real cloze/matching answers, keyboard controls, release and mixed legacy groups remain functional in Firefox.
- `UNI_DEMO_ARTIFACT_DIR=/tmp/tsa-audit-university node scripts/verify-uni-demo-browser.mjs`: PASS; `/tmp/tsa-audit-university-browser.log`. The real rehearsal launcher, 3/3 topic practice, 100-question simulation with section totals, staff flow and notices pass. Launcher shutdown returned 0; orphan list and leftover directory list are empty and port 4181 is closed. Port availability was checked before launch.
- `READING_FACTORY_ARTIFACT_DIR=/tmp/tsa-audit-reading-factory node scripts/verify-reading-factory-browser.mjs`: PASS; `/tmp/tsa-audit-reading-factory-browser.log`. Offline synthetic Factory/Bank flow, all 20 answers, reload/resume, 100% result and 20 released explanations pass without an LLM call.
- The remaining Chromium scenario matrix runs the existing `scripts/verify-student-browser.mjs` with each matching `STUDENT_<MODE>_TEST=true` flag and a distinct `STUDENT_ARTIFACT_DIR=/tmp/tsa-audit-browser-<mode>` directory. Completed passing modes: RESERVATION, RESERVATION_LATE, WARNING_RESUME, ADMISSION, ALLOCATION_RACE, NEW_ONLY, GRADE_FAILURE, READING, DOMAINS, CLOSED_SAVE, REVIEW_PRACTICE, FIXED_PRACTICE, SHORT_PRACTICE, RATE_LIMIT and RATE_LIMIT_EXPIRY. Logs use `/tmp/tsa-audit-browser-<mode>.log` with lowercase hyphenated mode names; allocation's completed rerun uses `-after.log` as recorded above. All 15 final scenario runs exited 0.

All sixth-pass handles completed, including matrix session 3545 with exit 0. Process inspection confirms no remaining audit-owned runtime. The 19 browser journeys above, the 109-test app suite, syntax checks for changed scripts and documentation/diff checks pass. No delegation, independent review, commits, paid APIs or retained data mutation occurred. The full audit remains active pending final coverage reconciliation and consolidated verification against the resulting worktree.
