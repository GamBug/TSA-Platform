import { z } from "zod";
import {
  FormModeSchema,
  ReleasedReviewItemSchema,
  ResultSectionTotalSchema,
  ReuseModeSchema,
} from "./index.ts";
import { FULL_SIMULATION_SECTIONS } from "./simulation.ts";

const CanonicalUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const Instant = z.string().refine((value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)));
const PracticeScoreSchema = z.object({
  correctCount: z.number().int().nonnegative(),
  totalCount: z.literal(100),
  percentage: z.string().regex(/^(?:0|[1-9]\d?|100)\.\d{2}$/),
}).strict().superRefine((score, context) => {
  if (score.correctCount > score.totalCount) {
    context.addIssue({ code: "custom", path: ["correctCount"], message: "Correct count must not exceed total count" });
  }
});

export const SimulationResultViewV3Schema = z.object({
  attemptId: CanonicalUuid,
  scoreRunId: CanonicalUuid,
  formMode: FormModeSchema,
  reuseMode: ReuseModeSchema,
  policyVersion: z.literal("practice-binary-v1"),
  scoreLabel: z.literal("UNOFFICIAL_PRACTICE"),
  ...PracticeScoreSchema.shape,
  sections: z.array(ResultSectionTotalSchema).length(3),
  releasedAt: Instant,
}).strict().superRefine((result, context) => {
  if (result.formMode !== "PERSONALIZED_PRACTICE" || result.reuseMode !== "NEW_ONLY") {
    context.addIssue({ code: "custom", message: "Simulation results require owner-bound NEW_ONLY practice" });
  }
  let correct = 0;
  let total = 0;
  for (const [index, section] of result.sections.entries()) {
    const schedule = FULL_SIMULATION_SECTIONS[index]!;
    if (section.sectionId !== schedule.id || section.section !== schedule.section || section.totalCount !== schedule.count) {
      context.addIssue({ code: "custom", path: ["sections", index], message: "Result sections must match the fixed simulation schedule" });
    }
    if (section.correctCount > section.totalCount) context.addIssue({ code: "custom", path: ["sections", index], message: "Correct count cannot exceed section size" });
    correct += section.correctCount;
    total += section.totalCount;
  }
  if (total !== result.totalCount || correct !== result.correctCount || result.correctCount > result.totalCount) {
    context.addIssue({ code: "custom", path: ["sections"], message: "Section totals must sum to the simulation total" });
  }
});

export const AuthorizedReleasedReviewV3Schema = SimulationResultViewV3Schema.safeExtend({
  items: z.array(ReleasedReviewItemSchema),
}).strict().superRefine((review, context) => {
  if (review.items.length !== review.totalCount || new Set(review.items.map((item) => item.slotId)).size !== review.items.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "Released review items must uniquely match the simulation total" });
  }
});

export type SimulationResultViewV3 = z.infer<typeof SimulationResultViewV3Schema>;
