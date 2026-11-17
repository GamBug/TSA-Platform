import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { StaffReviewContextSchema, type StaffReviewContext } from "../src/staff.ts";
import { makeStaffReviewContext, staffReviewContextFixtureIds } from "./fixtures/staff-review-context.ts";

function expectInvalid(value: unknown, message: string): void {
  assert.equal(StaffReviewContextSchema.safeParse(value).success, false, message);
}

describe("private staff review context contract", () => {
  it("accepts the exact synthetic available DTO and all supported answer interaction semantics", () => {
    const fixture = makeStaffReviewContext();
    const typedContext: StaffReviewContext = StaffReviewContextSchema.parse(fixture);
    assert.deepEqual(typedContext, fixture);

    const multipleChoice = makeStaffReviewContext();
    multipleChoice.preview.question.interaction = {
      type: "MULTIPLE_CHOICE",
      options: [
        { id: "a", content: [{ type: "text", text: "A" }] },
        { id: "b", content: [{ type: "text", text: "B" }] },
        { id: "c", content: [{ type: "text", text: "C" }] },
      ],
      minSelections: 2,
      maxSelections: 2,
    };
    multipleChoice.preview.question.answerKey = { type: "MULTIPLE_CHOICE", optionIds: ["a", "c"] };
    assert.equal(StaffReviewContextSchema.safeParse(multipleChoice).success, true);

    const trueFalseGroup = makeStaffReviewContext();
    trueFalseGroup.preview.question.interaction = {
      type: "TRUE_FALSE_GROUP",
      statements: [
        { id: "s1", content: [{ type: "text", text: "Statement 1" }] },
        { id: "s2", content: [{ type: "text", text: "Statement 2" }] },
      ],
    };
    trueFalseGroup.preview.question.answerKey = { type: "TRUE_FALSE_GROUP", values: { s1: true, s2: false } };
    assert.equal(StaffReviewContextSchema.safeParse(trueFalseGroup).success, true);
  });

  it("rejects unknown or malformed fields, noncanonical hashes, enum drift and unsafe integers", () => {
    const rootExtra = makeStaffReviewContext() as Record<string, unknown>;
    rootExtra.authorId = staffReviewContextFixtureIds.firstSource;
    expectInvalid(rootExtra, "private identity fields are not part of the DTO");

    const questionExtra = makeStaffReviewContext();
    questionExtra.preview.question.createdBy = "synthetic-private-author";
    expectInvalid(questionExtra, "author identity must not be included in the preview");

    const rightsExtra = makeStaffReviewContext();
    rightsExtra.sources[1]!.currentRights!.evidence = "private rights evidence";
    expectInvalid(rightsExtra, "rights evidence must remain excluded");

    const badHash = makeStaffReviewContext();
    badHash.version.contentHash = "sha256:NOT-A-LOWERCASE-SHA256";
    expectInvalid(badHash, "hashes have an exact lowercase SHA-256 format");

    const badVersion = makeStaffReviewContext();
    badVersion.version.versionNo = Number.MAX_SAFE_INTEGER + 1;
    expectInvalid(badVersion, "version numbers must be safe positive integers");

    const badLiteral = makeStaffReviewContext();
    badLiteral.environment = "PRODUCTION";
    expectInvalid(badLiteral, "the contract fixes its synthetic-only environment");
  });

  it("requires sorted unique source UUIDs and fails closed above one hundred rows", () => {
    const unsorted = makeStaffReviewContext();
    unsorted.sources.reverse();
    expectInvalid(unsorted, "source rows must be sorted");

    const duplicated = makeStaffReviewContext();
    duplicated.sources[1]!.sourceVersionId = duplicated.sources[0]!.sourceVersionId;
    expectInvalid(duplicated, "source UUIDs must be unique");

    const tooMany = makeStaffReviewContext();
    tooMany.sources = Array.from({ length: 101 }, (_, index) => ({
      sourceVersionId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      contentHash: `sha256:${"e".repeat(64)}`,
      origin: null,
      currentRights: null,
    }));
    expectInvalid(tooMany, "the complete closure is bounded at one hundred rows");
  });

  it("requires effective current display rights for every AVAILABLE source at observedAt", () => {
    const cases: Array<[string, (value: ReturnType<typeof makeStaffReviewContext>) => void]> = [
      ["empty closure", (value) => { value.sources = []; }],
      ["missing current rights", (value) => { value.sources[0]!.currentRights = null; }],
      ["revoked rights", (value) => { value.sources[1]!.currentRights!.status = "REVOKED"; }],
      ["unknown rights", (value) => { value.sources[1]!.currentRights!.status = "UNKNOWN"; }],
      ["missing DISPLAY permission", (value) => { value.sources[1]!.currentRights!.allowedUses = ["ADAPT"]; }],
      ["wrong territory", (value) => { value.sources[1]!.currentRights!.territory = ["US"]; }],
      ["future validFrom", (value) => { value.sources[1]!.currentRights!.validFrom = "2026-10-23T10:00:00Z"; }],
      ["missing validFrom", (value) => { value.sources[1]!.currentRights!.validFrom = null; }],
      ["expired validTo", (value) => { value.sources[1]!.currentRights!.validTo = "2026-10-23T08:59:59Z"; }],
      // Same instant as observedAt, expressed with a different offset: validTo is exclusive.
      ["validTo at observedAt", (value) => { value.sources[1]!.currentRights!.validTo = "2026-10-23T16:00:00+07:00"; }],
      ["unparseable validFrom", (value) => { value.sources[1]!.currentRights!.validFrom = "not-a-timeZ"; }],
    ];

    for (const [description, mutate] of cases) {
      const context = makeStaffReviewContext();
      mutate(context);
      expectInvalid(context, `${description} must block an AVAILABLE preview`);
    }
  });

  it("rejects answer keys that do not match the exact interaction", () => {
    const wrongType = makeStaffReviewContext();
    wrongType.preview.question.answerKey = { type: "MULTIPLE_CHOICE", optionIds: ["a"] };
    expectInvalid(wrongType, "answer key type must match interaction");

    const unknownOption = makeStaffReviewContext();
    unknownOption.preview.question.answerKey = { type: "SINGLE_CHOICE", optionId: "not-an-option" };
    expectInvalid(unknownOption, "single-choice key IDs must be known");

    const duplicateSelections = makeStaffReviewContext();
    duplicateSelections.preview.question.interaction = {
      type: "MULTIPLE_CHOICE",
      options: [
        { id: "a", content: [{ type: "text", text: "A" }] },
        { id: "b", content: [{ type: "text", text: "B" }] },
      ],
      minSelections: 1,
      maxSelections: 2,
    };
    duplicateSelections.preview.question.answerKey = { type: "MULTIPLE_CHOICE", optionIds: ["a", "a"] };
    expectInvalid(duplicateSelections, "multiple-choice key IDs must be unique");

    const incompleteGroup = makeStaffReviewContext();
    incompleteGroup.preview.question.interaction = {
      type: "TRUE_FALSE_GROUP",
      statements: [
        { id: "s1", content: [{ type: "text", text: "Statement 1" }] },
        { id: "s2", content: [{ type: "text", text: "Statement 2" }] },
      ],
    };
    incompleteGroup.preview.question.answerKey = { type: "TRUE_FALSE_GROUP", values: { s1: true } };
    expectInvalid(incompleteGroup, "true-false keys must cover every statement exactly");
  });

  it("blocks held workflows and rejects every image location in an available preview", () => {
    const held = makeStaffReviewContext();
    held.workflow.state = "QUARANTINED";
    held.preview = { status: "BLOCKED", reason: "WORKFLOW_HELD" };
    assert.equal(StaffReviewContextSchema.safeParse(held).success, true);

    const heldWithContent = makeStaffReviewContext();
    heldWithContent.workflow.state = "RETIRED";
    expectInvalid(heldWithContent, "held workflow content must be blocked");

    const unsupportedReasonOnHeld = makeStaffReviewContext();
    unsupportedReasonOnHeld.workflow.state = "QUARANTINED";
    unsupportedReasonOnHeld.preview = { status: "BLOCKED", reason: "RIGHTS_BLOCKED" };
    expectInvalid(unsupportedReasonOnHeld, "workflow-held reason has precedence");

    const image = { type: "image", assetVersionId: staffReviewContextFixtureIds.asset, alt: "synthetic" };
    const locations = [
      (value: ReturnType<typeof makeStaffReviewContext>) => { value.preview.question.content = [image]; },
      (value: ReturnType<typeof makeStaffReviewContext>) => { value.preview.question.interaction.options[0]!.content = [image]; },
      (value: ReturnType<typeof makeStaffReviewContext>) => {
        value.preview.question.interaction = { type: "TRUE_FALSE_GROUP", statements: [{ id: "s1", content: [image] }] };
        value.preview.question.answerKey = { type: "TRUE_FALSE_GROUP", values: { s1: true } };
      },
      (value: ReturnType<typeof makeStaffReviewContext>) => { value.preview.question.explanation = [image]; },
      (value: ReturnType<typeof makeStaffReviewContext>) => { value.preview.question.stimulus!.content = [image]; },
    ];
    for (const [index, mutate] of locations.entries()) {
      const value = makeStaffReviewContext();
      mutate(value);
      expectInvalid(value, `available preview image at location ${index} is unsupported`);
    }

    const blockedContent = makeStaffReviewContext();
    blockedContent.preview = { status: "BLOCKED", reason: "CONTENT_UNSUPPORTED" };
    assert.equal(StaffReviewContextSchema.safeParse(blockedContent).success, true);

    const blockedWithQuestion = makeStaffReviewContext();
    blockedWithQuestion.preview = {
      status: "BLOCKED",
      reason: "CONTENT_UNSUPPORTED",
      question: blockedWithQuestion.preview.question,
    };
    expectInvalid(blockedWithQuestion, "a blocked response must omit all question and key content");
  });

  it("enforces the one mebibyte serialized response ceiling", () => {
    const large = makeStaffReviewContext();
    large.sources = Array.from({ length: 100 }, (_, index) => ({
      sourceVersionId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      contentHash: `sha256:${"f".repeat(64)}`,
      origin: null,
      currentRights: {
        decisionId: "77777777-7777-4777-8777-777777777777",
        revision: 1,
        status: "LICENSED" as const,
        allowedUses: ["DISPLAY" as const],
      territory: ["VN"],
      validFrom: "2026-01-01T00:00:00Z",
        validTo: null,
      },
    }));
    large.preview.question.scoringPolicyVersion = "x".repeat(1_100_000);
    expectInvalid(large, "oversized responses must fail instead of truncating closure");
  });
});
