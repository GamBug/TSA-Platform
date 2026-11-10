import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { BlueprintConfigV4Schema } from "../src/blueprint-v4.ts";
import { parseAssemblyManifest, parseAssemblyManifestV4, runAssemblyReferenceV4 } from "../src/assembly-reference.ts";
import { canonicalize, computeDuplicateFingerprint, computeQuestionIdentity, createReferenceHash, type ReferenceDigest, type ReferenceKind } from "../src/identity.ts";
import { QuestionVersionV3Schema } from "../src/question-v3.ts";
import { releasedReviewRouteRegistryV4, studentRouteRegistryV4 } from "../src/routes-v4.ts";
import { factoryPackageFixture } from "./fixtures/factory-package.ts";
import { makeManifest } from "./fixtures/assembly-reference.ts";

const interaction = {
  type: "CLOZE",
  fields: [{ id: "answer", label: "Answer" }],
  maxLength: 32,
  normalization: { unicode: "NFC", trim: "OUTER", caseSensitive: true, diacritics: "PRESERVE" },
} as const;
const answerKey = { type: "CLOZE", acceptedValues: { answer: ["café"] } } as const;

type QuestionReferenceFields = {
  taxonomyVersionId: string;
  provenanceIds: string[];
  private: { evidenceRefs: string[] };
};

function referencesFor(question: QuestionReferenceFields) {
  const provenanceId = question.provenanceIds[0];
  const evidenceId = question.private.evidenceRefs[0];
  if (provenanceId === undefined || evidenceId === undefined) {
    throw new TypeError("Synthetic question must include provenance and evidence references");
  }
  const specs: Array<{ kind: ReferenceKind; id: string; payload: Record<string, string> }> = [
    { kind: "taxonomy", id: question.taxonomyVersionId, payload: { code: "synthetic" } },
    { kind: "provenance", id: provenanceId, payload: { method: "synthetic" } },
    { kind: "evidence", id: evidenceId, payload: { state: "captured" } },
  ];
  return specs.map((spec) => {
    const references: ReferenceDigest[] = [];
    return { ...spec, references, contentHash: createReferenceHash({ ...spec, references }) };
  });
}

test("q3 identity and duplicate fingerprint use new domains while old question versions remain closed", () => {
  const base = structuredClone(factoryPackageFixture.candidates[0]!.question);
  const question = {
    ...base,
    schemaVersion: "question/3",
    interaction,
    private: { ...base.private, answerKey, scoringPolicy: "practice-binary-v3" },
  };
  assert.equal(QuestionVersionV3Schema.safeParse(question).success, true);
  const identity = computeQuestionIdentity(question, referencesFor(question));
  const fingerprint = computeDuplicateFingerprint(question, referencesFor(question));
  assert.match(new TextDecoder().decode(identity.bytes), /"canonicalizationVersion":"identity\/3"/);
  assert.match(new TextDecoder().decode(fingerprint.bytes), /"fingerprintVersion":"fingerprint\/3"/);
  assert.equal(QuestionVersionV3Schema.safeParse({ ...question, schemaVersion: "question/1" }).success, false);
  assert.equal(QuestionVersionV3Schema.safeParse({ ...question, private: { ...question.private, scoringPolicy: "practice-binary-v2" } }).success, false);
});

test("blueprint/4 and assembly-manifest/4 remain additive and keep assembly/1 ordering", () => {
  const old = makeManifest();
  const blueprint = {
    ...old.blueprint,
    schemaVersion: "blueprint/4",
    allowedTypes: ["CLOZE", "MATCHING"],
    scoringPolicy: "practice-binary-v3",
  };
  const input = {
    ...old,
    schemaVersion: "assembly-manifest/4",
    blueprint,
    blueprintHash: `sha256:${createHash("sha256").update(canonicalize(blueprint)).digest("hex")}`,
    units: old.units.map((unit) => ({ ...unit, members: unit.members.map((member) => ({ ...member, interactionType: "CLOZE" })) })),
  };
  assert.equal(BlueprintConfigV4Schema.safeParse(blueprint).success, true);
  assert.equal(parseAssemblyManifestV4(input).manifest.schemaVersion, "assembly-manifest/4");
  assert.equal(runAssemblyReferenceV4(input).status, "SUCCESS");
  assert.throws(() => parseAssemblyManifest(input));
  assert.equal(BlueprintConfigV4Schema.safeParse({ ...blueprint, allowedTypes: ["CLOZE", "CLOZE"] }).success, false);
});

test("the student and released-review surfaces use /api/v4 without widening v1/v2/v3 routes", () => {
  assert.equal(studentRouteRegistryV4.saveAnswer.path, "/api/v4/attempts/{id}/answers/{slotId}");
  assert.equal(releasedReviewRouteRegistryV4.releasedResult.path, "/api/v4/attempts/{id}/result");
  assert.equal(studentRouteRegistryV4.catalog.path, "/api/v4/catalog");
});
