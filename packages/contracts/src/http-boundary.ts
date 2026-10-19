import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  AttemptStateSchema,
  AttemptViewSchema,
  AuthenticationErrorResponseSchema,
  AuthorizedReleasedReviewSchema,
  ValidationErrorResponseSchema,
} from "./index.ts";
import {
  AttemptPathParamsSchema,
  ContentWithdrawnResponseSchema,
  NotFoundResponseSchema,
  ResultNotReadyResponseSchema,
  TemporarilyUnavailableResponseSchema,
} from "./routes.ts";

const AccessGuardSchema = z.object({
  attemptId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  ownerId: z.string().min(1),
  state: AttemptStateSchema,
  withdrawn: z.boolean(),
  releaseAuthorized: z.boolean(),
  revision: z.string().min(1),
}).strict();

export type AttemptAccessGuard = z.infer<typeof AccessGuardSchema>;
export type BoundaryPrincipal = { readonly userId: string };
export type HttpBoundaryPorts = {
  authenticate(request: Request): Promise<BoundaryPrincipal | null>;
  readAccess(input: { attemptId: string; userId: string }): Promise<unknown | null>;
  loadAttemptView(input: { attemptId: string; userId: string; access: AttemptAccessGuard }): Promise<unknown>;
  loadReleasedReview(input: { attemptId: string; userId: string; access: AttemptAccessGuard }): Promise<unknown>;
};

const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });
}

function errorEnvelope(code: string, message: string) {
  return { error: { code, message, requestId: randomUUID(), details: {} } };
}

function notFound(): Response {
  return jsonResponse(404, NotFoundResponseSchema.parse(errorEnvelope("NOT_FOUND", "Resource not found")));
}

function unauthenticated(): Response {
  return jsonResponse(401, AuthenticationErrorResponseSchema.parse(errorEnvelope("UNAUTHENTICATED", "Authentication required")));
}

function withdrawn(): Response {
  return jsonResponse(410, ContentWithdrawnResponseSchema.parse(errorEnvelope("CONTENT_WITHDRAWN", "Content is unavailable")));
}

function resultNotReady(): Response {
  return jsonResponse(409, ResultNotReadyResponseSchema.parse(errorEnvelope("RESULT_NOT_READY", "Result is not available")));
}

function invalidRequest(): Response {
  return jsonResponse(422, ValidationErrorResponseSchema.parse(errorEnvelope("VALIDATION_ERROR", "Request is invalid")));
}

function unavailable(): Response {
  return jsonResponse(503, TemporarilyUnavailableResponseSchema.parse(errorEnvelope("TEMPORARILY_UNAVAILABLE", "Request could not be completed")));
}

function parseGuard(value: unknown): AttemptAccessGuard {
  const source = objectRecord(value);
  return AccessGuardSchema.parse({
    attemptId: readOwn(source, "attemptId"),
    ownerId: readOwn(source, "ownerId"),
    state: readOwn(source, "state"),
    withdrawn: readOwn(source, "withdrawn"),
    releaseAuthorized: readOwn(source, "releaseAuthorized"),
    revision: readOwn(source, "revision"),
  });
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected an object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Expected a plain object");
  return value as Record<string, unknown>;
}

function readOwn(source: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor)) throw new TypeError("Accessor properties are not accepted");
  return descriptor.value;
}

function pick(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const source = objectRecord(value);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const field = readOwn(source, key);
    if (field !== undefined) result[key] = field;
  }
  return result;
}

function projectBlocks(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Expected content blocks");
  return value.map(projectBlock);
}

function projectBlock(value: unknown): unknown {
  const source = objectRecord(value);
  const type = readOwn(source, "type");
  if (type === "text") return pick(value, ["type", "text"]);
  if (type === "math") return pick(value, ["type", "tex", "display", "accessibleText"]);
  if (type === "table") return pick(value, ["type", "caption", "headers", "rows"]);
  if (type === "image") return pick(value, ["type", "assetVersionId", "alt", "caption"]);
  throw new TypeError("Unknown content block");
}

function projectInteraction(value: unknown): unknown {
  const source = objectRecord(value);
  const type = readOwn(source, "type");
  if (type === "SINGLE_CHOICE") return { ...pick(value, ["type"]), options: projectOptions(readOwn(source, "options")) };
  if (type === "MULTIPLE_CHOICE") {
    return {
      ...pick(value, ["type", "minSelections", "maxSelections"]),
      options: projectOptions(readOwn(source, "options")),
    };
  }
  if (type === "TRUE_FALSE_GROUP") {
    const statements = readOwn(source, "statements");
    if (!Array.isArray(statements)) throw new TypeError("Expected statements");
    return {
      type,
      statements: statements.map((statement) => ({ ...pick(statement, ["id"]), content: projectBlocks(readOwn(objectRecord(statement), "content")) })),
    };
  }
  throw new TypeError("Unknown interaction type");
}

