const ids = {
  attempt: "44444444-4444-4444-8444-444444444444",
  form: "55555555-5555-4555-8555-555555555555",
  slot: "66666666-6666-4666-8666-666666666666",
  scoreRun: "88888888-8888-4888-8888-888888888888",
};

export const fixtureIds = ids;

export function singleChoiceInteraction() {
  return {
    type: "SINGLE_CHOICE" as const,
    options: [
      { id: "a", content: [{ type: "text" as const, text: "2", privateCanary: "private-option" }] },
      { id: "b", content: [{ type: "text" as const, text: "3" }] },
    ],
  };
}

export function attemptView(options: {
  interaction?: unknown;
  response?: unknown;
  state?: "IN_PROGRESS" | "SUBMITTED";
} = {}) {
  const state = options.state ?? "IN_PROGRESS";
  return {
    attemptId: ids.attempt,
    state,
    formId: ids.form,
    domain: "MATH" as const,
    formMode: "PERSONALIZED_PRACTICE" as const,
    reuseMode: "NEW_ONLY" as const,
    reusePolicyVersion: "reuse/1" as const,
    serverNow: "2026-10-19T10:02:00Z",
    startBefore: null,
    startedAt: "2026-10-19T10:00:00Z",
    deadlineAt: "2026-10-19T10:30:00Z",
    activeSectionId: "math-entry",
    sections: [{ sectionId: "math-entry", section: "MATH" as const, startsAt: "2026-10-19T10:00:00Z", endsAt: "2026-10-19T10:30:00Z", count: 1 }],
    slots: [{
      slotId: ids.slot,
      sectionId: "math-entry",
      ordinal: 1,
      content: [{ type: "text" as const, text: "Which number is three?", answerKey: "private-question" }],
      stimulus: { id: ids.form, content: [{ type: "text" as const, text: "Synthetic stimulus", explanation: "private-stimulus" }], privateSource: "private-source" },
      interaction: options.interaction ?? singleChoiceInteraction(),
      answerKey: { type: "SINGLE_CHOICE", optionId: "b" },
    }],
    answers: [{
      slotId: ids.slot,
      value: options.response ?? { type: "SINGLE_CHOICE", optionId: "b" },
      revision: 1,
      savedAt: "2026-10-19T10:01:00Z",
      correct: true,
    }],
    closure: { attemptId: ids.attempt, state, terminalReason: null, cancellationReason: null, closedAt: null, gradingStatus: null, privateState: "private-closure" },
    privateCanary: "private-attempt",
  };
}

export function closedAttemptView() {
  const view = structuredClone(attemptView({ state: "SUBMITTED" })) as unknown as Record<string, any>;
  view.slots = [];
  view.answers = [];
  view.activeSectionId = null;
  view.closure = {
    attemptId: ids.attempt,
    state: "SUBMITTED",
    terminalReason: "EXPLICIT_SUBMIT",
    cancellationReason: null,
    closedAt: "2026-10-19T10:02:00Z",
    gradingStatus: "PENDING",
  };
  return view;
}

export function releasedReview() {
  return {
    attemptId: ids.attempt,
    scoreRunId: ids.scoreRun,
    domain: "MATH" as const,
    formMode: "PERSONALIZED_PRACTICE" as const,
    reuseMode: "NEW_ONLY" as const,
    policyVersion: "practice-binary-v1" as const,
    scoreLabel: "UNOFFICIAL_PRACTICE" as const,
    correctCount: 1,
    totalCount: 1,
    percentage: "100.00",
    sections: [{ sectionId: "math-entry", section: "MATH" as const, correctCount: 1, totalCount: 1, privateScore: "drop" }],
    releasedAt: "2026-10-19T10:03:00Z",
    items: [{
      slotId: ids.slot,
      earned: 1 as const,
      response: { type: "SINGLE_CHOICE" as const, optionId: "b" },
      question: {
        slotId: ids.slot,
        sectionId: "math-entry",
        ordinal: 1,
        content: [{ type: "text" as const, text: "Which number is three?" }],
        stimulus: null,
        interaction: singleChoiceInteraction(),
        sourceVersionId: "internal-source",
      },
      correctAnswer: { type: "SINGLE_CHOICE" as const, optionId: "b" },
      explanation: [{ type: "text" as const, text: "Three is the correct value.", rationaleId: "review-only" }],
      authorNotes: "review-only-field",
    }],
    privateCanary: "private-result-root",
  };
}

export function accessGuard(overrides: Record<string, unknown> = {}) {
  return {
    attemptId: ids.attempt,
    ownerId: "owner-A",
    state: "IN_PROGRESS",
    withdrawn: false,
    releaseAuthorized: false,
    revision: "rev-1",
    ...overrides,
  };
}
