# WEB-003 B10.1 — explicit synthetic fixed student practice

2026-10-26, base3d41eb3 (B9 source5b37a30 clean-reproduced). Root selects this
bounded next Track B increment under the recorded standing engineering-choice
instruction “any choice is yours! no need to ask me anymore” and product-completion
mission. AUTHORIZED_IN_SCOPE_UNDER_DELEGATION / IMPLEMENTED / AUTOMATED_PASS /
INDEPENDENTLY_REVIEWED in recorded scopes after independent design/final review. This is a
new separately recorded technical selection; B9's staff-only go-ahead is not being
extended or cited as student-delivery approval. No wholeADR007, real question rights,
qualified review/accessibility or production approval is inferred.

Recommended accountable implementer: current Codex root or available Sol6.1/High
for transaction/identity/catalog integration, native Luna/XHigh for bounded SDK/UI
and tests after disjoint reservations; separate Sol6.1/Medium read-only design and
final runtime review. Existing entitlements only, no paid API/Astra or student AI.
Actual read-only explorer mapped the source dependencies; discovery ran no tests
and changed no files. Root owns this decision/shared records. [Executed implementation/review/limits](../reviews/WEB_003_B10_FIXED_STUDENT_VERIFICATION.md).

## Scope and frozen compatibility

Use ONLY existing GET /api/v1/catalog and POST /api/v1/attempts contracts. Fixed
catalog entries already contain mode PUBLISHED_FIXED, formId, repeatsAllowed:true
and name/domain/count/duration/profileKind/availability. Creation already requires
`{mode:"PUBLISHED_FIXED",formId,reuseMode:"FIXED_AS_PUBLISHED",acknowledgeRepeats:true}`.
Receipts/views/results/review/history already model both modes. No new public
field/route/error/version, root export, solver algorithm, golden or score/timer rule.
StudentShortage is restricted to personal reuse modes: never add a fixed alternative
there or disguise fixed as personal review. Separate explicit fixed catalog cards.

Only actual supported B9 seals participate in NEW catalog/creation; legacy/manual
fixed placeholders, personal IDs and B7/B8 reference/diagnostic rows stay excluded.
Do not create a new form/run/slot/key, select questions or call an AI provider when
a student chooses a fixed form. Each student receives a new OWNED attempt on the
same immutable owner-null form. Original sealed versions/keys stay fixed across
later Bank corrections; current rights/quarantine/withdrawal remain enforceable.
No staff question rights/review/publication, scheduling or withdrawal UI is added.

Shared fixed catalog/creation capability defaultsfalse. Initially enable only an
explicit disposable synthetic student demonstration, provisioning real B9 seals
automatically through the trusted sealing service over original eligible fixtures.
No manual SQL/API setup, real-content import or paid service. Existing default
personal fixture/tests remain supported. Retained/production enablement is excluded.
Feature disablement stops NEW advertising/creation, retains owned fixed delivery,
read/start/save/submit/grade/released review/history and matching receipt replay.

B9 receipts remain immutable and retain studentDeliverySupported:false. That literal
describes the staff seal operation's scope, not a fresh live assessment of a separate
student runtime. Its UI copy must make that historical/operation distinction clear;
never rewrite a B9 receipt or change its frozen schema to report current delivery.
Current student access is decided through the separate authoritative student path.

## Catalog, eligibility and cursor compatibility

Current017 catalog SQL/parser/SDK accept personal offerings only. Add a narrow
current-CANDIDATE security-definer fixed catalog projection to tsa_exam; no raw
sidecar/forms/keys or staff metadata-function grant. Emit only frozen safe entry
fields for supported B9 forms in current admission with no effective holds/current
rights restriction. A catalog observation does not guarantee a later assignment.
Never filter or extend exam time using client Date.now().

Keep old personal SQL/default output and v1 afterBlueprintId cursors valid. With
fixed capability enabled, paginate deterministically in two phases: existing
personal blueprint order, then fixed formId order, filling the bounded page across
the phase boundary. Use a strict internally versioned opaque v2 catalog cursor
for the fixed phase; no public cursor-schema change. Exact v2 payload/key order is
`{v:2,kind:"catalog",phase:"fixed",afterFormId:UUID|null}`. Null means no fixed
form has yet been consumed: when the last personal item exactly fills a page and
fixed rows remain, issue this sentinel rather than skipping the first fixed row.
After fixed rows use their final formId; exhausted eligible set returns nextCursor:null.
Flag-off rejects v2 with existing422 VALIDATION_ERROR. Stable eligible sets must
page without omissions/duplicates; live eligibility changes remain authoritative. Decode v1 as before, allow
v2 only under enabled capability, reject unknown fields/noncanonical/oversized
cursors. Preserve the existing history cursor. Multiple fixed seals for one
blueprint must not skip/duplicate entries. Tests include limits1/small pages,
transition, legacy cursor and multiple forms per blueprint. Fixed titles distinguish
supported forms using safe metadata; no source/question/actor IDs or staff receipts.

## Atomic owned fixed assignment

Add a separate forward-only narrow commit function for the existing tsa_exam role;
do not loosen personal commit/manifests, snapshot functions or raw grants. Use the
existing candidate identity, per-user lock/allocation state, receipt/H1 preflight,
shared publication/bank guard and ordinary create-rate budget. Matching actor/key/
body replay precedes new H1/admission work, including after closure or feature-off;
changed body409. Disabled/foreign users gain no receipt/access. Different-key while
any supported active domain/mode exists returns owner-safe409 existingAttemptId.

