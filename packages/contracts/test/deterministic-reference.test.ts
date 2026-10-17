import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ASSEMBLY_RANDOM_VERSION,
  createXorshift32V1,
  shuffleAssemblyUnitsV1,
} from "../src/index.ts";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
];
const units = ids.map((id) => ({ id, kind: "SINGLETON" }));

describe("documented assembly randomness reference", () => {
  it("matches all published xorshift32-v1 golden vectors", () => {
    assert.equal(ASSEMBLY_RANDOM_VERSION, "xorshift32-v1");
    for (const [seed, expected] of [
      [0, [723471715, 2497366906, 2064144800, 2008045182, 3532304609]],
      [1, [270369, 67634689, 2647435461, 307599695, 2398689233]],
      [4294967295, [253983, 4228382207, 1958451267, 4056713434, 2049502865]],
    ] as const) {
      const next = createXorshift32V1(seed);
      assert.deepEqual(Array.from({ length: 5 }, next), expected);
      assert.deepEqual(Array.from({ length: 5 }, createXorshift32V1(seed)), expected);
    }
  });

  it("rejects non-uint32 seeds without coercion", () => {
    for (const seed of [-1, 0.5, 4294967296, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => createXorshift32V1(seed), RangeError);
    }
  });

  it("shuffles a supplied canonical order with exact integer indexing", () => {
    assert.deepEqual(shuffleAssemblyUnitsV1(units, 0).map((unit) => unit.id), [ids[3], ids[4], ids[1], ids[2], ids[0]]);
    assert.deepEqual(shuffleAssemblyUnitsV1(units, 1).map((unit) => unit.id), [ids[2], ids[3], ids[1], ids[4], ids[0]]);
    assert.deepEqual(shuffleAssemblyUnitsV1(units, 4294967295).map((unit) => unit.id), [ids[4], ids[2], ids[1], ids[3], ids[0]]);
    assert.deepEqual(shuffleAssemblyUnitsV1(units, 1), shuffleAssemblyUnitsV1(units, 1));
    assert.deepEqual(units.map((unit) => unit.id), ids);
    assert.deepEqual(shuffleAssemblyUnitsV1([], 1), []);
    assert.deepEqual(shuffleAssemblyUnitsV1([units[0]!], 1), [units[0]]);
  });
});
