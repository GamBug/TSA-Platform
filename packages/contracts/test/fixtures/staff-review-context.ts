const ids = {
  firstSource: "11111111-1111-4111-8111-111111111111",
  secondSource: "22222222-2222-4222-8222-222222222222",
  question: "33333333-3333-4333-8333-333333333333",
  version: "44444444-4444-4444-8444-444444444444",
  stimulus: "55555555-5555-4555-8555-555555555555",
  asset: "66666666-6666-4666-8666-666666666666",
} as const;

const text = (value: string) => [{ type: "text", text: value }];

export function makeStaffReviewContext(): Record<string, any> {
  return {
    schemaVersion: "staff-review-context/1",
    observedAt: "2026-10-23T09:00:00Z",
    accessBasis: "REVIEW_QUEUE",
    environment: "LOCAL_SYNTHETIC_ONLY",
    version: {
      questionId: ids.question,
      versionId: ids.version,
      versionNo: 2,
      parentVersionId: null,
      section: "MATH",
      contentHash: `sha256:${"a".repeat(64)}`,
    },
    workflow: { state: "IN_REVIEW", revision: 3 },
    sources: [
      {
        sourceVersionId: ids.firstSource,
        contentHash: `sha256:${"b".repeat(64)}`,
        origin: "OWNED",
        currentRights: {
          decisionId: "88888888-8888-4888-8888-888888888888",
          revision: 1,
          status: "OWNED",
          allowedUses: ["DISPLAY"],
          territory: ["WORLDWIDE"],
          validFrom: "2026-10-23T08:00:00Z",
          validTo: "2026-10-23T10:00:00Z",
        },
      },
      {
        sourceVersionId: ids.secondSource,
        contentHash: `sha256:${"c".repeat(64)}`,
        origin: "EXTERNAL",
        currentRights: {
          decisionId: "77777777-7777-4777-8777-777777777777",
          revision: 1,
          status: "LICENSED",
          allowedUses: ["DISPLAY", "ADAPT"],
          territory: ["VN"],
          validFrom: "2026-01-01T00:00:00+07:00",
          validTo: null,
        },
      },
    ],
    preview: {
      status: "AVAILABLE",
      question: {
        language: "vi-VN",
        content: text("Synthetic question prompt"),
        interaction: {
          type: "SINGLE_CHOICE",
          options: [
            { id: "a", content: text("Synthetic option A") },
            { id: "b", content: text("Synthetic option B") },
          ],
        },
        answerKey: { type: "SINGLE_CHOICE", optionId: "b" },
        explanation: text("Synthetic explanation"),
        scoringPolicyVersion: "practice-binary-v1",
        stimulus: {
          versionId: ids.stimulus,
          contentHash: `sha256:${"d".repeat(64)}`,
          content: text("Synthetic shared stimulus"),
        },
      },
    },
    rightsEvidenceIncluded: false,
    publicationEligibility: "NOT_EVALUATED",
  };
}

export { ids as staffReviewContextFixtureIds };
