import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { parseAssemblyManifest, runAssemblyReference } from "../src/assembly-reference.ts";
import { legacyFixedCompatibilityCases } from "./fixtures/fixed-legacy-cases.ts";

it("preserves literal personal replay hashes, slots and node counts captured from committed 7571a36", () => {
  const expected = JSON.parse(readFileSync(new URL("./fixtures/fixed-legacy-pins.json", import.meta.url), "utf8"));
  const actual = legacyFixedCompatibilityCases().map(({ name, manifest }) => ({
    name, manifestHash: parseAssemblyManifest(manifest).manifestHash, result: runAssemblyReference(manifest),
  }));
  assert.deepEqual(actual, expected);
});
