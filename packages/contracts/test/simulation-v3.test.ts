import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BlueprintConfigV3Schema } from "../src/blueprint-v3.ts";
import { AuthorizedReleasedReviewV3Schema, SimulationResultViewV3Schema } from "../src/released-review-v3.ts";
import { releasedReviewRouteRegistryV3, studentRouteRegistryV3 } from "../src/routes-v3.ts";
import { FULL_SIMULATION_SECTIONS, FullSimulationCatalogPageV3Schema } from "../src/simulation.ts";
import {
  SimulationAttemptViewV3Schema,
  SimulationCreationReceiptV3Schema,
} from "../src/student-v3.ts";

const attemptId = "44444444-4444-4444-8444-444444444444";
const formId = "55555555-5555-4555-8555-555555555555";
const scoreRunId = "88888888-8888-4888-8888-888888888888";
const at = "2026-11-08T10:00:00Z";

function blueprint() {
  return {
    schemaVersion: "blueprint/3",
    name: "Synthetic full simulation",
    taxonomyVersionId: "11111111-1111-4111-8111-111111111111",
    profileKind: "FULL_SIMULATION",
    evidenceIds: [],
    sections: FULL_SIMULATION_SECTIONS.map((section) => ({ ...section })),
    allowedTypes: ["SINGLE_CHOICE"],
    quotas: [],
    maxPerSource: null,
    excludedQuestionIds: [],
    bundlePolicy: "ALL_OR_NONE",
    scoringPolicy: "practice-binary-v1",
    releasePolicy: "after-grade-v1",
  };
}

function slot(sectionId: string, ordinal: number) {
  const slotId = `66666666-6666-4666-8666-${String(ordinal).padStart(12, "0")}`;
  return {
    slotId,
    sectionId,
    ordinal,
    stimulus: null,
    content: [{ type: "text" as const, text: `Synthetic question ${ordinal}` }],
    interaction: {
      type: "SINGLE_CHOICE" as const,
      options: [
        { id: "a", content: [{ type: "text" as const, text: "A" }] },
        { id: "b", content: [{ type: "text" as const, text: "B" }] },
      ],
    },
  };
}

function sectionClocks(opened: readonly string[] = [], activeSectionId: string | null = null) {
  return FULL_SIMULATION_SECTIONS.map((section) => {
    const hasOpened = opened.includes(section.id);
    const isOpen = activeSectionId === section.id;
    return {
      sectionId: section.id,
      section: section.section,
      budgetSeconds: section.durationSeconds,
      remainingSeconds: section.durationSeconds - (isOpen ? 1 : 0),
      count: section.count,
      firstOpenedAt: hasOpened ? at : null,
      openedAt: isOpen ? at : null,
      isOpen,
      isLocked: false,
    };
  });
}

function attemptView({ opened = [], activeSectionId = null, state = "IN_PROGRESS" }: {opened?: string[]; activeSectionId?: string | null; state?: "CREATED" | "IN_PROGRESS" | "SUBMITTED"} = {}) {
  const sections = sectionClocks(opened, activeSectionId);
  const slots = state === "IN_PROGRESS"
    ? sections.flatMap((section) => section.firstOpenedAt === null
      ? []
      : Array.from({ length: section.count }, (_, index) => slot(section.sectionId, index + 1 + sections.slice(0, sections.indexOf(section)).reduce((n, prior) => n + prior.count, 0))))
    : [];
  return {
    attemptId,
    state,
    formId,
    formMode: "PERSONALIZED_PRACTICE",
    reuseMode: "NEW_ONLY",
    reusePolicyVersion: "reuse/1",
    serverNow: at,
    startBefore: state === "CREATED" ? "2026-11-08T10:10:00Z" : null,
    startedAt: state === "CREATED" ? null : at,
    activeSectionId,
    sections,
    slots,
    answers: slots.length > 0 ? [{ slotId: slots[0]!.slotId, value: { type: "SINGLE_CHOICE", optionId: "a" }, revision: 1, savedAt: at }] : [],
    closure: { attemptId, state, terminalReason: null, cancellationReason: null, closedAt: null, gradingStatus: null },
  };
}

function result() {
  const sections = FULL_SIMULATION_SECTIONS.map((section, index) => ({
    sectionId: section.id,
    section: section.section,
    correctCount: index === 0 ? 1 : 0,
    totalCount: section.count,
  }));
  return {
    attemptId,
    scoreRunId,
    formMode: "PERSONALIZED_PRACTICE",
    reuseMode: "NEW_ONLY",
    policyVersion: "practice-binary-v1",
    scoreLabel: "UNOFFICIAL_PRACTICE",
    correctCount: 1,
    totalCount: 100,
    percentage: "1.00",
    sections,
    releasedAt: at,
  };
}

