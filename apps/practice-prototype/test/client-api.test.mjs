import assert from "node:assert/strict";
import { it } from "node:test";

import { openDemoSession, startDemo } from "../public/app/api.js";

it("uses same-origin mock requests and translates server diagnostics into student-facing Vietnamese", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    if (calls.length === 1) return new Response(JSON.stringify({ attempt: null }), { status: 200 });
    return new Response(JSON.stringify({ error: { code: "CONTENT_UNAVAILABLE", message: "Internal route detail." } }), { status: 409 });
  };

  try {
    await openDemoSession();
    await assert.rejects(startDemo("READING"), (error) => {
      assert.equal(error.message, "Nội dung demo cho lĩnh vực này hiện chưa sẵn sàng.");
      assert.doesNotMatch(error.message, /Internal route detail/);
      return true;
    });
    assert.equal(calls[0].path, "/mock/session");
    assert.equal(calls[1].path, "/mock/attempts");
    assert.equal(calls[1].options.credentials, "same-origin");
    assert.equal(calls[1].options.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
