# Exam engine specification

Status: PROPOSED, ADR-004, except owner-approved H1 global active-attempt limit. These are independent practice policies, not assertions about official TSA navigation, timing or scoring. [API](../architecture/API_CONTRACTS.md) and [database](../architecture/DATABASE_DESIGN.md) must implement these semantics.

## Immutable form and attempt lifecycle

Form content is SEALED, with immutable slots, public content, private keys/explanations, referenced asset hashes, blueprint, section durations and policy versions. Mutable availability/withdrawal metadata is separate. Attempts always point to the sealed form, never live bank content.

| State | Entry / allowed transitions |
|---|---|
| CREATED | Personal assembly or fixed-form assignment atomically records stable-identity history; no clock until start. May become IN_PROGRESS or CANCELLED. |
| IN_PROGRESS | First successful start sets start/deadlines once. May become SUBMITTED, EXPIRED or INVALIDATED. |
| SUBMITTED | Explicit submit before overall deadline; responses frozen. May become GRADED or INVALIDATED. |
| EXPIRED | Overall deadline reached; responses frozen with effective close time at deadline. May become GRADED or INVALIDATED. |
| GRADED | Successful immutable score run and release decision. Terminal except INVALIDATED incident annotation. |
| CANCELLED | Never-started attempt cancelled due to unavailable form or elapsed committed start deadline; terminal. |
| INVALIDATED | Content/rights/security incident blocks delivery/results; terminal. Retain audit and frozen history, do not rewrite score. |

Store terminalReason EXPLICIT_SUBMIT or DEADLINE independently so GRADED preserves how the attempt closed. A failed grading job leaves the attempt SUBMITTED/EXPIRED, with gradingStatus FAILED_RETRYABLE or FAILED_FINAL visible to staff; no invented score. Durable worker retries with bounded backoff and operator retry using the same frozen input. Grading is idempotent by `(attemptId, policyVersion, inputHash)`.

## Timing and section navigation

Start takes the shared bank publication guard, then locks the attempt row, verifies form is available/not withdrawn and computes fixed section windows from database time: section 1 begins at startedAt; each next begins at previous end; overall deadline is their sum. No pause or early section advancement in MVP. Navigation is free within the active section; previous sections are locked, future sections are not delivered. Students may submit the entire exam early with confirmation; unvisited slots count unanswered. These choices keep section timing deterministic and need owner approval.

The server determines active section from windows on every read/write. At exactly a section deadline its writes are rejected; at exactly overall deadline an open attempt becomes EXPIRED. Check `clock_timestamp()` after obtaining the attempt lock, not transaction start time or client timestamp. Time spent offline or waiting for the server still counts. There is no hidden network grace period. Scheduled expiry is an optimization: any access also enforces expiry, and a worker sweep closes abandoned attempts. UTC timestamps and serverNow permit display countdown estimation only.

If the service is unavailable near deadline, already acknowledged answers remain authoritative; late unacknowledged writes are not backdated. Staff may invalidate and offer a fresh attempt with a recorded incident, not edit an elapsed deadline or rewrite old answers. Monitor clock health before timed use.

## Autosave, resume and concurrency

Every answer save supplies slotId, typed value, expectedRevision and a unique Idempotency-Key. The server checks attempt ownership, slot belongs to its form, active section, payload validity and expectedRevision in one locked transaction. An untouched slot has revision 0; accepted writes increment by one, including clearing. A stale revision returns 409 with current safe answer/revision. Never silently apply last-write-wins across tabs.

Client proposes debounce around 500 ms and immediate flush on navigation/submit; only one pending write per slot, later edits queue locally until acknowledgement. This is UX tuning, not timing authority. Display saving/saved/error with server revision. Network retry repeats the same body/key; a changed answer uses a new key and latest acknowledged revision. Resume fetches persisted answers and server time; in-memory unsaved answers are reconciled explicitly, not silently overwritten. MVP makes no promise of browser-crash recovery for unacknowledged edits and does not store sensitive answers indefinitely in browser storage.

Submit must wait for pending save acknowledgements. If a save fails, show the problem and allow the student explicitly to submit persisted answers. Submission body carries no answer payload, avoiding a second conflicting save path. Save/submit/expiry all lock the same attempt row: exactly one order wins. A save that loses to closure returns ATTEMPT_CLOSED. Lost HTTP acknowledgements can be recovered via idempotent retry.

