import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { AnswerSubmissionRequestSchema, AttemptViewSchema, QuestionVersionSchema, ResultViewSchema } from "../src/index.ts";
import { QuestionVersionV2Schema } from "../src/question-v2.ts";
import { AnswerSubmissionRequestV2Schema, AttemptViewV2Schema, ResultViewV2Schema } from "../src/student-v2.ts";
import { parseAssemblyManifest, parseAssemblyManifestV2, runAssemblyReferenceV2 } from "../src/assembly-reference.ts";
import { canonicalize } from "../src/identity.ts";
import { factoryPackageFixture } from "./fixtures/factory-package.ts";
import { attemptView, releasedReview } from "./fixtures/stage4b/http-fixtures.ts";
import { makeManifest } from "./fixtures/assembly-reference.ts";
import * as studentV2 from "../src/student-v2.ts";
import { createRequire } from "node:module";

const interaction = { type: "NUMERIC_RESPONSE", format: "DECIMAL", label: "Nhập một số thập phân" };

test("the v2 student package surface exposes no authoring keys or released private review", () => {
  assert.match(createRequire(import.meta.url).resolve("@tsa/contracts/student-v2"), /\/src\/student-v2\.ts$/);
  assert.ok(studentV2.AttemptViewV2Schema);
  for (const name of Object.keys(studentV2)) assert.doesNotMatch(name, /AnswerKey|QuestionVersion|ReleasedReview|Private/);
});

test("numeric question, answer and read contracts are explicit v2 and v1 rejects them", () => {
  const original = structuredClone(factoryPackageFixture.candidates[0]!.question);
  assert.equal(QuestionVersionSchema.safeParse(original).success, true);
  const question = { ...original, schemaVersion: "question/2", interaction,
    private: { ...original.private, scoringPolicy: "practice-binary-v2", answerKey: { type: "NUMERIC_RESPONSE", value: "1.5" } } };
  assert.equal(QuestionVersionV2Schema.safeParse(question).success, true);
  assert.equal(QuestionVersionSchema.safeParse(question).success, false);
  assert.equal(QuestionVersionV2Schema.safeParse({ ...question, schemaVersion: "question/1" }).success, false);
  assert.equal(QuestionVersionV2Schema.safeParse({ ...question, private: { ...question.private, scoringPolicy: "practice-binary-v1" } }).success, false);
  const answer = { expectedRevision: 0, value: { type: "NUMERIC_RESPONSE", value: "1,50" } };
  assert.deepEqual(AnswerSubmissionRequestV2Schema.parse(answer), answer);
  assert.equal(AnswerSubmissionRequestSchema.safeParse(answer).success, false);
  const raw = attemptView({ interaction, response: answer.value });
  const view = { ...raw, slots: raw.slots.map(slot => ({ slotId: slot.slotId, sectionId: slot.sectionId,
    ordinal: slot.ordinal, stimulus: null, content: [{ type: "text", text: "Synthetic decimal question" }], interaction })),
    answers: raw.answers.map(answer => ({ slotId: answer.slotId, value: answer.value, revision: answer.revision, savedAt: answer.savedAt })),
    closure: { attemptId: raw.attemptId, state: raw.state, terminalReason: null, cancellationReason: null, closedAt: null, gradingStatus: null },
  };
  delete (view as Record<string, unknown>).privateCanary;
  assert.equal(AttemptViewV2Schema.safeParse(view).success, true);
  assert.equal(AttemptViewSchema.safeParse(view).success, false);
  const invalid = { ...view, answers: [{ ...view.answers[0], slotId: "99999999-9999-4999-8999-999999999999" }] };
  assert.equal(AttemptViewV2Schema.safeParse(invalid).success, false, "versioned views retain sealed answer membership validation");
  const { items: _items, ...result } = releasedReview();
  const extendedResult = { ...result, policyVersion: "practice-binary-v2",
    sections: result.sections.map(section => ({ sectionId: section.sectionId, section: section.section, correctCount: section.correctCount, totalCount: section.totalCount })) };
  delete (extendedResult as Record<string, unknown>).privateCanary;
  assert.equal(ResultViewV2Schema.safeParse(extendedResult).success, true);
  assert.equal(ResultViewSchema.safeParse(extendedResult).success, false);
});

test("numeric manifests share assembly/1 while the v1 manifest parser remains closed", () => {
  const old = makeManifest();
  const blueprint = { ...old.blueprint, schemaVersion: "blueprint/2", scoringPolicy: "practice-binary-v2", allowedTypes: ["NUMERIC_RESPONSE"] };
  const input = { ...old, schemaVersion: "assembly-manifest/2", blueprint,
    blueprintHash: `sha256:${createHash("sha256").update(canonicalize(blueprint)).digest("hex")}`,
    units: old.units.map(unit => ({ ...unit, members: unit.members.map(member => ({ ...member, interactionType: "NUMERIC_RESPONSE" })) })) };
  assert.equal(parseAssemblyManifestV2(input).manifest.algorithmVersion, "assembly/1");
  assert.throws(() => parseAssemblyManifest(input));
  assert.equal(runAssemblyReferenceV2(input).status, "SUCCESS");
});
