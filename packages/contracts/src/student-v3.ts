import { z } from "zod";
import {
  AnswerAckSchema,
  AttemptStateSchema,
  ClosureSchema,
  FormModeSchema,
  ReuseModeSchema,
  SectionSchema,
  StudentSlotSchema,
  parseResponseForInteraction,
} from "./index.ts";
import { FULL_SIMULATION_SECTIONS } from "./simulation.ts";

const CanonicalUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const Instant = z.string().refine((value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)));

export const SimulationSectionClockV3Schema = z.object({
  sectionId: z.string().trim().min(1).max(128),
  section: SectionSchema,
  budgetSeconds: z.number().int().positive(),
  remainingSeconds: z.number().int().nonnegative(),
  count: z.number().int().positive(),
  firstOpenedAt: Instant.nullable(),
  openedAt: Instant.nullable(),
  isOpen: z.boolean(),
  isLocked: z.boolean(),
}).strict().superRefine((clock, context) => {
  if (clock.remainingSeconds > clock.budgetSeconds) {
    context.addIssue({ code: "custom", path: ["remainingSeconds"], message: "Remaining time cannot exceed its section budget" });
  }
  if (clock.isLocked !== (clock.remainingSeconds === 0)) {
    context.addIssue({ code: "custom", path: ["isLocked"], message: "A section is locked exactly when its budget is exhausted" });
  }
  if (clock.firstOpenedAt === null && (clock.openedAt !== null || clock.isOpen)) {
    context.addIssue({ code: "custom", message: "Only a previously opened section can have an active clock" });
  }
  if (clock.isOpen !== (clock.openedAt !== null) || (clock.isOpen && (clock.firstOpenedAt === null || clock.isLocked))) {
    context.addIssue({ code: "custom", message: "An open section must have remaining time and both opening timestamps" });
  }
});

export const SimulationStartReceiptV3Schema = z.object({
  attemptId: CanonicalUuid,
  startedAt: Instant,
  activeSectionId: z.string().trim().min(1).max(128),
  serverNow: Instant,
}).strict();

export const SimulationCreateAttemptRequestV3Schema = z.object({
  mode: z.literal("PERSONALIZED_PRACTICE").optional(),
  blueprintVersionId: CanonicalUuid,
  reuseMode: z.literal("NEW_ONLY").optional(),
}).strict();

export const SimulationSectionSwitchRequestV3Schema = z.object({
  sectionId: z.string().trim().min(1).max(128),
}).strict();

export const SimulationSectionSwitchReceiptV3Schema = z.object({
  attemptId: CanonicalUuid,
  activeSectionId: z.string().trim().min(1).max(128),
  switchedAt: Instant,
  remainingSeconds: z.number().int().nonnegative(),
}).strict();

export const SimulationCreationReceiptV3Schema = z.object({
  attemptId: CanonicalUuid,
  formId: CanonicalUuid,
  state: z.literal("CREATED"),
  profileKind: z.literal("FULL_SIMULATION"),
  formMode: z.literal("PERSONALIZED_PRACTICE"),
  reuseMode: z.literal("NEW_ONLY"),
  reusePolicyVersion: z.literal("reuse/1"),
  questionCount: z.literal(100),
  durationSeconds: z.literal(9_000),
  startBefore: Instant,
}).strict();

export const SimulationAttemptHistoryItemV3Schema = z.object({
  attemptId: CanonicalUuid,
  formId: CanonicalUuid,
  profileKind: z.literal("FULL_SIMULATION"),
  formMode: FormModeSchema,
  reuseMode: z.literal("NEW_ONLY"),
  state: AttemptStateSchema,
  startedAt: Instant.nullable(),
  closedAt: Instant.nullable(),
  score: z.object({ correctCount: z.number().int().nonnegative(), totalCount: z.literal(100), percentage: z.string().regex(/^(?:0|[1-9]\d?|100)\.\d{2}$/) }).strict().nullable(),
}).strict().superRefine((item, context) => {
  if (item.formMode !== "PERSONALIZED_PRACTICE" || (item.score !== null && item.score.correctCount > 100)) {
    context.addIssue({ code: "custom", message: "Simulation history must be owner-bound and contain a valid total score" });
  }
});

export const SimulationAttemptHistoryPageV3Schema = z.object({
  items: z.array(SimulationAttemptHistoryItemV3Schema),
  nextCursor: z.string().min(1).nullable(),
}).strict();

