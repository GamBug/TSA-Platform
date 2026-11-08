# Topic practice backend interim report

**Status: NEEDS_CONTEXT.** No application files were changed and no tests were run. The assigned workspace is `/home/wolfleo/Documents/Projects/TSA-Platform`, branch `feat/track-b-data-auth`, HEAD `a70861a`. The existing extensive dirty changes were preserved.

## Proposed API for the frontend

`GET /api/v1/topics` returns `200` with:

```json
{
  "groups": [
    {
      "id": "<taxonomy-domain-node-uuid>",
      "taxonomyVersionId": "<taxonomy-version-uuid>",
      "label": "<display label>",
      "code": "<domain code>",
      "eligibleCount": 0,
      "attemptedCount": 0,
      "accuracy": null,
      "children": []
    }
  ]
}
```

The same aggregate fields appear on every child. Selectable IDs are leaf topic nodes. `eligibleCount` is current published, rights-valid inventory in the student’s NEW_ONLY context; `attemptedCount` is the student’s distinct attempted questions in the node; `accuracy` is a percentage from graded answers or `null` when there are none. No question or answer content is returned.

`POST /api/v1/topic-practice` accepts `{ taxonomyVersionId, topicIds, questionCount, durationSeconds? }` and the existing `Idempotency-Key` header. `topicIds` must be unique leaf IDs from one taxonomy and domain; `questionCount` is an integer from 1 to 100. `durationSeconds` is optional, defaults to 60 seconds per requested question, and is bounded to 60–21,600. Success returns `201` with the existing creation receipt. Insufficient eligible stock returns `409 INSUFFICIENT_ELIGIBLE_INVENTORY` with `requestedCount` and `availableQuestionCount`.

## Findings and implementation boundary

- The student runtime has a restricted `tsa_exam` pool. Current grants expose question versions but not taxonomy nodes or question-taxonomy mappings, so a student-safe hierarchical catalog needs a narrowly scoped SQL read function.
- The current allocation guard only admits the fixed 4-question MATH, 2-question READING, and 4-question SCIENCE profiles, plus separately pinned local profiles. The current allocation module validates/commits through that existing lifecycle. Arbitrary topic-selected counts and timing therefore need an additive SQL extension and an integration hook in the existing profile/allocation code.
- Proposed SQL028 shape: add a candidate-scoped SECURITY DEFINER catalog function returning only taxonomy labels and per-student eligible/attempted/accuracy aggregates; add a private immutable topic-profile pin for taxonomy version, selected leaf IDs, count, and duration; filter candidate units by that pin and recheck the pin/current eligibility inside the existing allocation commit transaction. The JS route should pass the pinned profile through the existing allocation service so snapshotting, idempotency, ownership, attempt creation, and concurrency remain on the current lifecycle. This avoids a second allocator and keeps profile admission additive.
- The additive migration name reserved for this work is `db/migrations/028_topic_practice.sql`; SQL027 is reserved by the existing media plan. A focused disposable PostgreSQL fixture can apply the migration. The retained database was not accessed or changed, so no backup or migration was performed.
- HTTP integration belongs in `prepareStudentComponents.createHandler`: dispatch `GET /api/v1/topics` and `POST /api/v1/topic-practice` to `createTopicPracticeHandler({ examPool, identityService, trustedOrigin })`, then pass all other requests to the existing attempt handler. This allows standalone and combined student runtimes to use the same handler. The controller owns `src/local/student.mjs`, so it was not edited.
- `src/modules/assembly/allocation.mjs` and `src/modules/assembly/practice-profiles.mjs` already contain unrelated uncommitted work and were not edited. Their ownership was outside the worker’s initial reservation. The new endpoint cannot fully support the frontend’s 1–100 count range without an explicit owner for those integration hooks.

## Verification

No code changes or database changes were made. Tests were not run. Existing allocation fixtures create disposable PostgreSQL instances and provide a suitable base for the focused topic-practice tests once ownership and integration scope are assigned.

## Next assignment needed

Assign one implementer ownership of the additive migration, topic-practice module/HTTP handler/tests, and the minimal existing allocation/profile hooks; retain the controller’s ownership of frontend files and `src/local/student.mjs` route composition. The frontend can use the API shape above immediately.
