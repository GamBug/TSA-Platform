import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";

import { createHttpBoundaryHandler, type HttpBoundaryPorts } from "../src/http-boundary.ts";
import { releasedReview, attemptView, accessGuard, closedAttemptView, fixtureIds } from "./fixtures/stage4b/http-fixtures.ts";

type HarnessOptions = {
  authenticate?: HttpBoundaryPorts["authenticate"];
  readAccess?: HttpBoundaryPorts["readAccess"];
  loadAttemptView?: HttpBoundaryPorts["loadAttemptView"];
  loadReleasedReview?: HttpBoundaryPorts["loadReleasedReview"];
  guard?: unknown;
  view?: unknown;
  review?: unknown;
};

function harness(options: HarnessOptions = {}) {
  const calls = { access: 0, attempt: 0, released: 0, users: [] as string[] };
  const ports: HttpBoundaryPorts = {
    authenticate: options.authenticate ?? (async () => ({ userId: "owner-A" })),
    readAccess: async (input) => {
      calls.access += 1;
      calls.users.push(input.userId);
      return options.readAccess === undefined ? options.guard === undefined ? accessGuard() : options.guard : options.readAccess(input);
    },
    loadAttemptView: async (input) => {
      calls.attempt += 1;
      return options.loadAttemptView === undefined ? options.view ?? attemptView() : options.loadAttemptView(input);
    },
    loadReleasedReview: async (input) => {
      calls.released += 1;
      return options.loadReleasedReview === undefined ? options.review ?? releasedReview() : options.loadReleasedReview(input);
    },
  };
  return { handler: createHttpBoundaryHandler(ports), calls };
}

async function get(handler: (request: Request) => Promise<Response>, path = `/api/v1/attempts/${fixtureIds.attempt}`) {
  const response = await handler(new Request(`http://contracts.test${path}`));
  return { response, body: await response.json() as Record<string, any> };
}

function normalizedNotFound(response: Response, body: Record<string, any>) {
  const copy = structuredClone(body);
  delete copy.error.requestId;
  return {
    status: response.status,
    headers: [response.headers.get("content-type"), response.headers.get("cache-control"), response.headers.get("x-content-type-options")],
    body: copy,
  };
}

