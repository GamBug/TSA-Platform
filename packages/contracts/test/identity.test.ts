import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  canonicalize,
  computeDuplicateFingerprint,
  computeQuestionIdentity,
  createReferenceHash,
  type JsonValue,
  type ReferenceKind,
  type ReferenceNode,
} from "../src/identity.ts";
import type { QuestionVersion } from "../src/index.ts";

const ids = {
  question: "11111111-1111-4111-8111-111111111111",
  stable: "22222222-2222-4222-8222-222222222222",
  taxonomy: "33333333-3333-4333-8333-333333333333",
  stimulus: "44444444-4444-4444-8444-444444444444",
  assetA: "55555555-5555-4555-8555-555555555555",
  assetB: "66666666-6666-4666-8666-666666666666",
};

type NodeSpec = {
  kind: ReferenceKind;
  id: string;
  payload: Record<string, JsonValue>;
  references?: Array<{ kind: ReferenceKind; id: string }>;
};

function validQuestion(): QuestionVersion {
  return {
    schemaVersion: "question/1",
    id: ids.question,
    questionId: ids.stable,
    versionNo: 1,
    parentVersionId: null,
    language: "vi-VN",
    section: "MATH",
    taxonomyVersionId: ids.taxonomy,
    domainId: "algebra",
    skillIds: ["linear-equations"],
    subskillIds: ["one-variable"],
    cognitiveLevel: "M2",
    difficulty: { target: "MEDIUM", predicted: null, empiricalStudyId: null },
    content: [
      { type: "text", text: "  Cafe\u0301\tproblem  " },
      { type: "math", tex: " x + 2 = 5 ", display: true, accessibleText: "x plus 2 equals 5" },
    ],
    stimulusVersionId: null,
    interaction: {
      type: "SINGLE_CHOICE",
      options: [
        { id: "option-a", content: [{ type: "text", text: "2" }] },
        { id: "option-b", content: [{ type: "text", text: "3" }] },
      ],
    },
    private: {
      answerKey: { type: "SINGLE_CHOICE", optionId: "option-b" },
      explanation: [{ type: "text", text: "Subtract 2 from both sides." }],
      evidenceRefs: ["evidence-1"],
      scoringPolicy: "practice-binary-v1",
    },
    origin: "MANUAL",
    provenanceIds: ["provenance-1"],
    generationRunId: null,
    createdBy: "author-1",
    createdAt: "2026-10-17T08:00:00Z",
    contentHash: "sha256:placeholder",
  };
}

function materialize(specs: NodeSpec[]): ReferenceNode[] {
  const byKey = new Map(specs.map((spec) => [spec.kind + "\u0000" + spec.id, spec]));
  const hashes = new Map<string, string>();
  const active = new Set<string>();
  const hash = (spec: NodeSpec): string => {
    const key = spec.kind + "\u0000" + spec.id;
    const existing = hashes.get(key);
    if (existing) return existing;
    assert.equal(active.has(key), false, "test graph must be acyclic");
    active.add(key);
    const references = (spec.references ?? []).map((reference) => {
      const child = byKey.get(reference.kind + "\u0000" + reference.id);
      assert.ok(child, "test graph dependency exists");
      return { ...reference, contentHash: hash(child) };
    });
    const result = createReferenceHash({ ...spec, references });
    active.delete(key);
    hashes.set(key, result);
    return result;
  };
  return specs.map((spec) => ({
    ...spec,
    references: spec.references ?? [],
    contentHash: hash(spec),
  }));
}

function leafNodes(extra: NodeSpec[] = []): ReferenceNode[] {
  return materialize([
    { kind: "taxonomy", id: ids.taxonomy, payload: { code: "algebra" } },
    { kind: "provenance", id: "provenance-1", payload: { method: "manual", rightsEvidence: { historicalState: "reviewed" } } },
    { kind: "evidence", id: "evidence-1", payload: { sourceVersion: "source-v1", state: "captured" } },
    ...extra,
  ]);
}

function digest(bytes: Uint8Array): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

