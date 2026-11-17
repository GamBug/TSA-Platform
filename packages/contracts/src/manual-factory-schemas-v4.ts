import { z } from "zod";
import { QuestionVersionV3Schema, InteractionV3Schema, AnswerKeyV3Schema } from "./question-v3.ts";
import {
  ManualArtifactRefsSchema,
  ManualArtifactSchema,
  ManualCandidateSchema,
  ManualDeclarationSchema,
  ManualDraftSchema,
  ManualFactoryPackageV3Schema,
  ManualImportMappingSchema,
  ManualInputSchema,
  ManualPromptSchema,
  ManualRunSchema,
  ManualSourceDeclarationSchema,
} from "./manual-factory-schemas.ts";

export const MANUAL_INTERACTION_PROFILE = "corpus-reading-interactions-draft/1" as const;
export const MANUAL_INTERACTION_PROMPT_VERSION = "reading-interactions/1" as const;

export const ManualInputV4Schema = ManualInputSchema.extend({
  schemaVersion: z.literal("reading-interactions-input/1"),
});

export const ManualAdaptationFlagSchema = z.enum([
  "MULTIPLE_CHOICE_SELECTION_RANGE_NOT_CAPTURED",
  "MATCHING_TARGET_POOL_DERIVED_FROM_CAPTURED_CORRECT_TEXTS",
  "MATCHING_TARGET_REUSE_MAXIMUM_SET_TO_ROW_COUNT",
  "MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION",
]);

const ManualAdaptationDetailSchema = z.object({
  flag: z.literal("MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION"),
  visibleBlankCount: z.number().int().min(0).max(40),
  capturedPositionCount: z.number().int().min(1).max(40),
}).strict();

export const ManualDraftV4Schema = ManualDraftSchema.extend({
  interaction: InteractionV3Schema,
  answerKey: AnswerKeyV3Schema,
  cognitiveLevel: z.literal("M1"),
  adaptationFlags: z.array(ManualAdaptationFlagSchema).max(4),
  adaptationDetails: z.array(ManualAdaptationDetailSchema).max(1),
});

export const ManualResponseV4Schema = z.object({
  questions: z.array(ManualDraftV4Schema).min(7).max(8),
}).strict();

export const ManualPromptV4Schema = ManualPromptSchema.omit({ version: true, schemaVersion: true }).extend({
  version: z.literal(MANUAL_INTERACTION_PROMPT_VERSION),
  schemaVersion: z.literal("reading-interactions-output/1"),
});

const SourceCandidateSchema = z.object({
  id: z.string().min(1),
  sourceHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  interactionType: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "CLOZE", "MATCHING"]),
  adaptationFlags: z.array(ManualAdaptationFlagSchema).max(4),
  adaptationDetails: z.array(ManualAdaptationDetailSchema).max(1),
}).strict();

export const ManualSourceDeclarationV4Schema = ManualSourceDeclarationSchema.extend({
  prompt: z.object({
    schemaVersion: z.literal("corpus-reading-interactions-capture/1"),
    passageId: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    candidates: z.array(SourceCandidateSchema).min(7).max(8),
    deferred: z.array(z.object({
      path: z.string().min(1),
      sourceHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
      reason: z.literal("NO_EXPLICIT_SOURCE_KEY"),
    }).strict()).min(2).max(3),
    classification: z.literal("PROVISIONAL_M1_NEEDS_OWNER_CLASSIFICATION"),
    matchingAdaptation: z.object({
      targetSource: z.literal("CAPTURED_CORRECT_TEXTS"),
      targetOrdering: z.literal("CODE_POINT_ASCENDING"),
      maxUses: z.literal("ROW_COUNT"),
    }).strict(),
    explanation: z.literal("NOT_RETAINED"),
  }).strict(),
});

export const ManualRunV4Schema = ManualRunSchema.omit({ promptTemplateVersion: true }).extend({
  promptTemplateVersion: z.literal(MANUAL_INTERACTION_PROMPT_VERSION),
});

export const ManualCandidateV4Schema = ManualCandidateSchema.extend({ question: QuestionVersionV3Schema });

const ReadingImportMappingV4Schema = ManualImportMappingSchema.omit({ profile: true }).extend({
  profile: z.literal(MANUAL_INTERACTION_PROFILE),
  candidates: ManualImportMappingSchema.shape.candidates.element.array().min(7).max(8),
});

