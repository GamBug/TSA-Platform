import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AttemptViewSchema,
  BlueprintConfigSchema,
  CreationReceiptSchema,
  MvpBlueprintConfigSchema,
  StudentSlotSchema,
} from "../src/index.ts";

const ids = {
  taxonomy: "11111111-1111-4111-8111-111111111111",
  skill: "22222222-2222-4222-8222-222222222222",
  excluded: "33333333-3333-4333-8333-333333333333",
  attempt: "44444444-4444-4444-8444-444444444444",
  form: "55555555-5555-4555-8555-555555555555",
  slot: "66666666-6666-4666-8666-666666666666",
  stimulus: "77777777-7777-4777-8777-777777777777",
};

function blueprint() {
  return {
    schemaVersion: "blueprint/1" as const,
    name: "Synthetic math practice",
    taxonomyVersionId: ids.taxonomy,
    profileKind: "INDEPENDENT_PRACTICE" as const,
    evidenceIds: [],
    sections: [{ id: "math-entry", section: "MATH" as const, count: 4, durationSeconds: 360 }],
    allowedTypes: ["SINGLE_CHOICE" as const],
    quotas: [{ sectionId: "math-entry", min: 1, max: 4, dimension: "SKILL" as const, value: ids.skill }],
    maxPerSource: null,
    excludedQuestionIds: [ids.excluded],
    bundlePolicy: "ALL_OR_NONE" as const,
    scoringPolicy: "practice-binary-v1" as const,
    releasePolicy: "after-grade-v1" as const,
  };
}

function slot() {
  return {
    slotId: ids.slot,
    sectionId: "math-entry",
    ordinal: 1,
    content: [{ type: "text" as const, text: "Which number is three?" }],
    stimulus: { id: ids.stimulus, content: [{ type: "text" as const, text: "Synthetic stimulus" }] },
    interaction: {
      type: "SINGLE_CHOICE" as const,
      options: [
        { id: "a", content: [{ type: "text" as const, text: "2" }] },
        { id: "b", content: [{ type: "text" as const, text: "3" }] },
      ],
    },
  };
}

function attemptView(state: "CREATED" | "IN_PROGRESS" | "SUBMITTED" = "CREATED") {
  const inProgress = state === "IN_PROGRESS";
  return {
    attemptId: ids.attempt,
    state,
    formId: ids.form,
    domain: "MATH" as const,
    formMode: "PERSONALIZED_PRACTICE" as const,
    reuseMode: "NEW_ONLY" as const,
    reusePolicyVersion: "reuse/1" as const,
    serverNow: "2026-10-17T10:00:00Z",
    startBefore: state === "CREATED" ? "2026-10-17T10:10:00Z" : null,
    startedAt: inProgress ? "2026-10-17T10:01:00Z" : null,
    deadlineAt: inProgress ? "2026-10-17T10:07:00Z" : null,
    activeSectionId: inProgress ? "math-entry" : null,
    sections: [{ sectionId: "math-entry", section: "MATH" as const, startsAt: inProgress ? "2026-10-17T10:01:00Z" : null, endsAt: inProgress ? "2026-10-17T10:07:00Z" : null, count: 1 }],
    slots: inProgress ? [slot()] : [],
    answers: inProgress ? [{ slotId: ids.slot, value: { type: "SINGLE_CHOICE" as const, optionId: "b" }, revision: 1, savedAt: "2026-10-17T10:02:00Z" }] : [],
    closure: { attemptId: ids.attempt, state, terminalReason: null, cancellationReason: null, closedAt: null, gradingStatus: null },
  };
}

