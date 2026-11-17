import { z } from "zod";
import { BlueprintConfigSchema, validateBlueprintStructure } from "./index.ts";

export const InteractionTypeV4Schema = z.enum([
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE_GROUP",
  "NUMERIC_RESPONSE",
  "CLOZE",
  "MATCHING",
]);

export const BlueprintConfigV4Schema = z.object({
  ...BlueprintConfigSchema.shape,
  schemaVersion: z.literal("blueprint/4"),
  allowedTypes: z.array(InteractionTypeV4Schema).min(1).max(6),
  scoringPolicy: z.literal("practice-binary-v3"),
}).strict().superRefine(validateBlueprintStructure).superRefine((blueprint, context) => {
  if (new Set(blueprint.allowedTypes).size !== blueprint.allowedTypes.length) {
    context.addIssue({ code: "custom", path: ["allowedTypes"], message: "Allowed interaction types must be unique" });
  }
  if (blueprint.profileKind !== "INDEPENDENT_PRACTICE" || blueprint.sections.length !== 1) {
    context.addIssue({ code: "custom", message: "Cloze and matching practice requires one independent section" });
  }
});

export type BlueprintConfigV4 = z.infer<typeof BlueprintConfigV4Schema>;
