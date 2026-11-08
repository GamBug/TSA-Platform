import { z } from "zod";
import { BlueprintConfigSchema, validateBlueprintStructure } from "./index.ts";

export const InteractionTypeV2Schema = z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE_GROUP", "NUMERIC_RESPONSE"]);
export const BlueprintConfigV2Schema = z.object({
  ...BlueprintConfigSchema.shape,
  schemaVersion: z.literal("blueprint/2"),
  allowedTypes: z.array(InteractionTypeV2Schema).min(1),
  scoringPolicy: z.literal("practice-binary-v2"),
}).strict().superRefine(validateBlueprintStructure).superRefine((blueprint, context) => {
  if (blueprint.profileKind !== "INDEPENDENT_PRACTICE" || blueprint.sections.length !== 1) {
    context.addIssue({ code: "custom", message: "Versioned numeric practice requires one independent section" });
  }
});
export type BlueprintConfigV2 = z.infer<typeof BlueprintConfigV2Schema>;
