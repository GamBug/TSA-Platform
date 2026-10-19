import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { runConsumerBoundaryCheck, scanConsumerTree } from "../scripts/check-consumer-boundaries.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe("student consumer import boundary", () => {
  it("allows the designated emitted student entrypoint consumer", () => {
    assert.deepEqual(runConsumerBoundaryCheck(), []);
  });

  it("detects static root, dynamic internal, and type-only private imports", () => {
    const negativeRoot = resolve(testDirectory, "fixtures/stage4b/consumer-boundary-negative");
    const violations = scanConsumerTree(negativeRoot);
    assert.equal(violations.length, 4);
    assert.ok(violations.some((violation) => violation.includes("dist/index.js")));
    assert.ok(violations.some((violation) => violation.includes("dist/internal.js")));
    assert.ok(violations.some((violation) => violation.includes("src/index.ts")));
  });

  it("rejects template, computed, require-equals, absolute, URL and escaping local imports", () => {
    const root = mkdtempSync(resolve(tmpdir(), "tsa-student-fence-"));
    const privateEntry = resolve(testDirectory, "../dist/internal.js");
    const sources = [
      "import(`@tsa/contracts/internal`);",
      "const name = '@tsa/contracts/student'; import(name);",
      "import internal = require('@tsa/contracts/internal');",
      `import ${JSON.stringify(privateEntry)};`,
      `import ${JSON.stringify(new URL(`file://${privateEntry}`).href)};`,
      "export * from '../outside-wrapper.js';",
      "const name = '@tsa/contracts/internal'; require(name);",
      "import('data:text/javascript,export default 1');",
    ];
    try {
      sources.forEach((source, index) => writeFileSync(resolve(root, `${index}.mts`), source));
      assert.equal(scanConsumerTree(root).length, sources.length);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