function projectOptions(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Expected options");
  return value.map((option) => ({ ...pick(option, ["id"]), content: projectBlocks(readOwn(objectRecord(option), "content")) }));
}

function projectResponse(value: unknown): unknown {
  const source = objectRecord(value);
  const type = readOwn(source, "type");
  if (type === "SINGLE_CHOICE") return pick(value, ["type", "optionId"]);
  if (type === "MULTIPLE_CHOICE") return pick(value, ["type", "optionIds"]);
  if (type === "TRUE_FALSE_GROUP") {
    const values = objectRecord(readOwn(source, "values"));
    const safeValues = Object.fromEntries(Object.keys(values).map((key) => [key, readOwn(values, key)]));
    return { type, values: safeValues };
  }
  throw new TypeError("Unknown response type");
}

function projectStudentSlot(value: unknown): unknown {
  const source = objectRecord(value);
  const stimulus = readOwn(source, "stimulus");
  return {
    ...pick(value, ["slotId", "sectionId", "ordinal"]),
    content: projectBlocks(readOwn(source, "content")),
    stimulus: stimulus === null ? null : {
      ...pick(stimulus, ["id"]),
      content: projectBlocks(readOwn(objectRecord(stimulus), "content")),
    },
    interaction: projectInteraction(readOwn(source, "interaction")),
  };
}

function projectAttemptView(value: unknown): unknown {
  const source = objectRecord(value);
  const sections = readOwn(source, "sections");
  const slots = readOwn(source, "slots");
  const answers = readOwn(source, "answers");
  if (!Array.isArray(sections) || !Array.isArray(slots) || !Array.isArray(answers)) throw new TypeError("Invalid attempt view arrays");
  return {
    ...pick(value, ["attemptId", "state", "formId", "domain", "formMode", "reuseMode", "reusePolicyVersion", "serverNow", "startBefore", "startedAt", "deadlineAt", "activeSectionId"]),
    sections: sections.map((section) => pick(section, ["sectionId", "section", "startsAt", "endsAt", "count"])),
    slots: slots.map(projectStudentSlot),
    answers: answers.map((answer) => ({
      ...pick(answer, ["slotId", "revision", "savedAt"]),
      value: projectResponse(readOwn(objectRecord(answer), "value")),
    })),
    closure: pick(readOwn(source, "closure"), ["attemptId", "state", "terminalReason", "cancellationReason", "closedAt", "gradingStatus"]),
  };
}

function validateDeliveredAnswerReferences(view: z.infer<typeof AttemptViewSchema>): void {
  const slots = new Map(view.slots.map((slot) => [slot.slotId, slot]));
  for (const answer of view.answers) {
    const slot = slots.get(answer.slotId);
    if (slot === undefined) throw new TypeError("Answer does not identify a delivered slot");
    const interaction = slot.interaction;
    if (interaction.type === "SINGLE_CHOICE") {
      if (answer.value.type !== "SINGLE_CHOICE") throw new TypeError("Answer type does not match interaction");
      const optionId = answer.value.optionId;
      if (optionId !== null && !interaction.options.some((option) => option.id === optionId)) {
        throw new TypeError("Answer refers to an undelivered option");
      }
    } else if (interaction.type === "MULTIPLE_CHOICE") {
      if (answer.value.type !== "MULTIPLE_CHOICE") throw new TypeError("Answer type does not match interaction");
      const optionIds = new Set(interaction.options.map((option) => option.id));
      const selectedIds = answer.value.optionIds;
      if (new Set(selectedIds).size !== selectedIds.length || selectedIds.some((id) => !optionIds.has(id))) {
        throw new TypeError("Answer refers to an undelivered option");
      }
    } else {
      if (answer.value.type !== "TRUE_FALSE_GROUP") throw new TypeError("Answer type does not match interaction");
      const statementIds = new Set(interaction.statements.map((statement) => statement.id));
      const values = answer.value.values;
      if (Object.keys(values).some((id) => !statementIds.has(id))) {
        throw new TypeError("Answer refers to an undelivered statement");
      }
    }
  }
}

function projectAnswerKey(value: unknown): unknown {
  const source = objectRecord(value);
  const type = readOwn(source, "type");
  if (type === "SINGLE_CHOICE") return pick(value, ["type", "optionId"]);
  if (type === "MULTIPLE_CHOICE") return pick(value, ["type", "optionIds"]);
  if (type === "TRUE_FALSE_GROUP") {
    const values = objectRecord(readOwn(source, "values"));
    return { type, values: Object.fromEntries(Object.keys(values).map((key) => [key, readOwn(values, key)])) };
  }
  throw new TypeError("Unknown answer-key type");
}

