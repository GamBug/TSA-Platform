import { z } from "zod";
import { BlueprintConfigSchema, InteractionTypeSchema, validateBlueprintStructure } from "./index.ts";
import { FULL_SIMULATION_SECTIONS } from "./simulation.ts";

/** A fixed 100-question, three-section blueprint for the chess-clock simulation. */
export const BlueprintConfigV3Schema = z.object({
  ...BlueprintConfigSchema.shape,
  schemaVersion: z.literal("blueprint/3"),
  profileKind: z.literal("FULL_SIMULATION"),
  allowedTypes: z.array(InteractionTypeSchema).min(1),
  scoringPolicy: z.literal("practice-binary-v1"),
}).strict().superRefine((blueprint, context) =>
  validateBlueprintStructure({ ...blueprint, profileKind: "INDEPENDENT_PRACTICE" }, context))
  .superRefine((blueprint, context) => {
  if (blueprint.sections.some((section, index) => {
    const schedule = FULL_SIMULATION_SECTIONS[index];
    return schedule === undefined || section.id !== schedule.id || section.section !== schedule.section
      || section.count !== schedule.count || section.durationSeconds !== schedule.durationSeconds;
  }) || blueprint.sections.length !== FULL_SIMULATION_SECTIONS.length) {
    context.addIssue({ code: "custom", path: ["sections"], message: "Simulation requires the fixed MATH 40/3600, READING 20/1800, SCIENCE 40/3600 schedule" });
  }
  if (blueprint.bundlePolicy !== "ALL_OR_NONE" || blueprint.releasePolicy !== "after-grade-v1") {
    context.addIssue({ code: "custom", message: "Simulation requires the existing sealed-form and after-grade release policies" });
  }
});

export type BlueprintConfigV3 = z.infer<typeof BlueprintConfigV3Schema>;
