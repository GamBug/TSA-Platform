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

NEW_ONLY returns INVENTORY_SHORTAGE when the eligible unseen pool is provably insufficient. Include requested blueprint/version, reuseMode, section-level deficits when provable, and safe alternatives: choose an already authorized shorter blueprint; explicitly choose REVIEW_ALLOWED; wait/retry after publication. Alternatives are suggestions, not automatic creations or proof of future feasibility. Each chosen alternative is a new explicit request/idempotency key. Do not weaken quotas, split bundles or repeat questions under the original policy.

Bounded search failure without proof returns SEARCH_EXHAUSTED, not falsely asserted shortage. Concurrency conflicts use bounded replan and CONCURRENT_MODIFICATION when retries are exhausted. None triggers live AI or promises a publication date. Student diagnostics never include eligible question IDs, group IDs, private metadata or other students' history. Fixed form selection clearly warns that repeated questions are allowed; FIXED_AS_PUBLISHED is not labeled NEW_ONLY.

Acceptance: two sequential strict attempts are disjoint by identity and known equivalence; corrected versions remain excluded; two simultaneous strict creations serialize to disjoint allocations or one explicit failure; another user may receive identical items; cancelled assignments remain excluded; review/fixed assignments affect subsequent strict history; exhaustion never silently repeats. See A–J mapping in [test strategy](../quality/TEST_STRATEGY.md).