describe("blueprint and student attempt contracts", () => {
  it("accepts a generic blueprint and keeps its local section entry ID distinct from its domain", () => {
    const valid = blueprint();
    assert.equal(BlueprintConfigSchema.safeParse(valid).success, true);
    assert.equal(MvpBlueprintConfigSchema.safeParse(valid).success, true);

    const futureMultiSection = { ...valid, sections: [...valid.sections, { id: "reading-entry", section: "READING" as const, count: 2, durationSeconds: 180 }] };
    assert.equal(BlueprintConfigSchema.safeParse(futureMultiSection).success, true);
    assert.equal(MvpBlueprintConfigSchema.safeParse(futureMultiSection).success, false);
  });

  it("enforces approved one-domain MVP counts and blueprint quota references", () => {
    assert.equal(MvpBlueprintConfigSchema.safeParse({ ...blueprint(), sections: [{ id: "reading-entry", section: "READING", count: 2, durationSeconds: 180 }], quotas: [] }).success, true);
    assert.equal(MvpBlueprintConfigSchema.safeParse({ ...blueprint(), sections: [{ id: "science-entry", section: "SCIENCE", count: 4, durationSeconds: 360 }], quotas: [] }).success, true);
    assert.equal(MvpBlueprintConfigSchema.safeParse({ ...blueprint(), sections: [{ id: "math-entry", section: "MATH", count: 2, durationSeconds: 360 }] }).success, false);
    assert.equal(BlueprintConfigSchema.safeParse({ ...blueprint(), sections: [{ id: "MATH", section: "WRITING", count: 4, durationSeconds: 360 }] }).success, false);
    assert.equal(BlueprintConfigSchema.safeParse({ ...blueprint(), quotas: [{ ...blueprint().quotas[0]!, sectionId: "MATH" }] }).success, false);
    assert.equal(BlueprintConfigSchema.safeParse({ ...blueprint(), quotas: [{ ...blueprint().quotas[0]!, max: 5 }] }).success, false);
  });

  it("accepts only a complete persisted creation receipt", () => {
    const receipt = {
      attemptId: ids.attempt,
      formId: ids.form,
      state: "CREATED" as const,
      domain: "MATH" as const,
      formMode: "PERSONALIZED_PRACTICE" as const,
      reuseMode: "NEW_ONLY" as const,
      reusePolicyVersion: "reuse/1" as const,
      startBefore: "2026-10-17T10:10:00Z",
    };
    assert.equal(CreationReceiptSchema.safeParse(receipt).success, true);
    assert.equal(CreationReceiptSchema.safeParse({ ...receipt, state: "IN_PROGRESS" }).success, false);
    assert.equal(CreationReceiptSchema.safeParse({ ...receipt, startBefore: "not-a-timestamp" }).success, false);
    assert.equal(CreationReceiptSchema.safeParse({ ...receipt, reuseMode: "FIXED_AS_PUBLISHED" }).success, false);
  });

  it("requires a CREATED start deadline and clears it after creation", () => {
    assert.equal(AttemptViewSchema.safeParse(attemptView("CREATED")).success, true);
    assert.equal(AttemptViewSchema.safeParse(attemptView("IN_PROGRESS")).success, true);
    assert.equal(AttemptViewSchema.safeParse({ ...attemptView("CREATED"), startBefore: null }).success, false);
    assert.equal(AttemptViewSchema.safeParse({ ...attemptView("IN_PROGRESS"), startBefore: "2026-10-17T10:10:00Z" }).success, false);
    assert.equal(AttemptViewSchema.safeParse({ ...attemptView("IN_PROGRESS"), serverNow: "tomorrow" }).success, false);
    assert.equal(AttemptViewSchema.safeParse({ ...attemptView("IN_PROGRESS"), state: "NOT_A_STATE" }).success, false);
  });

  it("accepts student-safe slot data and rejects answer keys or authoring fields", () => {
    assert.equal(StudentSlotSchema.safeParse(slot()).success, true);
    assert.equal(StudentSlotSchema.safeParse({ ...slot(), answerKey: { type: "SINGLE_CHOICE", optionId: "b" } }).success, false);
    assert.equal(StudentSlotSchema.safeParse({ ...slot(), privateExplanation: [{ type: "text", text: "secret" }] }).success, false);
    assert.equal(StudentSlotSchema.safeParse({ ...slot(), questionVersionId: ids.form }).success, false);
  });
});
