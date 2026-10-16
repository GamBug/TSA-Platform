# Question reuse and student allocation policy

Status: PROPOSED implementation policy under ADR-007. Owner requirements recorded in [decisions](../decisions/OPEN_DECISIONS.md) are binding product inputs: shared reusable bank, default personalized new-question practice, no silent repetition, stable-identity history and concurrency safety. This document owns reuse semantics; [assembly](EXAM_ASSEMBLY_SPEC.md) owns selection and [database](../architecture/DATABASE_DESIGN.md) owns persistence.

## Modes and assignment boundary

Two orthogonal dimensions avoid duplicating forms:

| Form mode | Reuse mode | Behavior |
|---|---|---|
| PERSONALIZED_PRACTICE (default) | NEW_ONLY (default) | New sealed form for exactly one student's attempt; exclude every identity/equivalence group previously assigned to that student |
| PERSONALIZED_PRACTICE | REVIEW_ALLOWED | Explicitly selected and labeled review mode; may include earlier assignments but still satisfies all blueprint, rights, compatibility and within-exam conflict constraints |
| PUBLISHED_FIXED | FIXED_AS_PUBLISHED | Explicitly selected common mock form; cannot silently replace requested personalized practice; same frozen form may be used by many students and may contain familiar questions |

Assignment occurs when form + CREATED attempt + history commit together, before start, page display or answer submission. All slots count, including later sections never opened. Cancellation, expiry, invalidation, non-start or client disconnect does not undo an assignment. This conservative proposal follows “previously assigned”; tell students before creation. It can exhaust inventory faster; compensation is an explicitly selected review attempt or more content, never silent deletion of history. A failed/rolled-back assembly allocates nothing. A lost HTTP acknowledgement replays the same receipt, not another allocation.

Different users never exclude each other's assignments. Global sealed-form/start/completion counts are analytics and optional soft ranking only; no global consumption, removal or hard exposure cap is permitted in these practice modes. Retiring/quarantining content or losing rights remains a global eligibility event, unrelated to a student's use.

History records first assignment per `(userId, questionId)` for all three mode combinations. Each attempt's full assignment list is already represented by its immutable form_slots; no parallel per-answer forensic/event store. Repeated fixed/review assignments do not insert duplicate first-history rows. They still exclude that identity from subsequent NEW_ONLY practice. Existing attempts retain their mode and snapshot forever.

For this policy, **assigned** means an identity occurs in a sealed form attached to that student's committed CREATED attempt. A published fixed form alone assigns nothing to a student; each student's fixed-form attempt assigns all its slots. **Rendered** means the server delivered a slot's public content for that attempt; it does not prove the student read it. **Answered** means the server accepted and persisted an answer for the slot; a cleared answer is still an accepted save, but neither a client edit nor an unacknowledged save proves persistence. **Seen** is informal student-facing language for content that may have been encountered, not a reliable database event or the NEW_ONLY exclusion rule. Assignment is deliberately broader than rendered, answered or demonstrably seen. Start alone does not add a second reservation; it uses the existing assignment.

A new personalized attempt always creates a new form and cannot retake its old personal form. A fixed-form retake requires a new, explicit FIXED_AS_PUBLISHED attempt after the earlier attempt closes, subject to current admission and the proposed ADR-004 H1 one-active-attempt rule. A review attempt likewise requires explicit REVIEW_ALLOWED selection; an ordinary NEW_ONLY retry never turns into review. Neither retake nor review erases first-history entries or changes the mode of earlier attempts.

## Stable identities and substantially equivalent variants

A corrected version of a question retains questionId, so changing version cannot reset student history. A cosmetic rewrite, reordered choices, paraphrase or mechanically substituted numbers with the same solution path normally belongs to the same confirmed reuse-equivalence group, even if authored as a new identity. A new identity is not permission to bypass repetition rules.

Reuse the existing duplicate_groups/duplicate_group_members as canonical **reuse-equivalence groups**, one current group per question, initially a singleton. Independent human review confirms substantial equivalence using reasoning task, evidence and solution path; detector scores only flag. Confirmed EXACT/NEAR_DUPLICATE across identities must merge their reuse groups before publication. RELATED (same topic/stimulus) alone does not merge groups; ENEMY prevents co-selection within one exam but is not necessarily equivalent across attempts. Unresolved duplicate flags block publication under the existing review gate.

