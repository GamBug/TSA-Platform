import { z } from "zod";
import {
  AnswerKeySchema,
  InteractionSchema,
  MachineValidationEvidenceSchema,
  QuestionVersionSchema,
} from "./index.ts";

export const MANUAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const MANUAL_HASH = /^sha256:[0-9a-f]{64}$/;
export const MANUAL_PROMPT_VERSION = "reading-evidence/1";
export const MANUAL_CRITIC_PROMPT_VERSION = "reading-manual-blinded-critic/1";

const nonblank = (value: string): boolean => value.trim().length > 0;
export const ManualTextSchema = z.string().min(1).max(20_000).refine(nonblank, "Expected nonblank text");
const BoundedText = z.string().min(1).max(2_000).refine(nonblank, "Expected nonblank text");
const Uuid = z.string().regex(MANUAL_UUID, "Expected a canonical lowercase UUID");
const Hash = z.string().regex(MANUAL_HASH, "Expected a lowercase SHA-256 digest");
const Instant = z.iso.datetime({ offset: true });

const StagingTaxonomyNode = z.object({
  id: Uuid,
  code: BoundedText,
  kind: z.enum(["DOMAIN", "SKILL", "SUBSKILL"]),
  parentId: Uuid.nullable(),
  metadata: z.record(z.string(), z.unknown()),
}).strict();

export const ManualTaxonomySchema = z.object({
  schemaVersion: z.literal("taxonomy/1"),
  taxonomyVersionId: Uuid,
  name: BoundedText,
  versionNo: z.number().int().positive(),
  definitionHash: BoundedText,
  nodes: z.array(StagingTaxonomyNode).min(1).max(100),
}).strict();

const LegalRights = z.object({
  state: z.enum(["OWNED", "LICENSED", "OPEN_LICENSE", "PUBLIC_DOMAIN"]),
  allowedUses: z.array(z.enum(["DISPLAY", "ADAPT", "GENERATE", "TRAIN"])).min(1),
  territories: z.array(BoundedText).min(1),
  validFrom: Instant,
  validUntil: Instant.nullable(),
  evidence: BoundedText,
}).strict();

const InternalRawRights = z.object({
  state: z.literal("INTERNAL_EXPERIMENT_AUTHORIZED"),
  allowedUses: z.array(z.enum(["DISPLAY", "GENERATE"])),
  territories: z.array(BoundedText).min(1),
  validFrom: Instant,
  validUntil: Instant.nullable(),
  evidence: BoundedText,
  copyrightVerification: z.literal("UNVERIFIED"),
  publicationPermission: z.literal(false),
}).strict();

const ManualSource = z.object({
  sourceVersionId: Uuid,
  title: ManualTextSchema,
  text: ManualTextSchema,
  sourceUri: BoundedText,
  attribution: BoundedText,
  skillId: BoundedText,
  rights: z.union([LegalRights, InternalRawRights]),
}).strict();

export const ManualInputSchema = z.object({
  schemaVersion: z.literal("reading-input/1"),
  producerNamespace: BoundedText,
  batchKey: BoundedText,
  operatorId: Uuid,
  taxonomy: ManualTaxonomySchema,
  sources: z.array(ManualSource).length(1),
}).strict();

export const ManualDeclarationSchema = z.object({
  schemaVersion: z.literal("manual-llm-declaration/1"),
  operatorId: z.string().uuid(),
  model: BoundedText.refine((value) => !value.includes("REPLACE_"), "Declaration template was not completed"),
  exactModelRevision: BoundedText.nullable(),
  generatedAt: Instant,
  interface: BoundedText,
  promptHash: Hash,
  usage: z.null(),
  usageVerification: z.literal("UNVERIFIED"),
  evidenceNote: BoundedText,
}).strict();

const TextBlocks = z.array(z.object({ type: z.literal("text"), text: ManualTextSchema }).strict()).min(1).max(20);
const DraftEvidence = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: ManualTextSchema,
  rationale: ManualTextSchema,
}).strict();

export const ManualDraftSchema = z.object({
  id: ManualTextSchema,
  content: TextBlocks,
  interaction: InteractionSchema,
  answerKey: AnswerKeySchema,
  explanation: TextBlocks,
  skillId: ManualTextSchema,
  cognitiveLevel: z.enum(["M1", "M2", "M3"]),
  evidence: DraftEvidence,
  distractorReasons: z.array(z.object({ choiceId: ManualTextSchema, reason: ManualTextSchema }).strict()).max(10),
}).strict();

export const ManualResponseSchema = z.object({ questions: z.array(ManualDraftSchema).length(10) }).strict();

