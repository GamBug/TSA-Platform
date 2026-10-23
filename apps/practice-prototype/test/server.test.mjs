import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPrototypeHandler } from "../server.mjs";

describe("local static server public-file boundary", () => {
  it("serves only explicit public assets and never serves the private fixture", async () => {
    const handler = createPrototypeHandler();
    for (const path of ["/", "/index.html", "/styles.css", "/app/main.js", "/app/api.js"]) {
      const response = await handler({ method: "GET", url: path });
      assert.equal(response.status, 200, path);
      assert.ok(response.headers["Content-Type"]);
      assert.doesNotMatch(response.body.toString("utf8"), /answerKey|Subtract 2 from each side/);
    }
    const staffScript = await handler({ method: "GET", url: "/app/staff.js" });
    assert.equal(staffScript.status, 200);
    assert.doesNotMatch(staffScript.body.toString("utf8"), /What is x if x \+ 2 = 5\?|Subtract 2 from each side\./);
    assert.equal((await handler({ method: "GET", url: "/local-auth/session" })).status, 404);
    const index = await handler({ method: "GET", url: "/" });
    const html = index.body.toString("utf8");
    assert.match(html, /lang="vi"/);
    assert.doesNotMatch(html, /answerKey|Subtract 2 from each side/);

    for (const path of [
      "/src/private-question-fixture.mjs",
      "/private-question-fixture.mjs",
      "/../src/private-question-fixture.mjs",
      "/%2e%2e/src/private-question-fixture.mjs",
      "/apps/practice-prototype/src/private-question-fixture.mjs",
      "/app/nonexistent.js",
    ]) {
      const response = await handler({ method: "GET", url: path });
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(String(response.body), /answerKey|Subtract 2 from each side/);
    }
    assert.equal((await handler({ method: "POST", url: "/app/main.js" })).status, 404);
  });

  it("serves only the licensed bundled font allowlist with its public license", async () => {
    const handler = createPrototypeHandler();
    const css = await handler({ method: "GET", url: "/fonts.css" });
    assert.equal(css.status, 200);
    assert.doesNotMatch(css.body.toString("utf8"), /https?:\/\//);
    for (const weight of [400, 500, 600, 700]) {
      for (const subset of ["latin", "latin-ext", "vietnamese"]) {
        const response = await handler({ method: "GET", url: `/fonts/be-vietnam-pro-${weight}-${subset}.woff2` });
        assert.equal(response.status, 200);
        assert.equal(response.headers["Content-Type"], "font/woff2");
        assert.equal(response.body.toString("ascii", 0, 4), "wOF2");
      }
    }
    const license = await handler({ method: "GET", url: "/fonts/OFL.txt" });
    assert.equal(license.status, 200);
    assert.match(license.body.toString("utf8"), /SIL OPEN FONT LICENSE Version 1.1/);
    for (const url of ["/fonts/manifest.json", "/fonts/README.md", "/fonts/unregistered.woff2", "/fonts/../src/private-question-fixture.mjs"]) {
      assert.equal((await handler({ method: "GET", url })).status, 404, url);
    }
  });

  it("routes mock APIs without exposing source files or accepting non-mock server paths", async () => {
    const handler = createPrototypeHandler();
    const catalog = await handler({ method: "GET", url: "/mock/catalog" });
    assert.equal(catalog.status, 200);
    assert.deepEqual(JSON.parse(catalog.body).domains.map((domain) => domain.domain), ["MATH", "READING", "SCIENCE"]);
    const privatePath = await handler({ method: "GET", url: "/src/private-question-fixture.mjs" });
    assert.equal(privatePath.status, 404);
  });

  it("exposes only the pinned local math renderer and license, not node_modules", async () => {
    const handler = createPrototypeHandler();
    const renderer = await handler({ method: "GET", url: "/vendor/katex.mjs" });
    assert.equal(renderer.status, 200);
    assert.equal(renderer.headers["Content-Type"], "text/javascript; charset=utf-8");
    assert.match(renderer.body.toString(), /0\.19\.0/);
    const license = await handler({ method: "GET", url: "/vendor/katex-LICENSE.txt" });
    assert.equal(license.status, 200);
    assert.match(license.body.toString(), /MIT License/);
    for (const url of ["/node_modules/katex/package.json", "/vendor/package.json",
      "/vendor/../../node_modules/pg/lib/index.js", "/vendor/katex.js", "/vendor/LICENSE"]) {
      assert.equal((await handler({ method: "GET", url })).status, 404, url);
    }
  });
});
