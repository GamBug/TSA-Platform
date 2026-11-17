import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseAssemblyManifest,
  parseFixedAssemblyManifest,
  replayFixedAssemblyReference,
  runAssemblyReference,
  runFixedAssemblyReference,
  type AssemblyManifest,
  type FixedAssemblyManifest,
} from "../src/assembly-reference.ts";
import {
  SKILL_501,
  SKILL_502,
  digest,
  hashCanonical,
  makeBlueprint,
  makeMember,
  makeUnit,
  uuid,
} from "./fixtures/assembly-reference.ts";

type FixedOptions = {
  blueprint?: FixedAssemblyManifest["blueprint"];
  units?: FixedAssemblyManifest["units"];
  seed?: number;
  bankRevision?: string;
  rightsVersions?: FixedAssemblyManifest["rightsVersions"];
  conflicts?: FixedAssemblyManifest["conflicts"];
  maxNodes?: number;
  maxUnits?: number;
};

function makeFixedManifest(options: FixedOptions = {}): FixedAssemblyManifest {
  const blueprint = options.blueprint ?? makeBlueprint();
  const units = options.units ?? [makeUnit(1)];
  const sourceIds = [...new Set(units.flatMap((unit) => unit.members.flatMap((member) => member.sourceIds)))].sort();
  const rightsVersions = options.rightsVersions ?? sourceIds.map((sourceId, index) => ({
    sourceId,
    versionId: uuid(60_000 + index),
    contentHash: digest(70_000 + index),
  }));
  return {
    schemaVersion: "fixed-assembly-manifest/1",
    algorithmVersion: "assembly/1",
    formMode: "PUBLISHED_FIXED",
    reuseMode: "FIXED_AS_PUBLISHED",
    blueprintVersionId: uuid(800),
    blueprintHash: hashCanonical(blueprint),
    blueprint,
    seed: options.seed ?? 1,
    bankRevision: options.bankRevision ?? "snapshot:2026-10-19:α",
    rightsVersions,
    units,
    conflicts: options.conflicts ?? [],
    limits: { maxNodes: options.maxNodes ?? 50_000, maxUnits: options.maxUnits ?? 2_000 },
  };
}

function personalManifest(manifest: FixedAssemblyManifest, options: { historyQuestionIds?: string[]; historyGroupIds?: string[] } = {}): AssemblyManifest {
  const { schemaVersion: _schemaVersion, formMode: _formMode, reuseMode: _reuseMode, ...common } = manifest;
  return {
    schemaVersion: "assembly-manifest/1",
    ...common,
    reuseMode: "REVIEW_ALLOWED",
    historyQuestionIds: options.historyQuestionIds ?? [],
    historyGroupIds: options.historyGroupIds ?? [],
  };
}

function resultUnitIds(result: ReturnType<typeof runFixedAssemblyReference>): string[] {
  return result.status === "SUCCESS"
    ? [...new Set(result.slots.map((slot) => slot.unitId))].sort()
    : [];
}

function quotaKey(quota: FixedAssemblyManifest["blueprint"]["quotas"][number]): string {
  return `${quota.sectionId}\u0000${quota.dimension}\u0000${quota.value}`;
}