function projectReleasedReview(value: unknown): unknown {
  const source = objectRecord(value);
  const sections = readOwn(source, "sections");
  const items = readOwn(source, "items");
  if (!Array.isArray(sections) || !Array.isArray(items)) throw new TypeError("Invalid released result arrays");
  return {
    ...pick(value, ["attemptId", "scoreRunId", "domain", "formMode", "reuseMode", "policyVersion", "scoreLabel", "correctCount", "totalCount", "percentage", "releasedAt"]),
    sections: sections.map((section) => pick(section, ["sectionId", "section", "correctCount", "totalCount"])),
    items: items.map((item) => {
      const itemSource = objectRecord(item);
      const response = readOwn(itemSource, "response");
      return {
        ...pick(item, ["slotId", "earned"]),
        response: response === null ? null : projectResponse(response),
        question: projectStudentSlot(readOwn(itemSource, "question")),
        correctAnswer: projectAnswerKey(readOwn(itemSource, "correctAnswer")),
        explanation: projectBlocks(readOwn(itemSource, "explanation")),
      };
    }),
  };
}

function sameGuard(left: AttemptAccessGuard, right: AttemptAccessGuard): boolean {
  return left.attemptId === right.attemptId && left.ownerId === right.ownerId && left.state === right.state &&
    left.withdrawn === right.withdrawn && left.releaseAuthorized === right.releaseAuthorized && left.revision === right.revision;
}

async function readGuard(ports: HttpBoundaryPorts, attemptId: string, userId: string): Promise<AttemptAccessGuard | null> {
  const raw = await ports.readAccess({ attemptId, userId });
  if (raw === null) return null;
  let source: Record<string, unknown>;
  try {
    source = objectRecord(raw);
  } catch {
    return null;
  }
  const attemptIdDescriptor = Object.getOwnPropertyDescriptor(source, "attemptId");
  const ownerIdDescriptor = Object.getOwnPropertyDescriptor(source, "ownerId");
  if (
    attemptIdDescriptor === undefined || !("value" in attemptIdDescriptor) || attemptIdDescriptor.value !== attemptId ||
    ownerIdDescriptor === undefined || !("value" in ownerIdDescriptor) || ownerIdDescriptor.value !== userId
  ) return null;
  return parseGuard(source);
}

/** Framework-independent GET boundary for the existing attempt-view and released-result routes. */
export function createHttpBoundaryHandler(ports: HttpBoundaryPorts): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      if (request.method !== "GET") return notFound();
      const pathname = new URL(request.url).pathname;
      const match = /^\/api\/v1\/attempts\/([^/]+)(\/result)?$/.exec(pathname);
      if (match === null) return notFound();
      const parsedParams = AttemptPathParamsSchema.safeParse({ id: match[1] });
      if (!parsedParams.success || new URL(request.url).search !== "") return invalidRequest();
      const attemptId = parsedParams.data.id;

      const principal = await ports.authenticate(request);
      if (principal === null || typeof principal.userId !== "string" || principal.userId.length === 0) return unauthenticated();
      const userId = principal.userId;
      const before = await readGuard(ports, attemptId, userId);
      if (before === null || before.attemptId !== attemptId || before.ownerId !== userId) return notFound();
      if (before.withdrawn || before.state === "INVALIDATED") return withdrawn();
      const releasedResultRequest = match[2] === "/result";
      if (releasedResultRequest && (before.state !== "GRADED" || !before.releaseAuthorized)) return resultNotReady();
      Object.freeze(before);
      const loaderAccess = { ...before };

      const loaded = releasedResultRequest
        ? await ports.loadReleasedReview({ attemptId, userId, access: loaderAccess })
        : await ports.loadAttemptView({ attemptId, userId, access: loaderAccess });
      let projected: unknown;
      if (releasedResultRequest) {
        const review = AuthorizedReleasedReviewSchema.parse(projectReleasedReview(loaded));
        if (review.attemptId !== attemptId) throw new TypeError("DTO attempt ID does not match the request");
        projected = review;
      } else {
        const view = AttemptViewSchema.parse(projectAttemptView(loaded));
        if (view.attemptId !== attemptId) throw new TypeError("DTO attempt ID does not match the request");
        if (view.state !== before.state) throw new TypeError("DTO state does not match server access state");
        validateDeliveredAnswerReferences(view);
        projected = view;
      }

      // A fresh primitive snapshot after projection closes mutable-object and in-place update races.
      const finalGuard = await readGuard(ports, attemptId, userId);
      if (finalGuard === null || finalGuard.ownerId !== userId || !sameGuard(before, finalGuard)) return unavailable();
      return jsonResponse(200, projected);
    } catch {
      return unavailable();
    }
  };
}
