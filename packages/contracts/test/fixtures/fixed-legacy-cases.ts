// Compatibility inputs captured against committed 7571a36 before shared-helper changes.
import { makeBlueprint, makeManifest, makeUnit } from "./assembly-reference.ts";

export function legacyFixedCompatibilityCases() {
  const units = [1, 2, 3, 4].map((id) => makeUnit(id));
  const blueprint = makeBlueprint({ count: 2 });
  const variants = [
    { seed: 0, maxNodes: 0, maxUnits: 2_000 },
    { seed: 1, maxNodes: 3, maxUnits: 2_000 },
    { seed: 42, maxNodes: 50_000, maxUnits: 2_000 },
    { seed: 0xffff_ffff, maxNodes: 50_000, maxUnits: 2_000 },
    { seed: 42, maxNodes: 50_000, maxUnits: 3 },
  ];
  return (["NEW_ONLY", "REVIEW_ALLOWED"] as const).flatMap((reuseMode) => variants.map((variant, index) => ({
    name: `${reuseMode}/${index}`,
    manifest: makeManifest({ ...variant, units, blueprint, reuseMode,
      historyQuestionIds: [units[0]!.members[0]!.questionId], historyGroupIds: [units[3]!.members[0]!.groupId] }),
  })));
}
