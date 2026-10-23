const ids = {
  firstSource: "11111111-1111-4111-8111-111111111111",
  secondSource: "22222222-2222-4222-8222-222222222222",
  thirdSource: "33333333-3333-4333-8333-333333333333",
  questionVersion: "44444444-4444-4444-8444-444444444444",
} as const;

const HASH = `sha256:${"a".repeat(64)}`;

export function makeStaffReviewEvidence(): Record<string, any> {
  return {
    schemaVersion: "staff-review-evidence/1",
    observedAt: "2026-10-23T09:00:00Z",
    environment: "LOCAL_SYNTHETIC_ONLY",
    accessBasis: "BANK_MANAGER",
    version: {
      versionId: ids.questionVersion,
      contentHash: HASH,
      workflowRevision: 4,
    },
    sources: [
      {
        sourceVersionId: ids.firstSource,
        currentDecision: null,
      },
      {
        sourceVersionId: ids.secondSource,
        currentDecision: {
          decisionId: "55555555-5555-4555-8555-555555555555",
          revision: 2,
          status: "UNKNOWN",
          recordedEvidence: { state: "NOT_RECORDED" },
        },
      },
      {
        sourceVersionId: ids.thirdSource,
        currentDecision: {
          decisionId: "66666666-6666-4666-8666-666666666666",
          revision: 7,
          status: "REVOKED",
          recordedEvidence: {
            state: "TEXT_AVAILABLE",
            text: "  <script>alert('synthetic')</script>\nhttps://source.invalid/file?token=synthetic  ",
          },
        },
      },
    ],
    qualification: "NOT_ATTESTED_BY_PLATFORM",
    publicationEligibility: "NOT_EVALUATED",
  };
}

export { ids as staffReviewEvidenceFixtureIds };