Group merges are atomic, audited and monotonic in MVP. Keep a retired-group → canonical-group alias and increment the bank eligibility revision; no split/unmerge/reset command in MVP. Compute a user's exclusions from all question identities in their history using **current** canonical membership. Thus a newly confirmed variant of a historically assigned question is excluded without retroactively editing the historical form. Store the membership/revision used at selection in the manifest for replay. If a later merge makes two already-issued forms equivalent, keep both immutable, record the incident and exclude the merged family going forward; no claim that previously unknown equivalence was prevented. Incorrect merges may reduce inventory; remedy requires explicit reviewed policy change, not ad hoc group splitting.

## Bundles and conflicts

For ALL_OR_NONE bundles, if any member's identity or equivalence group is excluded, the entire bundle is ineligible for NEW_ONLY. Two members in one reuse group are invalid for the same form. Distinct questions using a common passage may remain distinct groups; this policy guarantees new question identities/equivalents, not unseen passages or topic novelty. Within every mode, confirmed near-duplicate/EXACT/ENEMY conflicts and repeated question identities remain forbidden.

## Concurrency and history retention

Every creation path (personalized, review, fixed) obtains the same durable per-user allocation lock/revision before committing history. Selection may run outside the lock, but the commit rechecks against current history and bank eligibility under lock; losing requests replan with a fresh manifest or return retryable contention/shortage. Do not rely on `(userId,formId)` active-attempt uniqueness: two personalized requests have different forms. Different-user requests may independently select identical questions.

The exact protocol is in assembly/database. The history unique constraint is a final guard for first-assignment identity; current-group checking under the shared user lock prevents cross-identity equivalents. A strict allocation finding an existing history row aborts/replans; it must never use ON CONFLICT DO NOTHING to conceal reuse. Review/fixed may preserve the existing first-history row intentionally.

Propose compact history retained for the lifetime of the active account, independent of shorter answer/result retention. Removing old results must not make questions “new” again. History stores identity/time and optional first-attempt reference, no answers. Account erasure removes identifiable history according to owner-approved policy; do not retain hidden tracking across deleted/new accounts or claim cross-account no-repeat. History revision and manifest references are protected personal data; factory receives aggregate demand only. Privacy/retention approval remains ADR-006/007; do not launch a strict mode whose retention policy silently forgets allocations.

## Shortage and explicit alternatives

Unseen inventory is conditional on the current eligible bank, confirmed equivalence groups, rights, bundles and blueprint constraints. A catalog count or earlier successful attempt never guarantees that another NEW_ONLY form can be assembled: the bank can be too small, a group merge can reduce distinct stock, eligibility can change, and a competing same-student allocation can consume the remaining choices. A provable shortage returns no form, attempt or new history; a changed bank may justify a later fresh request but is not promised.

Use **inventory shortage** only as the generic concept. The API returns `INSUFFICIENT_ELIGIBLE_INVENTORY` when the authorized eligible bank cannot satisfy the request even before this student's NEW_ONLY exclusions. It returns `INSUFFICIENT_UNSEEN_INVENTORY` only when that eligible baseline can satisfy the request but excluding this student's assigned stable identities and current canonical equivalence groups makes the NEW_ONLY request provably insufficient. Include the requested blueprint version, reuse mode, section-level deficits when provable, and safe alternatives: choose an already authorized shorter blueprint; explicitly choose REVIEW_ALLOWED; wait/retry after publication. Alternatives are suggestions, not automatic creations or proof of future feasibility. Each chosen alternative is a new explicit request/idempotency key. Do not weaken quotas, split bundles or repeat questions under the original policy.

Bounded search failure without proof returns SEARCH_EXHAUSTED, not falsely asserted shortage. Concurrency conflicts use bounded replan and CONCURRENT_MODIFICATION when retries are exhausted. None triggers live AI or promises a publication date. Student diagnostics never include eligible question IDs, group IDs, private metadata or other students' history. Fixed form selection clearly warns that repeated questions are allowed; FIXED_AS_PUBLISHED is not labeled NEW_ONLY.

## Edge cases and expected outcomes