export const SimulationAttemptViewV3Schema = z.object({
  attemptId: CanonicalUuid,
  state: AttemptStateSchema,
  formId: CanonicalUuid,
  formMode: z.literal("PERSONALIZED_PRACTICE"),
  reuseMode: z.literal("NEW_ONLY"),
  reusePolicyVersion: z.literal("reuse/1"),
  serverNow: Instant,
  startBefore: Instant.nullable(),
  startedAt: Instant.nullable(),
  activeSectionId: z.string().trim().min(1).max(128).nullable(),
  sections: z.array(SimulationSectionClockV3Schema).length(3),
  slots: z.array(StudentSlotSchema),
  answers: z.array(AnswerAckSchema),
  closure: ClosureSchema,
}).strict().superRefine((view, context) => {
  const expected = FULL_SIMULATION_SECTIONS;
  const sectionIds = new Set<string>();
  for (const [index, section] of view.sections.entries()) {
    const schedule = expected[index]!;
    if (section.sectionId !== schedule.id || section.section !== schedule.section
        || section.count !== schedule.count || section.budgetSeconds !== schedule.durationSeconds) {
      context.addIssue({ code: "custom", path: ["sections", index], message: "Section clock must match the sealed simulation schedule" });
    }
    if (sectionIds.has(section.sectionId)) {
      context.addIssue({ code: "custom", path: ["sections", index, "sectionId"], message: "Section IDs must be unique" });
    }
    sectionIds.add(section.sectionId);
  }
  if (view.closure.attemptId !== view.attemptId || view.closure.state !== view.state) {
    context.addIssue({ code: "custom", path: ["closure"], message: "Closure must identify this attempt and its current state" });
  }
  const openSections = view.sections.filter((section) => section.isOpen);
  if (openSections.length > 1 || (view.activeSectionId === null) !== (openSections.length === 0)
      || (view.activeSectionId !== null && openSections[0]?.sectionId !== view.activeSectionId)) {
    context.addIssue({ code: "custom", path: ["activeSectionId"], message: "At most one open section must match activeSectionId" });
  }
  if (view.state === "CREATED") {
    if (view.startBefore === null || view.startedAt !== null || view.activeSectionId !== null
        || view.sections.some((section) => section.firstOpenedAt !== null)
        || view.slots.length !== 0 || view.answers.length !== 0) {
      context.addIssue({ code: "custom", message: "Created simulations have no started clock or delivered content" });
    }
  } else if (view.state === "IN_PROGRESS" || view.state === "SUBMITTED" || view.state === "EXPIRED" || view.state === "GRADED") {
    if (view.startBefore !== null || view.startedAt === null) {
      context.addIssue({ code: "custom", message: "Started simulations require startedAt and omit startBefore" });
    }
  } else if (view.startBefore !== null) {
    context.addIssue({ code: "custom", path: ["startBefore"], message: "Terminal attempts omit startBefore" });
  }
  if (view.state !== "IN_PROGRESS" && (view.activeSectionId !== null || view.slots.length > 0 || view.answers.length > 0)) {
    context.addIssue({ code: "custom", message: "Closed simulations do not expose question content or an active section" });
  }

  const slotIds = new Set<string>();
  for (const section of view.sections) {
    const deliveredCount = view.slots.filter((slot) => slot.sectionId === section.sectionId).length;
    const expectedCount = view.state === "IN_PROGRESS" && section.firstOpenedAt !== null ? section.count : 0;
    if (deliveredCount !== expectedCount) {
      context.addIssue({ code: "custom", path: ["slots"], message: "Each opened section delivers its complete sealed slot set; unopened sections deliver none" });
    }
  }
  for (const [index, slot] of view.slots.entries()) {
    if (slotIds.has(slot.slotId) || !view.sections.some((section) => section.sectionId === slot.sectionId && section.firstOpenedAt !== null)) {
      context.addIssue({ code: "custom", path: ["slots", index], message: "Only unique slots from previously opened sections may be delivered" });
    }
    slotIds.add(slot.slotId);
  }
  const answerIds = new Set<string>();
  for (const [index, answer] of view.answers.entries()) {
    const slot = view.slots.find((candidate) => candidate.slotId === answer.slotId);
    if (answerIds.has(answer.slotId) || slot === undefined || slot.interaction.type !== answer.value.type) {
      context.addIssue({ code: "custom", path: ["answers", index], message: "Answers must match a delivered slot exactly once" });
    }
    if (slot) {
      try { parseResponseForInteraction(slot.interaction, answer.value); }
      catch { context.addIssue({ code: "custom", path: ["answers", index], message: "Answer must match its sealed interaction" }); }
    }
    answerIds.add(answer.slotId);
  }
});

export type SimulationSectionClockV3 = z.infer<typeof SimulationSectionClockV3Schema>;
export type SimulationAttemptViewV3 = z.infer<typeof SimulationAttemptViewV3Schema>;