describe("full simulation v3 contracts", () => {
  it("accepts only the fixed three-section 100-question blueprint", () => {
    assert.equal(BlueprintConfigV3Schema.safeParse(blueprint()).success, true);
    assert.equal(BlueprintConfigV3Schema.safeParse({ ...blueprint(), sections: [...blueprint().sections].reverse() }).success, false);
    assert.equal(BlueprintConfigV3Schema.safeParse({ ...blueprint(), sections: blueprint().sections.map((section, index) => index === 1 ? { ...section, count: 21 } : section) }).success, false);
    assert.equal(BlueprintConfigV3Schema.safeParse({ ...blueprint(), scoringPolicy: "practice-binary-v2" }).success, false);
    assert.equal(BlueprintConfigV3Schema.safeParse({ ...blueprint(), extra: true }).success, false);
  });

  it("keeps content hidden until a section is first opened and permits a paused clock", () => {
    const active = attemptView({ opened: ["math"], activeSectionId: "math" });
    assert.equal(SimulationAttemptViewV3Schema.safeParse(active).success, true);

    const paused = attemptView({ opened: ["math"] });
    assert.equal(SimulationAttemptViewV3Schema.safeParse(paused).success, true);

    const leaked = { ...active, slots: [...active.slots, slot("reading", 41)] };
    assert.equal(SimulationAttemptViewV3Schema.safeParse(leaked).success, false);
    assert.equal(SimulationAttemptViewV3Schema.safeParse({ ...active, sections: active.sections.map((section, index) => index < 2 ? { ...section, isOpen: true, openedAt: at } : section) }).success, false);
    const unstarted = attemptView({ state: "CREATED" });
    assert.equal(SimulationAttemptViewV3Schema.safeParse(unstarted).success, true);
    const cancelledBeforeStart = { ...unstarted, state: "CANCELLED", startBefore: null, closure: { ...unstarted.closure, state: "CANCELLED" } };
    assert.equal(SimulationAttemptViewV3Schema.safeParse(cancelledBeforeStart).success, true);
  });

  it("requires closed sections to be read-only and terminal views to omit content", () => {
    const locked = attemptView({ opened: ["math"] });
    locked.sections[0] = { ...locked.sections[0]!, remainingSeconds: 0, isLocked: true };
    assert.equal(SimulationAttemptViewV3Schema.safeParse(locked).success, true);
    assert.equal(SimulationAttemptViewV3Schema.safeParse({ ...locked, sections: locked.sections.map((section, index) => index === 0 ? { ...section, isLocked: false } : section) }).success, false);

    const submitted = attemptView({ opened: ["math"], state: "SUBMITTED" });
    assert.equal(SimulationAttemptViewV3Schema.safeParse(submitted).success, true);
    assert.equal(SimulationAttemptViewV3Schema.safeParse({ ...submitted, slots: [slot("math", 1)] }).success, false);
  });

  it("requires released section scores to sum to 100 and reserves keys for the released route", () => {
    const score = result();
    assert.equal(SimulationResultViewV3Schema.safeParse(score).success, true);
    assert.equal(SimulationResultViewV3Schema.safeParse({ ...score, correctCount: 2 }).success, false);
    assert.equal(SimulationResultViewV3Schema.safeParse({ ...score, sections: [...score.sections].reverse() }).success, false);

    const review = {
      ...score,
      items: FULL_SIMULATION_SECTIONS.flatMap((section, sectionIndex) =>
        Array.from({ length: section.count }, (_, index) => {
          const ordinal = FULL_SIMULATION_SECTIONS.slice(0, sectionIndex).reduce((count, prior) => count + prior.count, 0) + index + 1;
          const question = slot(section.id, ordinal);
          return {
            slotId: question.slotId,
            earned: ordinal === 1 ? 1 : 0,
            response: { type: "SINGLE_CHOICE", optionId: "a" },
            question,
            correctAnswer: { type: "SINGLE_CHOICE", optionId: "a" },
            explanation: [{ type: "text", text: "Synthetic explanation" }],
          };
        })),
    };
    assert.equal(AuthorizedReleasedReviewV3Schema.safeParse(review).success, true);
    assert.equal(AuthorizedReleasedReviewV3Schema.safeParse({ ...review, items: review.items.slice(1) }).success, false);
  });

  it("publishes the versioned attempt and section-switch route family", () => {
    assert.equal(studentRouteRegistryV3.getAttempt.path, "/api/v3/attempts/{id}");
    assert.equal(studentRouteRegistryV3.switchSection.path, "/api/v3/attempts/{id}/section");
    assert.equal(releasedReviewRouteRegistryV3.releasedResult.path, "/api/v3/attempts/{id}/result");
    assert.equal(studentRouteRegistryV3.createAttempt.body.safeParse({ blueprintVersionId: formId, reuseMode: "REVIEW_ALLOWED" }).success, false);
    assert.equal(studentRouteRegistryV3.createAttempt.body.safeParse({ blueprintVersionId: formId, reuseMode: "NEW_ONLY" }).success, true);
  });

  it("describes full-simulation catalog and allocation receipts explicitly", () => {
    const entry = {
      name: "Synthetic full simulation",
      profileKind: "FULL_SIMULATION",
      sections: FULL_SIMULATION_SECTIONS.map((section) => ({
        sectionId: section.id,
        section: section.section,
        questionCount: section.count,
        durationSeconds: section.durationSeconds,
      })),
      questionCount: 100,
      durationSeconds: 9_000,
      availableFrom: at,
      availableUntil: "2026-11-09T10:00:00Z",
      mode: "PERSONALIZED_PRACTICE",
      reuseMode: "NEW_ONLY",
      blueprintVersionId: formId,
      reviewAllowed: false,
    };
    assert.equal(FullSimulationCatalogPageV3Schema.safeParse({ items: [entry], nextCursor: null }).success, true);
    assert.equal(FullSimulationCatalogPageV3Schema.safeParse({ items: [{ ...entry, sections: entry.sections.slice(1) }], nextCursor: null }).success, false);
    assert.equal(SimulationCreationReceiptV3Schema.safeParse({
      attemptId,
      formId,
      state: "CREATED",
      profileKind: "FULL_SIMULATION",
      formMode: "PERSONALIZED_PRACTICE",
      reuseMode: "NEW_ONLY",
      reusePolicyVersion: "reuse/1",
      questionCount: 100,
      durationSeconds: 9_000,
      startBefore: "2026-11-08T10:10:00Z",
    }).success, true);
  });
});
