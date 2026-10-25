import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StaffReviewContextSchema,
  StaffReviewEvidenceSchema,
  StaffReviewHistorySchema,
  StaffFixedAssemblyRunListSchema,
  StaffFixedAssemblyDiagnosticSchema,
  StaffFixedRehearsalBlueprintListSchema,
  StaffFixedRehearsalRequestSchema,
  StaffFixedRehearsalReceiptSchema,
  StaffFixedRehearsalListSchema,
  StaffFixedRehearsalDiagnosticSchema,
  StaffDatasetPreflightRequestSchema,
  StaffDatasetPreflightSchema,
  StaffQuarantineRequestSchema,
  StaffQuarantineResponseSchema,
  StaffRejectReviewRequestSchema,
  StaffRejectReviewResponseSchema,
  StaffSubmitReviewRequestSchema,
  StaffSubmitReviewResponseSchema,
} from "@tsa/contracts/staff";
import { makeStaffReviewContext } from "./fixtures/staff-review-context.ts";
import { makeStaffReviewEvidence } from "./fixtures/staff-review-evidence.ts";

describe("@tsa/contracts/staff package subpath", () => {
  it("resolves the additive private schema export", () => {
    assert.equal(StaffReviewContextSchema.safeParse(makeStaffReviewContext()).success, true);
    assert.equal(StaffReviewEvidenceSchema.safeParse(makeStaffReviewEvidence()).success, true);
    const assemblyRunId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const blueprintVersionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const fixedRun = {
      assemblyRunId,
      blueprintVersionId,
      outcome: "SUCCESS",
      createdAt: "2026-10-25T12:34:56.123456Z",
    };
    assert.equal(StaffFixedAssemblyRunListSchema.safeParse({
      schemaVersion: "staff-fixed-assembly-runs/1",
      environment: "LOCAL_SYNTHETIC_ONLY",
      accessBasis: "BANK_MANAGER",
      observedAt: "2026-10-25T12:34:56.123456Z",
      scope: "CAPTURED_FIXED_REFERENCE_RUNS_ONLY",
      limit: 20,
      truncated: false,
      runs: [fixedRun],
    }).success, true);
    assert.equal(StaffFixedAssemblyDiagnosticSchema.safeParse({
      schemaVersion: "staff-fixed-assembly-diagnostic/1",
      environment: "LOCAL_SYNTHETIC_ONLY",
      accessBasis: "BANK_MANAGER",
      observedAt: "2026-10-25T12:34:56.123456Z",
      scope: "CAPTURED_FIXED_REFERENCE_RUN_ONLY",
      run: fixedRun,
      algorithmVersion: "assembly/1",
      replayVerified: true,
      createsForm: false,
      qualification: "NOT_ATTESTED_BY_PLATFORM",
      publicationEligibility: "NOT_EVALUATED",
      outcome: "SUCCESS",
      failureCode: null,
      visitedNodes: 1,
      nodeLimit: 50000,
      capturedUnitCount: 1,
      unitLimit: 2000,
      capturedCandidateCount: 1,
      selectedCount: 1,
      sections: [{ section: "MATH", requiredCount: 1, selectedCount: 1 }],
    }).success, true);
    const rehearsalRequest = {
      blueprintVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      blueprintHash: `sha256:${"a".repeat(64)}`,
      windowMinutes: 60,
      seed: 42,
    };
    const rehearsalReceipt = {
      rehearsalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      blueprintVersionId: rehearsalRequest.blueprintVersionId,
      blueprintHash: rehearsalRequest.blueprintHash,
      windowMinutes: rehearsalRequest.windowMinutes,
      capturedAt: "2026-10-25T12:00:00.123456Z",
      availableUntil: "2026-10-25T13:00:00.123456Z",
      requiredThrough: "2026-10-25T13:10:01.123456Z",
      outcome: "SUCCESS",
      failureCode: null,
      sectionDeficits: [],
      createsForm: false,
      currentEligibility: "NOT_REVALIDATED",
    };
    assert.equal(StaffFixedRehearsalRequestSchema.safeParse(rehearsalRequest).success, true);
    assert.equal(StaffFixedRehearsalReceiptSchema.safeParse(rehearsalReceipt).success, true);
    assert.equal(StaffFixedRehearsalBlueprintListSchema.safeParse({
      schemaVersion: "staff-fixed-rehearsal-blueprints/1",
      environment: "LOCAL_SYNTHETIC_ONLY",
      accessBasis: "EXAM_MANAGER",
      observedAt: "2026-10-25T14:00:00.123456Z",
      limit: 20,
      truncated: false,
      items: [{
        blueprintVersionId: rehearsalRequest.blueprintVersionId,
        contentHash: rehearsalRequest.blueprintHash,
        name: "Synthetic math blueprint",
        section: "MATH",
        questionCount: 4,
        durationSeconds: 3600,
      }],
    }).success, true);
    assert.equal(StaffFixedRehearsalListSchema.safeParse({
      schemaVersion: "staff-fixed-rehearsals/1",
      environment: "LOCAL_SYNTHETIC_ONLY",
      accessBasis: "BANK_MANAGER",
      observedAt: "2026-10-25T14:00:00.123456Z",
      limit: 20,
      truncated: false,
      items: [{
        rehearsalId: rehearsalReceipt.rehearsalId,
        blueprintVersionId: rehearsalRequest.blueprintVersionId,
        outcome: "SUCCESS",
        capturedAt: rehearsalReceipt.capturedAt,
        windowMinutes: 60,
      }],
    }).success, true);
    assert.equal(StaffFixedRehearsalDiagnosticSchema.safeParse({
      schemaVersion: "staff-fixed-rehearsal-diagnostic/1",
      environment: "LOCAL_SYNTHETIC_ONLY",
      accessBasis: "BANK_MANAGER",
      observedAt: "2026-10-25T14:00:00.123456Z",
      captureOrigin: "BANK_ELIGIBLE_AT_CAPTURE",
      currentEligibility: "NOT_REVALIDATED",
      qualification: "NOT_ATTESTED_BY_PLATFORM",
      publicationEligibility: "NOT_EVALUATED",
      rehearsal: rehearsalReceipt,
      replayVerified: true,
      createsForm: false,
      capturedUnitCount: 4,
      capturedCandidateCount: 4,
      selectedCount: 4,
      visitedNodes: 1,
      nodeLimit: 50000,
      unitLimit: 2000,
      section: { section: "MATH", requiredCount: 4, selectedCount: 4 },
    }).success, true);
    assert.equal(StaffReviewHistorySchema.safeParse({
      schemaVersion: "staff-review-history/1",
      environment: "LOCAL_SYNTHETIC_ONLY",
      accessBasis: "BANK_MANAGER",
      observedAt: "2026-10-24T12:34:56.123456Z",
      version: {
        versionId: "44444444-4444-4444-8444-444444444444",
        contentHash: `sha256:${"a".repeat(64)}`,
        workflowRevision: 1,
      },
      workflowState: "IN_REVIEW",
      qualification: "NOT_ATTESTED_BY_PLATFORM",
      publicationEligibility: "NOT_EVALUATED",
      limit: 20,
      truncated: false,
      reviews: [],
    }).success, true);
    const preflightRequest = {
      versions: [{ versionId: "44444444-4444-4444-8444-444444444444", contentHash: `sha256:${"a".repeat(64)}` }],
    };
    assert.equal(StaffDatasetPreflightRequestSchema.safeParse(preflightRequest).success, true);
    assert.equal(StaffDatasetPreflightSchema.safeParse({
      schemaVersion: "staff-dataset-preflight/1",
      environment: "LOCAL_SYNTHETIC_ONLY",
      accessBasis: "BANK_MANAGER",
      scope: "CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION",
      generatedAt: "2026-10-24T12:34:56.123456Z",
      qualification: "NOT_ATTESTED_BY_PLATFORM",
      publicationEligibility: "NOT_EVALUATED",
      publishing: false,
      eligibilityRevision: "0",
      targets: { MATH: 12, READING: 6, SCIENCE: 12 },
      counts: {
        total: 1,
        bySection: { MATH: 1, READING: 0, SCIENCE: 0 },
        byInteractionType: { SINGLE_CHOICE: 1, MULTIPLE_CHOICE: 0, TRUE_FALSE_GROUP: 0 },
      },
      shortfalls: { MATH: 11, READING: 6, SCIENCE: 12 },
      duplicateFingerprintGroupCount: 0,
      blockerCodes: [
        "CURRENT_RIGHTS_UNVERIFIED",
        "HUMAN_EQUIVALENCE_REVIEW_REQUIRED",
        "LAWFUL_INVENTORY_UNVERIFIED",
        "NAMED_HUMAN_AUTHOR_REQUIRED",
        "NAMED_INDEPENDENT_REVIEWER_REQUIRED",
        "STARTER_TARGET_SHORTFALL",
      ],
      versions: [{
        versionId: "44444444-4444-4444-8444-444444444444",
        contentHash: `sha256:${"a".repeat(64)}`,
        workflowRevision: 1,
        state: "APPROVED",
      }],
    }).success, true);
    assert.equal(StaffSubmitReviewRequestSchema.safeParse({ expectedRevision: 1 }).success, true);
    assert.equal(StaffSubmitReviewResponseSchema.safeParse({
      versionId: "44444444-4444-4444-8444-444444444444",
      state: "IN_REVIEW",
      revision: 2,
    }).success, true);
    assert.equal(StaffRejectReviewRequestSchema.safeParse({
      expectedRevision: 1,
      contentHash: `sha256:${"a".repeat(64)}`,
      decision: "REJECT",
      rubric: {
        correctness: true,
        unambiguous: true,
        relevant: true,
        language: true,
        explanation: true,
        rights: true,
      },
      reason: "Explicit reason",
    }).success, true);
    assert.equal(StaffRejectReviewResponseSchema.safeParse({
      reviewId: "01234567-89ab-4cde-8fab-0123456789ab",
      state: "REJECTED",
      revision: 2,
    }).success, true);
    assert.equal(StaffQuarantineRequestSchema.safeParse({ expectedRevision: 2, reason: "Explicit reason" }).success, true);
    assert.equal(StaffQuarantineResponseSchema.safeParse({ state: "QUARANTINED", revision: 3 }).success, true);
  });
});
