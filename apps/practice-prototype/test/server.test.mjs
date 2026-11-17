import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPrototypeHandler, legacyStudentRedirect } from "../server.mjs";
import { privateQuestionFixture, privateTrueFalseGroupFixture } from "../src/private-question-fixture.mjs";

const privateExplanationSentinels = [privateQuestionFixture, privateTrueFalseGroupFixture]
  .map((fixture) => fixture.private.explanation.map((part) => part.text).join("\n"));

const publicBrowserAssets = [
  ["/", "text/html; charset=utf-8"],
  ["/index.html", "text/html; charset=utf-8"],
  ["/styles.css", "text/css; charset=utf-8"],
  ["/fonts.css", "text/css; charset=utf-8"],
  ["/app/main.js", "text/javascript; charset=utf-8"],
  ["/app/persistent-api.js", "text/javascript; charset=utf-8"],
  ["/app/api.js", "text/javascript; charset=utf-8"],
  ["/app/staff.js", "text/javascript; charset=utf-8"],
  ["/app/math.js", "text/javascript; charset=utf-8"],
  ["/app/topic-practice.js", "text/javascript; charset=utf-8"],
  ["/app/exam-shortcuts.js", "text/javascript; charset=utf-8"],
  ["/app/demo-notice.js", "text/javascript; charset=utf-8"],
  ["/app/question-media.js", "text/javascript; charset=utf-8"],
];

const originalStudentAssets = ["/", "/index.html", "/styles.css", "/app/main.js", "/app/api.js"];

function assertNoPrivateExplanations(response, path) {
  const body = response.body.toString("utf8");
  for (const sentinel of privateExplanationSentinels) {
    assert.equal(body.includes(sentinel), false, `${path} exposed a private explanation`);
  }
}

describe("local static server public-file boundary", () => {
  it("serves the first-party browser surface without private explanations", async () => {
    const handler = createPrototypeHandler();
    for (const [path, contentType] of publicBrowserAssets) {
      const response = await handler({ method: "GET", url: path });
      assert.equal(response.status, 200, path);
      assert.equal(response.headers["Content-Type"], contentType, path);
      assertNoPrivateExplanations(response, path);
      if (originalStudentAssets.includes(path)) {
        assert.doesNotMatch(response.body.toString("utf8"), /answerKey|Subtract 2 from each side/);
      }
    }
    const staffScript = await handler({ method: "GET", url: "/app/staff.js" });
    assert.equal(staffScript.status, 200);
    assert.doesNotMatch(staffScript.body.toString("utf8"), /What is x if x \+ 2 = 5\?|Subtract 2 from each side\./);
    assert.equal((await handler({ method: "GET", url: "/local-auth/session" })).status, 404);
    const index = await handler({ method: "GET", url: "/" });
    const html = index.body.toString("utf8");
    assert.match(html, /lang="vi"/);
    assertNoPrivateExplanations(index, "/");
    assert.doesNotMatch(html, /answerKey|Subtract 2 from each side/);

    for (const path of [
      "/src/private-question-fixture.mjs",
      "/private-question-fixture.mjs",
      "/../src/private-question-fixture.mjs",
      "/%2e%2e/src/private-question-fixture.mjs",
      "/apps/practice-prototype/src/private-question-fixture.mjs",
      "/tools/question-factory/cli.mjs",
      "/tools/question-factory/reading.mjs",
      "/data/research/reading_questions.txt",
      "/data/research/reading_questions.progress.json",
      "/app/nonexistent.js",
    ]) {
      const response = await handler({ method: "GET", url: path });
      assert.equal(response.status, 404, path);
      assertNoPrivateExplanations(response, path);
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

  it("maps retired student UI links to React student app modes only", () => {
    assert.equal(legacyStudentRedirect("/?student=postgres"), "/student/");
    assert.equal(legacyStudentRedirect("/?student=postgres-v2"), "/student/?mode=numeric");
    assert.equal(legacyStudentRedirect("/index.html?student=postgres-v4"), "/student/?mode=interactions");
    assert.equal(legacyStudentRedirect("/?student=postgres-v3"), "/student/?mode=simulation");
    for (const url of ["/", "/?student=other", "/?student=__proto__", "/app/main.js?student=postgres", "/student/?student=postgres"]) {
      assert.equal(legacyStudentRedirect(url), null, url);
    }
  });

  it("serves the React student app only from its build index and flat asset files", async () => {
    const handler = createPrototypeHandler();
    const redirect = await handler({ method: "GET", url: "/student" });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.Location, "/student/");
    const index = await handler({ method: "GET", url: "/student/" });
    // A missing build is reported plainly instead of falling back to another page.
    assert.ok([200, 503].includes(index.status));
    if (index.status === 200) {
      assert.equal(index.headers["Content-Type"], "text/html; charset=utf-8");
      const script = /src="(\/student\/assets\/[^"]+\.js)"/.exec(index.body.toString("utf8"))?.[1];
      assert.ok(script, "index references a script bundle");
      const bundle = await handler({ method: "GET", url: script });
      assert.equal(bundle.status, 200);
      assert.equal(bundle.headers["Content-Type"], "text/javascript; charset=utf-8");
    } else {
      assert.match(index.body.toString("utf8"), /npm run build:student/);
    }
    for (const url of [
      "/student/../server.mjs", "/student/assets/%2e%2e/package.json", "/student/package.json",
      "/student/src/main.tsx", "/student/assets/missing.js", "/student/assets/notes.txt", "/student/assets/.hidden.js",
    ]) {
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