Idempotency replay returns the original successful outcome after ownership checking even if the attempt has since closed; it performs no new write. Changed payload under the same key is 409. A fresh submit on an already terminal attempt returns the existing closure outcome; it never creates another score job. Database unavailable means no success acknowledgement.

## Scoring and release

`practice-binary-v1`: each slot earns integer 1 if exactly correct, otherwise 0; no penalty/partial credit. SINGLE_CHOICE matches option ID; MULTIPLE_CHOICE compares sets independent of order; TRUE_FALSE_GROUP requires every statement correct. Missing/cleared/partial responses score 0. Invalid IDs are rejected at save time; corrupt stored input fails grading and raises an incident rather than silently scoring. `correctCount` and `totalCount` are authoritative; `percentage` is a decimal string rounded half-up to two decimal places from `100 × correctCount / totalCount`. Section counts are also returned. No IRT, M-level weighting or official-score label.

Release policy `after-grade-v1` permits the owner to see results/keys/explanations only after the entire attempt is GRADED and not INVALIDATED. Never release at an intermediate section boundary. Result totals and explanations come from the frozen form and score run, not current bank versions. This is a public-practice product: students can share learned answers; it does not promise a secure exam bank or prevent learning answers from a previous attempt. Normal personalized practice enforces MVP no-repeat by stable identity and confirmed equivalence. Repeats require explicit REVIEW_ALLOWED or FIXED_AS_PUBLISHED selection; see [reuse policy](QUESTION_REUSE_POLICY.md). Cross-student reuse is permitted.

Historical recalculation, if later needed, creates an additional score run with reason and supersedes pointer after authorized review; never mutates the previous published score. MVP incident response invalidates affected results and offers retry; bulk regrading is POST_MVP.

## Withdrawal and recovery

Retiring a version prevents future selection but does not invalidate already sealed practice forms by itself. Quarantine for correctness/rights/security, or revocation of a referenced source, blocks new starts and triggers form withdrawal plus invalidation of affected active and released attempts. The authoritative access guard checks dependency holds immediately, so asynchronous fan-out cannot leave a disclosure window. Retain snapshots for audit subject to approved legal retention; do not return restricted content to students. Already disclosed answers cannot be recalled.

Source licenses must cover the planned delivery window; start checks rights again. Partial section failure never grants extra time silently. Crash after submission commit is recovered by the durable job; crash before commit leaves attempt resumable until expiry. Score write and GRADED transition are atomic. Audit start, closure, invalidation and release decisions without logging answer contents.

Verification requirements: [test strategy](../quality/TEST_STRATEGY.md), especially state-machine sequences, two-tab conflicts, exact boundary races, lost acknowledgement, worker crash and private-payload inspections.

## Reconciled admission and recovery contract

ADR-004 H1 is APPROVED BY HUMAN OWNER; H2 remains open. Each student has at most one CREATED or IN_PROGRESS attempt globally across PERSONALIZED_PRACTICE and PUBLISHED_FIXED, regardless of form or reuse mode. Same-key creation retries replay the original receipt; a different request while a valid active attempt exists returns 409 CONCURRENT_ATTEMPT_EXISTS with its ID only to its owner. The student may GET/resume that attempt when its state permits. A new attempt is allowed once the prior attempt leaves CREATED/IN_PROGRESS for SUBMITTED/EXPIRED/GRADED/CANCELLED/INVALIDATED, subject to current availability/holds; SUBMITTED/EXPIRED are closed to answers even while grading is pending. This is a usability/resource policy: prior results and other users may already expose practice answers. Personal creation seals a new form; fixed-form assignments reuse the existing form. Global sealed-form and assignment counts are separate analytics, never inventory consumption.

Before deciding an active-attempt conflict for a new creation request, take the per-user allocation lock and shared publication guard, then lock any existing active attempt. Lazily expire an elapsed IN_PROGRESS attempt through the existing closure and grading-job path, or cancel a CREATED attempt if its committed `startBefore` has elapsed or an applicable withdrawal/rights/admission guard makes it unusable. An elapsed personal start TTL uses cancellationReason START_TTL_EXPIRED; cancellation keeps assignment history and the immutable form. Commit stale-attempt finalization even if subsequent allocation fails, then recheck for a valid active attempt. The global partial database unique index is the final arbiter if distinct-key requests race. A conflict never cancels a valid active attempt, and no public student-cancel endpoint is added. This H1 gate does not replace per-user allocation locking or historical NEW_ONLY exclusions after closure.

