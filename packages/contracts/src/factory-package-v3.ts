/** Private manual DRAFT transport, absent from student and public exports. */
import { createHash } from "node:crypto";
import { QuestionVersionSchema } from "./index.ts";
import { canonicalize, computeDuplicateFingerprint, computeQuestionIdentity, type JsonValue, type ReferenceNode } from "./identity.ts";
import { ManualFactoryPackageV3Schema as Package, ManualImportMappingSchema as Mapping, ManualCorpusMathInputSchema, ManualInputSchema, MANUAL_NUMERIC_MATH_PROFILE, type ManualArtifactKind } from "./manual-factory-schemas.ts";
import { assertManualJson, parseManualJsonBytes, parseManualJsonInput, sameManualValue } from "./manual-json.ts";
import { validateManualRawArtifacts, validateManualTaxonomy } from "./manual-factory-validation.ts";
import { copyManualArtifacts, createManualArtifactNode, decodeManualArtifacts, finalizeManualReferenceGraph, isManualReferenceReachable, manualQuestionRoots } from "./manual-factory-core.ts";
export { parseManualJsonBytes } from "./manual-json.ts";
export type ManualImportMapping = ReturnType<typeof Mapping.parse>;
export type FactoryPackageV3 = ReturnType<typeof Package.parse>;

const ARTIFACT_FIELDS = [
    "input",
    "prompt",
    "response",
    "declaration",
    "sourceDeclaration",
    "criticResponse",
    "criticDeclaration",
    "criticNotes",
] as const;
const REQUIRED_ARTIFACT_FIELDS = ARTIFACT_FIELDS.slice(0, 5);
const ARTIFACT_KINDS: Record<string, ManualArtifactKind> = {
    input: "INPUT",
    prompt: "PROMPT",
    response: "RESPONSE",
    declaration: "DECLARATION",
    sourceDeclaration: "SOURCE_DECLARATION",
    criticResponse: "CRITIC_RESPONSE",
    criticDeclaration: "CRITIC_DECLARATION",
    criticNotes: "CRITIC_NOTES",
};

const hash = (value: Uint8Array) => "sha256:" + createHash("sha256").update(value).digest("hex");
export const digestManualCanonical = (value: unknown) => {
    assertManualJson(value);
    return hash(canonicalize(value));
};
function fail(message: string): never {
    throw new TypeError(message);
}
function need(condition: unknown, message: string): void {
    if (!condition) fail(message);
}
const key = (node: { kind: string; id: string }) => node.kind + "\0" + node.id;
const same = sameManualValue;

