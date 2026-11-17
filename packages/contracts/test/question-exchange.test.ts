import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { QuestionVersionSchema } from "../src/index.ts";
import { QuestionVersionV2Schema } from "../src/question-v2.ts";
import { QuestionVersionV3Schema } from "../src/question-v3.ts";
import { INTERNAL_SCHEMA_BY_TYPE, passageContent, toInternalParts, validateQuestionSet, type ExchangeQuestion } from "../src/question-exchange.ts";

const EXAMPLES = new URL("../../../docs/question-bank/examples/", import.meta.url);
const readJson = (path: string): any => JSON.parse(readFileSync(new URL(path, EXAMPLES), "utf8"));
const validFiles = readdirSync(new URL("valid/", EXAMPLES)).filter((name) => name.endsWith(".json")).sort();
const invalidExpectations: Record<string, { codes: string[]; requires_asset_catalog?: boolean }> = readJson("invalid/expected.json");
const CATALOG = ["IMG-GEO-000123", "IMG-GEO-000124"];

const UUID_A = "11111111-1111-4111-8111-111111111111";
const ASSET_UUID = "22222222-2222-4222-8222-222222222222";

function codes(input: unknown, assets?: string[]): string[] {
  return [...new Set(validateQuestionSet(input, { assets }).errors.map((issue) => issue.code))].sort();
}

describe("question exchange format: valid examples", () => {
  it("covers every supported question type", () => {
    const seen = new Set<string>();
    for (const file of validFiles) for (const question of readJson(`valid/${file}`).questions) seen.add(question.question_type);
    assert.deepEqual([...seen].sort(), ["CLOZE", "MATCHING", "MULTIPLE_CHOICE", "NUMERIC", "SINGLE_CHOICE", "TRUE_FALSE_GROUP"]);
  });

  for (const file of validFiles) {
    it(`accepts ${file}`, () => {
      const report = validateQuestionSet(readJson(`valid/${file}`), { assets: CATALOG });
      assert.deepEqual(report.errors, []);
      assert.equal(report.ok, true);
    });
  }

  it("flags a question that needs a new image without blocking validity", () => {
    const report = validateQuestionSet(readJson("valid/image-needed.json"), { assets: CATALOG });
    assert.equal(report.ok, true);
    assert.deepEqual(report.summary.questionsNeedingAssets, ["MATH-GEO-000009"]);
    assert.ok(report.warnings.some((issue) => issue.code === "NEEDS_NEW_IMAGE_ASSET"));
  });
});

describe("question exchange format: invalid examples", () => {
  for (const [file, expectation] of Object.entries(invalidExpectations)) {
    it(`rejects ${file} with ${expectation.codes.join(", ")}`, () => {
      const document = readJson(`invalid/${file}`);
      const found = codes(document, expectation.requires_asset_catalog ? CATALOG : undefined);
      assert.deepEqual(found, [...expectation.codes].sort());
      assert.equal(validateQuestionSet(document, { assets: expectation.requires_asset_catalog ? CATALOG : undefined }).ok, false);
    });
  }

  it("has a recorded expectation for every invalid example file", () => {
    const files = readdirSync(new URL("invalid/", EXAMPLES)).filter((name) => name !== "expected.json").sort();
    assert.deepEqual(Object.keys(invalidExpectations).sort(), files);
  });

  it("reports a location and an actionable message for every problem", () => {
    const report = validateQuestionSet(readJson("invalid/answer-not-an-option.json"));
    assert.equal(report.errors[0]!.path, "questions[0].answer.option_id");
    assert.match(report.errors[0]!.message, /not one of the option ids \(A, B, C, D\)/);
  });

  it("never throws on hostile input", () => {
    for (const input of [null, undefined, 7, "text", [], {}, { format: "tsa-question-set/1", batch_id: "x", questions: "no" }, { questions: [null, 3, "x", []] }]) {
      const report = validateQuestionSet(input);
      assert.equal(report.ok, false);
      assert.ok(report.errors.length > 0);
    }
  });

  it("rejects markup, scripts, data URLs and markdown images in text", () => {
    for (const text of ["<b>x</b>", "<script>1</script>", "javascript:alert(1)", "data:text/html;base64,AAAA", "![alt](http://x/y.png)"]) {
      const document = readJson("valid/single-choice.json");
      document.questions[0].content_blocks[0].content = text;
      assert.ok(codes(document).includes("UNSAFE_TEXT"), text);
    }
  });

  it("applies a supplied TeX checker to math blocks and inline formulas", () => {
    const only = (tex: string) => !/\\(?:evil)/u.test(tex);
    const document = readJson("valid/single-choice.json");
    assert.equal(validateQuestionSet(document, { isSafeTex: only }).ok, true);
    document.questions[0].content_blocks[0].content = "Tính $\\evil{x}$.";
    assert.deepEqual(validateQuestionSet(document, { isSafeTex: only }).errors.map((issue) => issue.code), ["UNSUPPORTED_TEX"]);
  });

  it("detects questions whose prompts are identical", () => {
    const document = readJson("valid/single-choice.json");
    const clone = structuredClone(document.questions[0]);
    clone.question_id = "MATH-PROB-000099";
    document.questions.push(clone);
    assert.ok(codes(document).includes("DUPLICATE_QUESTION_CONTENT"));
  });
});

