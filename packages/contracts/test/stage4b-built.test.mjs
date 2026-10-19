import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { computeQuestionIdentity } from "../dist/identity.js";
import { createDraftReceiptsV2 } from "../dist/factory-package-v2.js";
import { runAssemblyReference } from "../dist/assembly-reference.js";
import { createHttpBoundaryHandler } from "../dist/http-boundary.js";

import * as student from "../dist/student.js";
import * as releasedReview from "../dist/released-review.js";
import { StudentOperationPaths } from "../dist/generated/student-operations.js";

describe("emitted Stage 4B contract entries", () => {
  it("loads the built student and released-review entrypoints with ordinary Node", () => {
    assert.equal(typeof student.StudentQuestionSchema.parse, "function");
    assert.equal(Object.hasOwn(student, "AnswerKeySchema"), false);
    assert.equal(Object.hasOwn(student, "FactoryPackageV2Schema"), false);
    assert.equal(typeof releasedReview.AnswerKeySchema.parse, "function");
    assert.equal(Object.keys(StudentOperationPaths).length, 8);
  });

  it("runs strict emitted validators and rejects unknown or private student fields", () => {
    const valid = {
      content: [{ type: "text", text: "Synthetic emitted question." }],
      interaction: {
        type: "SINGLE_CHOICE",
        options: [
          { id: "a", content: [{ type: "text", text: "A" }] },
          { id: "b", content: [{ type: "text", text: "B" }] },
        ],
      },
    };
    assert.deepEqual(student.StudentQuestionSchema.parse(valid), valid);
    assert.equal(student.StudentQuestionSchema.safeParse({ ...valid, answerKey: { type: "SINGLE_CHOICE", optionId: "a" } }).success, false);
    assert.deepEqual(student.CatalogQuerySchema.parse({ limit: "25" }), { limit: 25 });
    assert.equal(student.CatalogQuerySchema.safeParse({ limit: "101" }).success, false);
  });

  it("retains the strict runtime registry status map in emitted JavaScript", () => {
    assert.ok(Object.hasOwn(student.studentRouteRegistry.getAttempt.responses, 422));
    assert.ok(Object.hasOwn(releasedReview.releasedReviewRouteRegistry.releasedResult.responses, 422));
  });
});


describe("Stage 4B emitted integration and declarations", () => {
  it("consumes a separate synthetic producer through built Factory, identity, assembly and HTTP modules", async () => {
    const source = [
      'import {buildSyntheticFactoryPackageV2} from "./packages/contracts/test/fixtures/factory-package-v2.ts";',
      'import {makeManifest,makeUnit} from "./packages/contracts/test/fixtures/assembly-reference.ts";',
      'import {attemptView,releasedReview,accessGuard,fixtureIds} from "./packages/contracts/test/fixtures/stage4b/http-fixtures.ts";',
      'process.stdout.write(JSON.stringify({factory:buildSyntheticFactoryPackageV2({withAsset:true,withStimulus:true}),manifest:makeManifest({units:[makeUnit(1)],seed:0}),view:attemptView(),review:releasedReview(),guard:accessGuard(),ids:fixtureIds}));',
    ].join("\n");
    const producer = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source], { encoding: "utf8", timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
    assert.ifError(producer.error);
    assert.equal(producer.status, 0, producer.stderr);
    const data = JSON.parse(producer.stdout);
    const receipts = createDraftReceiptsV2(data.factory);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].workflowState, "DRAFT");
    const candidate = data.factory.candidates[0];
    assert.equal(computeQuestionIdentity(candidate.question, data.factory.references).contentHash, candidate.contentHash);
    const assembled = runAssemblyReference(data.manifest);
    assert.equal(assembled.status, "SUCCESS");
    assert.equal(assembled.slotsHash, "sha256:e46d93859ed65ee718e3d11be7ebd636df554dcf19a7f45475a26d1181ff007f");
    let guard = data.guard;
    let reviewLoads = 0;
    const handler = createHttpBoundaryHandler({
      authenticate: async () => ({ userId: "owner-A" }),
      readAccess: async () => guard,
      loadAttemptView: async () => data.view,
      loadReleasedReview: async () => { reviewLoads++; return data.review; },
    });
    const url = `http://emitted.test/api/v1/attempts/${data.ids.attempt}`;
    const active = await handler(new Request(url));
    assert.equal(active.status, 200);
    assert.equal((await active.text()).includes("private-"), false);
    assert.equal((await handler(new Request(`${url}/result`))).status, 409);
    assert.equal(reviewLoads, 0);
    guard = { ...guard, state: "GRADED", releaseAuthorized: true, revision: "released-2" };
    const released = await handler(new Request(`${url}/result`));
    assert.equal(released.status, 200);
    const body = await released.json();
    assert.equal(body.items[0].correctAnswer.optionId, "b");
    assert.equal(JSON.stringify(body).includes("private-"), false);
  });

  it("compiles strict student and released consumers against emitted declarations with negative private imports", () => {
    const result = spawnSync(process.execPath, [
      resolve("node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--exactOptionalPropertyTypes",
      "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--skipLibCheck", "--types", "node",
      resolve("packages/contracts/test/fixtures/stage4b/student-consumer/consumer.mts"),
      resolve("packages/contracts/test/fixtures/stage4b/released-consumer.mts"),
    ], { encoding: "utf8", timeout: 15_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
});