export function parseManualImportMapping(input: unknown): ManualImportMapping {
    const m = Mapping.parse(parseManualJsonInput(input, "mapping"));
    const math = m.profile === "corpus-math-draft/1" || m.profile === MANUAL_NUMERIC_MATH_PROFILE;
    const domainCode = math ? "MATH" : "READING";
    const section = domainCode;
    need(math ? m.candidates.length >= 1 && m.candidates.length <= 20 : m.candidates.length === 10,
        "Invalid candidate count for profile");
    if (!math)
        need(m.candidates.every(c => c.candidateOrdinal <= 9), "Reading candidate ordinal out of range");
    for (const field of [
        "candidateOrdinal", "rawQuestionId", "questionId", "questionVersionId"
    ] as const)
        need(new Set(m.candidates.map(c => c[field])).size === m.candidates.length, "Duplicate mapping identities");
    if (math)
        need(m.candidates.every(c => c.stimulusVersionId === null), "Independent Math items cannot share a stimulus");
    else
        need(m.candidates[0]!.stimulusVersionId !== null
            && m.candidates.every(c => c.stimulusVersionId === m.candidates[0]!.stimulusVersionId), "One complete stimulus required");
    need(!m.candidates.some(c => m.candidates.some(v => v.questionId === c.questionVersionId)), "Stable/version identities overlap");
    const domain = m.taxonomy.nodes.find(n => n.stagingKind === "DOMAIN"), skill = m.taxonomy.nodes.find(n => n.stagingKind === "SKILL");
    need(domain?.stagingCode === domainCode && domain.section === section && domain.parentCode === null
        && skill?.section === section && skill.parentCode === domainCode, "Domain mapping closure required");
    need(new Set(m.taxonomy.nodes.map(n => n.registeredNodeId)).size === 2, "Duplicate taxonomy mapping");
    return m;
}
export function buildManualFactoryPackageV3(input: Parameters<typeof construct>[0]): FactoryPackageV3 {
    const pkg = construct(input);
    need(canonicalize(pkg).byteLength <= 1024 * 1024, "Package exceeds 1 MiB");
    need(canonicalize(pkg.manualRun).byteLength <= 16 * 1024, "Run summary too large");
    const seen = new Set<string>();
    for (const c of pkg.candidates) {
        const closure = (pkg.references as ReferenceNode[]).filter(n => isManualReferenceReachable(n, pkg.references as ReferenceNode[], manualQuestionRoots(c.question)));
        const fp = computeDuplicateFingerprint(c.question, closure).fingerprint;
        need(!seen.has(fp), "Duplicate fingerprint");
        seen.add(fp);
    }
    return pkg;
}
export function parseManualFactoryPackageV3(input: unknown): FactoryPackageV3 {
    const pkg = Package.parse(parseManualJsonInput(input, "manual package"));
    const artifacts = decodeManualArtifacts(pkg.manualRun.artifactRefs, pkg.references, ARTIFACT_KINDS);
    const math = pkg.profile === "corpus-math-draft/1" || pkg.profile === MANUAL_NUMERIC_MATH_PROFILE;
    const rawInput = (math ? ManualCorpusMathInputSchema : ManualInputSchema).parse(parseManualJsonBytes(artifacts.input!, "input"));
    const source = rawInput.sources[0]!, tax = pkg.references.filter(n => n.kind === "taxonomy");
    need(tax.length === 1, "One taxonomy required");
    const taxonomy = validateManualTaxonomy(tax[0]!.payload);
    const maps = pkg.candidates.map(c => { const nodes = pkg.references.filter(n => n.kind === "evidence" && n.id === "manual-map-" + c.candidateOrdinal); need(nodes.length === 1, "Mapping node missing"); return nodes[0]!.payload; });
    const domainCode = math ? "MATH" : "READING";
    const nodes = [domainCode, source.skillId].map(code => { const from = rawInput.taxonomy.nodes.find(n => n.code === code), to = taxonomy.nodes.find(n => n.code === code); need(from && to, "Missing taxonomy code"); return {
        stagingCode: code, stagingKind: from!.kind, registeredNodeId: to!.id, registeredCode: code, registeredKind: to!.kind, parentCode: code === domainCode ? null : domainCode, section: domainCode
    }; });
    const mapping = {
        schemaVersion: "manual-import-mapping/1", profile: pkg.profile, producerNamespace: pkg.producerNamespace, batchKey: pkg.batchKey, declaredOperatorId: pkg.manualRun.declaredOperatorId, registeredAuthorId: pkg.candidates[0]!.question.createdBy, sourceVersionId: source.sourceVersionId, taxonomy: {
            stagingVersionId: rawInput.taxonomy.taxonomyVersionId, registeredVersionId: taxonomy.taxonomyVersionId, registeredDefinitionHash: taxonomy.definitionHash, nodes
        }, candidates: pkg.candidates.map((c, i) => ({
            rawQuestionId: maps[i]!.rawQuestionId, candidateOrdinal: c.candidateOrdinal, questionId: c.question.questionId, questionVersionId: c.question.id, stimulusVersionId: c.question.stimulusVersionId
        }))
    };
    if (digestManualCanonical(mapping.taxonomy) !== maps[0]!.taxonomyMappingHash)
        mapping.taxonomy.nodes.reverse();
    const expected = buildManualFactoryPackageV3({
        mapping, taxonomy, artifacts: artifacts as any, manualRunId: pkg.manualRun.manualRunId, permissionId: pkg.sourcePermissions[0]!.id, authoringId: pkg.sourceAuthoring[0]!.id, transformation: pkg.candidates[0]!.provenance.transformation
    });
    const normalize = (p: FactoryPackageV3) => ({
        ...p, references: [...p.references].map(n => ({
            ...n, references: [...n.references].sort((a, b) => key(a).localeCompare(key(b)))
        })).sort((a, b) => key(a).localeCompare(key(b)))
    });
    need(same(normalize(pkg), normalize(expected)), "Raw projection or typed graph mismatch");
    return pkg;
}
function construct(input: {
    mapping: unknown;
    taxonomy: unknown;
    artifacts: {
        input: Uint8Array;
        prompt: Uint8Array;
        response: Uint8Array;
        declaration: Uint8Array;
        sourceDeclaration: Uint8Array;
        criticResponse?: Uint8Array;
        criticDeclaration?: Uint8Array;
        criticNotes?: Uint8Array;
    };
    manualRunId: string;
    permissionId: string;
    authoringId: string;
    transformation: string;
}): FactoryPackageV3 {
    const mapping = parseManualImportMapping(input.mapping);
    const copied = copyManualArtifacts(input.artifacts, ARTIFACT_FIELDS, REQUIRED_ARTIFACT_FIELDS);
    input = {
        ...input, artifacts: copied
    };
    const checked = validateManualRawArtifacts(mapping, input.taxonomy, copied);
    const rawInput = checked.input, prompt = checked.prompt, response = checked.response, declaration = checked.declaration, sourceDeclaration = checked.sourceDeclaration;
    const source = rawInput.sources[0]!;
    const art: [
        string,
        ManualArtifactKind,
        Uint8Array
    ][] = [
        [
            "artifact-input", "INPUT", input.artifacts.input
        ], [
            "artifact-prompt", "PROMPT", input.artifacts.prompt
        ], [
            "artifact-response", "RESPONSE", input.artifacts.response
        ], [
            "artifact-declaration", "DECLARATION", input.artifacts.declaration
        ], [
            "artifact-source-declaration", "SOURCE_DECLARATION", input.artifacts.sourceDeclaration
        ]
    ];
    if (Boolean(input.artifacts.criticResponse) !== Boolean(input.artifacts.criticDeclaration))
        fail("critic pair required");
    if (input.artifacts.criticResponse) {
        art.push([
            "artifact-critic-response", "CRITIC_RESPONSE", input.artifacts.criticResponse!
        ], [
            "artifact-critic-declaration", "CRITIC_DECLARATION", input.artifacts.criticDeclaration!
        ]);
        if (input.artifacts.criticNotes)
            art.push([
                "artifact-critic-notes", "CRITIC_NOTES", input.artifacts.criticNotes
            ]);
    }
    const artifacts = art.map(([id, k, b]) => createManualArtifactNode(id, k, b));
    const ref = (id: string) => ({
        id, bytesHash: (artifacts.find(a => a.id === id)!.payload as any).bytesHash
    });
    const numeric = mapping.profile === MANUAL_NUMERIC_MATH_PROFILE;
    const math = mapping.profile === "corpus-math-draft/1" || numeric;
    const corpus = mapping.profile === "corpus-reading-draft/1" || math;
    const sourceHash = hash(new TextEncoder().encode(source.text));
    const permission = {
        schemaVersion: "internal-source-permission/1", id: input.permissionId, sourceVersionId: source.sourceVersionId, sourceTextHash: sourceHash, state: "INTERNAL_EXPERIMENT_AUTHORIZED", allowedUses: ["DISPLAY", "GENERATE"], scope: "LOCAL_PRIVATE_DRAFT_REVIEW", territories: source.rights.territories, validFrom: source.rights.validFrom, validUntil: source.rights.validUntil, authorizationEvidenceRef: source.rights.evidence, copyrightVerification: "UNVERIFIED", publicationPermission: false
    };
    const authoring = {
        schemaVersion: "manual-source-authoring/1", id: input.authoringId, sourceVersionId: source.sourceVersionId, sourceTextHash: sourceHash, kind: sourceDeclaration.kind, declarationEvidenceRef: "artifact-source-declaration", exactModelRevision: sourceDeclaration.exactModelRevision, scientificVerification: "UNVERIFIED", copyrightVerification: "UNVERIFIED"
    };
    const promptHash = digestManualCanonical(prompt), inputHash = digestManualCanonical(rawInput), responseHash = hash(input.artifacts.response);
    if (declaration.promptHash !== promptHash)
        fail("declaration prompt hash mismatch");
    if (math && sourceDeclaration.kind !== "CORPUS_IMPORTED")
        fail("Math corpus source authorship required");
    const run = {
        schemaVersion: "manual-llm-run/1", manualRunId: input.manualRunId, kind: math ? "SUBSCRIPTION_VISION_TRANSCRIPTION" : corpus ? "DETERMINISTIC_CORPUS_EXTRACTION" : "MANUAL_LLM_OUTPUT", declaredOperatorId: rawInput.operatorId, declaredModel: declaration.model, exactModelRevision: declaration.exactModelRevision, declaredAt: declaration.generatedAt, interface: declaration.interface, timestampMeaning: "LOCAL_DECLARATION_ASSEMBLY", promptTemplateVersion: prompt.version, sourceVersionIds: [source.sourceVersionId], inputHash, promptHash, responseHash, artifactRefs: {
            input: ref("artifact-input"), prompt: ref("artifact-prompt"), response: ref("artifact-response"), declaration: ref("artifact-declaration"), sourceDeclaration: ref("artifact-source-declaration"), ...(input.artifacts.criticResponse ? {
                criticResponse: ref("artifact-critic-response"), criticDeclaration: ref("artifact-critic-declaration"), ...(input.artifacts.criticNotes ? { criticNotes: ref("artifact-critic-notes") } : {})
            } : {})
        }, usage: null, usageVerification: "UNVERIFIED", providerCalled: false, providerRunRef: null, generationRunId: null
    };
    const taxonomyNode = {
        kind: "taxonomy" as const, id: mapping.taxonomy.registeredVersionId, payload: input.taxonomy as Record<string, JsonValue>, references: [], contentHash: ""
    };
    const sourceNode = {
        kind: "source" as const, id: source.sourceVersionId, payload: {
            title: source.title, content: [{
                    type: "text", text: source.text
                }]
        } as any, references: [], contentHash: ""
    };
    const pNode = {
        kind: "evidence" as const, id: permission.id, payload: permission as any, references: [{
                kind: "source" as const, id: sourceNode.id
            }, {
                kind: "evidence" as const, id: "artifact-input"
            }], contentHash: ""
    };
    const aNode = {
        kind: "evidence" as const, id: authoring.id, payload: authoring as any, references: [{
                kind: "source" as const, id: sourceNode.id
            }, {
                kind: "evidence" as const, id: "artifact-source-declaration"
            }], contentHash: ""
    };
    const runNode = {
        kind: "evidence" as const, id: run.manualRunId, payload: run as any, references: [
            {
                kind: "source" as const, id: sourceNode.id
            }, {
                kind: "evidence" as const, id: permission.id
            }, {
                kind: "evidence" as const, id: authoring.id
            }, ...artifacts.map(a => ({
                kind: "evidence" as const, id: a.id
            }))
        ], contentHash: ""
    };
    const provenance = {
        sourceVersionId: source.sourceVersionId, origin: corpus ? "IMPORTED" : "GENERATED", sourceSpan: null, transformation: input.transformation, creator: mapping.registeredAuthorId, sourcePermissionId: permission.id
    };
    const vNode = {
        kind: "provenance" as const, id: "manual-provenance", payload: {
            schemaVersion: "manual-candidate-provenance/1", ...provenance, manualRunId: run.manualRunId
        } as any, references: [
            {
                kind: "source" as const, id: sourceNode.id
            }, {
                kind: "evidence" as const, id: permission.id
            }, {
                kind: "evidence" as const, id: authoring.id
            }, {
                kind: "evidence" as const, id: run.manualRunId
            }
        ], contentHash: ""
    };
    const zId = mapping.candidates[0]!.stimulusVersionId;
    const stimulus = zId ? {
        kind: "stimulus" as const, id: zId, payload: {
            content: [{
                    type: "text", text: source.text
                }], provenanceIds: [vNode.id]
        } as any, references: [{
                kind: "provenance" as const, id: vNode.id
            }], contentHash: ""
    } : null;
    const nodes: ReferenceNode[] = [
        taxonomyNode, sourceNode, ...artifacts, pNode, aNode, runNode, vNode, ...(stimulus ? [stimulus] : [])
    ];
    const domainCode = math ? "MATH" : "READING";
    const candidates: any[] = [];
    for (const m of mapping.candidates) {
        const raw = response.questions[m.candidateOrdinal];
        if (!raw || raw.id !== m.rawQuestionId)
            fail("raw draft mapping mismatch");
        if (raw.evidence?.end <= raw.evidence?.start || source.text.slice(raw.evidence.start, raw.evidence.end) !== raw.evidence.quote)
            fail("raw evidence mismatch");
        const x = {
            schemaVersion: "manual-candidate-map/1", rawQuestionId: m.rawQuestionId, candidateOrdinal: m.candidateOrdinal, responseArtifactId: "artifact-response", responseHash, declaredOperatorId: rawInput.operatorId, registeredAuthorId: mapping.registeredAuthorId, stagingTaxonomyVersionId: mapping.taxonomy.stagingVersionId, registeredTaxonomyVersionId: mapping.taxonomy.registeredVersionId, taxonomyMappingHash: digestManualCanonical(mapping.taxonomy), questionId: m.questionId, questionVersionId: m.questionVersionId, versionNo: 1, parentVersionId: null, stimulusVersionId: m.stimulusVersionId, targetDomainId: domainCode, targetSkillIds: [mapping.taxonomy.nodes.find(n => n.stagingCode === raw.skillId)?.registeredCode ?? fail("missing skill mapping")], createdAt: declaration.generatedAt
        };
        const xid = "manual-map-" + m.candidateOrdinal, eid = "manual-evidence-" + m.candidateOrdinal;
        nodes.push({
            kind: "evidence", id: xid, payload: x as any, references: [{
                    kind: "evidence", id: run.manualRunId
                }, {
                    kind: "taxonomy", id: taxonomyNode.id
                }], contentHash: ""
        }, {
            kind: "evidence", id: eid, payload: {
                schemaVersion: "manual-question-evidence/1", sourceVersionId: sourceNode.id, rawQuestionId: raw.id, evidence: raw.evidence, distractorReasons: raw.distractorReasons, cognitiveLevel: raw.cognitiveLevel, calibration: "NOT_PERFORMED", ...(corpus ? { classification: "PROVISIONAL_M1_NEEDS_OWNER_CLASSIFICATION" } : {})
            } as any, references: [{
                    kind: "source", id: sourceNode.id
                }, {
                    kind: "evidence", id: "artifact-response"
                }], contentHash: ""
        });
        const q: any = {
            schemaVersion: numeric ? "question/2" : "question/1", id: m.questionVersionId, questionId: m.questionId, versionNo: 1, parentVersionId: null, language: "vi-VN", section: domainCode, taxonomyVersionId: taxonomyNode.id, domainId: domainCode, skillIds: x.targetSkillIds, subskillIds: [], cognitiveLevel: raw.cognitiveLevel, difficulty: {
                target: null, predicted: null, empiricalStudyId: null
            }, content: raw.content, stimulusVersionId: m.stimulusVersionId, interaction: raw.interaction, private: {
                answerKey: raw.answerKey, explanation: raw.explanation, evidenceRefs: [xid, eid], scoringPolicy: numeric ? "practice-binary-v2" : "practice-binary-v1"
            }, origin: corpus ? "IMPORTED" : "GENERATED", provenanceIds: [vNode.id], generationRunId: null, createdBy: mapping.registeredAuthorId, createdAt: declaration.generatedAt, contentHash: "sha256:" + "0".repeat(64)
        };
        finalizeManualReferenceGraph(nodes);
        const identity = computeQuestionIdentity(q, nodes.filter(n => isManualReferenceReachable(n, nodes, manualQuestionRoots(q))));
        q.contentHash = identity.contentHash;
        candidates.push({
            itemKey: numeric ? "corpus-math-numeric-item" : math ? "corpus-math-item" : "manual-reading-bundle", candidateOrdinal: m.candidateOrdinal, contentHash: identity.contentHash, question: q, provenance, manualRunId: run.manualRunId, validations: [{
                    validatorKind: math ? "CORPUS_MATH_TRANSCRIPTION" : corpus ? "CORPUS_READING_DETERMINISTIC" : "MANUAL_READING_DETERMINISTIC", validatorVersion: mapping.profile, inputHash: identity.contentHash, outcome: "PASS", evidencePointer: eid, at: declaration.generatedAt, actor: mapping.registeredAuthorId
                }]
        });
    }
    finalizeManualReferenceGraph(nodes);
    return Package.parse({
        schemaVersion: "factory-package/3", profile: mapping.profile, producerNamespace: mapping.producerNamespace, batchKey: mapping.batchKey, manualRun: run, sourcePermissions: [permission], sourceAuthoring: [authoring], candidates, references: nodes, assets: []
    });
}
