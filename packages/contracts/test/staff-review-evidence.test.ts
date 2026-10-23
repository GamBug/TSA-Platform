import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { StaffReviewEvidenceSchema, type StaffReviewEvidence } from "../src/staff.ts";
import { makeStaffReviewEvidence, staffReviewEvidenceFixtureIds } from "./fixtures/staff-review-evidence.ts";

const MAX_RECORDED_EVIDENCE_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;

function expectInvalid(value: unknown, message: string): void {
  assert.equal(StaffReviewEvidenceSchema.safeParse(value).success, false, message);
}

function serializedEvidenceBytes(text: string): number {
  return new TextEncoder().encode(JSON.stringify({ state: "TEXT_AVAILABLE", text })).byteLength;
}

describe("private staff review evidence contract", () => {
  it("accepts the exact bounded DTO and preserves evidence text verbatim", () => {
    const fixture = makeStaffReviewEvidence();
    const parsed: StaffReviewEvidence = StaffReviewEvidenceSchema.parse(fixture);
    assert.deepEqual(parsed, fixture);
    assert.equal(parsed.sources[0]!.currentDecision, null);
    assert.deepEqual(parsed.sources[1]!.currentDecision?.recordedEvidence, { state: "NOT_RECORDED" });
    assert.equal(parsed.sources[2]!.currentDecision?.recordedEvidence.state, "TEXT_AVAILABLE");
    if (parsed.sources[2]!.currentDecision?.recordedEvidence.state === "TEXT_AVAILABLE") {
      assert.equal(
        parsed.sources[2]!.currentDecision.recordedEvidence.text,
        "  <script>alert('synthetic')</script>\nhttps://source.invalid/file?token=synthetic  ",
        "schema parsing retains raw text, including surrounding whitespace and URI-like content",
      );
    } else {
      assert.fail("the synthetic current evidence text must be present");
    }
  });

  it("rejects unknown fields, invalid literals, malformed identity and nonpositive or unsafe revisions", () => {
    const rootExtra = makeStaffReviewEvidence();
    rootExtra.actorId = staffReviewEvidenceFixtureIds.questionVersion;
    expectInvalid(rootExtra, "actor identity is outside the exact private DTO");

    const versionExtra = makeStaffReviewEvidence();
    versionExtra.version.parentVersionId = null;
    expectInvalid(versionExtra, "version accepts no unapproved fields");

    const decisionExtra = makeStaffReviewEvidence();
    decisionExtra.sources[2]!.currentDecision!.attestorId = staffReviewEvidenceFixtureIds.firstSource;
    expectInvalid(decisionExtra, "attestor identity is excluded");

    const recordExtra = makeStaffReviewEvidence();
    recordExtra.sources[2]!.currentDecision!.recordedEvidence.uri = "https://source.invalid/file";
    expectInvalid(recordExtra, "recorded evidence contains only the approved text field");

    const badLiteral = makeStaffReviewEvidence();
    badLiteral.qualification = "QUALIFIED_REVIEWER";
    expectInvalid(badLiteral, "platform qualification is a fixed non-attestation literal");

    const badStatus = makeStaffReviewEvidence();
    badStatus.sources[1]!.currentDecision!.status = "ELIGIBLE";
    expectInvalid(badStatus, "current status uses the fixed rights status enum");

    const badVersionId = makeStaffReviewEvidence();
    badVersionId.version.versionId = "not-a-uuid";
    expectInvalid(badVersionId, "version IDs must be canonical UUIDs");

    const badHash = makeStaffReviewEvidence();
    badHash.version.contentHash = "sha256:NOT-LOWERCASE";
    expectInvalid(badHash, "version hashes use the canonical SHA-256 form");

    for (const revision of [0, -1, Number.MAX_SAFE_INTEGER + 1, 1.5]) {
      const invalid = makeStaffReviewEvidence();
      invalid.version.workflowRevision = revision;
      expectInvalid(invalid, `workflow revision ${revision} must be a positive safe integer`);
    }
    const invalidDecisionRevision = makeStaffReviewEvidence();
    invalidDecisionRevision.sources[2]!.currentDecision!.revision = 0;
    expectInvalid(invalidDecisionRevision, "decision revisions must be positive safe integers");

    const badObservedAt = makeStaffReviewEvidence();
    badObservedAt.observedAt = "not-an-instant";
    expectInvalid(badObservedAt, "observation time must be an offset-bearing instant");
  });

  it("requires source rows to be sorted and unique and caps their count at one hundred", () => {
    const empty = makeStaffReviewEvidence();
    empty.sources = [];
    assert.equal(StaffReviewEvidenceSchema.safeParse(empty).success, true, "an empty source closure is representable");

    const unsorted = makeStaffReviewEvidence();
    unsorted.sources.reverse();
    expectInvalid(unsorted, "source UUIDs must be sorted ascending");

    const duplicate = makeStaffReviewEvidence();
    duplicate.sources[1]!.sourceVersionId = duplicate.sources[0]!.sourceVersionId;
    expectInvalid(duplicate, "source UUIDs must be unique");

    const atLimit = makeStaffReviewEvidence();
    atLimit.sources = Array.from({ length: 100 }, (_, index) => ({
      sourceVersionId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      currentDecision: null,
    }));
    assert.equal(StaffReviewEvidenceSchema.safeParse(atLimit).success, true, "one hundred source rows are allowed");
    atLimit.sources.push({ sourceVersionId: "00000000-0000-4000-8000-000000000064", currentDecision: null });
    expectInvalid(atLimit, "the source closure must not exceed one hundred rows");
  });

  it("requires nonblank text and enforces the 64 KiB serialized evidence-container limit", () => {
    const blank = makeStaffReviewEvidence();
    blank.sources[2]!.currentDecision!.recordedEvidence.text = " \t\n\u2003 ";
    expectInvalid(blank, "whitespace-only evidence is not TEXT_AVAILABLE");

    const boundary = makeStaffReviewEvidence();
    let text = "é".repeat(Math.floor((MAX_RECORDED_EVIDENCE_BYTES - serializedEvidenceBytes("")) / 2));
    while (serializedEvidenceBytes(text) < MAX_RECORDED_EVIDENCE_BYTES) text += "a";
    assert.equal(serializedEvidenceBytes(text), MAX_RECORDED_EVIDENCE_BYTES);
    boundary.sources[2]!.currentDecision!.recordedEvidence.text = text;
    assert.equal(StaffReviewEvidenceSchema.safeParse(boundary).success, true, "exactly 64 KiB including the union container is allowed");

    boundary.sources[2]!.currentDecision!.recordedEvidence.text += "a";
    expectInvalid(boundary, "one byte above the evidence-container limit is rejected");

    const notRecordedWithText = makeStaffReviewEvidence();
    notRecordedWithText.sources[1]!.currentDecision!.recordedEvidence.text = "must not be substituted";
    expectInvalid(notRecordedWithText, "legacy missing or non-string text uses NOT_RECORDED without a text member");
  });

  it("enforces the one MiB serialized full response ceiling across individually bounded source texts", () => {
    const large = makeStaffReviewEvidence();
    large.sources = Array.from({ length: 17 }, (_, index) => ({
      sourceVersionId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      currentDecision: {
        decisionId: "77777777-7777-4777-8777-777777777777",
        revision: 1,
        status: "UNKNOWN",
        recordedEvidence: { state: "TEXT_AVAILABLE", text: "x".repeat(62_000) },
      },
    }));
    assert.ok(serializedEvidenceBytes("x".repeat(62_000)) < MAX_RECORDED_EVIDENCE_BYTES);
    const responseBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
    const oversizedBytes = responseBytes(large);
    assert.ok(oversizedBytes > MAX_RESPONSE_BYTES);
    const lastEvidence = large.sources[16]!.currentDecision!.recordedEvidence;
    assert.equal(lastEvidence.state, "TEXT_AVAILABLE");
    if (lastEvidence.state !== "TEXT_AVAILABLE") assert.fail("synthetic last source must carry text");
    const excess = oversizedBytes - MAX_RESPONSE_BYTES;
    lastEvidence.text = lastEvidence.text.slice(0, -excess);
    assert.equal(responseBytes(large), MAX_RESPONSE_BYTES);
    assert.equal(StaffReviewEvidenceSchema.safeParse(large).success, true, "exactly one MiB is allowed");

    lastEvidence.text += "x";
    expectInvalid(large, "one byte above the full response limit is rejected");
  });
});
