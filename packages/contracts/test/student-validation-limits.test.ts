import assert from "node:assert/strict";
import { it } from "node:test";
import { StudentQuestionSchema } from "../src/student.ts";

it("rejects oversized invalid student option collections without accumulating member errors", () => {
  // A controlled regression for GHSA-mrhx-c7xc-m3w5, using the real public schema.
  // The old dependency collected 20,002 issues for the larger input. Never induce OOM.
  for (const count of [100, 10_000]) {
    const result = StudentQuestionSchema.safeParse({
      content: [{ type: "text", text: "Synthetic validation-bound fixture." }],
      interaction: {
        type: "SINGLE_CHOICE",
        options: Array.from({ length: count }, () => ({ id: "", content: [] })),
      },
    });
    assert.equal(result.success, false);
    if (result.success) assert.fail("Oversized collection must be rejected");
    assert.equal(result.error.issues.length, 1, "Reject the collection before parsing every invalid member");
    assert.equal(result.error.issues[0]?.code, "too_big");
    assert.deepEqual(result.error.issues[0]?.path, ["interaction", "options"]);
  }
});