const ReadingFactoryPackageV4Schema = z.object({
  schemaVersion: z.literal("factory-package/4"),
  profile: z.literal(MANUAL_INTERACTION_PROFILE),
  producerNamespace: ManualImportMappingSchema.shape.producerNamespace,
  batchKey: ManualImportMappingSchema.shape.batchKey,
  manualRun: ManualRunV4Schema,
  sourcePermissions: z.array(ManualFactoryPackageV3Schema.shape.sourcePermissions.element).length(1),
  sourceAuthoring: z.array(ManualFactoryPackageV3Schema.shape.sourceAuthoring.element).length(1),
  candidates: z.array(ManualCandidateV4Schema).min(7).max(8),
  references: z.array(ManualFactoryPackageV3Schema.shape.references.element).min(1).max(100),
  assets: z.array(z.never()).length(0),
}).strict().superRefine((pkg, context) => {
  if (pkg.candidates.some((candidate) => candidate.candidateOrdinal > 7)) {
    context.addIssue({ code: "custom", path: ["candidates"], message: "Candidate ordinal out of range" });
  }
  if (new Set(pkg.candidates.map((candidate) => candidate.candidateOrdinal)).size !== pkg.candidates.length) {
    context.addIssue({ code: "custom", path: ["candidates"], message: "Candidate ordinals must be unique" });
  }
});

export const MATH_INTERACTION_PROFILE = "corpus-math-interactions-draft/1" as const;
export const MATH_INTERACTION_PROMPT_VERSION = "math-interactions/1" as const;
export const MathInteractionInputSchema = ManualInputSchema.extend({ schemaVersion: z.literal("math-interactions-input/1") });
export const MathInteractionResponseSchema = z.object({
  questions: z.array(ManualDraftV4Schema).min(1).max(20),
}).strict().superRefine((value, ctx) => {
  if (value.questions.some((q) => !["CLOZE", "MATCHING"].includes(q.interaction.type))) {
    ctx.addIssue({ code: "custom", message: "Math interaction profile accepts cloze and matching only" });
  }
});
export const MathInteractionPromptSchema = ManualPromptSchema.omit({ version: true, schemaVersion: true }).extend({
  version: z.literal(MATH_INTERACTION_PROMPT_VERSION), schemaVersion: z.literal("math-interactions-output/1"),
});
export const MathInteractionSourceDeclarationSchema = ManualSourceDeclarationSchema.extend({
  prompt: z.object({
    schemaVersion: z.literal("corpus-math-interactions-capture/1"),
    classification: z.literal("PROVISIONAL_M1_NEEDS_OWNER_CLASSIFICATION"),
    explanation: z.literal("NOT_RETAINED"),
    candidates: z.array(SourceCandidateSchema.extend({
      answerKey: AnswerKeyV3Schema,
      extractedKeyText: z.array(z.string().min(1)).min(1).max(40),
      targetPoolSource: z.enum(["VISIBLE_SOURCE_POOL", "CAPTURED_CORRECT_TEXTS"]).nullable(),
      capturedTargetLabels: z.array(z.string().min(1)).max(40),
    })).min(1).max(20),
  }).strict(),
});
const MathImportMappingSchema = ManualImportMappingSchema.omit({ profile: true }).extend({
  profile: z.literal(MATH_INTERACTION_PROFILE),
  candidates: ManualImportMappingSchema.shape.candidates.element.array().min(1).max(20),
});
export const MathInteractionRunSchema = ManualRunSchema.omit({ promptTemplateVersion: true }).extend({
  promptTemplateVersion: z.literal(MATH_INTERACTION_PROMPT_VERSION),
});
const MathFactoryPackageSchema = z.object({
  ...ReadingFactoryPackageV4Schema.shape,
  profile: z.literal(MATH_INTERACTION_PROFILE),
  manualRun: MathInteractionRunSchema,
  candidates: z.array(ManualCandidateV4Schema).min(1).max(20),
}).strict();
export const ManualImportMappingV4Schema = z.union([ReadingImportMappingV4Schema, MathImportMappingSchema]);
export const ManualFactoryPackageV4Schema = z.union([ReadingFactoryPackageV4Schema, MathFactoryPackageSchema]);

export const ManualArtifactRefsV4Schema = ManualArtifactRefsSchema;
export const ManualArtifactV4Schema = ManualArtifactSchema;
export const ManualDeclarationV4Schema = ManualDeclarationSchema;

export type ManualInputV4 = z.infer<typeof ManualInputV4Schema>;
export type ManualResponseV4 = z.infer<typeof ManualResponseV4Schema>;
export type ManualImportMappingV4 = z.infer<typeof ManualImportMappingV4Schema>;
export type ManualFactoryPackageV4 = z.infer<typeof ManualFactoryPackageV4Schema>;
