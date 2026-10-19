import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { FactoryCandidateSchema } from "../src/index.ts";
import { computeQuestionIdentity, createReferenceHash, type ReferenceNode } from "../src/identity.ts";
import {
  createDraftReceiptsV2,
  parseFactoryPackageV2,
  RightsEvidenceRecordSchema,
  validateFactoryPackageV2,
  type FactoryPackageV2,
} from "../src/factory-package-v2.ts";
import { buildSyntheticFactoryPackageV2 } from "./fixtures/factory-package-v2.ts";

const candidate = (packageV2: FactoryPackageV2, index = 0) => packageV2.candidates[index]!;
const node = (packageV2: FactoryPackageV2, kind: string, id: string) =>
  packageV2.references.find((entry) => entry.kind === kind && entry.id === id)!;

function refreshSingleCandidatePackage(packageV2: FactoryPackageV2): void {
  const nodes = packageV2.references as unknown as ReferenceNode[];
  const nodeMap = new Map(nodes.map((entry) => [entry.kind + "\u0000" + entry.id, entry]));
  const hashes = new Map<string, string>();
  const active = new Set<string>();
  const refreshNode = (entry: ReferenceNode): string => {
    const key = entry.kind + "\u0000" + entry.id;
    const cached = hashes.get(key);
    if (cached) return cached;
    if (active.has(key)) throw new Error("Synthetic test graph unexpectedly contains a cycle");
    active.add(key);
    const references = entry.references.map((reference) => {
      const child = nodeMap.get(reference.kind + "\u0000" + reference.id);
      if (!child) throw new Error("Synthetic test graph unexpectedly has a missing reference");
      return { ...reference, contentHash: refreshNode(child) };
    });
    entry.contentHash = createReferenceHash({ kind: entry.kind, id: entry.id, payload: entry.payload, references });
    active.delete(key);
    hashes.set(key, entry.contentHash);
    return entry.contentHash;
  };
  for (const entry of nodes) refreshNode(entry);
  for (const item of packageV2.candidates) {
    const identity = computeQuestionIdentity(item.question, nodes);
    item.contentHash = identity.contentHash;
    item.question.contentHash = identity.contentHash;
    for (const validation of item.validations) validation.inputHash = identity.contentHash;
  }
}

function expectInvalid(packageV2: unknown, pattern: RegExp): void {
  assert.throws(() => createDraftReceiptsV2(packageV2), pattern);
}

function runNode(source: string, input?: string) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", source],
    { cwd: process.cwd(), encoding: "utf8", input, timeout: 15_000, maxBuffer: 20 * 1024 * 1024 },
  );
}

test("validates the complete package before returning DRAFT receipts", () => {
  const packageV2 = buildSyntheticFactoryPackageV2({ withAsset: true, withStimulus: true });
  const validated = validateFactoryPackageV2(packageV2);
  const receipts = createDraftReceiptsV2(packageV2);

  assert.equal(validated.candidates.length, 1);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]!.workflowState, "DRAFT");
  assert.equal(receipts[0]!.inputHash, candidate(packageV2).contentHash);
  assert.notEqual(receipts[0]!.inputHash, candidate(packageV2).run.inputHash);
});

test("preserves PASS, FAIL and INCONCLUSIVE as draft evidence without promoting any receipt", () => {
  for (const outcome of ["PASS", "FAIL", "INCONCLUSIVE"] as const) {
    const packageV2 = buildSyntheticFactoryPackageV2({ validationOutcome: outcome });
    assert.equal(candidate(validateFactoryPackageV2(packageV2)).validations[0]!.outcome, outcome);
    assert.equal(createDraftReceiptsV2(packageV2)[0]!.workflowState, "DRAFT");
  }
});

test("accepts a complete same-identity parent chain with decreasing version numbers", () => {
  const packageV2 = buildSyntheticFactoryPackageV2({ withParent: true });
  const validated = validateFactoryPackageV2(packageV2);
  const parent = node(packageV2, "question", candidate(packageV2).question.parentVersionId!);

  assert.equal(candidate(validated).question.versionNo, 2);
  assert.equal(parent.payload.questionId, candidate(packageV2).question.questionId);
  assert.equal(Object.hasOwn(parent.payload, "contentHash"), false);
});

test("resolves provenance and image dependencies unique to a stimulus or historical parent", () => {
  const packageV2 = buildSyntheticFactoryPackageV2({
    withStimulus: true,
    withDistinctStimulusProvenance: true,
    withParent: true,
    withDistinctParentProvenance: true,
    withParentOnlyAsset: true,
  });
  const validated = validateFactoryPackageV2(packageV2);

  assert.equal(validated.candidates.length, 1);
  assert.equal(validated.assets.length, 1);
  assert.ok(validated.rightsEvidence.some((record) => record.id === "synthetic-stimulus-rights-attestation-2"));
  assert.ok(validated.rightsEvidence.some((record) => record.id === "synthetic-parent-rights-attestation-3"));
  assert.equal(createDraftReceiptsV2(packageV2)[0]!.workflowState, "DRAFT");
});