const PromptEvidenceSpan = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: ManualTextSchema,
}).strict();

export const ManualPromptSchema = z.object({
  version: z.literal(MANUAL_PROMPT_VERSION),
  instructions: z.array(BoundedText).min(1).max(20),
  schemaVersion: z.literal("reading-draft-output/1"),
  skillId: BoundedText,
  sourceVersionId: Uuid,
  sourceData: ManualTextSchema,
  taxonomyVersionId: Uuid,
  outputJsonSchema: z.record(z.string(), z.unknown()),
  evidenceSpans: z.array(PromptEvidenceSpan).max(100),
  extraInstructions: z.array(BoundedText).max(20),
  revisionBrief: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const ManualSourceDeclarationSchema = z.object({
  kind: z.literal("AI_AUTHORED_EXPERIMENTAL"),
  model: BoundedText,
  exactModelRevision: BoundedText.nullable(),
  authoringInterface: BoundedText,
  recordedAt: Instant,
  authorizationEvidence: BoundedText,
  operatorIdentityScope: BoundedText,
  prompt: z.unknown().optional(),
}).strict();

export const ManualCriticResponseSchema = z.object({
  checks: z.array(z.object({
    id: z.string().min(1),
    answerKey: AnswerKeySchema,
    unambiguous: z.boolean(),
    cognitiveLevelAppropriate: z.boolean(),
    entailmentSupported: z.boolean(),
    reason: z.string().min(1),
    evidenceQuote: z.string().min(1),
  }).strict()).length(10),
}).strict();

export const ManualCriticNotesSchema = z.object({
  provenance: z.literal("TRANSCRIBED_FROM_RECORDED_CRITIC_MESSAGE"),
  notes: z.array(z.object({
    questionId: BoundedText,
    code: z.literal("WEAK_DISTRACTORS"),
    reason: ManualTextSchema,
  }).strict()).max(10),
}).strict();

export const ManualArtifactKindSchema = z.enum([
  "INPUT", "PROMPT", "RESPONSE", "DECLARATION", "SOURCE_DECLARATION",
  "CRITIC_RESPONSE", "CRITIC_DECLARATION", "CRITIC_NOTES",
]);

export const ManualArtifactSchema = z.object({
  schemaVersion: z.literal("manual-artifact/1"),
  artifactKind: ManualArtifactKindSchema,
  byteLength: z.number().int().min(0).max(128 * 1024),
  bytesHash: Hash,
  bytesBase64: z.string(),
}).strict();

const ManualArtifactRefSchema = z.object({ id: BoundedText, bytesHash: Hash }).strict();
export const ManualArtifactRefsSchema = z.object({
  input: ManualArtifactRefSchema,
  prompt: ManualArtifactRefSchema,
  response: ManualArtifactRefSchema,
  declaration: ManualArtifactRefSchema,
  sourceDeclaration: ManualArtifactRefSchema,
  criticResponse: ManualArtifactRefSchema.optional(),
  criticDeclaration: ManualArtifactRefSchema.optional(),
  criticNotes: ManualArtifactRefSchema.optional(),
}).strict();

export const ManualRunSchema = z.object({
  schemaVersion: z.literal("manual-llm-run/1"),
  manualRunId: Uuid,
  kind: z.literal("MANUAL_LLM_OUTPUT"),
  declaredOperatorId: BoundedText,
  declaredModel: BoundedText,
  exactModelRevision: BoundedText.nullable(),
  declaredAt: Instant,
  interface: BoundedText,
  timestampMeaning: z.literal("LOCAL_DECLARATION_ASSEMBLY"),
  promptTemplateVersion: z.literal(MANUAL_PROMPT_VERSION),
  sourceVersionIds: z.array(BoundedText).length(1),
  inputHash: Hash,
  promptHash: Hash,
  responseHash: Hash,
  artifactRefs: ManualArtifactRefsSchema,
  usage: z.null(),
  usageVerification: z.literal("UNVERIFIED"),
  providerCalled: z.literal(false),
  providerRunRef: z.null(),
  generationRunId: z.null(),
}).strict();

export const ManualPermissionSchema = z.object({
  schemaVersion: z.literal("internal-source-permission/1"),
  id: BoundedText,
  sourceVersionId: Uuid,
  sourceTextHash: Hash,
  state: z.literal("INTERNAL_EXPERIMENT_AUTHORIZED"),
  allowedUses: z.tuple([z.literal("DISPLAY"), z.literal("GENERATE")]),
  scope: z.literal("LOCAL_PRIVATE_DRAFT_REVIEW"),
  territories: z.array(BoundedText).min(1),
  validFrom: Instant,
  validUntil: Instant.nullable(),
  authorizationEvidenceRef: BoundedText,
  copyrightVerification: z.literal("UNVERIFIED"),
  publicationPermission: z.literal(false),
}).strict();

export const ManualAuthoringSchema = z.object({
  schemaVersion: z.literal("manual-source-authoring/1"),
  id: BoundedText,
  sourceVersionId: Uuid,
  sourceTextHash: Hash,
  kind: z.literal("AI_AUTHORED_EXPERIMENTAL"),
  declarationEvidenceRef: BoundedText,
  exactModelRevision: BoundedText.nullable(),
  scientificVerification: z.literal("UNVERIFIED"),
  copyrightVerification: z.literal("UNVERIFIED"),
}).strict();

export const ManualProvenanceSchema = z.object({
  sourceVersionId: Uuid,
  origin: z.literal("GENERATED"),
  sourceSpan: z.null(),
  transformation: BoundedText,
  creator: Uuid,
  sourcePermissionId: BoundedText,
}).strict();

export const ManualCandidateSchema = z.object({
  itemKey: BoundedText,
  candidateOrdinal: z.number().int().min(0).max(9),
  contentHash: Hash,
  question: QuestionVersionSchema,
  provenance: ManualProvenanceSchema,
  manualRunId: Uuid,
  validations: z.array(MachineValidationEvidenceSchema).min(1).max(100),
}).strict();

const MappingTaxonomyNodeSchema = z.object({
  stagingCode: BoundedText,
  stagingKind: z.enum(["DOMAIN", "SKILL"]),
  registeredNodeId: Uuid,
  registeredCode: BoundedText,
  registeredKind: z.enum(["DOMAIN", "SKILL"]),
  parentCode: BoundedText.nullable(),
  section: z.literal("READING"),
}).strict();

const MappingCandidateSchema = z.object({
  rawQuestionId: BoundedText,
  candidateOrdinal: z.number().int().min(0).max(9),
  questionId: Uuid,
  questionVersionId: Uuid,
  stimulusVersionId: Uuid,
}).strict();

export const ManualImportMappingSchema = z.object({
  schemaVersion: z.literal("manual-import-mapping/1"),
  profile: z.literal("manual-reading-draft/1"),
  producerNamespace: BoundedText,
  batchKey: BoundedText,
  declaredOperatorId: BoundedText,
  registeredAuthorId: Uuid,
  sourceVersionId: Uuid,
  taxonomy: z.object({
    stagingVersionId: Uuid,
    registeredVersionId: Uuid,
    registeredDefinitionHash: Hash,
    nodes: z.array(MappingTaxonomyNodeSchema).length(2),
  }).strict(),
  candidates: z.array(MappingCandidateSchema).length(10),
}).strict();

export const ManualReferenceKindSchema = z.enum(["taxonomy", "stimulus", "provenance", "evidence", "source"]);
export const ManualReferenceKeySchema = z.object({ kind: ManualReferenceKindSchema, id: BoundedText }).strict();
export const ManualReferenceNodeSchema = z.object({
  kind: ManualReferenceKindSchema,
  id: BoundedText,
  payload: z.record(z.string(), z.unknown()),
  references: z.array(ManualReferenceKeySchema).max(100),
  contentHash: Hash,
}).strict();

export const ManualFactoryPackageV3Schema = z.object({
  schemaVersion: z.literal("factory-package/3"),
  profile: z.literal("manual-reading-draft/1"),
  producerNamespace: BoundedText,
  batchKey: BoundedText,
  manualRun: ManualRunSchema,
  sourcePermissions: z.array(ManualPermissionSchema).length(1),
  sourceAuthoring: z.array(ManualAuthoringSchema).length(1),
  candidates: z.array(ManualCandidateSchema).length(10),
  references: z.array(ManualReferenceNodeSchema).min(1).max(100),
  assets: z.array(z.never()).length(0),
}).strict();

export type ManualInput = z.infer<typeof ManualInputSchema>;
export type ManualPrompt = z.infer<typeof ManualPromptSchema>;
export type ManualResponse = z.infer<typeof ManualResponseSchema>;
export type ManualDeclaration = z.infer<typeof ManualDeclarationSchema>;
export type ManualSourceDeclaration = z.infer<typeof ManualSourceDeclarationSchema>;
export type ManualImportMapping = z.infer<typeof ManualImportMappingSchema>;
export type ManualReferenceNode = z.infer<typeof ManualReferenceNodeSchema>;
export type ManualFactoryPackageV3 = z.infer<typeof ManualFactoryPackageV3Schema>;
export type ManualArtifactKind = z.infer<typeof ManualArtifactKindSchema>;
