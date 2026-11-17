import { createHash } from "node:crypto";
import { computeQuestionIdentity, createReferenceHash, type JsonValue, type ReferenceKind, type ReferenceNode } from "../../src/identity.ts";
import type { FactoryCandidateProvenance } from "../../src/index.ts";
import type { AssetMember, FactoryPackageV2, RightsEvidenceRecord } from "../../src/factory-package-v2.ts";

type ReferenceSpec = {
  kind: ReferenceKind;
  id: string;
  payload: Record<string, JsonValue>;
  references?: Array<{ kind: ReferenceKind; id: string }>;
};

export type SyntheticFactoryPackageOptions = {
  candidateCount?: number;
  withAsset?: boolean;
  withStimulus?: boolean;
  withParent?: boolean;
  withDistinctStimulusProvenance?: boolean;
  withDistinctParentProvenance?: boolean;
  withParentOnlyAsset?: boolean;
  validationOutcome?: "PASS" | "FAIL" | "INCONCLUSIVE";
};

const placeholderHash = "sha256:" + "0".repeat(64);
const ids = {
  taxonomy: "33333333-3333-4333-8333-333333333333",
  stimulus: "44444444-4444-4444-8444-444444444444",
  asset: "55555555-5555-4555-8555-555555555555",
  source: "synthetic-source-version-1",
  provenance: "synthetic-provenance-1",
  evidence: "synthetic-rights-attestation-1",
  stimulusSource: "synthetic-stimulus-source-version-2",
  stimulusProvenance: "synthetic-stimulus-provenance-2",
  stimulusEvidence: "synthetic-stimulus-rights-attestation-2",
  parentSource: "synthetic-parent-source-version-3",
  parentProvenance: "synthetic-parent-provenance-3",
  parentEvidence: "synthetic-parent-rights-attestation-3",
  parentAsset: "99999999-9999-4999-8999-999999999999",
};

function additionalProvenance(sourceVersionId: string, provenanceId: string, evidenceId: string, transformation: string) {
  const rights: RightsEvidenceRecord = {
    id: evidenceId,
    sourceVersionId,
    state: "LICENSED",
    allowedUses: ["DISPLAY", "GENERATE"],
    territories: ["US"],
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
    evidence: "Synthetic fixture rights evidence; no real grant is asserted.",
  };
  const provenance: FactoryCandidateProvenance = {
    sourceVersionId,
    origin: "GENERATED",
    sourceSpan: null,
    transformation,
    creator: "synthetic-producer",
    rightsEvidence: evidenceId,
  };
  return {
    rights,
    specifications: [
      { kind: "source" as const, id: sourceVersionId, payload: { title: "Synthetic independent source", content: [{ type: "text", text: "Separate immutable source." }] } },
      { kind: "evidence" as const, id: evidenceId, payload: structuredClone(rights) as unknown as Record<string, JsonValue>, references: [{ kind: "source" as const, id: sourceVersionId }] },
      { kind: "provenance" as const, id: provenanceId, payload: structuredClone(provenance) as unknown as Record<string, JsonValue>, references: [{ kind: "source" as const, id: sourceVersionId }, { kind: "evidence" as const, id: evidenceId }] },
    ] satisfies ReferenceSpec[],
  };
}