/** Independent small subset oracle; it does not call production validators or search helpers. */
function oracleFeasibleSets(manifest: FixedAssemblyManifest): string[][] {
  const excludedQuestions = new Set(manifest.blueprint.excludedQuestionIds);
  const candidates = manifest.units.filter((unit) => !unit.members.some((member) => excludedQuestions.has(member.questionId)));
  assert.ok(candidates.length < 20, "the independent oracle is intentionally limited to small manifests");
  const conflicts = new Set(manifest.conflicts.map((edge) => [edge.leftUnitId, edge.rightUnitId].sort().join("\u0000")));
  const feasible: string[][] = [];
  for (let mask = 0; mask < 2 ** candidates.length; mask += 1) {
    const selected = candidates.filter((_, index) => (mask & (1 << index)) !== 0);
    const sectionCounts = new Map(manifest.blueprint.sections.map((section) => [section.id, 0]));
    const quotas = new Map(manifest.blueprint.quotas.map((quota) => [quotaKey(quota), 0]));
    const sources = new Map<string, number>();
    const questions = new Set<string>();
    const groups = new Set<string>();
    let valid = true;
    for (const unit of selected) {
      sectionCounts.set(unit.sectionId, (sectionCounts.get(unit.sectionId) ?? 0) + unit.members.length);
      for (const member of unit.members) {
        if (questions.has(member.questionId) || groups.has(member.groupId)) valid = false;
        questions.add(member.questionId);
        groups.add(member.groupId);
        for (const quota of manifest.blueprint.quotas) {
          if (quota.sectionId !== unit.sectionId) continue;
          const matches = quota.dimension === "SKILL"
            ? member.skillIds.includes(quota.value)
            : quota.dimension === "COGNITIVE_LEVEL"
              ? member.cognitiveLevel === quota.value
              : member.difficulty === quota.value;
          if (matches) quotas.set(quotaKey(quota), (quotas.get(quotaKey(quota)) ?? 0) + 1);
        }
        for (const sourceId of member.sourceIds) sources.set(sourceId, (sources.get(sourceId) ?? 0) + 1);
      }
    }
    for (let left = 0; left < selected.length; left += 1) for (let right = left + 1; right < selected.length; right += 1) {
      if (conflicts.has([selected[left]!.id, selected[right]!.id].sort().join("\u0000"))) valid = false;
    }
    for (const section of manifest.blueprint.sections) {
      if (sectionCounts.get(section.id) !== section.count) valid = false;
    }
    for (const quota of manifest.blueprint.quotas) {
      const count = quotas.get(quotaKey(quota)) ?? 0;
      if (count < quota.min || count > quota.max) valid = false;
    }
    if (manifest.blueprint.maxPerSource !== null
      && [...sources.values()].some((count) => count > manifest.blueprint.maxPerSource!)) valid = false;
    if (valid) feasible.push(selected.map((unit) => unit.id).sort());
  }
  return feasible.sort((left, right) => left.join("\u0000").localeCompare(right.join("\u0000")));
}

