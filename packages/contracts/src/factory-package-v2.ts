import { createHash } from "node:crypto";
import { z } from "zod";

import {
  BankImportReceiptSchema,
  BlockSchema,
  FactoryCandidateProvenanceSchema,
  FactoryCandidateSchema,
  QuestionVersionSchema,
  type BankImportReceipt,
  type FactoryCandidateProvenance,
  type QuestionVersion,
} from "./index.ts";
import { canonicalize, computeQuestionIdentity, type ReferenceKind, type ReferenceNode } from "./identity.ts";

const MAX_CANDIDATES = 100;
const MAX_REFERENCE_NODES = 2_000;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const MAX_TRANSPORT_BYTES = 16 * 1024 * 1024;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 8 * 1024 * 1024;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REFERENCE_KINDS = ["taxonomy", "question", "stimulus", "asset", "provenance", "evidence", "source"] as const;
const ASSET_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const RIGHTS_STATES = ["OWNED", "LICENSED", "OPEN_LICENSE", "PUBLIC_DOMAIN"] as const;
const ALLOWED_USES = ["DISPLAY", "ADAPT", "GENERATE", "TRAIN"] as const;
const BlockListSchema = z.array(BlockSchema).min(1).max(100);

function nonEmpty(value: string) {
  return value.trim().length > 0;
}

const InstantSchema = z.iso.datetime({ offset: true });

export const ReferenceNodeV2Schema = z.object({
  kind: z.enum(REFERENCE_KINDS),
  id: z.string().refine(nonEmpty, "Expected a non-empty identifier"),
  payload: z.record(z.string(), z.unknown()),
  references: z.array(z.object({
    kind: z.enum(REFERENCE_KINDS),
    id: z.string().refine(nonEmpty, "Expected a non-empty identifier"),
  }).strict()),
  contentHash: z.string().regex(HASH_PATTERN),
}).strict();

export const AssetMemberSchema = z.object({
  assetVersionId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID"),
  mediaType: z.enum(ASSET_MEDIA_TYPES),
  byteLength: z.number().int().min(1).max(MAX_ASSET_BYTES),
  bytesHash: z.string().regex(HASH_PATTERN),
  bytesBase64: z.string().min(1),
}).strict();
export type AssetMember = z.infer<typeof AssetMemberSchema>;

export const RightsEvidenceRecordSchema = z.object({
  id: z.string().refine(nonEmpty, "Expected a non-empty identifier"),
  sourceVersionId: z.string().refine(nonEmpty, "Expected a non-empty identifier"),
  state: z.enum(RIGHTS_STATES),
  allowedUses: z.array(z.enum(ALLOWED_USES)).min(1),
  territories: z.array(z.string().refine(nonEmpty, "Expected a non-empty territory")).min(1),
  validFrom: InstantSchema.nullable(),
  validUntil: InstantSchema.nullable(),
  evidence: z.string().refine(nonEmpty, "Expected non-empty rights evidence"),
}).strict().superRefine((record, context) => {
  if (!record.allowedUses.includes("GENERATE")) {
    context.addIssue({ code: "custom", path: ["allowedUses"], message: "Rights evidence must allow GENERATE" });
  }
  if (new Set(record.allowedUses).size !== record.allowedUses.length) {
    context.addIssue({ code: "custom", path: ["allowedUses"], message: "Allowed uses must be unique" });
  }
  if (record.validFrom !== null && record.validUntil !== null && Date.parse(record.validUntil) < Date.parse(record.validFrom)) {
    context.addIssue({ code: "custom", path: ["validUntil"], message: "validUntil must not precede validFrom" });
  }
});
export type RightsEvidenceRecord = z.infer<typeof RightsEvidenceRecordSchema>;

const FactoryPackageV2Schema = z.object({
  schemaVersion: z.literal("factory-package/2"),
  producerNamespace: z.string().trim().min(1),
  batchKey: z.string().trim().min(1),
  candidates: z.array(FactoryCandidateSchema).min(1).max(MAX_CANDIDATES),
  references: z.array(ReferenceNodeV2Schema).max(MAX_REFERENCE_NODES),
  assets: z.array(AssetMemberSchema).max(MAX_REFERENCE_NODES),
  rightsEvidence: z.array(RightsEvidenceRecordSchema).max(MAX_REFERENCE_NODES),
}).strict();
export type FactoryPackageV2 = z.infer<typeof FactoryPackageV2Schema>;

