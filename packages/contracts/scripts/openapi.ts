import { createHash } from "node:crypto";
import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi, type RouteConfig } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import type { RouteDefinitionValue } from "../src/routes.ts";

extendZodWithOpenApi(z);

// Import schemas only after extending the shared Zod instance.
const [contracts, routes] = await Promise.all([
  import("../src/index.ts"),
  import("../src/routes.ts"),
]);

type RouteTable = Readonly<Record<string, RouteDefinitionValue>>;

function schemasFor(table: RouteTable): Set<z.ZodType> {
  const found = new Set<z.ZodType>();
  for (const route of Object.values(table)) {
    for (const schema of [route.params, route.query, route.headers, route.body]) if (schema !== undefined) found.add(schema);
    for (const response of Object.values(route.responses)) if ("schema" in response) found.add(response.schema);
  }
  return found;
}

function buildDocument(
  table: RouteTable,
  info: { title: string; version: string; description: string },
  additionalComponents: Readonly<Record<string, z.ZodType>> = {},
): Record<string, unknown> {
  const registry = new OpenAPIRegistry();
  for (const [name, schema] of Object.entries(additionalComponents)) registry.register(name, schema);
  const names = new Map<z.ZodType, string>(
    Object.entries(routes.routeComponentSchemas).map(([name, schema]) => [schema, name]),
  );
  const refs = new Map<z.ZodType, z.ZodType>();
  for (const schema of schemasFor(table)) {
    const name = names.get(schema);
    refs.set(schema, name === undefined ? schema : registry.register(name, schema));
  }

  for (const [operationId, route] of Object.entries(table)) {
    const request: NonNullable<RouteConfig["request"]> = {};
    if (route.params !== undefined) request.params = refs.get(route.params) as RouteConfig["request"] extends { params?: infer P } ? P : never;
    if (route.query !== undefined) request.query = refs.get(route.query) as RouteConfig["request"] extends { query?: infer Q } ? Q : never;
    if (route.headers !== undefined) request.headers = refs.get(route.headers) as RouteConfig["request"] extends { headers?: infer H } ? H : never;
    if (route.body !== undefined) {
      request.body = { required: true, content: { "application/json": { schema: refs.get(route.body)! } } };
    }

    const responses: RouteConfig["responses"] = {};
    for (const [status, response] of Object.entries(route.responses)) {
      if ("schema" in response) {
        responses[status] = {
          description: response.description,
          content: { [response.contentType]: { schema: refs.get(response.schema)! } },
          ...(response.headers === undefined ? {} : { headers: response.headers }),
        };
      } else {
        responses[status] = {
          description: response.description,
          content: { [response.contentType]: { schema: { type: "string", format: "binary" } } },
        };
      }
    }

    registry.registerPath({
      operationId,
      method: route.method.toLowerCase() as RouteConfig["method"],
      path: route.path,
      summary: route.summary,
      request,
      responses,
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({ openapi: "3.1.0", info }) as unknown as Record<string, unknown>;
}

export function generateStudentContractsOpenApi(): Record<string, unknown> {
  return buildDocument(routes.studentRouteRegistry, {
    title: "TSA Platform student-safe API contracts",
    version: "routes/1",
    description: "Eight student operations. Cookie-backed authenticated sessions are required; mutations require a CSRF token and validated Origin. These are contract requirements only, not an implemented authentication service. The released result is published in a separate authorized-review contract.",
  }, {
    StudentQuestion: contracts.StudentQuestionSchema,
    StudentSlot: contracts.StudentSlotSchema,
    CreationReceipt: contracts.CreationReceiptSchema,
    AttemptView: contracts.AttemptViewSchema,
    AnswerSubmissionRequest: contracts.AnswerSubmissionRequestSchema,
    AnswerAck: contracts.AnswerAckSchema,
    ResultView: contracts.ResultViewSchema,
    AttemptHistoryItem: contracts.AttemptHistoryItemSchema,
    AttemptHistoryPage: contracts.AttemptHistoryPageSchema,
    ResponseValue: contracts.ResponseValueSchema,
    ErrorResponse: contracts.ErrorResponseSchema,
    StudentShortage: contracts.StudentShortageSchema,
    ValidationErrorResponse: contracts.ValidationErrorResponseSchema,
    AuthenticationErrorResponse: contracts.AuthenticationErrorResponseSchema,
    AuthorizationErrorResponse: contracts.AuthorizationErrorResponseSchema,
    ConcurrentAttemptExistsResponse: contracts.ConcurrentAttemptExistsResponseSchema,
    SearchExhaustedErrorResponse: contracts.SearchExhaustedErrorResponseSchema,
    DocumentedErrorResponse: contracts.DocumentedErrorResponseSchema,
  });
}

export function generateReleasedReviewContractsOpenApi(): Record<string, unknown> {
  return buildDocument(routes.releasedReviewRouteRegistry, {
    title: "TSA Platform released-review API contracts",
    version: "routes/1",
    description: "Released result operation. Cookie-backed authenticated sessions are required; keys and explanations are included only after server authorization and release checks.",
  }, {
    AuthorizedReleasedReview: contracts.AuthorizedReleasedReviewSchema,
    ReleasedReviewItem: contracts.ReleasedReviewItemSchema,
    AnswerKey: contracts.AnswerKeySchema,
  });
}

export function generateOperationTypeArtifact(table: RouteTable, exportedType: "StudentOperations" | "ReleasedReviewOperations"): string {
  const entries = Object.entries(table).map(([name, route]) => `  ${JSON.stringify(name)}: { method: ${JSON.stringify(route.method)}, path: ${JSON.stringify(route.path)} },`).join("\n");
  const routeType = exportedType === "StudentOperations" ? "StudentOperationMap" : "ReleasedReviewOperationMap";
  const doc = exportedType === "StudentOperations" ? generateStudentContractsOpenApi() : generateReleasedReviewContractsOpenApi();
  const digest = createHash("sha256").update(stableJson(doc), "utf8").digest("hex");
  const mappedEntries = Object.keys(table).map((name) => `  readonly ${JSON.stringify(name)}: ${routeType}[${JSON.stringify(name)}];`).join("\n");
  return [
    `// Generated from the runtime route registry; OpenAPI SHA-256: ${digest}; do not edit.`,
    `import type { ${routeType} } from "../routes.ts";`,
    "",
    `export type ${exportedType} = {`,
    mappedEntries,
    "};",
    `export const ${exportedType.replace("Operations", "OperationPaths")} = {`,
    entries,
    "} as const;",
    "",
  ].join("\n");
}

export function generateStudentOperationTypes(): string {
  return generateOperationTypeArtifact(routes.studentRouteRegistry, "StudentOperations");
}

export function generateReleasedReviewOperationTypes(): string {
  return generateOperationTypeArtifact(routes.releasedReviewRouteRegistry, "ReleasedReviewOperations");
}

/** Stable JSON serialization prevents key insertion-order changes from causing drift. */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}