test("rejects unknown fields, approval claims, and V1-shaped packages", () => {
  const unknown = buildSyntheticFactoryPackageV2() as FactoryPackageV2 & { unexpected?: string };
  unknown.unexpected = "not part of factory-package/2";
  expectInvalid(unknown, /unrecognized key/i);

  const approved = buildSyntheticFactoryPackageV2() as FactoryPackageV2 & { workflowState?: string };
  approved.workflowState = "APPROVED";
  expectInvalid(approved, /unrecognized key/i);

  const v1Candidate = candidate(buildSyntheticFactoryPackageV2());
  assert.equal(FactoryCandidateSchema.parse(v1Candidate).itemKey, v1Candidate.itemKey);
  assert.throws(() => parseFactoryPackageV2(v1Candidate), /schemaVersion|unrecognized key/i);

  const unknownNode = buildSyntheticFactoryPackageV2();
  unknownNode.references.push({
    kind: "unsupported-kind",
    id: "unknown-node",
    payload: {},
    references: [],
    contentHash: "sha256:" + "0".repeat(64),
  } as unknown as FactoryPackageV2["references"][number]);
  expectInvalid(unknownNode, /unsupported-kind|Invalid option/i);
});

test("enforces declared candidate and reference-node bounds", () => {
  const tooManyCandidates = buildSyntheticFactoryPackageV2();
  tooManyCandidates.candidates = Array.from({ length: 101 }, () => structuredClone(candidate(tooManyCandidates)));
  expectInvalid(tooManyCandidates, /Too big|maximum|100/i);

  const tooManyReferences = buildSyntheticFactoryPackageV2();
  const firstNode = structuredClone(tooManyReferences.references[0]!);
  tooManyReferences.references = Array.from({ length: 2_001 }, () => structuredClone(firstNode));
  expectInvalid(tooManyReferences, /Too big|maximum|2000/i);
});

test("rejects candidate identity, validation binding, run binding, and source-list mismatches", () => {
  const hashMismatch = buildSyntheticFactoryPackageV2();
  candidate(hashMismatch).contentHash = "sha256:" + "f".repeat(64);
  candidate(hashMismatch).question.contentHash = candidate(hashMismatch).contentHash;
  expectInvalid(hashMismatch, /Candidate contentHash does not match computed/);

  const validationMismatch = buildSyntheticFactoryPackageV2();
  candidate(validationMismatch).validations[0]!.inputHash = "sha256:" + "f".repeat(64);
  expectInvalid(validationMismatch, /Validation evidence inputHash/);

  const runMismatch = buildSyntheticFactoryPackageV2();
  candidate(runMismatch).run.generationRunId = null;
  expectInvalid(runMismatch, /generationRunId must agree/);

  const sourceMismatch = buildSyntheticFactoryPackageV2();
  candidate(sourceMismatch).run.sourceVersionIds = [];
  expectInvalid(sourceMismatch, /sourceVersionIds must equal/);
});

test("rejects malformed source, provenance, rights and stimulus bindings", () => {
  const provenanceMismatch = buildSyntheticFactoryPackageV2();
  candidate(provenanceMismatch).provenance[0]!.transformation = "changed after hashing";
  expectInvalid(provenanceMismatch, /Provenance-node payload mismatch|Reference contentHash mismatch/);

  const rightsMismatch = buildSyntheticFactoryPackageV2();
  rightsMismatch.rightsEvidence[0]!.state = "OWNED";
  expectInvalid(rightsMismatch, /Evidence-node payload differs/);

  const missingProvenanceEdge = buildSyntheticFactoryPackageV2();
  node(missingProvenanceEdge, "provenance", candidate(missingProvenanceEdge).question.provenanceIds[0]!).references.pop();
  expectInvalid(missingProvenanceEdge, /exactly its required identity roots|missing explicit/);

  const stimulusMismatch = buildSyntheticFactoryPackageV2({ withStimulus: true });
  node(stimulusMismatch, "stimulus", "44444444-4444-4444-8444-444444444444").references.pop();
  expectInvalid(stimulusMismatch, /exactly its required identity roots|missing explicit/);

  const malformedSource = buildSyntheticFactoryPackageV2();
  node(malformedSource, "source", "synthetic-source-version-1").payload.unexpected = true;
  expectInvalid(malformedSource, /Source node .* must have \{title,content\} payload/);
});

test("rejects duplicate candidate-version and asset-member IDs", () => {
  const duplicateCandidateId = buildSyntheticFactoryPackageV2({ candidateCount: 2 });
  candidate(duplicateCandidateId, 1).question.id = candidate(duplicateCandidateId).question.id;
  expectInvalid(duplicateCandidateId, /Duplicate question-version ID/);

  const duplicateAsset = buildSyntheticFactoryPackageV2({ withAsset: true });
  duplicateAsset.assets.push(structuredClone(duplicateAsset.assets[0]!));
  expectInvalid(duplicateAsset, /Duplicate asset ID/);
});

