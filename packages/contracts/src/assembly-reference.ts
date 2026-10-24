import { createHash } from "node:crypto";
import { z } from "zod";

import {
  BlueprintConfigSchema,
  CognitiveLevelSchema,
  InteractionTypeSchema,
  SectionSchema,
  type BlueprintConfig,
} from "./index.ts";
import { canonicalize } from "./identity.ts";
import { shuffleAssemblyUnitsV1 } from "./assembly-random.ts";

const HASH = /^sha256:[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_RAW_UNITS = 10_000;
const MAX_MEMBERS_PER_UNIT = 200;
const MAX_NODES = 50_000;
const MAX_UNITS = 2_000;

const UuidSchema = z.string().regex(UUID, "Expected a lowercase UUID");
const HashSchema = z.string().regex(HASH, "Expected a sha256 digest");
const MemberSchema = z.object({
  questionId: UuidSchema,
  versionId: UuidSchema,
  contentHash: HashSchema,
  groupId: UuidSchema,
  section: SectionSchema,
  taxonomyVersionId: UuidSchema,
  interactionType: InteractionTypeSchema,
  skillIds: z.array(UuidSchema),
  cognitiveLevel: CognitiveLevelSchema.nullable(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
  sourceIds: z.array(UuidSchema).min(1),
  exposureCount: z.number().safe().int().nonnegative(),
}).strict();
const UnitSchema = z.object({
  id: UuidSchema,
  sectionId: z.string().min(1),
  members: z.array(MemberSchema).min(1).max(MAX_MEMBERS_PER_UNIT),
}).strict();
const RightsVersionSchema = z.object({
  sourceId: UuidSchema,
  versionId: UuidSchema,
  contentHash: HashSchema,
}).strict();
const ConflictSchema = z.object({ leftUnitId: UuidSchema, rightUnitId: UuidSchema }).strict();
const LimitsSchema = z.object({
  maxNodes: z.number().safe().int().min(0).max(MAX_NODES),
  maxUnits: z.number().safe().int().min(0).max(MAX_UNITS),
}).strict();
const CommonManifestShape = {
  algorithmVersion: z.literal("assembly/1"),
  blueprintVersionId: UuidSchema,
  blueprintHash: HashSchema,
  blueprint: BlueprintConfigSchema,
  seed: z.number().safe().int().min(0).max(0xffff_ffff),
  bankRevision: z.string().min(1).refine((value) => value.trim().length > 0, "Expected a non-empty opaque revision"),
  rightsVersions: z.array(RightsVersionSchema),
  units: z.array(UnitSchema).max(MAX_RAW_UNITS),
  conflicts: z.array(ConflictSchema),
  limits: LimitsSchema,
} as const;
const ManifestSchema = z.object({
  schemaVersion: z.literal("assembly-manifest/1"),
  algorithmVersion: CommonManifestShape.algorithmVersion,
  blueprintVersionId: CommonManifestShape.blueprintVersionId,
  blueprintHash: CommonManifestShape.blueprintHash,
  blueprint: CommonManifestShape.blueprint,
  seed: CommonManifestShape.seed,
  reuseMode: z.enum(["NEW_ONLY", "REVIEW_ALLOWED"]),
  bankRevision: CommonManifestShape.bankRevision,
  rightsVersions: CommonManifestShape.rightsVersions,
  historyQuestionIds: z.array(UuidSchema),
  historyGroupIds: z.array(UuidSchema),
  units: CommonManifestShape.units,
  conflicts: CommonManifestShape.conflicts,
  limits: CommonManifestShape.limits,
}).strict();
const FixedManifestSchema = z.object({
  schemaVersion: z.literal("fixed-assembly-manifest/1"),
  ...CommonManifestShape,
  formMode: z.literal("PUBLISHED_FIXED"),
  reuseMode: z.literal("FIXED_AS_PUBLISHED"),
}).strict();

export type AssemblyMember = z.infer<typeof MemberSchema>;
export type AssemblyUnit = z.infer<typeof UnitSchema>;
export type AssemblyRightsVersion = z.infer<typeof RightsVersionSchema>;
export type AssemblyConflict = z.infer<typeof ConflictSchema>;
export type AssemblyLimits = z.infer<typeof LimitsSchema>;
export type AssemblyManifest = z.infer<typeof ManifestSchema>;
export type ParsedAssemblyManifest = { manifest: AssemblyManifest; bytes: Uint8Array; manifestHash: string };
export type FixedAssemblyManifest = z.infer<typeof FixedManifestSchema>;
export type ParsedFixedAssemblyManifest = { manifest: FixedAssemblyManifest; bytes: Uint8Array; manifestHash: string };
export type AssemblySlot = {
  sectionId: string;
  ordinal: number;
  unitId: string;
  questionId: string;
  questionVersionId: string;
  contentHash: string;
};

export type AssemblyFailureCode =
  | "INSUFFICIENT_ELIGIBLE_INVENTORY"
  | "INSUFFICIENT_UNSEEN_INVENTORY"
  | "CONSTRAINT_CONFLICT"
  | "SEARCH_EXHAUSTED"
  | "CONCURRENT_MODIFICATION";

export type AssemblyResult =
  | { status: "SUCCESS"; manifestHash: string; visitedNodes: number; slots: AssemblySlot[]; slotsHash: string }
  | { status: "FAILURE"; code: AssemblyFailureCode; manifestHash: string; visitedNodes: number; slots: []; slotsHash: string };
export type FixedAssemblyFailureCode = "INSUFFICIENT_ELIGIBLE_INVENTORY" | "CONSTRAINT_CONFLICT" | "SEARCH_EXHAUSTED";
export type FixedAssemblyResult =
  | { status: "SUCCESS"; manifestHash: string; visitedNodes: number; slots: AssemblySlot[]; slotsHash: string }
  | { status: "FAILURE"; code: FixedAssemblyFailureCode; manifestHash: string; visitedNodes: number; slots: []; slotsHash: string };

type Section = BlueprintConfig["sections"][number];
type Quota = BlueprintConfig["quotas"][number];
type AssemblySelectionContext = Pick<AssemblyManifest, "blueprint" | "seed" | "units" | "conflicts" | "limits">;
type ExclusionContext = { questionIds: ReadonlySet<string>; groupIds: ReadonlySet<string> };
type SearchResult = { kind: "FOUND"; selected: number[]; visited: number } | { kind: "INFEASIBLE"; visited: number } | { kind: "EXHAUSTED"; visited: number };

function fail(message: string): never {
  throw new TypeError(message);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes: Uint8Array): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

function jsonCopy(input: unknown): unknown {
  const raw = canonicalize(input);
  if (raw.byteLength > MAX_MANIFEST_BYTES) fail("Canonical assembly manifest exceeds 16 MiB");
  return JSON.parse(new TextDecoder().decode(raw)) as unknown;
}

function sortedUnique(values: string[], label: string, allowDuplicates: boolean): string[] {
  const sorted = [...values].sort(compare);
  if (!allowDuplicates && new Set(sorted).size !== sorted.length) fail(label + " contains duplicates");
  return allowDuplicates ? [...new Set(sorted)] : sorted;
}

function quotaKey(quota: Quota): string {
  return `${quota.sectionId}\u0000${quota.dimension}\u0000${quota.value}`;
}

function memberQuotaValue(member: AssemblyMember, quota: Quota): boolean {
  if (quota.dimension === "SKILL") return member.skillIds.includes(quota.value);
  if (quota.dimension === "COGNITIVE_LEVEL") return member.cognitiveLevel === quota.value;
  return member.difficulty === quota.value;
}

function normalizeCommonManifest<T extends AssemblyManifest | FixedAssemblyManifest>(parsed: T): T {
  const sectionById = new Map(parsed.blueprint.sections.map((section) => [section.id, section]));
  const unitIds = new Set<string>();
  const versionProjection = new Map<string, string>();
  const questionGroups = new Map<string, string>();
  const sourceIds = new Set<string>();
  const units = parsed.units.map((unit) => {
    if (unitIds.has(unit.id)) fail("Manifest contains duplicate unit IDs");
    unitIds.add(unit.id);
    const section = sectionById.get(unit.sectionId);
    if (!section) fail("Unit references an unknown blueprint section");
    const localQuestions = new Set<string>();
    const localGroups = new Set<string>();
    const members = unit.members.map((member) => {
      if (member.section !== section.section) fail("Unit member section does not match its blueprint section");
      if (member.taxonomyVersionId !== parsed.blueprint.taxonomyVersionId) fail("Unit member taxonomy does not match the blueprint");
      if (!parsed.blueprint.allowedTypes.includes(member.interactionType)) fail("Unit contains an interaction type not allowed by the blueprint");
      if (localQuestions.has(member.questionId) || localGroups.has(member.groupId)) fail("Unit repeats a stable question or group");
      localQuestions.add(member.questionId);
      localGroups.add(member.groupId);
      const priorGroup = questionGroups.get(member.questionId);
      if (priorGroup !== undefined && priorGroup !== member.groupId) fail("A stable question maps to conflicting canonical groups");
      questionGroups.set(member.questionId, member.groupId);
      const projection = JSON.stringify({
        questionId: member.questionId,
        versionId: member.versionId,
        contentHash: member.contentHash,
        groupId: member.groupId,
        section: member.section,
        taxonomyVersionId: member.taxonomyVersionId,
        interactionType: member.interactionType,
        skillIds: [...member.skillIds].sort(compare),
        cognitiveLevel: member.cognitiveLevel,
        difficulty: member.difficulty,
        sourceIds: [...member.sourceIds].sort(compare),
        exposureCount: member.exposureCount,
      });
      const priorProjection = versionProjection.get(member.versionId);
      if (priorProjection !== undefined && priorProjection !== projection) fail("A version ID has conflicting immutable member data");
      versionProjection.set(member.versionId, projection);
      for (const sourceId of member.sourceIds) sourceIds.add(sourceId);
      return {
        ...member,
        skillIds: sortedUnique(member.skillIds, "Member skillIds", false),
        sourceIds: sortedUnique(member.sourceIds, "Member sourceIds", false),
      };
    });
    return { ...unit, members };
  }).sort((left, right) => compare(left.id, right.id));

  const rightsSeen = new Set<string>();
  const rightsVersions = parsed.rightsVersions.map((entry) => {
    if (rightsSeen.has(entry.sourceId)) fail("Rights versions must be unique by sourceId");
    rightsSeen.add(entry.sourceId);
    return entry;
  }).sort((left, right) => compare(left.sourceId, right.sourceId));
  if (rightsSeen.size !== sourceIds.size || [...sourceIds].some((sourceId) => !rightsSeen.has(sourceId))) {
    fail("Rights versions must cover every member source exactly");
  }
  const conflictSeen = new Set<string>();
  const conflicts = parsed.conflicts.map((edge) => {
    if (edge.leftUnitId === edge.rightUnitId) fail("Conflict edges cannot be self edges");
    if (!unitIds.has(edge.leftUnitId) || !unitIds.has(edge.rightUnitId)) fail("Conflict edge references a missing unit");
    const [leftUnitId, rightUnitId] = compare(edge.leftUnitId, edge.rightUnitId) < 0
      ? [edge.leftUnitId, edge.rightUnitId]
      : [edge.rightUnitId, edge.leftUnitId];
    const key = `${leftUnitId}\u0000${rightUnitId}`;
    if (conflictSeen.has(key)) fail("Conflict edges must be unique");
    conflictSeen.add(key);
    return { leftUnitId, rightUnitId };
  }).sort((left, right) => compare(left.leftUnitId, right.leftUnitId) || compare(left.rightUnitId, right.rightUnitId));

  return { ...parsed, units, rightsVersions, conflicts };
}

function normalizeManifest(parsed: AssemblyManifest): AssemblyManifest {
  const normalized = normalizeCommonManifest(parsed);
  return {
    ...normalized,
    historyQuestionIds: sortedUnique(parsed.historyQuestionIds, "historyQuestionIds", true),
    historyGroupIds: sortedUnique(parsed.historyGroupIds, "historyGroupIds", true),
  };
}

function normalizeFixedManifest(parsed: FixedAssemblyManifest): FixedAssemblyManifest {
  return normalizeCommonManifest(parsed);
}

function copyAndCheckRawManifest(input: unknown): Record<string, unknown> {
  const copied = jsonCopy(input) as Record<string, unknown>;
  if (Array.isArray(copied.units) && copied.units.length > MAX_RAW_UNITS) fail("Manifest exceeds 10,000 raw units");
  if (Array.isArray(copied.units)) {
    for (const unit of copied.units) {
      if (unit !== null && typeof unit === "object" && Array.isArray((unit as Record<string, unknown>).members) && ((unit as Record<string, unknown>).members as unknown[]).length > MAX_MEMBERS_PER_UNIT) {
        fail("A unit exceeds 200 members");
      }
    }
  }
  return copied;
}

function finishManifest<T extends AssemblyManifest | FixedAssemblyManifest>(
  parsed: T,
  normalize: (manifest: T) => T,
): { manifest: T; bytes: Uint8Array; manifestHash: string } {
  const blueprintBytes = canonicalize(parsed.blueprint);
  if (sha256(blueprintBytes) !== parsed.blueprintHash) fail("Blueprint hash does not match canonical blueprint bytes");
  const manifest = normalize(parsed);
  const bytes = canonicalize(manifest);
  if (bytes.byteLength > MAX_MANIFEST_BYTES) fail("Canonical assembly manifest exceeds 16 MiB");
  return { manifest, bytes, manifestHash: sha256(bytes) };
}

/** Parse, validate and canonicalize a complete immutable assembly snapshot. */
export function parseAssemblyManifest(input: unknown): ParsedAssemblyManifest {
  const copied = copyAndCheckRawManifest(input);
  const parsed = ManifestSchema.parse(copied);
  return finishManifest(parsed, normalizeManifest);
}

/** Parse, validate and canonicalize a complete fixed /1 snapshot. */
export function parseFixedAssemblyManifest(input: unknown): ParsedFixedAssemblyManifest {
  const copied = copyAndCheckRawManifest(input);
  const parsed = FixedManifestSchema.parse(copied);
  return finishManifest(parsed, normalizeFixedManifest);
}

function makeSectionCounts(sections: readonly Section[]): Map<string, number> {
  return new Map(sections.map((section) => [section.id, 0]));
}

type State = {
  sectionCounts: Map<string, number>;
  quotaCounts: Map<string, number>;
  sourceCounts: Map<string, number>;
  questionIds: Set<string>;
  groupIds: Set<string>;
  unitIds: Set<string>;
  blockedUnitIds: Set<string>;
};

function stateFor(
  manifest: AssemblySelectionContext,
  selected: readonly number[],
  rankedUnits: readonly AssemblyUnit[],
  conflictsByUnit: ReadonlyMap<string, ReadonlySet<string>>,
): State {
  const state: State = {
    sectionCounts: makeSectionCounts(manifest.blueprint.sections),
    quotaCounts: new Map(manifest.blueprint.quotas.map((quota) => [quotaKey(quota), 0])),
    sourceCounts: new Map(),
    questionIds: new Set(),
    groupIds: new Set(),
    unitIds: new Set(),
    blockedUnitIds: new Set(),
  };
  for (const index of selected) {
    const unit = rankedUnits[index]!;
    state.unitIds.add(unit.id);
    for (const blockedId of conflictsByUnit.get(unit.id) ?? []) state.blockedUnitIds.add(blockedId);
    state.sectionCounts.set(unit.sectionId, (state.sectionCounts.get(unit.sectionId) ?? 0) + unit.members.length);
    for (const member of unit.members) {
      state.questionIds.add(member.questionId);
      state.groupIds.add(member.groupId);
      for (const quota of manifest.blueprint.quotas) {
        if (quota.sectionId === unit.sectionId && memberQuotaValue(member, quota)) {
          const key = quotaKey(quota);
          state.quotaCounts.set(key, (state.quotaCounts.get(key) ?? 0) + 1);
        }
      }
      for (const sourceId of member.sourceIds) state.sourceCounts.set(sourceId, (state.sourceCounts.get(sourceId) ?? 0) + 1);
    }
  }
  return state;
}

function conflictKey(left: string, right: string): string {
  return compare(left, right) < 0 ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function unitIncompatible(
  manifest: AssemblySelectionContext,
  state: State,
  unit: AssemblyUnit,
): boolean {
  if (state.unitIds.has(unit.id) || state.blockedUnitIds.has(unit.id)) return true;
  const selectedCount = state.sectionCounts.get(unit.sectionId) ?? 0;
  const target = manifest.blueprint.sections.find((section) => section.id === unit.sectionId)!.count;
  if (selectedCount + unit.members.length > target) return true;
  for (const member of unit.members) {
    if (state.questionIds.has(member.questionId) || state.groupIds.has(member.groupId)) return true;
  }
  const sourceCap = manifest.blueprint.maxPerSource;
  if (sourceCap !== null) {
    const sourceAdds = new Map<string, number>();
    for (const member of unit.members) for (const sourceId of member.sourceIds) sourceAdds.set(sourceId, (sourceAdds.get(sourceId) ?? 0) + 1);
    for (const [sourceId, count] of sourceAdds) if ((state.sourceCounts.get(sourceId) ?? 0) + count > sourceCap) return true;
  }
  for (const quota of manifest.blueprint.quotas) {
    if (quota.sectionId !== unit.sectionId) continue;
    const current = state.quotaCounts.get(quotaKey(quota)) ?? 0;
    const added = unit.members.reduce((sum, member) => sum + Number(memberQuotaValue(member, quota)), 0);
    if (current + added > quota.max) return true;
  }
  return false;
}

function selectedValidPartial(manifest: AssemblySelectionContext, state: State): boolean {
  for (const section of manifest.blueprint.sections) if ((state.sectionCounts.get(section.id) ?? 0) > section.count) return false;
  for (const quota of manifest.blueprint.quotas) if ((state.quotaCounts.get(quotaKey(quota)) ?? 0) > quota.max) return false;
  const cap = manifest.blueprint.maxPerSource;
  if (cap !== null && [...state.sourceCounts.values()].some((count) => count > cap)) return false;
  return true;
}

function quotaContribution(unit: AssemblyUnit, quota: Quota): number {
  if (unit.sectionId.length === 0) return 0;
  return unit.members.reduce((sum, member) => sum + Number(memberQuotaValue(member, quota)), 0);
}

type Target = { kind: "QUOTA"; quota: Quota } | { kind: "SECTION"; section: Section };

function chooseTarget(
  manifest: AssemblySelectionContext,
  state: State,
  compatible: readonly AssemblyUnit[],
): Target | undefined {
  const unmet = manifest.blueprint.quotas.flatMap((quota) => {
    const deficit = quota.min - (state.quotaCounts.get(quotaKey(quota)) ?? 0);
    if (deficit <= 0) return [];
    const contribution = compatible.reduce((sum, unit) => sum + (unit.sectionId === quota.sectionId ? quotaContribution(unit, quota) : 0), 0);
    return [{ quota, deficit, contribution }];
  });
  if (unmet.length > 0) {
    unmet.sort((left, right) => {
      const a = BigInt(left.contribution) * BigInt(right.deficit);
      const b = BigInt(right.contribution) * BigInt(left.deficit);
      return (a < b ? -1 : a > b ? 1 : 0)
        || manifest.blueprint.sections.findIndex((section) => section.id === left.quota.sectionId) - manifest.blueprint.sections.findIndex((section) => section.id === right.quota.sectionId)
        || compare(left.quota.dimension, right.quota.dimension)
        || compare(left.quota.value, right.quota.value);
    });
    return { kind: "QUOTA", quota: unmet[0]!.quota };
  }
  const section = manifest.blueprint.sections.find((entry) => (state.sectionCounts.get(entry.id) ?? 0) < entry.count);
  return section ? { kind: "SECTION", section } : undefined;
}

function targetContribution(unit: AssemblyUnit, target: Target): boolean {
  return target.kind === "QUOTA"
    ? unit.sectionId === target.quota.sectionId && quotaContribution(unit, target.quota) > 0
    : unit.sectionId === target.section.id;
}

function canStillReach(
  manifest: AssemblySelectionContext,
  state: State,
  compatible: readonly AssemblyUnit[],
): boolean {
  for (const section of manifest.blueprint.sections) {
    const current = state.sectionCounts.get(section.id) ?? 0;
    const upper = compatible.reduce((sum, unit) => sum + (unit.sectionId === section.id ? unit.members.length : 0), current);
    if (upper < section.count) return false;
  }
  for (const quota of manifest.blueprint.quotas) {
    const current = state.quotaCounts.get(quotaKey(quota)) ?? 0;
    const upper = compatible.reduce((sum, unit) => sum + (unit.sectionId === quota.sectionId ? quotaContribution(unit, quota) : 0), current);
    if (upper < quota.min) return false;
  }
  return true;
}

function validateFinalSelection(
  manifest: AssemblySelectionContext,
  selected: readonly number[],
  rankedUnits: readonly AssemblyUnit[],
  conflictSet: ReadonlySet<string>,
  exclusions: ExclusionContext,
): boolean {
  const sectionCounts = makeSectionCounts(manifest.blueprint.sections);
  const quotaCounts = new Map(manifest.blueprint.quotas.map((quota) => [quotaKey(quota), 0]));
  const sourceCounts = new Map<string, number>();
  const questions = new Set<string>();
  const groups = new Set<string>();
  const units = selected.map((index) => rankedUnits[index]!);
  for (const unit of units) {
    if (unit.members.some((member) => exclusions.questionIds.has(member.questionId) || exclusions.groupIds.has(member.groupId))) return false;
    sectionCounts.set(unit.sectionId, (sectionCounts.get(unit.sectionId) ?? 0) + unit.members.length);
    for (const member of unit.members) {
      if (questions.has(member.questionId) || groups.has(member.groupId)) return false;
      questions.add(member.questionId);
      groups.add(member.groupId);
      for (const quota of manifest.blueprint.quotas) if (quota.sectionId === unit.sectionId && memberQuotaValue(member, quota)) {
        const key = quotaKey(quota);
        quotaCounts.set(key, (quotaCounts.get(key) ?? 0) + 1);
      }
      for (const sourceId of member.sourceIds) sourceCounts.set(sourceId, (sourceCounts.get(sourceId) ?? 0) + 1);
    }
  }
  for (let i = 0; i < units.length; i += 1) for (let j = i + 1; j < units.length; j += 1) {
    if (conflictSet.has(conflictKey(units[i]!.id, units[j]!.id))) return false;
  }
  if (manifest.blueprint.sections.some((section) => sectionCounts.get(section.id) !== section.count)) return false;
  if (manifest.blueprint.quotas.some((quota) => {
    const count = quotaCounts.get(quotaKey(quota)) ?? 0;
    return count < quota.min || count > quota.max;
  })) return false;
  if (manifest.blueprint.maxPerSource !== null && [...sourceCounts.values()].some((count) => count > manifest.blueprint.maxPerSource!)) return false;
  return true;
}

function solve(
  manifest: AssemblySelectionContext,
  candidates: readonly AssemblyUnit[],
  budget: number,
  exclusions: ExclusionContext,
): SearchResult {
  const { rankedUnits } = rankedForSlots(manifest, candidates);
  const conflicts = new Set(manifest.conflicts.map((edge) => conflictKey(edge.leftUnitId, edge.rightUnitId)));
  const conflictsByUnit = new Map<string, Set<string>>();
  for (const edge of manifest.conflicts) {
    const left = conflictsByUnit.get(edge.leftUnitId) ?? new Set<string>();
    left.add(edge.rightUnitId);
    conflictsByUnit.set(edge.leftUnitId, left);
    const right = conflictsByUnit.get(edge.rightUnitId) ?? new Set<string>();
    right.add(edge.leftUnitId);
    conflictsByUnit.set(edge.rightUnitId, right);
  }
  const stack: { selected: number[]; remaining: number[] }[] = [{ selected: [], remaining: rankedUnits.map((_, index) => index) }];
  let visited = 0;
  while (stack.length > 0) {
    if (visited >= budget) return { kind: "EXHAUSTED", visited };
    const stateFrame = stack.pop()!;
    visited += 1;
    const state = stateFor(manifest, stateFrame.selected, rankedUnits, conflictsByUnit);
    if (!selectedValidPartial(manifest, state)) continue;
    const compatibleIndices = stateFrame.remaining.filter((index) => !unitIncompatible(manifest, state, rankedUnits[index]!));
    const compatible = compatibleIndices.map((index) => rankedUnits[index]!);
    if (!canStillReach(manifest, state, compatible)) continue;
    const target = chooseTarget(manifest, state, compatible);
    if (!target) {
      if (validateFinalSelection(manifest, stateFrame.selected, rankedUnits, conflicts, exclusions)) {
        return { kind: "FOUND", selected: stateFrame.selected, visited };
      }
      continue;
    }
    const branchAt = compatibleIndices.findIndex((index) => targetContribution(rankedUnits[index]!, target));
    if (branchAt < 0) continue;
    const index = compatibleIndices[branchAt]!;
    const remaining = compatibleIndices.filter((candidateIndex) => candidateIndex !== index);
    // Push skip first so the take branch is entered first in deterministic DFS order.
    stack.push({ selected: [...stateFrame.selected], remaining });
    stack.push({ selected: [...stateFrame.selected, index], remaining });
  }
  return { kind: "INFEASIBLE", visited };
}

function intrinsicConflict(manifest: AssemblySelectionContext): boolean {
  for (const section of manifest.blueprint.sections) {
    const cognitiveMinimum = manifest.blueprint.quotas.filter((quota) => quota.sectionId === section.id && quota.dimension === "COGNITIVE_LEVEL").reduce((sum, quota) => sum + quota.min, 0);
    const difficultyMinimum = manifest.blueprint.quotas.filter((quota) => quota.sectionId === section.id && quota.dimension === "DIFFICULTY").reduce((sum, quota) => sum + quota.min, 0);
    if (cognitiveMinimum > section.count || difficultyMinimum > section.count) return true;
  }
  return false;
}

function eligibleUnits(manifest: AssemblySelectionContext, exclusions: ExclusionContext): AssemblyUnit[] {
  return manifest.units.filter((unit) => !unit.members.some((member) =>
    exclusions.questionIds.has(member.questionId) || exclusions.groupIds.has(member.groupId),
  ));
}

function slotsFor(manifest: AssemblySelectionContext, selected: readonly number[], rankedUnits: readonly AssemblyUnit[], seededPosition: ReadonlyMap<string, number>): AssemblySlot[] {
  const selectedUnits = selected.map((index) => rankedUnits[index]!);
  const result: AssemblySlot[] = [];
  for (const section of manifest.blueprint.sections) {
    const inSection = selectedUnits.filter((unit) => unit.sectionId === section.id).sort((left, right) => {
      return seededPosition.get(left.id)! - seededPosition.get(right.id)!;
    });
    let ordinal = 0;
    for (const unit of inSection) for (const member of unit.members) {
      result.push({ sectionId: section.id, ordinal, unitId: unit.id, questionId: member.questionId, questionVersionId: member.versionId, contentHash: member.contentHash });
      ordinal += 1;
    }
  }
  return result;
}

function emptyFailure(code: AssemblyFailureCode, manifestHash: string, visitedNodes: number): AssemblyResult {
  const slots: [] = [];
  return { status: "FAILURE", code, manifestHash, visitedNodes, slots, slotsHash: sha256(canonicalize(slots)) };
}

function emptyFixedFailure(code: FixedAssemblyFailureCode, manifestHash: string, visitedNodes: number): FixedAssemblyResult {
  const slots: [] = [];
  return { status: "FAILURE", code, manifestHash, visitedNodes, slots, slotsHash: sha256(canonicalize(slots)) };
}

function blueprintExclusions(manifest: AssemblySelectionContext): ExclusionContext {
  return { questionIds: new Set(manifest.blueprint.excludedQuestionIds), groupIds: new Set() };
}

function personalHistoryExclusions(manifest: AssemblyManifest): ExclusionContext {
  return {
    questionIds: new Set([...manifest.blueprint.excludedQuestionIds, ...manifest.historyQuestionIds]),
    groupIds: new Set(manifest.historyGroupIds),
  };
}

function runSingleReference(
  manifest: AssemblySelectionContext,
  manifestHash: string,
  exclusions: ExclusionContext,
): FixedAssemblyResult {
  if (intrinsicConflict(manifest)) return emptyFixedFailure("CONSTRAINT_CONFLICT", manifestHash, 0);
  if (manifest.units.length > manifest.limits.maxUnits) return emptyFixedFailure("SEARCH_EXHAUSTED", manifestHash, 0);
  const candidates = eligibleUnits(manifest, exclusions);
  const searched = solve(manifest, candidates, manifest.limits.maxNodes, exclusions);
  if (searched.kind === "EXHAUSTED") return emptyFixedFailure("SEARCH_EXHAUSTED", manifestHash, searched.visited);
  if (searched.kind === "INFEASIBLE") return emptyFixedFailure("INSUFFICIENT_ELIGIBLE_INVENTORY", manifestHash, searched.visited);
  const { rankedUnits, seededPosition } = rankedForSlots(manifest, candidates);
  const slots = slotsFor(manifest, searched.selected, rankedUnits, seededPosition);
  return { status: "SUCCESS", manifestHash, visitedNodes: searched.visited, slots, slotsHash: sha256(canonicalize(slots)) };
}

/** Run bounded deterministic assembly/1 against the captured manifest only. */
export function runAssemblyReference(input: unknown): AssemblyResult {
  const { manifest, manifestHash } = parseAssemblyManifest(input);
  if (manifest.reuseMode === "NEW_ONLY") {
    if (intrinsicConflict(manifest)) return emptyFailure("CONSTRAINT_CONFLICT", manifestHash, 0);
    if (manifest.units.length > manifest.limits.maxUnits) return emptyFailure("SEARCH_EXHAUSTED", manifestHash, 0);
    const baselineExclusions = blueprintExclusions(manifest);
    const baselineUnits = eligibleUnits(manifest, baselineExclusions);
    const baseline = solve(manifest, baselineUnits, manifest.limits.maxNodes, baselineExclusions);
    if (baseline.kind === "EXHAUSTED") return emptyFailure("SEARCH_EXHAUSTED", manifestHash, baseline.visited);
    if (baseline.kind === "INFEASIBLE") return emptyFailure("INSUFFICIENT_ELIGIBLE_INVENTORY", manifestHash, baseline.visited);
    const personalExclusions = personalHistoryExclusions(manifest);
    const personalUnits = eligibleUnits(manifest, personalExclusions);
    const personal = solve(manifest, personalUnits, manifest.limits.maxNodes - baseline.visited, personalExclusions);
    const visitedNodes = baseline.visited + personal.visited;
    if (personal.kind === "EXHAUSTED") return emptyFailure("SEARCH_EXHAUSTED", manifestHash, visitedNodes);
    if (personal.kind === "INFEASIBLE") return emptyFailure("INSUFFICIENT_UNSEEN_INVENTORY", manifestHash, visitedNodes);
    const { rankedUnits, seededPosition } = rankedForSlots(manifest, personalUnits);
    const slots = slotsFor(manifest, personal.selected, rankedUnits, seededPosition);
    return { status: "SUCCESS", manifestHash, visitedNodes, slots, slotsHash: sha256(canonicalize(slots)) };
  }
  return runSingleReference(manifest, manifestHash, blueprintExclusions(manifest));
}

/** Run one bounded fixed baseline search without personal history exclusions. */
export function runFixedAssemblyReference(input: unknown): FixedAssemblyResult {
  const { manifest, manifestHash } = parseFixedAssemblyManifest(input);
  return runSingleReference(manifest, manifestHash, blueprintExclusions(manifest));
}

function rankedForSlots(manifest: AssemblySelectionContext, candidates: readonly AssemblyUnit[]): { rankedUnits: AssemblyUnit[]; seededPosition: Map<string, number> } {
  const sorted = [...candidates].sort((left, right) => compare(left.id, right.id));
  const shuffled = shuffleAssemblyUnitsV1(sorted, manifest.seed);
  const positions = new Map(shuffled.map((unit, index) => [unit.id, index]));
  const rankedUnits = [...shuffled].sort((left, right) => {
    const exposure = (unit: AssemblyUnit) => unit.members.reduce((sum, member) => sum + BigInt(member.exposureCount), 0n);
    const a = exposure(left); const b = exposure(right);
    return a < b ? -1 : a > b ? 1 : positions.get(left.id)! - positions.get(right.id)!;
  });
  return { rankedUnits, seededPosition: positions };
}

/** Compare both replay pins against a fresh deterministic run without changing stored data. */
export function replayAssemblyReference(input: unknown, stored: { manifestHash: string; slotsHash: string }): { result: AssemblyResult; matches: boolean; mismatches: ("manifestHash" | "slotsHash")[] } {
  if (!HASH.test(stored.manifestHash) || !HASH.test(stored.slotsHash)) fail("Stored replay hashes must be sha256 digests");
  const result = runAssemblyReference(input);
  const mismatches: ("manifestHash" | "slotsHash")[] = [];
  if (stored.manifestHash !== result.manifestHash) mismatches.push("manifestHash");
  if (stored.slotsHash !== result.slotsHash) mismatches.push("slotsHash");
  return { result, matches: mismatches.length === 0, mismatches };
}

/** Compare both fixed replay pins against a fresh deterministic run without mutation. */
export function replayFixedAssemblyReference(input: unknown, stored: { manifestHash: string; slotsHash: string }): { result: FixedAssemblyResult; matches: boolean; mismatches: ("manifestHash" | "slotsHash")[] } {
  if (!HASH.test(stored.manifestHash) || !HASH.test(stored.slotsHash)) fail("Stored replay hashes must be sha256 digests");
  const result = runFixedAssemblyReference(input);
  const mismatches: ("manifestHash" | "slotsHash")[] = [];
  if (stored.manifestHash !== result.manifestHash) mismatches.push("manifestHash");
  if (stored.slotsHash !== result.slotsHash) mismatches.push("slotsHash");
  return { result, matches: mismatches.length === 0, mismatches };
}

/** Pure simulation of up to three fresh-snapshot attempts after contention. */
export function replanAssemblyReference(
  attempts: readonly { manifest: unknown; contended: boolean }[],
  maxAttempts: number,
): { result: AssemblyResult; attempts: number; totalVisitedNodes: number } {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) fail("maxAttempts must be from one to three");
  if (attempts.length < 1 || attempts.length > maxAttempts) fail("Replan requires one to maxAttempts bounded attempts");
  let totalVisitedNodes = 0;
  let last: AssemblyResult | undefined;
  for (const [index, attempt] of attempts.entries()) {
    last = runAssemblyReference(attempt.manifest);
    totalVisitedNodes += last.visitedNodes;
    if (!attempt.contended) return { result: last, attempts: index + 1, totalVisitedNodes };
  }
  if (attempts.length < maxAttempts) fail("Contended replans require one supplied manifest per maxAttempts attempt");
  const final = last!;
  return {
    result: emptyFailure("CONCURRENT_MODIFICATION", final.manifestHash, totalVisitedNodes),
    attempts: attempts.length,
    totalVisitedNodes,
  };
}

export const ASSEMBLY_REFERENCE_LIMITS = Object.freeze({ maxManifestBytes: MAX_MANIFEST_BYTES, maxRawUnits: MAX_RAW_UNITS, maxMembersPerUnit: MAX_MEMBERS_PER_UNIT, maxNodes: MAX_NODES, maxUnits: MAX_UNITS });