function text(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

describe("identity/1 canonical JSON", () => {
  it("uses UTF-16 property ordering and ECMAScript number formatting", () => {
    assert.equal(text(canonicalize({ "\u{10000}": 1, "\ue000": 2, z: 1e21, a: 1e-7 })), "{\"a\":1e-7,\"z\":1e+21,\"𐀀\":1,\"\":2}");
  });

  it("rejects unsupported JSON, lone surrogates, getters, sparse arrays and non-plain prototypes", () => {
    assert.throws(() => canonicalize({ value: undefined }), /supported JSON/);
    assert.throws(() => canonicalize({ value: Number.POSITIVE_INFINITY }), /finite/);
    assert.throws(() => canonicalize({ value: "\ud800" }), /surrogate/);
    assert.throws(() => canonicalize(new Date()), /plain JSON/);
    assert.throws(() => canonicalize(Array(1)), /Sparse arrays/);
    const getter = Object.defineProperty({}, "value", { enumerable: true, get: () => 1 });
    assert.throws(() => canonicalize(getter), /Accessors/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.throws(() => canonicalize(cyclic), /Cyclic/);
  });
});

describe("identity/1 reference graph and question identity", () => {
  it("matches literal identity bytes and digest", () => {
    const result = computeQuestionIdentity(validQuestion(), leafNodes());
    assert.equal(text(result.bytes), "{\"canonicalizationVersion\":\"identity/1\",\"question\":{\"cognitiveLevel\":\"M2\",\"content\":[{\"text\":\"  Café\\tproblem  \",\"type\":\"text\"},{\"accessibleText\":\"x plus 2 equals 5\",\"display\":true,\"tex\":\" x + 2 = 5 \",\"type\":\"math\"}],\"createdAt\":\"2026-10-17T08:00:00Z\",\"createdBy\":\"author-1\",\"difficulty\":{\"empiricalStudyId\":null,\"predicted\":null,\"target\":\"MEDIUM\"},\"domainId\":\"algebra\",\"generationRunId\":null,\"id\":\"11111111-1111-4111-8111-111111111111\",\"interaction\":{\"options\":[{\"content\":[{\"text\":\"2\",\"type\":\"text\"}],\"id\":\"option-a\"},{\"content\":[{\"text\":\"3\",\"type\":\"text\"}],\"id\":\"option-b\"}],\"type\":\"SINGLE_CHOICE\"},\"language\":\"vi-VN\",\"origin\":\"MANUAL\",\"parentVersionId\":null,\"private\":{\"answerKey\":{\"optionId\":\"option-b\",\"type\":\"SINGLE_CHOICE\"},\"evidenceRefs\":[\"evidence-1\"],\"explanation\":[{\"text\":\"Subtract 2 from both sides.\",\"type\":\"text\"}],\"scoringPolicy\":\"practice-binary-v1\"},\"provenanceIds\":[\"provenance-1\"],\"questionId\":\"22222222-2222-4222-8222-222222222222\",\"schemaVersion\":\"question/1\",\"section\":\"MATH\",\"skillIds\":[\"linear-equations\"],\"stimulusVersionId\":null,\"subskillIds\":[\"one-variable\"],\"taxonomyVersionId\":\"33333333-3333-4333-8333-333333333333\",\"versionNo\":1},\"references\":[{\"contentHash\":\"sha256:d2cd2b50b5c8e8e36dba968f5bf2433db7bc13464cb54351b5cdf745c111bd90\",\"id\":\"evidence-1\",\"kind\":\"evidence\"},{\"contentHash\":\"sha256:718f185463f2fed208fdbc692536d1580436ed170ef71cb9a732f565d2f19d8d\",\"id\":\"provenance-1\",\"kind\":\"provenance\"},{\"contentHash\":\"sha256:1f6752aeb36134116d2bcc7c0bf6c164ba055564cdd4ede20bcad907fd42313f\",\"id\":\"33333333-3333-4333-8333-333333333333\",\"kind\":\"taxonomy\"}]}");
    assert.equal(result.contentHash, "sha256:1d5c299ab17cc3c5d9bbb49d8c9aeab72fbafa179157d7b47545ca20f946e0ba");
    assert.equal(digest(result.bytes), "sha256:1d5c299ab17cc3c5d9bbb49d8c9aeab72fbafa179157d7b47545ca20f946e0ba");
  });

  it("preserves the input, excludes its advertised contentHash, and changes with authored content", () => {
    const question = validQuestion();
    const before = structuredClone(question);
    const refs = leafNodes();
    const first = computeQuestionIdentity(question, refs);
    question.contentHash = "sha256:another-valid-placeholder";
    assert.deepEqual(question, { ...before, contentHash: "sha256:another-valid-placeholder" });
    assert.deepEqual(computeQuestionIdentity(question, refs), first);

    const edited = structuredClone(question);
    edited.content[0] = { type: "text", text: "Different authored question" };
    assert.notDeepEqual(computeQuestionIdentity(edited, refs), first);
    assert.equal(question.content[0]?.type, "text");
    if (question.content[0]?.type === "text") assert.equal(question.content[0].text, "  Cafe\u0301\tproblem  ");
  });

  it("rejects missing, extra, duplicated, conflicting, cyclic and operational graph data", () => {
    const question = validQuestion();
    const refs = leafNodes();
    assert.throws(() => computeQuestionIdentity(question, refs.slice(1)), /Missing required/);
    assert.throws(() => computeQuestionIdentity(question, [...refs, refs[0]!]), /Duplicate reference node/);
    assert.throws(() => computeQuestionIdentity(question, [...refs, materialize([
      { kind: "source", id: "unused", payload: {} },
    ])[0]!]), /unreachable extra/);

    const mismatched = structuredClone(refs);
    mismatched[0]!.contentHash = "sha256:" + "0".repeat(64);
    assert.throws(() => computeQuestionIdentity(question, mismatched), /contentHash mismatch/);

    const duplicateEdge = structuredClone(refs);
    duplicateEdge[0]!.references = [
      { kind: "provenance", id: "provenance-1" },
      { kind: "provenance", id: "provenance-1" },
    ];
    assert.throws(() => computeQuestionIdentity(question, duplicateEdge), /duplicate edge/);
    assert.throws(() => createReferenceHash({
      kind: "taxonomy",
      id: ids.taxonomy,
      payload: {},
      references: [
        { kind: "source", id: "source-1", contentHash: "sha256:" + "0".repeat(64) },
        { kind: "source", id: "source-1", contentHash: "sha256:" + "0".repeat(64) },
      ],
    }), /duplicate edges/);

    const cyclic: ReferenceNode[] = [
      { kind: "taxonomy", id: ids.taxonomy, payload: {}, references: [{ kind: "source", id: "s" }], contentHash: "sha256:" + "0".repeat(64) },
      { kind: "source", id: "s", payload: {}, references: [{ kind: "taxonomy", id: ids.taxonomy }], contentHash: "sha256:" + "0".repeat(64) },
      ...refs.slice(1),
    ];
    assert.throws(() => computeQuestionIdentity(question, cyclic), /cycle/);

    const selfParent = { ...question, parentVersionId: question.id };
    assert.throws(() => computeQuestionIdentity(selfParent, refs), /reference itself/);
    const selfNode = materialize([
      { kind: "taxonomy", id: ids.taxonomy, payload: {} },
      { kind: "provenance", id: "provenance-1", payload: {}, references: [{ kind: "question", id: ids.question }] },
      { kind: "evidence", id: "evidence-1", payload: {} },
      { kind: "question", id: ids.question, payload: {} },
    ]);
    assert.throws(() => computeQuestionIdentity(question, selfNode), /root question identity/);

    const operational = structuredClone(refs);
    operational[0]!.payload = { workflowState: "draft" };
    assert.throws(() => computeQuestionIdentity(question, operational), /operational key/);
    assert.doesNotThrow(() => computeQuestionIdentity(question, materialize([
      { kind: "taxonomy", id: ids.taxonomy, payload: { code: "algebra" } },
      { kind: "provenance", id: "provenance-1", payload: {}, references: [{ kind: "source", id: "source-1" }] },
      { kind: "evidence", id: "evidence-1", payload: {} },
      { kind: "source", id: "source-1", payload: { state: "captured", rightsEvidence: { state: "historical" } } },
    ])));
  });

  it("enforces node, graph-depth and canonical-byte bounds", () => {
    const question = validQuestion();
    const node = leafNodes()[0]!;
    assert.throws(() => computeQuestionIdentity(question, Array.from({ length: 2_001 }, (_, index) => ({ ...node, id: "n-" + index }))), /2,000 nodes/);

    const chain: NodeSpec[] = [];
    for (let index = 0; index < 65; index += 1) {
      chain.push({
        kind: index === 64 ? "taxonomy" : "source",
        id: index === 64 ? ids.taxonomy : "source-" + index,
        payload: {},
        ...(index < 64
          ? { references: [index === 63
            ? { kind: "taxonomy" as const, id: ids.taxonomy }
            : { kind: "source" as const, id: "source-" + (index + 1) }] }
          : {}),
      });
    }
    const deepGraph = materialize([
      ...chain,
      { kind: "provenance", id: "provenance-1", payload: {} },
      { kind: "evidence", id: "evidence-1", payload: {} },
    ]);
    assert.throws(() => computeQuestionIdentity(question, deepGraph), /depth exceeds 64/);
    assert.throws(() => computeQuestionIdentity(question, [...deepGraph].reverse()), /depth exceeds 64/);

    const deepLimitGraph: ReferenceNode[] = [
      {
        kind: "taxonomy",
        id: ids.taxonomy,
        payload: {},
        references: [{ kind: "source", id: "source-0" }],
        contentHash: "sha256:" + "0".repeat(64),
      },
      ...Array.from({ length: 1_997 }, (_, index) => ({
        kind: "source" as const,
        id: "source-" + index,
        payload: {},
        references: index < 1_996 ? [{ kind: "source" as const, id: "source-" + (index + 1) }] : [],
        contentHash: "sha256:" + "0".repeat(64),
      })),
      { kind: "provenance", id: "provenance-1", payload: {}, references: [], contentHash: "sha256:" + "0".repeat(64) },
      { kind: "evidence", id: "evidence-1", payload: {}, references: [], contentHash: "sha256:" + "0".repeat(64) },
    ];
    assert.throws(() => computeQuestionIdentity(question, deepLimitGraph), (error: unknown) =>
      error instanceof TypeError && /depth exceeds 64/.test(error.message),
    );

    const oversized = materialize([
      { kind: "taxonomy", id: ids.taxonomy, payload: { bytes: "x".repeat(8 * 1024 * 1024) } },
      { kind: "provenance", id: "provenance-1", payload: {} },
      { kind: "evidence", id: "evidence-1", payload: {} },
    ]);
    assert.throws(() => computeQuestionIdentity(question, oversized), /exceeds 8 MiB/);
  });
});

describe("fingerprint/1 duplicate review signal", () => {
  it("matches literal fingerprint bytes and digest", () => {
    const result = computeDuplicateFingerprint(validQuestion(), leafNodes());
    assert.equal(text(result.bytes), "{\"content\":[{\"text\":\"Café problem\",\"type\":\"text\"},{\"accessibleText\":\"x plus 2 equals 5\",\"display\":true,\"tex\":\" x + 2 = 5 \",\"type\":\"math\"}],\"fingerprintVersion\":\"fingerprint/1\",\"interaction\":{\"options\":[{\"content\":[{\"text\":\"2\",\"type\":\"text\"}]},{\"content\":[{\"text\":\"3\",\"type\":\"text\"}]}],\"type\":\"SINGLE_CHOICE\"},\"stimulus\":null}");
    assert.equal(result.fingerprint, "sha256:e82bab110128b069038a500ecff91c6a872a1959d62eaa27768a8fe7db802309");
    assert.equal(digest(result.bytes), "sha256:e82bab110128b069038a500ecff91c6a872a1959d62eaa27768a8fe7db802309");
  });

  it("normalizes human strings, preserves TeX, omits private metadata and option IDs", () => {
    const question = validQuestion();
    const nodes = leafNodes();
    const before = computeDuplicateFingerprint(question, nodes);
    const edited = structuredClone(question);
    if (edited.interaction.type !== "SINGLE_CHOICE") throw new Error("fixture interaction must be single choice");
    edited.createdBy = "another-author";
    edited.createdAt = "2026-10-18T08:00:00Z";
    edited.private.answerKey = { type: "SINGLE_CHOICE", optionId: "new-b" };
    edited.private.explanation = [{ type: "text", text: "different private rationale" }];
    edited.interaction.options[0]!.id = "new-a";
    edited.interaction.options[1]!.id = "new-b";
    edited.content[0] = { type: "text", text: "Caf\u00e9 problem" };
    edited.content[1] = { type: "math", tex: " x + 2 = 5 ", display: true, accessibleText: "x plus 2 equals 5" };
    assert.equal(computeDuplicateFingerprint(edited, nodes).fingerprint, before.fingerprint);

    edited.content[1] = { type: "math", tex: "x+2=5", display: true, accessibleText: "x plus 2 equals 5" };
    assert.notEqual(computeDuplicateFingerprint(edited, nodes).fingerprint, before.fingerprint);
    edited.interaction.options.reverse();
    assert.notEqual(computeDuplicateFingerprint(edited, nodes).fingerprint, before.fingerprint);
    if (question.interaction.type !== "SINGLE_CHOICE") throw new Error("fixture interaction must be single choice");
    assert.equal(question.interaction.options[0]?.id, "option-a");
  });

  it("resolves image assets by immutable payload and includes validated stimulus content", () => {
    const base = validQuestion();
    base.content = [{ type: "image", assetVersionId: ids.assetA, alt: "  Figure\u00a0one " }];
    base.stimulusVersionId = ids.stimulus;
    const specs = [
      { kind: "taxonomy" as const, id: ids.taxonomy, payload: { code: "algebra" } },
      { kind: "provenance" as const, id: "provenance-1", payload: {} },
      { kind: "evidence" as const, id: "evidence-1", payload: {} },
      { kind: "asset" as const, id: ids.assetA, payload: { bytesHash: "sha256:raw", mediaType: "image/png" } },
      { kind: "stimulus" as const, id: ids.stimulus, payload: { title: "metadata one", content: [{ type: "text", text: "  Shared\u2003context " }] } },
    ];
    const firstNodes = materialize(specs);
    const first = computeDuplicateFingerprint(base, firstNodes);

    const renamedAssetQuestion = structuredClone(base);
    renamedAssetQuestion.content = [{ type: "image", assetVersionId: ids.assetB, alt: "Figure one" }];
    const renamedNodes = materialize([
      ...specs.filter((entry) => entry.kind !== "asset"),
      { kind: "asset", id: ids.assetB, payload: { bytesHash: "sha256:raw", mediaType: "image/png" } },
    ]);
    assert.equal(computeDuplicateFingerprint(renamedAssetQuestion, renamedNodes).fingerprint, first.fingerprint);

    const changedPayload = materialize([
      ...specs.filter((entry) => entry.kind !== "asset"),
      { kind: "asset", id: ids.assetA, payload: { bytesHash: "sha256:changed", mediaType: "image/png" } },
    ]);
    assert.notEqual(computeDuplicateFingerprint(base, changedPayload).fingerprint, first.fingerprint);

    const changedStimulus = materialize([
      ...specs.filter((entry) => entry.kind !== "stimulus"),
      { kind: "stimulus", id: ids.stimulus, payload: { title: "different authoring metadata", content: [{ type: "text", text: "New context" }] } },
    ]);
    assert.notEqual(computeDuplicateFingerprint(base, changedStimulus).fingerprint, first.fingerprint);
    const metadataOnlyStimulus = materialize([
      ...specs.filter((entry) => entry.kind !== "stimulus"),
      { kind: "stimulus", id: ids.stimulus, payload: { title: "different authoring metadata", content: [{ type: "text", text: "  Shared\u2003context " }] } },
    ]);
    assert.equal(computeDuplicateFingerprint(base, metadataOnlyStimulus).fingerprint, first.fingerprint);
    assert.throws(() => computeDuplicateFingerprint(base, materialize([
      ...specs.filter((entry) => entry.kind !== "stimulus"),
      { kind: "stimulus", id: ids.stimulus, payload: { title: "missing content" } },
    ])), /include content blocks/);
    assert.throws(() => computeDuplicateFingerprint(base, materialize([
      ...specs.filter((entry) => entry.kind !== "stimulus"),
      { kind: "stimulus", id: ids.stimulus, payload: { content: [] } },
    ])), /Too small/);
  });
});