describe("mapping onto the Bank's existing question contracts", () => {
  const schemaFor = { "question/1": QuestionVersionSchema, "question/2": QuestionVersionV2Schema, "question/3": QuestionVersionV3Schema } as const;
  const scoring = { "question/1": "practice-binary-v1", "question/2": "practice-binary-v2", "question/3": "practice-binary-v3" } as const;

  for (const file of validFiles.filter((name) => name !== "image-needed.json")) {
    it(`${file} maps to parseable internal versions with the same answers`, () => {
      const document = validateQuestionSet(readJson(`valid/${file}`), { assets: CATALOG }).value!;
      for (const question of document.questions) {
        const parts = toInternalParts(question as ExchangeQuestion, () => ASSET_UUID);
        const internal = {
          schemaVersion: parts.schemaVersion,
          id: UUID_A,
          questionId: "33333333-3333-4333-8333-333333333333",
          versionNo: 1,
          parentVersionId: null,
          language: "vi-VN",
          section: parts.section,
          taxonomyVersionId: "44444444-4444-4444-8444-444444444444",
          domainId: parts.section,
          skillIds: ["SKILL"],
          subskillIds: [],
          cognitiveLevel: null,
          difficulty: { target: parts.targetDifficulty, predicted: null, empiricalStudyId: null },
          content: parts.content,
          stimulusVersionId: null,
          interaction: parts.interaction,
          private: { answerKey: parts.answerKey, explanation: parts.explanation, evidenceRefs: ["evidence"], scoringPolicy: scoring[parts.schemaVersion] },
          origin: "MANUAL",
          provenanceIds: ["55555555-5555-4555-8555-555555555555"],
          generationRunId: null,
          createdBy: "66666666-6666-4666-8666-666666666666",
          createdAt: "2026-11-16T00:00:00.000Z",
          contentHash: `sha256:${"0".repeat(64)}`,
        };
        const parsed = schemaFor[parts.schemaVersion].safeParse(internal);
        assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3)));
      }
    });
  }

  it("maps each type to the contract version that its student route serves", () => {
    const versions: Record<string, string> = {};
    for (const file of validFiles.filter((name) => name !== "image-needed.json")) {
      for (const question of validateQuestionSet(readJson(`valid/${file}`), { assets: CATALOG }).value!.questions) {
        versions[question.question_type] = toInternalParts(question as ExchangeQuestion, () => ASSET_UUID).schemaVersion;
      }
    }
    assert.deepEqual(versions, {
      SINGLE_CHOICE: "question/1", MULTIPLE_CHOICE: "question/1", TRUE_FALSE_GROUP: "question/1",
      NUMERIC: "question/2", CLOZE: "question/3", MATCHING: "question/3",
    });
    assert.deepEqual(versions, INTERNAL_SCHEMA_BY_TYPE);
  });

  it("asks for an explanation asset version when an image appears in the explanation", () => {
    const document = validateQuestionSet(readJson("valid/images-shared-and-multiple.json"), { assets: CATALOG }).value!;
    const question = structuredClone(document.questions[0]) as any;
    question.explanation.push({ type: "image", asset_id: "IMG-GEO-000124", alt: "Hình trong lời giải" });
    const seen: string[] = [];
    toInternalParts(question, (id, purpose) => { seen.push(`${id}:${purpose}`); return ASSET_UUID; });
    assert.deepEqual(seen, ["IMG-GEO-000123:QUESTION", "IMG-GEO-000124:EXPLANATION"]);
  });

  it("resolves each image asset id through the supplied resolver and refuses unresolved requests", () => {
    const document = validateQuestionSet(readJson("valid/images-shared-and-multiple.json"), { assets: CATALOG }).value!;
    const resolved: string[] = [];
    toInternalParts(document.questions[1] as ExchangeQuestion, (id, purpose) => { resolved.push(`${id}:${purpose}`); return ASSET_UUID; });
    assert.deepEqual(resolved, ["IMG-GEO-000123:QUESTION", "IMG-GEO-000124:QUESTION"]);
    const needed = validateQuestionSet(readJson("valid/image-needed.json")).value!;
    assert.throws(() => toInternalParts(needed.questions[0] as ExchangeQuestion, () => ASSET_UUID), /no registered asset/);
  });
  it("maps passage blocks, including images, onto the stimulus content shape", () => {
    const document = validateQuestionSet(readJson("valid/reading-passage.json")).value!;
    const passage = { ...document.passages[0], content_blocks: [...document.passages[0].content_blocks,
      { type: "image" as const, asset_id: "IMG-GEO-000123", alt: "Hình trong bài đọc", caption: "Hình 1" }] };
    const seen: string[] = [];
    const content = passageContent(passage, (id, purpose) => { seen.push(`${id}:${purpose}`); return ASSET_UUID; }) as Array<Record<string, unknown>>;
    assert.deepEqual(seen, ["IMG-GEO-000123:QUESTION"], "a passage image is always question-visible");
    assert.equal(content[0].type, "text");
    assert.deepEqual(content[1], { type: "image", assetVersionId: ASSET_UUID, alt: "Hình trong bài đọc", caption: "Hình 1" });
  });
});
