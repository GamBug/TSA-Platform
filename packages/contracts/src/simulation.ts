import { z } from "zod";

/** The reviewed fixed schedule for the unofficial full simulation. */
export const FULL_SIMULATION_SECTIONS = [
  { id: "math", section: "MATH", count: 40, durationSeconds: 3_600 },
  { id: "reading", section: "READING", count: 20, durationSeconds: 1_800 },
  { id: "science", section: "SCIENCE", count: 40, durationSeconds: 3_600 },
] as const;

export const FULL_SIMULATION_TOTAL_QUESTIONS = 100;
export const FULL_SIMULATION_TOTAL_SECONDS = 9_000;
export const FULL_SIMULATION_SCORING_POLICY = "practice-binary-v1" as const;
export const FULL_SIMULATION_REUSE_MODE = "NEW_ONLY" as const;

const CatalogSectionV3Schema = z.object({
  sectionId: z.enum(["math", "reading", "science"]),
  section: z.enum(["MATH", "READING", "SCIENCE"]),
  questionCount: z.number().int().positive(),
  durationSeconds: z.number().int().positive(),
}).strict();

export const FullSimulationCatalogEntryV3Schema = z.object({
  name: z.string().trim().min(1),
  profileKind: z.literal("FULL_SIMULATION"),
  sections: z.array(CatalogSectionV3Schema).length(3),
  questionCount: z.literal(FULL_SIMULATION_TOTAL_QUESTIONS),
  durationSeconds: z.literal(FULL_SIMULATION_TOTAL_SECONDS),
  availableFrom: z.iso.datetime({ offset: true }),
  availableUntil: z.iso.datetime({ offset: true }),
  mode: z.literal("PERSONALIZED_PRACTICE"),
  reuseMode: z.literal(FULL_SIMULATION_REUSE_MODE),
  blueprintVersionId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  reviewAllowed: z.literal(false),
}).strict().superRefine((entry, context) => {
  if (entry.sections.some((section, index) => {
    const schedule = FULL_SIMULATION_SECTIONS[index]!;
    return section.sectionId !== schedule.id || section.section !== schedule.section
      || section.questionCount !== schedule.count || section.durationSeconds !== schedule.durationSeconds;
  }) || Date.parse(entry.availableUntil) <= Date.parse(entry.availableFrom)) {
    context.addIssue({ code: "custom", path: ["sections"], message: "Catalog entry must match the fixed full-simulation schedule and availability" });
  }
});

export const FullSimulationCatalogPageV3Schema = z.object({
  items: z.array(FullSimulationCatalogEntryV3Schema),
  nextCursor: z.string().min(1).max(1_024).nullable(),
}).strict();
