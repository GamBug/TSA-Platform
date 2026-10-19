import { createHash } from "node:crypto";

import { canonicalize } from "../../src/identity.ts";
import type { AssemblyManifest, AssemblyMember, AssemblyUnit } from "../../src/assembly-reference.ts";

export const TAXONOMY_ID = uuid(900);
export const SECTION_ID = "math-section";
export const SKILL_501 = uuid(501);
export const SKILL_502 = uuid(502);

export function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

export function digest(value: number): string {
  return `sha256:${value.toString(16).padStart(64, "0")}`;
}

export function makeBlueprint(options: {
  count?: number;
  quotas?: AssemblyManifest["blueprint"]["quotas"];
  maxPerSource?: number | null;
  sections?: AssemblyManifest["blueprint"]["sections"];
} = {}): AssemblyManifest["blueprint"] {
  return {
    schemaVersion: "blueprint/1",
    name: "Synthetic assembly reference",
    taxonomyVersionId: TAXONOMY_ID,
    profileKind: "INDEPENDENT_PRACTICE",
    evidenceIds: [],
    sections: options.sections ?? [{ id: SECTION_ID, section: "MATH", count: options.count ?? 1, durationSeconds: 60 }],
    allowedTypes: ["SINGLE_CHOICE"],
    quotas: options.quotas ?? [],
    maxPerSource: options.maxPerSource ?? null,
    excludedQuestionIds: [],
    bundlePolicy: "ALL_OR_NONE",
    scoringPolicy: "practice-binary-v1",
    releasePolicy: "after-grade-v1",
  };
}

export function makeMember(options: {
  identity: number;
  questionId?: string;
  versionId?: string;
  groupId?: string;
  sourceIds?: string[];
  skillIds?: string[];
  cognitiveLevel?: "M1" | "M2" | "M3" | null;
  difficulty?: "EASY" | "MEDIUM" | "HARD" | null;
  exposureCount?: number;
  section?: "MATH" | "READING" | "SCIENCE";
  taxonomyVersionId?: string;
  interactionType?: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE_GROUP";
}): AssemblyMember {
  return {
    questionId: options.questionId ?? uuid(10_000 + options.identity),
    versionId: options.versionId ?? uuid(20_000 + options.identity),
    contentHash: digest(30_000 + options.identity),
    groupId: options.groupId ?? uuid(40_000 + options.identity),
    section: options.section ?? "MATH",
    taxonomyVersionId: options.taxonomyVersionId ?? TAXONOMY_ID,
    interactionType: options.interactionType ?? "SINGLE_CHOICE",
    skillIds: options.skillIds ?? [SKILL_501],
    cognitiveLevel: options.cognitiveLevel === undefined ? "M1" : options.cognitiveLevel,
    difficulty: options.difficulty === undefined ? "EASY" : options.difficulty,
    sourceIds: options.sourceIds ?? [uuid(50_000 + options.identity)],
    exposureCount: options.exposureCount ?? 0,
  };
}

export function makeUnit(identity: number, members: AssemblyMember[] = [makeMember({ identity })], sectionId = SECTION_ID): AssemblyUnit {
  return { id: uuid(identity), sectionId, members };
}

export function makeManifest(options: {
  blueprint?: AssemblyManifest["blueprint"];
  units?: AssemblyUnit[];
  seed?: number;
  reuseMode?: "NEW_ONLY" | "REVIEW_ALLOWED";
  historyQuestionIds?: string[];
  historyGroupIds?: string[];
  conflicts?: AssemblyManifest["conflicts"];
  rightsVersions?: AssemblyManifest["rightsVersions"];
  bankRevision?: string;
  maxNodes?: number;
  maxUnits?: number;
} = {}): AssemblyManifest {
  const blueprint = options.blueprint ?? makeBlueprint();
  const units = options.units ?? [makeUnit(1)];
  const sourceIds = [...new Set(units.flatMap((unit) => unit.members.flatMap((member) => member.sourceIds)))].sort();
  const rightsVersions = options.rightsVersions ?? sourceIds.map((sourceId, index) => ({
    sourceId,
    versionId: uuid(60_000 + index),
    contentHash: digest(70_000 + index),
  }));
  return {
    schemaVersion: "assembly-manifest/1",
    algorithmVersion: "assembly/1",
    blueprintVersionId: uuid(800),
    blueprintHash: hashCanonical(blueprint),
    blueprint,
    seed: options.seed ?? 1,
    reuseMode: options.reuseMode ?? "REVIEW_ALLOWED",
    bankRevision: options.bankRevision ?? "snapshot:2026-10-19:α",
    rightsVersions,
    historyQuestionIds: options.historyQuestionIds ?? [],
    historyGroupIds: options.historyGroupIds ?? [],
    units,
    conflicts: options.conflicts ?? [],
    limits: { maxNodes: options.maxNodes ?? 50_000, maxUnits: options.maxUnits ?? 2_000 },
  };
}

export function hashCanonical(value: unknown): string {
  const bytes = canonicalize(value);
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}
