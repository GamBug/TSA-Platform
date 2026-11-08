import { digestManualCanonical } from "../../src/factory-package-v3.ts";
import { ManualResponseSchema } from "../../src/manual-factory-schemas.ts";
import { z } from "zod";

const enc = new TextEncoder();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const raw = (value: unknown) => enc.encode(JSON.stringify(value));

export function buildManualFixture() {
  const author = id(1), taxonomy = id(2), sourceId = id(3), operator = id(7);
  const input = { schemaVersion: "reading-input/1", producerNamespace: "manual-test", batchKey: "batch-1", operatorId: operator, taxonomy: { schemaVersion: "taxonomy/1", taxonomyVersionId: id(4), name: "staging", versionNo: 1, definitionHash: "sha256:" + "a".repeat(64), nodes: [{ id: id(8), code: "READING", kind: "DOMAIN", parentId: null, metadata: {} }, { id: id(9), code: "skill", kind: "SKILL", parentId: id(8), metadata: {} }] }, sources: [{ sourceVersionId: sourceId, title: "Fixture", text: "Evidence.", sourceUri: "private", attribution: "private", skillId: "skill", rights: { state: "INTERNAL_EXPERIMENT_AUTHORIZED", allowedUses: ["DISPLAY", "GENERATE"], territories: ["VN"], validFrom: "2026-01-01T00:00:00Z", validUntil: null, evidence: "private", copyrightVerification: "UNVERIFIED", publicationPermission: false } }] };
  const prompt = { version: "reading-evidence/1", instructions: ["data"], schemaVersion: "reading-draft-output/1", skillId: "skill", sourceVersionId: sourceId, sourceData: "Evidence.", taxonomyVersionId: id(4), outputJsonSchema: JSON.parse(JSON.stringify(z.toJSONSchema(ManualResponseSchema))), evidenceSpans: [], extraInstructions: [] };
  const questions = Array.from({ length: 10 }, (_, index) => ({ id: `raw-${index}`, content: [{ type: "text", text: `Question ${index}` }], interaction: { type: "SINGLE_CHOICE", options: [{ id: "a", content: [{ type: "text", text: "No" }] }, { id: "b", content: [{ type: "text", text: "Yes" }] }] }, answerKey: { type: "SINGLE_CHOICE", optionId: "b" }, explanation: [{ type: "text", text: "Because." }], skillId: "skill", cognitiveLevel: index < 4 ? "M1" : index < 7 ? "M2" : "M3", evidence: { start: 0, end: 9, quote: "Evidence.", rationale: "Exact." }, distractorReasons: [{ choiceId: "a", reason: "No." }] }));
  const mapping = { schemaVersion: "manual-import-mapping/1", profile: "manual-reading-draft/1", producerNamespace: "manual-test", batchKey: "batch-1", declaredOperatorId: operator, registeredAuthorId: author, sourceVersionId: sourceId, taxonomy: { stagingVersionId: id(4), registeredVersionId: taxonomy, registeredDefinitionHash: "sha256:" + "b".repeat(64), nodes: [{ stagingCode: "READING", stagingKind: "DOMAIN", registeredNodeId: id(5), registeredCode: "READING", registeredKind: "DOMAIN", parentCode: null, section: "READING" }, { stagingCode: "skill", stagingKind: "SKILL", registeredNodeId: id(6), registeredCode: "skill", registeredKind: "SKILL", parentCode: "READING", section: "READING" }] }, candidates: Array.from({ length: 10 }, (_, index) => ({ rawQuestionId: `raw-${index}`, candidateOrdinal: index, questionId: id(10 + index), questionVersionId: id(20 + index), stimulusVersionId: id(30) })) };
  const declaration = { schemaVersion: "manual-llm-declaration/1", operatorId: operator, model: "unknown", exactModelRevision: null, generatedAt: "2026-01-02T00:00:00Z", interface: "manual", promptHash: "pending", usage: null, usageVerification: "UNVERIFIED", evidenceNote: "operator declaration" };
  const artifacts = { input: raw(input), prompt: raw(prompt), response: raw({ questions }), declaration: raw(declaration), sourceDeclaration: raw({ kind: "AI_AUTHORED_EXPERIMENTAL", model: "unknown", exactModelRevision: null, authoringInterface: "manual", recordedAt: "2026-01-01T00:00:00Z", authorizationEvidence: "private", operatorIdentityScope: "private" }) };
  // Builder verifies the declaration digest; populate it from the prompt without relying on private content.
  declaration.promptHash = digestManualCanonical(prompt);
  artifacts.declaration = raw(declaration);
  const target = { ...input.taxonomy, taxonomyVersionId: taxonomy, definitionHash: mapping.taxonomy.registeredDefinitionHash,
    nodes: mapping.taxonomy.nodes.map(n=>({id:n.registeredNodeId,code:n.registeredCode,kind:n.registeredKind,parentId:n.parentCode===null?null:id(5),metadata:{}})) };
  return { mapping, taxonomy: target, artifacts, manualRunId: id(40), permissionId: "permission-1", authoringId: "authoring-1", transformation: "private fixture", author };
}