function assertBoundaryHeaders(response: Response) {
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

describe("framework-independent attempt and released-result egress", () => {
  it("projects nested attempt DTOs through explicit allowlists and checks the response headers", async () => {
    const { handler } = harness();
    const { response, body } = await get(handler);
    assert.equal(response.status, 200);
    assertBoundaryHeaders(response);
    assert.deepEqual(Object.keys(body).sort(), [
      "activeSectionId", "answers", "attemptId", "closure", "deadlineAt", "domain", "formId", "formMode", "reuseMode", "reusePolicyVersion", "sections", "serverNow", "slots", "startBefore", "startedAt", "state",
    ].sort());
    assert.deepEqual(Object.keys(body.slots[0]).sort(), ["slotId", "sectionId", "ordinal", "content", "stimulus", "interaction"].sort());
    assert.deepEqual(Object.keys(body.slots[0].interaction.options[0]).sort(), ["id", "content"].sort());
    assert.equal(JSON.stringify(body).includes("private-"), false);
    assert.equal(JSON.stringify(body).includes("answerKey"), false);
    assert.equal(JSON.stringify(body).includes("correct"), false);
  });

  it("returns the authorized review projection with nested explanations and keys only on the released route", async () => {
    const { handler } = harness({ guard: accessGuard({ state: "GRADED", releaseAuthorized: true }) });
    const { response, body } = await get(handler, `/api/v1/attempts/${fixtureIds.attempt}/result`);
    assert.equal(response.status, 200);
    assertBoundaryHeaders(response);
    assert.equal(body.items[0].correctAnswer.optionId, "b");
    assert.equal(body.items[0].explanation[0].text, "Three is the correct value.");
    assert.equal(JSON.stringify(body).includes("review-only-field"), false);
    assert.equal(JSON.stringify(body).includes("private-"), false);
    assert.equal(JSON.stringify(body).includes("authorNotes"), false);
    assert.deepEqual(Object.keys(body).sort(), ["attemptId", "scoreRunId", "domain", "formMode", "reuseMode", "policyVersion", "scoreLabel", "correctCount", "totalCount", "percentage", "sections", "releasedAt", "items"].sort());
    assert.deepEqual(Object.keys(body.items[0]).sort(), ["slotId", "earned", "response", "question", "correctAnswer", "explanation"].sort());
  });

  it("uses the registry's 422 contract for malformed path/query and 404 for unrelated routes or methods", async () => {
    const { handler } = harness();
    for (const path of ["/api/v1/attempts/not-a-uuid", `/api/v1/attempts/${fixtureIds.attempt}?unexpected=1`]) {
      const { response, body } = await get(handler, path);
      assert.equal(response.status, 422);
      assert.equal(body.error.code, "VALIDATION_ERROR");
      assertBoundaryHeaders(response);
    }
    const unknown = await get(handler, "/api/v1/unrelated");
    assert.equal(unknown.response.status, 404);
    assert.equal(unknown.body.error.code, "NOT_FOUND");
    const method = await handler(new Request(`http://contracts.test/api/v1/attempts/${fixtureIds.attempt}`, { method: "POST" }));
    assert.equal(method.status, 404);
    assertBoundaryHeaders(method);
  });

  it("keeps unauthenticated, missing, and foreign attempts ahead of private loaders", async () => {
    const unauthenticated = harness({ authenticate: async () => null });
    const unauth = await get(unauthenticated.handler);
    assert.equal(unauth.response.status, 401);
    assert.equal(unauth.body.error.code, "UNAUTHENTICATED");
    assert.equal(unauthenticated.calls.access, 0);

    const missing = harness({ guard: null });
    const missingResult = await get(missing.handler);
    const foreign = harness({ guard: accessGuard({ ownerId: "someone-else" }) });
    const foreignResult = await get(foreign.handler);
    assert.equal(missingResult.response.status, 404);
    assert.equal(foreignResult.response.status, 404);
    assert.deepEqual(normalizedNotFound(missingResult.response, missingResult.body), normalizedNotFound(foreignResult.response, foreignResult.body));
    assert.equal(missing.calls.attempt + missing.calls.released, 0);
    assert.equal(foreign.calls.attempt + foreign.calls.released, 0);

    const malformedForeign = harness({ guard: accessGuard({ ownerId: "someone-else", state: "INVALID_STATE", revision: "" }) });
    const malformedForeignResult = await get(malformedForeign.handler);
    assert.deepEqual(normalizedNotFound(missingResult.response, missingResult.body), normalizedNotFound(malformedForeignResult.response, malformedForeignResult.body));
    assert.equal(malformedForeign.calls.attempt + malformedForeign.calls.released, 0);

    const missingResultRoute = harness({ guard: null });
    const missingReview = await get(missingResultRoute.handler, `/api/v1/attempts/${fixtureIds.attempt}/result`);
    const foreignResultRoute = harness({ guard: accessGuard({ ownerId: "someone-else" }) });
    const foreignReview = await get(foreignResultRoute.handler, `/api/v1/attempts/${fixtureIds.attempt}/result`);
    assert.deepEqual(normalizedNotFound(missingReview.response, missingReview.body), normalizedNotFound(foreignReview.response, foreignReview.body));
    assert.equal(missingResultRoute.calls.released + foreignResultRoute.calls.released, 0);
  });

  it("returns withdrawn and held-result statuses before loading private content", async () => {
    for (const guard of [accessGuard({ withdrawn: true }), accessGuard({ state: "INVALIDATED" })]) {
      const withdrawn = harness({ guard });
      const result = await get(withdrawn.handler);
      assert.equal(result.response.status, 410);
      assert.equal(result.body.error.code, "CONTENT_WITHDRAWN");
      assert.equal(withdrawn.calls.attempt + withdrawn.calls.released, 0);
    }
    const held = harness({ guard: accessGuard({ state: "IN_PROGRESS", releaseAuthorized: true }) });
    const result = await get(held.handler, `/api/v1/attempts/${fixtureIds.attempt}/result`);
    assert.equal(result.response.status, 409);
    assert.equal(result.body.error.code, "RESULT_NOT_READY");
    assert.equal(held.calls.released, 0);

    const gradedButHeld = harness({ guard: accessGuard({ state: "GRADED", releaseAuthorized: false }) });
    const gradedResult = await get(gradedButHeld.handler, `/api/v1/attempts/${fixtureIds.attempt}/result`);
    assert.equal(gradedResult.response.status, 409);
    assert.equal(gradedButHeld.calls.released, 0);
  });

  it("fails closed on malformed projections, mismatched identity/state, and active answers outside delivered choices", async () => {
    const cases = [
      { ...attemptView(), attemptId: fixtureIds.form },
      { ...attemptView(), answers: [{ ...attemptView().answers[0], value: { type: "SINGLE_CHOICE", optionId: "undelivered" } }] },
      { ...attemptView({
        interaction: { type: "MULTIPLE_CHOICE", minSelections: 1, maxSelections: 2, options: [{ id: "a", content: [{ type: "text", text: "a" }] }, { id: "b", content: [{ type: "text", text: "b" }] }] },
        response: { type: "MULTIPLE_CHOICE", optionIds: ["a", "unknown"] },
      }) },
      { ...attemptView({
        interaction: { type: "TRUE_FALSE_GROUP", statements: [{ id: "s1", content: [{ type: "text", text: "One" }] }, { id: "s2", content: [{ type: "text", text: "Two" }] }] },
        response: { type: "TRUE_FALSE_GROUP", values: { s1: true, hiddenPrivateSlot: false } },
      }) },
    ];
    for (const view of cases) {
      const { handler } = harness({ view });
      const { response, body } = await get(handler);
      assert.equal(response.status, 503);
      assert.equal(body.error.code, "TEMPORARILY_UNAVAILABLE");
      assertBoundaryHeaders(response);
    }

    const closed = harness({ guard: accessGuard({ state: "SUBMITTED" }), view: closedAttemptView() });
    const closedResult = await get(closed.handler);
    assert.equal(closedResult.response.status, 200);
    assert.deepEqual(closedResult.body.slots, []);
    assert.deepEqual(closedResult.body.answers, []);

    const staleActiveDto = harness({ guard: accessGuard({ state: "SUBMITTED" }) });
    assert.equal((await get(staleActiveDto.handler)).response.status, 503);
  });

  it("does not expose caught exception text and detects mutable guard and loader-access races", async () => {
    const thrown = harness({ loadAttemptView: async () => { throw new Error("sensitive-db-password"); } });
    const failed = await get(thrown.handler);
    assert.equal(failed.response.status, 503);
    assert.equal(JSON.stringify(failed.body).includes("sensitive-db-password"), false);

    const sharedGuard = accessGuard();
    const mutatingLoader = harness({
      guard: sharedGuard,
      loadAttemptView: async ({ access }) => {
        sharedGuard.revision = "rev-2";
        access.revision = "rev-2";
        return attemptView();
      },
    });
    const raced = await get(mutatingLoader.handler);
    assert.equal(raced.response.status, 503);
    assert.equal(JSON.stringify(raced.body).includes("rev-"), false);

    for (const change of [
      { state: "SUBMITTED" },
      { releaseAuthorized: true },
      { withdrawn: true },
    ]) {
      const shared = accessGuard();
      const boundary = harness({
        guard: shared,
        loadAttemptView: async () => {
          Object.assign(shared, change);
          return attemptView();
        },
      });
      assert.equal((await get(boundary.handler)).response.status, 503);
    }

    const resultGuard = accessGuard({ state: "GRADED", releaseAuthorized: true });
    const resultRace = harness({
      guard: resultGuard,
      loadReleasedReview: async ({ access }) => {
        resultGuard.releaseAuthorized = false;
        access.releaseAuthorized = false;
        return releasedReview();
      },
    });
    const resultRaceResponse = await get(resultRace.handler, `/api/v1/attempts/${fixtureIds.attempt}/result`);
    assert.equal(resultRaceResponse.response.status, 503);
    assert.equal(JSON.stringify(resultRaceResponse.body).includes("correctAnswer"), false);
    assert.equal(JSON.stringify(resultRaceResponse.body).includes("Three is the correct value"), false);
  });

  it("captures the authenticated principal ID before asynchronous loaders run", async () => {
    const principal = { userId: "owner-A" };
    const boundary = harness({
      authenticate: async () => principal,
      loadAttemptView: async () => {
        principal.userId = "attacker";
        return attemptView();
      },
    });
    assert.equal((await get(boundary.handler)).response.status, 200);
    assert.deepEqual(boundary.calls.users, ["owner-A", "owner-A"]);
  });

  it("serves the same projection through a real loopback HTTP exchange", { timeout: 10_000 }, async () => {
    let currentHandler = harness().handler;
    const server = createServer(async (incoming, outgoing) => {
      const host = incoming.headers.host ?? "127.0.0.1";
      const request = new Request(`http://${host}${incoming.url ?? "/"}`, { method: incoming.method ?? "GET" });
      const response = await currentHandler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/attempts/${fixtureIds.attempt}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = await response.json() as Record<string, any>;
      assert.equal(body.attemptId, fixtureIds.attempt);
      assert.equal(JSON.stringify(body).includes("private-"), false);

      currentHandler = harness({ guard: null }).handler;
      const missing = await fetch(`http://127.0.0.1:${address.port}/api/v1/attempts/${fixtureIds.attempt}`);
      assert.equal(missing.status, 404);
      assertBoundaryHeaders(missing);
      const missingBody = await missing.json() as Record<string, any>;
      currentHandler = harness({ guard: accessGuard({ ownerId: "foreign" }) }).handler;
      const foreign = await fetch(`http://127.0.0.1:${address.port}/api/v1/attempts/${fixtureIds.attempt}/result`);
      assert.equal(foreign.status, 404);
      assertBoundaryHeaders(foreign);
      const foreignBody = await foreign.json() as Record<string, any>;
      assert.deepEqual(normalizedNotFound(missing, missingBody), normalizedNotFound(foreign, foreignBody));
      currentHandler = harness({ guard: accessGuard({ state: "GRADED", releaseAuthorized: false }) }).handler;
      const held = await fetch(`http://127.0.0.1:${address.port}/api/v1/attempts/${fixtureIds.attempt}/result`);
      assert.equal(held.status, 409);
      assertBoundaryHeaders(held);
      assert.equal((await held.text()).includes("correctAnswer"), false);
      currentHandler = harness({ guard: accessGuard({ withdrawn: true }) }).handler;
      const withdrawn = await fetch(`http://127.0.0.1:${address.port}/api/v1/attempts/${fixtureIds.attempt}`);
      assert.equal(withdrawn.status, 410);
      assertBoundaryHeaders(withdrawn);
      assert.equal((await withdrawn.text()).includes("private-"), false);
      currentHandler = harness({
        guard: accessGuard({ state: "GRADED", releaseAuthorized: true }),
        review: releasedReview(),
      }).handler;
      const review = await fetch(`http://127.0.0.1:${address.port}/api/v1/attempts/${fixtureIds.attempt}/result`);
      assert.equal(review.status, 200);
      const reviewBody = await review.json() as Record<string, any>;
      assert.equal(reviewBody.items[0].correctAnswer.optionId, "b");
      assert.equal(JSON.stringify(reviewBody).includes("private-"), false);
    } finally {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  });
});