For a new fixed request, verify supported B9 seal/form and exact modes, current
stored availability/withdrawal and effective form/slot/source restrictions under
the established lock order. Unknown/personal/unsupported IDs404; current rights or
withdrawal restrictions410 FORM_UNAVAILABLE; before admission409 FORM_NOT_OPEN,
at/after admission close410 FORM_UNAVAILABLE, preserving existing engine semantics.
Recheck database time after lock waits. Do not require the sealed question to remain
the CURRENT eligible version; fixed snapshots intentionally retain their original
reviewed versions. Admission rechecks current display rights at authoritative database time. Actual
Start retains the existing rights-through-actual-deadline check; no new requirement
to cover the entire possible reservation delay is introduced. B9's capture horizon
is historical evidence, not a replacement for these current checks. Never extend
rights or modify sealed clocks.

Atomic commit writes only the owned CREATED attempt, missing stable question-history
rows, allocation revision, creation receipt and minimal audit. Assign every sealed
slot identity before Start. Repeats preserve first_attempt_id/first-history bytes;
new identities enter history, so subsequent NEW_ONLY uses those stable IDs/current
canonical groups. Fixed assignment does not apply NEW_ONLY exclusion or erase history.
No new form/assembly run/private snapshot/job/score is created by assignment.

Use existing prepare_attempt_insert trigger: both modes commit
start_before=min(DB created_at+600seconds, admission_until_at_creation); personal
admission additionally intersects its offering, fixed admission uses its form window.
First Start remains strictly before that immutable instant and uses the same domain
duration. Ordinary later schedule edits do not rewrite the committed Start deadline;
current withdrawal/rights restrictions remain effective. No timer combines domains.
Explicit retakes need fresh consent/key after terminal state and current admission.
Existing mode-neutral lifecycle/grading/released access remains authoritative.

## Student experience

Show distinct common fixed-form choices with domain/count/duration and possible
repetition/unofficial-practice disclosure. Native fresh checkbox consent is initially
unchecked, bound to exact formId and original authenticated session nonce/generation.
Prepare the local immutable intent when opening the dialog, without sending it;
confirmation can POST only after fresh checkbox consent. Cancel discards that intent.
Cancel/Escape0POST; confirmation creates one immutable body/key. Loss stays uncertain,
explicit retry keeps that same intent; receipt matching mode/form/domain precedes
GET. A failed read offers GET-only recovery. No auto fallback or automatic new POST
on reload, logout, target change or failed acknowledgement. Reserve first, Start
explicitly with current server-provided deadline, then answer/save/reload/resume/
submit/grade/result/released review/history through existing services.

Persist fixed/repeat labels through reserved/active/resume/result/review/history.
A previously personal attempt never changes mode. Fresh account/target/attempt
responses are fenced; old consent is never transferred to another session. Multi-
tab revision/conflict/offline rules stay truthful. Keys/explanations stay private
until that OWNED attempt's authorized release, regardless of another student's score.
No active attempt is silently abandoned to start a fixed domain.

## Required acceptance and migration/rollback

- Actual PG/HTTP catalog and creation for supported seals; strict consent/type/key,
  role/CSRF/Origin/BOLA/unsupported personal or legacy IDs, current admission edges,
  immutable Start clocks, withdrawn/rights/quarantine effects and safe errors.
- Same form across two students: distinct owned attempts/history, shared immutable
  slots; no cross-account answers/results/release leakage. Explicit retake preserves
  first-history, later NEW_ONLY excludes assigned identities and merged groups.
- Real two-connection fixed vs personal NEW_ONLY/REVIEW_ALLOWED H1 winner orders,
  same-key replay, rollback/no partial graph, current restriction/admission races.
- Current original sealed version after corrected Bank publication; current rights
  still enforced. No new form/run/secret or inference call per student request.
- New SQL-only migration preserves old data/grants/functions except explicitly
  scoped additions, old personal manifests/vectors/default catalog/cursors. Existing
  created fixed delivery must not depend on new creation flag remaining enabled.
- Real Chromium/Firefox consent/cancel/focus, lost committed ACK/exact retry, GET-only
  read recovery, reload/save/submit/grade/released review/history, desktop/mobile and
  current session fences. Existing three-domain/review/staff B9 checks stay valid.
- Automatic disposable fixture setup, clean no-hardlink locked install/build/targeted
  tests/browser/guide/teardown proof; independent final source/runtime review.

Rollback disables new fixed catalog/creation while retaining compatible stored
receipt/attempt readers and lifecycle. Never drop forms, history, keys or releases.
No production rollout. Manual qualified accessibility and accepted lawful12/6/12
inventory remain external human requirements. This document records selected scope;
B10 runtime tests are NOT_EXECUTED at implementation start. Independent design
review repaired before-open/after-close error mapping and removed an unneeded
reservation-wide rights prerequisite; exact cursor boundary semantics are specified
above. [Review evidence](../reviews/WEB_003_B10_DESIGN_REVIEW.md). If source
requires a public contract or material policy change, stop that dependent part and
record the new decision instead of silently changing frozen artifacts.