| Case | Expected outcome |
|---|---|
| Students A and B each request a form containing Q1 | Both may receive Q1 if eligible for each individually; A's assignment never consumes B's stock. |
| A requests another NEW_ONLY form after Q1 was assigned but never rendered or answered | Q1 and its currently confirmed equivalents are excluded. No start or view is required. |
| A's CREATED personal attempt is abandoned, reaches start TTL, or is cancelled after withdrawal/admission close | Keep its Q1 assignment and first-history entry; a replacement NEW_ONLY request needs different stock or returns an explicit error. |
| A's started attempt is invalidated or its form withdrawn for rights/correctness | Stop delivery under engine guards; preserve the historical assignment and immutable snapshot for permitted audit. Withdrawal does not assign the form to students who never created an attempt. |
| A explicitly enters REVIEW_ALLOWED or creates/retakes PUBLISHED_FIXED containing Q1 | Repetition is allowed and labeled; insert first-history for previously absent identities only. A later NEW_ONLY attempt excludes every identity assigned there. |
| Q1 version 2 amends Q1 version 1 | Same stable questionId remains excluded for A; the old form retains its version 1 snapshot. |
| Q2 is later confirmed equivalent to A's historical Q1 | Current canonical group makes Q2 ineligible for A's future NEW_ONLY allocations. Earlier committed forms are not rewritten and cannot be claimed free of previously unknown equivalence. |
| Two distinct-key NEW_ONLY requests for A overlap | Serialize final allocations under A's lock, revalidate the bank/group state, and commit disjoint sets or return a defined contention/shortage error. Neither request receives a partial form. |
| The authorized eligible bank cannot satisfy a section or bundle quota, even before A's exclusions | Return `INSUFFICIENT_ELIGIBLE_INVENTORY` only with proof; no automatic review/fixed fallback, quota weakening, or live generation. A search-limit hit returns `SEARCH_EXHAUSTED`. |
| A's eligible baseline is sufficient, but A's NEW_ONLY exclusions make a section or bundle quota insufficient | Return `INSUFFICIENT_UNSEEN_INVENTORY` only with proof; no automatic review/fixed fallback, quota weakening, or live generation. A search-limit hit returns `SEARCH_EXHAUSTED`. |
| A committed create response is lost, then retried with the same key | Replay the committed receipt/form/attempt; do not allocate a second form or history. A rolled-back create leaves no assignment. |

## Testable invariants and owner decisions

1. For each committed NEW_ONLY attempt, no slot's stable identity or current confirmed reuse group intersects that student's assignment history immediately before its allocation transaction; every slot becomes historical in that same commit. Check after acquiring the per-user allocation lock and shared publication guard.
2. Every student's first-history set is monotonic during ordinary operation across personal, review and fixed attempts, regardless of rendering, answers or terminal attempt state. Only an approved erasure/retention process may remove it; such removal changes the scope of any future no-repeat claim.
3. No two slots in one form repeat a stable identity or confirmed conflicting group; bundles remain whole. Two different students may receive the same eligible identity, and global usage counters do not change eligibility.
4. A rejected, rolled-back or unproven assembly commits no form, attempt, new history or success receipt. A committed create has one form/attempt/receipt outcome for its idempotency key. Concurrent same-student successful NEW_ONLY allocations are disjoint by the canonical groups known at commit time.
5. A rendered or answered count cannot substitute for assignment history. Version correction and subsequent confirmed equivalence merges cannot reset future exclusions; historical snapshots remain unchanged.

Owner approval is still required for three policy choices, not recorded here as approval: (1) ADR-007's assignment-at-CREATED strict NEW_ONLY rule, canonical equivalence adjudication/monotonic merges and explicit repeat modes; (2) ADR-006/007 account-lifetime compact history, erasure boundary and proposed 15-minute personal start TTL; (3) ADR-004 H1's one-active-fixed-attempt rule and fixed retake/admission behavior. The owner may choose alternatives only through coordinated ADR/specification changes with consumer, migration and test impact. Runtime concurrency, shortage and retention behavior remains REQUIRES_VERIFICATION; this document specifies expected outcomes, not executed proof. See A–J mapping in [test strategy](../quality/TEST_STRATEGY.md).