describe("fixed assembly/1 executable reference", () => {
  it("freezes distinct fixed canonical bytes, manifest hash, slots and slots hash", () => {
    const manifest = makeFixedManifest({ units: [makeUnit(1)], seed: 0 });
    const parsed = parseFixedAssemblyManifest(manifest);
    const actualBytes = new TextDecoder().decode(parsed.bytes);
    const expectedBytes = `{"algorithmVersion":"assembly/1","bankRevision":"snapshot:2026-10-19:α","blueprint":{"allowedTypes":["SINGLE_CHOICE"],"bundlePolicy":"ALL_OR_NONE","evidenceIds":[],"excludedQuestionIds":[],"maxPerSource":null,"name":"Synthetic assembly reference","profileKind":"INDEPENDENT_PRACTICE","quotas":[],"releasePolicy":"after-grade-v1","schemaVersion":"blueprint/1","scoringPolicy":"practice-binary-v1","sections":[{"count":1,"durationSeconds":60,"id":"math-section","section":"MATH"}],"taxonomyVersionId":"00000000-0000-4000-8000-000000000384"},"blueprintHash":"sha256:fe6f515d2ea8fc9c754179cf0f1b95793d77028b856f9d328990ca8aef484f96","blueprintVersionId":"00000000-0000-4000-8000-000000000320","conflicts":[],"formMode":"PUBLISHED_FIXED","limits":{"maxNodes":50000,"maxUnits":2000},"reuseMode":"FIXED_AS_PUBLISHED","rightsVersions":[{"contentHash":"sha256:0000000000000000000000000000000000000000000000000000000000011170","sourceId":"00000000-0000-4000-8000-00000000c351","versionId":"00000000-0000-4000-8000-00000000ea60"}],"schemaVersion":"fixed-assembly-manifest/1","seed":0,"units":[{"id":"00000000-0000-4000-8000-000000000001","members":[{"cognitiveLevel":"M1","contentHash":"sha256:0000000000000000000000000000000000000000000000000000000000007531","difficulty":"EASY","exposureCount":0,"groupId":"00000000-0000-4000-8000-000000009c41","interactionType":"SINGLE_CHOICE","questionId":"00000000-0000-4000-8000-000000002711","section":"MATH","skillIds":["00000000-0000-4000-8000-0000000001f5"],"sourceIds":["00000000-0000-4000-8000-00000000c351"],"taxonomyVersionId":"00000000-0000-4000-8000-000000000384","versionId":"00000000-0000-4000-8000-000000004e21"}],"sectionId":"math-section"}]}`;
    assert.equal(actualBytes, expectedBytes);
    assert.equal(parsed.manifestHash, "sha256:08da6dd39e7b0864e66336e2158689015e28f787816d03454978cd1e9c43b75f");

    const result = runFixedAssemblyReference(manifest);
    assert.equal(result.status, "SUCCESS");
    assert.deepEqual(result.slots, [{
      sectionId: "math-section",
      ordinal: 0,
      unitId: uuid(1),
      questionId: uuid(10_001),
      questionVersionId: uuid(20_001),
      contentHash: digest(30_001),
    }]);
    assert.equal(result.manifestHash, "sha256:08da6dd39e7b0864e66336e2158689015e28f787816d03454978cd1e9c43b75f");
    assert.equal(result.slotsHash, "sha256:e46d93859ed65ee718e3d11be7ebd636df554dcf19a7f45475a26d1181ff007f");
  });

  it("normalizes only common sets and units while preserving blueprint and member order", () => {
    const bundle = makeUnit(11, [makeMember({ identity: 111, skillIds: [SKILL_502, SKILL_501], sourceIds: [uuid(50_112), uuid(50_111)] })]);
    const other = makeUnit(12);
    const third = makeUnit(13);
    const manifest = makeFixedManifest({ units: [bundle, other, third], conflicts: [{ leftUnitId: other.id, rightUnitId: third.id }] });
    const permuted = structuredClone(manifest);
    permuted.units.reverse();
    permuted.units[2]!.members[0]!.skillIds.reverse();
    permuted.units[2]!.members[0]!.sourceIds.reverse();
    permuted.rightsVersions.reverse();
    [permuted.conflicts[0]!.leftUnitId, permuted.conflicts[0]!.rightUnitId] = [permuted.conflicts[0]!.rightUnitId, permuted.conflicts[0]!.leftUnitId];
    assert.equal(parseFixedAssemblyManifest(manifest).manifestHash, parseFixedAssemblyManifest(permuted).manifestHash);
    assert.deepEqual(parseFixedAssemblyManifest(manifest).manifest.units[0]!.members[0]!.skillIds, [SKILL_501, SKILL_502]);
    assert.deepEqual(parseFixedAssemblyManifest(manifest).manifest.units.find((unit) => unit.id === bundle.id)!.members[0]!.sourceIds, [uuid(50_111), uuid(50_112)]);
    assert.equal(parseFixedAssemblyManifest(manifest).manifest.bankRevision, "snapshot:2026-10-19:α");
    assert.notEqual(parseFixedAssemblyManifest(manifest).manifestHash, parseFixedAssemblyManifest({ ...manifest, bankRevision: "snapshot:changed:😀" }).manifestHash);
  });

  it("rejects foreign modes, personal history and all unrecognized fields, including empty history", () => {
    const valid = makeFixedManifest();
    const invalidInputs: unknown[] = [
      { ...valid, schemaVersion: "assembly-manifest/1" },
      { ...valid, reuseMode: "REVIEW_ALLOWED" },
      { ...valid, reuseMode: "NEW_ONLY" },
      { ...valid, formMode: "NEW_ONLY" },
      { ...valid, historyQuestionIds: [] },
      { ...valid, historyGroupIds: [] },
      { ...valid, historyQuestionIds: [uuid(90)] },
      { ...valid, historyRevision: 0 },
      { ...valid, userId: uuid(91) },
      { ...valid, unexpected: true },
    ];
    for (const input of invalidInputs) assert.throws(() => parseFixedAssemblyManifest(input));
    assert.throws(() => parseAssemblyManifest(valid));
    assert.throws(() => parseFixedAssemblyManifest({ ...valid, blueprintHash: digest(999) }), /Blueprint hash/);
  });

  it("enforces the same common snapshot byte, raw-unit, bundle and search bounds", () => {
    const valid = makeFixedManifest();
    assert.throws(() => parseFixedAssemblyManifest({ ...valid, units: Array.from({ length: 10_001 }, () => valid.units[0]) }), /10,000 raw units/);
    const largeBundle = makeUnit(61, Array.from({ length: 201 }, (_, index) => makeMember({ identity: 600 + index })));
    assert.throws(() => parseFixedAssemblyManifest(makeFixedManifest({ units: [largeBundle] })), /200 members/);
    assert.throws(() => parseFixedAssemblyManifest({ ...valid, limits: { ...valid.limits, maxNodes: 50_001 } }));
    assert.throws(() => parseFixedAssemblyManifest({ ...valid, limits: { ...valid.limits, maxUnits: 2_001 } }));
    assert.throws(() => parseFixedAssemblyManifest({ ...valid, bankRevision: "x".repeat(16 * 1024 * 1024) }), /16 MiB/);
  });

  it("uses the same single baseline search and ignores no fixed candidates through a personal parser", () => {
    const historicalQuestion = makeUnit(21);
    const alternative = makeUnit(22);
    const fixed = makeFixedManifest({ blueprint: makeBlueprint({ count: 1 }), units: [historicalQuestion, alternative], seed: 0 });
    const fixedResult = runFixedAssemblyReference(fixed);
    const reviewAllowed = personalManifest(fixed, {
      historyQuestionIds: [historicalQuestion.members[0]!.questionId],
      historyGroupIds: [historicalQuestion.members[0]!.groupId],
    });
    const personalResult = runAssemblyReference(reviewAllowed);
    assert.equal(fixedResult.status, "SUCCESS");
    assert.equal(personalResult.status, "SUCCESS");
    if (fixedResult.status === "SUCCESS" && personalResult.status === "SUCCESS") {
      assert.deepEqual(fixedResult.slots, personalResult.slots);
      assert.equal(fixedResult.visitedNodes, personalResult.visitedNodes);
      assert.notEqual(fixedResult.manifestHash, personalResult.manifestHash);
    }
  });

  it("preserves seed and BigInt exposure ranking in the fixed baseline", () => {
    const tieUnits = [1, 2, 3, 4, 5].map((identity) => makeUnit(identity));
    assert.deepEqual(resultUnitIds(runFixedAssemblyReference(makeFixedManifest({ units: tieUnits, seed: 0 }))), [uuid(4)]);
    assert.deepEqual(resultUnitIds(runFixedAssemblyReference(makeFixedManifest({ units: tieUnits, seed: 1 }))), [uuid(3)]);

    const higherExposure = makeUnit(81, [
      makeMember({ identity: 181, exposureCount: Number.MAX_SAFE_INTEGER }),
      makeMember({ identity: 182, exposureCount: Number.MAX_SAFE_INTEGER }),
    ]);
    const lowerExposure = makeUnit(82, [
      makeMember({ identity: 183, exposureCount: Number.MAX_SAFE_INTEGER }),
      makeMember({ identity: 184, exposureCount: Number.MAX_SAFE_INTEGER - 1 }),
    ]);
    const ranked = runFixedAssemblyReference(makeFixedManifest({
      blueprint: makeBlueprint({ count: 2 }),
      units: [higherExposure, lowerExposure],
      seed: 0,
    }));
    assert.equal(ranked.status, "SUCCESS");
    assert.deepEqual(resultUnitIds(ranked), [lowerExposure.id]);
  });

  it("selects whole bundles with exact quota, source, conflict, exclusion and slot-order checks", () => {
    const sections = [
      { id: "first-section", section: "MATH" as const, count: 2, durationSeconds: 60 },
      { id: "second-section", section: "READING" as const, count: 1, durationSeconds: 60 },
    ];
    const bundle = makeUnit(31, [
      makeMember({ identity: 231, skillIds: [SKILL_501], sourceIds: [uuid(90_001)] }),
      makeMember({ identity: 232, skillIds: [SKILL_501], sourceIds: [uuid(90_002)] }),
    ], "first-section");
    const alternative = makeUnit(32, [makeMember({ identity: 233, skillIds: [SKILL_502] })], "first-section");
    const reading = makeUnit(33, [makeMember({ identity: 234, section: "READING", sourceIds: [uuid(90_003)] })], "second-section");
    const excludedBundle = makeUnit(34, [
      makeMember({ identity: 235, skillIds: [SKILL_501] }),
      makeMember({ identity: 236, skillIds: [SKILL_502] }),
    ], "first-section");
    const blueprint = makeBlueprint({
      sections,
      quotas: [{ sectionId: "first-section", dimension: "SKILL", value: SKILL_501, min: 2, max: 2 }],
      maxPerSource: 1,
    });
    const manifest = makeFixedManifest({
      blueprint: { ...blueprint, excludedQuestionIds: [excludedBundle.members[1]!.questionId] },
      units: [reading, alternative, excludedBundle, bundle],
      conflicts: [{ leftUnitId: bundle.id, rightUnitId: alternative.id }],
      seed: 7,
    });
    const result = runFixedAssemblyReference(manifest);
    assert.equal(result.status, "SUCCESS");
    if (result.status === "SUCCESS") {
      assert.deepEqual(result.slots.map((slot) => [slot.sectionId, slot.ordinal, slot.unitId, slot.questionId]), [
        ["first-section", 0, bundle.id, bundle.members[0]!.questionId],
        ["first-section", 1, bundle.id, bundle.members[1]!.questionId],
        ["second-section", 0, reading.id, reading.members[0]!.questionId],
      ]);
      assert.equal(result.slots.some((slot) => slot.unitId === excludedBundle.id), false);
    }

    const sourceCapped = runFixedAssemblyReference(makeFixedManifest({
      blueprint: makeBlueprint({ count: 2, maxPerSource: 1 }),
      units: [
        makeUnit(35, [makeMember({ identity: 237, sourceIds: [uuid(90_010)] })]),
        makeUnit(36, [makeMember({ identity: 238, sourceIds: [uuid(90_010)] })]),
      ],
    }));
    assert.equal(sourceCapped.status, "FAILURE");
    if (sourceCapped.status === "FAILURE") {
      assert.equal(sourceCapped.code, "INSUFFICIENT_ELIGIBLE_INVENTORY");
      assert.deepEqual(sourceCapped.slots, []);
    }
  });

  it("distinguishes intrinsic conflict, proven infeasibility and bounded exhaustion without partial slots", () => {
    const intrinsic = makeFixedManifest({
      blueprint: makeBlueprint({ count: 1, quotas: [
        { sectionId: "math-section", dimension: "COGNITIVE_LEVEL", value: "M1", min: 1, max: 1 },
        { sectionId: "math-section", dimension: "COGNITIVE_LEVEL", value: "M2", min: 1, max: 1 },
      ] }),
    });
    const conflict = runFixedAssemblyReference(intrinsic);
    assert.equal(conflict.status, "FAILURE");
    if (conflict.status === "FAILURE") {
      assert.equal(conflict.code, "CONSTRAINT_CONFLICT");
      assert.deepEqual(conflict.slots, []);
    }

    const notEnough = runFixedAssemblyReference(makeFixedManifest({
      blueprint: makeBlueprint({ count: 2 }),
      units: [makeUnit(41)],
    }));
    assert.equal(notEnough.status, "FAILURE");
    if (notEnough.status === "FAILURE") {
      assert.equal(notEnough.code, "INSUFFICIENT_ELIGIBLE_INVENTORY");
      assert.deepEqual(notEnough.slots, []);
    }

    const conflictingUnits = [makeUnit(42), makeUnit(43)];
    const constrainedInfeasible = runFixedAssemblyReference(makeFixedManifest({
      blueprint: makeBlueprint({ count: 2 }),
      units: conflictingUnits,
      conflicts: [{ leftUnitId: conflictingUnits[0]!.id, rightUnitId: conflictingUnits[1]!.id }],
    }));
    assert.equal(constrainedInfeasible.status, "FAILURE");
    if (constrainedInfeasible.status === "FAILURE") {
      assert.equal(constrainedInfeasible.code, "INSUFFICIENT_ELIGIBLE_INVENTORY");
      assert.deepEqual(constrainedInfeasible.slots, []);
    }

    const nodeLimited = runFixedAssemblyReference(makeFixedManifest({ units: [makeUnit(44), makeUnit(45)], maxNodes: 1 }));
    assert.equal(nodeLimited.status, "FAILURE");
    if (nodeLimited.status === "FAILURE") {
      assert.equal(nodeLimited.code, "SEARCH_EXHAUSTED");
      assert.equal(nodeLimited.visitedNodes, 1);
      assert.deepEqual(nodeLimited.slots, []);
    }
    const unitLimited = runFixedAssemblyReference(makeFixedManifest({ units: [makeUnit(46)], maxUnits: 0 }));
    assert.equal(unitLimited.status, "FAILURE");
    if (unitLimited.status === "FAILURE") {
      assert.equal(unitLimited.code, "SEARCH_EXHAUSTED");
      assert.equal(unitLimited.visitedNodes, 0);
      assert.deepEqual(unitLimited.slots, []);
    }
  });

  it("replays both fixed hashes and reports mismatches without changing the manifest", () => {
    const manifest = makeFixedManifest({ units: [makeUnit(51)] });
    const before = structuredClone(manifest);
    const result = runFixedAssemblyReference(manifest);
    const exact = replayFixedAssemblyReference(manifest, { manifestHash: result.manifestHash, slotsHash: result.slotsHash });
    assert.equal(exact.matches, true);
    assert.deepEqual(exact.mismatches, []);
    assert.deepEqual(manifest, before);

    const mismatched = replayFixedAssemblyReference({ ...manifest, bankRevision: "snapshot:replay-change" }, {
      manifestHash: result.manifestHash,
      slotsHash: `sha256:${"0".repeat(64)}`,
    });
    assert.equal(mismatched.matches, false);
    assert.deepEqual(mismatched.mismatches, ["manifestHash", "slotsHash"]);
    assert.throws(() => replayFixedAssemblyReference(manifest, { manifestHash: "invalid", slotsHash: result.slotsHash }));
  });

  it("matches an independent exhaustive feasible-set oracle for fixed small graphs", () => {
    let randomState = 0x0f1eed;
    const next = () => {
      randomState = (Math.imul(randomState ^ (randomState >>> 15), 1 | randomState) + 0x6d2b79f5) | 0;
      let value = randomState;
      value = Math.imul(value ^ (value >>> 7), 61 | value) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
    };

    for (let caseIndex = 0; caseIndex < 24; caseIndex += 1) {
      const units = [];
      const questionGroups = new Map<number, number>();
      for (let index = 0; index < 6; index += 1) {
        const identity = 700 + caseIndex * 10 + index;
        const questionIdentity = index > 0 && next() < 0.18
          ? 700 + caseIndex * 10 + Math.floor(next() * index)
          : identity;
        const groupIdentity = questionGroups.get(questionIdentity) ?? 20_000 + questionIdentity;
        questionGroups.set(questionIdentity, groupIdentity);
        units.push(makeUnit(identity, [makeMember({
          identity,
          questionId: uuid(30_000 + questionIdentity),
          groupId: uuid(50_000 + groupIdentity),
          versionId: uuid(70_000 + identity),
          skillIds: next() < 0.5 ? [SKILL_501] : [SKILL_502],
          difficulty: next() < 0.5 ? "EASY" : "MEDIUM",
          sourceIds: [uuid(90_000 + Math.floor(next() * 3))],
        })]));
      }
      const conflicts: FixedAssemblyManifest["conflicts"] = [];
      for (let left = 0; left < units.length; left += 1) for (let right = left + 1; right < units.length; right += 1) {
        if (next() < 0.12) conflicts.push({ leftUnitId: units[left]!.id, rightUnitId: units[right]!.id });
      }
      const blueprintBase = makeBlueprint({
        count: 2,
        maxPerSource: next() < 0.5 ? 1 : 2,
        quotas: [{ sectionId: "math-section", dimension: "SKILL", value: SKILL_501, min: 1, max: 2 }],
      });
      const blueprint = next() < 0.25
        ? { ...blueprintBase, excludedQuestionIds: [units[0]!.members[0]!.questionId] }
        : blueprintBase;
      const manifest = makeFixedManifest({ blueprint, units, conflicts, seed: caseIndex });
      const feasible = oracleFeasibleSets(manifest);
      const result = runFixedAssemblyReference(manifest);
      assert.equal(result.status === "SUCCESS", feasible.length > 0, `oracle feasibility mismatch for fixed case ${caseIndex}`);
      if (result.status === "SUCCESS") {
        assert.ok(feasible.some((ids) => JSON.stringify(ids) === JSON.stringify(resultUnitIds(result))));
      } else {
        assert.ok(["CONSTRAINT_CONFLICT", "SEARCH_EXHAUSTED", "INSUFFICIENT_ELIGIBLE_INVENTORY"].includes(result.code));
        assert.deepEqual(result.slots, []);
      }
    }
  });
});