Proposed H2: availability is an **admission window**, not a completion deadline. Both create and first start require database time `availableFrom <= now < availableUntil`, non-null finite bounds, no withdrawal/rights hold. Before opening return 409 FORM_NOT_OPEN; at/after close reject creation with 410 FORM_UNAVAILABLE. An admitted start may run beyond availableUntil until its frozen attempt deadline; no shortening or auto-invalidation merely because admission closes. Existing result-release policy still governs later access. Rights at sealing must cover availableUntil plus maximum duration, and start rechecks coverage through the computed deadline. Actual rights expiry/revocation still blocks later content/results through the existing rights guard. Catalog displays the admission interval. Repeated start receipts are not new admissions and cannot reset deadlines.

CREATED cancellation is system-owned, audited and idempotent. GET/start lazily checks the effective hold, committed `startBefore` and proposed H2 admission end; if withdrawn, rights-blocked, past `startBefore`, or (if H2 is approved) `now >= availableUntil`, lock attempt, set CANCELLED, cancellationReason FORM_WITHDRAWN/RIGHTS_BLOCKED/START_TTL_EXPIRED/ADMISSION_CLOSED as applicable, closedAt=database time; keep startedAt/deadlineAt null. GET returns 200 safe state/reason with no content; start commits cancellation then returns 410 FORM_UNAVAILABLE (do not roll back the transition by throwing inside the transaction). Before opening is a temporary wait, not cancellation. The same existing worker sweep processes stale CREATED attempts in bounded batches (proposed every 60 seconds); worker outage never bypasses lazy guards. A moved availability window never revives CANCELLED. Lists reconcile unusable CREATED entries before returning their state. Rights/withdrawal fan-out cancels CREATED and invalidates already-started affected attempts; CANCELLED stays terminal.

First-start guards and withdrawal/availability mutation use a shared lock on the relevant form_availability row for admission versus exclusive mutation; dependency rights reads must be consistent with the existing publication guard. The shared bank guard is taken before the attempt lock, then this form row lock; withdrawal commits its hold first and only then fans out attempt transitions, never holds the form row while acquiring attempt locks. This avoids inverse lock order. Starts admitted before a subsequent hold are handled by invalidation/access guards, not by rewriting startedAt.

## Save retention, arithmetic and student feedback

`answers` stores the latest acknowledged value and revision per attempt/slot, frozen after closure. Revision is an optimistic concurrency counter, not a revision history table. Partial idempotency receipts and database recovery backups are not a supported forensic timeline. Full answer-edit history/cheating analysis is excluded from MVP; any future collection needs explicit scope, retention and privacy review. Keep answer contents out of audit logs.

Compute percentage with exact integers: `n=10000*correctCount`, `q=floor(n/totalCount)`, `r=n mod totalCount`; hundredths=q+1 if `2*r >= totalCount`, otherwise q. Format hundredths/100 with exactly two decimal digits without binary floating-point rounding. Example 1/3 → "33.33", 1/32 → "3.13", all correct → "100.00".

Client shows current-section remaining time plus overall time, a one-time accessible warning at <=60 seconds remaining (also on resume inside that interval), and explicit locked/active/future section labels. At transition re-fetch server state and acknowledge any rejected save; do not conceal unsaved edits or promise extra time. Display absolute times in `Asia/Ho_Chi_Minh`, labeled ICT (UTC+7); countdown uses serverNow/deadline deltas, not local wall-clock/timezone. Explain offline time and no-grace policy before start. Save throttling and retry follow the [API contract](../architecture/API_CONTRACTS.md); 429 must not discard pending edits or mark them saved.

## Personalized ownership and assignment

PERSONALIZED_PRACTICE is the default: one owner, one sealed form, one attempt. No reselection occurs on start/resume. Creation follows the atomic history/availability transaction in [assembly](EXAM_ASSEMBLY_SPEC.md); every slot counts as assigned even if never viewed. Corrected versions retain the stable identity exclusion. CANCELLED, EXPIRED and INVALIDATED do not release assignments. A replacement normal attempt must use unseen inventory or report shortage; an explicit review alternative is a separate choice.

Personal admission uses the versioned blueprint offering and proposed 15-minute start TTL, bounded by offering close. Expiry cancels without deleting history. Fixed forms retain their publication admission window. Both modes preserve frozen scoring, timing and rights checks; publication of another approved question never changes an active snapshot. Personal manifests/history are owner-sensitive metadata, not staff-wide public diagnostics.