function hashNodes(specs: ReferenceSpec[]): ReferenceNode[] {
  const byId = new Map(specs.map((spec) => [spec.kind + "\u0000" + spec.id, spec]));
  const hashes = new Map<string, string>();
  const active = new Set<string>();
  const hash = (spec: ReferenceSpec): string => {
    const key = spec.kind + "\u0000" + spec.id;
    const cached = hashes.get(key);
    if (cached) return cached;
    if (active.has(key)) throw new Error("Synthetic fixture graph must be acyclic");
    active.add(key);
    const references = (spec.references ?? []).map((reference) => {
      const child = byId.get(reference.kind + "\u0000" + reference.id);
      if (!child) throw new Error("Synthetic fixture dependency is missing");
      return { ...reference, contentHash: hash(child) };
    });
    const result = createReferenceHash({
      kind: spec.kind,
      id: spec.id,
      payload: spec.payload,
      references,
    });
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

export function buildSyntheticFactoryPackageV2(options: SyntheticFactoryPackageOptions = {}): FactoryPackageV2 {
  const candidateCount = options.candidateCount ?? 1;
  const withAsset = options.withAsset ?? false;
  const withStimulus = options.withStimulus === true || options.withDistinctStimulusProvenance === true;
  const withParent = options.withParent === true || options.withDistinctParentProvenance === true || options.withParentOnlyAsset === true;
  const validationOutcome = options.validationOutcome ?? "PASS";
  if (!Number.isInteger(candidateCount) || candidateCount < 1 || candidateCount > 100) {
    throw new RangeError("Synthetic candidateCount must be between 1 and 100");
  }

  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const bytesHash = "sha256:" + createHash("sha256").update(pngBytes).digest("hex");
  const asset: AssetMember = {
    assetVersionId: ids.asset,
    mediaType: "image/png",
    byteLength: pngBytes.length,
    bytesHash,
    bytesBase64: pngBytes.toString("base64"),
  };
  const parentPngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  const parentAsset: AssetMember = {
    assetVersionId: ids.parentAsset,
    mediaType: "image/png",
    byteLength: parentPngBytes.length,
    bytesHash: "sha256:" + createHash("sha256").update(parentPngBytes).digest("hex"),
    bytesBase64: parentPngBytes.toString("base64"),
  };
  const rightsEvidence: RightsEvidenceRecord = {
    id: ids.evidence,
    sourceVersionId: ids.source,
    state: "LICENSED",
    allowedUses: ["DISPLAY", "GENERATE"],
    territories: ["US"],
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
    evidence: "Synthetic fixture rights evidence; no real grant is asserted.",
  };
  const provenance: FactoryCandidateProvenance = {
    sourceVersionId: ids.source,
    origin: "GENERATED",
    sourceSpan: null,
    transformation: "Synthetic fixture generation",
    creator: "synthetic-producer",
    rightsEvidence: ids.evidence,
  };

  const sourceContent = withAsset
    ? [{ type: "image", assetVersionId: ids.asset, alt: "Synthetic source image" } as JsonValue]
    : [{ type: "text", text: "Synthetic source content." } as JsonValue];
  const stimulusContent = withAsset
    ? [{ type: "image", assetVersionId: ids.asset, alt: "Synthetic stimulus image" } as JsonValue]
    : [{ type: "text", text: "Synthetic shared context." } as JsonValue];

  const specifications: ReferenceSpec[] = [
    { kind: "taxonomy", id: ids.taxonomy, payload: { code: "synthetic-algebra" } },
    {
      kind: "source",
      id: ids.source,
      payload: { title: "Synthetic source", content: sourceContent },
      references: withAsset ? [{ kind: "asset", id: ids.asset }] : [],
    },
    {
      kind: "evidence",
      id: ids.evidence,
      payload: structuredClone(rightsEvidence) as unknown as Record<string, JsonValue>,
      references: [{ kind: "source", id: ids.source }],
    },
    {
      kind: "provenance",
      id: ids.provenance,
      payload: structuredClone(provenance) as unknown as Record<string, JsonValue>,
      references: [
        { kind: "source", id: ids.source },
        { kind: "evidence", id: ids.evidence },
      ],
    },
    ...(withAsset
      ? [{
          kind: "asset" as const,
          id: ids.asset,
          payload: {
            mediaType: asset.mediaType,
            byteLength: asset.byteLength,
            bytesHash: asset.bytesHash,
          },
        }]
      : []),
    ...(withStimulus
      ? [{
          kind: "stimulus" as const,
          id: ids.stimulus,
          payload: { content: stimulusContent, provenanceIds: [ids.provenance] },
          references: [
            { kind: "provenance" as const, id: ids.provenance },
            ...(withAsset ? [{ kind: "asset" as const, id: ids.asset }] : []),
          ],
        }]
      : []),
  ];
  const rightsRecords = [rightsEvidence];
  const parentOnlySpecifications: ReferenceSpec[] = [];
  if (options.withDistinctStimulusProvenance) {
    const extra = additionalProvenance(ids.stimulusSource, ids.stimulusProvenance, ids.stimulusEvidence, "Synthetic stimulus-specific provenance");
    specifications.push(...extra.specifications);
    rightsRecords.push(extra.rights);
    const stimulus = specifications.find((spec) => spec.kind === "stimulus");
    if (!stimulus) throw new Error("Synthetic stimulus fixture was not created");
    stimulus.payload.provenanceIds = [ids.stimulusProvenance];
    stimulus.references = [
      { kind: "provenance", id: ids.stimulusProvenance },
      ...(withAsset ? [{ kind: "asset" as const, id: ids.asset }] : []),
    ];
  }
  if (options.withDistinctParentProvenance) {
    const extra = additionalProvenance(ids.parentSource, ids.parentProvenance, ids.parentEvidence, "Synthetic historical parent provenance");
    parentOnlySpecifications.push(...extra.specifications);
    rightsRecords.push(extra.rights);
  }
  if (options.withParentOnlyAsset) {
    parentOnlySpecifications.push({
      kind: "asset",
      id: ids.parentAsset,
      payload: { mediaType: parentAsset.mediaType, byteLength: parentAsset.byteLength, bytesHash: parentAsset.bytesHash },
    });
  }
  const references = hashNodes(specifications);
  const candidates: FactoryPackageV2["candidates"] = [];
  for (let index = 0; index < candidateCount; index += 1) {
    const suffix = String(index + 1).padStart(12, "0");
    const runId = "66666666-6666-4666-8666-" + suffix;
    const questionVersionId = "11111111-1111-4111-8111-" + suffix;
    const questionId = "22222222-2222-4222-8222-" + suffix;
    const candidateQuestion: FactoryPackageV2["candidates"][number]["question"] = {
      schemaVersion: "question/1",
      id: questionVersionId,
      questionId,
      versionNo: 1,
      parentVersionId: null,
      language: "vi-VN",
      section: "MATH",
      taxonomyVersionId: ids.taxonomy,
      domainId: "synthetic-algebra",
      skillIds: ["synthetic-linear-equations"],
      subskillIds: ["synthetic-one-variable"],
      cognitiveLevel: "M2",
      difficulty: { target: "MEDIUM", predicted: null, empiricalStudyId: null },
      content: withAsset
        ? [{ type: "image", assetVersionId: ids.asset, alt: "Synthetic question image" }]
        : [{ type: "text", text: "Synthetic candidate " + index + ": solve x + 2 = 5." }],
      stimulusVersionId: withStimulus ? ids.stimulus : null,
      interaction: {
        type: "SINGLE_CHOICE",
        options: [
          { id: "a", content: [{ type: "text", text: "2" }] },
          { id: "b", content: [{ type: "text", text: "3" }] },
        ],
      },
      private: {
        answerKey: { type: "SINGLE_CHOICE", optionId: "b" },
        explanation: [{ type: "text", text: "Synthetic explanation." }],
        evidenceRefs: [ids.evidence],
        scoringPolicy: "practice-binary-v1",
      },
      origin: "GENERATED",
      provenanceIds: [ids.provenance],
      generationRunId: runId,
      createdBy: "synthetic-factory",
      createdAt: "2026-10-19T08:00:00Z",
      contentHash: placeholderHash,
    };
    const candidate = {
      itemKey: "synthetic-item-" + index,
      candidateOrdinal: index,
      contentHash: placeholderHash,
      question: candidateQuestion,
      provenance: [provenance],
      run: {
        generationRunId: runId,
        providerRunRef: "synthetic-run-" + index,
        adapterRevision: "synthetic-adapter/1",
        modelRevision: "synthetic-model/1",
        promptTemplateVersion: "synthetic-template/1",
        inputHash: "sha256:synthetic-generation-input-" + index,
        responseHash: "sha256:synthetic-generation-response-" + index,
        sourceVersionIds: [ids.source],
        seed: index,
        usage: { inputTokens: 10, outputTokens: 20, costMicros: 0 },
      },
      validations: [{
        validatorKind: "schema",
        validatorVersion: "synthetic-validator/1",
        inputHash: placeholderHash,
        outcome: validationOutcome,
        evidencePointer: "synthetic-evidence://validator/" + index,
        at: "2026-10-19T08:01:00Z",
        actor: "synthetic-validator",
      }],
    };
    const identity = computeQuestionIdentity(candidate.question, references);
    candidate.contentHash = identity.contentHash;
    candidate.question.contentHash = identity.contentHash;
    candidate.validations[0]!.inputHash = identity.contentHash;
    candidates.push(candidate);
  }
  const packageV2: FactoryPackageV2 = {
    schemaVersion: "factory-package/2",
    producerNamespace: "synthetic.factory",
    batchKey: "synthetic:v2:batch-1",
    candidates,
    references,
    assets: [
      ...(withAsset ? [asset] : []),
      ...(options.withParentOnlyAsset ? [parentAsset] : []),
    ],
    rightsEvidence: rightsRecords,
  };

  if (withParent) {
    const specifications: ReferenceSpec[] = references.map((node) => ({
      kind: node.kind,
      id: node.id,
      payload: node.payload,
      references: node.references.map(({ kind, id }) => ({ kind, id })),
    }));
    specifications.push(...parentOnlySpecifications);
    for (const candidate of candidates) {
      const child = candidate.question;
      const suffix = child.id.slice(-12);
      const parentId = "77777777-7777-4777-8777-" + suffix;
      const parent = structuredClone(child);
      parent.id = parentId;
      parent.versionNo = child.versionNo;
      parent.parentVersionId = null;
      parent.contentHash = placeholderHash;
      if (options.withDistinctParentProvenance) {
        parent.provenanceIds = [ids.parentProvenance];
        parent.private.evidenceRefs = [ids.parentEvidence];
      }
      if (options.withParentOnlyAsset) {
        parent.content = [{ type: "image", assetVersionId: ids.parentAsset, alt: "Historical parent-only image" }];
      }
      child.versionNo += 1;
      child.parentVersionId = parentId;

      const imageIds = new Set<string>();
      const collectImages = (value: unknown): void => {
        if (Array.isArray(value)) {
          value.forEach(collectImages);
          return;
        }
        if (value === null || typeof value !== "object") return;
        const record = value as Record<string, unknown>;
        if (record.type === "image" && typeof record.assetVersionId === "string") imageIds.add(record.assetVersionId);
        Object.values(record).forEach(collectImages);
      };
      collectImages(parent.content);
      collectImages(parent.interaction);
      collectImages(parent.private);
      const parentRoots: ReferenceSpec["references"] = [
        { kind: "taxonomy", id: parent.taxonomyVersionId },
        ...(parent.stimulusVersionId === null ? [] : [{ kind: "stimulus" as const, id: parent.stimulusVersionId }]),
        ...parent.provenanceIds.map((id) => ({ kind: "provenance" as const, id })),
        ...parent.private.evidenceRefs.map((id) => ({ kind: "evidence" as const, id })),
        ...[...imageIds].map((id) => ({ kind: "asset" as const, id })),
      ];
      const { contentHash: _contentHash, ...payload } = parent;
      specifications.push({ kind: "question", id: parentId, payload: payload as unknown as Record<string, JsonValue>, references: parentRoots });
    }
    packageV2.references = hashNodes(specifications);
    for (const candidate of candidates) {
      const identity = computeQuestionIdentity(candidate.question, packageV2.references);
      candidate.contentHash = identity.contentHash;
      candidate.question.contentHash = identity.contentHash;
      candidate.validations[0]!.inputHash = identity.contentHash;
    }
  }

  return packageV2;
}
