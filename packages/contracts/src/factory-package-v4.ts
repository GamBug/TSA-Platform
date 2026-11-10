/** Private deterministic Reading interaction DRAFT transport. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { QuestionVersionV3Schema } from "./question-v3.ts";
import {
  canonicalize,
  computeDuplicateFingerprint,
  computeQuestionIdentity,
  type JsonValue,
  type ReferenceNode,
} from "./identity.ts";
import {
  ManualDeclarationSchema,
  type ManualArtifactKind,
} from "./manual-factory-schemas.ts";
import {
  MANUAL_INTERACTION_PROFILE,
  MANUAL_INTERACTION_PROMPT_VERSION,
  ManualAdaptationFlagSchema,
  ManualFactoryPackageV4Schema as Package,
  ManualImportMappingV4Schema as Mapping,
  ManualInputV4Schema,
  ManualPromptV4Schema,
  ManualResponseV4Schema,
  ManualRunV4Schema,
  ManualSourceDeclarationV4Schema,
} from "./manual-factory-schemas-v4.ts";
import { assertManualJson, parseManualJsonBytes, parseManualJsonInput, sameManualValue } from "./manual-json.ts";
import { validateManualTaxonomy } from "./manual-factory-validation.ts";
import { copyManualArtifacts, createManualArtifactNode, decodeManualArtifacts, finalizeManualReferenceGraph, isManualReferenceReachable, manualQuestionRoots } from "./manual-factory-core.ts";

export { parseManualJsonBytes } from "./manual-json.ts";
export const CORPUS_INTERACTIONS_TRANSFORMATION =
  "Deterministic extraction of explicitly keyed Reading captures; provisional M1 classification; explanations not retained";
export type FactoryPackageV4 = z.infer<typeof Package>;
type ManualImportMappingV4 = ReturnType<typeof Mapping.parse>;

const ARTIFACT_FIELDS = ["input", "prompt", "response", "declaration", "sourceDeclaration"] as const;
const ARTIFACT_KINDS: Record<(typeof ARTIFACT_FIELDS)[number], ManualArtifactKind> = {
  input: "INPUT", prompt: "PROMPT", response: "RESPONSE", declaration: "DECLARATION", sourceDeclaration: "SOURCE_DECLARATION",
};
const adaptationFlags = ManualAdaptationFlagSchema.options;
const hash = (value: Uint8Array) => "sha256:" + createHash("sha256").update(value).digest("hex");
export const digestManualCanonicalV4 = (value: unknown) => {
  assertManualJson(value);
  return hash(canonicalize(value));
};
const nodeKey = (node: { kind: string; id: string }) => node.kind + "\0" + node.id;
const same = sameManualValue;

function fail(message: string): never { throw new TypeError(message); }
function need(condition: unknown, message: string): asserts condition { if (!condition) fail(message); }

function hasMarkdownImage(value: string): boolean {
  return /!\[|!\s+\[[^\]]*\]\s*(?:\(|\[)/u.test(value);
}

function assertTextOnly(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(assertTextOnly); return; }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (["image", "math", "table"].includes(String(object.type))) fail("Text-only profile required");
  if (object.type === "text") need(typeof object.text === "string"
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(object.text)
    && !/(?:<\/?[A-Za-z][^<>]*>|<!|<\?|\b(?:javascript|vbscript)\s*:|\bdata\s*:\s*[a-z]+\/)/iu.test(object.text)
    && !hasMarkdownImage(object.text), "Unsafe text");
  Object.values(object).forEach(assertTextOnly);
}

function validateMapping(input: unknown): ManualImportMappingV4 {
  const mapping = Mapping.parse(parseManualJsonInput(input, "interaction mapping"));
  const count = mapping.candidates.length;
  need(count === 7 || count === 8, "Interaction groups require seven or eight keyed candidates");
  for (const field of ["candidateOrdinal", "rawQuestionId", "questionId", "questionVersionId"] as const) {
    need(new Set(mapping.candidates.map((candidate) => candidate[field])).size === count, "Duplicate mapping identities");
  }
  need(mapping.candidates.every((candidate, index) => candidate.candidateOrdinal === index), "Candidate ordinals must be dense and source ordered");
  need(mapping.candidates.every((candidate) => candidate.stimulusVersionId !== null
    && candidate.stimulusVersionId === mapping.candidates[0]!.stimulusVersionId), "One shared passage stimulus required");
  need(!mapping.candidates.some((candidate) => mapping.candidates.some((other) => candidate.questionId === other.questionVersionId)),
    "Stable and version identities overlap");
  const domain = mapping.taxonomy.nodes.find((node) => node.stagingKind === "DOMAIN");
  const skill = mapping.taxonomy.nodes.find((node) => node.stagingKind === "SKILL");
  need(domain?.stagingCode === "READING" && domain.section === "READING" && domain.parentCode === null
    && skill?.section === "READING" && skill.parentCode === "READING", "Reading taxonomy mapping closure required");
  need(new Set(mapping.taxonomy.nodes.map((node) => node.registeredNodeId)).size === 2, "Duplicate taxonomy mapping");
  return mapping;
}

export function parseManualImportMappingV4(input: unknown): ManualImportMappingV4 {
  return validateMapping(input);
}

function validateRawArtifacts(mapping: ManualImportMappingV4, target: unknown,
  artifacts: Record<(typeof ARTIFACT_FIELDS)[number], Uint8Array>) {
  const raw = (name: (typeof ARTIFACT_FIELDS)[number]) => parseManualJsonBytes(artifacts[name], name);
  const input = ManualInputV4Schema.parse(raw("input"));
  const prompt = ManualPromptV4Schema.parse(raw("prompt"));
  const response = ManualResponseV4Schema.parse(raw("response"));
  const declarationValue = ManualDeclarationSchema.parse(raw("declaration"));
  const sourceDeclaration = ManualSourceDeclarationV4Schema.parse(raw("sourceDeclaration"));
  const source = input.sources[0]!;
  const taxonomy = validateManualTaxonomy(target);
  const staging = validateManualTaxonomy(input.taxonomy);

  need(sourceDeclaration.kind === "CORPUS_IMPORTED" && sourceDeclaration.sourceCaptures?.length === response.questions.length,
    "Corpus source declaration and captures required");
  need(source.rights.state === "INTERNAL_EXPERIMENT_AUTHORIZED" && source.rights.copyrightVerification === "UNVERIFIED"
    && source.rights.publicationPermission === false && new Set(source.rights.allowedUses).size === 2
    && source.rights.allowedUses.includes("DISPLAY") && source.rights.allowedUses.includes("GENERATE"), "Private unverified source rights required");
  need(source.rights.validUntil === null || Date.parse(source.rights.validUntil) > Date.parse(source.rights.validFrom), "Invalid permission interval");
  need(mapping.profile === MANUAL_INTERACTION_PROFILE && mapping.producerNamespace === input.producerNamespace
    && mapping.batchKey === input.batchKey && mapping.declaredOperatorId === input.operatorId
    && mapping.sourceVersionId === source.sourceVersionId, "Mapping raw input mismatch");
  need(mapping.taxonomy.stagingVersionId === staging.taxonomyVersionId
    && mapping.taxonomy.registeredVersionId === taxonomy.taxonomyVersionId
    && mapping.taxonomy.registeredDefinitionHash === taxonomy.definitionHash, "Mapping taxonomy identity mismatch");
  for (const node of mapping.taxonomy.nodes) {
    const from = staging.nodes.find((candidate) => candidate.code === node.stagingCode);
    const to = taxonomy.nodes.find((candidate) => candidate.id === node.registeredNodeId);
    const parent = from?.parentId === null ? null : staging.nodes.find((candidate) => candidate.id === from?.parentId)?.code;
    const targetParent = to?.parentId === null ? null : taxonomy.nodes.find((candidate) => candidate.id === to?.parentId)?.code;
    need(from && to && from.kind === node.stagingKind && to.kind === node.registeredKind && from.code === node.registeredCode
      && to.code === node.registeredCode && node.stagingKind === node.registeredKind && parent === node.parentCode
      && targetParent === node.parentCode, "Mapping taxonomy closure mismatch");
  }
  need(mapping.taxonomy.nodes.some((node) => node.stagingKind === "DOMAIN" && node.stagingCode === "READING" && node.parentCode === null)
    && mapping.taxonomy.nodes.some((node) => node.stagingKind === "SKILL" && node.stagingCode === source.skillId
      && node.parentCode === "READING"), "Missing Reading domain or source skill mapping");
  need(prompt.version === MANUAL_INTERACTION_PROMPT_VERSION && prompt.schemaVersion === "reading-interactions-output/1"
    && prompt.sourceData === source.text && prompt.sourceVersionId === source.sourceVersionId && prompt.skillId === source.skillId
    && prompt.taxonomyVersionId === staging.taxonomyVersionId, "Interaction prompt/profile mismatch");
  need(declarationValue.operatorId === input.operatorId && declarationValue.promptHash === digestManualCanonicalV4(prompt)
    && declarationValue.model === "NOT_APPLICABLE_DETERMINISTIC_EXTRACTION" && declarationValue.exactModelRevision === null
    && declarationValue.interface === "Offline corpus interaction parser"
    && declarationValue.usage === null && declarationValue.usageVerification === "UNVERIFIED"
    && declarationValue.evidenceNote === "Deterministic extraction only; no LLM generation or provider call.", "Deterministic declaration mismatch");
  const outputSchema = JSON.parse(JSON.stringify(z.toJSONSchema(ManualResponseV4Schema))) as unknown;
  need(digestManualCanonicalV4(prompt.outputJsonSchema) === digestManualCanonicalV4(outputSchema), "Pinned interaction output schema mismatch");
  for (const span of prompt.evidenceSpans) need(span.end > span.start && source.text.slice(span.start, span.end) === span.quote, "Prompt evidence mismatch");
  need(sourceDeclaration.prompt.classification === "PROVISIONAL_M1_NEEDS_OWNER_CLASSIFICATION"
    && sourceDeclaration.prompt.explanation === "NOT_RETAINED"
    && sourceDeclaration.prompt.matchingAdaptation.targetSource === "CAPTURED_CORRECT_TEXTS"
    && sourceDeclaration.prompt.matchingAdaptation.targetOrdering === "CODE_POINT_ASCENDING"
    && sourceDeclaration.prompt.matchingAdaptation.maxUses === "ROW_COUNT", "Required adaptation or provisional classification missing");
  need(hash(new TextEncoder().encode(source.text.normalize("NFC").replace(/\s+/gu, " ").trim())) === sourceDeclaration.prompt.passageId,
    "Passage identity mismatch");
  need(response.questions.length === mapping.candidates.length
    && sourceDeclaration.prompt.candidates.length === response.questions.length
    && sourceDeclaration.sourceCaptures.length === response.questions.length, "Candidate evidence cardinality mismatch");

  const inputCaptures = new Map(sourceDeclaration.sourceCaptures.map((capture) => [capture.path, capture.hash]));
  const declared = new Map(sourceDeclaration.prompt.candidates.map((capture) => [capture.id, capture]));
  const deferredPaths = new Set(sourceDeclaration.prompt.deferred.map((item) => item.path));
  need(inputCaptures.size === sourceDeclaration.sourceCaptures.length && declared.size === sourceDeclaration.prompt.candidates.length
    && deferredPaths.size === sourceDeclaration.prompt.deferred.length
    && [...deferredPaths].every((path) => !inputCaptures.has(path)), "Deferred captures overlap or duplicate keyed captures");
  const ids = new Set<string>();
  const fingerprints = new Set<string>();
  for (const [index, draft] of response.questions.entries()) {
    const capture = declared.get(draft.id);
    need(!ids.has(draft.id) && draft.skillId === source.skillId && capture, "Duplicate candidate or invalid skill");
    ids.add(draft.id);
    need(inputCaptures.get(draft.id) === capture!.sourceHash && mapping.candidates[index]!.rawQuestionId === draft.id,
      "Source capture and mapping identity mismatch");
    need(capture!.interactionType === draft.interaction.type && JSON.stringify(capture!.adaptationFlags) === JSON.stringify(draft.adaptationFlags)
      && digestManualCanonicalV4(capture!.adaptationDetails) === digestManualCanonicalV4(draft.adaptationDetails), "Adaptation declaration mismatch");
    const requiredFlags = draft.interaction.type === "MULTIPLE_CHOICE" ? ["MULTIPLE_CHOICE_SELECTION_RANGE_NOT_CAPTURED"]
      : draft.interaction.type === "MATCHING" ? ["MATCHING_TARGET_POOL_DERIVED_FROM_CAPTURED_CORRECT_TEXTS", "MATCHING_TARGET_REUSE_MAXIMUM_SET_TO_ROW_COUNT"] : [];
    need(requiredFlags.every((flag) => draft.adaptationFlags.includes(flag as typeof adaptationFlags[number])), "Required interaction adaptation flag missing");
    need(new Set(draft.adaptationFlags).size === draft.adaptationFlags.length
      && draft.adaptationFlags.every((flag) => adaptationFlags.includes(flag)), "Invalid or duplicate adaptation flag");
    const missingBlank = draft.adaptationFlags.includes("MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION");
    need(missingBlank === (draft.adaptationDetails.length === 1), "Missing-blank adaptation detail required");
    if (missingBlank) {
      const detail = draft.adaptationDetails[0]!;
      const visible = [...draft.content.flatMap((block) => block.type === "text" ? block.text : "").join("").matchAll(/_{2,}|\[\s*\]/gu)].length;
      const positions = draft.interaction.type === "MATCHING" ? draft.interaction.rows.length
        : draft.interaction.type === "CLOZE" ? draft.interaction.fields.length : 0;
      need(detail.visibleBlankCount === visible && detail.capturedPositionCount === positions && positions > visible,
        "Missing-blank adaptation counts mismatch");
    } else need(draft.adaptationDetails.length === 0, "Unexpected adaptation details");
    if (draft.interaction.type === "MATCHING") {
      const labels = draft.interaction.targets.map((target) => target.label);
      const rowCount = draft.interaction.rows.length;
      need(labels.every((label, i) => i === 0 || labels[i - 1]! < label), "Derived matching targets must be code-point sorted and unique");
      need(draft.interaction.targets.every((target, i) => target.id === `target-${i + 1}`
        && target.maxUses === rowCount), "Derived matching IDs and reuse limits mismatch");
    }
    need(draft.cognitiveLevel === "M1" && draft.explanation.length === 1
      && draft.explanation[0]!.type === "text"
      && draft.explanation[0]!.text === "No explanation retained in the source capture. Owner review required."
      && draft.distractorReasons.length === 0, "Corpus cognition, explanation or distractor metadata mismatch");
    need(draft.evidence.start === 0 && draft.evidence.end === source.text.length && draft.evidence.quote === source.text
      && draft.evidence.rationale === "Whole source passage retained for review; no answer entailment or cognition claim is made.",
      "Passage evidence or provisional rationale mismatch");
    const fingerprint = digestManualCanonicalV4({ content: draft.content, interaction: draft.interaction });
    need(!fingerprints.has(fingerprint), "Exact duplicate interaction candidate");
    fingerprints.add(fingerprint);
    assertTextOnly(draft);
  }
  need([...declared.keys()].every((id) => ids.has(id))
    && sourceDeclaration.prompt.deferred.length === 10 - response.questions.length,
    "Interaction passage must retain two or three deferred unkeyed captures");
  assertTextOnly([{ type: "text", text: source.text }]);
  return { input, prompt, response, declaration: declarationValue, sourceDeclaration };
}

export function buildManualFactoryPackageV4(input: {
  mapping: unknown;
  taxonomy: unknown;
  artifacts: Record<(typeof ARTIFACT_FIELDS)[number], Uint8Array>;
  manualRunId: string;
  permissionId: string;
  authoringId: string;
}): FactoryPackageV4 {
  const pkg = construct(input);
  need(canonicalize(pkg).byteLength <= 1024 * 1024, "Package exceeds 1 MiB");
  need(canonicalize(pkg.manualRun).byteLength <= 16 * 1024, "Run summary too large");
  const seen = new Set<string>();
  for (const candidate of pkg.candidates) {
    const closure = (pkg.references as ReferenceNode[]).filter((node) => isManualReferenceReachable(node,
      pkg.references as ReferenceNode[], manualQuestionRoots(candidate.question)));
    const fingerprint = computeDuplicateFingerprint(candidate.question, closure).fingerprint;
    need(!seen.has(fingerprint), "Duplicate question fingerprint"); seen.add(fingerprint);
  }
  return pkg;
}

export function parseManualFactoryPackageV4(input: unknown): FactoryPackageV4 {
  const pkg = Package.parse(parseManualJsonInput(input, "manual interaction package"));
  const artifacts = decodeManualArtifacts(pkg.manualRun.artifactRefs, pkg.references, ARTIFACT_KINDS);
  const rawInput = ManualInputV4Schema.parse(parseManualJsonBytes(artifacts.input!, "input"));
  const response = ManualResponseV4Schema.parse(parseManualJsonBytes(artifacts.response!, "response"));
  const tax = pkg.references.filter((node) => node.kind === "taxonomy");
  need(tax.length === 1, "One taxonomy required");
  const taxonomy = validateManualTaxonomy(tax[0]!.payload);
  const maps = pkg.candidates.map((candidate) => {
    const nodes = pkg.references.filter((node) => node.kind === "evidence" && node.id === `manual-map-${candidate.candidateOrdinal}`);
    need(nodes.length === 1, "Mapping node missing"); return nodes[0]!.payload as Record<string, any>;
  });
  const source = rawInput.sources[0]!;
  const nodes = ["READING", source.skillId].map((code) => {
    const from = rawInput.taxonomy.nodes.find((node) => node.code === code);
    const to = taxonomy.nodes.find((node) => node.code === code);
    need(from && to, "Missing taxonomy code");
    return { stagingCode: code, stagingKind: from!.kind, registeredNodeId: to!.id, registeredCode: code,
      registeredKind: to!.kind, parentCode: code === "READING" ? null : "READING", section: "READING" };
  });
  const mapping = {
    schemaVersion: "manual-import-mapping/1", profile: MANUAL_INTERACTION_PROFILE,
    producerNamespace: pkg.producerNamespace, batchKey: pkg.batchKey,
    declaredOperatorId: pkg.manualRun.declaredOperatorId, registeredAuthorId: pkg.candidates[0]!.question.createdBy,
    sourceVersionId: source.sourceVersionId,
    taxonomy: { stagingVersionId: rawInput.taxonomy.taxonomyVersionId, registeredVersionId: taxonomy.taxonomyVersionId,
      registeredDefinitionHash: taxonomy.definitionHash, nodes },
    candidates: pkg.candidates.map((candidate, index) => ({ rawQuestionId: maps[index]!.rawQuestionId,
      candidateOrdinal: candidate.candidateOrdinal, questionId: candidate.question.questionId,
      questionVersionId: candidate.question.id, stimulusVersionId: candidate.question.stimulusVersionId })),
  };
  const firstMap = maps[0]!;
  if (digestManualCanonicalV4(mapping.taxonomy) !== firstMap.taxonomyMappingHash) mapping.taxonomy.nodes.reverse();
  const expected = buildManualFactoryPackageV4({
    mapping, taxonomy, artifacts: artifacts as any, manualRunId: pkg.manualRun.manualRunId,
    permissionId: pkg.sourcePermissions[0]!.id, authoringId: pkg.sourceAuthoring[0]!.id,
  });
  const normalize = (value: FactoryPackageV4) => ({ ...value,
    references: [...value.references].map((node) => ({ ...node,
      references: [...node.references].sort((a, b) => nodeKey(a).localeCompare(nodeKey(b))),
    })).sort((a, b) => nodeKey(a).localeCompare(nodeKey(b))),
  });
  need(same(normalize(pkg), normalize(expected)), "Raw projection or typed graph mismatch");
  return pkg;
}

function construct(input: Parameters<typeof buildManualFactoryPackageV4>[0]): FactoryPackageV4 {
  const mapping = validateMapping(input.mapping);
  const copied = copyManualArtifacts(input.artifacts, ARTIFACT_FIELDS, ARTIFACT_FIELDS);
  const checked = validateRawArtifacts(mapping, input.taxonomy, copied);
  const { input: rawInput, response, declaration, sourceDeclaration } = checked;
  const source = rawInput.sources[0]!;
  const artifactNodes = ARTIFACT_FIELDS.map((name) => createManualArtifactNode(`artifact-${name === "sourceDeclaration" ? "source-declaration" : name}`,
    ARTIFACT_KINDS[name], copied[name]));
  const artifactId = (name: (typeof ARTIFACT_FIELDS)[number]) => `artifact-${name === "sourceDeclaration" ? "source-declaration" : name}`;
  const artifactRef = (name: (typeof ARTIFACT_FIELDS)[number]) => ({
    id: artifactId(name), bytesHash: (artifactNodes.find((node) => node.id === artifactId(name))!.payload as any).bytesHash,
  });
  const sourceHash = hash(new TextEncoder().encode(source.text));
  const permission = {
    schemaVersion: "internal-source-permission/1", id: input.permissionId, sourceVersionId: source.sourceVersionId,
    sourceTextHash: sourceHash, state: "INTERNAL_EXPERIMENT_AUTHORIZED", allowedUses: ["DISPLAY", "GENERATE"],
    scope: "LOCAL_PRIVATE_DRAFT_REVIEW", territories: source.rights.territories, validFrom: source.rights.validFrom,
    validUntil: source.rights.validUntil, authorizationEvidenceRef: source.rights.evidence,
    copyrightVerification: "UNVERIFIED", publicationPermission: false,
  };
  const authoring = {
    schemaVersion: "manual-source-authoring/1", id: input.authoringId, sourceVersionId: source.sourceVersionId,
    sourceTextHash: sourceHash, kind: "CORPUS_IMPORTED", declarationEvidenceRef: artifactId("sourceDeclaration"),
    exactModelRevision: null, scientificVerification: "UNVERIFIED", copyrightVerification: "UNVERIFIED",
  };
  const promptHash = digestManualCanonicalV4(checked.prompt);
  const inputHash = digestManualCanonicalV4(rawInput);
  const responseHash = hash(copied.response);
  const run = ManualRunV4Schema.parse({
    schemaVersion: "manual-llm-run/1", manualRunId: input.manualRunId, kind: "DETERMINISTIC_CORPUS_EXTRACTION",
    declaredOperatorId: rawInput.operatorId, declaredModel: declaration.model, exactModelRevision: null,
    declaredAt: declaration.generatedAt, interface: declaration.interface, timestampMeaning: "LOCAL_DECLARATION_ASSEMBLY",
    promptTemplateVersion: MANUAL_INTERACTION_PROMPT_VERSION, sourceVersionIds: [source.sourceVersionId], inputHash,
    promptHash, responseHash, artifactRefs: {
      input: artifactRef("input"), prompt: artifactRef("prompt"), response: artifactRef("response"),
      declaration: artifactRef("declaration"), sourceDeclaration: artifactRef("sourceDeclaration"),
    }, usage: null, usageVerification: "UNVERIFIED", providerCalled: false, providerRunRef: null, generationRunId: null,
  });
  const taxonomyNode: ReferenceNode = { kind: "taxonomy", id: mapping.taxonomy.registeredVersionId,
    payload: input.taxonomy as Record<string, JsonValue>, references: [], contentHash: "" };
  const sourceNode: ReferenceNode = { kind: "source", id: source.sourceVersionId,
    payload: { title: source.title, content: [{ type: "text", text: source.text }] } as any, references: [], contentHash: "" };
  const permissionNode: ReferenceNode = { kind: "evidence", id: permission.id, payload: permission as any,
    references: [{ kind: "source", id: sourceNode.id }, { kind: "evidence", id: artifactId("input") }], contentHash: "" };
  const authoringNode: ReferenceNode = { kind: "evidence", id: authoring.id, payload: authoring as any,
    references: [{ kind: "source", id: sourceNode.id }, { kind: "evidence", id: artifactId("sourceDeclaration") }], contentHash: "" };
  const runNode: ReferenceNode = { kind: "evidence", id: run.manualRunId, payload: run as any,
    references: [{ kind: "source", id: sourceNode.id }, { kind: "evidence", id: permission.id },
      { kind: "evidence", id: authoring.id }, ...artifactNodes.map((node) => ({ kind: "evidence" as const, id: node.id }))], contentHash: "" };
  const provenance = { sourceVersionId: source.sourceVersionId, origin: "IMPORTED" as const, sourceSpan: null,
    transformation: CORPUS_INTERACTIONS_TRANSFORMATION, creator: mapping.registeredAuthorId, sourcePermissionId: permission.id };
  const provenanceNode: ReferenceNode = { kind: "provenance", id: "manual-provenance", payload: {
    schemaVersion: "manual-candidate-provenance/1", ...provenance, manualRunId: run.manualRunId,
  } as any, references: [{ kind: "source", id: sourceNode.id }, { kind: "evidence", id: permission.id },
    { kind: "evidence", id: authoring.id }, { kind: "evidence", id: run.manualRunId }], contentHash: "" };
  const stimulusId = mapping.candidates[0]!.stimulusVersionId!;
  const stimulusNode: ReferenceNode = { kind: "stimulus", id: stimulusId,
    payload: { content: [{ type: "text", text: source.text }], provenanceIds: [provenanceNode.id] } as any,
    references: [{ kind: "provenance", id: provenanceNode.id }], contentHash: "" };
  const nodes: ReferenceNode[] = [taxonomyNode, sourceNode, ...artifactNodes, permissionNode, authoringNode, runNode, provenanceNode, stimulusNode];
  const candidates: FactoryPackageV4["candidates"] = [];
  for (const item of mapping.candidates) {
    const draft = response.questions[item.candidateOrdinal];
    need(draft && draft.id === item.rawQuestionId, "Raw draft mapping mismatch");
    const mapId = `manual-map-${item.candidateOrdinal}`;
    const evidenceId = `manual-evidence-${item.candidateOrdinal}`;
    const targetSkill = mapping.taxonomy.nodes.find((node) => node.stagingCode === draft.skillId)?.registeredCode;
    need(targetSkill, "Missing skill mapping");
    const mapPayload = {
      schemaVersion: "manual-candidate-map/1", rawQuestionId: item.rawQuestionId,
      candidateOrdinal: item.candidateOrdinal, responseArtifactId: artifactId("response"), responseHash,
      declaredOperatorId: rawInput.operatorId, registeredAuthorId: mapping.registeredAuthorId,
      stagingTaxonomyVersionId: mapping.taxonomy.stagingVersionId, registeredTaxonomyVersionId: mapping.taxonomy.registeredVersionId,
      taxonomyMappingHash: digestManualCanonicalV4(mapping.taxonomy), questionId: item.questionId,
      questionVersionId: item.questionVersionId, versionNo: 1, parentVersionId: null, stimulusVersionId: item.stimulusVersionId,
      targetDomainId: "READING", targetSkillIds: [targetSkill], createdAt: declaration.generatedAt,
    };
    nodes.push({ kind: "evidence", id: mapId, payload: mapPayload as any,
      references: [{ kind: "evidence", id: run.manualRunId }, { kind: "taxonomy", id: taxonomyNode.id }], contentHash: "" });
    nodes.push({ kind: "evidence", id: evidenceId, payload: {
      schemaVersion: "manual-question-evidence/1", sourceVersionId: sourceNode.id, rawQuestionId: draft.id,
      evidence: draft.evidence, distractorReasons: draft.distractorReasons, cognitiveLevel: draft.cognitiveLevel,
      calibration: "NOT_PERFORMED", classification: "PROVISIONAL_M1_NEEDS_OWNER_CLASSIFICATION",
      adaptationFlags: draft.adaptationFlags, adaptationDetails: draft.adaptationDetails,
    } as any, references: [{ kind: "source", id: sourceNode.id }, { kind: "evidence", id: artifactId("response") }], contentHash: "" });
    const question = QuestionVersionV3Schema.parse({
      schemaVersion: "question/3", id: item.questionVersionId, questionId: item.questionId, versionNo: 1,
      parentVersionId: null, language: "vi-VN", section: "READING", taxonomyVersionId: taxonomyNode.id,
      domainId: "READING", skillIds: [targetSkill], subskillIds: [], cognitiveLevel: "M1",
      difficulty: { target: null, predicted: null, empiricalStudyId: null }, content: draft.content,
      stimulusVersionId: stimulusId, interaction: draft.interaction, private: {
        answerKey: draft.answerKey, explanation: draft.explanation, evidenceRefs: [mapId, evidenceId], scoringPolicy: "practice-binary-v3",
      }, origin: "IMPORTED", provenanceIds: [provenanceNode.id], generationRunId: null,
      createdBy: mapping.registeredAuthorId, createdAt: declaration.generatedAt, contentHash: `sha256:${"0".repeat(64)}`,
    });
    finalizeManualReferenceGraph(nodes);
    const identity = computeQuestionIdentity(question, nodes.filter((node) => isManualReferenceReachable(node, nodes, manualQuestionRoots(question))));
    const canonicalQuestion = QuestionVersionV3Schema.parse({ ...question, contentHash: identity.contentHash });
    candidates.push({ itemKey: "corpus-reading-interaction-group", candidateOrdinal: item.candidateOrdinal,
      contentHash: identity.contentHash, question: canonicalQuestion, provenance, manualRunId: run.manualRunId,
      validations: [{ validatorKind: "CORPUS_READING_INTERACTIONS_DETERMINISTIC", validatorVersion: mapping.profile,
        inputHash: identity.contentHash, outcome: "PASS", evidencePointer: evidenceId,
        at: declaration.generatedAt, actor: mapping.registeredAuthorId }],
    });
  }
  finalizeManualReferenceGraph(nodes);
  return Package.parse({ schemaVersion: "factory-package/4", profile: mapping.profile,
    producerNamespace: mapping.producerNamespace, batchKey: mapping.batchKey, manualRun: run,
    sourcePermissions: [permission], sourceAuthoring: [authoring], candidates, references: nodes, assets: [] });
}
