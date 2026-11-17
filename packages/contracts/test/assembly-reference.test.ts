import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseAssemblyManifest,
  replanAssemblyReference,
  replayAssemblyReference,
  runAssemblyReference,
  type AssemblyManifest,
  type AssemblyUnit,
} from "../src/assembly-reference.ts";
import {
  SECTION_ID,
  SKILL_501,
  SKILL_502,
  digest,
  makeBlueprint,
  makeManifest,
  makeMember,
  makeUnit,
  uuid,
} from "./fixtures/assembly-reference.ts";

function quota(
  dimension: "SKILL" | "COGNITIVE_LEVEL" | "DIFFICULTY",
  value: string,
  min: number,
  max: number,
  sectionId = SECTION_ID,
): AssemblyManifest["blueprint"]["quotas"][number] {
  return { sectionId, dimension, value, min, max } as AssemblyManifest["blueprint"]["quotas"][number];
}

function sortedSet(values: string[]): string[] {
  return [...values].sort();
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Independent exhaustive subset oracle. It does not call production parsing or validation. */
function oracleSets(manifest: AssemblyManifest, studentHistory = false): string[][] {
  const excluded = new Set(manifest.blueprint.excludedQuestionIds);
  const historyQuestions = new Set(manifest.historyQuestionIds);
  const historyGroups = new Set(manifest.historyGroupIds);
  const candidates = manifest.units.filter((unit) => !unit.members.some((member) =>
    excluded.has(member.questionId) || (studentHistory && (historyQuestions.has(member.questionId) || historyGroups.has(member.groupId))),
  ));
  assert.ok(candidates.length < 31, "the independent oracle is intentionally limited to small manifests");
  const conflicts = new Set(manifest.conflicts.map(({ leftUnitId, rightUnitId }) => [leftUnitId, rightUnitId].sort().join("\u0000")));
  const feasible: string[][] = [];
  for (let mask = 0; mask < 2 ** candidates.length; mask += 1) {
    const selected = candidates.filter((_, index) => (mask & (1 << index)) !== 0);
    const sectionCounts = new Map(manifest.blueprint.sections.map((section) => [section.id, 0]));
    const quotaCounts = new Map(manifest.blueprint.quotas.map((entry) => [quotaOracleKey(entry), 0]));
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
        for (const entry of manifest.blueprint.quotas) {
          if (entry.sectionId !== unit.sectionId) continue;
          const matches = entry.dimension === "SKILL"
            ? member.skillIds.includes(entry.value)
            : entry.dimension === "COGNITIVE_LEVEL"
              ? member.cognitiveLevel === entry.value
              : member.difficulty === entry.value;
          if (matches) quotaCounts.set(quotaOracleKey(entry), (quotaCounts.get(quotaOracleKey(entry)) ?? 0) + 1);
        }
        for (const sourceId of member.sourceIds) sources.set(sourceId, (sources.get(sourceId) ?? 0) + 1);
      }
    }
    for (let left = 0; left < selected.length; left += 1) for (let right = left + 1; right < selected.length; right += 1) {
      if (conflicts.has([selected[left]!.id, selected[right]!.id].sort().join("\u0000"))) valid = false;
    }
    for (const section of manifest.blueprint.sections) if (sectionCounts.get(section.id) !== section.count) valid = false;
    for (const entry of manifest.blueprint.quotas) {
      const count = quotaCounts.get(quotaOracleKey(entry)) ?? 0;
      if (count < entry.min || count > entry.max) valid = false;
    }
    if (manifest.blueprint.maxPerSource !== null && [...sources.values()].some((count) => count > manifest.blueprint.maxPerSource!)) valid = false;
    if (valid) feasible.push(sortedSet(selected.map((unit) => unit.id)));
  }
  return feasible.sort((left, right) => compareCodeUnits(left.join("\u0000"), right.join("\u0000")));
}

function quotaOracleKey(entry: AssemblyManifest["blueprint"]["quotas"][number]): string {
  return `${entry.sectionId}\u0000${entry.dimension}\u0000${entry.value}`;
}

function resultUnitIds(result: ReturnType<typeof runAssemblyReference>): string[] {
  return sortedSet(result.status === "SUCCESS" ? [...new Set(result.slots.map((slot) => slot.unitId))] : []);
}