export type FactoryPackageV2DraftReceipt = BankImportReceipt;

type ReferenceKeyV2 = { kind: ReferenceKind; id: string };

function fail(message: string): never {
  throw new TypeError(message);
}

function keyOf(reference: ReferenceKeyV2): string {
  return reference.kind + "\u0000" + reference.id;
}

function compareReference(left: ReferenceKeyV2, right: ReferenceKeyV2): number {
  return left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function verifyReferenceByteLimit(nodes: ReferenceNode[], nodeMap: Map<string, ReferenceNode>): void {
  let total = 0;
  for (const node of nodes) {
    const references = node.references.map((reference) => {
      const target = nodeMap.get(keyOf(reference));
      if (!target) fail("Missing reference " + reference.kind + "/" + reference.id);
      return { ...reference, contentHash: target.contentHash };
    }).sort(compareReference);
    total += canonicalize({
      version: "reference/1",
      kind: node.kind,
      id: node.id,
      payload: node.payload,
      references,
    }).byteLength;
    if (total > MAX_REFERENCE_BYTES) fail("Canonical reference data exceeds 8 MiB");
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalize(left)).equals(Buffer.from(canonicalize(right)));
}

function imageIds(blocks: readonly unknown[]): Set<string> {
  const result = new Set<string>();
  for (const block of blocks) {
    if (block !== null && typeof block === "object" && !Array.isArray(block)) {
      const record = block as Record<string, unknown>;
      if (record.type === "image" && typeof record.assetVersionId === "string") result.add(record.assetVersionId);
    }
  }
  return result;
}

function questionImageIds(question: QuestionVersion): Set<string> {
  const blocks: unknown[] = [...question.content, ...question.private.explanation];
  if (question.interaction.type === "TRUE_FALSE_GROUP") {
    for (const statement of question.interaction.statements) blocks.push(...statement.content);
  } else {
    for (const option of question.interaction.options) blocks.push(...option.content);
  }
  return imageIds(blocks);
}

function requiredRoots(question: QuestionVersion): ReferenceKeyV2[] {
  const roots: ReferenceKeyV2[] = [{ kind: "taxonomy", id: question.taxonomyVersionId }];
  if (question.parentVersionId !== null) roots.push({ kind: "question", id: question.parentVersionId });
  if (question.stimulusVersionId !== null) roots.push({ kind: "stimulus", id: question.stimulusVersionId });
  for (const id of question.provenanceIds) roots.push({ kind: "provenance", id });
  for (const id of question.private.evidenceRefs) roots.push({ kind: "evidence", id });
  for (const id of questionImageIds(question)) roots.push({ kind: "asset", id });
  return roots;
}

const PARENT_QUESTION_HASH_PLACEHOLDER = "sha256:" + "0".repeat(64);

function parseParentQuestion(node: ReferenceNode): QuestionVersion {
  if (Object.hasOwn(node.payload, "contentHash")) {
    fail("Question reference node " + node.id + " must omit contentHash from its immutable projection");
  }
  const parsed = QuestionVersionSchema.safeParse({
    ...node.payload,
    contentHash: PARENT_QUESTION_HASH_PLACEHOLDER,
  });
  if (!parsed.success) fail("Question reference node " + node.id + " is not a full question/1 parent projection");
  if (parsed.data.id !== node.id) fail("Question reference node id must equal payload.id");
  return parsed.data;
}

function ensureExactEdges(node: ReferenceNode, required: readonly ReferenceKeyV2[]): void {
  const expected = new Set(required.map(keyOf));
  const actual = new Set(node.references.map(keyOf));
  if (actual.size !== node.references.length || actual.size !== expected.size || [...expected].some((id) => !actual.has(id))) {
    fail("Question reference node " + node.id + " must list exactly its required identity roots as edges");
  }
}

function validateParentAncestry(
  candidates: FactoryPackageV2["candidates"],
  nodes: ReferenceNode[],
): QuestionVersion[] {
  const parentQuestions = new Map<string, QuestionVersion>();
  for (const node of nodes) {
    if (node.kind !== "question") continue;
    const question = parseParentQuestion(node);
    ensureExactEdges(node, requiredRoots(question));
    parentQuestions.set(question.id, question);
  }

  const ancestors = new Set<string>();
  const checkParent = (child: QuestionVersion, parentId: string): QuestionVersion => {
    if (child.id === parentId) fail("Question version cannot be its own parent");
    const parent = parentQuestions.get(parentId);
    if (!parent) fail("Missing full parent question reference " + parentId);
    if (parent.questionId !== child.questionId) fail("Parent version must have the same questionId as its child");
    if (parent.versionNo >= child.versionNo) fail("Parent versionNo must be lower than its child");
    return parent;
  };

  for (const candidate of candidates) {
    if (parentQuestions.has(candidate.question.id)) {
      fail("Candidate question version must not also appear as a parent reference node");
    }
    let child = candidate.question;
    const visited = new Set<string>([child.id]);
    while (child.parentVersionId !== null) {
      const parentId = child.parentVersionId;
      if (visited.has(parentId)) fail("Question parent ancestry contains a cycle");
      const parent = checkParent(child, parentId);
      visited.add(parent.id);
      ancestors.add(parent.id);
      child = parent;
    }
  }

  for (const node of nodes) {
    if (node.kind !== "question") {
      if (node.references.some((reference) => reference.kind === "question")) {
        fail("Only question-version ancestry may reference question nodes");
      }
      continue;
    }
    const question = parentQuestions.get(node.id)!;
    if (question.parentVersionId !== null) {
      checkParent(question, question.parentVersionId);
    }
    if (!ancestors.has(question.id)) fail("Question reference node is not an ancestor of a candidate");
  }
  if (ancestors.size !== parentQuestions.size) fail("Question reference graph contains a non-ancestor question node");
  return [...parentQuestions.values()];
}

function candidateClosure(
  question: QuestionVersion,
  nodeMap: Map<string, ReferenceNode>,
): ReferenceNode[] {
  const reachable = new Set<string>();
  const pending = [...requiredRoots(question)];
  while (pending.length > 0) {
    const reference = pending.pop()!;
    const id = keyOf(reference);
    if (reachable.has(id)) continue;
    const node = nodeMap.get(id);
    if (!node) fail("Missing required reference " + reference.kind + "/" + reference.id);
    reachable.add(id);
    for (const dependency of node.references) pending.push(dependency);
  }
  return [...reachable].map((id) => nodeMap.get(id)!).sort((left, right) =>
    left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}

function ensureEdges(node: ReferenceNode, required: readonly ReferenceKeyV2[]): void {
  const edges = new Set(node.references.map(keyOf));
  for (const reference of required) {
    if (!edges.has(keyOf(reference))) {
      fail(node.kind + "/" + node.id + " is missing explicit " + reference.kind + "/" + reference.id + " edge");
    }
  }
}

function checkedBlockList(value: unknown, label: string): Array<z.infer<typeof BlockSchema>> {
  const result = BlockListSchema.safeParse(value);
  if (!result.success) fail(label + " must contain valid question/1 blocks");
  return result.data;
}

function parseSourcePayload(node: ReferenceNode): { title: string; content: Array<z.infer<typeof BlockSchema>> } {
  const parsed = z.object({
    title: z.string().trim().min(1),
    content: BlockListSchema,
  }).strict().safeParse(node.payload);
  if (!parsed.success) fail("Source node " + node.id + " must have {title,content} payload");
  return parsed.data;
}

function parseStimulusPayload(node: ReferenceNode): { content: Array<z.infer<typeof BlockSchema>>; provenanceIds: string[] } {
  const parsed = z.object({
    content: BlockListSchema,
    provenanceIds: z.array(z.string().refine(nonEmpty)).max(MAX_REFERENCE_NODES),
  }).strict().safeParse(node.payload);
  if (!parsed.success) fail("Stimulus node " + node.id + " must have {content,provenanceIds} payload");
  if (new Set(parsed.data.provenanceIds).size !== parsed.data.provenanceIds.length) {
    fail("Stimulus node " + node.id + " contains duplicate provenance IDs");
  }
  return parsed.data;
}

function verifyCanonicalTransport(input: unknown): unknown {
  const bytes = canonicalize(input);
  if (bytes.byteLength > MAX_TRANSPORT_BYTES) fail("Factory package exceeds 16 MiB canonical JSON limit");
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function verifyAssetBytes(asset: AssetMember, bytes: Buffer): void {
  if (bytes.byteLength !== asset.byteLength) fail("Asset " + asset.assetVersionId + " byteLength mismatch");
  const actualHash = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== asset.bytesHash) fail("Asset " + asset.assetVersionId + " bytesHash mismatch");
  const validMagic =
    asset.mediaType === "image/png"
      ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : asset.mediaType === "image/jpeg"
        ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : bytes.length >= 12 &&
          bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (!validMagic) fail("Asset " + asset.assetVersionId + " mediaType does not match its magic bytes");
}

function decodeAssets(assets: AssetMember[]): Map<string, Buffer> {
  let declaredTotal = 0;
  for (const asset of assets) {
    declaredTotal += asset.byteLength;
    if (declaredTotal > MAX_TOTAL_ASSET_BYTES) fail("Decoded assets exceed 8 MiB total");
    const expectedBase64Length = Math.ceil(asset.byteLength / 3) * 4;
    if (
      asset.bytesBase64.length !== expectedBase64Length ||
      asset.bytesBase64.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(asset.bytesBase64)
    ) {
      fail("Asset " + asset.assetVersionId + " bytesBase64 is not canonical base64 for byteLength");
    }
  }

  const decoded = new Map<string, Buffer>();
  for (const asset of assets) {
    const bytes = Buffer.from(asset.bytesBase64, "base64");
    if (bytes.toString("base64") !== asset.bytesBase64) fail("Asset " + asset.assetVersionId + " bytesBase64 is not canonical");
    verifyAssetBytes(asset, bytes);
    decoded.set(asset.assetVersionId, bytes);
  }
  return decoded;
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (result.has(id)) fail("Duplicate " + label + " " + id);
    result.set(id, value);
  }
  return result;
}

function validatePackage(packageV2: FactoryPackageV2): void {
  const referenceNodes = packageV2.references as unknown as ReferenceNode[];
  const nodeMap = uniqueBy(referenceNodes, (node) => keyOf(node), "reference node");
  const parentQuestions = validateParentAncestry(packageV2.candidates, referenceNodes);
  verifyReferenceByteLimit(referenceNodes, nodeMap);
  const assetMap = uniqueBy(packageV2.assets, (asset) => asset.assetVersionId, "asset ID");
  const rightsMap = uniqueBy(packageV2.rightsEvidence, (record) => record.id, "rights-evidence ID");
  const candidateKeys = new Set<string>();
  const questionVersionIds = new Set<string>();
  const candidateHashes = new Set<string>();
  const graphUnion = new Set<string>();
  const provenanceById = new Map<string, FactoryCandidateProvenance>();
  const sourceIds = new Set<string>();
  const usedRights = new Set<string>();
  const usedAssetIds = new Set<string>();
  const requiredProvenanceIds = new Set<string>();

  for (const candidate of packageV2.candidates) {
    const candidateKey = candidate.itemKey + "\u0000" + candidate.candidateOrdinal;
    if (candidateKeys.has(candidateKey)) fail("Duplicate candidate identity " + candidate.itemKey);
    candidateKeys.add(candidateKey);
    if (questionVersionIds.has(candidate.question.id)) fail("Duplicate question-version ID " + candidate.question.id);
    questionVersionIds.add(candidate.question.id);

    if (candidate.run.generationRunId !== candidate.question.generationRunId) {
      fail("Candidate run and question generationRunId must agree, including null");
    }
    if (candidate.question.provenanceIds.length !== candidate.provenance.length) {
      fail("Question provenanceIds must correspond in order with candidate provenance");
    }
    const candidateSourceIds = new Set<string>();
    for (const [index, provenanceId] of candidate.question.provenanceIds.entries()) {
      const provenance = candidate.provenance[index]!;
      const existing = provenanceById.get(provenanceId);
      if (existing && !sameCanonical(existing, provenance)) {
        fail("Shared provenance node " + provenanceId + " has conflicting candidate payloads");
      }
      provenanceById.set(provenanceId, provenance);
      candidateSourceIds.add(provenance.sourceVersionId);
      const rights = rightsMap.get(provenance.rightsEvidence);
      if (!rights) fail("Missing rights-evidence record " + provenance.rightsEvidence);
      if (rights.sourceVersionId !== provenance.sourceVersionId) {
        fail("Rights evidence " + rights.id + " sourceVersionId does not match provenance");
      }
      requiredProvenanceIds.add(provenanceId);
    }
    const runSources = candidate.run.sourceVersionIds;
    const runSourceIds = new Set(runSources);
    if (runSourceIds.size !== candidateSourceIds.size ||
        [...runSourceIds].some((sourceId) => !candidateSourceIds.has(sourceId))) {
      fail("Run sourceVersionIds must equal candidate source versions as a set");
    }
  }

  for (const parent of parentQuestions) {
    for (const id of parent.provenanceIds) requiredProvenanceIds.add(id);
    for (const id of questionImageIds(parent)) usedAssetIds.add(id);
  }
  for (const node of referenceNodes) {
    if (node.kind === "stimulus") {
      for (const provenanceId of parseStimulusPayload(node).provenanceIds) requiredProvenanceIds.add(provenanceId);
    }
  }
  for (const asset of packageV2.assets) {
    const assetNode = nodeMap.get(keyOf({ kind: "asset", id: asset.assetVersionId }));
    if (!assetNode) fail("Missing asset reference node " + asset.assetVersionId);
    const { assetVersionId: _assetVersionId, bytesBase64: _bytesBase64, ...metadata } = asset;
    if (!sameCanonical(assetNode.payload, metadata)) fail("Asset-node payload differs from member metadata " + asset.assetVersionId);
  }
  for (const node of referenceNodes) {
    if (node.kind === "provenance") {
      const parsedProvenance = FactoryCandidateProvenanceSchema.parse(node.payload);
      if (!requiredProvenanceIds.has(node.id)) fail("Provenance node is not required by a candidate, parent, or stimulus: " + node.id);
      const candidateProvenance = provenanceById.get(node.id);
      if (candidateProvenance && !sameCanonical(node.payload, candidateProvenance)) {
        fail("Provenance-node payload mismatch for " + node.id);
      }
      const rights = rightsMap.get(parsedProvenance.rightsEvidence);
      if (!rights) fail("Missing rights-evidence record " + parsedProvenance.rightsEvidence);
      if (rights.sourceVersionId !== parsedProvenance.sourceVersionId) {
        fail("Rights evidence " + rights.id + " sourceVersionId does not match provenance");
      }
      sourceIds.add(parsedProvenance.sourceVersionId);
      usedRights.add(rights.id);
      ensureExactEdges(node, [
        { kind: "source", id: parsedProvenance.sourceVersionId },
        { kind: "evidence", id: parsedProvenance.rightsEvidence },
      ]);
    } else if (node.kind === "source") {
      const source = parseSourcePayload(node);
      const blocks = checkedBlockList(source.content, "Source " + node.id);
      const images = imageIds(blocks);
      const dependencies = [...images].map((id) => ({ kind: "asset" as const, id }));
      ensureExactEdges(node, dependencies);
      for (const imageId of images) usedAssetIds.add(imageId);
    } else if (node.kind === "stimulus") {
      const stimulus = parseStimulusPayload(node);
      const images = imageIds(stimulus.content);
      const dependencies = [
        ...stimulus.provenanceIds.map((id) => ({ kind: "provenance" as const, id })),
        ...[...images].map((id) => ({ kind: "asset" as const, id })),
      ];
      ensureExactEdges(node, dependencies);
      for (const imageId of images) usedAssetIds.add(imageId);
    }
  }

  for (const provenanceId of requiredProvenanceIds) {
    if (!nodeMap.has(keyOf({ kind: "provenance", id: provenanceId }))) {
      fail("Missing required provenance node " + provenanceId);
    }
  }
  for (const node of referenceNodes) {
    if (node.kind === "source" && !sourceIds.has(node.id)) fail("Source node is not named by required provenance: " + node.id);
  }
  for (const rights of packageV2.rightsEvidence) {
    if (!usedRights.has(rights.id)) fail("Unused rights-evidence record " + rights.id);
    const evidenceNode = nodeMap.get(keyOf({ kind: "evidence", id: rights.id }));
    if (!evidenceNode) fail("Missing evidence node for rights-evidence record " + rights.id);
    if (!sameCanonical(evidenceNode.payload, rights)) fail("Evidence-node payload differs from rights-evidence record " + rights.id);
    ensureEdges(evidenceNode, [{ kind: "source", id: rights.sourceVersionId }]);
  }
  for (const sourceId of sourceIds) {
    if (!nodeMap.has(keyOf({ kind: "source", id: sourceId }))) fail("Missing source node " + sourceId);
  }

  for (const candidate of packageV2.candidates) {
    for (const assetId of questionImageIds(candidate.question)) {
      if (!assetMap.has(assetId)) fail("Missing asset member for question image " + assetId);
      usedAssetIds.add(assetId);
    }
  }
  for (const assetId of usedAssetIds) {
    if (!assetMap.has(assetId)) fail("Missing asset member " + assetId);
  }
  for (const assetId of assetMap.keys()) {
    if (!usedAssetIds.has(assetId)) fail("Unused asset member " + assetId);
    const assetNode = nodeMap.get(keyOf({ kind: "asset", id: assetId }));
    if (!assetNode) fail("Missing asset reference node " + assetId);
  }
  for (const node of referenceNodes) {
    if (node.kind === "asset" && !assetMap.has(node.id)) fail("Asset reference node has no asset member " + node.id);
  }

  for (const candidate of packageV2.candidates) {
    const closure = candidateClosure(candidate.question, nodeMap);
    for (const node of closure) graphUnion.add(keyOf(node));
  }
  if (graphUnion.size !== nodeMap.size) fail("Reference graph contains nodes unreachable from all candidates");

  for (const candidate of packageV2.candidates) {
    const closure = candidateClosure(candidate.question, nodeMap);
    const identity = computeQuestionIdentity(candidate.question, closure);
    if (candidate.contentHash !== identity.contentHash || candidate.question.contentHash !== identity.contentHash) {
      fail("Candidate contentHash does not match computed question identity");
    }
    if (candidateHashes.has(identity.contentHash)) fail("Duplicate candidate identity contentHash");
    candidateHashes.add(identity.contentHash);
    for (const validation of candidate.validations) {
      if (validation.inputHash !== identity.contentHash) {
        fail("Validation evidence inputHash must name the candidate's computed contentHash");
      }
    }
  }
  decodeAssets(packageV2.assets);
}

/** Parse and fully validate the bounded factory-package/2 transport. */
export function parseFactoryPackageV2(input: unknown): FactoryPackageV2 {
  const safeInput = verifyCanonicalTransport(input);
  const packageV2 = FactoryPackageV2Schema.parse(safeInput);
  validatePackage(packageV2);
  return packageV2;
}

/** Validate the complete V2 package, all candidate identities, assets, rights and shared references. */
export function validateFactoryPackageV2(input: unknown): FactoryPackageV2 {
  return parseFactoryPackageV2(input);
}

/** Return DRAFT-only Bank receipts after every package member has passed validation. */
export function createDraftReceiptsV2(input: unknown): FactoryPackageV2DraftReceipt[] {
  const packageV2 = validateFactoryPackageV2(input);
  return packageV2.candidates.map((candidate) =>
    BankImportReceiptSchema.parse({
      producerNamespace: packageV2.producerNamespace,
      batchKey: packageV2.batchKey,
      itemKey: candidate.itemKey,
      candidateOrdinal: candidate.candidateOrdinal,
      inputHash: candidate.contentHash,
      questionId: candidate.question.questionId,
      questionVersionId: candidate.question.id,
      generationRunId: candidate.question.generationRunId,
      workflowState: "DRAFT",
    }),
  );
}