test("rejects cross-identity, nondecreasing, incomplete and contentHash-bearing parents", () => {
  const crossIdentity = buildSyntheticFactoryPackageV2({ withParent: true });
  const crossParent = node(crossIdentity, "question", candidate(crossIdentity).question.parentVersionId!);
  crossParent.payload.questionId = "88888888-8888-4888-8888-888888888888";
  expectInvalid(crossIdentity, /same questionId/);

  const nondecreasing = buildSyntheticFactoryPackageV2({ withParent: true });
  const highParent = node(nondecreasing, "question", candidate(nondecreasing).question.parentVersionId!);
  highParent.payload.versionNo = candidate(nondecreasing).question.versionNo;
  expectInvalid(nondecreasing, /versionNo must be lower/);

  const incomplete = buildSyntheticFactoryPackageV2({ withParent: true });
  const incompleteParent = node(incomplete, "question", candidate(incomplete).question.parentVersionId!);
  incompleteParent.references = incompleteParent.references.filter((reference) => reference.kind !== "taxonomy");
  expectInvalid(incomplete, /exactly its required identity roots/);

  const extraHash = buildSyntheticFactoryPackageV2({ withParent: true });
  const hashParent = node(extraHash, "question", candidate(extraHash).question.parentVersionId!);
  hashParent.payload.contentHash = "sha256:" + "0".repeat(64);
  expectInvalid(extraHash, /omit contentHash/);
});

test("rejects malformed or unused asset members before receipt creation", () => {
  const noncanonical = buildSyntheticFactoryPackageV2({ withAsset: true });
  noncanonical.assets[0]!.bytesBase64 += "A";
  expectInvalid(noncanonical, /canonical base64/);

  const invalidMagic = buildSyntheticFactoryPackageV2({ withAsset: true });
  invalidMagic.assets[0]!.bytesBase64 = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString("base64");
  const invalidMagicBytes = Buffer.from(invalidMagic.assets[0]!.bytesBase64, "base64");
  const invalidMagicHash = "sha256:" + createHash("sha256").update(invalidMagicBytes).digest("hex");
  invalidMagic.assets[0]!.bytesHash = invalidMagicHash;
  node(invalidMagic, "asset", invalidMagic.assets[0]!.assetVersionId).payload.bytesHash = invalidMagicHash;
  refreshSingleCandidatePackage(invalidMagic);
  expectInvalid(invalidMagic, /mediaType does not match its magic bytes/);

  const unused = buildSyntheticFactoryPackageV2({ withAsset: true });
  unused.assets = [];
  expectInvalid(unused, /Missing asset member/);
});

test("requires new rights timestamps to be strict ISO datetimes with offsets", () => {
  const record = buildSyntheticFactoryPackageV2().rightsEvidence[0]!;
  assert.equal(RightsEvidenceRecordSchema.parse(record).id, record.id);
  assert.equal(RightsEvidenceRecordSchema.safeParse({ ...record, validFrom: "October 19, 2026 00:00:00+00:00" }).success, false);

  const missingGenerate = buildSyntheticFactoryPackageV2();
  missingGenerate.rightsEvidence[0]!.allowedUses = ["DISPLAY"];
  expectInvalid(missingGenerate, /must allow GENERATE/);

  const reversedDates = buildSyntheticFactoryPackageV2();
  reversedDates.rightsEvidence[0]!.validFrom = "2027-01-01T00:00:00Z";
  reversedDates.rightsEvidence[0]!.validUntil = "2026-01-01T00:00:00Z";
  expectInvalid(reversedDates, /must not precede validFrom/);
});

test("rejects malformed later candidates without producing partial consumer output", () => {
  const packageV2 = buildSyntheticFactoryPackageV2({ candidateCount: 2 });
  candidate(packageV2, 1).validations[0]!.inputHash = "sha256:" + "f".repeat(64);
  const source = [
    'import { createDraftReceiptsV2 } from "./packages/contracts/src/factory-package-v2.ts";',
    'let text = ""; for await (const chunk of process.stdin) text += chunk;',
    'const receipts = createDraftReceiptsV2(JSON.parse(text)); process.stdout.write(JSON.stringify(receipts));',
  ].join("\n");
  const result = runNode(source, JSON.stringify(packageV2));

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Validation evidence inputHash/);
});

test("round-trips through independent producer and consumer processes", () => {
  const producer = runNode([
    'import { buildSyntheticFactoryPackageV2 } from "./packages/contracts/test/fixtures/factory-package-v2.ts";',
    'process.stdout.write(JSON.stringify(buildSyntheticFactoryPackageV2({ withAsset: true, withStimulus: true })));',
  ].join("\n"));
  assert.equal(producer.error, undefined);
  assert.equal(producer.status, 0, producer.stderr);

  const consumer = runNode([
    'import { createDraftReceiptsV2 } from "./packages/contracts/src/factory-package-v2.ts";',
    'let text = ""; for await (const chunk of process.stdin) text += chunk;',
    'process.stdout.write(JSON.stringify(createDraftReceiptsV2(JSON.parse(text))));',
  ].join("\n"), producer.stdout);
  assert.equal(consumer.error, undefined);
  assert.equal(consumer.status, 0, consumer.stderr);
  const receipts = JSON.parse(consumer.stdout) as Array<{ workflowState: string }>;
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]!.workflowState, "DRAFT");
});