describe("assembly/1 executable reference", () => {
  it("freezes canonical manifest bytes and the manifest-to-slot golden", () => {
    const manifest = makeManifest({ units: [makeUnit(1)], seed: 0 });
    const parsed = parseAssemblyManifest(manifest);
    const actualBytes = new TextDecoder().decode(parsed.bytes);
    const expectedBytes = `{"algorithmVersion":"assembly/1","bankRevision":"snapshot:2026-10-19:α","blueprint":{"allowedTypes":["SINGLE_CHOICE"],"bundlePolicy":"ALL_OR_NONE","evidenceIds":[],"excludedQuestionIds":[],"maxPerSource":null,"name":"Synthetic assembly reference","profileKind":"INDEPENDENT_PRACTICE","quotas":[],"releasePolicy":"after-grade-v1","schemaVersion":"blueprint/1","scoringPolicy":"practice-binary-v1","sections":[{"count":1,"durationSeconds":60,"id":"math-section","section":"MATH"}],"taxonomyVersionId":"00000000-0000-4000-8000-000000000384"},"blueprintHash":"sha256:fe6f515d2ea8fc9c754179cf0f1b95793d77028b856f9d328990ca8aef484f96","blueprintVersionId":"00000000-0000-4000-8000-000000000320","conflicts":[],"historyGroupIds":[],"historyQuestionIds":[],"limits":{"maxNodes":50000,"maxUnits":2000},"reuseMode":"REVIEW_ALLOWED","rightsVersions":[{"contentHash":"sha256:0000000000000000000000000000000000000000000000000000000000011170","sourceId":"00000000-0000-4000-8000-00000000c351","versionId":"00000000-0000-4000-8000-00000000ea60"}],"schemaVersion":"assembly-manifest/1","seed":0,"units":[{"id":"00000000-0000-4000-8000-000000000001","members":[{"cognitiveLevel":"M1","contentHash":"sha256:0000000000000000000000000000000000000000000000000000000000007531","difficulty":"EASY","exposureCount":0,"groupId":"00000000-0000-4000-8000-000000009c41","interactionType":"SINGLE_CHOICE","questionId":"00000000-0000-4000-8000-000000002711","section":"MATH","skillIds":["00000000-0000-4000-8000-0000000001f5"],"sourceIds":["00000000-0000-4000-8000-00000000c351"],"taxonomyVersionId":"00000000-0000-4000-8000-000000000384","versionId":"00000000-0000-4000-8000-000000004e21"}],"sectionId":"math-section"}]}`;
    assert.equal(actualBytes, expectedBytes);
    assert.equal(parsed.manifestHash, "sha256:652ee7e01fd7551d7f87f65082dbddadf3839b583863342abd1c92f7bed1a8de");

    const result = runAssemblyReference(manifest);
    assert.equal(result.status, "SUCCESS");
    if (result.status !== "SUCCESS") return;
    assert.deepEqual(result.slots, [{
      sectionId: SECTION_ID,
      ordinal: 0,
      unitId: uuid(1),
      questionId: uuid(10_001),
      questionVersionId: uuid(20_001),
      contentHash: digest(30_001),
    }]);
    assert.equal(result.manifestHash, "sha256:652ee7e01fd7551d7f87f65082dbddadf3839b583863342abd1c92f7bed1a8de");
    assert.equal(result.slotsHash, "sha256:e46d93859ed65ee718e3d11be7ebd636df554dcf19a7f45475a26d1181ff007f");
  });

  it("normalizes only documented set and unit ordering while preserving blueprint/member order and Unicode", () => {
    const first = makeUnit(1, [makeMember({ identity: 1, skillIds: [SKILL_502, SKILL_501], sourceIds: [uuid(50_001), uuid(50_002)] })]);
    const second = makeUnit(2);
    const third = makeUnit(3);
    const blueprint = makeBlueprint({ count: 1, quotas: [quota("SKILL", SKILL_501, 0, 1)] });
    const manifest = makeManifest({
      blueprint,
      units: [first, second, third],
      historyQuestionIds: [uuid(30), uuid(20)],
      historyGroupIds: [uuid(40), uuid(10)],
      conflicts: [{ leftUnitId: third.id, rightUnitId: second.id }],
    });
    const permuted = structuredClone(manifest);
    permuted.units.reverse();
    permuted.units[2]!.members[0]!.skillIds.reverse();
    permuted.units[2]!.members[0]!.sourceIds.reverse();
    permuted.rightsVersions.reverse();
    permuted.historyQuestionIds.reverse();
    permuted.historyGroupIds.reverse();
    [permuted.conflicts[0]!.leftUnitId, permuted.conflicts[0]!.rightUnitId] = [permuted.conflicts[0]!.rightUnitId, permuted.conflicts[0]!.leftUnitId];
    assert.equal(parseAssemblyManifest(manifest).manifestHash, parseAssemblyManifest(permuted).manifestHash);
    assert.equal(
      parseAssemblyManifest(manifest).manifestHash,
      parseAssemblyManifest({ ...manifest, historyQuestionIds: [...manifest.historyQuestionIds, manifest.historyQuestionIds[0]!] }).manifestHash,
    );
    assert.equal(parseAssemblyManifest(manifest).manifest.bankRevision, "snapshot:2026-10-19:α");
    assert.notEqual(parseAssemblyManifest(manifest).manifestHash, parseAssemblyManifest({ ...manifest, bankRevision: "snapshot:2026-10-19:😀" }).manifestHash);
  });

  it("emits sections in blueprint order and bundle members in frozen order, with source caps spanning sections", () => {
    const blueprint = makeBlueprint({
      sections: [
        { id: "first-section", section: "MATH", count: 2, durationSeconds: 60 },
        { id: "second-section", section: "READING", count: 1, durationSeconds: 60 },
      ],
      maxPerSource: 2,
    });
    const sharedSource = uuid(91_000);
    const firstBundle = makeUnit(91, [
      makeMember({ identity: 291, section: "MATH", sourceIds: [sharedSource] }),
      makeMember({ identity: 292, section: "MATH", sourceIds: [uuid(91_001)] }),
    ], "first-section");
    const secondSection = makeUnit(92, [makeMember({ identity: 293, section: "READING", sourceIds: [sharedSource] })], "second-section");
    const manifest = makeManifest({ blueprint, units: [secondSection, firstBundle], seed: 0 });
    const result = runAssemblyReference(manifest);
    assert.equal(result.status, "SUCCESS");
    if (result.status === "SUCCESS") {
      assert.deepEqual(result.slots.map((slot) => [slot.sectionId, slot.ordinal, slot.unitId, slot.questionId]), [
        ["first-section", 0, firstBundle.id, uuid(10_291)],
        ["first-section", 1, firstBundle.id, uuid(10_292)],
        ["second-section", 0, secondSection.id, uuid(10_293)],
      ]);
    }
    const capped = makeManifest({ blueprint: { ...blueprint, maxPerSource: 1 }, units: [firstBundle, secondSection] });
    const cappedResult = runAssemblyReference(capped);
    assert.equal(cappedResult.status, "FAILURE");
    if (cappedResult.status === "FAILURE") {
      assert.equal(cappedResult.code, "INSUFFICIENT_ELIGIBLE_INVENTORY");
      assert.deepEqual(cappedResult.slots, []);
    }
  });

  it("uses seeded order only after BigInt exposure sums and preserves first-seeded tie behavior", () => {
    const units = [1, 2, 3, 4, 5].map((identity) => makeUnit(identity));
    const seedZero = runAssemblyReference(makeManifest({ units, seed: 0 }));
    const seedOne = runAssemblyReference(makeManifest({ units, seed: 1 }));
    assert.deepEqual(resultUnitIds(seedZero), [uuid(4)]);
    assert.deepEqual(resultUnitIds(seedOne), [uuid(3)]);

    const selectedTwo = [
      makeUnit(1, [makeMember({ identity: 191, exposureCount: 0 })]),
      makeUnit(2, [makeMember({ identity: 192, exposureCount: 1 })]),
      makeUnit(3, [makeMember({ identity: 193, exposureCount: 2 })]),
    ];
    const orderedBySeed = runAssemblyReference(makeManifest({ blueprint: makeBlueprint({ count: 2 }), units: selectedTwo, seed: 0 }));
    assert.equal(orderedBySeed.status, "SUCCESS");
    if (orderedBySeed.status === "SUCCESS") assert.deepEqual(orderedBySeed.slots.map((slot) => slot.unitId), [uuid(2), uuid(1)]);
  });

  it("matches the independent known subset oracle for overlapping skill quotas", () => {
    const one = makeUnit(1, [makeMember({ identity: 1, skillIds: [SKILL_501, SKILL_502] })]);
    const two = makeUnit(2, [makeMember({ identity: 2, skillIds: [SKILL_501] })]);
    const three = makeUnit(3, [makeMember({ identity: 3, skillIds: [SKILL_502] })]);
    const manifest = makeManifest({
      blueprint: makeBlueprint({ count: 2, quotas: [quota("SKILL", SKILL_501, 1, 2), quota("SKILL", SKILL_502, 1, 2)] }),
      units: [one, two, three],
    });
    const oracle = oracleSets(manifest);
    assert.deepEqual(oracle, [[one.id, two.id], [one.id, three.id], [two.id, three.id]].map(sortedSet).sort((left, right) => compareCodeUnits(left.join(), right.join())));
    const result = runAssemblyReference(manifest);
    assert.equal(result.status, "SUCCESS");
    assert.ok(oracle.some((set) => JSON.stringify(set) === JSON.stringify(resultUnitIds(result))));
  });

  it("reports mutually exclusive cognitive and difficulty minima as a pre-search conflict", () => {
    const units = [11, 12, 13].map((identity) => makeUnit(identity, [makeMember({
      identity,
      cognitiveLevel: identity === 13 ? "M2" : "M1",
      difficulty: identity === 13 ? "MEDIUM" : "EASY",
    })]));
    const manifest = makeManifest({
      blueprint: makeBlueprint({ count: 2, quotas: [
        quota("COGNITIVE_LEVEL", "M1", 2, 2), quota("COGNITIVE_LEVEL", "M2", 1, 1),
        quota("DIFFICULTY", "EASY", 2, 2), quota("DIFFICULTY", "MEDIUM", 1, 1),
      ] }),
      units,
    });
    assert.deepEqual(oracleSets(manifest), []);
    const result = runAssemblyReference(manifest);
    assert.equal(result.status, "FAILURE");
    if (result.status === "FAILURE") {
      assert.equal(result.code, "CONSTRAINT_CONFLICT");
      assert.equal(result.visitedNodes, 0);
      assert.deepEqual(result.slots, []);
    }
  });

  it("does not let unknown nullable cognition or difficulty satisfy a quota", () => {
    const member = makeMember({ identity: 14, cognitiveLevel: null, difficulty: null });
    const manifest = makeManifest({
      blueprint: makeBlueprint({ count: 1, quotas: [quota("COGNITIVE_LEVEL", "M1", 1, 1), quota("DIFFICULTY", "EASY", 1, 1)] }),
      units: [makeUnit(14, [member])],
    });
    assert.deepEqual(oracleSets(manifest), []);
    const result = runAssemblyReference(manifest);
    assert.equal(result.status, "FAILURE");
    if (result.status === "FAILURE") assert.equal(result.code, "INSUFFICIENT_ELIGIBLE_INVENTORY");
  });

  it("treats oversized bundles and source caps as branch constraints, not manifest errors", () => {
    const bundle = makeUnit(21, [
      makeMember({ identity: 121, sourceIds: [uuid(721)] }),
      makeMember({ identity: 122, sourceIds: [uuid(722)] }),
    ]);
    const badBundle = makeUnit(22, [
      makeMember({ identity: 123, sourceIds: [uuid(721)] }),
      makeMember({ identity: 124, sourceIds: [uuid(721)] }),
    ]);
    const singleA = makeUnit(23, [makeMember({ identity: 125, sourceIds: [uuid(721)] })]);
    const singleB = makeUnit(24, [makeMember({ identity: 126, sourceIds: [uuid(722)] })]);
    const manifest = makeManifest({ blueprint: makeBlueprint({ count: 2, maxPerSource: 1 }), units: [bundle, badBundle, singleA, singleB] });
    assert.deepEqual(oracleSets(manifest), [[bundle.id], [singleA.id, singleB.id]].map(sortedSet));
    const parsed = parseAssemblyManifest(manifest);
    assert.equal(parsed.manifest.units.length, 4);
    const result = runAssemblyReference(manifest);
    assert.equal(result.status, "SUCCESS");
    assert.ok(oracleSets(manifest).some((set) => JSON.stringify(set) === JSON.stringify(resultUnitIds(result))));
  });

  it("enforces stable question and group uniqueness, cross-unit conflicts, and whole bundles", () => {
    const altA = makeUnit(31, [makeMember({ identity: 131, questionId: uuid(131), groupId: uuid(231), versionId: uuid(30_131) })]);
    const altB = makeUnit(32, [makeMember({ identity: 132, questionId: uuid(131), groupId: uuid(231), versionId: uuid(30_132) })]);
    const third = makeUnit(33, [makeMember({ identity: 133, questionId: uuid(133), groupId: uuid(233) })]);
    const fourth = makeUnit(34, [makeMember({ identity: 134, questionId: uuid(134), groupId: uuid(233) })]);
    const fifth = makeUnit(35, [makeMember({ identity: 135, questionId: uuid(135), groupId: uuid(235) })]);
    const manifest = makeManifest({
      blueprint: makeBlueprint({ count: 2 }),
      units: [altA, altB, third, fourth, fifth],
      conflicts: [{ leftUnitId: fourth.id, rightUnitId: fifth.id }],
    });
    assert.equal(oracleSets(manifest).length, 7);
    assert.deepEqual(oracleSets(manifest), [
      [altA.id, third.id], [altA.id, fourth.id], [altA.id, fifth.id],
      [altB.id, third.id], [altB.id, fourth.id], [altB.id, fifth.id], [third.id, fifth.id],
    ].map(sortedSet).sort((left, right) => compareCodeUnits(left.join("\u0000"), right.join("\u0000"))));
    const result = runAssemblyReference(manifest);
    assert.equal(result.status, "SUCCESS");
    assert.ok(oracleSets(manifest).some((set) => JSON.stringify(set) === JSON.stringify(resultUnitIds(result))));
    const duplicatedInsideUnit = makeUnit(36, [
      makeMember({ identity: 136, questionId: uuid(136), groupId: uuid(236) }),
      makeMember({ identity: 137, questionId: uuid(137), groupId: uuid(236) }),
    ]);
    assert.throws(() => parseAssemblyManifest(makeManifest({ blueprint: makeBlueprint({ count: 2 }), units: [duplicatedInsideUnit] })), /repeats a stable question or group/);
    const conflictingGroup = makeManifest({ units: [
      makeUnit(37, [makeMember({ identity: 138, questionId: uuid(138), groupId: uuid(238), versionId: uuid(30_138) })]),
      makeUnit(38, [makeMember({ identity: 139, questionId: uuid(138), groupId: uuid(239), versionId: uuid(30_139) })]),
    ] });
    assert.throws(() => parseAssemblyManifest(conflictingGroup), /conflicting canonical groups/);
  });

  it("classifies NEW_ONLY shortages only after the eligible baseline is proven feasible", () => {
    const first = makeUnit(41, [makeMember({ identity: 141, questionId: uuid(141), groupId: uuid(241) })]);
    const second = makeUnit(42, [makeMember({ identity: 142, questionId: uuid(142), groupId: uuid(242) })]);
    const manifest = makeManifest({
      reuseMode: "NEW_ONLY",
      blueprint: makeBlueprint({ count: 1 }),
      units: [first, second],
      historyQuestionIds: [uuid(141)],
      historyGroupIds: [uuid(242)],
    });
    assert.deepEqual(oracleSets(manifest), [[first.id], [second.id]].map(sortedSet).sort((left, right) => compareCodeUnits(left.join("\u0000"), right.join("\u0000"))));
    assert.deepEqual(oracleSets(manifest, true), []);
    const result = runAssemblyReference(manifest);
    assert.equal(result.status, "FAILURE");
    if (result.status === "FAILURE") assert.equal(result.code, "INSUFFICIENT_UNSEEN_INVENTORY");

    const baselineShort = makeManifest({ reuseMode: "NEW_ONLY", blueprint: makeBlueprint({ count: 2 }), units: [first], historyQuestionIds: [uuid(141)] });
    const baselineResult = runAssemblyReference(baselineShort);
    assert.equal(baselineResult.status, "FAILURE");
    if (baselineResult.status === "FAILURE") assert.equal(baselineResult.code, "INSUFFICIENT_ELIGIBLE_INVENTORY");
  });

  it("counts root and entered states exactly and returns no partial slots at node or unit caps", () => {
    const units = [51, 52].map((identity) => makeUnit(identity));
    const oneNode = runAssemblyReference(makeManifest({ units, maxNodes: 1 }));
    assert.equal(oneNode.status, "FAILURE");
    if (oneNode.status === "FAILURE") {
      assert.equal(oneNode.code, "SEARCH_EXHAUSTED");
      assert.equal(oneNode.visitedNodes, 1);
      assert.deepEqual(oneNode.slots, []);
    }
    const noNodes = runAssemblyReference(makeManifest({ units, maxNodes: 0 }));
    assert.equal(noNodes.status, "FAILURE");
    if (noNodes.status === "FAILURE") {
      assert.equal(noNodes.visitedNodes, 0);
      assert.deepEqual(noNodes.slots, []);
    }
    const overUnitCap = runAssemblyReference(makeManifest({ units, maxUnits: 1 }));
    assert.equal(overUnitCap.status, "FAILURE");
    if (overUnitCap.status === "FAILURE") {
      assert.equal(overUnitCap.code, "SEARCH_EXHAUSTED");
      assert.equal(overUnitCap.visitedNodes, 0);
      assert.deepEqual(overUnitCap.slots, []);
    }
    const eligible = makeUnit(53);
    const sharedBudgetManifest = (maxNodes: number) => makeManifest({ reuseMode: "NEW_ONLY", units: [eligible], maxNodes });
    const exhaustedAcrossPhases = runAssemblyReference(sharedBudgetManifest(2));
    assert.equal(exhaustedAcrossPhases.status, "FAILURE");
    if (exhaustedAcrossPhases.status === "FAILURE") {
      assert.equal(exhaustedAcrossPhases.code, "SEARCH_EXHAUSTED");
      assert.equal(exhaustedAcrossPhases.visitedNodes, 2);
      assert.deepEqual(exhaustedAcrossPhases.slots, []);
    }
    const enoughForBothPhases = runAssemblyReference(sharedBudgetManifest(4));
    assert.equal(enoughForBothPhases.status, "SUCCESS");
    if (enoughForBothPhases.status === "SUCCESS") assert.equal(enoughForBothPhases.visitedNodes, 4);
  });

  it("normalizes conflicts and binds replay to both manifest and slot hashes", () => {
    const left = makeUnit(61);
    const right = makeUnit(62);
    const manifest = makeManifest({ blueprint: makeBlueprint({ count: 1 }), units: [left, right], conflicts: [{ leftUnitId: right.id, rightUnitId: left.id }] });
    const result = runAssemblyReference(manifest);
    assert.equal(result.status, "SUCCESS");
    const replay = replayAssemblyReference(manifest, { manifestHash: result.manifestHash, slotsHash: result.slotsHash });
    assert.equal(replay.matches, true);
    assert.deepEqual(replay.mismatches, []);
    const changed = { ...manifest, bankRevision: "snapshot:changed" };
    const mismatch = replayAssemblyReference(changed, { manifestHash: result.manifestHash, slotsHash: "sha256:" + "0".repeat(64) });
    assert.equal(mismatch.matches, false);
    assert.deepEqual(mismatch.mismatches, ["manifestHash", "slotsHash"]);
    assert.throws(() => parseAssemblyManifest(makeManifest({ units: [left, right], conflicts: [{ leftUnitId: left.id, rightUnitId: right.id }, { leftUnitId: right.id, rightUnitId: left.id }] })), /Conflict edges must be unique/);
  });

  it("simulates at most three bounded contention attempts without mutating manifests", () => {
    const manifests = [0, 1, 2].map((attempt) => makeManifest({ bankRevision: `snapshot-${attempt}` }));
    const before = structuredClone(manifests);
    const outcome = replanAssemblyReference(manifests.map((manifest) => ({ manifest, contended: true })), 3);
    assert.equal(outcome.attempts, 3);
    assert.equal(outcome.result.status, "FAILURE");
    if (outcome.result.status === "FAILURE") assert.equal(outcome.result.code, "CONCURRENT_MODIFICATION");
    assert.deepEqual(manifests, before);
    assert.throws(() => replanAssemblyReference([...manifests, ...manifests].map((manifest) => ({ manifest, contended: false })), 3), /one to maxAttempts/);
    assert.throws(() => replanAssemblyReference([{ manifest: manifests[0], contended: true }], 3), /one supplied manifest per maxAttempts/);
  });

  it("discards a contended shortage before classifying it and uses the fresh snapshot", () => {
    const unavailable = makeManifest({
      blueprint: makeBlueprint({ count: 2 }),
      units: [makeUnit(91)],
      bankRevision: "snapshot-before-contention",
    });
    const fresh = makeManifest({ bankRevision: "snapshot-after-contention" });
    const outcome = replanAssemblyReference([
      { manifest: unavailable, contended: true },
      { manifest: fresh, contended: false },
    ], 3);

    assert.equal(outcome.attempts, 2);
    assert.equal(outcome.result.status, "SUCCESS");
    assert.equal(outcome.result.manifestHash, runAssemblyReference(fresh).manifestHash);
  });

  it("returns concurrency failure after three contended shortages instead of stale shortage", () => {
    const shortages = [0, 1, 2].map((index) => makeManifest({
      blueprint: makeBlueprint({ count: 2 }),
      units: [makeUnit(92 + index)],
      bankRevision: `snapshot-short-${index}`,
    }));
    const outcome = replanAssemblyReference(shortages.map((manifest) => ({ manifest, contended: true })), 3);

    assert.equal(outcome.attempts, 3);
    assert.equal(outcome.result.status, "FAILURE");
    if (outcome.result.status === "FAILURE") assert.equal(outcome.result.code, "CONCURRENT_MODIFICATION");
    assert.deepEqual(outcome.result.slots, []);
  });

  it("rejects strict-shape, hash, edge, rights, identity and unsafe-number mutations", () => {
    const valid = makeManifest({ units: [makeUnit(71)] });
    assert.throws(() => parseAssemblyManifest({ ...valid, surprise: true }), /unknown|unrecognized/i);
    assert.throws(() => parseAssemblyManifest({ ...valid, blueprintHash: digest(123) }), /Blueprint hash/);
    assert.throws(() => parseAssemblyManifest({ ...valid, bankRevision: "   " }), /opaque revision/);
    assert.throws(() => parseAssemblyManifest({ ...valid, rightsVersions: [] }), /Rights versions must cover/);
    assert.throws(() => parseAssemblyManifest({ ...valid, conflicts: [{ leftUnitId: valid.units[0]!.id, rightUnitId: valid.units[0]!.id }] }), /self edges/);
    assert.throws(() => parseAssemblyManifest({ ...valid, conflicts: [{ leftUnitId: valid.units[0]!.id, rightUnitId: uuid(999_999) }] }), /missing unit/);
    const unsafeExposure = structuredClone(valid);
    unsafeExposure.units[0]!.members[0]!.exposureCount = Number.MAX_SAFE_INTEGER + 1;
    assert.throws(() => parseAssemblyManifest(unsafeExposure));
    const duplicateTag = structuredClone(valid);
    duplicateTag.units[0]!.members[0]!.skillIds.push(duplicateTag.units[0]!.members[0]!.skillIds[0]!);
    assert.throws(() => parseAssemblyManifest(duplicateTag), /Member skillIds contains duplicates/);
    const changedVersionProjection = makeManifest({ units: [
      makeUnit(72, [makeMember({ identity: 172, questionId: uuid(172), groupId: uuid(272), versionId: uuid(30_172) })]),
      makeUnit(73, [makeMember({ identity: 173, questionId: uuid(173), groupId: uuid(273), versionId: uuid(30_172) })]),
    ] });
    assert.throws(() => parseAssemblyManifest(changedVersionProjection), /conflicting immutable member data/);
  });

  it("enforces raw unit and bundle parser ceilings before search", () => {
    const valid = makeManifest({ units: [makeUnit(74)] });
    assert.throws(() => parseAssemblyManifest({ ...valid, units: Array.from({ length: 10_001 }, () => valid.units[0]) }), /10,000 raw units/);
    const tooManyMembers = makeUnit(75, Array.from({ length: 201 }, (_, index) => makeMember({ identity: 500 + index })));
    const oversizedBundle = makeManifest({ units: [tooManyMembers] });
    assert.throws(() => parseAssemblyManifest(oversizedBundle), /200 members/);
    assert.throws(() => parseAssemblyManifest({ ...valid, limits: { ...valid.limits, maxNodes: 50_001 } }));
    assert.throws(() => parseAssemblyManifest({ ...valid, limits: { ...valid.limits, maxUnits: 2_001 } }));
    assert.throws(() => parseAssemblyManifest({ ...valid, bankRevision: "x".repeat(16 * 1024 * 1024) }), /16 MiB/);
  });

  it("uses BigInt for aggregate exposure ranking beyond Number precision", () => {
    const higher = makeUnit(81, [
      makeMember({ identity: 181, exposureCount: Number.MAX_SAFE_INTEGER }),
      makeMember({ identity: 182, exposureCount: Number.MAX_SAFE_INTEGER }),
    ]);
    const lower = makeUnit(82, [
      makeMember({ identity: 183, exposureCount: Number.MAX_SAFE_INTEGER }),
      makeMember({ identity: 184, exposureCount: Number.MAX_SAFE_INTEGER - 1 }),
    ]);
    const result = runAssemblyReference(makeManifest({ blueprint: makeBlueprint({ count: 2 }), units: [higher, lower], seed: 0 }));
    assert.equal(result.status, "SUCCESS");
    assert.deepEqual(resultUnitIds(result), [lower.id]);
  });

  it("matches the independent oracle across deterministic randomized small manifests", () => {
    let state = 0x5eed1234;
    const next = () => {
      state = (Math.imul(state ^ (state >>> 15), 1 | state) + 0x6d2b79f5) | 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 7), 61 | value) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
    };
    for (let caseIndex = 0; caseIndex < 60; caseIndex += 1) {
      const units: AssemblyUnit[] = [];
      const identityByQuestion = new Map<number, number>();
      for (let index = 0; index < 7; index += 1) {
        const identity = 500 + caseIndex * 10 + index;
        let questionIdentity = identity;
        if (index > 0 && next() < 0.2) questionIdentity = 500 + caseIndex * 10 + Math.floor(next() * index);
        const groupIdentity = identityByQuestion.get(questionIdentity) ?? 2_000 + questionIdentity;
        identityByQuestion.set(questionIdentity, groupIdentity);
        const skills = next() < 0.5 ? [SKILL_501] : [SKILL_502];
        const member = makeMember({
          identity,
          questionId: uuid(10_000 + questionIdentity),
          groupId: uuid(30_000 + groupIdentity),
          versionId: uuid(40_000 + identity),
          skillIds: skills,
          difficulty: next() < 0.5 ? "EASY" : "MEDIUM",
          sourceIds: [uuid(80_000 + Math.floor(next() * 3))],
        });
        units.push(makeUnit(identity, [member]));
      }
      const conflicts: AssemblyManifest["conflicts"] = [];
      for (let left = 0; left < units.length; left += 1) for (let right = left + 1; right < units.length; right += 1) {
        if (next() < 0.08) conflicts.push({ leftUnitId: units[left]!.id, rightUnitId: units[right]!.id });
      }
      const maxPerSource = next() < 0.5 ? 1 : 2;
      const manifest = makeManifest({
        blueprint: makeBlueprint({ count: 3, maxPerSource, quotas: [quota("SKILL", SKILL_501, 1, 3), quota("DIFFICULTY", "EASY", 1, 3)] }),
        units,
        conflicts,
        seed: caseIndex,
      });
      const oracle = oracleSets(manifest);
      const result = runAssemblyReference(manifest);
      assert.equal(result.status === "SUCCESS", oracle.length > 0, `oracle feasibility mismatch in generated case ${caseIndex}`);
      if (result.status === "SUCCESS") assert.ok(oracle.some((set) => JSON.stringify(set) === JSON.stringify(resultUnitIds(result))));
    }
  });

  it("measures successful 2,000-unit search and bounded adverse exhaustion", () => {
    const many = Array.from({ length: 2_000 }, (_, index) => makeUnit(100_000 + index));
    const successManifest = makeManifest({ blueprint: makeBlueprint({ count: 200 }), units: many, maxUnits: 2_000 });
    const successStart = performance.now();
    const success = runAssemblyReference(successManifest);
    const successMs = performance.now() - successStart;
    assert.equal(success.status, "SUCCESS");
    if (success.status === "SUCCESS") {
      assert.equal(success.visitedNodes, 201);
      assert.equal(success.slots.length, 200);
    }

    const mutuallyExclusive = Array.from({ length: 40 }, (_, index) => makeUnit(
      200_000 + index,
      [makeMember({ identity: 300_000 + index, groupId: uuid(400_000 + Math.floor(index / 2)) })],
    ));
    const adverseManifest = makeManifest({ blueprint: makeBlueprint({ count: 21 }), units: mutuallyExclusive, maxNodes: 50_000 });
    const adverseStart = performance.now();
    const adverse = runAssemblyReference(adverseManifest);
    const adverseMs = performance.now() - adverseStart;
    assert.equal(adverse.status, "FAILURE");
    if (adverse.status === "FAILURE") {
      assert.equal(adverse.code, "SEARCH_EXHAUSTED");
      assert.equal(adverse.visitedNodes, 50_000);
      assert.deepEqual(adverse.slots, []);
    }
    console.log(`assembly/1 stress evidence: 2,000-unit success ${successMs.toFixed(1)}ms/${success.status === "SUCCESS" ? success.visitedNodes : 0} nodes; adverse exhaustion ${adverseMs.toFixed(1)}ms/${adverse.visitedNodes} nodes (test-runner observation only)`);
  });
});
